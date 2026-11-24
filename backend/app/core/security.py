"""Password hashing + HMAC-signed JWT + role dependencies.

In the Supabase deployment the access token is issued by Supabase Auth and
verified with the project JWT secret; this module implements the identical
claim contract (`sub`, `role`, `exp`) so the API layer is agnostic about the
issuer.  See docs/deployment.md -> "Auth modes".
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Literal

from fastapi import Depends, HTTPException, Request

from .config import settings

Role = Literal["sender", "transporter", "admin"]


# --------------------------------------------------------------------------- #
# encoding helpers
# --------------------------------------------------------------------------- #
def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _b64d(raw: str) -> bytes:
    return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


# --------------------------------------------------------------------------- #
# passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str, iterations: int | None = None) -> str:
    iters = iterations or settings.PBKDF2_ITERATIONS
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iters)
    return f"pbkdf2${iters}${_b64e(salt)}${_b64e(dk)}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _algo, iters, salt, digest = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", password.encode(), _b64d(salt), int(iters))
        return hmac.compare_digest(calc, _b64d(digest))
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# tokens
# --------------------------------------------------------------------------- #
def create_token(sub: str, role: str, ttl_hours: int | None = None) -> str:
    ttl = ttl_hours or settings.TOKEN_TTL_HOURS
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(sub),
        "role": str(role),
        "iss": "cargox-api",
        "iat": int(time.time()),
        "exp": int(time.time() + ttl * 3600),
    }
    seg = (
        _b64e(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64e(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = hmac.new(settings.SECRET_KEY.encode(), seg.encode(), hashlib.sha256).digest()
    return f"{seg}.{_b64e(sig)}"


def decode_token(token: str) -> dict | None:
    try:
        head, body, sig = token.split(".")
        expected = hmac.new(
            settings.SECRET_KEY.encode(), f"{head}.{body}".encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _b64d(sig)):
            return None
        claims = json.loads(_b64d(body))
        if int(claims.get("exp", 0)) < int(time.time()):
            return None
        return claims
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Google ID tokens
# --------------------------------------------------------------------------- #
_GOOGLE_CERTS_URL = os.getenv("GOOGLE_JWKS_URL", "https://www.googleapis.com/oauth2/v3/certs")
_JWKS_CACHE: dict[str, object] = {"keys": {}, "fetched": 0.0}


def _google_keys(force: bool = False) -> dict:
    """Fetch + cache Google's signing keys. Only hits the network on cache miss."""
    import urllib.request

    if not force and _JWKS_CACHE["keys"] and time.time() - float(_JWKS_CACHE["fetched"]) < 3600:
        return _JWKS_CACHE["keys"]  # type: ignore[return-value]
    try:
        with urllib.request.urlopen(_GOOGLE_CERTS_URL, timeout=6) as fh:
            payload = json.loads(fh.read())
        keys = {k["kid"]: k for k in payload.get("keys", [])}
        _JWKS_CACHE["keys"] = keys
        _JWKS_CACHE["fetched"] = time.time()
        return keys
    except Exception:
        return _JWKS_CACHE["keys"] or {}  # type: ignore[return-value]


def _rs256_verify(signing_input: bytes, signature: bytes, n_b64: str, e_b64: str) -> bool:
    """RSA PKCS#1 v1.5 SHA-256 verification with no third-party dependency."""
    n = int.from_bytes(_b64d(n_b64), "big")
    e = int.from_bytes(_b64d(e_b64), "big")
    k = (n.bit_length() + 7) // 8
    if len(signature) != k:
        return False
    m = pow(int.from_bytes(signature, "big"), e, n).to_bytes(k, "big")
    digest_info = bytes.fromhex("3031300d060960864801650304020105000420")
    digest = hashlib.sha256(signing_input).digest()
    expected = b"\x00\x01" + b"\xff" * (k - len(digest_info) - len(digest) - 3) + b"\x00" + digest_info + digest
    return hmac.compare_digest(m, expected)


def verify_google_id_token(token: str, client_id: str | None = None) -> dict | None:
    """Verify a Google ID token -> claims, or None.

    Checks signature against Google's JWKS, issuer, audience and expiry. Never
    trusts a token just because it decodes — that is the classic mistake.
    """
    try:
        head_b64, body_b64, sig_b64 = token.split(".")
        header = json.loads(_b64d(head_b64))
        claims = json.loads(_b64d(body_b64))
    except Exception:
        return None
    if header.get("alg") != "RS256":
        return None
    keys = _google_keys()
    jwk = keys.get(header.get("kid"))
    if not jwk:
        keys = _google_keys(force=True)
        jwk = keys.get(header.get("kid"))
    if not jwk:
        return None
    if not _rs256_verify(f"{head_b64}.{body_b64}".encode(), _b64d(sig_b64), jwk["n"], jwk["e"]):
        return None
    aud = claims.get("aud")
    expected_aud = client_id or settings.GOOGLE_CLIENT_ID
    if expected_aud and aud != expected_aud:
        return None
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        return None
    if int(claims.get("exp", 0)) < int(time.time()) - 30:
        return None
    if claims.get("email") and claims.get("email_verified") in (False, "false"):
        return None
    return claims


# --------------------------------------------------------------------------- #
# FastAPI dependencies
# --------------------------------------------------------------------------- #
def _bearer(request: Request) -> str | None:
    raw = request.headers.get("authorization") or request.headers.get("Authorization")
    if not raw or not raw.lower().startswith("bearer "):
        return None
    return raw.split(" ", 1)[1].strip()


class Principal(dict):
    """dict-like current-user object: {id, role, email, full_name}."""

    @property
    def id(self) -> str:  # type: ignore[override]
        return str(self["id"])

    @property
    def role(self) -> str:
        return str(self["role"])


def get_principal(request: Request) -> Principal:
    from ..db import one

    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    claims = decode_token(token)
    if not claims or not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    row = one(
        "select id, role, email, full_name, status from profiles where id = ?",
        (str(claims["sub"]),),
    )
    if not row:
        raise HTTPException(status_code=401, detail="Account not found")
    if row["status"] != "active":
        raise HTTPException(status_code=403, detail="Account is suspended")
    normalized = {
        "id": str(row["id"]),
        "role": str(row["role"]),
        "email": row["email"],
        "full_name": row["full_name"],
        "status": row["status"],
    }
    return Principal(**normalized)


def require_roles(*roles: str):
    def _dep(principal: Principal = Depends(get_principal)) -> Principal:
        if principal["role"] not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Role '{principal['role']}' is not authorised for this resource",
            )
        return principal

    return _dep


sender_only = require_roles("sender")
transporter_only = require_roles("transporter")
admin_only = require_roles("admin")
any_role = require_roles("sender", "transporter", "admin")