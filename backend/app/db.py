"""Thin database layer.

Two drivers, one interface:

- **dev / this workspace** -> SQLite file (`:memory:` supported) so the whole
  platform runs with zero external services.
- **production** -> Postgres/PostGIS on Supabase via `DATABASE_URL`
  (psycopg 3).  Placeholders written as `?` are translated to `%s`, and the
  DDL/seed files use syntax that is valid on both engines.

Every query goes through `q` / `one` / `execute` so the API code never talks to
a driver directly.
"""
from __future__ import annotations

import json
import re
import sqlite3
import threading
import uuid
from typing import Any, Iterable, Sequence

from .core.config import settings

_lock = threading.RLock()
_state: dict[str, Any] = {"conn": None, "dialect": "sqlite"}
_col_cache: dict[tuple[str, str], set[str]] = {}
_uuid_col_cache: dict[tuple[str, str], set[str]] = {}
_geom_col_cache: dict[tuple[str, str], set[str]] = {}
_array_col_cache: dict[tuple[str, str], set[str]] = {}
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


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


def _pg_rollback(conn: Any) -> None:
    if _state["dialect"] == "postgres" and conn is not None:
        try:
            conn.rollback()
        except Exception:
            pass


def _table_columns(table: str) -> set[str] | None:
    d = _state["dialect"]
    key = (d, table)
    if key in _col_cache:
        return _col_cache[key]
    if d == "postgres":
        rows = q(
            "select column_name, data_type, udt_name from information_schema.columns "
            "where table_schema = 'public' and table_name = ?",
            (table,),
        )
        cols = {r["column_name"] for r in rows}
        uuid_cols = {
            r["column_name"]
            for r in rows
            if (r.get("data_type") or "").lower() == "uuid"
        }
        geom_cols = {
            r["column_name"]
            for r in rows
            if (r.get("udt_name") or "").lower() in ("geometry", "geography")
            or "geometry" in (r.get("data_type") or "").lower()
        }
        array_cols = {
            r["column_name"]
            for r in rows
            if (r.get("data_type") or "").lower() == "array"
            or (r.get("udt_name") or "").startswith("_")
        }
        if cols:
            _col_cache[key] = cols
            _uuid_col_cache[key] = uuid_cols
            _geom_col_cache[key] = geom_cols
            _array_col_cache[key] = array_cols
            return cols
        return None
    rows = q(f"pragma table_info({table})")
    cols = {r["name"] for r in rows if "name" in r}
    if cols:
        _col_cache[key] = cols
        _uuid_col_cache[key] = set()
        _geom_col_cache[key] = set()
        _array_col_cache[key] = set()
        return cols
    return None


def _uuid_columns(table: str) -> set[str]:
    _table_columns(table)
    return _uuid_col_cache.get((_state["dialect"], table), set())


def _geom_columns(table: str) -> set[str]:
    _table_columns(table)
    return _geom_col_cache.get((_state["dialect"], table), set())


def _array_columns(table: str) -> set[str]:
    _table_columns(table)
    return _array_col_cache.get((_state["dialect"], table), set())


def _coerce_uuid_value(val: Any) -> str:
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, str) and _UUID_RE.match(val.strip()):
        return val.strip()
    return str(uuid.uuid4())


def _to_wkt_point(lat: Any, lon: Any, fallback: tuple[float, float] = (25.5941, 85.1376)) -> str:
    try:
        use_lat = float(lat) if lat is not None else fallback[0]
        use_lon = float(lon) if lon is not None else fallback[1]
        return f"SRID=4326;POINT({use_lon} {use_lat})"
    except Exception:
        return f"SRID=4326;POINT({fallback[1]} {fallback[0]})"


def _coerce_geom_value(val: Any, col: str, data: dict[str, Any]) -> Any:
    if val is None:
        return None
    if isinstance(val, str):
        stripped = val.strip()
        if stripped.upper().startswith(("SRID=", "POINT", "LINESTRING", "POLYGON", "MULTIPOINT")):
            return val
    if "dest" in col or "drop" in col:
        return _to_wkt_point(
            data.get("dest_lat"),
            data.get("dest_lng"),
            fallback=(float(data.get("pickup_lat") or 25.5941), float(data.get("pickup_lng") or 85.1376)),
        )
    return _to_wkt_point(data.get("pickup_lat"), data.get("pickup_lng"))


def _coerce_array_value(val: Any) -> Any:
    if val is None or isinstance(val, (list, tuple)):
        return list(val) if isinstance(val, tuple) else val
    if isinstance(val, str):
        parts = [p.strip() for p in val.split(",") if p.strip()]
        return parts if parts else ([val.strip()] if val.strip() else [])
    return [val]


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, uuid.UUID):
            out[k] = str(v)
        elif isinstance(v, list):
            out[k] = ", ".join(str(x) for x in v)
        else:
            out[k] = v
    return out


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _rows(cur) -> list[dict]:
    out: list[dict] = []
    for r in cur.fetchall():
        out.append(_normalize_row(dict(r)))
    return out


def q(query: str, params: Sequence[Any] | None = None) -> list[dict]:
    connect()
    with _lock:
        conn = _state["conn"]
        cur = conn.cursor()
        try:
            cur.execute(_sql(query), tuple(params or ()))
            rows = _rows(cur)
            if _state["dialect"] == "postgres":
                conn.commit()
            return rows
        except Exception:
            _pg_rollback(conn)
            raise
        finally:
            cur.close()


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
        try:
            cur.execute(_sql(query), tuple(params or ()))
            n = cur.rowcount if cur.rowcount is not None else 0
            if _state["dialect"] == "postgres":
                conn.commit()
            return n
        except Exception:
            _pg_rollback(conn)
            raise
        finally:
            cur.close()


def insert(table: str, data: dict) -> dict:
    connect()
    known_cols = _table_columns(table)
    filtered = {k: v for k, v in data.items() if not known_cols or k in known_cols}
    if not filtered:
        filtered = dict(data)
    if _state["dialect"] == "postgres":
        uuid_cols = _uuid_columns(table)
        geom_cols = _geom_columns(table)
        array_cols = _array_columns(table)
        for col in uuid_cols:
            if col in filtered and filtered[col] is not None:
                filtered[col] = _coerce_uuid_value(filtered[col])
        for col in geom_cols:
            if col in filtered and filtered[col] is not None:
                filtered[col] = _coerce_geom_value(filtered[col], col, data)
        for col in array_cols:
            if col in filtered and filtered[col] is not None:
                filtered[col] = _coerce_array_value(filtered[col])
    cols = list(filtered.keys())
    ph = ", ".join("?" for _ in cols)
    query = f"insert into {table} ({', '.join(cols)}) values ({ph})"
    if _state["dialect"] == "postgres":
        try:
            rows = q(query + " returning *", [filtered[c] for c in cols])
            return rows[0] if rows else _normalize_row(filtered)
        except Exception as exc:
            msg = str(exc).lower()
            if "invalid geometry" in msg or "geometry" in msg:
                retry = dict(filtered)
                for k, v in list(retry.items()):
                    if isinstance(v, str) and k not in ("id", "code", "sender_id", "status", "unit", "direction"):
                        retry[k] = _coerce_geom_value(v, k, data)
                rows = q(query + " returning *", [retry[c] for c in cols])
                return rows[0] if rows else _normalize_row(retry)
            raise
    execute(query, [filtered[c] for c in cols])
    return filtered


def executemany(query: str, seq: Iterable[Sequence[Any]]) -> None:
    connect()
    with _lock:
        conn = _state["conn"]
        cur = conn.cursor()
        try:
            cur.executemany(_sql(query), [tuple(x) for x in seq])
            if _state["dialect"] == "postgres":
                conn.commit()
        except Exception:
            _pg_rollback(conn)
            raise
        finally:
            cur.close()


def executescript(script: str) -> None:
    connect()
    with _lock:
        conn = _state["conn"]
        if _state["dialect"] == "postgres":
            try:
                with conn.cursor() as cur:
                    cur.execute(script)
                conn.commit()
            except Exception:
                _pg_rollback(conn)
                raise
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