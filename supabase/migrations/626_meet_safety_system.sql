-- 626 — Meet Safety System v2: "no net, no meet" (DESIGN_TURNING_OUT §1).
--
-- date-safety-kit promised "miss it and she comes looking" with nothing behind
-- it. This migration is the infrastructure behind the promise:
--   trusted_contacts        — the user-chosen safety person (NEVER seeded)
--   meet_safety_plans       — one card per meet: who/where/when + duress word
--   meet_checkins           — arrival / mid / home_safe with grace windows
--   meet_escalation_dispatch— stage-3 sends drained by the meet-safety-dispatch
--                             edge fn (Twilio SMS / Resend email)
--   arm_meet_safety_plan()  — hard server-side validation, schedule generation,
--                             penalty-preview registration (surfaced-and-avertable
--                             consent for the outward stage-3 action AT ARM TIME)
--   ack_meet_checkin()      — ok / extend / help / duress handling
--   meet_safety_watch()     — pg_cron every 1 minute; the escalation ladder
--
-- Escalation ladder (mirrored in supabase/functions/_shared/meet-safety-core.ts —
-- change numbers there in the same commit):
--   stage 0  due_at..grace       push at T+0, re-push +3m/+6m
--   stage 1  grace expiry        critical push every 3 minutes
--   stage 2  grace+15m           pre-fire warning with countdown, every 3 minutes
--   stage 3  grace+30m           trusted contact gets the plain-English message;
--                                pressure pushes continue until she acks
--
-- STANDING-RULE COMPLIANCE: the watcher runs during pause/safeword by design —
-- a live meet plan is the one thing pause must never suppress. Do NOT add
-- pause / conditioning-gate checks to meet_safety_watch().
--
-- NO "EXCEPTION WHEN OTHERS" anywhere in this file except the pg_cron/pg_net
-- extension-creation guards (Supabase rejects CREATE EXTENSION IF NOT EXISTS
-- with SQLSTATE 2BP01 on prior-grant collisions).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Tables
-- ═══════════════════════════════════════════════════════════════════════════

-- NEVER seeded, NEVER auto-suggested. The UI is free text with no candidate
-- list; no generator, seed script, or LLM directive may insert here. Never
-- Gina. Rows exist only because the user typed a name and the person said yes.
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- the name the CONTACT knows the user by; used verbatim in the stage-3
  -- message so a stranger reads a name they recognize
  knows_user_as TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  channel_value TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (consent_status IN ('pending','consented','declined','revoked')),
  consent_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(12),'hex'),
  consented_at TIMESTAMPTZ,
  last_channel_verified_at TIMESTAMPTZ,   -- test message confirmed delivered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meet_safety_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  funnel_id UUID REFERENCES hookup_funnel(id),
  contact_label TEXT NOT NULL,               -- the DATE, in her words
  contact_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  venue_name TEXT NOT NULL,
  venue_address TEXT NOT NULL,
  venue_is_public BOOLEAN NOT NULL,
  meet_at TIMESTAMPTZ NOT NULL,
  expected_duration_minutes INT NOT NULL DEFAULT 90,
  trusted_contact_id UUID NOT NULL REFERENCES trusted_contacts(id),
  location_share_confirmed_at TIMESTAMPTZ,
  duress_word TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','armed','live','completed','escalated','false_alarm','cancelled')),
  armed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meet_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES meet_safety_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('arrival','mid','home_safe')),
  due_at TIMESTAMPTZ NOT NULL,
  grace_minutes INT NOT NULL,                -- 10/15/30 by kind
  responded_at TIMESTAMPTZ,
  response TEXT CHECK (response IN ('ok','extend','help','duress')),
  responded_via TEXT,
  escalation_stage INT NOT NULL DEFAULT 0 CHECK (escalation_stage BETWEEN 0 AND 3),
  next_escalation_at TIMESTAMPTZ,
  times_extended INT NOT NULL DEFAULT 0,     -- home_safe +1h, max 3
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, kind)
);

-- Stage-3 send queue. Drained by the meet-safety-dispatch edge fn.
-- NO owner-read policy ON PURPOSE: a duress fire must leave zero user-visible
-- trace (the plan keeps reading as checked-in); this table carries the truth.
CREATE TABLE IF NOT EXISTS meet_escalation_dispatch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  checkin_id UUID REFERENCES meet_checkins(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES trusted_contacts(id),
  kind TEXT NOT NULL DEFAULT 'escalation' CHECK (kind IN ('escalation','false_alarm')),
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meet_checkins_open
  ON meet_checkins (due_at) WHERE responded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meet_plans_active
  ON meet_safety_plans (user_id, status) WHERE status IN ('armed','live','escalated');
CREATE INDEX IF NOT EXISTS idx_meet_dispatch_pending
  ON meet_escalation_dispatch (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user
  ON trusted_contacts (user_id, consent_status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RLS — owner-read; writes flow through the SECURITY DEFINER RPCs / service
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meet_safety_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meet_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE meet_escalation_dispatch ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  CREATE POLICY tc_owner_read ON trusted_contacts FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- The user creates + names their own contact (free text, no candidates) and
-- may revoke; the consent-guard trigger below stops self-consenting.
DO $do$ BEGIN
  CREATE POLICY tc_owner_insert ON trusted_contacts FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY tc_owner_update ON trusted_contacts FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY msp_owner_read ON meet_safety_plans FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- The user builds the draft card; the status-guard trigger below stops
-- self-arming (arming ONLY via arm_meet_safety_plan's hard validation).
DO $do$ BEGIN
  CREATE POLICY msp_owner_insert ON meet_safety_plans FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY msp_owner_update ON meet_safety_plans FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY mc_owner_read ON meet_checkins FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- meet_checkins: no authenticated write policies — rows are generated by
-- arm_meet_safety_plan and answered through ack_meet_checkin.

-- meet_escalation_dispatch: no authenticated policies at all (see comment on
-- the table). Service role bypasses RLS.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Anti-circumvention guards (this is forced fem — trust-based systems fail)
-- ═══════════════════════════════════════════════════════════════════════════

-- The user cannot consent FOR their contact, and cannot mark the channel
-- verified. Those two facts come from the contact's side (consent token /
-- delivered test message) through the service path only.
--
-- Both guard triggers are deliberately INVOKER (not SECURITY DEFINER) and key
-- on current_user: direct PostgREST writes run as role 'authenticated', while
-- writes from inside the sanctioned SECURITY DEFINER RPCs (arm/ack) run as
-- the function owner and pass through.
CREATE OR REPLACE FUNCTION trg_trusted_contact_consent_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.consent_status = 'consented' OR NEW.consented_at IS NOT NULL
         OR NEW.last_channel_verified_at IS NOT NULL THEN
        RAISE EXCEPTION 'Your safety person has to say yes themselves — consent and channel verification are recorded from their reply, not from this side.';
      END IF;
    ELSE
      IF (NEW.consent_status = 'consented' AND OLD.consent_status IS DISTINCT FROM 'consented')
         OR NEW.consented_at IS DISTINCT FROM OLD.consented_at
         OR NEW.last_channel_verified_at IS DISTINCT FROM OLD.last_channel_verified_at THEN
        RAISE EXCEPTION 'Your safety person has to say yes themselves — consent and channel verification are recorded from their reply, not from this side.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trusted_contact_consent_guard ON trusted_contacts;
CREATE TRIGGER trusted_contact_consent_guard
  BEFORE INSERT OR UPDATE ON trusted_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_trusted_contact_consent_guard();

-- Plans arm ONLY through arm_meet_safety_plan()'s validation. The user may
-- create drafts and cancel; every other status transition is system-owned.
CREATE OR REPLACE FUNCTION trg_meet_plan_status_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'A safety plan starts as a draft. Arming happens through the arm step, which checks the whole net first.';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('cancelled') THEN
      RAISE EXCEPTION 'Only cancelling is a direct edit. Arming and completing run through the safety system so the checks cannot be skipped.';
    ELSIF NEW.status = 'cancelled' AND OLD.status NOT IN ('draft','armed') THEN
      -- A LIVE plan cannot be cancelled from the app: someone pressuring her
      -- mid-date must not be able to make the net disappear. Checking in is
      -- the only way through; home-safe ends it.
      RAISE EXCEPTION 'A live plan cannot be cancelled — check in instead. The plan ends when you confirm you are home safe.';
    ELSIF OLD.status <> 'draft' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      -- Once armed (or beyond), the card's facts are frozen for direct edits:
      -- venue/time/contact were validated at arm time and the stage-3 message
      -- reads from them. Cancel and rebuild to change the plan.
      IF (NEW.venue_name, NEW.venue_address, NEW.venue_is_public, NEW.meet_at,
          NEW.expected_duration_minutes, NEW.trusted_contact_id,
          NEW.location_share_confirmed_at, NEW.contact_label)
         IS DISTINCT FROM
         (OLD.venue_name, OLD.venue_address, OLD.venue_is_public, OLD.meet_at,
          OLD.expected_duration_minutes, OLD.trusted_contact_id,
          OLD.location_share_confirmed_at, OLD.contact_label) THEN
        RAISE EXCEPTION 'This plan is already armed — the who/where/when were validated when it armed. Cancel it and build a new card to change the meet.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS meet_plan_status_guard ON meet_safety_plans;
CREATE TRIGGER meet_plan_status_guard
  BEFORE INSERT OR UPDATE ON meet_safety_plans
  FOR EACH ROW EXECUTE FUNCTION trg_meet_plan_status_guard();

-- Cancelling a plan (draft/armed, pre-meet) retires its penalty preview so
-- the mig 601 morning sweep never nags about a meet that isn't happening.
CREATE OR REPLACE FUNCTION trg_meet_plan_cancel_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE penalty_previews SET cancelled_at = now()
     WHERE source_table = 'meet_safety_plans' AND source_id = NEW.id AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS meet_plan_cancel_cleanup ON meet_safety_plans;
CREATE TRIGGER meet_plan_cancel_cleanup
  AFTER UPDATE OF status ON meet_safety_plans
  FOR EACH ROW EXECUTE FUNCTION trg_meet_plan_cancel_cleanup();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. arm_meet_safety_plan — hard validation, schedule, penalty preview
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION arm_meet_safety_plan(p_plan UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_plan meet_safety_plans%ROWTYPE;
  v_contact trusted_contacts%ROWTYPE;
  v_arrival_due TIMESTAMPTZ;
  v_mid_due TIMESTAMPTZ;
  v_home_due TIMESTAMPTZ;
  v_ladder TEXT;
BEGIN
  SELECT * INTO v_plan FROM meet_safety_plans WHERE id = p_plan FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No safety plan with that id exists.';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_plan.user_id THEN
    RAISE EXCEPTION 'This safety plan belongs to a different user.';
  END IF;
  IF v_plan.status = 'armed' THEN
    RETURN jsonb_build_object('ok', true, 'already_armed', true, 'plan_id', v_plan.id);
  END IF;
  IF v_plan.status <> 'draft' THEN
    RAISE EXCEPTION 'This plan is % — only a draft plan can be armed.', v_plan.status;
  END IF;

  -- Hard validations. Each failure is a plain-English reason the net is not
  -- ready — the caller turns it into the acquisition/fix task.
  SELECT * INTO v_contact FROM trusted_contacts
   WHERE id = v_plan.trusted_contact_id AND user_id = v_plan.user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The plan has no safety person attached. Name your safety person first.';
  END IF;
  IF v_contact.consent_status <> 'consented' THEN
    RAISE EXCEPTION 'Your safety person (%) has not said yes yet. Get their yes before this meet can be armed.', v_contact.name;
  END IF;
  IF v_contact.last_channel_verified_at IS NULL THEN
    RAISE EXCEPTION 'Your safety person (%) said yes, but the % channel has not been test-verified yet. A net that cannot deliver is not a net.', v_contact.name, v_contact.channel;
  END IF;
  IF v_plan.venue_is_public IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'First meets happen in public. Pick a public venue before arming.';
  END IF;
  IF v_plan.meet_at <= now() THEN
    RAISE EXCEPTION 'The meet time is in the past. Set the real time before arming.';
  END IF;
  IF v_plan.location_share_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Live location sharing has not been confirmed. Turn it on and confirm it before arming.';
  END IF;

  -- Check-in schedule (mirrors buildCheckinSchedule in
  -- supabase/functions/_shared/meet-safety-core.ts):
  --   arrival   meet_at + 20m            grace 10
  --   mid       meet_at + duration/2     grace 15
  --   home_safe meet_at + duration + 60m grace 30
  v_arrival_due := v_plan.meet_at + interval '20 minutes';
  v_mid_due     := v_plan.meet_at + make_interval(mins => v_plan.expected_duration_minutes / 2);
  v_home_due    := v_plan.meet_at + make_interval(mins => v_plan.expected_duration_minutes + 60);

  INSERT INTO meet_checkins (plan_id, user_id, kind, due_at, grace_minutes)
  VALUES
    (v_plan.id, v_plan.user_id, 'arrival',   v_arrival_due, 10),
    (v_plan.id, v_plan.user_id, 'mid',       v_mid_due,     15),
    (v_plan.id, v_plan.user_id, 'home_safe', v_home_due,    30)
  ON CONFLICT (plan_id, kind) DO UPDATE
    SET due_at = EXCLUDED.due_at,
        grace_minutes = EXCLUDED.grace_minutes,
        responded_at = NULL,
        response = NULL,
        responded_via = NULL,
        escalation_stage = 0,
        next_escalation_at = NULL,
        times_extended = 0;

  -- The outward action is surfaced-and-avertable AT ARM TIME — this preview
  -- is the pre-consent for stage 3 (mig 601 rail; urgency must be one of
  -- low/normal/high/critical).
  v_ladder :=
    'Meet safety ladder, armed with your consent: miss a check-in and your phone is pushed at once, ' ||
    'again at 3 and 6 minutes. When the grace window closes the pushes go critical, every 3 minutes. ' ||
    '15 minutes after that you get one final warning with a countdown. 30 minutes after the grace window, ' ||
    v_contact.name || ' is sent a plain message with the venue, the address, the meet time, and a request ' ||
    'to call or check on you. Any check-in tap stops the whole ladder.';
  PERFORM register_penalty_preview(
    v_plan.user_id, 'meet_safety_plans', v_plan.id,
    'meet_safety_escalation', v_ladder, v_arrival_due, 30, 'high');

  UPDATE meet_safety_plans
     SET status = 'armed',
         armed_at = now(),
         contact_evidence = contact_evidence || jsonb_build_object(
           'contact_name', v_contact.name,
           'contact_channel', v_contact.channel,
           'consented_at', v_contact.consented_at,
           'last_channel_verified_at', v_contact.last_channel_verified_at,
           'armed_with_ladder', v_ladder)
   WHERE id = v_plan.id;

  INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
  VALUES (v_plan.user_id, 'meet_plan_armed', 'meet_safety',
          'Safety plan armed: ' || v_plan.venue_name || ' at ' || to_char(v_plan.meet_at, 'YYYY-MM-DD HH24:MI') || ' UTC, net = ' || v_contact.name,
          jsonb_build_object('plan_id', v_plan.id, 'contact_id', v_contact.id, 'meet_at', v_plan.meet_at));

  RETURN jsonb_build_object('ok', true, 'plan_id', v_plan.id, 'armed_at', now(),
                            'checkins', jsonb_build_array(v_arrival_due, v_mid_due, v_home_due));
END;
$fn$;
GRANT EXECUTE ON FUNCTION arm_meet_safety_plan(UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Dispatch queuing helper + ack_meet_checkin
-- ═══════════════════════════════════════════════════════════════════════════

-- Queue a stage-3 (or false-alarm) send to the trusted contact. p_stealth is
-- the duress path: the plan keeps reading as live/checked-in; only this
-- service-visible row carries the truth.
CREATE OR REPLACE FUNCTION queue_meet_escalation(
  p_checkin UUID, p_kind TEXT, p_help BOOLEAN DEFAULT FALSE, p_stealth BOOLEAN DEFAULT FALSE
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_c meet_checkins%ROWTYPE;
  v_plan meet_safety_plans%ROWTYPE;
  v_contact trusted_contacts%ROWTYPE;
  v_last_ok TIMESTAMPTZ;
  v_dispatch UUID;
BEGIN
  SELECT * INTO v_c FROM meet_checkins WHERE id = p_checkin;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No check-in with that id exists.';
  END IF;
  SELECT * INTO v_plan FROM meet_safety_plans WHERE id = v_c.plan_id;
  SELECT * INTO v_contact FROM trusted_contacts WHERE id = v_plan.trusted_contact_id;
  IF v_contact.consent_status <> 'consented' THEN
    RAISE EXCEPTION 'The safety contact for this plan is not consented — cannot dispatch to them.';
  END IF;
  SELECT max(responded_at) INTO v_last_ok
    FROM meet_checkins WHERE plan_id = v_plan.id AND response = 'ok';

  INSERT INTO meet_escalation_dispatch (user_id, checkin_id, contact_id, kind, channel, payload)
  VALUES (v_plan.user_id, v_c.id, v_contact.id, p_kind, v_contact.channel,
          jsonb_build_object(
            'contact_name', v_contact.name,
            'channel_value', v_contact.channel_value,
            'user_name', v_contact.knows_user_as,
            'venue_name', v_plan.venue_name,
            'venue_address', v_plan.venue_address,
            'meet_at', v_plan.meet_at,
            'date_label', v_plan.contact_label,
            'checkin_kind', v_c.kind,
            'last_checkin_at', v_last_ok,
            'user_asked_for_help', p_help,
            'stealth', p_stealth))
  RETURNING id INTO v_dispatch;

  IF p_kind = 'escalation' AND NOT p_stealth THEN
    UPDATE meet_safety_plans SET status = 'escalated' WHERE id = v_plan.id;
  END IF;

  -- Authority log (owner-readable): NEUTRAL wording for stealth fires so a
  -- duress fire leaves no user-visible trace.
  INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
  VALUES (v_plan.user_id,
          CASE WHEN p_stealth THEN 'checkin_recorded' ELSE 'meet_escalation_' || p_kind END,
          'meet_safety',
          CASE WHEN p_stealth THEN 'Check-in recorded.'
               WHEN p_kind = 'false_alarm' THEN 'False-alarm follow-up queued to ' || v_contact.name || '.'
               ELSE 'Safety message queued to ' || v_contact.name || ' after missed ' || v_c.kind || ' check-in.' END,
          CASE WHEN p_stealth THEN jsonb_build_object('checkin_id', v_c.id)
               ELSE jsonb_build_object('checkin_id', v_c.id, 'dispatch_id', v_dispatch, 'plan_id', v_plan.id) END);

  RETURN v_dispatch;
END;
$fn$;
GRANT EXECUTE ON FUNCTION queue_meet_escalation(UUID, TEXT, BOOLEAN, BOOLEAN) TO service_role;

-- Ack a check-in. response: 'ok' | 'extend' | 'help' | 'duress'.
--   ok     — responded; cancels every pending escalation for the check-in;
--            home_safe ok completes the plan; ok after a stage-3 fire queues
--            the false-alarm follow-up.
--   extend — home_safe only: +1h, max 3 times; deadline shifts, not an ack.
--   help   — immediate stage 3.
--   duress — immediate stage 3 with NO visible state change: the row is
--            stored as a normal 'ok' check-in (the real signal lives in
--            meet_escalation_dispatch, which has no owner-read policy).
CREATE OR REPLACE FUNCTION ack_meet_checkin(p_checkin UUID, p_response TEXT, p_via TEXT DEFAULT 'app')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_c meet_checkins%ROWTYPE;
  v_plan meet_safety_plans%ROWTYPE;
  v_new_due TIMESTAMPTZ;
  v_had_fired BOOLEAN;
BEGIN
  IF p_response NOT IN ('ok','extend','help','duress') THEN
    RAISE EXCEPTION 'Unknown check-in response "%". Valid: ok, extend, help, duress.', p_response;
  END IF;

  SELECT * INTO v_c FROM meet_checkins WHERE id = p_checkin FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No check-in with that id exists.';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_c.user_id THEN
    RAISE EXCEPTION 'This check-in belongs to a different user.';
  END IF;
  SELECT * INTO v_plan FROM meet_safety_plans WHERE id = v_c.plan_id FOR UPDATE;

  v_had_fired := v_c.escalation_stage >= 3;

  IF p_response = 'help' OR p_response = 'duress' THEN
    -- Instant stage 3 regardless of any earlier ack.
    PERFORM queue_meet_escalation(v_c.id, 'escalation', TRUE, p_response = 'duress');
    IF p_response = 'duress' THEN
      -- Visible state: a normal successful check-in. Nothing else moves.
      UPDATE meet_checkins
         SET responded_at = COALESCE(responded_at, now()),
             response = 'ok',
             responded_via = COALESCE(responded_via, p_via),
             next_escalation_at = NULL
       WHERE id = v_c.id;
      RETURN jsonb_build_object('ok', true, 'checked_in', true);
    END IF;
    UPDATE meet_checkins
       SET responded_at = now(), response = 'help', responded_via = p_via,
           escalation_stage = 3, next_escalation_at = NULL
     WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'escalated', true);
  END IF;

  IF p_response = 'extend' THEN
    IF v_c.kind <> 'home_safe' THEN
      RAISE EXCEPTION 'Only the home-safe check-in can be extended.';
    END IF;
    IF v_c.times_extended >= 3 THEN
      RAISE EXCEPTION 'The home-safe check-in has already been extended 3 times — that is the limit. Check in instead.';
    END IF;
    v_new_due := v_c.due_at + interval '1 hour';
    UPDATE meet_checkins
       SET due_at = v_new_due, times_extended = v_c.times_extended + 1,
           escalation_stage = 0, next_escalation_at = NULL
     WHERE id = v_c.id;
    RETURN jsonb_build_object('ok', true, 'extended_to', v_new_due, 'extensions_left', 3 - v_c.times_extended - 1);
  END IF;

  -- p_response = 'ok'
  IF v_c.responded_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE meet_checkins
     SET responded_at = now(), response = 'ok', responded_via = p_via,
         next_escalation_at = NULL
   WHERE id = v_c.id;

  IF v_had_fired THEN
    -- Stage 3 already went out: she is safe — queue "false alarm, all good".
    PERFORM queue_meet_escalation(v_c.id, 'false_alarm', FALSE, FALSE);
    IF v_c.kind = 'home_safe' THEN
      -- She's home; the plan is over.
      UPDATE meet_safety_plans SET status = 'false_alarm', completed_at = now() WHERE id = v_plan.id;
    ELSE
      -- Earlier check-in false-alarmed but the meet continues: back to live
      -- so the remaining check-ins (e.g. home_safe) stay watched.
      UPDATE meet_safety_plans SET status = 'live' WHERE id = v_plan.id;
    END IF;
  ELSIF v_c.kind = 'home_safe' AND v_plan.status IN ('live','armed') THEN
    UPDATE meet_safety_plans SET status = 'completed', completed_at = now() WHERE id = v_plan.id;
    INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
    VALUES (v_plan.user_id, 'meet_plan_completed', 'meet_safety',
            'Home safe confirmed — plan completed.', jsonb_build_object('plan_id', v_plan.id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'checked_in', true,
                            'plan_completed', v_c.kind = 'home_safe' AND NOT v_had_fired);
END;
$fn$;
GRANT EXECUTE ON FUNCTION ack_meet_checkin(UUID, TEXT, TEXT) TO authenticated, service_role;

-- One-tap ack from the lock screen: the watcher's pushes carry
-- kind='meet_checkin' + trigger_reason 'meet_checkin:<checkin_id>:...'.
-- The SW's "Mark done" action (mig 617 action_kind='plain') POSTs
-- /api/outreach/complete, which stamps completed_at — this trigger turns
-- that stamp into the check-in ack, so no new SW/route code is needed.
CREATE OR REPLACE FUNCTION trg_meet_checkin_ack_on_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_checkin UUID;
BEGIN
  IF NEW.kind = 'meet_checkin'
     AND NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL
     AND NEW.trigger_reason LIKE 'meet_checkin:%' THEN
    v_checkin := split_part(NEW.trigger_reason, ':', 2)::uuid;
    PERFORM ack_meet_checkin(v_checkin, 'ok', 'push_action');
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS meet_checkin_ack_on_complete ON handler_outreach_queue;
CREATE TRIGGER meet_checkin_ack_on_complete
  AFTER UPDATE OF completed_at ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_meet_checkin_ack_on_complete();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. meet_safety_watch — the 1-minute ladder
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION meet_safety_watch()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_flipped INT := 0;
  v_pushes INT := 0;
  v_fired INT := 0;
  v_target INT;
  v_grace_end TIMESTAMPTZ;
  v_fire_at TIMESTAMPTZ;
  v_mins_to_fire INT;
  v_msg TEXT;
  v_next TIMESTAMPTZ;
  v_contact_name TEXT;
BEGIN
  -- NOTE: no pause / safeword / conditioning-gate check here BY DESIGN.
  -- The safety watcher is the one thing that runs during pause; a live meet
  -- plan must never be suppressed.

  -- armed → live at meet time.
  FOR r IN SELECT id, user_id FROM meet_safety_plans WHERE status = 'armed' AND meet_at <= now() LOOP
    UPDATE meet_safety_plans SET status = 'live' WHERE id = r.id;
    v_flipped := v_flipped + 1;
    INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
    VALUES (r.user_id, 'meet_plan_live', 'meet_safety', 'Meet started — plan is live, watcher on.',
            jsonb_build_object('plan_id', r.id));
  END LOOP;

  -- Escalation ladder over open check-ins. Mirrors escalationStep() in
  -- supabase/functions/_shared/meet-safety-core.ts.
  FOR r IN
    SELECT c.*, p.status AS plan_status, p.trusted_contact_id, p.user_id AS plan_user
      FROM meet_checkins c
      JOIN meet_safety_plans p ON p.id = c.plan_id
     WHERE c.responded_at IS NULL
       AND p.status IN ('live','escalated')
       AND (c.due_at <= now() OR (c.next_escalation_at IS NOT NULL AND c.next_escalation_at <= now()))
  LOOP
    v_grace_end := r.due_at + make_interval(mins => r.grace_minutes);
    v_fire_at := v_grace_end + interval '30 minutes';
    v_target := CASE
      WHEN now() >= v_fire_at THEN 3
      WHEN now() >= v_grace_end + interval '15 minutes' THEN 2
      WHEN now() >= v_grace_end THEN 1
      WHEN now() >= r.due_at THEN 0
      ELSE -1 END;
    IF v_target < 0 THEN CONTINUE; END IF;
    -- Send when climbing a stage, or when the scheduled re-send is due, or
    -- when nothing has been sent yet for this check-in.
    IF v_target <= r.escalation_stage
       AND r.next_escalation_at IS NOT NULL AND now() < r.next_escalation_at THEN
      CONTINUE;
    END IF;

    SELECT name INTO v_contact_name FROM trusted_contacts WHERE id = r.trusted_contact_id;
    v_mins_to_fire := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_fire_at - now())) / 60)::int);

    IF v_target = 0 THEN
      v_msg := CASE r.kind
        WHEN 'arrival' THEN 'Arrival check-in: you should be there by now. Are you okay? Tap "Mark done" to check in — one tap, that''s all.'
        WHEN 'mid' THEN 'Mid-date check-in: quick pulse — everything okay? Tap "Mark done" to check in.'
        ELSE 'Home-safe check-in: are you home and safe? Tap "Mark done" to confirm, or extend an hour from the app.'
      END;
      -- next stage-0 re-push at due+3m then due+6m, then hand to grace end.
      v_next := CASE
        WHEN r.due_at + interval '3 minutes' > now() AND r.due_at + interval '3 minutes' < v_grace_end THEN r.due_at + interval '3 minutes'
        WHEN r.due_at + interval '6 minutes' > now() AND r.due_at + interval '6 minutes' < v_grace_end THEN r.due_at + interval '6 minutes'
        ELSE v_grace_end END;
    ELSIF v_target = 1 THEN
      v_msg := 'You missed your ' || replace(r.kind, '_', ' ') || ' check-in and the grace window is closed. Tap "Mark done" right now. If you stay silent, ' ||
               COALESCE(v_contact_name, 'your safety person') || ' gets the safety message in ' || v_mins_to_fire || ' minutes.';
      v_next := now() + interval '3 minutes';
    ELSIF v_target = 2 THEN
      v_msg := 'Final warning: you still haven''t checked in. In ' || v_mins_to_fire || ' minute' || CASE WHEN v_mins_to_fire = 1 THEN '' ELSE 's' END || ' ' ||
               COALESCE(v_contact_name, 'your safety person') || ' gets the safety message with the venue and the time. One tap on "Mark done" stops it.';
      v_next := now() + interval '3 minutes';
    ELSIF r.escalation_stage < 3 THEN
      -- Stage 3 transition: FIRE.
      PERFORM queue_meet_escalation(r.id, 'escalation', FALSE, FALSE);
      v_fired := v_fired + 1;
      v_msg := COALESCE(v_contact_name, 'Your safety person') || ' has been sent the safety message with the venue and the time. If you''re okay, tap "Mark done" the moment you can and they''ll get a false-alarm follow-up.';
      v_next := now() + interval '3 minutes';
    ELSE
      -- Post-fire pressure until she acks.
      v_msg := COALESCE(v_contact_name, 'Your safety person') || ' has the safety message. Tap "Mark done" as soon as you''re able so they know you''re safe.';
      v_next := now() + interval '3 minutes';
    END IF;

    -- Critical urgency: bypasses the source throttle (579) by design, and
    -- the mig 617 bridge turns kind='meet_checkin' into a one-tap
    -- action_kind='plain' "Mark done" push whose completion acks the
    -- check-in (trigger above). trigger_reason embeds the checkin id
    -- (position 2) + an epoch suffix so the 265/267 dedup never collapses
    -- consecutive sends.
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at)
    VALUES (r.plan_user, v_msg, 'critical',
            'meet_checkin:' || r.id::text || ':s' || v_target || ':' || floor(extract(epoch from now()))::text,
            'meet_safety', 'meet_checkin', now(), now() + interval '45 minutes');
    v_pushes := v_pushes + 1;

    UPDATE meet_checkins
       SET escalation_stage = GREATEST(escalation_stage, v_target),
           next_escalation_at = v_next
     WHERE id = r.id;
  END LOOP;

  -- Heartbeat EVERY run — blind-spot assertions key off this.
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('meet_safety_watch', 'info', 'heartbeat',
          'watch ok: ' || v_flipped || ' flipped live, ' || v_pushes || ' pushes, ' || v_fired || ' fired',
          jsonb_build_object('flipped_live', v_flipped, 'pushes', v_pushes, 'stage3_fired', v_fired));

  RETURN jsonb_build_object('ok', true, 'flipped_live', v_flipped, 'pushes', v_pushes, 'stage3_fired', v_fired);
END;
$fn$;
GRANT EXECUTE ON FUNCTION meet_safety_watch() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. pg_cron — watcher every minute, dispatch drain every minute
-- ═══════════════════════════════════════════════════════════════════════════

-- Extension-creation guards: the ONLY permitted EXCEPTION WHEN OTHERS in this
-- file (Supabase rejects CREATE EXTENSION IF NOT EXISTS with 2BP01 on
-- prior-grant collisions).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('meet-safety-watch', 'meet-safety-dispatch-drain') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- SAFETY-CRITICAL: whitelist in any cron prune
SELECT cron.schedule(
  'meet-safety-watch',
  '* * * * *',
  'SELECT meet_safety_watch();'
);

-- SAFETY-CRITICAL: whitelist in any cron prune
SELECT cron.schedule(
  'meet-safety-dispatch-drain',
  '* * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/meet-safety-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id
    WHERE EXISTS (SELECT 1 FROM meet_escalation_dispatch WHERE status = 'pending');
  $cmd$
);
