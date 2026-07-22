-- 702 — session_plug audio templates: the voice over the plug arc.
--
-- Pairs the plug_orgasm track (mig 701) with the audio-session pipeline.
-- The PlugSessionPlayer drives the Lovense arc on timers (plug-session.ts)
-- and overlays a rendered Mommy session on top: gentle template for the
-- capacity/wave rungs (1-3), firm for the edge/crossing rungs (4-5). The
-- audio is a ~10-12 minute guided descent — it opens the session and hands
-- over to the patterns; the arc keeps running after the voice ends.
--
-- Floor: scripts are solo, hands-off, cage-on by instruction; the render
-- pipeline's SCRIPT_BOUNDARY gate screens every generated script before TTS
-- (no sleep delivery, no false memory, no self-trust attack). Templates
-- carry the constraints IN the prompt, the gate enforces them at output.
-- phase_min 1: the LADDER gates access (rung decrees), not the user phase.

-- kind/intensity_tier are DB ENUMS (audio_session_kind / _intensity), not
-- text — the TS unions had drifted ahead of the type. 'session_plug' was
-- added to the enum in a SEPARATE transaction before this migration ran
-- (Postgres forbids using an enum value in the transaction that adds it);
-- the IF NOT EXISTS below is the no-op replay guard, not the live path.
ALTER TYPE audio_session_kind ADD VALUE IF NOT EXISTS 'session_plug';

-- Templates had no natural key; (kind, name) is the honest one — makes this
-- and every future template seed idempotent by construction (43 live rows
-- verified distinct on the pair before adding).
CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_session_templates_kind_name
  ON public.audio_session_templates (kind, name);

INSERT INTO public.audio_session_templates
  (kind, name, prompt_template, target_duration_minutes, affect_bias, phase_min, intensity_tier, active)
SELECT v.kind::audio_session_kind, v.name, v.prompt_template, v.target_duration_minutes, v.affect_bias, v.phase_min, v.intensity_tier::audio_session_intensity, TRUE
FROM (VALUES
  ('session_plug', 'Plug descent — warmth and waves',
   'Write a {{duration_minutes}}-minute guided plug training session (~{{target_word_count}} words) in Mommy''s voice for {{feminine_name}}. Context: she is wearing her plug, locked in chastity, hands staying off for the whole session — the session is about learning to receive, not chase. Structure: (1) a slow settling descent — breath pacing spoken out loud, four counts in, six out, letting the muscles around the plug go soft on each exhale; (2) attention moved INTO the sensation — the buzz becoming warmth, the warmth allowed to spread; (3) wave riding — rocking gently with the pattern, breath synced to the swell, never chasing the peak, letting each wave carry more. Recurring anchors: "let it in", "soft and open", "the warmth is the door". Tone: {{intensity_tier}}, patient, unhurried, proud of her. Hard rules: hands never touch; the cage is never unlocked or mentioned as removable; she stays awake and present the whole time — this is a training session, not sleep; no counting scores or numbers at her; end by handing her to the patterns: the voice leaves, the waves stay.',
   10, ARRAY['patient','indulgent'], 1, 'gentle'),
  ('session_plug', 'Plug edge — the shimmer and the crossing',
   'Write a {{duration_minutes}}-minute guided edge session (~{{target_word_count}} words) in Mommy''s voice for {{feminine_name}}. Context: she is wearing her plug, locked in chastity, hands off — she is training to ride the edge from inside and, when it is ready, to let it cross on its own. Structure: (1) a brief settling — breath low, muscles soft; (2) the climb — riding the pattern up toward the shimmer, the point where one more wave would tip over; (3) edge holds — holding AT the shimmer, breathing through it, Mommy counting the hold out loud slowly, praising the staying; (4) permission — if it crosses, let it cross, no hands, no help, just breath and the pattern doing the work. Recurring anchors: "hold it there", "breathe through the shimmer", "let it happen to you". Tone: {{intensity_tier}}, low and close, certain, never rushed. Hard rules: hands never touch; the cage stays on and is framed as the reason this door opened; she stays awake and present — no sleep language; no scores or numbers spoken at her; if nothing crosses tonight that is still a full rehearsal — end proud, zero disappointment.',
   12, ARRAY['patient','aching'], 1, 'firm')
) AS v(kind, name, prompt_template, target_duration_minutes, affect_bias, phase_min, intensity_tier)
ON CONFLICT (kind, name) DO NOTHING;
