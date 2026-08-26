
# Swish: Sydney Court Pulse 🏀

A real-time, location-aware dashboard to track the "pulse" of public basketball courts across Sydney. Swish allows players to see live court occupancy, verify active games, and check facility details before leaving the house.

## The Problem
Players often travel to public courts only to find them completely full, closed for maintenance, or dominated by private coaching. Swish solves the "cold start" problem of picking a court by crowdsourcing real-time geofenced data.

## Features
* **Live Spatial Mapping:** View all public courts in Sydney via an interactive MapLibre UI.
* **Geofenced Check-ins:** Users can only update court occupancy if their GPS coordinates are within a 50-meter radius of the physical court.
* **Real-time Sync:** When a user updates a court's status, the map updates instantly for all active clients.

## Tech Stack & Architecture
* **Frontend:** Next.js (App Router), Tailwind CSS, MapLibre GL JS
* **Database & Real-time:** Supabase (PostgreSQL + PostGIS + Supabase Realtime)
* **Monitoring:** Sentry

## Technical Trade-offs & Engineering Decisions
* **Why a Postgres RPC over a separate backend/Edge Functions?** The geofence check (proximity validation, session insert, court status update) is pure data-layer logic with no third-party calls or secrets that need to stay out of the database, so it runs as a single `SECURITY INVOKER` function (`check_in_to_court`) called directly from the browser via `supabase.rpc(...)`. That keeps everything on one platform — no separate service to host, deploy, or configure CORS for — while still fully server-enforcing the 50-metre radius and deriving the caller from their real Supabase session (`auth.uid()`), not a client-supplied id.
* **Why MapLibre over Google Maps?** MapLibre offers greater customisation for data-heavy vector overlays and avoids the aggressive pricing tiers of Google's API for a high-traffic geospatial MVP.
* **Why PostGIS?** Instead of fetching static lists of courts and calculating distance on the client side (which scales poorly), PostGIS allows for native spatial querying at the database level (e.g., `ST_DWithin`).
