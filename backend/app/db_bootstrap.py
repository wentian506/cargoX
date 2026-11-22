"""Production bootstrap: build the runtime schema on Postgres/Supabase.

The FastAPI runtime schema lives in `app/sql/schema.sql` (dialect-neutral: text
ids, ISO timestamps). The Supabase migrations in `supabase/migrations/` are the
*analytical* twin used for reference tables, RLS and admin provisioning, and are
deliberately not applied to the runtime tables — applying both would create two
different `profiles` definitions. This module is the canonical production path:

    python -m app.db_bootstrap            # create tables + seed reference data
    python -m app.db_bootstrap --force    # also re-seed if already seeded

It is idempotent, so it is safe to run on every deploy (Render does exactly that
via the release command).
"""
from __future__ import annotations

import sys

from . import db, schema, seed
from .core.config import settings


def main(argv: list[str]) -> int:
    db.connect()
    print(f"[bootstrap] dialect={db.dialect()}")
    if db.dialect() == "postgres" and "postgis" not in str(settings.DATABASE_URL):
        # geometry columns are optional; the DDL only adds them when PostGIS is
        # available because the generated columns are guarded by {{GEO}} markers
        print("[bootstrap] note: geometry columns require the postgis extension "
              "(enable it in Supabase → Database → Extensions)")

    schema.create_all()
    print("[bootstrap] schema ensured")

    if "--force" in argv and db.dialect() != "sqlite":
        for table in ("shipment_events", "notifications", "audit_logs", "cost_allocations",
                      "trip_shipments", "trip_legs", "trips", "transport_assignments",
                      "shipments", "shipment_items", "shipment_destinations",
                      "capacity_blocks", "coalitions", "shipment_pools", "vehicles",
                      "transporter_profiles", "sender_profiles", "profiles", "organisations"):
            db.execute(f"delete from {table}")
        print("[bootstrap] demo operational rows cleared (--force)")

    result = seed.run()
    print(f"[bootstrap] seed: {result}")
    print("[bootstrap] accounts: no demo logins are seeded. The owner admin is "
          f"{', '.join(settings.ADMIN_EMAILS)} (Google, or CARGOX_ADMIN_PASSWORD); "
          "senders and transporters create their own accounts at /register.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
