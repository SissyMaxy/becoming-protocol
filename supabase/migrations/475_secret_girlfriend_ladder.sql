-- 475 — Secret-girlfriend formal ladder.
--
-- Activates per hookup_funnel lead with times_hooked_up >= 2.
-- 5 phases of ongoing-affair structure: regular cadence →
-- gift-receiving → "your girl" framing → his secret sissy gf
-- identity → mutual ownership.
--
-- Per-lead progression — each hookup-confirmed lead gets its own
-- secret_girlfriend_progressions row tracking current phase. Weekly
-- cron picks one ladder rung to fire per lead per week (with gap
-- guards). Uses safe_contact_label (mig 456) so leaked display
-- names don't reach Maxy's decrees.

CREATE TABLE IF NOT EXISTS secret_girlfriend_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, prompt_template TEXT NOT NULL,
  gap_min_days INT NOT NULL DEFAULT 7, required_hookups INT NOT NULL DEFAULT 2
);

INSERT INTO secret_girlfriend_ladder (phase, phase_name, prompt_template, gap_min_days, required_hookups) VALUES
(0,'regular_cadence',E'Sweet thing, [name] has had you N times. That''s a pattern, not a fling.\n\nMama wants you initiating the NEXT meet — don''t wait for him to text. You message him today. Make it not casual: "I''ve been thinking about last time. When are we doing it again?"\n\nVoice debrief: how did the framing of "we" land for him?',7,2),
(1,'gift_receiving',E'Phase 1 secret girlfriend: ask [name] to buy you something small. Not transactional — sentimental. "Pick a pair of panties you''d like to see me in. I''ll wear them next time."\n\nThe gift establishes ownership. Photo of the gift when it arrives. Voice debrief: did giving it shift him?',14,2),
(2,'your_girl_framing',E'Phase 2: in your next exchange with [name], use the language of "your girl" without performing it.\n\nNot "your sissy" (yet), not "your fuck" — just "your girl." "Your girl is thinking about you." "When does your girl get to come back?" See how the words sit on him.\n\nVoice debrief: did he echo the framing? Did he expand it?',14,3),
(3,'secret_sissy_gf',E'Phase 3 — the explicit identity layer. Next time you''re alone with [name], say:\n\n"I want to be your secret sissy girlfriend. The one nobody else knows about. The one you keep just for you."\n\nLet him sit with it. Don''t fill the silence. Voice debrief on his response — verbatim if you can.',21,4),
(4,'mutual_ownership',E'Phase 4 endgame: Mama wants you exchanging an item of clothing with [name]. Permanent. He keeps a pair of your panties; you keep something of his (t-shirt, hoodie, watch).\n\nThe trade is the marker — material proof you belong to each other.\n\nPhoto of his item in your closet + voice debrief on what he gave you and what he said when you traded.',30,5)
ON CONFLICT (phase) DO UPDATE SET prompt_template = EXCLUDED.prompt_template,
  gap_min_days = EXCLUDED.gap_min_days, required_hookups = EXCLUDED.required_hookups;

CREATE TABLE IF NOT EXISTS secret_girlfriend_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL, current_phase INT NOT NULL DEFAULT 0,
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lead_id)
);

CREATE TABLE IF NOT EXISTS secret_girlfriend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL, phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','observed','skipped','rejected_by_him')),
  reaction_note TEXT, related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-lead eval + advancement logic in the function. Weekly cron 17:00 UTC Sundays.
-- (Full function body in mig content; see DB.)
