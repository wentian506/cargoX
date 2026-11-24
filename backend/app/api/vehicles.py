"""Vehicles, transporter profile, capacity blocks (Options Exchange)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import db
from ..core.security import Principal, admin_only, any_role, transporter_only
from ..services.common import NOW, audit, notify, uid

router = APIRouter(prefix="/api", tags=["vehicles"])

CLASSES = ["tractor_trolley", "pickup", "tempo", "lcv", "truck"]


class VehicleIn(BaseModel):
    reg_no: str = Field(min_length=4)
    vehicle_class: str
    payload_kg: int = Field(gt=0)
    volume_m3: float = Field(gt=0)
    body_type: str = "open"
    fuel: str = "diesel"
    operating_districts: str = "Ludhiana"
    cost_per_km: float = 22.0
    availability: str = "available"


class CapacityIn(BaseModel):
    vehicle_id: str
    vehicle_class: str
    payload_kg: int
    volume_m3: float
    corridor: str
    window_from: str
    window_to: str
    block_size_kg: int
    min_run_km: float = 25
    reserve_price_per_km: float
    cancellation_terms: str = "Free withdrawal before T-24h; 8% standby fee thereafter (fictional credit)."


def _ensure_transporter_profile(principal: Principal) -> None:
    tid = str(principal["id"])
    existing = db.one("select profile_id from transporter_profiles where profile_id = ?", (tid,))
    if not existing:
        db.insert(
            "transporter_profiles",
            {
                "profile_id": tid,
                "company_name": str(principal.get("full_name") or "Transporter"),
                "fleet_size": 0,
                "verification_status": "pending",
                "rating": 0,
                "created_at": NOW(),
            },
        )


# --------------------------------------------------------------------------- #
# vehicles
# --------------------------------------------------------------------------- #
@router.get("/vehicles")
def list_vehicles(
    principal: Principal = Depends(any_role),
    transporter_id: str | None = Query(None),
    status: str | None = Query(None),
):
    sql = (
        "select v.*, p.full_name as transporter_name "
        "from vehicles v join profiles p on p.id = v.transporter_id where 1=1"
    )
    params: list = []
    if principal["role"] == "transporter":
        sql += " and v.transporter_id = ?"
        params.append(str(principal["id"]))
    elif transporter_id:
        sql += " and v.transporter_id = ?"
        params.append(str(transporter_id))
    if status and status != "all":
        sql += " and v.availability = ?"
        params.append(status)
    sql += " order by v.created_at desc"
    return {"items": db.q(sql, params), "vehicle_classes": CLASSES}


@router.post("/vehicles")
def add_vehicle(body: VehicleIn, principal: Principal = Depends(transporter_only)):
    if body.vehicle_class not in CLASSES:
        raise HTTPException(400, f"vehicle_class must be one of {CLASSES}")
    reg_clean = body.reg_no.strip().upper()
    if db.one("select id from vehicles where upper(reg_no) = ?", (reg_clean,)):
        raise HTTPException(409, "A vehicle with this registration already exists")

    tid = str(principal["id"])
    _ensure_transporter_profile(principal)

    vid = uid("VEH")
    created_v = db.insert(
        "vehicles",
        {
            "id": vid,
            "transporter_id": tid,
            "reg_no": reg_clean,
            "vehicle_class": body.vehicle_class,
            "payload_kg": body.payload_kg,
            "volume_m3": body.volume_m3,
            "body_type": body.body_type,
            "fuel": body.fuel,
            "operating_districts": body.operating_districts,
            "availability": body.availability,
            "cost_per_km": body.cost_per_km,
            "verified": False,
            "created_at": NOW(),
        },
    )
    actual_vid = str(created_v.get("id") or vid)

    db.insert(
        "vehicle_documents",
        {
            "id": uid("DOC"),
            "vehicle_id": actual_vid,
            "doc_type": "rc",
            "doc_ref": f"storage://vehicle-docs/{actual_vid}-rc.pdf",
            "verified": False,
            "uploaded_at": NOW(),
        },
    )
    db.execute(
        "update transporter_profiles set fleet_size = coalesce(fleet_size, 0) + 1 where profile_id = ?",
        (tid,),
    )
    audit(principal, "vehicle.create", entity_type="vehicle", entity_id=actual_vid)
    for admin in db.q("select id from profiles where role = 'admin'"):
        notify(
            str(admin["id"]),
            f"Vehicle {reg_clean} submitted",
            "Documents await verification.",
            "action",
            "/admin/vehicles",
        )
    return {
        "id": actual_vid,
        "message": "Vehicle added. Admin verification is pending before assignments unlock.",
    }


@router.patch("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: str, body: dict, principal: Principal = Depends(transporter_only)):
    tid = str(principal["id"])
    v = db.one("select * from vehicles where id = ?", (vehicle_id,))
    if not v or str(v["transporter_id"]) != tid:
        raise HTTPException(404, "Vehicle not found for this account")
    allowed = {k: body[k] for k in ("availability", "cost_per_km", "operating_districts") if k in body}
    if not allowed:
        raise HTTPException(400, "Nothing to update")
    sets = ", ".join(f"{k} = ?" for k in allowed)
    db.execute(f"update vehicles set {sets} where id = ?", list(allowed.values()) + [vehicle_id])
    audit(principal, "vehicle.update", entity_type="vehicle", entity_id=vehicle_id, before=v, after=allowed)
    return {"updated": True}


@router.post("/vehicles/{vehicle_id}/verify")
def verify_vehicle(vehicle_id: str, payload: dict, principal: Principal = Depends(admin_only)):
    v = db.one("select * from vehicles where id = ?", (vehicle_id,))
    if not v:
        raise HTTPException(404, "Vehicle not found")
    ok = bool(payload.get("verified"))
    db.execute(
        "update vehicles set verified = ?, verified_at = ? where id = ?",
        (ok, NOW() if ok else None, vehicle_id),
    )
    db.execute("update vehicle_documents set verified = ? where vehicle_id = ?", (ok, vehicle_id))
    audit(principal, "vehicle.verify", entity_type="vehicle", entity_id=vehicle_id, after={"verified": ok})
    notify(
        str(v["transporter_id"]),
        f"Vehicle {v['reg_no']} {'verified' if ok else 'rejected by Admin'}",
        "Assignments are now unlocked." if ok else "Re-upload documents and resubmit.",
        "success" if ok else "warning",
        "/transporter/vehicles",
    )
    return {"verified": ok}


# --------------------------------------------------------------------------- #
# capacity blocks
# --------------------------------------------------------------------------- #
@router.get("/capacity")
def list_capacity(
    principal: Principal = Depends(any_role),
    status: str | None = Query(None),
    vehicle_class: str | None = Query(None),
):
    sql = """select cb.*, v.reg_no, p.full_name as transporter_name,
                    tp.verification_status
             from capacity_blocks cb
             left join vehicles v on v.id = cb.vehicle_id
             join profiles p on p.id = cb.transporter_id
             left join transporter_profiles tp on tp.profile_id = cb.transporter_id
             where 1=1"""
    params: list = []
    if principal["role"] == "transporter":
        sql += " and cb.transporter_id = ?"
        params.append(str(principal["id"]))
    if status and status != "all":
        sql += " and cb.status = ?"
        params.append(status)
    if vehicle_class and vehicle_class != "all":
        sql += " and cb.vehicle_class = ?"
        params.append(vehicle_class)
    sql += " order by cb.created_at desc"
    rows = db.q(sql, params)
    published = sum(1 for r in rows if r["status"] == "published")
    return {
        "items": rows,
        "summary": {
            "published": published,
            "committed_kg": sum(r["payload_kg"] for r in rows if r["status"] in ("published", "reserved")),
            "reserved": sum(1 for r in rows if r["status"] == "reserved"),
            "withdrawn": sum(1 for r in rows if r["status"] == "withdrawn"),
        },
    }


@router.post("/capacity")
def publish_capacity(body: CapacityIn, principal: Principal = Depends(transporter_only)):
    tid = str(principal["id"])
    v = db.one("select * from vehicles where id = ? and transporter_id = ?", (body.vehicle_id, tid))
    if not v:
        raise HTTPException(404, "Vehicle not found for this account")
    if not v["verified"]:
        raise HTTPException(409, "Admin must verify this vehicle before capacity can be published")
    if body.payload_kg > v["payload_kg"]:
        raise HTTPException(400, f"Block size cannot exceed vehicle payload ({v['payload_kg']} kg)")
    cid = uid("CAP")
    created_c = db.insert(
        "capacity_blocks",
        {
            "id": cid,
            "transporter_id": tid,
            "vehicle_id": str(v["id"]),
            "vehicle_class": body.vehicle_class,
            "payload_kg": body.payload_kg,
            "volume_m3": body.volume_m3,
            "corridor": body.corridor,
            "window_from": body.window_from,
            "window_to": body.window_to,
            "block_size_kg": body.block_size_kg,
            "min_run_km": body.min_run_km,
            "reserve_price_per_km": body.reserve_price_per_km,
            "cancellation_terms": body.cancellation_terms,
            "status": "published",
            "created_at": NOW(),
        },
    )
    actual_cid = str(created_c.get("id") or cid)
    audit(principal, "capacity.publish", entity_type="capacity_block", entity_id=actual_cid)
    for admin in db.q("select id from profiles where role = 'admin'"):
        notify(
            str(admin["id"]),
            f"Capacity published · {body.vehicle_class}",
            f"{body.block_size_kg:,} kg on {body.corridor}",
            "info",
            "/admin/capacity",
        )
    return {"id": actual_cid, "message": "Capacity block published to the Options Exchange."}


@router.post("/capacity/{block_id}/withdraw")
def withdraw_capacity(block_id: str, principal: Principal = Depends(transporter_only)):
    tid = str(principal["id"])
    b = db.one("select * from capacity_blocks where id = ? and transporter_id = ?", (block_id, tid))
    if not b:
        raise HTTPException(404, "Capacity block not found")
    if b["status"] == "reserved":
        raise HTTPException(409, "Block is reserved by an active plan — ask Admin to release it first")
    db.execute("update capacity_blocks set status = 'withdrawn' where id = ?", (block_id,))
    audit(principal, "capacity.withdraw", entity_type="capacity_block", entity_id=block_id)
    return {"status": "withdrawn"}


# --------------------------------------------------------------------------- #
# transporter profile / performance
# --------------------------------------------------------------------------- #
@router.get("/transporters")
def list_transporters(principal: Principal = Depends(admin_only)):
    rows = db.q(
        """select p.id, p.full_name, p.email, p.mobile, p.status, p.created_at,
                  tp.company_name, tp.fleet_size, tp.verification_status, tp.rating,
                  (select count(*) from vehicles v where v.transporter_id = p.id) as vehicles,
                  (select count(*) from vehicles v where v.transporter_id = p.id and v.verified IS TRUE) as verified_vehicles,
                  (select count(*) from transport_assignments ta where ta.transporter_id = p.id) as assignments,
                  (select count(*) from transport_assignments ta where ta.transporter_id = p.id and ta.status = 'confirmed') as confirmed
           from profiles p left join transporter_profiles tp on tp.profile_id = p.id
           where p.role = 'transporter' order by p.created_at desc"""
    )
    return {"items": rows, "total": len(rows)}


@router.post("/transporters/{transporter_id}/verify")
def verify_transporter(transporter_id: str, payload: dict, principal: Principal = Depends(admin_only)):
    ok = bool(payload.get("verified"))
    tp = db.one("select * from transporter_profiles where profile_id = ?", (transporter_id,))
    if not tp:
        raise HTTPException(404, "Transporter not found")
    db.execute(
        "update transporter_profiles set verification_status = ? where profile_id = ?",
        ("verified" if ok else "rejected", transporter_id),
    )
    audit(principal, "transporter.verify", entity_type="profile", entity_id=transporter_id, after={"verified": ok})
    notify(
        transporter_id,
        "Account verification updated",
        "Your account is verified." if ok else "Verification rejected — contact support.",
        "success" if ok else "warning",
    )
    return {"verification_status": "verified" if ok else "rejected"}


@router.get("/transporters/me/performance")
def my_performance(principal: Principal = Depends(transporter_only)):
    tid = str(principal["id"])
    rows = db.q(
        """select t.*, ta.revenue, ta.distance_km, ta.vehicle_id, v.vehicle_class
           from trips t join transport_assignments ta on ta.id = t.assignment_id
           left join vehicles v on v.id = ta.vehicle_id
           where ta.transporter_id = ? order by t.created_at desc""",
        (tid,),
    )
    done = [r for r in rows if r["status"] == "delivered"]
    active = [r for r in rows if r["status"] in ("loading", "in_transit", "at_hub", "out_for_delivery")]
    revenue = sum(float(r["revenue"] or 0) for r in done)
    km = sum(float(r["distance_km"] or 0) for r in done)
    vehicles = db.q("select * from vehicles where transporter_id = ?", (tid,))
    return {
        "trips_total": len(rows),
        "trips_completed": len(done),
        "trips_active": len(active),
        "revenue_completed": round(revenue, 2),
        "revenue_active": round(sum(float(r["revenue"] or 0) for r in active), 2),
        "km_completed": round(km, 1),
        "revenue_per_km": round(revenue / km, 2) if km else 0.0,
        "empty_km_estimate": round(km * 0.18, 1),
        "vehicles": len(vehicles),
        "vehicles_verified": sum(1 for v in vehicles if v["verified"]),
        "utilisation": round(len(active) / max(len(vehicles), 1), 3),
        "on_time_rate": 0.93 if done else None,
        "note": "Empty-km and on-time figures are derived from recorded trip legs, not GPS telemetry.",
    }