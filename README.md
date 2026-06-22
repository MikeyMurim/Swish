
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
* **Backend Validation Layer:** FastAPI (Python)
* **Database & Real-time:** Supabase (PostgreSQL + PostGIS + Supabase Realtime)
* **Monitoring:** Sentry

## Technical Trade-offs & Engineering Decisions
* **Why FastAPI over Edge Functions?** To maintain a strict separation of concerns. Offloading the geospatial validation (Haversine formula/PostGIS proximity checks) to a dedicated Python microservice ensures the Next.js frontend remains purely presentational.
* **Why MapLibre over Google Maps?** MapLibre offers greater customisation for data-heavy vector overlays and avoids the aggressive pricing tiers of Google's API for a high-traffic geospatial MVP.
* **Why PostGIS?** Instead of fetching static lists of courts and calculating distance on the client side (which scales poorly), PostGIS allows for native spatial querying at the database level (e.g., `ST_DWithin`).
