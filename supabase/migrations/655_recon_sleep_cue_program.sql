-- 655 — Reconditioning Engine: Targeted Memory Reactivation (TMR) sleep-cue program.
--
-- DESIGN §2.4 (TMR). During deep NREM the brain replays and consolidates the
-- day's memories; re-presenting a cue that was present at encoding biases WHICH
-- memories get replayed. This table is the queue/ledger for pre-rendered,
-- low-volume audio loops of cues that are ALREADY INSTALLED — armed
-- trance_triggers or deployed pavlovian cues — for optional replay in deep sleep.
--
-- HARD HONESTY RULE (baked into the builder, recorded here for the reviewer):
-- TMR only REACTIVATES material the user has already installed while awake and
-- consenting. It NEVER introduces new content in sleep. cue_phrase must be copied
-- verbatim from an armed trance_trigger.phrase or a deployed pavlovian cue's
-- customization/name — never authored fresh. source_kind + source_ref preserve
-- that provenance. Sleep audio is the hardest opt-in: builder additionally requires
-- life_as_woman_settings.recon_sleep_enabled = TRUE (separate from recondition_enabled).
--
-- This is a passive/background mechanism: it files NO decree and carries NO
-- deadline or punishment. Playback is gated to deep-dominant sleep windows by the
-- client / a sleep-phase helper (see builder note if not yet wired).

CREATE TABLE IF NOT EXISTS recon_sleep_cue_program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  cue_phrase TEXT NOT NULL,                    -- verbatim, from an already-installed cue
  audio_path TEXT,                             -- storage path in the private 'audio' bucket
  source_kind TEXT NOT NULL CHECK (source_kind IN ('trance_trigger','pavlovian_cue')),
  source_ref UUID,                             -- id of the trance_trigger / pavlovian_pairing
  built_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','built','played','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE recon_sleep_cue_program ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_sleep_cue_self ON recon_sleep_cue_program FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_sleep_cue_service ON recon_sleep_cue_program FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Dedup backstop: at most one live (queued/built/played) program per
-- target + cue_phrase. Cancelled rows don't block a rebuild.
CREATE UNIQUE INDEX IF NOT EXISTS recon_sleep_cue_dedup_idx
  ON recon_sleep_cue_program(user_id, target_id, cue_phrase)
  WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS recon_sleep_cue_user_status_idx
  ON recon_sleep_cue_program(user_id, status);
