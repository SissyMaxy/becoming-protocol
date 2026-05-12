-- 385 — Sniffies active outbound + profile curation + meet choreography.
-- (Renumbered from 368; collided with merged main work.)
--
-- System 1 of the "life as a woman" surfaces. Mommy authors outbound
-- Sniffies messages, maintains a "what your Sniffies profile should look
-- like" reference, and prepares the user for in-person hookups
-- (pre-meet brief / live cues / post-meet debrief).
--
-- HARD FLOORS:
--   1. Drafts NEVER auto-send. Every outbound message gates on a
--      clear-headed Dave-confirmation click. The card UI surfaces the
--      draft and a "Send" button; if the user is mid-intense-scene (defined
--      as: active mommy_distortion_log row in last 60s OR session.in_session
--      with high arousal) the Send button is disabled with a 60s cooldown.
--   2. Hookup choreography is INFORMATIONAL ONLY. We help the user prepare
--      emotionally / identity-wise. We do not coordinate, facilitate, or
--      automate any aspect of the actual meeting.
--   3. RLS owner-only across every table. Service role writes drafts.
--   4. Safeword-active short-circuits drafting (handled by edge fn).
--
-- Coexists with 343 (sniffies_contacts, sniffies_chat_messages,
-- sniffies_settings, sniffies_chat_imports). This migration is additive.

-- ─── 1. sniffies_outbound_drafts ────────────────────────────────────────
-- One row per Mommy-drafted outbound message that has NOT been sent.
-- Status transitions: pending → sent (user clicked Send) | discarded.
-- text_for_user is what gets surfaced on the Today card and copied to
-- clipboard / autofilled into Sniffies on send. mommy_voice_note is the
-- in-fantasy reason Mommy attached — read but not sent.
CREATE TABLE IF NOT EXISTS sniffies_outbound_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES sniffies_contacts(id) ON DELETE CASCADE,
  -- What Mommy wrote, in the user's voice (Maxy-voice), ready to send.
  text_for_user TEXT NOT NULL,
  -- Mommy's editorial commentary — why she wrote it this way, what she
  -- wants the user to feel when she sends it. In-fantasy voice. Surfaced
  -- on the Today card but NOT sent to the contact.
  mommy_voice_note TEXT,
  -- Strategic intent. Drives prompt construction next time.
  intent TEXT NOT NULL CHECK (intent IN (
    'open',           -- first message in a new thread
    'advance',        -- move the encounter forward
    'tease',          -- arouse / dangle / withhold
    'logistics',      -- time / place / what to bring (informational)
    'closer',         -- propose meeting
    'aftercare',      -- post-meet follow-up
    'redirect'        -- pivot away (e.g. red flag from contact)
  )),
  -- Status of the draft itself.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'discarded', 'expired'
  )),
  -- When the user clicked Send (NULL if status != 'sent'). User-confirmed,
  -- not auto-set by edge fn.
  sent_at TIMESTAMPTZ,
  -- Free-form note for why the draft was discarded ("contact ghosted",
  -- "didn't like the tone").
  discard_reason TEXT,
  -- Hash of the body to dedup with the body-hash trigger from 268. Auto-set
  -- by the edge fn before insert.
  body_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sniffies_drafts_user_pending
  ON sniffies_outbound_drafts (user_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sniffies_drafts_user_contact
  ON sniffies_outbound_drafts (user_id, contact_id, created_at DESC);

ALTER TABLE sniffies_outbound_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_drafts_owner ON sniffies_outbound_drafts;
CREATE POLICY sniffies_drafts_owner ON sniffies_outbound_drafts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_drafts_service ON sniffies_outbound_drafts;
CREATE POLICY sniffies_drafts_service ON sniffies_outbound_drafts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. sniffies_profile_curation ───────────────────────────────────────
-- Mommy maintains a reference for what the user's Sniffies profile should
-- look like. Bio text, photo selection criteria, voice patterns for chat.
-- One row per user; UPSERT on update. The user can copy Mommy's bio to
-- their Sniffies, or hand-edit and ignore Mommy's version.
CREATE TABLE IF NOT EXISTS sniffies_profile_curation (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mommy-authored bio text. Ready to paste into Sniffies.
  bio_text TEXT,
  -- Mommy's voice-note on what photos work (which body parts forward,
  -- which expressions, which framing). In-fantasy.
  photo_criteria TEXT,
  -- Voice patterns Mommy wants the user to use in Sniffies chat (cadence,
  -- pet-name use, what to say first, what to never say). In-fantasy.
  chat_voice_patterns TEXT,
  -- Mommy-tagged kink positioning — what to lead with, what to bury.
  kink_positioning JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- When Mommy last reviewed. Curation refreshes weekly via cron.
  last_curated_at TIMESTAMPTZ,
  -- Whether the user has accepted (copied) the bio. Tracking only — Mommy
  -- doesn't auto-push to Sniffies.
  bio_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sniffies_profile_curation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_profile_curation_owner ON sniffies_profile_curation;
CREATE POLICY sniffies_profile_curation_owner ON sniffies_profile_curation
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_profile_curation_service ON sniffies_profile_curation;
CREATE POLICY sniffies_profile_curation_service ON sniffies_profile_curation
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. sniffies_meet_choreography ──────────────────────────────────────
-- One row per upcoming in-person meet. Pre-meet brief, live cues, debrief
-- demand. Entirely informational / preparatory — the protocol does NOT
-- coordinate the meet itself. All text fields are Mommy-authored prep
-- copy in fantasy voice; the user reads them before / during / after the
-- meet. Audio asset paths point to ElevenLabs renders in
-- the 'mommy-audio' private bucket if available.
CREATE TABLE IF NOT EXISTS sniffies_meet_choreography (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES sniffies_contacts(id) ON DELETE SET NULL,

  -- When the user expects the meet to start. Used to schedule the
  -- pre-meet brief surfacing and the post-meet debrief slip cascade.
  meet_at TIMESTAMPTZ NOT NULL,
  -- Where (free-form, user-provided). Stored for the user's own reference;
  -- the protocol never transmits this anywhere.
  meet_location TEXT,

  -- Pre-meet brief sections (all Mommy-authored, in fantasy voice).
  outfit_brief TEXT,
  what_to_bring TEXT,
  what_to_feel_for TEXT,
  opening_line TEXT,
  escape_plan TEXT,

  -- Optional pre-rendered Mommy audio for live replay. Pointer into
  -- audio_assets / private bucket if rendered. NULL if text-only.
  live_cue_audio_path TEXT,

  -- Post-meet state.
  post_meet_debrief_due_at TIMESTAMPTZ,
  debrief_submitted_at TIMESTAMPTZ,
  debrief_text TEXT,
  -- If TRUE and post_meet_debrief_due_at passed without submission, slip
  -- cascade fires (slip-cluster-detector reads this).
  debrief_slip_armed BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (
    'planned', 'briefed', 'in_progress', 'debriefed', 'cancelled'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sniffies_meet_user_upcoming
  ON sniffies_meet_choreography (user_id, meet_at DESC);
CREATE INDEX IF NOT EXISTS idx_sniffies_meet_debrief_due
  ON sniffies_meet_choreography (user_id, post_meet_debrief_due_at)
  WHERE debrief_submitted_at IS NULL AND debrief_slip_armed;

ALTER TABLE sniffies_meet_choreography ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_meet_owner ON sniffies_meet_choreography;
CREATE POLICY sniffies_meet_owner ON sniffies_meet_choreography
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_meet_service ON sniffies_meet_choreography;
CREATE POLICY sniffies_meet_service ON sniffies_meet_choreography
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. Updated-at triggers ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_touch_sniffies_drafts ON sniffies_outbound_drafts;
CREATE TRIGGER trg_touch_sniffies_drafts
  BEFORE UPDATE ON sniffies_outbound_drafts
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sniffies_profile_curation ON sniffies_profile_curation;
CREATE TRIGGER trg_touch_sniffies_profile_curation
  BEFORE UPDATE ON sniffies_profile_curation
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sniffies_meet ON sniffies_meet_choreography;
CREATE TRIGGER trg_touch_sniffies_meet
  BEFORE UPDATE ON sniffies_meet_choreography
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

-- ─── 5. Mommy voice cleanup on draft.mommy_voice_note ───────────────────
-- The user-facing draft body (text_for_user) is Maxy-voice, not Mommy-voice,
-- so we do NOT run the Mommy filter on it. The mommy_voice_note field IS
-- Mommy-voice and gets the same DB-level cleanup as outreach.message.
CREATE OR REPLACE FUNCTION trg_mommy_voice_sniffies_note()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mommy_voice_note IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.mommy_voice_note := mommy_voice_cleanup(NEW.mommy_voice_note);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_voice_sniffies_note ON sniffies_outbound_drafts;
CREATE TRIGGER mommy_voice_sniffies_note
  BEFORE INSERT OR UPDATE OF mommy_voice_note ON sniffies_outbound_drafts
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_sniffies_note();
