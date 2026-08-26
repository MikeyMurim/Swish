# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [`../CLAUDE.md`](../CLAUDE.md) for the full-repo overview, commands, and
database architecture. This file covers only what's specific to
`swish-frontend/`.

## This is NOT the Next.js you know

This project runs Next.js 16.2 / React 19. Breaking changes mean APIs,
conventions, and file structure may differ from your training data. Read the
relevant guide under `node_modules/next/dist/docs/` before writing or editing
frontend code, and heed deprecation notices.

## Commands

```powershell
npm install
npm run dev     # http://localhost:3000
npm run lint     # use npm.cmd if PowerShell's execution policy blocks npm
npx tsc --noEmit
npm run build
```

`npm run lint`'s known, expected warnings: the external Material Symbols
font `<link>` in `app/layout.tsx`, and the plain `<img>` avatar in
`app/profile/page.tsx`.

## Environment variables

`.env.local` (not committed):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase anon/publishable key>
```

All `NEXT_PUBLIC_*` values are browser-visible by design — never put a
service-role key in them.

## Routes and modules

All interactive screens are client components (`"use client"`) under the App
Router.

| Path/module | Responsibility |
| --- | --- |
| `app/page.tsx` | Home feed: fetches `courts`, subscribes to court + `court_joins` Realtime, applies the client-side distance filter, and renders each card (Join Pick-up / Favourite, click-through to `CourtDetailModal`). Join Pick-up and the modal's "I'm hooping" both gate on auth via `AuthGateModal`. |
| `app/map-view/page.tsx` | Server route shell rendering the client `Map` inside `Suspense`. |
| `app/map.tsx` | MapLibre map: markers, indoor/outdoor filter chips, search, selected-court detail panel with Join/Check-in/Favourite/Copy-address actions. Fetches via the `get_courts_for_map` RPC, not a plain `select`. |
| `app/add-court/page.tsx` | Auth-gated court creation: Nominatim address autocomplete, current-location option, draggable MapLibre pin, optional court photo upload to the `court-images` storage bucket, court type + capacity + pricing (free/paid + amount) + water-availability fields. |
| `app/login/page.tsx` | Email/password sign-in and sign-up (with display name + Guard/Forward "position"). New accounts confirm by email and land back on `/login` signed in. |
| `app/profile/page.tsx` | Authenticated profile editing (`display_name`, `avatar_url` via Supabase Auth user metadata), Recent Courts (derived from `sessions`), and Favourite Courts. Gated by `AuthGateModal` when signed out. |
| `app/AuthGateModal.tsx` | Modal overlay shown when a signed-out user hits an auth-gated route (`add-court`, `profile`) or attempts a gated feed action (Join Pick-up, "I'm hooping"). Closes via `router.back()` by default; overlay callers (the feed) pass their own `onClose` instead, since there's no navigation to undo. |
| `app/NavShell.tsx` | `SideNav` (desktop) and `BottomNav` (mobile); nav items, auth state, sign-out. |
| `app/CheckInModal.tsx` | Map's `live`/`full` check-in picker (map.tsx only — the feed uses `CourtDetailModal`'s headcount slider instead). |
| `app/CourtDetailModal.tsx` | Feed's court detail popup (opened by clicking a card or Join Pick-up): hero photo, pricing/water info, an embedded MapLibre preview at the court's coordinates, and "I'm hooping" → a headcount slider (capped at `capacity`) that check-ins with that count. |
| `app/CourtMedia.tsx` | Court photo/placeholder header used by feed cards and the map detail panel; renders the indoor/outdoor badge and a "Live Now" badge, using the expiry-aware `effectiveStatusTone`. |
| `app/checkin.ts` | Check-in client: requires an authenticated user and browser location, then calls the `check_in_to_court` Postgres RPC directly via `supabase.rpc(...)` — no separate backend. |
| `app/joins.ts` | `toggleCourtJoin` — insert/delete on `court_joins` (Join/Leave Pick-up). |
| `app/courts.ts` | Shared `Court` type plus `statusTone`/`isCourtFull` and their expiry-aware counterparts `effectiveStatusTone`/`effectivePlayerCount` (a `status`/`player_count` report older than 90 minutes — `isReportExpired` against `updated_at` — reads as neutral/unset). Coordinates are GeoJSON order: `[lng, lat]`. |
| `app/geo.ts` | Haversine straight-line distance in **miles** (`haversineMiles`), despite feed/map labels saying kilometres/mi inconsistently — check the label wording if you touch this. |
| `lib/supabase.ts` | Browser Supabase client from public env vars. |
| `lib/useAuth.ts` | Auth hook via `getSession` + `onAuthStateChange`. |
| `lib/useFavourites.ts` | Favourite-court ids + toggle, backed by `favourite_courts`. |
| `lib/geocode.ts` | Nominatim address search/geocode, biased to Australia/Sydney; `searchAddresses` (autocomplete, limit 5) and `geocodeAddress` (single best match). |

## Conventions

- `app/globals.css` defines the fixed dark "Pro-Run Athletic" theme as
  Tailwind 4 `@theme inline` tokens (`--color-surface`, `--color-primary`,
  etc.) plus spacing/type-scale tokens (`--spacing-stack-md`,
  `--text-headline-md`, ...). Reuse these semantic tokens
  (`bg-surface-container`, `text-primary`, `gap-stack-md`, ...) instead of
  introducing new colors, spacing, or font stacks. This is a single fixed
  theme, not a light/dark toggle.
- MapLibre markers (`app/map.tsx`, `app/add-court/page.tsx`) are imperative
  DOM objects outside React's tree — old markers must be explicitly removed
  before redrawing on data changes (see the `markersRef` cleanup in `map.tsx`).
  Both map screens use Carto dark raster tiles and default to Sydney
  (`[151.15, -33.8]`).
- Nominatim (`lib/geocode.ts`) is free but rate-limited to ~1 request/second;
  `add-court/page.tsx` debounces address input by 1s before calling it. Keep
  lookups intentional and move to a managed geocoder before scaling traffic.
- Coordinate order: UI/Supabase/MapLibre use `[lng, lat]`; the `check_in_to_court`
  RPC's params are separate `user_lat`/`user_lng` fields. Don't mix them up
  when touching either path.

