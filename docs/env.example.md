# CARGOX — environment variables

Copy the relevant block to `.env` for local work, or paste into the Render / Vercel dashboards.
**Never commit real values.** Nothing here is exposed to the browser except the derived backend URL.

## backend/.env.example

```ini
# ---- core -------------------------------------------------------------
CARGOX_SECRET_KEY=change-me-to-a-64-char-random-string
CARGOX_TOKEN_TTL_HOURS=24
CARGOX_PBKDF2_ITERATIONS=120000

# ---- persistence ------------------------------------------------------
# Local (default): SQLite file next to the app
CARGOX_DB=./cargox.db
# Production: Supabase Postgres (pooler connection string)
# DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

# ---- CORS (only needed if the frontend calls the API directly) --------
CARGOX_CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app

# ---- rate limiting ----------------------------------------------------
CARGOX_RATE_LIMIT=1
CARGOX_RATE_LIMIT_AUTH=20
CARGOX_RATE_LIMIT_DEFAULT=600
CARGOX_RATE_LIMIT_WINDOW=60

# ---- simulation -------------------------------------------------------
CARGOX_DEFAULT_SEED=20260101

# ---- owner admin (the only predefined login) --------------------------
CARGOX_ADMIN_EMAILS=mehakdeep.s2006@gmail.com
CARGOX_ADMIN_PASSWORD=mehak@2006        # change before any public launch

# ---- Supabase (production auth + storage + realtime) ------------------
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-side only
SUPABASE_JWT_SECRET=<jwt-secret>
```

## frontend/.env.example

```ini
# Server-side rewrite target for /api/backend/*  (read by next.config.js)
CARGOX_API_URL=http://127.0.0.1:8000

# Optional: public flags for banners. No secrets here.
# NEXT_PUBLIC_CARGOX_ENV=pilot
```

## Supabase SQL settings (SQL editor)

```sql
-- provision an admin after inviting them in Authentication
select cargox_provision_admin('ops@your-domain', 'CARGOX Control Tower');

-- sanity check: there must never be a receiver or fpo profile
select role, count(*) from profiles group by role;
```

## Rotation checklist

| Secret | Rotate when | Impact |
|---|---|---|
| `CARGOX_SECRET_KEY` | quarterly or on staff change | all sessions invalidated |
| `SUPABASE_SERVICE_ROLE_KEY` | immediately on suspicion | backend must be redeployed |
| `SUPABASE_JWT_SECRET` | with project JWT rotation | all Supabase-issued tokens invalid |
| Demo passwords | before any public pilot | seed users re-created |
