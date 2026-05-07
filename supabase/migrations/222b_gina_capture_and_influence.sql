-- Migration 221: Gina Capture + Influence Engine
-- Adds the tables that underpin the Gina Influence Engine (Layer 1 prompt rules,
-- Layer 2 window indicator, Layer 3 warmup auto-queue). The previous conversation
-- shipped GinaCaptureCard.tsx + api/handler/chat.ts reads against these tables
-- without an accompanying migration — this closes that gap and adds the reactions
-- + warmup-queue tables needed for Layer 3.

-- ─── gina_profile ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gina_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tone_register TEXT[] NOT NULL DEFAULT '{}',
  affection_language TEXT,
  conflict_style TEXT,
  humor_style TEXT,
  triggers TEXT[] NOT NULL DEFAULT '{}',
  soft_spots TEXT[] NOT NULL DEFAULT '{}',
  red_lines TEXT[] NOT NULL DEFAULT '{}',
  channel_for_hard_topics TEXT,
  best_time_of_day TEXT,
  best_day_of_week TEXT,
  current_stress_level INTEGER CHECK (current_stress_level IS NULL OR (current_stress_level >= 0 AND current_stress_level <= 10)),
  current_stance_on_feminization TEXT,
  prior_consent_signals TEXT[] NOT NULL DEFAULT '{}',
  therapist_status TEXT,
  marriage_length_years INTEGER,
  shared_references TEXT,
  notes TEXT,
  intake_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gina_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gina profile"
  ON gina_profile FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── gina_voice_samples ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gina_voice_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  context TEXT,
  tone TEXT,
  topic TEXT,
  channel TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_voice_samples_user_time
  ON gina_voice_samples(user_id, captured_at DESC);

ALTER TABLE gina_voice_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gina voice samples"
  ON gina_voice_samples FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── gina_reactions ───────────────────────────────────────────────────────────
-- Logs Gina's reaction to each Handler-drafted move so Layer 2/3 can reaction-tune.
CREATE TABLE IF NOT EXISTS gina_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  move_kind TEXT NOT NULL,                       -- warmup / disclosure / hrt_reveal / ask / other
  move_summary TEXT NOT NULL,                    -- what was sent/said
  channel TEXT,                                  -- text / in_person / letter / other
  reaction TEXT NOT NULL CHECK (reaction IN ('positive', 'neutral', 'stalled', 'hostile', 'unknown')),
  reaction_detail TEXT,
  linked_directive_id UUID REFERENCES handler_directives(id) ON DELETE SET NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_reactions_user_time
  ON gina_reactions(user_id, observed_at DESC);

ALTER TABLE gina_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gina reactions"
  ON gina_reactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── gina_warmup_queue ────────────────────────────────────────────────────────
-- Layer 3: when a Gina-facing escalation is booked, 2-3 warmups are auto-scheduled
-- in the days before. Kept separate from handler_directives so the planner can see
-- "already warming up for X" without filtering the main directive stream.
CREATE TABLE IF NOT EXISTS gina_warmup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_event TEXT NOT NULL,                    -- e.g. 'hrt_reveal_step_2' / 'disclosure_draft_X'
  target_fires_at TIMESTAMPTZ NOT NULL,          -- when the hard ask is scheduled
  warmup_move TEXT NOT NULL,                     -- human-readable: "bring her coffee + compliment her hair"
  affection_language TEXT,                       -- the language it's in (gestures/words/acts/touch)
  fires_at TIMESTAMPTZ NOT NULL,                 -- when this warmup should be performed
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'delivered', 'skipped', 'cancelled')),
  delivered_at TIMESTAMPTZ,
  reaction_id UUID REFERENCES gina_reactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_warmup_queue_user_fires
  ON gina_warmup_queue(user_id, fires_at);
CREATE INDEX IF NOT EXISTS idx_gina_warmup_queue_target
  ON gina_warmup_queue(user_id, target_event, status);

ALTER TABLE gina_warmup_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own gina warmup queue"
  ON gina_warmup_queue FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
