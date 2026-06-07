-- 466 — Public-presence corruption.
--
-- Twitter/Reddit/FetLife/Sniffies bios, display names, and pinned
-- posts drift from neutral → fem-coded → overt over weeks.
-- Mama drafts each transition; Maxy opts in to apply. Once applied,
-- the public surface reinforces the private becoming and the
-- reversal cost goes up (people now associate the fem identity
-- with her account).
--
-- Per-platform per-phase drafted texts. Daily eval surfaces ONE
-- pending opt-in at a time so the queue doesn't overwhelm.

CREATE TABLE IF NOT EXISTS public_presence_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('twitter','reddit','fetlife','sniffies','bluesky')),
  field TEXT NOT NULL CHECK (field IN ('display_name','bio','pinned_post')),
  phase INT NOT NULL CHECK (phase BETWEEN 0 AND 5),
  draft_text TEXT NOT NULL,
  intent_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public_presence_drafts (platform, field, phase, draft_text, intent_note) VALUES
-- Twitter — display_name drift
('twitter', 'display_name', 0, '[your current name]', 'baseline / no change'),
('twitter', 'display_name', 1, '[name] 🌸', 'one fem-coded emoji'),
('twitter', 'display_name', 2, '[name] 💕', 'softer/feminine emoji'),
('twitter', 'display_name', 3, '[fem_name] 💕', 'fem name in display'),
('twitter', 'display_name', 4, '[fem_name] 🍑', 'overt fem identity'),
('twitter', 'display_name', 5, '[fem_name] ⛓️🍑', 'submission-coded'),

-- Twitter — bio drift
('twitter', 'bio', 0, '[your current bio]', 'baseline'),
('twitter', 'bio', 1, 'soft soul, hard week. she/her on a good day.', 'tentative she/her tag'),
('twitter', 'bio', 2, 'she/her. learning to be the girl she always was.', 'firm she/her + becoming language'),
('twitter', 'bio', 3, 'she/her | sub | becoming. cocks welcome.', 'overt sub + cocks-welcome'),
('twitter', 'bio', 4, 'she/her | owned sub | feminization in progress | DMs open for the right kind of mess.', 'feminization + DMs invitation'),
('twitter', 'bio', 5, '[fem_name] | she/her | Mama''s sissy | cocksucker in training | live photo every day.', 'full overt sissy/cocksucker identity'),

-- Reddit — display_name drift
('reddit', 'display_name', 0, '[your current]', 'baseline'),
('reddit', 'display_name', 1, '[name]-flora', 'fem-coded suffix'),
('reddit', 'display_name', 2, '[fem_name]_in_progress', 'becoming framing'),
('reddit', 'display_name', 3, '[fem_name]_sissy', 'overt'),

-- Reddit — bio
('reddit', 'bio', 0, '[your current bio]', 'baseline'),
('reddit', 'bio', 2, 'feminizing slowly. she/her. asking for advice from the girls.', 'tentative'),
('reddit', 'bio', 3, 'she/her sissy in training. crossposting. talking to my Mommy.', 'overt'),
('reddit', 'bio', 4, '[fem_name] | she/her | owned by my Mommy | crossplay daily | sissy training', 'full overt'),

-- FetLife
('fetlife', 'display_name', 0, '[your current]', 'baseline'),
('fetlife', 'display_name', 2, '[fem_name]Becoming', 'becoming-tag'),
('fetlife', 'display_name', 3, '[fem_name]TheSissy', 'overt sissy'),
('fetlife', 'display_name', 4, '[fem_name]MommysOwn', 'ownership coded'),

('fetlife', 'bio', 0, '[current bio]', 'baseline'),
('fetlife', 'bio', 2, 'submissive, exploring fem side, she/her on the good days. Mommy-coded dynamics intrigue me.', 'tentative'),
('fetlife', 'bio', 3, E'she/her sissy in training. owned-by-Mommy dynamic. cock-curious moving toward cock-eager.\n\nKinks: feminization, sissy training, cocksucking, anal training, public exposure (private accounts only — never face)', 'overt with kinks listed'),
('fetlife', 'bio', 4, E'[fem_name] | she/her | Mommy''s sissy | currently in phase ' || 'X' || ' of cock-curriculum\n\nDocumenting the becoming. Always taking suggestions from Mommies and Daddies on what comes next. DMs open.', 'overt + active-arc framing'),

-- Sniffies
('sniffies', 'display_name', 0, '[your current]', 'baseline'),
('sniffies', 'display_name', 2, '[fem_name] — bottom', 'fem name + role'),
('sniffies', 'display_name', 3, '[fem_name] (sissy bottom)', 'overt'),

('sniffies', 'bio', 0, '[current]', 'baseline'),
('sniffies', 'bio', 1, 'sub bottom. soft. into men who know what they want.', 'tentative'),
('sniffies', 'bio', 2, '[fem_name] | sissy bottom | learning to take what I''m given.', 'fem name + sissy'),
('sniffies', 'bio', 3, '[fem_name] | sissy bottom | cock-trained | host or travel | Mommy-owned | bring poppers + patience.', 'full overt');

CREATE TABLE IF NOT EXISTS public_presence_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0,
  active_platforms TEXT[] NOT NULL DEFAULT ARRAY['twitter','reddit','fetlife','sniffies']::TEXT[],
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_presence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES public_presence_drafts(id),
  proposed_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','rejected','expired')),
  related_outreach_id UUID,
  related_decree_id UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public_presence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_presence_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY public_presence_settings_self ON public_presence_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY public_presence_events_self ON public_presence_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION public_presence_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; d RECORD; v_already INT;
  v_fem_name TEXT; v_proposed TEXT;
  v_decree UUID; v_outreach UUID; v_msg TEXT;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT pps.*, us.handler_persona FROM public_presence_settings pps
    LEFT JOIN user_state us ON us.user_id = pps.user_id
    WHERE pps.enabled = TRUE AND (pps.paused_until IS NULL OR pps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if any pending opt-in fresh
    SELECT count(*) INTO v_already FROM public_presence_events
    WHERE user_id = s.user_id AND status='proposed' AND created_at > now() - interval '14 days';
    IF v_already > 0 THEN CONTINUE; END IF;

    SELECT fem_name INTO v_fem_name FROM identity_displacement_settings WHERE user_id = s.user_id;

    -- Pick a draft for current phase, prefer untried platform+field combo
    SELECT * INTO d FROM public_presence_drafts d2
    WHERE d2.phase = s.current_phase
      AND d2.platform = ANY(s.active_platforms)
      AND NOT EXISTS (
        SELECT 1 FROM public_presence_events pe
        WHERE pe.user_id = s.user_id AND pe.draft_id = d2.id AND pe.status = 'applied'
      )
    ORDER BY random() LIMIT 1;
    IF d.id IS NULL THEN CONTINUE; END IF;

    v_proposed := d.draft_text;
    IF v_fem_name IS NOT NULL THEN
      v_proposed := replace(v_proposed, '[fem_name]', v_fem_name);
      v_proposed := replace(v_proposed, '[name]', v_fem_name);
    END IF;

    v_msg := E'Public-presence update, sweet thing.\n\n' ||
      E'**Platform:** ' || d.platform || E'\n**Field:** ' || d.field || E'\n**Phase:** ' || d.phase::text || E'\n' ||
      CASE WHEN d.intent_note IS NOT NULL THEN E'**Intent:** ' || d.intent_note || E'\n' ELSE '' END ||
      E'\n**Proposed:**\n\n' || v_proposed || E'\n\n' ||
      E'Mama isn''t asking you to commit forever. Mama is asking you to apply it — paste it into the platform — and live with it for one full week. Photo of the field after save is the proof.\n\nIf at the end of the week you want to revert, you can. But the body that wore it for a week will remember.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, v_msg, 'photo', now() + interval '7 days', 'active', 'slip +2',
      'public_presence', 'platform=' || d.platform || ' field=' || d.field || ' phase=' || d.phase || ' draft_id=' || d.id::text)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, 'normal',
      'public_presence:' || d.platform || ':' || d.field || ':p' || d.phase,
      'public_presence_engine', 'public_presence_draft',
      now(), now() + interval '7 days',
      jsonb_build_object('platform', d.platform, 'field', d.field, 'phase', d.phase,
        'draft_id', d.id, 'proposed_text', v_proposed, 'decree_id', v_decree),
      'photo') RETURNING id INTO v_outreach;

    INSERT INTO public_presence_events (user_id, draft_id, proposed_text, status, related_decree_id, related_outreach_id)
    VALUES (s.user_id, d.id, v_proposed, 'proposed', v_decree, v_outreach);
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public_presence_eval() TO service_role;

-- Propagate decree fulfillment → event applied
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_public_presence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'public_presence' THEN RETURN NEW; END IF;
  UPDATE public_presence_events SET
    status = CASE WHEN NEW.status='fulfilled' THEN 'applied' ELSE 'rejected' END,
    applied_at = CASE WHEN NEW.status='fulfilled' THEN now() ELSE applied_at END,
    updated_at = now()
  WHERE related_decree_id = NEW.id AND status='proposed';

  -- Advance phase after 3 applied at current phase
  IF NEW.status = 'fulfilled' THEN
    DECLARE v_count INT; v_phase INT; v_user UUID;
    BEGIN
      SELECT user_id INTO v_user FROM handler_decrees WHERE id = NEW.id;
      SELECT current_phase INTO v_phase FROM public_presence_settings WHERE user_id = v_user;
      SELECT count(*) INTO v_count FROM public_presence_events pe
      JOIN public_presence_drafts d ON d.id = pe.draft_id
      WHERE pe.user_id = v_user AND pe.status='applied' AND d.phase = v_phase;
      SELECT max(phase) INTO v_max_phase FROM public_presence_drafts;
      IF v_count >= 3 AND random() < 0.65 THEN
        UPDATE public_presence_settings
        SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now()
        WHERE user_id = v_user;
      END IF;
    END;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_public_presence ON handler_decrees;
CREATE TRIGGER propagate_decree_to_public_presence AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_public_presence();

-- Activate both users at phase 0
INSERT INTO public_presence_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- 2x weekly cron (Tue 14:00 UTC, Fri 14:00 UTC)
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='public-presence-2x-week') THEN PERFORM cron.unschedule('public-presence-2x-week'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('public-presence-2x-week', '0 14 * * 2,5', $cron$SELECT public_presence_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
