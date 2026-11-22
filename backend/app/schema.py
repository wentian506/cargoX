"""Creates the CARGOX schema on whichever engine is configured.

The single DDL template in `sql/schema.sql` is expanded here:
- SQLite  -> the PostGIS geometry column is dropped (lat/lng columns remain).
- Postgres-> a generated `location geometry(Point,4326)` column is added so the
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
    """Apply the DDL. `alter table` and `create index` statements are applied
    individually so an already-provisioned or partially-upgraded database
    converges without crashing startup."""
    db.connect()
    script = render(db.dialect())
    plain, individual = [], []
    # strip SQL comments first, otherwise a leading "-- note" hides the statement
    cleaned = "\n".join(line for line in script.splitlines() if not line.strip().startswith("--"))
    for stmt in [x.strip() for x in cleaned.split(";") if x.strip()]:
        low = stmt.lower()
        if low.startswith("alter table") or low.startswith("create index") or low.startswith("create unique index"):
            individual.append(stmt)
        else:
            plain.append(stmt)
    if plain:
        db.executescript(";\n".join(plain) + ";")
    for stmt in individual:
        try:
            db.execute(stmt)
        except Exception:
            pass  # column or index already present / differs on existing table


def migrate() -> list[str]:
    """Postgres-only additions that are not expressible in the shared DDL."""
    if db.dialect() != "postgres":
        return []
    return []