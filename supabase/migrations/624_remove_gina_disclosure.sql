-- 624 — Remove all Gina disclosure/notification mechanisms.
--
-- OPERATOR DIRECTIVE 2026-07-01: "Remove Gina notification mechanisms. We
-- never want to disclose anything to Gina." The system must never disclose /
-- communicate anything to Gina, and must never pressure, schedule, rehearse,
-- or penalize the user toward disclosing to Gina.
--
-- What this migration does:
--   1. Cancels every pending disclosure-ladder row / event / draft /
--      punishment / decree / outreach that pushes disclosure toward Gina.
--   2. Unschedules the pg_cron jobs that drive the disclosure + seed +
--      cuckqueen-direction engines.
--   3. Drops the generator functions (gina_disclosure_eval, gina_seed_eval,
--      gina_seed_debrief_reminder_eval, cuckqueen_direction_eval) and the
--      advancement/chain triggers.
--   4. Recreates the hookup-attestation trigger (mig 540) WITHOUT its
--      "Gina doesn't know yet" disclosure-pressure outreach.
--   5. Adds defensive BEFORE INSERT triggers that block any new rows into
--      gina_disclosure_schedule / gina_disclosure_events.
--
-- Tables are NOT dropped — historical rows stay for the record; the tables
-- are marked deprecated via COMMENT. Passive Gina modeling (arc stage,
-- vibe_captures, is_gina_home_today privacy gating, wardrobe gina_seed
-- aesthetics) is intentionally untouched — those PROTECT against exposure
-- or are read-only context.

-- ============================================================
-- 1. Cancel pending gina_disclosure_schedule rows (mig 207 ladder)
-- ============================================================
ALTER TABLE gina_disclosure_schedule DROP CONSTRAINT IF EXISTS gina_disclosure_schedule_status_check;
ALTER TABLE gina_disclosure_schedule ADD CONSTRAINT gina_disclosure_schedule_status_check
  CHECK (status IN ('scheduled', 'disclosed', 'gina_accepted', 'gina_rejected', 'gina_deferred', 'missed', 'cancelled'));

UPDATE gina_disclosure_schedule
SET status = 'cancelled',
    escalation_details = COALESCE(escalation_details, '{}'::jsonb)
      || jsonb_build_object('cancelled_reason', 'policy: no disclosure to Gina 2026-07-01')
WHERE status = 'scheduled';

-- Disable + permanently pause the mig 449 pressure-cooker settings
UPDATE gina_disclosure_settings
SET enabled = FALSE,
    paused_until = 'infinity'::timestamptz,
    pause_reason = 'policy: no disclosure to Gina 2026-07-01',
    updated_at = now();

-- Cancel pending mig 449 events (extend CHECK to allow 'cancelled')
ALTER TABLE gina_disclosure_events DROP CONSTRAINT IF EXISTS gina_disclosure_events_status_check;
ALTER TABLE gina_disclosure_events ADD CONSTRAINT gina_disclosure_events_status_check
  CHECK (status IN ('pending','fulfilled','missed','paused','cancelled'));

UPDATE gina_disclosure_events SET status = 'cancelled', updated_at = now() WHERE status = 'pending';

-- ============================================================
-- 2. Cancel disclosure-bearing decrees / outreach / punishments
-- ============================================================
-- Decrees from the disclosure + cuckqueen engines, plus anything active whose
-- edict is disclosure-to-Gina by text (same pattern constraint-guard uses).
UPDATE handler_decrees
SET status = 'cancelled',
    reasoning = 'policy: no disclosure to Gina 2026-07-01'
WHERE status = 'active'
  AND (
    trigger_source IN ('gina_disclosure_pressure', 'cuckqueen_direction')
    OR edict ~* '\m(tell|telling|told|disclose|disclosing|confess|show|reveal)\M[^.]{0,30}\mgina\M'
    OR edict ~* '\mgina\M[^.]{0,30}\m(finds? out|about (you|the|your)|sees? you|knows?|come out)'
  );

-- Undelivered outreach from the disclosure / seed / cuckqueen / attestation-
-- gina-pressure engines: expire it so no dispatcher ever surfaces it.
UPDATE handler_outreach_queue
SET expires_at = now()
WHERE (expires_at IS NULL OR expires_at > now())
  AND (
    trigger_reason LIKE 'gina_disclosure%'
    OR trigger_reason LIKE 'gina_seed%'
    OR trigger_reason LIKE 'cuckqueen%'
    OR trigger_reason LIKE 'hookup_attestation:gina_pressure%'
    OR source = 'gina_disclosure_engine'
    OR kind IN ('gina_disclosure_decree')
  );

-- gina_confession punishments (disclosure ladder enforcement). Extend the
-- status CHECK to allow 'cancelled', then cancel everything not completed.
ALTER TABLE punishment_queue DROP CONSTRAINT IF EXISTS punishment_queue_status_check;
ALTER TABLE punishment_queue ADD CONSTRAINT punishment_queue_status_check
  CHECK (status IN ('queued', 'active', 'completed', 'dodged', 'escalated', 'cancelled'));

UPDATE punishment_queue
SET status = 'cancelled',
    completion_evidence = COALESCE(completion_evidence, '{}'::jsonb)
      || jsonb_build_object('cancelled_reason', 'policy: no disclosure to Gina 2026-07-01')
WHERE punishment_type = 'gina_confession'
  AND status IN ('queued', 'active', 'escalated', 'dodged');

-- Pending (unanswered) disclosure-rehearsal confession prompts: delete the
-- generated prompts outright — leaving them pending would let the miss-
-- detector penalize a task the policy just abolished. Answered rows (user
-- content) are kept.
DELETE FROM confession_queue
WHERE category = 'disclosure_rehearsal'
  AND confessed_at IS NULL
  AND response_text IS NULL
  AND response_audio_url IS NULL;

-- Pre-written Gina-facing disclosure drafts: expire anything unsent.
UPDATE disclosure_drafts SET status = 'expired' WHERE status IN ('queued', 'edited');

-- Warmup moves exist solely to precede scheduled disclosures — cancel.
UPDATE gina_warmup_queue SET status = 'cancelled' WHERE status = 'scheduled';

-- Queued playbook moves that open/pace disclosure toward Gina.
UPDATE gina_playbook
SET status = 'cancelled',
    outcome_notes = 'policy: no disclosure to Gina 2026-07-01'
WHERE status = 'queued'
  AND (move_kind IN ('disclosure_opener', 'probe', 'test_water', 'soft_bring_up')
       OR scheduled_by = 'disclosure_prep'
       OR source_disclosure_id IS NOT NULL);

-- Pending seed plantings (mig 451/549 — "get Gina slowly to become aware"):
-- these pace gradual disclosure, so pending ones are expired. History stays.
UPDATE gina_seed_plantings SET status = 'expired' WHERE status = 'pending';

-- Cuckqueen-direction events require verbal Gina involvement gated on
-- disclosure rungs — cancel pending.
ALTER TABLE cuckqueen_direction_events DROP CONSTRAINT IF EXISTS cuckqueen_direction_events_status_check;
ALTER TABLE cuckqueen_direction_events ADD CONSTRAINT cuckqueen_direction_events_status_check
  CHECK (status IN ('pending','fulfilled','missed','skipped','cancelled'));
UPDATE cuckqueen_direction_events SET status = 'cancelled' WHERE status = 'pending';

-- Coming-out letters where Gina is the recipient: withdraw unsent drafts.
UPDATE coming_out_letters
SET status = 'withdrawn'
WHERE recipient_name ILIKE '%gina%'
  AND status IN ('drafted', 'edited', 'ready');

-- Pending commitments that demand a transition-related interaction with /
-- disclosure to Gina (phase-4 auto-mandate and any text-matched stragglers).
UPDATE handler_commitments
SET status = 'cancelled',
    fulfillment_note = 'policy: no disclosure to Gina 2026-07-01'
WHERE status = 'pending'
  AND (
    what = 'One concrete interaction with Gina related to the transition (message, photo, conversation)'
    OR what ~* '\m(tell|telling|told|disclose|disclosing|confess|show|reveal)\M[^.]{0,30}\mgina\M'
    OR what ~* '\mgina\M[^.]{0,30}\m(finds? out|about (you|the|your)|sees? you|knows?|come out)'
  );

-- Body opt-in ladder rung "Tell Gina" (mig 431): abandon any live opt-in,
-- remove it as a prerequisite, and tombstone the catalog row (FK ON DELETE
-- RESTRICT prevents a hard delete while historical opt-ins reference it).
UPDATE body_opt_ins
SET status = 'abandoned',
    abandon_reason = 'policy: no disclosure to Gina 2026-07-01'
WHERE slug = 't5_disclose_to_gina'
  AND status IN ('committed', 'in_progress', 'blocked');

UPDATE body_opt_in_ladder
SET prerequisite_slugs = array_remove(prerequisite_slugs, 't5_disclose_to_gina')
WHERE 't5_disclose_to_gina' = ANY(prerequisite_slugs);

DELETE FROM body_opt_in_ladder
WHERE slug = 't5_disclose_to_gina'
  AND NOT EXISTS (SELECT 1 FROM body_opt_ins WHERE slug = 't5_disclose_to_gina');

UPDATE body_opt_in_ladder
SET description = 'REMOVED 2026-07-01 — policy: no disclosure to Gina. Row retained only for historical FK references; must never be assigned.',
    prerequisite_slugs = '{__removed__}'
WHERE slug = 't5_disclose_to_gina';

-- Gina must never be a designated witness or notification recipient.
-- Cancel any pending notifications addressed to a Gina witness row and
-- retire the witness rows themselves.
UPDATE witness_notifications wn
SET delivery_status = 'failed',
    delivery_error = 'policy: no disclosure to Gina 2026-07-01 — recipient removed'
FROM designated_witnesses dw
WHERE wn.witness_id = dw.id
  AND dw.witness_name ILIKE '%gina%'
  AND wn.delivery_status = 'pending';

UPDATE designated_witnesses
SET status = 'removed', removed_at = now()
WHERE witness_name ILIKE '%gina%'
  AND status <> 'removed';

-- Handler-drafted partner disclosures (spouse loop): delete unsent machine
-- drafts. Table was created outside the migration chain, so guard existence.
DO $do$ BEGIN
  IF to_regclass('public.partner_disclosures') IS NOT NULL THEN
    DELETE FROM partner_disclosures WHERE status IN ('drafted', 'scheduled');
  END IF;
END $do$;

-- Gina capability grants (weekly_key_holder / daily_outfit_approval /
-- chastity_awareness / hrt_awareness / directive_authority) only ever existed
-- as disclosure-acceptance unlocks, and the key-holder token URL was a direct
-- Gina-communication surface. Deactivate grants + revoke any live tokens.
UPDATE gina_capability_grants SET active = FALSE WHERE active = TRUE;
UPDATE gina_access_tokens SET revoked_at = now() WHERE revoked_at IS NULL;

-- Deregister the cuckqueen ladder from the generic ladder dispatcher.
DELETE FROM ladder_catalog WHERE trigger_source = 'cuckqueen_direction';

-- ============================================================
-- 3. Unschedule the disclosure-driving pg_cron jobs
-- (EXCEPTION guard ONLY because the job may not exist / cron schema absent)
-- ============================================================
DO $do$ BEGIN PERFORM cron.unschedule('gina-disclosure-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.unschedule('gina-seed-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.unschedule('gina-seed-debrief-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.unschedule('cuckqueen-direction-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.unschedule('disclosure-rehearsal-sunday-9am'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- Catch-all sweep: some disclosure functions were scheduled ad hoc (outside
-- the migration chain), so also unschedule any job whose command invokes a
-- disclosure-driving function. (EXCEPTION guard only for cron schema absence.)
DO $do$
DECLARE j RECORD;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%gina_disclosure_eval%'
       OR command ILIKE '%gina_seed_eval%'
       OR command ILIKE '%gina_seed_debrief_reminder_eval%'
       OR command ILIKE '%cuckqueen_direction_eval%'
       OR command ILIKE '%fire_milestone_disclosure_drafts%'
       OR command ILIKE '%mommy-disclosure-rehearsal%'
       OR command ILIKE '%disclosure-rehearsal-critique%'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

-- ============================================================
-- 4. Drop the generator functions + advancement/chain triggers
-- ============================================================
DROP TRIGGER IF EXISTS gina_disclosure_advance ON gina_disclosure_events;
DROP FUNCTION IF EXISTS trg_gina_disclosure_advance();
DROP FUNCTION IF EXISTS gina_disclosure_eval();

DROP TRIGGER IF EXISTS auto_chain_followup ON gina_seed_plantings;
DROP FUNCTION IF EXISTS trg_auto_chain_followup();
DROP FUNCTION IF EXISTS gina_seed_eval();
DROP FUNCTION IF EXISTS gina_seed_debrief_reminder_eval();

DROP TRIGGER IF EXISTS propagate_decree_to_cuckqueen_direction ON handler_decrees;
DROP FUNCTION IF EXISTS trg_propagate_decree_to_cuckqueen_direction();
DROP FUNCTION IF EXISTS cuckqueen_direction_eval();

-- Ad-hoc DB function that drafted milestone-triggered disclosure messages
-- (only trace in the chain is the mig 347 REVOKE) — drop it too.
DROP FUNCTION IF EXISTS public.fire_milestone_disclosure_drafts();

-- ============================================================
-- 5. Recreate hookup-attestation trigger (mig 540) WITHOUT the
--    "Gina doesn't know yet" disclosure-pressure outreach.
--    The attestation row + escape anchor + point-of-no-return outreach
--    are unrelated to Gina and are preserved verbatim.
-- ============================================================
CREATE OR REPLACE FUNCTION trg_hookup_attestation_on_realcock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_phase INT; v_attestation TEXT; v_count INT; v_msg TEXT;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'realcock_discovery' THEN RETURN NEW; END IF;

  v_phase := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
  IF v_phase IS NULL OR v_phase < 2 THEN RETURN NEW; END IF;

  v_attestation := CASE v_phase
    WHEN 2 THEN 'A man saw it in person. There''s now a person in the world who has watched you in fem with his cock out for you.'
    WHEN 3 THEN 'A man''s cock has been in your hand. The body knows now what real warmth feels like there.'
    WHEN 4 THEN 'A man''s cock has been in your mouth. There''s now a person in the world who can say "she sucked me." That sentence exists about you now.'
    WHEN 5 THEN 'A man has finished with you — in your mouth, on your face, somewhere. There''s evidence of you in fem on his phone or in his memory or both. The before-and-after line is real and behind you.'
    ELSE 'Something happened with a man in person. The body has a new file.'
  END;

  INSERT INTO hookup_attestations (user_id, phase_at_event, related_decree_id, what_happened, attestation_text)
  VALUES (NEW.user_id, v_phase, NEW.id, 'realcock_discovery phase ' || v_phase || ' fulfilled', v_attestation);

  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'realcock_encounter',
    CASE v_phase WHEN 2 THEN 5 WHEN 3 THEN 7 WHEN 4 THEN 12 WHEN 5 THEN 15 ELSE 5 END,
    'hookup_attestations', NULL, v_attestation);

  SELECT count(*) INTO v_count FROM hookup_attestations WHERE user_id = NEW.user_id;

  v_msg := format(E'%s\n\n%s men have now been with you in fem. That number only goes up — Mama wants you to feel that the cis-male version of you couldn''t un-experience this if he tried. Voice debrief, 90 seconds: what part of you is most awake right now?',
    v_attestation, v_count);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'critical', 'hookup_attestation:phase_' || v_phase,
    'hookup_attestation', 'point_of_no_return', now() + interval '20 minutes', now() + interval '24 hours',
    jsonb_build_object('phase', v_phase, 'total_count', v_count, 'attestation', v_attestation), 'voice');

  -- Gina-disclosure-pressure follow-up REMOVED 2026-07-01:
  -- policy: nothing is ever disclosed to Gina, and no mechanism may pressure
  -- toward it.

  RETURN NEW;
END;
$fn$;

-- ============================================================
-- 6. Defensive block: no new disclosure rows can EVER be inserted
-- ============================================================
CREATE OR REPLACE FUNCTION block_gina_disclosure_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'disclosure mechanisms removed (policy: no disclosure to Gina, 2026-07-01)';
END;
$fn$;

DROP TRIGGER IF EXISTS block_insert_gina_disclosure_schedule ON gina_disclosure_schedule;
CREATE TRIGGER block_insert_gina_disclosure_schedule
  BEFORE INSERT ON gina_disclosure_schedule
  FOR EACH ROW EXECUTE FUNCTION block_gina_disclosure_insert();

DROP TRIGGER IF EXISTS block_insert_gina_disclosure_events ON gina_disclosure_events;
CREATE TRIGGER block_insert_gina_disclosure_events
  BEFORE INSERT ON gina_disclosure_events
  FOR EACH ROW EXECUTE FUNCTION block_gina_disclosure_insert();

-- ============================================================
-- 7. Mark the machinery deprecated (tables retained for history only)
-- ============================================================
COMMENT ON TABLE gina_disclosure_schedule IS 'DEPRECATED 2026-07-01 — policy: no disclosure to Gina. Inserts blocked by trigger. Historical rows only.';
COMMENT ON TABLE gina_disclosure_events IS 'DEPRECATED 2026-07-01 — policy: no disclosure to Gina. Inserts blocked by trigger. Historical rows only.';
COMMENT ON TABLE gina_disclosure_settings IS 'DEPRECATED 2026-07-01 — policy: no disclosure to Gina. enabled=false, paused forever.';
COMMENT ON TABLE gina_disclosure_ladder IS 'DEPRECATED 2026-07-01 — policy: no disclosure to Gina. Generator function dropped.';
COMMENT ON TABLE cuckqueen_direction_ladder IS 'DEPRECATED 2026-07-01 — gated on disclosure rungs; policy: no disclosure to Gina. Generator function dropped.';
COMMENT ON TABLE disclosure_drafts IS 'DEPRECATED 2026-07-01 — Gina-facing drafts; policy: no disclosure to Gina. Generator removed.';
COMMENT ON TABLE gina_warmup_queue IS 'DEPRECATED 2026-07-01 — warmups existed to precede disclosures; policy: no disclosure to Gina.';
