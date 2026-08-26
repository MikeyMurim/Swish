# Supabase Database Context

This is a hand-maintained snapshot of the deployed Supabase schema, kept in
sync manually. Read it before changing any Supabase-facing query, auth
behavior, RLS policy, or data model. Update it whenever the deployed schema
or policies change materially.

Last reconciled: 2026-08-24 (deduplicated from a raw auto-export that had
repeated itself ~15x and included irrelevant Supabase-internal tables/enums
that added no value here).

## Tables

### `courts`

| Column | Type | Default |
| --- | --- | --- |
| `id` | INTEGER | `nextval('courts_id_seq')` |
| `name` | TEXT | — |
| `status` | TEXT | — |
| `location` | JSONB | — (GeoJSON `{ type: "Point", coordinates: [lng, lat] }`) |
| `updated_at` | TIMESTAMPTZ | `now()` |
| `address` | TEXT | — |
| `created_by` | UUID | `auth.uid()` |
| `created_by_email` | TEXT | — |
| `added_by` | UUID | — |
| `added_by_name` | TEXT | — |
| `created_at` | TIMESTAMPTZ | `timezone('utc', now())` |
| `image_url` | TEXT | — |
| `court_type` | TEXT | `'outdoor'` (CHECK `IN ('indoor', 'outdoor')`) |
| `capacity` | INTEGER | — |
| `is_free` | BOOLEAN | `true` |
| `price_amount` | NUMERIC(10,2) | — (CHECK `>= 0` when set; only meaningful when `is_free = false`) |
| `has_water` | BOOLEAN | `false` |
| `player_count` | INTEGER | — (CHECK `>= 0` when set) |

`image_url`/`court_type`/`capacity` added by
`migrations/20260825_court_media_capacity_joins.sql`; `is_free`/
`price_amount`/`has_water` added by `migrations/20260826_pricing_water.sql`;
`player_count` added by `migrations/20260826_expiring_checkin_status.sql`.
The first two were missing from this doc's last reconciliation — see those
migration files directly if anything here looks off.

`status` and `player_count` are a **self-reported, expiring** pair: the
`check_in_to_court()` RPC (see below) writes both plus `updated_at` on every
check-in, and the frontend (`swish-frontend/app/courts.ts`,
`effectiveStatusTone`/`effectivePlayerCount`) treats a report older than 90
minutes as stale and falls back to a neutral/unknown display — there is no
database-side job that clears these columns, the 90-minute window is purely
computed at read time.

Primary key: `id`

RLS policies:
- **Anyone can view courts** (SELECT) — `USING (true)`
- **Allow public read access on courts** (SELECT) — `USING (true)` (duplicate
  of the policy above; consider consolidating in Supabase)
- **Authenticated users can add courts** (INSERT) — `WITH CHECK (auth.uid() = created_by)`
- **Anyone can update court status** (UPDATE) — `FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true)`, originally added by
  `migrations/20260826_expiring_checkin_status.sql` (fully permissive then,
  including `anon`, since the old FastAPI backend's key didn't carry the
  caller's auth context) and scoped down to `authenticated` by
  `migrations/20260826_rpc_checkin.sql` once `check_in_to_court()` started
  calling it directly as the real signed-in caller. Still can't be scoped
  further to "only after a passed proximity check" — RLS has no visibility
  into that; the geofence gate lives entirely inside `check_in_to_court()`'s
  own procedural logic. An authenticated user calling `.update()` on
  `courts` directly, bypassing the RPC, remains a known gap.

Note: the app's insert code (`app/add-court/page.tsx`) does not set
`created_by` explicitly, relying on the column default `auth.uid()`.

Confirmed live via `information_schema` on 2026-08-24: `added_by` is
**UUID** with no default, not the TEXT column
`20260804_add_court_contributors.sql` tried to add — that migration's
`ADD COLUMN IF NOT EXISTS added_by TEXT ...` silently no-op'd because a
UUID column of the same name already existed. `add-court/page.tsx` never
sets `added_by` on insert either way, so it's `NULL` on every court
created through the current UI; the feed's "Added by \<email\>" display
always falls back to "the Swish community". `created_by_email TEXT`
also exists, unused, and looks like it may have been intended for this.
Not yet fixed — needs a product decision on which column is
authoritative before wiring it up.

### `sessions`

| Column | Type | Default |
| --- | --- | --- |
| `id` | INTEGER | `nextval('sessions_id_seq')` |
| `court_id` | INTEGER | — (FK → `courts.id`) |
| `user_id` | UUID | — |
| `created_at` | TIMESTAMPTZ | `now()` |

Primary key: `id`

RLS policies:
- **Allow authenticated insert on sessions** (INSERT) — `WITH CHECK (auth.uid() = user_id)`.
  Meaningfully enforced since `migrations/20260826_rpc_checkin.sql`: the
  `check_in_to_court()` RPC inserts using `auth.uid()` directly (never a
  client-supplied id), so this check can't be bypassed by a caller claiming
  to be someone else.
- **Allow public read access on sessions** (SELECT) — `USING (true)`

### `favourite_courts`

Defined in `migrations/20260804_map_and_favourites.sql`, not present in the
original auto-export this file was reconciled from (added later).

| Column | Type | Default |
| --- | --- | --- |
| `user_id` | UUID | — (FK → `auth.users.id`, cascade delete) |
| `court_id` | BIGINT | — (FK → `courts.id`, cascade delete) |
| `created_at` | TIMESTAMPTZ | `timezone('utc', now())` |

Primary key: `(user_id, court_id)`

RLS policy:
- **Users manage their own favourite courts** (ALL) — `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`

## Database functions (RPCs)

- `check_in_to_court(court_id integer, user_lat double precision, user_lng
  double precision, occupancy_status text, player_count integer DEFAULT
  NULL) RETURNS void` — defined in `migrations/20260826_rpc_checkin.sql`.
  Called directly from the browser via `supabase.rpc(...)`
  (`swish-frontend/app/checkin.ts`), replacing the old FastAPI `/checkin`
  endpoint entirely (that backend has been deleted — its only job was this
  check). `SECURITY INVOKER` (the default): derives the caller from
  `auth.uid()` (never a client-supplied `user_id`), calls
  `check_court_proximity()` and raises a `SW001`-coded exception if the
  caller is outside 50m, else inserts a `sessions` row and updates
  `courts.status`/`player_count`/`updated_at`. `player_count` is only
  overwritten when supplied — omitting it leaves the existing value alone.
  Raises `SW002` if somehow called with no authenticated caller (the
  frontend already checks sign-in before calling, so this is a backstop).

- `check_court_proximity(court_id bigint, user_lat double precision, user_lng double precision) RETURNS TABLE(id integer)`
  — used by `check_in_to_court()` above. Returns the court row
  when the caller is within 50m of it (falsy/empty otherwise). Defined in
  `migrations/20260824_fix_check_court_proximity.sql`, which replaces an
  earlier, broken version that was never tracked in this repo.

  That earlier version had three independent live bugs, found and fixed
  2026-08-24 by introspecting the deployed database directly (all three
  confirmed empirically, not just read from source):
  1. It called `ST_DWithin()` directly on `courts.location`, which is
     `jsonb`, not `geography` — every call errored with
     `function st_dwithin(jsonb, geography, integer) does not exist`.
     `sessions` had 0 rows ever, confirming check-in had never worked.
  2. It declared `RETURNS TABLE(id bigint)` but `courts.id` is `integer`
     — masked by bug 1 until that was fixed, then surfaced as
     `structure of query does not match function result type`.
  3. The old FastAPI backend called the RPC with a `court_id_input`
     parameter key, but the function's real parameter is named `court_id`
     — PostgREST returned 404 (function not found by that parameter set).
     Fixed alongside the SQL fix (moot now that backend is gone).

  Two of the two legacy courts also had `location` stored as a raw WKT
  string (`"POINT(lng lat)"`) instead of GeoJSON — leftover from before
  `20260804_map_and_favourites.sql`'s repair step, which had its own bug
  (see that migration file's history / the fix migration's comments) and
  silently repaired zero rows. `20260824_fix_check_court_proximity.sql`
  re-runs the repair correctly.

- `get_courts_for_map() RETURNS TABLE(id bigint, name text, status text, address text, added_by text, updated_at timestamptz, longitude double precision, latitude double precision)`
  — defined in `migrations/20260804_map_and_favourites.sql`. Extracts
  numeric `longitude`/`latitude` from `courts.location`'s GeoJSON for
  MapLibre. Its declared `added_by text` doesn't match the real column
  type (`uuid`) — Postgres implicitly casts it, so it doesn't error, but
  it's worth tightening if this function is ever edited again. Low
  impact today since `app/map.tsx` doesn't render `added_by`.

## PostGIS / extensions

`schema.sql` enables the `postgis` extension, but the deployed `courts.location`
column is JSONB storing a GeoJSON Point rather than a native `GEOGRAPHY`
column — see the note in `../Agents.md` about `schema.sql` being a stale
bootstrap sketch rather than a source of truth.

## Keeping this file current

This file is hand-maintained, not auto-generated, to avoid the duplication
problem it previously had. When the schema changes:

1. Export the current schema from the Supabase dashboard (Database →
   schema visualizer, or `SELECT` against `information_schema`).
2. Update the relevant table/policy section above — don't paste the raw
   export wholesale.
