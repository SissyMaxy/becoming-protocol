-- 690 — pre-workout hypno kind + legalize the timer proof the workout decrees use.
--
-- (a) New audio session kind: session_preworkout. A short primer that plays in
--     her ears right before a train-day session — sets the want before the body
--     has a chance to argue (the advisory exercise_cond_trance_listen rung made
--     mechanical). The enum value is added in its OWN migration so it is
--     committed before the template seed (691) references it: Postgres forbids
--     using a freshly-ADDed enum value in the same transaction that adds it
--     (mirrors the 667/668 pattern).
--
-- (b) handler_decrees.proof_type CHECK was last widened in 680 WITHOUT 'timer',
--     but body_program_ensure_decree (682) inserts proof_type='timer' — on any
--     database where 680's constraint is live, the train-day decree insert
--     violates it. DROP+ADD only WIDENS the allowed set (mirrors 656/667/679/680);
--     cannot violate any existing row, safe to re-run.

ALTER TYPE audio_session_kind ADD VALUE IF NOT EXISTS 'session_preworkout';

ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none','belief_slider','assoc_latency',
    'arousal_debrief','comfort_slider','timer'
  ));
