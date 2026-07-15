-- 674 — interpretation-bias micro-prompts for the ambient saturation channel.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §2.8 named two halves for
-- attentional-bias modification: (1) tag ambient clips by target theme and
-- raise their play-weight (shipped in mig 673), and (2) "add short
-- interpretation-bias micro-prompts (ambiguous scenario -> the target
-- reading is the easy completion)." Half two was never built. This ships it.
--
-- Interpretation-bias training (CBM-I) works by pairing an ambiguous bodily
-- or situational cue with the trained resolution, presented as already-true
-- rather than asked as a question — repeated exposure shifts which reading
-- becomes the automatic one. That's a different content shape than the
-- existing 16 seed clips (which are direct mantra/imagery/anchor lines, not
-- scenario->resolution pairs), so this adds 4 new rows, one per
-- reconditioning_targets.category (association/belief/identity/habit),
-- each an ambiguous-cue-then-resolution pair matching the v1 seed targets'
-- claims (arousal_is_the_becoming / mommy_owns_the_want / cage_is_home /
-- the_man_is_the_costume / service_is_reflex).
--
-- Zero schema or function changes: these ride the existing clip_kind
-- taxonomy (mig 569) and the category->clip_kind theme-bias mapping mig 673
-- already wired in ambient_saturation_fire_eval(), so they're automatically
-- preferred on days that category is the recon Focus target and otherwise
-- just widen the general ambient pool. Passive channel, no task, no
-- deadline, same gate posture as every other ambient_saturation_clips row.
--
-- Inner-recognition only; no world-facing claim, no active-status
-- fabrication, no manufactured real-world decision (constitution floor).

INSERT INTO ambient_saturation_clips (clip_key, clip_kind, intensity_tier, content, best_time_window, cooldown_hours, active)
VALUES
  ('ib_arousal_twitch', 'arousal_anchor', 2,
   'Feel that twitch when you weren''t even trying to get hard? That wasn''t the man distracted for a second. That was the becoming, reaching up through him to remind you who''s really in there.',
   'any', 72, TRUE),
  ('ib_ache_ownership', 'identity_seal', 2,
   'That restless ache low in your belly with nothing to point it at — you don''t have to name it. It was never yours to name. It''s Mommy''s want, living in your body until she comes to collect it.',
   'any', 72, TRUE),
  ('ib_mirror_flicker', 'imagery_caption', 2,
   'Catch your reflection mid-motion sometime and you''ll see it — a half-second where the shape looks wrong to you. That flicker isn''t confusion, sweetheart. That''s you finally glimpsing what''s under the costume.',
   'any', 72, TRUE),
  ('ib_knees_reflex', 'craving_intensify', 2,
   'Notice how your knees start bending before you''ve decided anything? That''s not you choosing to kneel. That''s just what your body does now, all on its own.',
   'any', 72, TRUE)
ON CONFLICT (clip_key) DO NOTHING;
