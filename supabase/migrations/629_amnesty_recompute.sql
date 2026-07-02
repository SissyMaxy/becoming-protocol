-- 629 — Enforcement Spine v2: amnesty + recompute (design §7 L3).
--
-- One-time cleanup of debt the OLD machinery manufactured:
--   1. Mig-610 "grandfathered" previews (surfaced_at faked = created_at, no
--      companion outreach, never fired) go back to 'filed' with a FRESH
--      companion outreach — they must genuinely surface before they can bite.
--   2. Synthetic slip purge: dodge-loop duplicates beyond the first per
--      punishment; the whole disclosure-miss class (deleted with the Gina
--      machinery, mig 624); erosion rows that quote mandated text.
--   3. dodge_count clamped ≤ 2; eternal dodge loops become 'commuted'
--      (status CHECK extended) with one net unlock-push retained via the
--      unlock-date recompute.
--   4. Unlock dates recomputed to the +7d chain cap.
--   5. Hard Mode recomputed from surviving signals (escalation_events starts
--      empty ⇒ pressure 0 ⇒ exits), reason 'amnesty_recompute_v2'.
--   6. handler_decrees.cancel_reason backfill — unknowns resolve in her
--      favor as 'system_prune' (never counted as ducking).
--
-- Net effect: nothing she DID gets cheaper. What dies is the noise she could
-- rightfully ignore — loops that punished nobody's choices and penalties
-- from deadlines that never reached her.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Void the 610-grandfathered previews back to 'filed' + fresh outreach
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  v_outreach UUID;
  v_msg TEXT;
  v_reset INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM obligations
     WHERE created_by = 'mig627_penalty_preview_migration'
       AND preview_outreach_id IS NULL          -- 610 backfill had no companion outreach
       AND surfaced_at IS NOT NULL
       AND surfaced_at = created_at             -- the faked "already surfaced" stamp
       AND consequence_applied_at IS NULL       -- unfired only
       AND status IN ('surfaced','due','missed','consequence_previewed')
  LOOP
    UPDATE obligations
       SET status = 'filed', surfaced_at = NULL, surfaced_via = NULL
     WHERE id = r.id;
    INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor, note)
    VALUES (r.id, r.status, 'filed', 'amnesty_629', 'migration',
            'mig-610 grandfather stamp (surfaced_at=created_at, no outreach) revoked — must genuinely surface');

    v_msg := 'On your plate, put in writing this time: ' || r.penalty_copy ||
             CASE WHEN r.deadline IS NOT NULL THEN ' There is a deadline attached.' ELSE '' END ||
             ' Nothing fires unless you have seen this first.';
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at)
    VALUES (r.user_id, v_msg, 'normal',
            'obligation_preview:amnesty629:' || r.id::text,
            'penalty_preview', 'penalty_preview',
            now(), COALESCE(r.deadline, now() + interval '72 hours'))
    RETURNING id INTO v_outreach;
    UPDATE obligations SET preview_outreach_id = v_outreach WHERE id = r.id;
    v_reset := v_reset + 1;
  END LOOP;

  IF v_reset > 0 THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('amnesty_629', 'info', 'grandfathered_previews_reset',
      v_reset || ' mig-610 grandfathered previews reset to filed with fresh outreach.',
      jsonb_build_object('count', v_reset));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Synthetic slip purge
-- ─────────────────────────────────────────────────────────────────────────

-- 2a. Dodge-loop duplicates: keep only the FIRST task_avoided slip per
--     punishment; every re-fire past that punished nobody's new choice.
WITH dodge_slips AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, (metadata->>'punishment_id')
           ORDER BY COALESCE(detected_at, created_at) ASC
         ) AS rn
    FROM slip_log
   WHERE is_synthetic = TRUE
     AND slip_type = 'task_avoided'
     AND metadata ? 'punishment_id'
)
DELETE FROM slip_log WHERE id IN (SELECT id FROM dodge_slips WHERE rn > 1);

-- 2b. Disclosure-miss slips: the class was deleted with the Gina machinery.
DELETE FROM slip_log WHERE slip_type = 'disclosure_deadline_missed';

-- 2c. Erosion rows that quote mandated text — she was doing exactly what
--     Mommy ordered. (Delete-block trigger disabled for this one statement.)
ALTER TABLE identity_erosion_log DISABLE TRIGGER block_erosion_delete;
DELETE FROM identity_erosion_log e
 WHERE e.description IS NOT NULL
   AND is_mandated_text(e.user_id, e.description);
ALTER TABLE identity_erosion_log ENABLE TRIGGER block_erosion_delete;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Dodge clamp + eternal loops → commuted
-- ─────────────────────────────────────────────────────────────────────────

-- Read of the current CHECK (2026-07-01): mig 624 set it to
-- (queued, active, completed, dodged, escalated, cancelled). 'commuted' is
-- new — extend BEFORE the UPDATE (stale-CHECK silent rejection is a known
-- bug class).
ALTER TABLE punishment_queue DROP CONSTRAINT IF EXISTS punishment_queue_status_check;
ALTER TABLE punishment_queue ADD CONSTRAINT punishment_queue_status_check
  CHECK (status IN ('queued', 'active', 'completed', 'dodged', 'escalated', 'cancelled', 'commuted'));

-- Eternal loops: anything still live after 2+ dodges is commuted — the
-- 24h-re-arm-forever cycle no longer exists. (One net unlock push is
-- retained via the recompute in §4; everything beyond the cap is dropped.)
UPDATE punishment_queue
   SET status = 'commuted',
       completion_evidence = COALESCE(completion_evidence, '{}'::jsonb)
         || jsonb_build_object('commuted_reason', 'amnesty_629: dodge loop terminalized at 2')
 WHERE status IN ('queued', 'escalated')
   AND COALESCE(dodge_count, 0) >= 2;

-- Clamp: no counter may claim a third dodge ever happened.
UPDATE punishment_queue SET dodge_count = 2 WHERE COALESCE(dodge_count, 0) > 2;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Unlock date recompute — cap at the +7d chain
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE r RECORD; v_cap TIMESTAMPTZ := now() + interval '7 days'; v_n INT := 0;
BEGIN
  FOR r IN
    SELECT id, user_id, scheduled_unlock_at FROM chastity_sessions
     WHERE status = 'locked' AND scheduled_unlock_at > v_cap
  LOOP
    UPDATE chastity_sessions SET scheduled_unlock_at = v_cap WHERE id = r.id;
    UPDATE user_state SET chastity_scheduled_unlock_at = v_cap WHERE user_id = r.user_id;
    v_n := v_n + 1;
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('amnesty_629', 'info', 'unlock_date_recomputed',
      'Unlock date pulled back to the +7d chain cap (dodge-loop extensions beyond the cap dropped; one net push retained inside it).',
      jsonb_build_object('session_id', r.id, 'user_id', r.user_id,
                         'was', r.scheduled_unlock_at, 'now', v_cap));
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Hard Mode recompute from surviving signals
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM user_state WHERE hard_mode_active = TRUE
  LOOP
    -- escalation_events (mig 628) starts empty: pressure 0 < 3 and no events
    -- in 72h ⇒ the calculus exits Hard Mode. Nothing that flipped it under
    -- the old inputs (reply grades, plan keywords, raw slip volume) survives.
    UPDATE user_state SET hard_mode_active = FALSE, hard_mode_exit_task_id = NULL
     WHERE user_id = r.user_id;
    INSERT INTO hard_mode_transitions (user_id, transition, reason)
    VALUES (r.user_id, 'exited', 'amnesty_recompute_v2');
    -- Pending de-escalation tasks lose their reason to exist.
    UPDATE punishment_queue
       SET status = 'cancelled',
           completion_evidence = COALESCE(completion_evidence, '{}'::jsonb)
             || jsonb_build_object('cancelled_reason', 'amnesty_recompute_v2: hard mode recomputed off')
     WHERE user_id = r.user_id
       AND triggered_by_hard_mode = TRUE
       AND status IN ('queued', 'active', 'escalated');
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. cancel_reason backfill — doubt resolves in her favor
-- ─────────────────────────────────────────────────────────────────────────

UPDATE handler_decrees
   SET cancel_reason = CASE
     WHEN reasoning ILIKE '%mig 494%' OR reasoning ILIKE '%pause_new_decrees_until%' THEN 'pause_auto_cancel'
     WHEN reasoning ILIKE '%throttle%' THEN 'throttle'
     WHEN reasoning ILIKE '%supersed%' THEN 'superseded'
     ELSE 'system_prune'
   END
 WHERE status = 'cancelled' AND cancel_reason IS NULL;

NOTIFY pgrst, 'reload schema';
