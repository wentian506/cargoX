"""Authentication: register (sender/transporter only), login, session, reset."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from .. import db
from ..core.config import settings
from ..core.security import (
    Principal,
    create_token,
    get_principal,
    hash_password,
    verify_google_id_token,
    verify_password,
)
from ..services.common import NOW, audit, notify, uid

router = APIRouter(prefix="/api/auth", tags=["auth"])

PUBLIC_ROLES = ("sender", "transporter")   # admin is provisioned, never self-registered
DEFAULT_OWNER_ADMIN = "mehakdeep.s2006@gmail.com"

# ---------------------------------------------------------------------------
# No demo accounts exist. Every role is entered with a real identity:
#   admin        -> CARGOX_ADMIN_EMAILS (Google, or the owner password)
#   sender       -> self-registered / Google sign-up
#   transporter  -> self-registered / Google sign-up
# The old one-click demo logins and published passwords were removed.
# ---------------------------------------------------------------------------


def _owner_admins() -> list[str]:
    """The invite-only Admin addresses (lower-cased) allowed to reach /admin."""
    configured = [e.strip().lower() for e in (settings.ADMIN_EMAILS or []) if e and e.strip()]
    if DEFAULT_OWNER_ADMIN not in configured:
        configured.append(DEFAULT_OWNER_ADMIN)
    return configured


def _promote_if_owner(row: dict) -> dict:
    """An owner address always resolves to the Admin role."""
    user_id = str(row["id"])
    if (row.get("email") or "").strip().lower() in _owner_admins() and row.get("role") != "admin":
        db.execute("update profiles set role = 'admin' where id = ?", (user_id,))
        row["role"] = "admin"
    return row


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    mobile: str = Field(min_length=8, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str
    state: str | None = None
    district: str | None = None
    village: str | None = None
    preferred_language: str = "en"
    account_type: str = Field(pattern="^(sender|transporter)$")


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    role: str | None = None          # optional: the role picked on the login screen


class GoogleIn(BaseModel):
    credential: str                  # the ID token Google Identity Services returns
    role: str | None = None          # required only when creating a new account
    state: str | None = None
    district: str | None = None
    village: str | None = None
    full_name: str | None = None     # details typed on the sign-up form, if any
    mobile: str | None = None
    preferred_language: str = "en"


class ProfileUpdateIn(BaseModel):
    full_name: str | None = None
    mobile: str | None = None
    state: str | None = None
    district: str | None = None
    preferred_language: str | None = None


def _public(profile: dict) -> dict:
    return {
        "id": str(profile["id"]),
        "email": profile["email"],
        "full_name": profile["full_name"],
        "role": profile["role"],
        "status": profile["status"],
        "state": profile["state"],
        "district": profile["district"],
        "preferred_language": profile["language"],
        "mobile": profile["mobile"],
        "verified": bool(profile["verified_at"]),
        "avatar": profile.get("avatar_url"),
        "provider": profile.get("auth_provider") or "password",
    }


@router.post("/register")
def register(body: RegisterIn, request: Request):
    if body.password != body.confirm_password:
        raise HTTPException(400, "Passwords do not match")
    if body.account_type not in PUBLIC_ROLES:
        raise HTTPException(400, "Only Sender and Transporter accounts can be self-registered")
    if db.one("select id from profiles where lower(email) = ?", (body.email.lower(),)):
        raise HTTPException(409, "An account with this email already exists")

    pid = str(uid("USR"))
    profile = {
        "id": pid,
        "email": body.email.lower(),
        "mobile": body.mobile,
        "password_hash": hash_password(body.password),
        "role": body.account_type,
        "full_name": body.full_name.strip(),
        "state": body.state,
        "district": body.district,
        "language": body.preferred_language,
        "org_id": None,
        "status": "active",
        "verified_at": None,
        "created_at": NOW(),
    }
    db.insert("profiles", profile)
    if body.account_type == "sender":
        db.insert(
            "sender_profiles",
            {
                "profile_id": pid,
                "account_kind": "individual",
                "village": body.village,
                "created_at": NOW(),
            },
        )
        notify(
            pid,
            "Welcome to CARGOX",
            "Create your first shipment request — Admin will review it within the planning window.",
        )
    else:
        db.insert(
            "transporter_profiles",
            {
                "profile_id": pid,
                "company_name": body.full_name,
                "fleet_size": 0,
                "verification_status": "pending",
                "rating": 0,
                "created_at": NOW(),
            },
        )
        notify(
            pid,
            "Welcome to CARGOX",
            "Add your first vehicle. Admin verifies documents before assignments unlock.",
        )

    audit(
        {"id": pid, "role": body.account_type},
        "account.register",
        entity_type="profile",
        entity_id=pid,
        after={"role": body.account_type},
        ip=request.client.host if request.client else None,
    )
    token = create_token(pid, str(body.account_type))
    return {"token": token, "user": _public(profile), "redirect": f"/{body.account_type}"}


@router.post("/login")
def login(body: LoginIn, request: Request):
    row = db.one("select * from profiles where lower(email) = ?", (body.email.lower(),))
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if row["status"] == "suspended":
        raise HTTPException(403, "This account is suspended. Contact support.")

    row = _promote_if_owner(dict(row))
    user_id = str(row["id"])
    user_role = str(row["role"])

    if body.role and body.role != user_role:
        raise HTTPException(
            409,
            f"This email is registered as {user_role.title()}. Pick {user_role.title()} "
            f"on the role selector, or create a separate {body.role.title()} account.",
        )

    db.execute("update profiles set last_login_at = ? where id = ?", (NOW(), user_id))
    audit(
        {"id": user_id, "role": user_role},
        "account.login",
        entity_type="profile",
        entity_id=user_id,
        ip=request.client.host if request.client else None,
    )
    return {
        "token": create_token(user_id, user_role),
        "user": _public(row),
        "redirect": f"/{user_role}",
    }


@router.get("/me")
def me(principal: Principal = Depends(get_principal)):
    principal_id = str(principal["id"])
    row = db.one("select * from profiles where id = ?", (principal_id,))
    if not row:
        raise HTTPException(404, "Profile not found")

    row = _promote_if_owner(dict(row))
    extra: dict = {}
    if row["role"] == "sender":
        sp = db.one("select * from sender_profiles where profile_id = ?", (principal_id,))
        extra = {"sender": sp}
    elif row["role"] == "transporter":
        tp = db.one("select * from transporter_profiles where profile_id = ?", (principal_id,))
        extra = {"transporter": tp}
    return {"user": _public(row), **extra}


@router.patch("/me")
def update_me(body: ProfileUpdateIn, principal: Principal = Depends(get_principal)):
    sets, vals = [], []
    mapping = {
        "full_name": "full_name",
        "mobile": "mobile",
        "state": "state",
        "district": "district",
        "preferred_language": "language",
    }
    for field, col in mapping.items():
        v = getattr(body, field)
        if v is not None:
            sets.append(f"{col} = ?")
            vals.append(v)
    if not sets:
        raise HTTPException(400, "No changes supplied")
    vals.append(str(principal["id"]))
    db.execute(f"update profiles set {', '.join(sets)} where id = ?", vals)
    return {"updated": True}


@router.post("/forgot-password")
def forgot_password(payload: dict):
    """Always 200 — never leak whether an address exists.

    In production Supabase Auth sends the recovery email. On a local SQLite
    instance a single-use reset token is returned in the response so the flow is
    testable end to end (never on Postgres, where a real mailbox provider does
    the work). It is a live credential for one account, not a demo login.
    """
    email = (payload.get("email") or "").lower()
    row = db.one("select id from profiles where lower(email) = ?", (email,)) if email else None
    out = {"message": "If that email exists, a reset link has been sent.", "delivery": "supabase_auth_email"}
    if row and db.dialect() == "sqlite":
        out["reset_token"] = create_token(str(row["id"]), "password_reset", ttl_hours=1)
    return out


@router.post("/reset-password")
def reset_password(payload: dict):
    from ..core.security import decode_token

    token = payload.get("token") or ""
    claims = decode_token(token)
    if not claims or claims.get("role") != "password_reset":
        raise HTTPException(400, "Invalid or expired reset token")
    new = payload.get("password") or ""
    if len(new) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    db.execute("update profiles set password_hash = ? where id = ?", (hash_password(new), str(claims["sub"])))
    return {"reset": True}


@router.post("/logout")
def logout(principal: Principal = Depends(get_principal)):
    # stateless JWT: the client discards the token; server-side session list is
    # available in Supabase Auth for revocation.
    return {"ok": True}


@router.post("/google")
def google_sign_in(body: GoogleIn, request: Request):
    """Sign in (or create an account) from a Google ID token.

    The token is verified against Google's public keys — audience, issuer and
    expiry are all checked, so a forged token is rejected. A brand-new Google
    user must choose Sender or Transporter; Admin stays invite-only.
    """
    claims = verify_google_id_token(body.credential, settings.GOOGLE_CLIENT_ID)
    if not claims:
        raise HTTPException(
            401,
            "Google sign-in is not available on this deployment yet (GOOGLE_CLIENT_ID is not "
            "configured), or the token could not be verified.",
        )
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Google account has no email address")
    if settings.GOOGLE_ALLOWED_DOMAINS:
        domain = email.split("@")[-1]
        if domain not in settings.GOOGLE_ALLOWED_DOMAINS:
            raise HTTPException(403, f"Sign-in is restricted to {', '.join(settings.GOOGLE_ALLOWED_DOMAINS)}")

    row = db.one("select * from profiles where lower(email) = ?", (email,))
    # an owner address that already has a profile (seeded, or added later) always
    # resolves to Admin; a brand-new owner address is refused like any unknown
    # address until the profile exists, so nobody can mint an admin by sign-in
    if row:
        row = _promote_if_owner(dict(row))
        user_id = str(row["id"])
        user_role = str(row["role"])
        if row["status"] != "active":
            raise HTTPException(403, "This account is suspended. Contact support.")
        if body.role and body.role != user_role:
            raise HTTPException(409, f"This email is registered as {user_role.title()}.")
        db.execute(
            "update profiles set last_login_at = ?, google_sub = coalesce(google_sub, ?) where id = ?",
            (NOW(), claims.get("sub"), user_id),
        )
        audit(
            {"id": user_id, "role": user_role},
            "account.login_google",
            entity_type="profile",
            entity_id=user_id,
            ip=request.client.host if request.client else None,
        )
        return {
            "token": create_token(user_id, user_role),
            "user": _public(row),
            "redirect": f"/{user_role}",
            "created": False,
        }

    role = (body.role or "").lower()
    if role not in PUBLIC_ROLES:
        raise HTTPException(409, "new_account_needs_role")
    pid = str(uid("USR"))
    profile = {
        "id": pid,
        "email": email,
        "mobile": body.mobile,
        "password_hash": None,
        "role": role,
        "full_name": (body.full_name or claims.get("name") or email.split("@")[0]).strip(),
        "state": body.state,
        "district": body.district,
        "language": body.preferred_language,
        "org_id": None,
        "status": "active",
        "verified_at": NOW(),
        "created_at": NOW(),
        "auth_provider": "google",
        "avatar_url": claims.get("picture"),
        "google_sub": claims.get("sub"),
    }
    db.insert("profiles", profile)
    if role == "sender":
        db.insert(
            "sender_profiles",
            {
                "profile_id": pid,
                "account_kind": "individual",
                "village": body.village,
                "created_at": NOW(),
            },
        )
    else:
        db.insert(
            "transporter_profiles",
            {
                "profile_id": pid,
                "company_name": profile["full_name"],
                "fleet_size": 0,
                "verification_status": "pending",
                "rating": 0,
                "created_at": NOW(),
            },
        )
    notify(pid, "Welcome to CARGOX", "Your Google account is linked. Complete your profile to start.")
    audit(
        {"id": pid, "role": role},
        "account.register_google",
        entity_type="profile",
        entity_id=pid,
        after={"role": role},
        ip=request.client.host if request.client else None,
    )
    return {
        "token": create_token(pid, role),
        "user": _public(profile),
        "redirect": f"/{role}",
        "created": True,
    }


@router.get("/config")
def auth_config():
    """Which sign-in methods are live in this deployment (read by the login page)."""
    return {
        "email_password": True,
        "google_oauth": bool(settings.GOOGLE_CLIENT_ID),
        "google_client_id": settings.GOOGLE_CLIENT_ID,
        "public_roles": list(PUBLIC_ROLES),
        "admin_registration": "invite_only",
        "owner_admin_emails": _owner_admins(),
        "demo_mode": False,          # no demo accounts exist anywhere in the product
        "demo_accounts": [],
        "note": (
            "Google sign-in is live."
            if settings.GOOGLE_CLIENT_ID
            else "Set GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable Google sign-in. "
            "Email + password works now."
        ),
    }