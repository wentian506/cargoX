"""Analytics, notifications, support, public config."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db
from ..core.security import Principal, admin_only, any_role
from ..services.common import ACTIVE_STATUSES, NOW, audit, notify, uid

router = APIRouter(prefix="/api", tags=["platform"])


def _str_id(val: object) -> str:
    return "" if val is None else str(val)


# --------------------------------------------------------------------------- #
# analytics
# --------------------------------------------------------------------------- #
@router.get("/analytics/sender")
def sender_analytics(principal: Principal = Depends(any_role)):
    sid = _str_id(principal.get("id"))
    ships = db.q("select * from shipments where sender_id = ?", (sid,))
    allocs = db.q(
        """select ca.* from cost_allocations ca join shipments s on s.id = ca.shipment_id
           where s.sender_id = ?""",
        (sid,),
    )
    by_status: dict[str, int] = {}
    for s in ships:
        st = _str_id(s.get("status")) or "draft"
        by_status[st] = by_status.get(st, 0) + 1
    by_crop: dict[str, float] = {}
    for s in ships:
        crop = _str_id(s.get("commodity")) or "unknown"
        by_crop[crop] = by_crop.get(crop, 0.0) + float(s.get("quantity_kg") or 0)
    monthly: dict[str, dict] = {}
    for s in ships:
        k = _str_id(s.get("created_at"))[:7] or "unknown"
        monthly.setdefault(k, {"month": k, "shipments": 0, "kg": 0.0, "freight": 0.0})
        monthly[k]["shipments"] += 1
        monthly[k]["kg"] += float(s.get("quantity_kg") or 0)
        monthly[k]["freight"] += float(s.get("freight_estimate") or 0)
    return {
        "totals": {
            "shipments": len(ships),
            "pending": sum(1 for s in ships if s.get("status") == "pending_admin_review"),
            "active": sum(1 for s in ships if s.get("status") in ACTIVE_STATUSES),
            "delivered": sum(1 for s in ships if s.get("status") == "delivered"),
            "volume_kg": round(sum(float(s.get("quantity_kg") or 0) for s in ships), 1),
            "freight_committed": round(sum(float(s.get("freight_estimate") or 0) for s in ships), 2),
            "estimated_savings": round(sum(float(a.get("saving") or 0) for a in allocs), 2),
        },
        "by_status": [{"status": k, "count": v} for k, v in sorted(by_status.items())],
        "by_commodity": [{"commodity": k, "kg": round(v, 1)} for k, v in sorted(by_crop.items(), key=lambda x: -x[1])],
        "monthly": sorted(monthly.values(), key=lambda r: r["month"]),
        "cost_allocation": [
            {
                "shipment": _str_id(a.get("shipment_id")),
                "share": a.get("allocated_share"),
                "solo": a.get("standalone_cost"),
                "saving": a.get("saving"),
                "approval": a.get("approval"),
            }
            for a in allocs
        ],
    }


@router.get("/analytics/admin")
def admin_analytics(days: int = Query(30, ge=7, le=180)):
    ships = db.q("select * from shipments")
    trips = db.q("select * from trips")
    allocs = db.q("select * from cost_allocations")
    sims = db.q("select * from simulation_runs order by created_at desc limit 5")
    status_counts: dict[str, int] = {}
    crop_counts: dict[str, float] = {}
    village_counts: dict[str, int] = {}
    for s in ships:
        st = _str_id(s.get("status")) or "draft"
        status_counts[st] = status_counts.get(st, 0) + 1
        crop = _str_id(s.get("commodity")) or "unknown"
        crop_counts[crop] = crop_counts.get(crop, 0.0) + float(s.get("quantity_kg") or 0)
        vname = _str_id(s.get("pickup_village")) or "unknown"
        village_counts[vname] = village_counts.get(vname, 0) + 1
    done = [t for t in trips if t.get("status") == "delivered"]
    recent_sims = []
    for s in sims:
        raw_metrics = s.get("metrics")
        if isinstance(raw_metrics, dict):
            parsed_metrics = raw_metrics
        else:
            parsed_metrics = db.jload(_str_id(raw_metrics), {}) or {}
        recent_sims.append({
            "id": _str_id(s.get("id")),
            "scenario": s.get("scenario_name"),
            "seed": s.get("seed"),
            "headline": parsed_metrics.get("headline") if isinstance(parsed_metrics, dict) else None,
        })
    return {
        "filters": {"days": days},
        "shipments": {
            "total": len(ships),
            "by_status": [{"status": k, "count": v} for k, v in status_counts.items()],
            "by_commodity": [{"commodity": k, "kg": round(v, 1)} for k, v in sorted(crop_counts.items(), key=lambda x: -x[1])],
            "by_village": [{"village": k, "count": v} for k, v in sorted(village_counts.items(), key=lambda x: -x[1])],
            "volume_kg": round(sum(float(s.get("quantity_kg") or 0) for s in ships), 1),
        },
        "operations": {
            "trips_total": len(trips),
            "trips_delivered": len(done),
            "on_time_rate": round(len(done) / len(trips), 3) if trips else None,
            "delayed": sum(1 for t in trips if t.get("delay_reported")),
            "active": sum(1 for t in trips if t.get("status") in ("loading", "in_transit", "at_hub", "out_for_delivery")),
        },
        "fairness": {
            "allocations": len(allocs),
            "participation_pass_rate": round(sum(1 for a in allocs if a.get("participation_check")) / len(allocs), 3)
            if allocs
            else None,
            "total_savings": round(sum(float(a.get("saving") or 0) for a in allocs), 2),
            "approved": sum(1 for a in allocs if a.get("approval") == "approved"),
        },
        "growth": {
            "senders": int(db.scalar("select count(*) from profiles where role='sender'", default=0) or 0),
            "transporters": int(db.scalar("select count(*) from profiles where role='transporter'", default=0) or 0),
            "verified_transporters": int(
                db.scalar("select count(*) from transporter_profiles where verification_status='verified'", default=0) or 0
            ),
        },
        "recent_simulations": recent_sims,
        "disclaimer": "Operational figures come from recorded platform actions; forecasts, prices and savings are synthetic model outputs unless field-validated.",
    }


@router.get("/analytics/transporter")
def transporter_analytics(principal: Principal = Depends(any_role)):
    return transporter_perf(principal)


def transporter_perf(principal):
    from .vehicles import my_performance

    return my_performance(principal)


@router.get("/analytics/export")
def export_csv(kind: str = Query("shipments"), principal: Principal = Depends(any_role)):
    """CSV export. A PDF export endpoint composes the same rows server-side."""
    from fastapi.responses import PlainTextResponse

    def csv(rows: list[dict]) -> str:
        if not rows:
            return "no rows\n"
        cols = list(rows[0].keys())
        lines = [",".join(cols)]
        for r in rows:
            lines.append(",".join(str(r[c]).replace(",", ";") if r.get(c) is not None else "" for c in cols))
        return "\n".join(lines)

    uid_str = _str_id(principal.get("id"))
    role_str = _str_id(principal.get("role"))
    if kind == "shipments":
        rows = db.q(
            "select code, commodity, quantity_kg, pickup_village, destination_name, status, freight_estimate, created_at "
            "from shipments where sender_id = ? or ? = 'admin' order by created_at desc",
            (uid_str, role_str),
        )
    elif kind == "allocations":
        rows = db.q("select shipment_id, standalone_cost, allocated_share, saving, approval, method from cost_allocations")
    elif kind == "trips":
        rows = db.q("select trip_code, status, started_at, finished_at from trips")
    else:
        raise HTTPException(400, "Unknown export kind")
    audit(principal, f"analytics.export.{kind}", entity_type="analytics", entity_id=kind)
    return PlainTextResponse(
        csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cargox-{kind}.csv"'},
    )


# --------------------------------------------------------------------------- #
# notifications
# --------------------------------------------------------------------------- #
@router.get("/notifications")
def notifications(principal: Principal = Depends(any_role), unread_only: bool = False):
    pid = _str_id(principal.get("id"))
    sql = "select * from notifications where profile_id = ?"
    if unread_only:
        sql += " and read_at is null"
    sql += " order by created_at desc limit 100"
    rows = db.q(sql, (pid,))
    for r in rows:
        r["id"] = _str_id(r.get("id"))
        r["profile_id"] = _str_id(r.get("profile_id"))
    return {"items": rows, "unread": sum(1 for r in rows if not r.get("read_at"))}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: str, principal: Principal = Depends(any_role)):
    pid = _str_id(principal.get("id"))
    nid = _str_id(notification_id)
    db.execute("update notifications set read_at = ? where id = ? and profile_id = ?", (NOW(), nid, pid))
    return {"read": True}


@router.post("/notifications/read-all")
def mark_all(principal: Principal = Depends(any_role)):
    pid = _str_id(principal.get("id"))
    db.execute("update notifications set read_at = ? where profile_id = ? and read_at is null", (NOW(), pid))
    return {"read": True}


# --------------------------------------------------------------------------- #
# support
# --------------------------------------------------------------------------- #
class TicketIn(BaseModel):
    subject: str
    body: str


@router.post("/support/tickets")
def create_ticket(body: TicketIn, principal: Principal = Depends(any_role)):
    pid = _str_id(principal.get("id"))
    role_str = _str_id(principal.get("role"))
    tid = uid("TKT")
    db.insert(
        "support_tickets",
        {
            "id": tid,
            "profile_id": pid,
            "subject": body.subject,
            "body": body.body,
            "role": role_str,
            "status": "open",
            "created_at": NOW(),
            "updated_at": NOW(),
        },
    )
    for admin in db.q("select id from profiles where role='admin'"):
        notify(_str_id(admin.get("id")), f"New support ticket · {role_str}", body.subject, "action", "/admin/support")
    return {"id": tid, "status": "open"}


@router.get("/support/tickets")
def list_tickets(principal: Principal = Depends(any_role)):
    pid = _str_id(principal.get("id"))
    if principal.get("role") == "admin":
        rows = db.q(
            """select st.*, p.full_name, p.email from support_tickets st
               left join profiles p on p.id = st.profile_id order by st.created_at desc"""
        )
    else:
        rows = db.q("select * from support_tickets where profile_id = ? order by created_at desc", (pid,))
    for r in rows:
        r["id"] = _str_id(r.get("id"))
        r["profile_id"] = _str_id(r.get("profile_id"))
    return {"items": rows}


@router.post("/support/tickets/{ticket_id}/resolve")
def resolve_ticket(ticket_id: str, payload: dict, principal: Principal = Depends(admin_only)):
    tid = _str_id(ticket_id)
    t = db.one("select * from support_tickets where id = ?", (tid,))
    if not t:
        raise HTTPException(404, "Ticket not found")
    new_status = _str_id(payload.get("status")) or "resolved"
    db.execute(
        "update support_tickets set status = ?, resolution = ?, updated_at = ? where id = ?",
        (new_status, payload.get("resolution"), NOW(), tid),
    )
    notify(_str_id(t.get("profile_id")), f"Ticket {tid} updated", payload.get("resolution") or "", "success")
    audit(principal, "support.resolve", entity_type="support_ticket", entity_id=tid)
    return {"status": new_status}


# --------------------------------------------------------------------------- #
# corridor directory (villages + mandis) used by intake forms
# --------------------------------------------------------------------------- #
def _safe_corridor_rows(table: str, order_by: str, defaults: dict) -> list[dict]:
    try:
        rows = db.q(f"select * from {table} order by {order_by}")
    except Exception:
        rows = db.q(f"select * from {table}")
    out: list[dict] = []
    for r in rows:
        item = dict(r)
        if "id" in item:
            item["id"] = _str_id(item.get("id"))
        for k, v in defaults.items():
            item.setdefault(k, v)
        out.append(item)
    return out


@router.get("/corridor")
def corridor(principal: Principal = Depends(any_role)):
    return {
        "villages": _safe_corridor_rows("villages", "name", {"lat": None, "lng": None, "cluster_id": None}),
        "mandis": _safe_corridor_rows("mandis", "name", {"lat": None, "lng": None, "queue_minutes": None}),
        "hubs": _safe_corridor_rows("hubs", "name", {"hub_type": None, "lat": None, "lng": None, "safety_verified": None}),
        "note": "Pilot corridor geometry. Real coordinates, synthetic operational data.",
    }


# --------------------------------------------------------------------------- #
# public config / health
# --------------------------------------------------------------------------- #
@router.get("/config")
def public_config():
    return {
        "product": "CARGOX",
        "tagline": "Right Load. Right Vehicle. Right Time. Fair Share.",
        "roles": ["sender", "transporter", "admin"],
        "role_notes": {
            "sender": "Creates shipment requests; approves fair-share allocation.",
            "transporter": "Provides vehicles and capacity; executes trips.",
            "admin": "Coordinated by invitation only — runs planning, dispatch and verification.",
        },
        "excluded_roles": ["receiver", "fpo"],
        "modules": [
            "HarvestPulse",
            "Options Exchange",
            "DispatchSense",
            "ReadySync",
            "GramTwin-2E",
            "ValueClock",
            "AgroCompat",
            "ShapleySplit",
            "ShadowFleet-Heal",
            "CrossFlow-Backhaul",
            "MonsoonPass",
            "VoiceBoli",
        ],
        "data_disclosure": "All demo operational data is synthetic and labelled in the UI.",
    }


@router.get("/health")
def health():
    from ..core.config import settings

    return {
        "status": "ok",
        "version": settings.VERSION,
        "db": db.dialect(),
        "synthetic_data": True,
    }