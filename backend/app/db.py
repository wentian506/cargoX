"""Thin database layer.

Two drivers, one interface:

* **dev / this workspace** -> SQLite file (`:memory:` supported) so the whole
  platform runs with zero external services.
* **production** -> Postgres/PostGIS on Supabase via `DATABASE_URL`
  (psycopg 3).  Placeholders written as `?` are translated to `%s`, and the
  DDL/seed files use syntax that is valid on both engines.

Every query goes through `q` / `one` / `execute` so the API code never talks to
a driver directly.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Iterable, Sequence

from .core.config import settings

_lock = threading.RLock()
_state: dict[str, Any] = {"conn": None, "dialect": "sqlite"}


# --------------------------------------------------------------------------- #
# connection
# --------------------------------------------------------------------------- #
def _connect() -> tuple[Any, str]:
    if settings.DATABASE_URL:
        import psycopg  # type: ignore
        from psycopg.rows import dict_row  # type: ignore

        conn = psycopg.connect(settings.DATABASE_URL, row_factory=dict_row)
        return conn, "postgres"
    conn = sqlite3.connect(
        settings.DB_PATH, check_same_thread=False, isolation_level=None
    )
    conn.row_factory = sqlite3.Row
    conn.execute("pragma journal_mode = WAL")
    conn.execute("pragma foreign_keys = on")
    return conn, "sqlite"


def connect() -> None:
    with _lock:
        if _state["conn"] is None:
            _state["conn"], _state["dialect"] = _connect()


def close() -> None:
    with _lock:
        if _state["conn"] is not None:
            _state["conn"].close()
            _state["conn"] = None


def dialect() -> str:
    return _state["dialect"]


def _sql(query: str) -> str:
    if _state["dialect"] == "postgres":
        return query.replace("?", "%s")
    return query


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _rows(cur) -> list[dict]:
    out: list[dict] = []
    for r in cur.fetchall():
        d = dict(r)
        out.append(d)
    return out


def q(query: str, params: Sequence[Any] | None = None) -> list[dict]:
    connect()
    with _lock:
        conn = _state["conn"]
        cur = conn.cursor()
        cur.execute(_sql(query), tuple(params or ()))
        rows = _rows(cur)
        # a returned row on an INSERT..RETURNING also acts as a write; commit
        if _state["dialect"] == "postgres":
            conn.commit()
        cur.close()
        return rows


def one(query: str, params: Sequence[Any] | None = None) -> dict | None:
    rows = q(query, params)
    return rows[0] if rows else None


def scalar(query: str, params: Sequence[Any] | None = None, default: Any = None) -> Any:
    row = one(query, params)
    if not row:
        return default
    return list(row.values())[0]


def execute(query: str, params: Sequence[Any] | None = None) -> int:
    """Run a write statement, return affected row count."""
    connect()
    with _lock:
        conn = _state["conn"]
        cur = conn.cursor()
        cur.execute(_sql(query), tuple(params or ()))
        n = cur.rowcount if cur.rowcount is not None else 0
        if _state["dialect"] != "postgres":
            pass  # autocommit mode (isolation_level=None)
        else:
            conn.commit()
        cur.close()
        return n


def insert(table: str, data: dict) -> dict:
    cols = list(data.keys())
    ph = ", ".join("?" for _ in cols)
    query = f"insert into {table} ({', '.join(cols)}) values ({ph})"
    if _state["dialect"] == "postgres":
        rows = q(query + " returning *", list(data.values()))
        return rows[0]
    execute(query, [data[c] for c in cols])
    return data


def executemany(query: str, seq: Iterable[Sequence[Any]]) -> None:
    connect()
    with _lock:
        conn = _state["conn"]
        cur = conn.cursor()
        cur.executemany(_sql(query), [tuple(x) for x in seq])
        if _state["dialect"] == "postgres":
            conn.commit()
        cur.close()


def executescript(script: str) -> None:
    connect()
    with _lock:
        conn = _state["conn"]
        if _state["dialect"] == "postgres":
            with conn.cursor() as cur:
                cur.execute(script)
            conn.commit()
        else:
            conn.executescript(script)


def table_exists(name: str) -> bool:
    if _state["dialect"] == "postgres":
        return bool(
            scalar("select to_regclass(?) is not null as e", (f"public.{name}",), False)
        )
    return bool(
        scalar(
            "select count(*) from sqlite_master where type='table' and name=?",
            (name,),
            0,
        )
    )


# --------------------------------------------------------------------------- #
# JSON + geo helpers (SQLite stores JSON as text, PostGIS as geometry)
# --------------------------------------------------------------------------- #
def jload(raw: Any, default: Any = None) -> Any:
    if raw is None:
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return default


def jdump(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), default=str)


def point(lat: float, lon: float) -> str:
    """Return a value usable by the driver for a location column."""
    if _state["dialect"] == "postgres":
        return f"SRID=4326;POINT({lon} {lat})"
    return f"{lat:.6f},{lon:.6f}"


def parse_point(value: Any) -> tuple[float, float] | None:
    """-> (lat, lon) from either storage representation."""
    if value is None:
        return None
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return float(value[0]), float(value[1])
    text = str(value)
    if text.startswith("SRID="):
        text = text.split(";", 1)[1]
    if text.upper().startswith("POINT"):
        body = text[text.find("(") + 1 : text.rfind(")")]
        lon, lat = [float(x) for x in body.split()[:2]]
        return lat, lon
    try:
        lat, lon = text.split(",")
        return float(lat), float(lon)
    except Exception:
        return None
