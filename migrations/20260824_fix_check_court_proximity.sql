-- Fixes two live bugs found while auditing the deployed database:
--
-- 1. check_court_proximity() called ST_DWithin() directly on
--    courts.location, which is jsonb, not geography. Every call errored
--    with "function st_dwithin(jsonb, geography, integer) does not
--    exist" -- meaning check-in has never successfully completed
--    (sessions had 0 rows). Fixed to extract lng/lat from the GeoJSON
--    coordinates the same way get_courts_for_map() already does.
--
-- 2. The WKT-to-GeoJSON repair in 20260804_map_and_favourites.sql had a
--    SQL string-escaping bug: '^POINT\\((...' is two literal backslashes
--    followed by an unescaped '(' under standard_conforming_strings (the
--    Postgres default), not an escaped paren, so the regex never
--    matched and the UPDATE silently repaired zero rows. This reruns
--    the repair with correctly escaped single backslashes.

-- Step 1: repair any remaining legacy WKT-string locations into GeoJSON.
WITH wkt_locations AS (
  SELECT id, regexp_match(
    location #>> '{}',
    '^POINT\((-?[0-9.]+)\s+(-?[0-9.]+)\)$'
  ) AS point
  FROM public.courts
  WHERE jsonb_typeof(location) = 'string'
)
UPDATE public.courts AS c
SET location = jsonb_build_object(
  'type', 'Point',
  'coordinates', jsonb_build_array((w.point)[1]::numeric, (w.point)[2]::numeric)
)
FROM wkt_locations AS w
WHERE c.id = w.id AND w.point IS NOT NULL;

-- Step 2: fix the geofence check to read GeoJSON coordinates instead of
-- assuming courts.location is a native geography value. Also corrects
-- RETURNS TABLE(id bigint) to integer, matching courts.id's real type
-- (integer) -- this mismatch was already present in the original
-- function but was masked by the ST_DWithin error firing first.
--
-- CREATE OR REPLACE can't change a function's return type, so the old
-- signature has to be dropped first.
DROP FUNCTION IF EXISTS public.check_court_proximity(bigint, double precision, double precision);

CREATE FUNCTION public.check_court_proximity(court_id bigint, user_lat double precision, user_lng double precision)
RETURNS TABLE(id integer)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id FROM courts c
  WHERE c.id = court_id
  AND jsonb_typeof(c.location) = 'object'
  AND jsonb_typeof(c.location -> 'coordinates') = 'array'
  AND ST_DWithin(
    ST_MakePoint(
      (c.location -> 'coordinates' ->> 0)::double precision,
      (c.location -> 'coordinates' ->> 1)::double precision
    )::geography,
    ST_MakePoint(user_lng, user_lat)::geography,
    50
  );
END;
$function$;
