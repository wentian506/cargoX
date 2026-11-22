"""Deployment guide and capability metadata, exposed as data.

The deployment *countdown widget* has been removed from the product by request:
there is exactly one timer in CARGOX — the pickup arrival clock that starts when
a transporter accepts an assignment (see `services/arrival.py`). The runbook
numbers still live in `docs/deployment.md` / `docs/deployment-timer.md`.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from .. import db
from ..core.config import settings

router = APIRouter(prefix="/api/meta", tags=["meta"])


class DeploymentStartIn(BaseModel):
    """Kept for backwards compatibility with older clients. No-op."""

    started_at: str | None = None


@router.get("/deployment")
def deployment() -> dict:
    """Static runbook summary (no clock, no state file)."""
    return {
        "guide": "docs/deployment.md",
        "timer_doc": "docs/deployment-timer.md",
        "countdown_in_product": False,
        "note": "The deployment countdown is documentation only. The only live timer in "
                "CARGOX is the transporter pickup arrival clock.",
    }


@router.post("/deployment/start", deprecated=True)
def start(_body: DeploymentStartIn | None = None) -> dict:
    """Deprecated no-op: the deployment countdown no longer exists in the app."""
    return {"countdown_in_product": False, "note": "Nothing to start — the deployment countdown was removed."}


@router.get("/info")
def info() -> dict:
    """Public capability report — used by the landing page and by ops checks."""
    return {
        "product": "CARGOX",
        "version": settings.VERSION,
        "database": db.dialect(),
        "coverage": {"country": "India", "states_and_uts": 36, "districts": 801, "towns": 4335},
        "roles": ["sender", "transporter", "admin"],
        "google_signin": bool(settings.GOOGLE_CLIENT_ID),
        "demo_login": False,          # demo accounts were removed from the product
        "live_tracking": "modelled-from-plan + recorded device pings",
        "arrival_clock": "starts when the transporter accepts; counts down to the pickup arrival",
        "synthetic_data": True,
    }
