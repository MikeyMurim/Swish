# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Swish is

Swish is a Sydney public-basketball-court discovery MVP: browse courts on a
feed or live map, report a court `live`/`full` when physically within 50
metres of it (enforced server-side via a Postgres RPC, not trusted to the
browser), join a pick-up session, and favourite courts. It's a deliberately
small codebase with no automated tests, and talks to Supabase directly for
everything — there's no separate backend to host or deploy.

## Repository layout

```
Swish/
├─ schema.sql                   # Early/bootstrap PostGIS schema — NOT the source of truth, see below
├─ migrations/                  # Hand-written SQL patches, applied manually in filename order
├─ docs/supabase-context.md     # Hand-maintained live Supabase schema/RLS reference — read before touching DB behavior
└─ swish-frontend/              # Next.js 16 App Router client (see swish-frontend/CLAUDE.md)
```

`node_modules` and `swish-frontend/.next` are generated/gitignored — never
treat them as source.

## Commands

From `swish-frontend/`:

```powershell
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
npx tsc --noEmit   # type-check without invoking the build
```

There's no automated test suite and no migration tool. `migrations/*.sql`
must be applied by hand to the Supabase project's SQL editor, in filename
(date) order, before the frontend code that depends on them will work
correctly (e.g. `court_joins`, `image_url`/`court_type`/`capacity`, the
`get_courts_for_map` RPC signature, the `check_in_to_court` RPC).

## Architecture and data flow

```
Browser (Next.js + React)
  └─ Supabase JS client ── Auth, court/favourite/join/check-in reads-writes, Realtime subscriptions
                            └─ Supabase PostgreSQL / PostGIS
```

The browser talks to Supabase directly for everything, including check-in —
there used to be a small FastAPI service whose only job was validating a
check-in's geofence before writing to the database, but that logic now lives
entirely in the `check_in_to_court()` Postgres RPC
(`migrations/20260826_rpc_checkin.sql`), called directly via
`swish-frontend/app/checkin.ts`'s `supabase.rpc(...)`. `check_in_to_court`
runs `SECURITY INVOKER` (not `DEFINER` — Supabase's function-owner role is a
superuser, and superusers bypass RLS entirely, which would make the
`sessions`/`courts` RLS policies decorative), so it executes as the real
signed-in caller: it derives the user from `auth.uid()` (never trusting a
client-supplied id — this is what closed the previous JWT-spoofing gap),
calls the existing `check_court_proximity()` RPC, and on success inserts a
`sessions` row and updates `courts` in one transaction.

`check_in_to_court` writes `status`, `player_count` (when the caller
supplies one), and `updated_at` back onto the `courts` row after the
proximity check passes, alongside the `sessions` insert — so feed/map
realtime subscriptions pick up a check-in immediately. This report is
**self-expiring**: the frontend (`swish-frontend/app/courts.ts`,
`effectiveStatusTone`/`effectivePlayerCount`) treats `status`/`player_count`
as stale once `updated_at` is more than 90 minutes old and falls back to a
neutral/unknown display, rather than showing a check-in forever. There's no
database-side job clearing these columns — the 90-minute window is purely
computed at read time, so an old row still holds its last-reported values,
just unrendered as current. This requires the `courts` UPDATE RLS policy
(scoped to `authenticated`) from `migrations/20260826_rpc_checkin.sql`.

**Known gap:** RLS can't verify "this write came from `check_in_to_court`
after a passed proximity check" — it can only gate on role/columns. An
authenticated user can still call `.from('courts').update(...)` directly,
bypassing the geofence entirely. Closing that fully would mean revoking
`UPDATE` from `authenticated` and making the RPC `SECURITY DEFINER` instead
— a bigger tradeoff (RLS bypass inside the function) not taken here.

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
  Supabase reads use `[lng, lat]`; `check_court_proximity`/`check_in_to_court`
  take separate `user_lat`, `user_lng`; PostGIS WKT is `POINT(lng lat)`. Keep
  this straight when editing any of these paths.
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
   (feed) or `CheckInModal` (map) → `app/checkin.ts` → `check_in_to_court`
   RPC → `check_court_proximity` → `sessions` insert + `courts` update
   (`status`/`player_count`/`updated_at`) → Realtime event → UI, remembering
   the 90-minute self-expiry (above) applies at render time, not in the
   database.
4. Run `npm run lint` and `npm run build` in `swish-frontend/` after frontend
   changes; changes to `check_in_to_court` or `check_court_proximity` need
   manual verification against the Supabase project (there's no local
   Postgres to run them against).
5. Update `docs/supabase-context.md` (and this file, if architecture changes)
   whenever the deployed schema, policies, or data flow materially change.

