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
raises `ValueError` on import if either is missing. Optional `FRONTEND_URL`
(defaults to `http://localhost:3000`) sets the allowed CORS origin — see the
architecture section below.

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

`POST /checkin` writes `status`, `player_count` (when the caller supplies
one), and `updated_at` back onto the `courts` row after the proximity check
passes, alongside the `sessions` insert — so feed/map realtime subscriptions
pick up a check-in immediately. This report is **self-expiring**: the
frontend (`swish-frontend/app/courts.ts`, `effectiveStatusTone`/
`effectivePlayerCount`) treats `status`/`player_count` as stale once
`updated_at` is more than 90 minutes old and falls back to a neutral/unknown
display, rather than showing a check-in forever. There's no database-side
job clearing these columns — the 90-minute window is purely computed at
read time, so an old row still holds its last-reported values, just
unrendered as current. This requires the permissive `courts` UPDATE RLS
policy added in `migrations/20260826_expiring_checkin_status.sql`.

**Known gap:** the backend does not validate the caller's Supabase JWT — the
browser just passes a `user_id` in the POST body. Any check-in security work
should authenticate server-side and derive the user id from the token instead.

`backend/main.py` allows CORS from `FRONTEND_URL` (`backend/.env`, defaults
to `http://localhost:3000`) — without it, every `/checkin` call fails as a
generic browser network error (`TypeError: Failed to fetch`), not as a
403/validation error, because the preflight `OPTIONS` request has nowhere
to get an `Access-Control-Allow-Origin` header from. Set `FRONTEND_URL` to
match wherever the frontend is actually served if it's not the default dev
port.

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
3. For a status/check-in change, trace the whole path: `CourtDetailModal`
   (feed) or `CheckInModal` (map) → `app/checkin.ts` → FastAPI → RPC/session
   write → `courts` update (`status`/`player_count`/`updated_at`) → Realtime
   event → UI, remembering the 90-minute self-expiry (above) applies at
   render time, not in the database.
4. Run `npm run lint` and `npm run build` in `swish-frontend/` after frontend
   changes; exercise FastAPI's `/docs` or the endpoint manually after backend
   changes.
5. Update `docs/supabase-context.md` (and this file, if architecture changes)
   whenever the deployed schema, policies, or data flow materially change.

