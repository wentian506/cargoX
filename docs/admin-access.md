# Admin access — who gets in, and how

CARGOX has exactly three roles, and Admin is the only one that is **never**
self-registered. There are **no demo accounts anywhere in the product** — the
only pre-existing login is the owner admin below.

## 1 · The owner admin (the only admin)

```
Email    : mehakdeep.s2006@gmail.com
Google   : Sign in with Google → lands on /admin   (no password needed)
Password : mehak@2006          → Email id with password → lands on /admin
Landing  : /admin — control tower
```

* configured in `backend/app/core/config.py` → `ADMIN_EMAILS`
  (env override: `CARGOX_ADMIN_EMAILS`) and `ADMIN_PASSWORD`
  (env override: `CARGOX_ADMIN_PASSWORD`),
* the seeder (`backend/app/seed.py`) creates this Admin profile on first boot,
  so a fresh database already knows the address,
* the **Admin** choice on the login screen shows the address for this
  deployment (read from `GET /api/auth/config → owner_admin_emails`),
* either door works: Google links `profiles.google_sub` on first use and
  resolves to the same `USR-OWNER` profile; the password door verifies the
  bcrypt hash seeded from `CARGOX_ADMIN_PASSWORD`,
* **change the password before a public launch**:
  `CARGOX_ADMIN_PASSWORD='something-long'` on the API service, then reseed or
  update the hash (`python3 -m app.cli set-admin-password` on a fresh database).

## 2 · Other admins

Add them to the same variable, comma separated, then redeploy the API:

```bash
CARGOX_ADMIN_EMAILS=mehakdeep.s2006@gmail.com,ops@yourcompany.com
```

They sign in with Google and land on `/admin`. If a person already has a
Sender/Transporter profile on that address, the first sign-in **promotes** it to
Admin (written to the audit log) — the address had to be configured by the owner
first, so this is provisioning, not public registration.

## 3 · Senders and transporters

They are **not** created by anyone else — each person creates their own account:

1. **Fill the details** at `/register` (name, mobile, state, district, village /
   company, language, email, password) → *Create account* → their dashboard.
2. **or use Google**: on `/register` press *Sign up with Google as Sender /
   Transporter* (the details already typed are saved with the account), or on
   `/login` pick the role → *Sign in with Google* → confirm the address Google
   returned → account created → dashboard.

Both paths return `redirect: /sender` or `redirect: /transporter`, and both
write `account.register` / `account.register_google` to the audit trail.

## 4 · What is always refused

* Creating an Admin account from `/register` → `400 Only Sender and Transporter
  accounts can be self-registered`.
* Any of the old published demo logins (`admin@cargox.in`, `harpal@…`,
  `balwinder@…`, `Admin@12345`, `Sender@12345`, `Transporter@12345`) →
  `401 Invalid email or password` — they do not exist in the database.
* Google sign-in with an unknown address before the identity is confirmed →
  `409 new_account_needs_role` (the UI turns this into the confirm step).
* A Google credential that fails signature / issuer / audience / expiry →
  `401`.
* Any Admin API call without an admin token → `401` / `403`.
* The seeded `register.party*@cargox.invalid` rows are **data owners only**
  (their `password_hash` is NULL), so they can never sign in.

## 5 · Verifying it in a minute

```bash
# 1. who is the configured owner? (and confirm there is no demo mode)
curl https://<api>/api/auth/config | python3 -m json.tool

# 2. owner signs in — password door
curl -X POST https://<api>/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"mehakdeep.s2006@gmail.com","password":"mehak@2006"}'
#    -> {"token":"…","redirect":"/admin", …}

# 3. owner signs in — Google door (in the browser)
#    https://<web>/login → Admin → Sign in with Google → /admin

# 4. a demo login is dead
curl -X POST https://<api>/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@cargox.in","password":"Admin@12345"}'   # -> 401

# 5. the audit trail shows the login
curl -H "Authorization: Bearer <admin-token>" https://<api>/api/admin/audit?page_size=5
```
