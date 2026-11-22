"""Creates the CARGOX schema on whichever engine is configured.

The single DDL template in `sql/schema.sql` is expanded here:
* SQLite  -> the PostGIS geometry column is dropped (lat/lng columns remain).
* Postgres-> a generated `location geometry(Point,4326)` column is added so the
  Supabase deployment can use spatial indexes and PostGIS functions.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import db

SCHEMA_FILE = Path(__file__).parent / "sql" / "schema.sql"

_GEO = re.compile(r",?\n\s*\{\{GEO:(\w+):(\w+)\}\}")


def render(dialect: str) -> str:
    raw = SCHEMA_FILE.read_text()
    if dialect == "postgres":
        return _GEO.sub(
            lambda m: (
                ",\n  location geometry(Point,4326) generated always as "
                f"(ST_SetSRID(ST_MakePoint({m.group(2)}, {m.group(1)}), 4326)) stored"
            ),
            raw,
        )
    return _GEO.sub("", raw)


STATEMENT_SPLIT = re.compile(r";\s*\n")


def create_all() -> None:
    """Apply the DDL. `alter table ... add column` lines are applied individually so a
    partially-upgraded database (the local SQLite file) converges without a reset."""
    db.connect()
    script = render(db.dialect())
    plain, alters = [], []
    # strip SQL comments first, otherwise a leading "-- note" hides the statement
    cleaned = "\n".join(line for line in script.splitlines() if not line.strip().startswith("--"))
    for stmt in [x.strip() for x in cleaned.split(";") if x.strip()]:
        (alters if stmt.lower().startswith("alter table") else plain).append(stmt)
    db.executescript(";\n".join(plain) + ";")
    for stmt in alters:
        try:
            db.execute(stmt)
        except Exception:
            pass  # column already present


def migrate() -> list[str]:
    """Postgres-only additions that are not expressible in the shared DDL."""
    if db.dialect() != "postgres":
        return []
    return []
