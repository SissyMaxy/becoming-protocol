-- 703 — conditioning experiment registry: pre-registration + kill criteria.
--
-- The hardening layer from the 2026-07-22 methodology discussion: a mechanic
-- that cannot state what would falsify it does not get to keep running on
-- vibes. Every registered experiment declares — BEFORE it is judged — its
-- hypothesis, its indicator, its dose, the minimum evidence needed, and an
-- explicit decision rule with a kill/rotate criterion. A weekly SQL review
-- computes ADHERENCE (was it delivered/done) and EFFICACY (did the indicator
-- move) as separate verdicts, so a mechanic is never called dead when it was
-- actually never delivered (this week's 0/14 fulfillment lesson), and never
-- presumed alive because nobody measured it (the dry-spell rule).
--
-- Verdicts land in mommy_supervisor_log (the operator pulse) and the verdict
-- table. TELEMETRY WALL: nothing here ever reaches a user-facing surface or
-- Mommy voice — this is operator/engine instrumentation only. The review
-- recommends (continue / rotate / kill / dead_loop / insufficient_data);
-- retiring a mechanic stays an operator/engine decision, and disengagement
-- is never penalized — a dead_loop verdict re-presents work, it never fires
-- a consequence.

-- ── Registry ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conditioning_experiments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL,
  slug                  text NOT NULL,
  mechanic              text NOT NULL,           -- human name of the thing under test
  hypothesis            text NOT NULL,           -- what we claim it does
  target_slug           text,                    -- reconditioning_targets.slug, if any
  indicator_kind        text NOT NULL,           -- recon_measurements.indicator_kind judged
  delivery_source_like  text NOT NULL,           -- LIKE pattern over decree trigger_source / outreach trigger_reason
  dose_description      text NOT NULL,           -- intended cadence, plain words
  min_measured_sessions int  NOT NULL DEFAULT 8, -- evidence floor before any efficacy verdict
  min_adherence_pct     int  NOT NULL DEFAULT 60,-- below this, verdict is adherence-limited, not efficacy
  decision_rule         text NOT NULL,           -- the pre-registered rule, plain words
  kill_criterion        text NOT NULL,           -- what retires/rotates it, plain words
  review_cadence_days   int  NOT NULL DEFAULT 7,
  next_review_at        timestamptz NOT NULL DEFAULT now() + interval '7 days',
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','rotated','retired','inconclusive','superseded')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS public.conditioning_experiment_verdicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id  uuid NOT NULL REFERENCES public.conditioning_experiments(id) ON DELETE CASCADE,
  reviewed_at    timestamptz NOT NULL DEFAULT now(),
  window_days    int NOT NULL,
  delivered_count int NOT NULL,
  measured_count  int NOT NULL,
  trend_delta    numeric,
  trend_slope_per_day numeric,
  verdict        text NOT NULL
                 CHECK (verdict IN ('continue','improving','flat_consider_rotate','dead_loop','insufficient_data','adherence_limited')),
  reasoning      text NOT NULL
);

ALTER TABLE public.conditioning_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditioning_experiment_verdicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_experiments" ON public.conditioning_experiments;
CREATE POLICY "service_role_only_experiments" ON public.conditioning_experiments
  FOR ALL TO public USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS "service_role_only_experiment_verdicts" ON public.conditioning_experiment_verdicts;
CREATE POLICY "service_role_only_experiment_verdicts" ON public.conditioning_experiment_verdicts
  FOR ALL TO public USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── Weekly review ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conditioning_experiment_review()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  e RECORD;
  v_target uuid;
  v_window int;
  v_since timestamptz;
  v_delivered int;
  v_measured int;
  v_trend RECORD;
  v_verdict text;
  v_reason text;
  v_count int := 0;
BEGIN
  FOR e IN SELECT * FROM conditioning_experiments
            WHERE status = 'active' AND next_review_at <= now()
  LOOP
    v_window := GREATEST(e.review_cadence_days * 2, 14);
    v_since  := now() - (v_window || ' days')::interval;

    -- Adherence: deliveries of this mechanic in the window (either surface).
    SELECT (SELECT count(*) FROM handler_decrees
             WHERE user_id = e.user_id AND trigger_source LIKE e.delivery_source_like
               AND created_at > v_since)
         + (SELECT count(*) FROM handler_outreach_queue
             WHERE user_id = e.user_id AND trigger_reason LIKE e.delivery_source_like
               AND created_at > v_since)
      INTO v_delivered;

    -- Efficacy evidence: measurements of the registered indicator.
    SELECT id INTO v_target FROM reconditioning_targets
     WHERE user_id = e.user_id AND slug = e.target_slug;

    SELECT count(*) INTO v_measured FROM recon_measurements
     WHERE user_id = e.user_id AND indicator_kind = e.indicator_kind
       AND captured_at > v_since;

    v_trend := NULL;
    IF v_target IS NOT NULL AND v_measured > 0 THEN
      SELECT * INTO v_trend
        FROM recon_measurement_trend(v_target, e.indicator_kind, GREATEST(v_measured, 5));
    END IF;

    -- The verdict ladder. Adherence and efficacy stay SEPARATE claims.
    IF v_measured = 0 AND v_delivered = 0 THEN
      v_verdict := 'dead_loop';
      v_reason  := format('Nothing delivered and nothing measured in %s days — the loop is not running, the mechanic is unjudged.', v_window);
    ELSIF v_measured = 0 THEN
      v_verdict := 'dead_loop';
      v_reason  := format('%s deliveries but ZERO measurements in %s days — running blind; the mechanic cannot be judged until it is measured.', v_delivered, v_window);
    ELSIF v_measured < e.min_measured_sessions THEN
      v_verdict := 'insufficient_data';
      v_reason  := format('%s of %s minimum measured sessions — keep going, no efficacy claim yet either way.', v_measured, e.min_measured_sessions);
    ELSIF v_delivered > 0 AND (v_measured * 100 / GREATEST(v_delivered, 1)) < e.min_adherence_pct THEN
      v_verdict := 'adherence_limited';
      v_reason  := format('Measured %s of %s delivered (< %s%%) — any flatness is an adherence problem, not an efficacy one. Do not judge the mechanic on this window.', v_measured, v_delivered, e.min_adherence_pct);
    ELSIF v_trend IS NOT NULL AND v_trend.delta IS NOT NULL AND v_trend.direction >= 0 AND v_trend.delta > 0 THEN
      v_verdict := 'improving';
      v_reason  := format('Indicator moved %s over %s measurements (slope %s/day). Pre-registered rule: %s', v_trend.delta, v_trend.n, round(COALESCE(v_trend.slope_per_day, 0), 4), e.decision_rule);
    ELSE
      v_verdict := 'flat_consider_rotate';
      v_reason  := format('Evidence floor met (%s measured, adherence ok) and the indicator is not moving. Pre-registered kill criterion applies: %s', v_measured, e.kill_criterion);
    END IF;

    INSERT INTO conditioning_experiment_verdicts
      (experiment_id, window_days, delivered_count, measured_count, trend_delta, trend_slope_per_day, verdict, reasoning)
    VALUES
      (e.id, v_window, v_delivered, v_measured,
       CASE WHEN v_trend IS NULL THEN NULL ELSE v_trend.delta END,
       CASE WHEN v_trend IS NULL THEN NULL ELSE v_trend.slope_per_day END,
       v_verdict, v_reason);

    -- Operator pulse — NEVER a user surface (telemetry wall).
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('experiment_review',
            CASE v_verdict WHEN 'dead_loop' THEN 'warning' WHEN 'flat_consider_rotate' THEN 'warning' ELSE 'info' END,
            'experiment_verdict',
            format('[%s] %s — %s', e.slug, v_verdict, v_reason),
            jsonb_build_object('experiment_id', e.id, 'slug', e.slug, 'verdict', v_verdict,
                               'delivered', v_delivered, 'measured', v_measured));

    UPDATE conditioning_experiments
       SET next_review_at = now() + (review_cadence_days || ' days')::interval
     WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.conditioning_experiment_review() TO service_role;

-- ── Cron ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('conditioning-experiment-review-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'conditioning-experiment-review-weekly',
  '30 5 * * 1',
  $$SELECT conditioning_experiment_review()$$
);

-- ── Pre-registered cards for the mechanics running today ──────────────────
INSERT INTO public.conditioning_experiments
  (user_id, slug, mechanic, hypothesis, target_slug, indicator_kind, delivery_source_like,
   dose_description, min_measured_sessions, min_adherence_pct, decision_rule, kill_criterion,
   review_cadence_days, next_review_at)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'plug-orgasm-ladder',
   'plug_orgasm training track (mig 701) + guided sessions (mig 702)',
   'Structured plug sessions in chastity, comfort-gated and rung-progressive, raise sissygasm closeness toward a hands-free orgasm.',
   'arousal_is_the_becoming', 'sissygasm_closeness', 'physical_practice:plug_orgasm:%',
   'One prescribed session per day surfaced; three or more completed sessions per week intended.',
   8, 60,
   'Continue while closeness trend is positive across rungs; rung advancement itself is secondary evidence.',
   'Flat or declining closeness after 12 measured sessions at 60%+ adherence: rotate pattern arc (different phase mix / durations) before touching dose; two rotations flat = mark inconclusive and rethink the mechanism.',
   7, now() + interval '7 days'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'turnout-ambient-saturation',
   'Turnout-slug-biased ambient clips + turnout_desire reframes (mig 698)',
   'Target-precise ambient saturation and desire-scoped reframes raise self-referenced turnout want (self_ref_drift on the turnout target).',
   'sex_work_is_who_i_am', 'self_ref_drift', 'ambient_saturation:to_%',
   'Rides the existing ambient budget (6 fires/day shared pool); no added throughput.',
   6, 40,
   'Judge only after the turnout target is ACTIVE with a running program — until then verdicts are expected to read dead_loop/insufficient and that is correct.',
   'Flat self_ref_drift after 8 measured points with the target active and clips actually firing: retire the slug bias (keep generic pool) and try self-echo-weighted delivery instead.',
   14, now() + interval '14 days'),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', 'costume-recon-program',
   'the_man_is_the_costume running program (recon phase machine + reframe retrieval feed)',
   'Spaced retrieval of identity reframes plus phase-walked program delivery moves self_ref_drift on the costume target.',
   'the_man_is_the_costume', 'self_ref_drift', 'recon%',
   'Program-paced deliveries via the recon orchestrator; reframe author hourly-gated at 12h.',
   6, 40,
   'Continue while drift trends away from baseline 0.472 in the target direction.',
   'Flat after 10 measured points with deliveries confirmed: rotate mechanism via recon_select_mechanism (the P3 machinery exists for exactly this) rather than adding volume.',
   14, now() + interval '14 days')
ON CONFLICT (user_id, slug) DO NOTHING;
