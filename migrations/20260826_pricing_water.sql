-- Court pricing (free/paid + amount) and water availability, surfaced in
-- the feed's court detail modal and settable from the Add Court form.

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS has_water BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courts_price_amount_check'
  ) THEN
    ALTER TABLE public.courts
      ADD CONSTRAINT courts_price_amount_check CHECK (price_amount IS NULL OR price_amount >= 0);
  END IF;
END $$;
