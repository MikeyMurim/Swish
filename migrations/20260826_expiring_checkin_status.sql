-- Self-reported headcount for check-ins, plus the courts UPDATE policy
-- needed for the backend to actually write status/player_count back to the
-- court (previously a known gap: /checkin only ever inserted a `sessions`
-- row). The frontend treats `updated_at` as the report's freshness
-- timestamp and expires it after 90 minutes -- see `effectiveStatusTone`/
-- `effectivePlayerCount` in swish-frontend/app/courts.ts. There is no
-- database-side expiry job; it's purely computed at read time.

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS player_count INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courts_player_count_check'
  ) THEN
    ALTER TABLE public.courts
      ADD CONSTRAINT courts_player_count_check CHECK (player_count IS NULL OR player_count >= 0);
  END IF;
END $$;

-- The backend's SUPABASE_KEY may not carry the caller's auth context (see
-- the "backend does not validate the caller's JWT" known gap in
-- ../CLAUDE.md), so this can't be scoped to `auth.uid()`. Proximity is
-- still enforced server-side by check_court_proximity() before this update
-- is ever issued.
DROP POLICY IF EXISTS "Anyone can update court status" ON public.courts;
CREATE POLICY "Anyone can update court status" ON public.courts
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
