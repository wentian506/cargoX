"""CARGOX API entrypoint.

Run (dev):  uvicorn app.main:app --reload --port 8000
Prod:       gunicorn -k uvicorn.workers.UvicornWorker app.main:app
"""
from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager



from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import schema, seed
from .api import (
    admin,
    auth,
    geo,
    intelligence,
    meta,
    misc,
    shipments,
    simulations,
    tracking,
    transporter,
    vehicles,
)
from .core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    schema.create_all()
    seed.run()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=(
        "CARGOX — AI-powered rural freight coordination. Three roles only: "
        "Sender, Transporter, Admin. No receiver or FPO accounts exist."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS + ["*"] if os.getenv("CARGOX_ALLOW_ALL") else settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# rate limiting — dependency-free token bucket per (client IP, bucket)
# --------------------------------------------------------------------------- #
_RATE: dict[str, list] = {}


def _rate_ok(key: str, limit: int, window: int) -> tuple[bool, float]:
    now = time.monotonic()
    bucket = _RATE.setdefault(key, [0, now])
    if now - bucket[1] >= window:
        bucket[0], bucket[1] = 0, now
    bucket[0] += 1
    if bucket[0] > limit:
        return False, round(window - (now - bucket[1]), 1)
    return True, 0.0


AUTH_PATHS = ("/api/auth/login", "/api/auth/register", "/api/auth/forgot-password",
              "/api/auth/reset-password")


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    if not settings.RATE_LIMIT_ENABLED or request.method == "OPTIONS":
        return await call_next(request)
    ip = request.client.host if request.client else "unknown"
    is_auth = request.url.path in AUTH_PATHS
    limit = settings.RATE_LIMIT_AUTH if is_auth else settings.RATE_LIMIT_DEFAULT
    ok, retry_after = _rate_ok(f"{ip}:{'auth' if is_auth else 'api'}", limit, settings.RATE_LIMIT_WINDOW_S)
    if not ok:
        return JSONResponse(status_code=429,
                            content={"detail": "Too many requests. Slow down and retry."},
                            headers={"Retry-After": str(retry_after)})
    response = await call_next(request)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Window"] = f"{settings.RATE_LIMIT_WINDOW_S}s"
    return response


@app.middleware("http")
async def add_process_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-CARGOX-Roles"] = "sender,transporter,admin"
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):  # pragma: no cover
    return JSONResponse(status_code=500, content={"detail": "Internal CARGOX error", "type": type(exc).__name__})


for module in (auth, geo, shipments, vehicles, admin, transporter, tracking, intelligence, simulations, meta, misc):
    app.include_router(module.router)


@app.get("/")
def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/health",
        "roles": ["sender", "transporter", "admin"],
        "note": "Every demo operational record is synthetic and labelled as such.",
    }
