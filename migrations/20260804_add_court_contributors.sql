-- Apply this in Supabase before deploying the contributor label feature.
ALTER TABLE courts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS added_by TEXT DEFAULT (auth.jwt() ->> 'email');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'courts'
      AND policyname = 'Authenticated users can add courts'
  ) THEN
    CREATE POLICY "Authenticated users can add courts" ON courts
      FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;
