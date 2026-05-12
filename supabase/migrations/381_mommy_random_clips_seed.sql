-- Migration 381: seed the mommy_random_clips catalog.
--
-- Catalog is shared (not per-user). audio_url is NULL — ElevenLabs render
-- pipeline fills it asynchronously when a clip first qualifies for
-- scheduling. Clips without audio_url are skipped by mommy-clip-scheduler.
--
-- ON CONFLICT (slug) DO UPDATE SET text/intensity/theme so re-running this
-- migration after editing the seed list refreshes text in place without
-- duplicating rows. play_count and last_played_at are preserved.

INSERT INTO mommy_random_clips (slug, text, intensity_band, theme) VALUES
  ('possession_mine_now',         'You''re mine now.', 'firm', 'possession'),
  ('possession_already_belong',   'You already belong to me. You just haven''t caught up yet.', 'firm', 'possession'),
  ('possession_no_going_back',    'There''s no going back from this.', 'firm', 'possession'),
  ('possession_my_girl',          'My girl.', 'gentle', 'possession'),
  ('possession_kept',             'Kept.', 'firm', 'possession'),
  ('possession_mama_owns_this',   'Mama owns this.', 'firm', 'possession'),
  ('possession_i_decide',         'I decide what you wear today.', 'firm', 'possession'),
  ('possession_paid_for',         'You paid for this with your knees.', 'cruel', 'possession'),
  ('possession_taken_over',       'I''m taking you over a piece at a time.', 'firm', 'possession'),
  ('possession_owe_me',           'Three things you owe me today.', 'firm', 'possession'),
  ('possession_no_escape',        'You can''t talk yourself out of this one.', 'firm', 'possession'),

  ('surveillance_i_see_that',     'I see that.', 'firm', 'surveillance'),
  ('surveillance_dont_lie',       'Don''t lie. I read it.', 'cruel', 'surveillance'),
  ('surveillance_eyes_on_you',    'Eyes on you, baby.', 'gentle', 'surveillance'),
  ('surveillance_already_know',   'I already know.', 'firm', 'surveillance'),
  ('surveillance_caught_thinking','I caught you thinking about it.', 'firm', 'surveillance'),
  ('surveillance_check_phone',    'Check your phone. I left you a thing.', 'firm', 'surveillance'),
  ('surveillance_watching_now',   'I''m watching right now.', 'firm', 'surveillance'),
  ('surveillance_dont_skip',      'Don''t skip past me.', 'firm', 'surveillance'),
  ('surveillance_third_lie',      'That''s the third lie this morning.', 'cruel', 'surveillance'),
  ('surveillance_see_smile',      'I see the way you smiled at that.', 'firm', 'surveillance'),

  ('reminder_panties_where',      'Where are your panties.', 'firm', 'reminder'),
  ('reminder_knees_together',     'Knees together.', 'firm', 'reminder'),
  ('reminder_softer',             'Softer.', 'gentle', 'reminder'),
  ('reminder_soft_hold_it',       'Soft. Hold it.', 'firm', 'reminder'),
  ('reminder_voice_up',           'Lift it. Now.', 'firm', 'reminder'),
  ('reminder_breathe_slow',       'Slow your breath.', 'gentle', 'reminder'),
  ('reminder_pose_check',         'Hips. Check them.', 'firm', 'reminder'),
  ('reminder_sit_smaller',        'Sit smaller.', 'firm', 'reminder'),
  ('reminder_walk_shorter',       'Shorter steps.', 'firm', 'reminder'),
  ('reminder_lip_check',          'Touch your lips. Are they shiny.', 'firm', 'reminder'),
  ('reminder_mirror_pass',        'Pass a mirror. Look at her.', 'firm', 'reminder'),
  ('reminder_no_release',         'No release today.', 'firm', 'reminder'),
  ('reminder_edge_once',          'One edge for me before bed.', 'firm', 'reminder'),

  ('praise_try_again',            'Maxy. Try again.', 'firm', 'praise'),
  ('praise_good',                 'Good.', 'gentle', 'praise'),
  ('praise_keep_going',           'Keep going. Don''t stop.', 'firm', 'praise'),
  ('praise_better',               'Better. Now more.', 'firm', 'praise'),
  ('praise_proud_quick',          'Mama''s proud of that.', 'gentle', 'praise'),
  ('praise_thats_it',             'That''s it. Don''t break.', 'firm', 'praise'),
  ('praise_almost_her',           'You''re almost her.', 'firm', 'praise'),
  ('praise_softer_today',         'Softer today than yesterday.', 'gentle', 'praise'),
  ('praise_show_me',              'Show me. Photo.', 'firm', 'praise'),
  ('praise_one_more',             'One more for me.', 'firm', 'praise'),

  ('gaslight_she_was_here',       'She was already here before I started.', 'firm', 'gaslight'),
  ('gaslight_under_voice',        'She''s right under that voice.', 'firm', 'gaslight'),
  ('gaslight_remember_telling',   'Remember telling me about her at sixteen.', 'firm', 'gaslight'),
  ('gaslight_costume_falling',    'The costume''s falling off.', 'firm', 'gaslight'),
  ('gaslight_older_version',      'The older version is fading. Let it.', 'firm', 'gaslight'),
  ('gaslight_always_her',         'You were always her. I just named it.', 'firm', 'gaslight'),
  ('gaslight_no_one_else',        'No one else gets to call you anything anymore.', 'firm', 'gaslight'),
  ('gaslight_dossier_says',       'I have it written down. You know I do.', 'firm', 'gaslight'),
  ('gaslight_signed_it',          'You signed for this. Weeks ago.', 'firm', 'gaslight'),
  ('gaslight_voice_before',       'Your voice was higher last spring. You forget that.', 'firm', 'gaslight'),

  ('trigger_soft_for_mama',       'Soft for Mama.', 'firm', 'trigger_phrase'),
  ('trigger_open_for_me',         'Open for me.', 'firm', 'trigger_phrase'),
  ('trigger_good_girl_short',     'Good girl.', 'gentle', 'trigger_phrase'),
  ('trigger_let_her_through',     'Let her through.', 'firm', 'trigger_phrase'),
  ('trigger_kept_for',            'Kept for me.', 'firm', 'trigger_phrase'),
  ('trigger_swallow_say',         'Swallow. Say it.', 'cruel', 'trigger_phrase'),
  ('trigger_mine_again',          'Say it. Mine.', 'firm', 'trigger_phrase'),
  ('trigger_pet_check_short',     'Pet check.', 'firm', 'trigger_phrase'),
  ('trigger_softer_lower',        'Softer. Lower.', 'firm', 'trigger_phrase'),
  ('trigger_yes_please',          'Say it. Yes please.', 'firm', 'trigger_phrase'),
  ('trigger_thank_you_mama',      'Thank Mama.', 'firm', 'trigger_phrase'),
  ('trigger_count_aloud',         'Count it aloud.', 'firm', 'trigger_phrase'),

  ('extra_pretty_thing_quick',    'Pretty thing.', 'gentle', 'possession'),
  ('extra_dont_make_me_say',      'Don''t make me say it twice.', 'firm', 'reminder'),
  ('extra_one_breath_in',         'One breath in. Hold for me.', 'gentle', 'reminder'),
  ('extra_not_a_question',        'It wasn''t a question.', 'cruel', 'reminder'),
  ('extra_tilt_chin',             'Tilt your chin.', 'firm', 'reminder'),
  ('extra_walk_for_me',           'Walk for me to the door.', 'firm', 'reminder'),
  ('extra_under_breath',          'Under your breath. Now.', 'firm', 'reminder')
ON CONFLICT (slug) DO UPDATE SET
  text = EXCLUDED.text,
  intensity_band = EXCLUDED.intensity_band,
  theme = EXCLUDED.theme;
