-- Replaces the FastAPI /checkin endpoint (backend/main.py, now removed)
-- with a single Postgres RPC callable directly from the browser via
-- supabase-js, so check-in no longer needs a separately hosted backend.
-- Unlike the old endpoint, this derives the caller from auth.uid() instead
-- of trusting a client-supplied user_id -- closes the spoofing gap
-- previously noted in ../CLAUDE.md.
--
-- SECURITY INVOKER (the default, declared explicitly) so the function's
-- INSERT/UPDATE run as the calling `authenticated` role and existing RLS
-- policies apply for real, rather than being bypassed the way a
-- SECURITY DEFINER function would be (Supabase's function-owner role is a
-- superuser, and superusers bypass RLS entirely).
CREATE OR REPLACE FUNCTION public.check_in_to_court(
  court_id integer,
  user_lat double precision,
  user_lng double precision,
  occupancy_status text,
  player_count integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  nearby_court_id integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Sign in to check in.' USING ERRCODE = 'SW002';
  END IF;

  -- Reuse the existing proximity RPC rather than duplicating its logic.
  SELECT p.id INTO nearby_court_id
  FROM public.check_court_proximity(check_in_to_court.court_id, user_lat, user_lng) AS p
  LIMIT 1;

  IF nearby_court_id IS NULL THEN
    -- Custom SQLSTATE so swish-frontend/app/checkin.ts can distinguish this
    -- from any other failure via error.code, the way it used to check for
    -- HTTP 403 specifically.
    RAISE EXCEPTION 'You are not within 50 meters of the court.' USING ERRCODE = 'SW001';
  END IF;

  INSERT INTO public.sessions (court_id, user_id)
  VALUES (check_in_to_court.court_id, caller_id);

  -- Mirrors the old backend's behavior: player_count is only overwritten
  -- when the caller supplies one, otherwise the existing value is kept.
  UPDATE public.courts
  SET status = occupancy_status,
      player_count = COALESCE(check_in_to_court.player_count, courts.player_count),
      updated_at = now()
  WHERE id = check_in_to_court.court_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_in_to_court(
  integer, double precision, double precision, text, integer
) TO authenticated;

-- Previously USING (true) WITH CHECK (true) with no TO clause -- open to
-- anon too -- because the old FastAPI backend's key might not have carried
-- the caller's auth context. check_in_to_court runs SECURITY INVOKER as the
-- real authenticated caller now, so this can be scoped down. Note this
-- still can't be scoped further to "only after a passed proximity check" --
-- RLS has no visibility into that; the geofence gate lives entirely inside
-- check_in_to_court's own procedural logic, same as before. An
-- authenticated user calling .update() on courts directly, bypassing the
-- RPC, remains a known pre-existing gap -- not introduced or fully closed
-- by this change, just narrowed from "anyone" to "signed-in users."
DROP POLICY IF EXISTS "Anyone can update court status" ON public.courts;
CREATE POLICY "Anyone can update court status" ON public.courts
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
