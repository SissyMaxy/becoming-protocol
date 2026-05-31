-- 587 — Add 'voice' to handler_decrees.proof_type and
-- handler_outreach_queue.evidence_kind CHECK constraints.
--
-- BUG (audit #3): ~30 conditioning/disclosure ladder generators mint
-- voice-rung decrees and outreach with proof_type='voice' / evidence_kind='voice'
-- (the value appears 207× across migration seeds + eval functions), but neither
-- CHECK constraint accepted it:
--   - handler_decrees_proof_type_check   (last set by mig 426): no 'voice'
--   - handler_outreach_queue_evidence_kind_check (last set by mig 424): no 'voice'
-- Result: those inserts were rejected. Some eval functions swallow the error
-- (and silently stall the ladder); body_receiving_eval propagates and aborts the
-- whole evaluation; mig 457's chain-assertion has been failing the entire time.
--
-- This re-asserts both constraints with 'voice' added. DROP ... IF EXISTS + ADD
-- is idempotent and only WIDENS the allowed set, so it cannot violate any
-- existing row. If a prior ad-hoc ALTER had already added 'voice' in the live DB
-- (schema drift suspected — a MEMORY note dated 2026-05-15 claims it was added
-- but no migration file does), this brings the migration history back in sync
-- with the live schema and is otherwise a no-op.

-- ── handler_decrees.proof_type ──────────────────────────────────────
ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none'
  ));

-- ── handler_outreach_queue.evidence_kind ────────────────────────────
ALTER TABLE handler_outreach_queue
  DROP CONSTRAINT IF EXISTS handler_outreach_queue_evidence_kind_check;
ALTER TABLE handler_outreach_queue
  ADD CONSTRAINT handler_outreach_queue_evidence_kind_check
  CHECK (evidence_kind IS NULL OR evidence_kind IN (
    'photo','video','audio','voice','any','none'
  ));
