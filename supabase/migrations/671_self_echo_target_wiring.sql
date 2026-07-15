-- 671_self_echo_target_wiring.sql
--
-- DESIGN_RECONDITIONING_ENGINE §4 ("Cinematic Delivery Layer"): "the self-echo
-- layer is the centerpiece of movie brainwashing... mig 642 already builds the
-- pairing ledger; v1 wires its mommy_script_text to the day's focus target and
-- its loop to that target's anchor phrase." Mig 650 linked every other reused
-- mechanism (pavlovian_pairings, trance_triggers, hypno_trance_sessions,
-- narrative_reframings, audio_session_offers) to reconditioning_targets but
-- missed self_echo_sessions — this was the one unwired reuse row left in §4's
-- table. Same nullable-FK pattern as mig 650: existing rows unaffected, no
-- backfill, no behavior change until goon-voice-loop starts populating it.

ALTER TABLE self_echo_sessions
  ADD COLUMN IF NOT EXISTS recon_target_id UUID REFERENCES reconditioning_targets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS self_echo_sessions_recon_idx
  ON self_echo_sessions(recon_target_id) WHERE recon_target_id IS NOT NULL;
