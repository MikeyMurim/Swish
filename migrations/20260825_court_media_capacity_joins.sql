-- Court media, capacity, and player-join tracking for the redesigned
-- feed/map cards.

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS court_type TEXT NOT NULL DEFAULT 'outdoor',
  ADD COLUMN IF NOT EXISTS capacity INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courts_court_type_check'
  ) THEN
    ALTER TABLE public.courts
      ADD CONSTRAINT courts_court_type_check CHECK (court_type IN ('indoor', 'outdoor'));
  END IF;
END $$;

-- One row per person currently signed up for pickup at a court. A "join" is
-- a persistent RSVP the player removes themselves (same UX as favouriting a
-- court) rather than something that expires on a timer.
CREATE TABLE IF NOT EXISTS public.court_joins (
  court_id BIGINT NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (court_id, user_id)
);

ALTER TABLE public.court_joins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view court joins" ON public.court_joins;
CREATE POLICY "Anyone can view court joins" ON public.court_joins
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users manage their own court joins" ON public.court_joins;
CREATE POLICY "Users manage their own court joins" ON public.court_joins
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Extend the map RPC with the new columns plus a live joined-player count.
-- Postgres won't let CREATE OR REPLACE change a RETURNS TABLE(...) function's
-- output columns, so the old signature has to be dropped first.
DROP FUNCTION IF EXISTS public.get_courts_for_map();

CREATE FUNCTION public.get_courts_for_map()
RETURNS TABLE (
  id BIGINT,
  name TEXT,
  status TEXT,
  address TEXT,
  added_by TEXT,
  updated_at TIMESTAMPTZ,
  longitude DOUBLE PRECISION,
  latitude DOUBLE PRECISION,
  image_url TEXT,
  court_type TEXT,
  capacity INTEGER,
  joined_count BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT c.id, c.name, c.status, c.address, c.added_by, c.updated_at,
    (c.location -> 'coordinates' ->> 0)::DOUBLE PRECISION AS longitude,
    (c.location -> 'coordinates' ->> 1)::DOUBLE PRECISION AS latitude,
    c.image_url, c.court_type, c.capacity,
    COALESCE(j.joined_count, 0) AS joined_count
  FROM public.courts AS c
  LEFT JOIN (
    SELECT court_id, COUNT(*) AS joined_count
    FROM public.court_joins
    GROUP BY court_id
  ) AS j ON j.court_id = c.id
  WHERE jsonb_typeof(c.location) = 'object'
    AND jsonb_typeof(c.location -> 'coordinates') = 'array';
$$;

GRANT EXECUTE ON FUNCTION public.get_courts_for_map() TO anon, authenticated;

-- Storage bucket for court photos, uploaded from the Add Court form.
-- Public bucket: court images are shown on the public feed/map, same as the
-- courts table itself (RLS on courts already allows public SELECT).
INSERT INTO storage.buckets (id, name, public)
VALUES ('court-images', 'court-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access on court images" ON storage.objects;
CREATE POLICY "Public read access on court images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'court-images');

DROP POLICY IF EXISTS "Authenticated users can upload court images" ON storage.objects;
CREATE POLICY "Authenticated users can upload court images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'court-images');
