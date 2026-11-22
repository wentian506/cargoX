"""Digital twin: fixed-seed policy simulation + replayable event log."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..core.config import settings
from ..core.security import Principal, admin_only, any_role
from ..services.common import NOW, audit, uid
from ..simulation.engine import POLICIES, build_scenario, run_all, run_policy

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


def _world():
    villages = db.q("select * from villages")
    mandis = db.q("select * from mandis")
    return villages, mandis


@router.get("/scenarios")
def scenarios(principal: Principal = Depends(any_role)):
    villages, mandis = _world()
    return {
        "scenarios": [
            {"key": "khanna_wheat_wave", "name": "Khanna wheat wave", "cluster": "C-KHN",
             "vehicles": 6, "consignments": 22, "commodities": ["wheat", "paddy", "mustard"]},
            {"key": "payal_mixed_perishable", "name": "Payal mixed perishables", "cluster": "C-PAY",
             "vehicles": 5, "consignments": 18, "commodities": ["potato", "onion", "tomato"]},
            {"key": "sahnewal_tight_capacity", "name": "Sahnewal tight capacity", "cluster": "C-MLG",
             "vehicles": 4, "consignments": 24, "commodities": ["potato", "onion"]},
        ],
        "policies": [{"key": k, "label": l} for k, l in POLICIES],
        "villages": villages,
        "mandis": mandis,
        "default_seed": settings.DEFAULT_SEED,
    }


def _build(key: str):
    villages, mandis = _world()
    cfg = {
        "khanna_wheat_wave": ("Khanna wheat wave", "C-KHN", 6, 22, ["wheat", "paddy", "mustard"], "M-GOB"),
        "payal_mixed_perishable": ("Payal mixed perishables", "C-PAY", 5, 18, ["potato", "onion", "tomato"], "M-JAG"),
        "sahnewal_tight_capacity": ("Sahnewal tight capacity", "C-MLG", 4, 24, ["potato", "onion"], "M-LDH"),
    }[key]
    name, cluster, nveh, ncon, commodities, mid = cfg
    mandi = db.one("select * from mandis where id = ?", (mid,)) or mandis[0]
    return dict(name=name, cluster=cluster, nveh=nveh, ncon=ncon, commodities=commodities,
                villages=[v for v in villages if v["cluster_id"] == cluster],
                destination={"id": mandi["id"], "name": mandi["name"], "lat": mandi["lat"], "lng": mandi["lng"]})


@router.post("/run")
def run_simulation(payload: dict, principal: Principal = Depends(any_role)):
    key = payload.get("scenario", "khanna_wheat_wave")
    seed = int(payload.get("seed") or settings.DEFAULT_SEED)
    params = payload.get("params") or {}
    try:
        cfg = _build(key)
    except KeyError:
        raise HTTPException(400, "Unknown scenario key")

    classes = payload.get("vehicle_classes") or ["pickup", "tractor_trolley", "tempo", "lcv", "truck"]
    sc = build_scenario(name=cfg["name"], seed=seed, villages=cfg["villages"] or db.q("select * from villages"),
                        destination=cfg["destination"], vehicle_classes=classes,
                        n_vehicles=int(payload.get("vehicles") or cfg["nveh"]),
                        n_consignments=int(payload.get("consignments") or cfg["ncon"]),
                        commodities=cfg["commodities"])
    result = run_all(sc, params)

    rid = uid("SIM")
    db.insert("simulation_runs", {
        "id": rid, "scenario_name": cfg["name"], "seed": seed,
        "policy_config": db.jdump({"params": params, "scenario_key": key,
                                   "vehicles": len(sc.vehicles), "consignments": len(sc.consignments)}),
        "metrics": db.jdump(result), "created_by": principal["id"], "created_at": NOW(),
    })
    # replayable event log
    seq = 0
    for c in sc.consignments:
        seq += 1
        db.insert("simulation_events", {
            "id": uid("SEV"), "run_id": rid, "seq": seq, "sim_time": f"T+{seq}min",
            "entity_type": "consignment", "entity_id": c["id"], "event_type": "harvest_arrival",
            "payload": db.jdump({"commodity": c["commodity"], "kg": c["kg"], "village": c["village"]}),
        })
    for r in result["results"]:
        for a in r["assignments"]:
            seq += 1
            db.insert("simulation_events", {
                "id": uid("SEV"), "run_id": rid, "seq": seq, "sim_time": f"T+{seq}min",
                "entity_type": "assignment", "entity_id": a["vehicle_id"],
                "event_type": f"{r['policy']}_dispatch",
                "payload": db.jdump({"shipments": a["shipment_ids"], "km": a["distance_km"], "cost": a["cost"]}),
            })
    audit(principal, "simulation.run", entity_type="simulation_run", entity_id=rid,
          after={"scenario": key, "seed": seed})
    return {"run_id": rid, **result, "params": params, "seed": seed}


@router.get("/runs")
def list_runs(principal: Principal = Depends(any_role)):
    rows = db.q("select * from simulation_runs order by created_at desc limit 25")
    for r in rows:
        r["metrics"] = db.jload(r["metrics"], {})
        r["policy_config"] = db.jload(r["policy_config"], {})
        if isinstance(r["metrics"], dict):
            r["headline"] = r["metrics"].get("headline")
    return {"items": rows}


@router.get("/{run_id}/events")
def run_events(run_id: str, limit: int = Query(200, le=2000), principal: Principal = Depends(any_role)):
    run = db.one("select * from simulation_runs where id = ?", (run_id,))
    if not run:
        raise HTTPException(404, "Run not found")
    events = db.q("select * from simulation_events where run_id = ? order by seq limit ?", (run_id, limit))
    for e in events:
        e["payload"] = db.jload(e["payload"], {})
    return {"run": {**run, "metrics": db.jload(run["metrics"], {})}, "events": events}


@router.get("/{run_id}")
def get_run(run_id: str, principal: Principal = Depends(any_role)):
    run = db.one("select * from simulation_runs where id = ?", (run_id,))
    if not run:
        raise HTTPException(404, "Run not found")
    return {**run, "metrics": db.jload(run["metrics"], {})}
