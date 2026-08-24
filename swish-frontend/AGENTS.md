<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Swish project guide

Keep this file current whenever the project changes. It is the working handoff
for anyone maintaining Swish.

## What Swish is

Swish helps people find public basketball courts in Sydney and report their
current occupancy. It is a Next.js App Router frontend backed by Supabase
(Auth, PostgreSQL/PostGIS, and Realtime) with a FastAPI service for geofenced
check-ins.

## Repository layout

- `app/page.tsx` — court feed: fetches `courts`, subscribes to Supabase
  Realtime, applies the optional distance filter, and displays one court row
  at a time.
- `app/map.tsx` and `app/map-view/page.tsx` — MapLibre court map and selected
  court panel.
- `app/add-court/page.tsx` — authenticated court submission, address
  autocomplete, and draggable map pin.
- `app/login/page.tsx` — email/password sign-in and sign-up.
- `app/profile/page.tsx` — authenticated profile editing and favourite courts.
- `app/checkin.ts` and `app/CheckInModal.tsx` — check-in request and
  occupancy-status chooser.
- `app/courts.ts` — shared `Court` type and status helpers.
- `lib/supabase.ts` — browser Supabase client.
- `lib/geocode.ts` — Nominatim-based Sydney/Australia address search.
- `../backend/main.py` — FastAPI `POST /checkin` endpoint.
- `../schema.sql` — baseline PostGIS schema.
- `../migrations/` — SQL changes to apply to existing Supabase databases.

## Environment variables

Frontend (`.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_API_URL` (optional; defaults to `http://127.0.0.1:8000`)

Backend (`../backend/.env`):

- `SUPABASE_URL`
- `SUPABASE_KEY`

Never expose the backend key in frontend code.

## Court creation and address autocomplete

Only authenticated users can add courts. The Add Court page queries the public
Nominatim endpoint after the person pauses typing for one second, then shows
up to five address options. Selecting an option fills the address, moves the
marker, and stores its longitude/latitude. The debounce is intentional because
the public Nominatim service is rate-limited to roughly one request per second.

Court inserts contain the name, address, GeoJSON point
`{ type: "Point", coordinates: [lng, lat] }`, and initial `Empty` status. The
database sets `added_by` from the email in the authenticated Supabase JWT. The
feed renders this as `Added by <email>`; older records with no contributor
display `the Swish community`.

Before using contributor labels in an existing project, apply
`../migrations/20260804_add_court_contributors.sql`. It adds `address` and
`added_by`, plus the authenticated court-insert policy. `../schema.sql`
includes the equivalent fields for new databases.

## Check-in flow and current limitation

1. The frontend requires an authenticated user and browser location.
2. It posts the chosen `live` or `full` status and location to FastAPI.
3. FastAPI calls the expected PostGIS RPC `check_court_proximity` to enforce a
   50-metre geofence.
4. On success it inserts a `sessions` row.

The endpoint currently does **not** update `courts.status`, despite receiving
`occupancy_status`; the advertised realtime status update is therefore not yet
complete. Add the RPC definition, a `courts` update policy, and the backend
status update together when implementing that feature.

## Database and realtime expectations

The deployed `courts.location` field is JSONB containing a GeoJSON Point. Its
`coordinates` array uses `[longitude, latitude]` order. Keep this ordering
consistent: browser geolocation and FastAPI pass latitude/longitude separately.

The feed and map subscribe to `public.courts` changes. Enable that table for
Supabase Realtime in the deployed project. Court reading is public; insertion
requires the authenticated policy supplied by the contributor migration.

### Map coordinates

`app/map.tsx` calls the `get_courts_for_map` RPC, which extracts the GeoJSON
JSONB coordinate array into numeric `longitude` and `latitude` fields before
creating MapLibre pins. Apply
`../migrations/20260804_map_and_favourites.sql` for this function; without it
the map cannot render court pins. The migration also repairs existing WKT
strings created by earlier frontend versions into GeoJSON points.

### Profiles and favourite courts

Profile information uses Supabase Auth metadata, so no separate profiles table
is required. Users can edit `display_name` and `avatar_url` on `/profile`.
An avatar URL is displayed as the profile picture; the first letter of the
display name is used when no image has been set.

`favourite_courts` is a per-user join table created by
`20260804_map_and_favourites.sql`. The heart button on a feed card toggles a
favourite. The Profile page lists the user's saved courts and links each one
to the map. RLS restricts all favourite rows to their owner.

## Development checks

From this folder, run `npm run lint`. Use `npm.cmd run lint` if PowerShell's
execution policy blocks `npm`. Known warnings are the external Material
Symbols font link in `app/layout.tsx`, and the plain external avatar `<img>`
in `app/profile/page.tsx`. Also run `npx.cmd tsc --noEmit` to type-check
without fetching external font assets.
