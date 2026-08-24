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

Primary key: `id`

RLS policies:
- **Anyone can view courts** (SELECT) — `USING (true)`
- **Allow public read access on courts** (SELECT) — `USING (true)` (duplicate
  of the policy above; consider consolidating in Supabase)
- **Authenticated users can add courts** (INSERT) — `WITH CHECK (auth.uid() = created_by)`

Note: the app's insert code (`app/add-court/page.tsx`) does not set
`created_by` explicitly, relying on the column default `auth.uid()`. The
`added_by`/`added_by_name` columns exist in the deployed schema but are not
currently populated by the frontend, which instead reads/writes `added_by`
as a **text** field via the `20260804_add_court_contributors.sql` migration.
This is a naming collision worth resolving: the live table appears to have
*two* different `added_by`-shaped things (a UUID column from one migration
path and a TEXT column from another). Reconcile which one is authoritative
before making further schema changes.

### `sessions`

| Column | Type | Default |
| --- | --- | --- |
| `id` | INTEGER | `nextval('sessions_id_seq')` |
| `court_id` | INTEGER | — (FK → `courts.id`) |
| `user_id` | UUID | — |
| `created_at` | TIMESTAMPTZ | `now()` |

Primary key: `id`

RLS policies:
- **Allow authenticated insert on sessions** (INSERT) — `WITH CHECK (auth.uid() = user_id)`
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

These are referenced by the frontend/backend but their definitions are not
tracked as source in this repo — they exist only in the deployed Supabase
project. Their bodies are defined in `migrations/` where available.

- `check_court_proximity(court_id_input, user_lat, user_lng)` — used by
  `backend/main.py`'s `/checkin` endpoint. Returns a falsy result when the
  caller is more than 50m from the court. **Definition not found in this
  repo's migrations** — if you have it, add it as a tracked migration.
- `get_courts_for_map()` — defined in
  `migrations/20260804_map_and_favourites.sql`. Extracts numeric
  `longitude`/`latitude` from `courts.location`'s GeoJSON for MapLibre.

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
