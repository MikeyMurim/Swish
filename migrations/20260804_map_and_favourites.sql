-- The deployed courts table stores its GeoJSON Point in a JSONB column.
-- Return numeric coordinates for MapLibre rather than making the client parse it.
CREATE OR REPLACE FUNCTION public.get_courts_for_map()
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  status TEXT,
  address TEXT,
  added_by TEXT,
  updated_at TIMESTAMPTZ,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT c.id, c.name, c.status, c.address, c.added_by, c.updated_at,
    (c.location -> 'coordinates' ->> 0)::DOUBLE PRECISION AS longitude,
    (c.location -> 'coordinates' ->> 1)::DOUBLE PRECISION AS latitude
  FROM public.courts AS c
  WHERE jsonb_typeof(c.location) = 'object'
    AND jsonb_typeof(c.location -> 'coordinates') = 'array';
$$;

GRANT EXECUTE ON FUNCTION public.get_courts_for_map() TO anon, authenticated;

-- Repair courts created by earlier frontend versions, which wrote a WKT string
-- into the JSONB column instead of a GeoJSON Point object.
WITH wkt_locations AS (
  SELECT id, regexp_match(
    location #>> '{}',
    '^POINT\\((-?[0-9.]+)\\s+(-?[0-9.]+)\\)$'
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

CREATE TABLE IF NOT EXISTS public.favourite_courts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  court_id BIGINT NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, court_id)
);

ALTER TABLE public.favourite_courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own favourite courts" ON public.favourite_courts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
