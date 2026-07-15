-- 667 — assoc_latency (IAT-lite) probe: close the same honesty-spine gap mig
-- 656 closed for belief_slider, this time for assoc_latency (DESIGN_RECONDITIONING
-- §5.2 — "the strongest implicit signal", an IAT-lite two-button reaction-time
-- probe: present the claim, tap AGREE/DISAGREE, record latency).
--
-- Today assoc_latency is a fully dead indicator_kind in the live product:
-- recon-target-author's INDICATOR_KINDS never offers it, no seed target uses
-- it, and its only instrument lives behind debug mode in ReconditioningPanel.
-- recon-measure explicitly skips it (needs a probe UI, not computable data),
-- so a target seeded with this indicator could never leave 'proposed' — "no
-- baseline, no claim" (§5.4) holds it hostage with no path forward, forever.
--
-- This adds the DB half of the same real-probe-as-an-ordinary-decree pattern
-- mig 656 shipped for belief_slider (see recon-program-orchestrator +
-- FocusMode/HandlerDecreeCard): widen the proof_type enum so an IAT-lite
-- decree can exist. recon_record_measurement / recon_record_measurement_and_advance
-- already accept arbitrary indicator_kind text — no new table, no new RPC.

ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none','belief_slider','assoc_latency'
  ));
