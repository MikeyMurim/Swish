# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Swish is

Swish is a Sydney public-basketball-court discovery MVP: browse courts on a
feed or live map, report a court `live`/`full` when physically within 50
metres of it (enforced server-side, not trusted to the browser), join a
pick-up session, and favourite courts. It's a deliberately small codebase with
no automated tests.

## Repository layout

```
Swish/
├─ schema.sql                   # Early/bootstrap PostGIS schema — NOT the source of truth, see below
├─ migrations/                  # Hand-written SQL patches, applied manually in filename order
├─ docs/supabase-context.md     # Hand-maintained live Supabase schema/RLS reference — read before touching DB behavior
├─ backend/                     # FastAPI geofence-validation service (main.py, requirements.txt, .env)
└─ swish-frontend/              # Next.js 16 App Router client (see swish-frontend/CLAUDE.md)
```

`backend/venv`, `node_modules`, `swish-frontend/.next`, and `__pycache__` are
generated/gitignored — never treat them as source.

## Commands

Frontend, from `swish-frontend/`:

```powershell
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
npx tsc --noEmit   # type-check without invoking the build
```

Backend, from `backend/`:

```powershell
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

Backend needs `backend/.env` with `SUPABASE_URL` and `SUPABASE_KEY`; it
raises `ValueError` on import if either is missing.

There's no automated test suite and no migration tool. `migrations/*.sql`
must be applied by hand to the Supabase project's SQL editor, in filename
(date) order, before the frontend code that depends on them will work
correctly (e.g. `court_joins`, `image_url`/`court_type`/`capacity`, the
`get_courts_for_map` RPC signature).

## Architecture and data flow

```
Browser (Next.js + React)
  ├─ Supabase JS client ── Auth, court/favourite/join reads-writes, Realtime subscriptions
  │                         └─ Supabase PostgreSQL / PostGIS
  └─ POST /checkin ─────── FastAPI validates proximity via a Supabase RPC
                            and inserts a session record
```

The browser talks to Supabase directly for all ordinary product data (courts,
favourites, joins, profile metadata). FastAPI exists solely to validate a
check-in's geofence — it loads its own Supabase credentials from
`backend/.env`, calls the `check_court_proximity` RPC, and only then inserts
into `sessions`.

**Known gap:** `POST /checkin` receives `occupancy_status` but `backend/main.py`
never uses it — it doesn't update `courts.status` or `courts.updated_at`. A
check-in currently only writes a `sessions` row; the feed/map's realtime
"live"/"full" display will not reflect a check-in unless something else (a
trigger, or a future backend change) also updates `courts`. Implementing that
properly requires adding the `courts` update alongside a `courts` UPDATE RLS
policy.

**Known gap:** the backend does not validate the caller's Supabase JWT — the
browser just passes a `user_id` in the POST body. Any check-in security work
should authenticate server-side and derive the user id from the token instead.
There's also no CORS configuration, so a separately hosted frontend will need
one added before it can call the API.

## Database

Read [`docs/supabase-context.md`](docs/supabase-context.md) before changing
any Supabase-facing query, auth behavior, RLS policy, or data model — it's the
hand-maintained record of the *deployed* schema/policies and is kept current
manually. Update it whenever they change.

`schema.sql` is a stale bootstrap sketch (declares `courts.location` as native
`GEOGRAPHY(POINT)`, no `image_url`/`court_type`/`capacity`/`court_joins`, no
`check_court_proximity`). Don't apply it to an existing project; reconcile
against the live schema and `migrations/` instead.

Cross-cutting things worth knowing without opening every migration:

- `courts.location` is JSONB storing GeoJSON (`{ type: "Point", coordinates: [lng, lat] }`),
  not a native PostGIS geography column, despite `postgis` being enabled.
  Coordinate order is therefore inconsistent across layers: browser/MapLibre/
  Supabase reads use `[lng, lat]`; the FastAPI RPC takes separate `user_lat`,
  `user_lng`; PostGIS WKT is `POINT(lng lat)`. Keep this straight when editing
  any of these paths.
- `courts.added_by` is `UUID` with no default and is never set by
  `add-court/page.tsx`'s insert, so it's `NULL` on every court created through
  the current UI — the feed's contributor label always falls back to "the
  Swish community". See `docs/supabase-context.md` for the full history
  (there's also an unused `created_by_email TEXT` column that looks like it
  was meant for this).
- `get_courts_for_map()` is the only way the map gets numeric lat/lng (it
  extracts them from the JSONB) plus a live `joined_count` per court; anything
  that changes what the map needs to render has to go through this RPC, and
  because Postgres won't let `CREATE OR REPLACE` change a `RETURNS TABLE`
  signature, changing its columns means `DROP FUNCTION` first (see
  `migrations/20260825_court_media_capacity_joins.sql` for the pattern).
- Realtime must stay enabled/published for `courts` and `court_joins`, or the
  feed/map subscriptions silently stop updating.
- A public `court-images` storage bucket backs the Add Court photo upload;
  reads are public, inserts require an authenticated user.

## Cross-cutting change checklist

1. Read `docs/supabase-context.md` before any Supabase-facing change.
2. Preserve the coordinate-order convention (above) and check both the feed
   (`app/page.tsx`) and map (`app/map.tsx`) after touching court data shapes.
3. For a status/check-in change, trace the whole path: `CheckInModal` →
   `app/checkin.ts` → FastAPI → RPC/session write → (no `courts` update yet,
   see the known gap above) → Realtime event → UI.
4. Run `npm run lint` and `npm run build` in `swish-frontend/` after frontend
   changes; exercise FastAPI's `/docs` or the endpoint manually after backend
   changes.
5. Update `docs/supabase-context.md` (and this file, if architecture changes)
   whenever the deployed schema, policies, or data flow materially change.

