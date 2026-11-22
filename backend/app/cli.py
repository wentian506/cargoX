"""Small operator CLI for a deployed CARGOX database.

    python3 -m app.cli show-admin
    python3 -m app.cli set-admin-password 'new-long-password'
    python3 -m app.cli profiles            # who exists, and can they log in

`set-admin-password` is the supported way to rotate the owner admin's password
on a live deployment (Google sign-in is unaffected).
"""
from __future__ import annotations

import sys

from . import db
from .core.config import settings
from .core.security import hash_password
from .services.common import NOW, uid


def _owner_email() -> str:
    owners = [e.strip().lower() for e in settings.ADMIN_EMAILS if e and e.strip()]
    if not owners:
        raise SystemExit("CARGOX_ADMIN_EMAILS is empty — set the owner address first")
    return owners[0]


def show_admin() -> None:
    email = _owner_email()
    row = db.one("select id, email, role, full_name, status from profiles where lower(email) = ?", (email,))
    print(f"owner address : {email}")
    print(f"profile       : {row or 'NOT SEEDED YET (run python3 -m app.db_bootstrap)'}")
    print(f"google door   : {'enabled' if settings.GOOGLE_CLIENT_ID else 'needs GOOGLE_CLIENT_ID'}")
    print(f"password door : always enabled (CARGOX_ADMIN_PASSWORD)")


def set_admin_password(password: str) -> None:
    if len(password) < 8:
        raise SystemExit("Password must be at least 8 characters")
    email = _owner_email()
    row = db.one("select id from profiles where lower(email) = ?", (email,))
    if row:
        db.execute("update profiles set password_hash = ? where id = ?", (hash_password(password), row["id"]))
    else:
        db.insert("profiles", {
            "id": uid("USR"), "email": email, "mobile": None,
            "password_hash": hash_password(password), "role": "admin",
            "full_name": settings.ADMIN_NAME, "state": None, "district": None,
            "language": "en", "org_id": None, "status": "active",
            "verified_at": NOW(), "created_at": NOW(),
        })
    print(f"password updated for {email}")


def profiles() -> None:
    rows = db.q("""select id, email, role, full_name, status,
                          case when password_hash is null then 0 else 1 end as has_password
                     from profiles order by role, created_at""")
    for r in rows:
        door = "password" if r["has_password"] else "no login (data owner)"
        print(f"{r['role']:<12} {r['email']:<34} {r['status']:<9} {door}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        raise SystemExit(1)
    cmd = args[0]
    if cmd == "show-admin":
        show_admin()
    elif cmd == "set-admin-password":
        if len(args) < 2:
            raise SystemExit("usage: python3 -m app.cli set-admin-password 'new-password'")
        set_admin_password(args[1])
    elif cmd == "profiles":
        profiles()
    else:
        print(__doc__)
        raise SystemExit(1)
