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


def uid(prefix: str) -> str:
    if (db.dialect() or "").lower() in ("postgres", "postgresql"):
        return str(uuid.uuid4())
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def event(entity_id: str, event_type: str, *, entity_type: str = "shipment",
          actor_id: str | None = None, payload: Any = None, seed: str | None = None) -> None:
    db.insert("shipment_events", {
        "id": uid("EVT"), "entity_type": entity_type, "entity_id": entity_id,
        "event_type": event_type, "actor_id": actor_id,
        "payload": db.jdump(payload) if payload is not None else None,
        "seed_id": seed, "created_at": NOW(),
    })


def notify(profile_id: str, title: str, body: str = "", kind: str = "info", link: str | None = None) -> None:
    db.insert("notifications", {
        "id": uid("NTF"), "profile_id": profile_id, "title": title, "body": body,
        "kind": kind, "link": link, "read_at": None, "created_at": NOW(),
    })


def audit(principal: dict | None, action: str, *, entity_type: str, entity_id: str,
          before: Any = None, after: Any = None, ip: str | None = None) -> None:
    db.insert("audit_logs", {
        "id": uid("AUD"), "actor_id": (principal or {}).get("id"),
        "actor_role": (principal or {}).get("role"), "action": action,
        "entity_type": entity_type, "entity_id": entity_id,
        "before_state": db.jdump(before) if before is not None else None,
        "after_state": db.jdump(after) if after is not None else None,
        "ip": ip, "created_at": NOW(),
    })


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
    alloc = db.one(
        "select ca.* from cost_allocations ca where ca.shipment_id = ? order by ca.created_at desc limit 1",
        (row["id"],),
    )
    asg = db.one(
        """select ta.*, p.full_name as transporter_name, v.reg_no, v.vehicle_class
           from transport_assignments ta
           join trip_shipments ts on ts.trip_id in (select id from trips where assignment_id = ta.id)
           left join profiles p on p.id = ta.transporter_id
           left join vehicles v on v.id = ta.vehicle_id
           where ts.shipment_id = ? limit 1""",
        (row["id"],),
    )
    trip = db.one(
        "select t.* from trips t join trip_shipments ts on ts.trip_id = t.id where ts.shipment_id = ? limit 1",
        (row["id"],),
    )
    view = {
        "id": row["id"],
        "code": row["code"],
        "sender_id": row["sender_id"],
        "commodity": row["commodity"],
        "quantity_kg": row["quantity_kg"],
        "quantity_quintal": round(float(row["quantity_kg"]) / 100, 2),
        "pickup_village": row["pickup_village"],
        "pickup_district": row.get("pickup_district"),
        "pickup_state": row.get("pickup_state"),
        "pickup": {"lat": row["pickup_lat"], "lng": row["pickup_lng"]},
        "destination_name": row["destination_name"],
        "destination_id": row["destination_id"],
        "destination": {"lat": row["dest_lat"], "lng": row["dest_lng"]},
        "ready_from": row["ready_from"],
        "ready_to": row["ready_to"],
        "deadline": row["deadline"],
        "packaging": row["packaging"],
        "handling": row["handling"],
        "temperature": row["temperature"],
        "special_instructions": row["special_instructions"],
        "requirements": row.get("requirements"),
        "items": [
            {"id": it["id"], "commodity": it["commodity"], "quantity_kg": it["quantity_kg"],
             "packaging": it["packaging"], "handling": it["handling"]}
            for it in db.q("select * from shipment_items where shipment_id = ?", (row["id"],))
        ],
        "attachments": db.jload(row["attachments"], []),
        "status": row["status"],
        "status_label": STATUS_LABELS.get(row["status"], row["status"]),
        "freight_estimate": row["freight_estimate"],
        "freight_approved": bool(row["freight_approved"]),
        "direction": row["direction"],
        "is_synthetic": bool(row["is_synthetic"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "allocation": {
            "allocated_share": alloc["allocated_share"],
            "standalone_cost": alloc["standalone_cost"],
            "saving": alloc["saving"],
            "approval": alloc["approval"],
            "method": alloc["method"],
            "participation_ok": bool(alloc["participation_check"]),
        } if alloc else None,
        "transporter": {
            "name": asg["transporter_name"], "vehicle": asg["reg_no"],
            "vehicle_class": asg["vehicle_class"], "assignment_status": asg["status"],
        } if asg else None,
        "trip": {
            "id": trip["id"], "code": trip["trip_code"], "status": trip["status"],
            "started_at": trip["started_at"],
        } if trip else None,
    }
    if include_events:
        view["timeline"] = [
            {**e, "payload": db.jload(e["payload"], {})}
            for e in db.q(
                "select * from shipment_events where entity_id = ? order by created_at desc limit 40",
                (row["id"],),
            )
        ]
    return view


def get_shipment(shipment_id: str) -> dict | None:
    if not shipment_id:
        return None
    val = str(shipment_id).strip()
    if (db.dialect() or "").lower() in ("postgres", "postgresql") and not _UUID_RE.match(val):
        return db.one("select * from shipments where code = ?", (val,))
    return db.one("select * from shipments where id = ? or code = ?", (val, val))


def set_status(shipment: dict, status: str, *, actor: dict | None, note: str = "") -> None:
    before = shipment["status"]
    if before == status:
        return
    db.execute("update shipments set status = ?, updated_at = ? where id = ?", (status, NOW(), shipment["id"]))
    event(shipment["id"], "status_changed", actor_id=(actor or {}).get("id"),
          payload={"from": before, "to": status, "label": STATUS_LABELS.get(status, status), "note": note})
    recipients = [shipment["sender_id"]]
    tr = db.one(
        "select ta.transporter_id from transport_assignments ta join trip_shipments ts on ts.trip_id in "
        "(select id from trips where assignment_id = ta.id) where ts.shipment_id = ? limit 1",
        (shipment["id"],),
    )
    if tr:
        recipients.append(tr["transporter_id"])
    for pid in recipients:
        notify(pid, f"{shipment['code']} → {STATUS_LABELS.get(status, status)}", note, "success" if status == "delivered" else "info",
               link=f"/sender/shipments/{shipment['id']}")