-- 637 — atomic mantra rep accounting (FEM §3).
--
-- The old path (edge fn read-then-write on user_state.mantra_lifetime_reps)
-- was additive and racy: an upsert retry double-counted, a concurrent
-- submit lost an update. mantra_apply_drill() makes the session row the
-- truth: idempotent on session id (ON CONFLICT DO NOTHING), the counter
-- bumps ONLY when the row actually inserted, and prev/new totals return
-- atomically. user_state.mantra_lifetime_reps is demoted to a cache of
-- SUM(mantra_drill_sessions.weighted_rep_count); a nightly reconciliation
-- heals any drift (derived counters are never additive — they're caches).

CREATE OR REPLACE FUNCTION mantra_apply_drill(
  p_session_id uuid,
  p_user uuid,
  p_mantra_text text,
  p_mantra_id uuid,
  p_target_reps integer,
  p_voice_reps integer,
  p_typed_reps integer,
  p_weighted numeric,
  p_paired_with_arousal boolean DEFAULT false,
  p_intensity_band text DEFAULT NULL,
  p_audio_paths text[] DEFAULT NULL,
  p_evidence_summary text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_inserted boolean := false;
  v_prev numeric;
  v_new numeric;
BEGIN
  -- Lock the user_state row so concurrent submits serialize the bump.
  SELECT COALESCE(mantra_lifetime_reps, 0) INTO v_prev
    FROM user_state WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('inserted', false, 'error', 'no_user_state');
  END IF;

  INSERT INTO mantra_drill_sessions (
    id, user_id, mantra_text, mantra_id, target_rep_count,
    completed_rep_count, voice_rep_count, typed_rep_count, weighted_rep_count,
    paired_with_arousal, intensity_band, audio_storage_paths, evidence_summary,
    completed_at
  ) VALUES (
    p_session_id, p_user, p_mantra_text, p_mantra_id, GREATEST(1, COALESCE(p_target_reps, 1)),
    GREATEST(0, COALESCE(p_voice_reps, 0)) + GREATEST(0, COALESCE(p_typed_reps, 0)),
    GREATEST(0, COALESCE(p_voice_reps, 0)), GREATEST(0, COALESCE(p_typed_reps, 0)),
    GREATEST(0, COALESCE(p_weighted, 0)),
    COALESCE(p_paired_with_arousal, false), p_intensity_band, p_audio_paths, p_evidence_summary,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  v_inserted := FOUND;

  IF v_inserted THEN
    v_new := v_prev + GREATEST(0, COALESCE(p_weighted, 0));
    UPDATE user_state SET mantra_lifetime_reps = v_new WHERE user_id = p_user;
  ELSE
    -- Resubmit of a known session: return totals with NO bump.
    v_new := v_prev;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'prev_total', v_prev,
    'new_total', v_new
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION mantra_apply_drill(uuid, uuid, text, uuid, integer, integer, integer, numeric, boolean, text, text[], text) TO service_role;

-- ─── Reconciliation: cache ≡ session-sum, nightly ────────────────────

CREATE OR REPLACE FUNCTION mantra_reconcile_lifetime_reps()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_fixed INTEGER;
BEGIN
  UPDATE user_state u
     SET mantra_lifetime_reps = COALESCE(s.total, 0)
    FROM (
      SELECT user_id, SUM(weighted_rep_count) AS total
        FROM mantra_drill_sessions GROUP BY user_id
    ) s
   WHERE s.user_id = u.user_id
     AND u.mantra_lifetime_reps IS DISTINCT FROM COALESCE(s.total, 0);
  GET DIAGNOSTICS v_fixed = ROW_COUNT;
  RETURN v_fixed;
END;
$fn$;

GRANT EXECUTE ON FUNCTION mantra_reconcile_lifetime_reps() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'mantra-reps-reconcile' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
  PERFORM cron.schedule(
    'mantra-reps-reconcile',
    '20 3 * * *',
    'SELECT mantra_reconcile_lifetime_reps()'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- One immediate reconcile — heal whatever drift the additive era left.
SELECT mantra_reconcile_lifetime_reps();
