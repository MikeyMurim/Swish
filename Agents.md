# Swish contributor guide

## What this project is

Swish is a Sydney public-basketball-court discovery MVP. It answers a simple
question for players: *is there space at a court before I leave home?*

The product has three main capabilities:

- Publicly browse courts in a card feed or on a live map.
- Sign in with email and password, then add a court by searching an address,
  using the browser location, or dragging a map pin.
- Report a court as `live` (active) or `full` when physically within 50 metres
  of it. The location check belongs to the backend/database rather than being
  trusted to the browser.

This is an MVP with a deliberately small codebase. The root `README.md`
describes the original architecture and goals; this file describes the code as
it exists now.

## Repository layout

```
Swish/
+-- Agents.md                    # This guide and project-wide guardrails
+-- README.md                    # Product overview and initial technical choices
+-- schema.sql                   # Early/bootstrap PostGIS schema (not a migration system)
+-- docs/
|   `-- supabase-context.md      # Exported live Supabase schema/RLS reference
+-- backend/
|   +-- main.py                  # FastAPI geofence-validation service
|   +-- .env                     # Local backend credentials; never commit/share
|   `-- venv/                    # Local Python virtual environment; generated
`-- swish-frontend/              # Next.js 16 App Router client
    +-- app/                     # Pages and UI components
    +-- lib/                     # Supabase, auth, and geocoding helpers
    +-- public/                  # Stock Next.js SVG assets (currently unused)
    `-- package.json             # Frontend scripts and dependencies
```

There are no committed migrations or automated tests at present. Do not treat
`backend/venv`, `node_modules`, or `__pycache__` as source files.

## Architecture and data flow

```
Browser (Next.js + React)
  ├─ Supabase JS client ── Auth, court reads/inserts, Realtime subscriptions
  │                         └─ Supabase PostgreSQL / PostGIS
  └─ POST /checkin ─────── FastAPI validates proximity via a Supabase RPC
                            and inserts a session record
```

The browser uses Supabase directly for ordinary product data. FastAPI is only
the validation layer for a check-in. It loads its own Supabase credentials from
`backend/.env` and calls the database function `check_court_proximity` before
inserting into `sessions`.

The database function itself is not defined in this repository, so it must
exist in the deployed Supabase project for check-ins to work. Its expected
inputs are `court_id_input`, `user_lat`, and `user_lng`; a falsy response means
the caller is farther than 50 m from the court.

## Frontend

`swish-frontend` uses Next.js 16.2, React 19, TypeScript, Tailwind CSS 4,
MapLibre GL, and `@supabase/supabase-js`. It uses the App Router, but all
interactive product screens are client components (`"use client"`).

### Routes and UI modules

| Path/module | Responsibility |
| --- | --- |
| `app/page.tsx` | Home feed. Fetches `courts`, subscribes to all court Realtime events, asks for browser location, and offers a client-side distance filter. |
| `app/map-view/page.tsx` | Server route shell that renders the client `Map` inside `Suspense`. |
| `app/map.tsx` | Creates the MapLibre map, loads and redraws court markers, subscribes to Realtime court changes, shows a selected court panel, and begins check-in. |
| `app/add-court/page.tsx` | Auth-protected court-creation form with Nominatim address lookup, current-location option, and draggable MapLibre marker. Inserts into `courts` directly. |
| `app/login/page.tsx` | Email/password sign-in and sign-up. New accounts use Supabase email confirmation and return to `/login`. |
| `app/NavShell.tsx` | Desktop sidebar and mobile bottom navigation; displays auth state and signs out. |
| `app/CheckInModal.tsx` | Chooses the report status (`live` or `full`) and confirms the request. |
| `app/checkin.ts` | Shared check-in client. Requires an authenticated Supabase user and browser location, then calls FastAPI. |
| `app/courts.ts` | `Court` UI type and status helpers. Court coordinates are GeoJSON order: `[longitude, latitude]`. |
| `app/geo.ts` | Haversine straight-line distance helper (despite the UI labels being kilometres). `directionsUrl` is presently unused. |
| `app/Icon.tsx` | Thin wrapper for Material Symbols icons. |
| `lib/supabase.ts` | Browser Supabase client, created from public environment variables. |
| `lib/useAuth.ts` | Auth hook using `getSession` and `onAuthStateChange`. |
| `lib/geocode.ts` | Browser-side request to OpenStreetMap Nominatim, biased toward Australia/Sydney and limited to one result. |

### UI and map conventions

- `app/layout.tsx` loads Oswald and Lexend with `next/font`; Material Symbols
  are loaded from Google Fonts.
- `app/globals.css` owns the dark "Pro-Run Athletic" design tokens and the
  global map/filter/icon helpers. Reuse its semantic Tailwind tokens such as
  `bg-surface-container` and `text-primary` instead of introducing unrelated
  colours or font stacks.
- Maps use Carto dark raster tiles and default to Sydney. MapLibre markers are
  imperative objects, so `app/map.tsx` removes old markers before rerendering.
- Nominatim is a free service with a roughly one-request-per-second policy.
  Keep address lookups intentional and move to a managed geocoder before
  scaling traffic.

### Frontend environment variables

Create `swish-frontend/.env.local` locally (it should not be committed):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase anon/publishable key>
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

`NEXT_PUBLIC_API_URL` defaults to `http://127.0.0.1:8000`. Configure it for a
deployed API in production. The `NEXT_PUBLIC_*` values are intentionally
browser-visible; never put a service-role key in them.

### Running and checking the frontend

From `swish-frontend`:

```powershell
npm install
npm run dev
npm run lint
npm run build
```

Use the relevant Next.js 16 documentation under
`swish-frontend/node_modules/next/dist/docs/` before changing frontend code.
This project's local `swish-frontend/AGENTS.md` makes that mandatory because
this version can differ from older Next.js conventions.

## Backend

`backend/main.py` is a compact FastAPI application. On import it loads
`SUPABASE_URL` and `SUPABASE_KEY` from `backend/.env`, creates a Supabase
Python client, and fails fast if either variable is absent.

`POST /checkin` accepts:

```json
{
  "court_id": 123,
  "user_id": "Supabase-user-UUID",
  "user_lat": -33.87,
  "user_lng": 151.21,
  "occupancy_status": "live"
}
```

It calls `check_court_proximity`, returns HTTP 403 when no nearby court is
returned, then inserts `{ court_id, user_id }` into `sessions` and returns a
success message.

Important current limitation: `occupancy_status` is validated by Pydantic only
as an arbitrary string and is **not used** by `main.py`; the endpoint does not
update `courts.status` or `courts.updated_at`. Consequently, the current
Realtime subscriptions will only reflect a check-in if another database
mechanism (for example, a trigger) changes `courts`.

Run it from `backend` using the existing virtual environment:

```powershell
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

The application currently has no explicit CORS configuration. A separately
hosted frontend will need an appropriate, restrictive CORS policy before it can
call the API from a browser.

## Supabase and database

Read `docs/supabase-context.md` **before modifying any database query,
authentication, API behavior, RLS policy, or data model**. It is the project
reference for the deployed schema and policies, even though the exported file
contains repeated sections and should be treated as a snapshot rather than a
migration source.

The observed deployed `courts` schema includes `id`, `name`, `status`,
`location`, `updated_at`, `address`, and creator/audit columns. Its documented
RLS allows public reads and allows authenticated inserts when
`auth.uid() = created_by`. The UI expects `location` returned in GeoJSON-like
form (`{ coordinates: [lng, lat] }`) and inserts location as PostGIS WKT:
`POINT(lng lat)`.

The observed `sessions` table holds a court reference, a user ID, and a
timestamp. Its documented policy permits authenticated users to insert rows
only for themselves and permits public reads.

`schema.sql` is an older bootstrap sketch: it declares `courts.location` as
`GEOGRAPHY(POINT)`, enables PostGIS/RLS, and creates minimal select/insert
policies. It does not contain the full currently documented columns, the
`check_court_proximity` function, an update policy, an insert policy for
`courts`, or realtime publication setup. Do not apply it blindly to an existing
project; reconcile changes against the live schema context and use versioned
migrations for future database work.

### Data and security rules

- Coordinate order differs by API: browser/MapLibre/Supabase display data use
  `[lng, lat]`; FastAPI RPC parameters are separate `user_lat`, then `user_lng`;
  PostGIS WKT is `POINT(lng lat)`.
- Do not rely on a browser-only geofence. The database RPC is the intended
  enforcement point.
- The browser passes a `user_id` to FastAPI. As written, the API does not
  validate the caller's Supabase JWT, so any work on check-in security should
  authenticate the request server-side and derive the user ID from its token.
- Keep backend keys and `.env` files out of source control and logs. A
  service-role key, if used, belongs only in the backend.
- Supabase Realtime must be enabled/publication-configured for `courts`, or the
  feed/map subscriptions will not receive updates.

## Change checklist

1. Read `docs/supabase-context.md` before touching Supabase-facing behavior.
2. For frontend work, read the applicable local Next.js 16 documentation first.
3. Preserve the coordinate-order convention and check both map and feed flows.
4. For a status/check-in change, trace the whole path: modal -> `checkin.ts` ->
   FastAPI -> RPC/session write -> database update/trigger -> Realtime event -> UI.
5. Run `npm run lint` and `npm run build` after frontend changes. Exercise
   FastAPI's `/docs` or the endpoint manually after backend changes.
6. Update this guide and `docs/supabase-context.md` when architecture or the
   deployed schema/policies materially change.
