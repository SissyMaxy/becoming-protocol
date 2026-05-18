-- 567 — Revenue ladder + quit-readiness tracker. 7-phase progression from
-- free posting to replacing day-job income ($10k/mo target). Adapted to
-- existing revenue_log schema (period_date + amount_cents).
--
-- quit_readiness_status(user_id) RPC returns JSONB with current phase,
-- last 30/90d revenue, pct of day-job income, emergency-fund months,
-- next-phase unlock signal.

CREATE TABLE IF NOT EXISTS revenue_ladder (
  phase INT PRIMARY KEY,
  phase_name TEXT NOT NULL, monthly_revenue_target INT NOT NULL,
  description TEXT NOT NULL,
  unlock_when_prior_phase_at NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  primary_activities TEXT[] NOT NULL,
  next_phase_unlock_signal TEXT NOT NULL
);
INSERT INTO revenue_ladder (phase, phase_name, monthly_revenue_target, description, unlock_when_prior_phase_at, primary_activities, next_phase_unlock_signal) VALUES
(0, 'free_posting_foundation', 0,
  E'Build presence on free platforms. Goal: 500 followers and 3 posts/week minimum across 2 platforms.',
  0.00, ARRAY['reddit_post_3x_week','fetlife_post_2x_week','twitter_engage_daily','build_aesthetic_voice','find_first_50_followers'],
  E'500+ combined followers AND consistent posting cadence for 4+ weeks'),
(1, 'free_onlyfans_audience', 100,
  E'Launch free OnlyFans/Fansly. Goal: 100 free subscribers. Tip revenue ($50-200/mo).',
  0.80, ARRAY['onlyfans_setup','daily_free_content_post','welcome_dm_automation','tip_response_automation','cross_promo_from_reddit'],
  E'$100+/mo for 2 consecutive months AND 100+ free subscribers'),
(2, 'paid_subscriptions', 500,
  E'Convert free → paid. $10-15/mo tier. Goal: 30-50 paying subscribers.',
  0.80, ARRAY['paid_tier_launch','retention_dm_automation','3_posts_per_week_paid','upsell_to_ppv_auto'],
  E'$500+/mo for 2 consecutive months AND 30+ paying subs'),
(3, 'ppv_content_engine', 1500,
  E'Pay-per-view custom content. $5-50 per PPV depending on tier.',
  0.75, ARRAY['ppv_offer_drafter','tier_pricing_optimization','content_calendar_automation','high_value_subscriber_id'],
  E'$1500+/mo for 2 consecutive months'),
(4, 'custom_requests', 3500,
  E'Custom video requests at premium pricing ($50-300 each).',
  0.75, ARRAY['custom_request_intake','quote_drafter','delivery_scheduling','high_value_repeat_clients'],
  E'$3500+/mo for 2 consecutive months'),
(5, 'cam_shows', 6500,
  E'Live cam shows. $100-500 per show, weekly cadence.',
  0.75, ARRAY['cam_platform_setup','weekly_show_cadence','show_promotion_automation','tip_goal_management'],
  E'$6500+/mo for 3 consecutive months'),
(6, 'quit_day_job', 10000,
  E'Full-time content. Replace day-job income with buffer. Quit prep: 6-month emergency fund, LLC, tax, health insurance.',
  0.80, ARRAY['quit_day_job_planning','llc_setup','tax_accountant','health_insurance_research','full_time_schedule'],
  E'$10000+/mo for 6 consecutive months')
ON CONFLICT (phase) DO UPDATE SET phase_name=EXCLUDED.phase_name, monthly_revenue_target=EXCLUDED.monthly_revenue_target,
  description=EXCLUDED.description, primary_activities=EXCLUDED.primary_activities, next_phase_unlock_signal=EXCLUDED.next_phase_unlock_signal;

CREATE TABLE IF NOT EXISTS revenue_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES revenue_ladder(phase),
  phase_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  day_job_monthly_income INT, current_monthly_revenue INT NOT NULL DEFAULT 0,
  projected_quit_date DATE, emergency_fund_months NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE revenue_state ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY rs_self ON revenue_state FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION quit_readiness_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_state RECORD; v_phase RECORD; v_last_30 NUMERIC; v_last_90 NUMERIC; v_pct NUMERIC;
BEGIN
  SELECT * INTO v_state FROM revenue_state WHERE user_id = p_user_id;
  IF v_state IS NULL THEN RETURN jsonb_build_object('enabled', FALSE); END IF;
  SELECT * INTO v_phase FROM revenue_ladder WHERE phase = v_state.current_phase;
  SELECT COALESCE(sum(amount_cents)/100.0, 0) INTO v_last_30 FROM revenue_log WHERE user_id = p_user_id AND period_date > current_date - 30;
  SELECT COALESCE(sum(amount_cents)/100.0/3, 0) INTO v_last_90 FROM revenue_log WHERE user_id = p_user_id AND period_date > current_date - 90;
  v_pct := CASE WHEN COALESCE(v_state.day_job_monthly_income, 0) > 0
    THEN ROUND((v_last_30 / v_state.day_job_monthly_income) * 100, 1) ELSE 0 END;
  RETURN jsonb_build_object(
    'enabled', v_state.enabled,
    'current_phase', v_state.current_phase, 'phase_name', v_phase.phase_name,
    'phase_target', v_phase.monthly_revenue_target,
    'last_30d_revenue', v_last_30, 'last_90d_monthly_avg', ROUND(v_last_90, 2),
    'day_job_monthly_income', v_state.day_job_monthly_income,
    'pct_of_day_job_income', v_pct,
    'next_phase_signal', v_phase.next_phase_unlock_signal,
    'emergency_fund_months', v_state.emergency_fund_months);
END;
$fn$;
GRANT EXECUTE ON FUNCTION quit_readiness_status(UUID) TO authenticated, service_role;
