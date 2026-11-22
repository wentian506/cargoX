"""CARGOX runtime configuration.

Everything is environment-driven so the same code runs locally (SQLite),
on Render with a managed Postgres, and inside CI.
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # backend/


class Settings:
    APP_NAME: str = "CARGOX API"
    VERSION: str = "1.0.0"

    # Auth
    SECRET_KEY: str = os.getenv("CARGOX_SECRET_KEY", "cargox-dev-secret-change-in-production")
    TOKEN_TTL_HOURS: int = int(os.getenv("CARGOX_TOKEN_TTL_HOURS", "24"))
    PBKDF2_ITERATIONS: int = int(os.getenv("CARGOX_PBKDF2_ITERATIONS", "120000"))

    # Persistence. In production point CARGOX_DATABASE_URL at Supabase Postgres.
    DB_PATH: str = os.getenv("CARGOX_DB", str(BASE_DIR / "cargox.db"))
    DATABASE_URL: str | None = os.getenv("DATABASE_URL")

    # CORS: the Next.js proxy calls the API server-side, so only local/dev
    # origins need to be listed. Comma separated.
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in os.getenv(
            "CARGOX_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if o.strip()
    ]

    # --- Google sign-in ------------------------------------------------------ #
    # Paste the Web client id from Google Cloud Console -> APIs & Services ->
    # Credentials. The API verifies every ID token against Google's public keys;
    # when the id is unset the endpoint refuses to accept unverified tokens.
    GOOGLE_CLIENT_ID: str | None = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_ALLOWED_DOMAINS: list[str] = [
        d.strip() for d in os.getenv("GOOGLE_ALLOWED_DOMAINS", "").split(",") if d.strip()
    ]
    # Public origin of the frontend, used for the OAuth redirect + email links.
    PUBLIC_WEB_URL: str = os.getenv("PUBLIC_WEB_URL", "http://localhost:3000")

    # --- owner admin accounts (Google sign-in) ------------------------------ #
    # These addresses always resolve to the Admin workspace, even on a fresh
    # database: the seeder creates the profile and Google sign-in links it. They
    # carry no password, so they can only be entered through "Sign in with
    # Google". Override with a comma-separated list if the owner changes.
    ADMIN_EMAILS: list[str] = [
        e.strip().lower()
        for e in os.getenv("CARGOX_ADMIN_EMAILS", "mehakdeep.s2006@gmail.com").split(",")
        if e.strip()
    ]
    # Owner admin name + password (email + password sign-in). Google sign-in on
    # the same address also works once GOOGLE_CLIENT_ID is configured.
    ADMIN_NAME: str = os.getenv("CARGOX_ADMIN_NAME", "Mehakdeep Singh")
    ADMIN_PASSWORD: str = os.getenv("CARGOX_ADMIN_PASSWORD", "mehak@2006")

    # --- India-wide defaults ------------------------------------------------ #
    DEFAULT_STATE: str = os.getenv("CARGOX_DEFAULT_STATE", "Punjab")
    ALLOW_ALL_STATES: bool = True

    # --- Simulation + algorithm defaults (see docs/architecture.md)
    DEFAULT_SEED: int = 20260101
    ROAD_FACTOR: float = 1.24          # straight-line -> road distance multiplier
    MONSOON_FACTOR: float = 1.55       # extra distance when a link is monsoon-blocked
    FUEL_INR_PER_LITRE: float = 89.4
    SYNTHETIC_LABEL: str = "SYNTHETIC — model output, not a field-validated measurement"

    # Rate limiting (in-process token bucket; swap for Redis when horizontally scaled)
    RATE_LIMIT_ENABLED: bool = os.getenv("CARGOX_RATE_LIMIT", "1") == "1"
    RATE_LIMIT_AUTH: int = int(os.getenv("CARGOX_RATE_LIMIT_AUTH", "20"))      # requests / window / IP
    RATE_LIMIT_DEFAULT: int = int(os.getenv("CARGOX_RATE_LIMIT_DEFAULT", "600"))
    RATE_LIMIT_WINDOW_S: int = int(os.getenv("CARGOX_RATE_LIMIT_WINDOW", "60"))


settings = Settings()
