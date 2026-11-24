"""Shared service helpers: event log, notifications, audit, view models."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from .. import db

NOW = lambda: datetime.now(timezone.utc).isoformat()

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _is_postgres() -> bool:
    return (db.dialect() or "").lower() in ("postgres", "postgresql")


def uid(prefix: str) -> str:
    if _is_postgres():
        return str(uuid.uuid4())
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _safe_one(query: str, params: tuple[Any, ...] | list[Any] | None = None) -> dict | None:
    try:
        return db.one(query, params)
    except Exception:
        return None


def _safe_q(query: str, params: tuple[Any, ...] | list[Any] | None = None) -> list[dict]:
    try:
        return db.q(query, params)
    except Exception:
        return []


def event(entity_id: str, event_type: str, *, entity_type: str = "shipment",
          actor_id: str | None = None, payload: Any = None, seed: str | None = None) -> None:
    try:
        db.insert("shipment_events", {
            "id": uid("EVT"), "entity_type": entity_type, "entity_id": entity_id,
            "event_type": event_type, "actor_id": actor_id,
            "payload": db.jdump(payload) if payload is not None else None,
            "seed_id": seed, "created_at": NOW(),
        })
    except Exception:
        pass


def notify(profile_id: str, title: str, body: str = "", kind: str = "info", link: str | None = None) -> None:
    try:
        db.insert("notifications", {
            "id": uid("NTF"), "profile_id": profile_id, "title": title, "body": body,
            "kind": kind, "link": link, "read_at": None, "created_at": NOW(),
        })
    except Exception:
        pass


def audit(principal: dict | None, action: str, *, entity_type: str, entity_id: str,
          before: Any = None, after: Any = None, ip: str | None = None) -> None:
    try:
        db.insert("audit_logs", {
            "id": uid("AUD"), "actor_id": (principal or {}).get("id"),
            "actor_role": (principal or {}).get("role"), "action": action,
            "entity_type": entity_type, "entity_id": entity_id,
            "before_state": db.jdump(before) if before is not None else None,
            "after_state": db.jdump(after) if after is not None else None,
            "ip": ip, "created_at": NOW(),
        })
    except Exception:
        pass


def paginate(rows: list[dict], page: int = 1, page_size: int = 25) -> dict:
    page = max(1, page)
    size = min(max(1, page_size), 200)
    start = (page - 1) * size
    return {
        "items": rows[start : start + size],
        "page": page,
        "page_size": size,
        "total": len(rows),
        "pages": max(1, (len(rows) + size - 1) // size),
    }


# --------------------------------------------------------------------------- #
# view models
# --------------------------------------------------------------------------- #
STATUS_LABELS = {
    "draft": "Draft",
    "pending_admin_review": "Pending Admin Review",
    "planning": "Planning",
    "matched": "Matched",
    "awaiting_sender_approval": "Awaiting Sender Approval",
    "confirmed": "Confirmed",
    "ready_for_pickup": "Ready for Pickup",
    "in_transit": "In Transit",
    "at_transfer_hub": "At Transfer Hub",
    "out_for_delivery": "Out for Delivery",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
}

ACTIVE_STATUSES = ["pending_admin_review", "planning", "matched", "awaiting_sender_approval",
                   "confirmed", "ready_for_pickup", "in_transit", "at_transfer_hub", "out_for_delivery"]


def shipment_view(row: dict, *, include_events: bool = False) -> dict:
    sid = row.get("id")
    alloc = _safe_one(
        "select ca.* from cost_allocations ca where ca.shipment_id = ? order by ca.created_at desc limit 1",
        (sid,),
    )
    asg = _safe_one(
        """select ta.*, p.full_name as transporter_name, v.reg_no, v.vehicle_class
           from transport_assignments ta
           join trip_shipments ts on ts.trip_id in (select id from trips where assignment_id = ta.id)
           left join profiles p on p.id = ta.transporter_id
           left join vehicles v on v.id = ta.vehicle_id
           where ts.shipment_id = ? limit 1""",
        (sid,),
    )
    trip = _safe_one(
        "select t.* from trips t join trip_shipments ts on ts.trip_id = t.id where ts.shipment_id = ? limit 1",
        (sid,),
    )
    items_rows = _safe_q("select * from shipment_items where shipment_id = ?", (sid,))
    qty_kg = float(row.get("quantity_kg") or 0)

    view = {
        "id": sid,
        "code": row.get("code"),
        "sender_id": row.get("sender_id"),
        "commodity": row.get("commodity"),
        "quantity_kg": qty_kg,
        "quantity_quintal": round(qty_kg / 100, 2),
        "pickup_village": row.get("pickup_village"),
        "pickup_district": row.get("pickup_district"),
        "pickup_state": row.get("pickup_state"),
        "pickup": {"lat": row.get("pickup_lat"), "lng": row.get("pickup_lng")},
        "destination_name": row.get("destination_name"),
        "destination_id": row.get("destination_id"),
        "destination": {"lat": row.get("dest_lat"), "lng": row.get("dest_lng")},
        "ready_from": row.get("ready_from"),
        "ready_to": row.get("ready_to"),
        "deadline": row.get("deadline"),
        "packaging": row.get("packaging"),
        "handling": row.get("handling"),
        "temperature": row.get("temperature"),
        "special_instructions": row.get("special_instructions"),
        "requirements": row.get("requirements"),
        "items": [
            {
                "id": it.get("id"),
                "commodity": it.get("commodity"),
                "quantity_kg": it.get("quantity_kg"),
                "packaging": it.get("packaging"),
                "handling": it.get("handling"),
            }
            for it in items_rows
        ],
        "attachments": db.jload(row.get("attachments"), []),
        "status": row.get("status"),
        "status_label": STATUS_LABELS.get(row.get("status") or "", row.get("status")),
        "freight_estimate": row.get("freight_estimate"),
        "freight_approved": bool(row.get("freight_approved")),
        "direction": row.get("direction"),
        "is_synthetic": bool(row.get("is_synthetic", True)),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "allocation": {
            "allocated_share": alloc.get("allocated_share"),
            "standalone_cost": alloc.get("standalone_cost"),
            "saving": alloc.get("saving"),
            "approval": alloc.get("approval"),
            "method": alloc.get("method"),
            "participation_ok": bool(alloc.get("participation_check")),
        } if alloc else None,
        "transporter": {
            "name": asg.get("transporter_name"),
            "vehicle": asg.get("reg_no"),
            "vehicle_class": asg.get("vehicle_class"),
            "assignment_status": asg.get("status"),
        } if asg else None,
        "trip": {
            "id": trip.get("id"),
            "code": trip.get("trip_code"),
            "status": trip.get("status"),
            "started_at": trip.get("started_at"),
        } if trip else None,
    }
    if include_events:
        ev_rows = _safe_q(
            "select * from shipment_events where entity_id = ? order by created_at desc limit 40",
            (sid,),
        )
        view["timeline"] = [{**e, "payload": db.jload(e.get("payload"), {})} for e in ev_rows]
    return view


def get_shipment(shipment_id: str) -> dict | None:
    if not shipment_id:
        return None
    val = str(shipment_id).strip()
    if _is_postgres() and not _UUID_RE.match(val):
        return _safe_one("select * from shipments where code = ?", (val,))
    return _safe_one("select * from shipments where id = ? or code = ?", (val, val))


def set_status(shipment: dict, status: str, *, actor: dict | None, note: str = "") -> None:
    before = shipment["status"]
    if before == status:
        return
    db.execute("update shipments set status = ?, updated_at = ? where id = ?", (status, NOW(), shipment["id"]))
    event(shipment["id"], "status_changed", actor_id=(actor or {}).get("id"),
          payload={"from": before, "to": status, "label": STATUS_LABELS.get(status, status), "note": note})
    recipients = [shipment["sender_id"]]
    tr = _safe_one(
        "select ta.transporter_id from transport_assignments ta join trip_shipments ts on ts.trip_id in "
        "(select id from trips where assignment_id = ta.id) where ts.shipment_id = ? limit 1",
        (shipment["id"],),
    )
    if tr and tr.get("transporter_id"):
        recipients.append(tr["transporter_id"])
    for pid in recipients:
        if pid:
            notify(
                pid,
                f"{shipment['code']} → {STATUS_LABELS.get(status, status)}",
                note,
                "success" if status == "delivered" else "info",
                link=f"/sender/shipments/{shipment['id']}",
            )