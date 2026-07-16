-- 682 - Efficacy engine Phase 2: steering state (mechanism rotation).
--
-- The 2-D (engagement × efficacy) steering policy escalates intensity AND requests
-- a mechanism SWITCH when a target is engaged but not measurably moving. The switch
-- is persisted here as an incrementing rotation counter on the program; the mechanism
-- selection (which concrete mechanism to use next) consumes it in Phase 3. Intensity
-- itself already lives on reconditioning_programs.intensity — no new column needed for it.
--
-- Additive only. No user UUIDs / private data in schema history.

BEGIN;

ALTER TABLE public.reconditioning_programs
  ADD COLUMN IF NOT EXISTS mechanism_rotation smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.reconditioning_programs.mechanism_rotation IS
  'Efficacy steering (mig 682): incremented each time the 2-D policy requests a '
  'mechanism switch (engaged but flat/wrong efficacy). Phase-3 mechanism selection '
  'rotates the delivered mechanism by this counter.';

COMMIT;
