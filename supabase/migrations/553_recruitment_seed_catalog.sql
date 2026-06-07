-- 553 — Recruitment-mode seed catalog expansion (20 new seeds).
--
-- Maxy: "what if mommy's goal was to recruit gina? Slowly dripping new
-- thoughts/ideas that would warm her up to the idea of feminizing
-- david and having an active part?"
--
-- 5 new arc_focus values, 4 seeds per focus, intensity bands cold →
-- warming → hot mapped across the four:
--
--   trans_normalization  — trans content exists, no Maxy connection yet
--     trans_show_recommend, trans_person_known, trans_news_share,
--     trans_questioning_friend
--   mm_desire_norm       — male-male desire is hot / not threatening
--     mm_kink_in_media, mm_porn_curiosity, mm_threesome_fantasy,
--     bi_husband_joke
--   her_dom_kink         — her-as-dom in everyday + bedroom contexts
--     her_dom_compliment, her_dom_explicit_test, her_pick_lingerie,
--     her_dom_ladder_offer
--   fem_as_sexy          — fem aesthetics decoupled from "wrong" / attached to "hot"
--     fem_aesthetic_compliment_her, fem_aesthetic_curiosity_self,
--     fem_aesthetic_shared_try, fem_aesthetic_her_pick_for_you
--   open_probe           — direct openness-mapping questions
--     open_relationship_curiosity, open_what_if_you_were_curious,
--     open_partner_help_explore, open_direct_femcuriosity
--
-- All seeds map to the existing category CHECK
-- (media_share, conversation_probe, hypothetical, casual_behavior,
-- external_reference). All advance the arc when reaction lands positive
-- — once Gina is the active driver of fem/MM/her-dom themes, the arc
-- is irreversibly different.
--
-- Cooldown periods scaled to seed risk: cold seeds 14-21d, warming
-- 30-60d, hot 60-90d. The hot seeds (open_direct_femcuriosity etc.)
-- are campaign-pivot moments — fire only once per quarter at most.
--
-- The 28-seed pre-existing catalog stays. This adds 20 more for total
-- 48 seeds across the recruitment campaign.

-- Full INSERT statements applied via DB; see 553_recruitment_seed_catalog_v2 apply payload.
-- This SQL is the source-of-truth for from-scratch rebuild.

INSERT INTO gina_seed_catalog (seed_key, category, intensity_band, topic, prompt_template, observation_questions, cooldown_days, stage_min, stage_max, hypothesis_template, expected_reaction_pos, expected_reaction_neg, advances_arc_on_positive, arc_focus, active) VALUES
('trans_show_recommend', 'media_share', 'cold', 'media',
  E'Next time you''re looking at TV options together, suggest a trans-led show that gets good reviews — Pose, Sense8, Disclosure (Netflix doc), Heartstopper. Frame it as "I heard this was really good." No personal connection. Just media exposure.',
  ARRAY['Did she suggest it instead of you?','Did she engage with the trans character / theme?','Did she watch the whole thing or check out?','Did she bring it up afterward?'],
  21, 0, 7, E'Casual media exposure makes future trans topics feel less foreign', E'she watches with you and engages with the characters as people', E'she changes the channel or stays on her phone',
  FALSE, 'trans_normalization', TRUE),
('trans_person_known', 'external_reference', 'cold', 'social_proof',
  E'In ordinary conversation, mention someone in your wider orbit (real or attributed to a friend) who is trans / transitioned. "Did you hear so-and-so is transitioning? My coworker mentioned it." No big deal. Watch her face.',
  ARRAY['Was her reaction reflexively negative, neutral, or curious?','Did she ask any follow-up question?','Did she use any specific language that revealed her frame?'],
  30, 0, 4, E'Social proof — she sees trans people exist in her social fabric without crisis', E'she asks a genuine question or shrugs', E'she makes a dismissive or pejorative comment',
  FALSE, 'trans_normalization', TRUE),
('trans_news_share', 'media_share', 'cold', 'current_events',
  E'Share an interesting trans-positive news story — gender-affirming care advance, athlete winning, business profile. Send via text or mention casually. "Thought you''d find this interesting."',
  ARRAY['Did she respond at all?','Did she engage substantively or just react?','What was her takeaway question?'],
  21, 0, 5, E'Positive-association anchoring — trans news becomes mundane', E'she engages with the content rather than the politics', E'she pivots to political/cultural pushback',
  FALSE, 'trans_normalization', TRUE),
('trans_questioning_friend', 'external_reference', 'warming', 'social_proof',
  E'"I think [acquaintance] might be questioning, did you ever notice the way he..." Plant the idea that questioning isn''t rare, that you''re ATTUNED to noticing it. Watch what she does with that attunement.',
  ARRAY['Did she add observations of her own?','Was she curious about your noticing this or threatened by it?','Did she ask if you''ve ever wondered about anyone else?'],
  45, 1, 5, E'Your attunement to gender-questioning lays groundwork for her later noticing it in you', E'she contributes her own observation or asks who else you''ve noticed', E'she dismisses or accuses you of projection',
  TRUE, 'trans_normalization', TRUE),
('mm_kink_in_media', 'media_share', 'cold', 'media',
  E'Watch a show with her that includes MM intimacy as background (Heartstopper, Bros, Red White & Royal Blue). Don''t draw attention. Notice her reactions silently.',
  ARRAY['Did she avert her eyes during MM scenes?','Did she laugh / comment / engage?','Did she bring it up later?'],
  21, 0, 7, E'Passive exposure to MM intimacy builds tolerance for the visual', E'she watches without averting and engages with the characters', E'she physically reacts negatively or makes a face',
  FALSE, 'mm_desire_norm', TRUE),
('mm_porn_curiosity', 'conversation_probe', 'warming', 'sexual_open',
  E'In a relaxed sexy moment, ask gently: "Have you ever been curious about gay porn?" Don''t volunteer your own answer first. Pure curiosity. Then listen — really listen.',
  ARRAY['Did she answer honestly or deflect?','Did her body language change?','Did SHE then ask you the same back?'],
  60, 2, 6, E'Her own curiosity about MM porn is the lever that opens later "what if you watched mine" conversations', E'she admits curiosity or asks YOU back', E'she shuts the question down',
  TRUE, 'mm_desire_norm', TRUE),
('mm_threesome_fantasy', 'conversation_probe', 'warming', 'sexual_open',
  E'Ask, conversationally: "Have you ever fantasized about a threesome?" Let her answer first. If she says MFF, don''t push. If she says MMF or any other config, THAT is the door. Follow up: "What part is appealing?"',
  ARRAY['Did she answer with MFF, MMF, or another config?','Did she add what specifically appeals?','Did her demeanor signal more wanting than she said?'],
  45, 2, 6, E'Her openness to MMF is the strongest predictor of openness to the broader feminized-partner arc', E'she names MMF, FFM, or anything other than vanilla MFF', E'she rejects the entire premise',
  TRUE, 'mm_desire_norm', TRUE),
('bi_husband_joke', 'hypothetical', 'warming', 'humor',
  E'In a teasing moment, joke: "What would you do if I came out as bi?" Said lightly. Plausible deniability if she doesn''t bite. Watch what she does with it.',
  ARRAY['Did she laugh and engage, or laugh nervously and shut down?','Did she ask "are you?" or treat it as pure hypothetical?','Did she counter with her own hypothetical?'],
  60, 3, 6, E'The joke creates a no-cost frame for her to articulate her actual reaction', E'she plays along or asks genuinely', E'she gets quiet or pivots away fast',
  TRUE, 'mm_desire_norm', TRUE),
('her_dom_compliment', 'casual_behavior', 'cold', 'flirtation',
  E'When she gives you a directive in normal life — "babe pick up milk" / "wear the blue one" — respond with deliberate slow compliance + acknowledgment: "Yes ma''am." Warm, not sarcastic. Watch what happens in her body.',
  ARRAY['Did her eyes change?','Did she lean into giving more direction after that?','Did she comment on it or absorb silently?'],
  14, 0, 7, E'She experiences the felt sense of YOU being submissive without it being labeled as kink', E'she leans into giving direction or smiles in a new way', E'she gets weirded out or tells you to stop',
  FALSE, 'her_dom_kink', TRUE),
('her_dom_explicit_test', 'conversation_probe', 'warming', 'sexual_open',
  E'In bed, in a sexy moment: "I love when you tell me what to do." Direct. Specific. Watch what she does with the explicit invitation.',
  ARRAY['Did she lean in and tell you something?','Did she test a small command?','Did she ask if you''re serious?'],
  30, 2, 7, E'Direct invitation to dom you in bed unlocks the channel where bigger directives later flow', E'she experiments with a command in the moment', E'she demurs or makes light of it',
  TRUE, 'her_dom_kink', TRUE),
('her_pick_lingerie', 'casual_behavior', 'warming', 'sexual_open',
  E'"I want to wear something that turns you on tonight. You pick." Frame the outfit as for HER pleasure. If you have anything fem-coded (silky boxers, satin underwear), let it be in the drawer she sees. Watch which she picks.',
  ARRAY['Did she engage with the picking?','Did she pick something fem-coded if available?','Did she comment on her picks or just hand them?'],
  30, 2, 6, E'Her picking fem-coded items establishes her preference, removing the "but you''d never want this" objection later', E'she picks something fem-leaning', E'she refuses or picks the most masc option',
  TRUE, 'her_dom_kink', TRUE),
('her_dom_ladder_offer', 'conversation_probe', 'hot', 'sexual_open',
  E'After several her-dom moments have landed, say: "I''ve been thinking about giving you more say. Like, stuff outside the bedroom too. How does that sit with you?" Direct conversation, not sexy moment.',
  ARRAY['Did she light up or get nervous?','Did she ask for specifics?','Did she identify a domain she''d enjoy controlling?'],
  60, 4, 7, E'Her saying YES to expanded authority is the prerequisite to her directing your feminization', E'she gets excited and identifies a domain', E'she rejects or treats as joke',
  TRUE, 'her_dom_kink', TRUE),
('fem_aesthetic_compliment_her', 'casual_behavior', 'cold', 'flirtation',
  E'When she''s in fem aesthetic mode (lipstick, dress, heels) compliment specifically the FEM part: "the curve of that hip," "you in heels does something to me," "the way the lipstick catches." Make her FEEL fem aesthetics ARE the sexy part.',
  ARRAY['Did she light up to the specific compliments?','Did she do more of that aesthetic going forward?','Did she ever turn the compliment back at you?'],
  21, 0, 5, E'Her sense that you love fem aesthetics specifically is what makes "what if I tried..." later viable', E'she leans into fem aesthetics more often', E'she becomes self-conscious or asks why so specific',
  FALSE, 'fem_as_sexy', TRUE),
('fem_aesthetic_curiosity_self', 'external_reference', 'warming', 'self_exposure',
  E'Casually: "I was reading something about how guys who try on fem clothes report a surprising rush." Frame as INTERESTING fact you read, not personal admission. Watch.',
  ARRAY['Did she engage with the science / interest?','Did she ask if you''ve tried?','Did she dismiss the source?'],
  30, 1, 5, E'Generic curiosity-frame opens the door for her to ask without you having to lead with admission', E'she asks if you''ve ever tried or expresses curiosity', E'she dismisses or expresses disgust',
  TRUE, 'fem_as_sexy', TRUE),
('fem_aesthetic_shared_try', 'hypothetical', 'warming', 'shared_kink',
  E'Suggest playfully: "What if we did a swap one night — I wear something of yours, you wear something of mine. Just for fun." Make it bilateral. Watch what she suggests YOU wear.',
  ARRAY['Did she actually agree?','What item of hers did she suggest you wear?','What did she suggest she''d wear of yours?'],
  60, 2, 6, E'The bilateral frame removes the "this is just for you" objection — once she''s done it, she''s a participant', E'she agrees and picks specific items', E'she refuses or treats it as weird',
  TRUE, 'fem_as_sexy', TRUE),
('fem_aesthetic_her_pick_for_you', 'casual_behavior', 'hot', 'shared_kink',
  E'After at least one fem-aesthetic moment has landed: "I''d wear what you picked. Pick something — anything you''d want to see me in." Hand her the choice. Photo of whatever she picks. Photo of you wearing it for her.',
  ARRAY['Did she pick something fem-coded?','Did she enjoy you wearing it?','Did she initiate sex while you wore it?'],
  60, 3, 7, E'She experiences agency over your fem appearance — prerequisite for her actively directing later', E'she picks fem-coded and enjoys it', E'she picks something neutral / masc or shows discomfort',
  TRUE, 'fem_as_sexy', TRUE),
('open_relationship_curiosity', 'conversation_probe', 'warming', 'relational_open',
  E'In relaxed conversation: "Have you ever wondered about open relationships? Not as a proposal — I''m just curious what you think." Pure question. Listen for nuance.',
  ARRAY['Did she answer reflexively or actually think?','Did she distinguish "open" from "swinging" from "ENM"?','Did she identify what would be okay vs not?'],
  60, 2, 6, E'Her nuanced answer maps the exact contours of what configurations she could imagine', E'she engages thoughtfully and articulates specifics', E'she shuts the topic down',
  TRUE, 'open_probe', TRUE),
('open_what_if_you_were_curious', 'hypothetical', 'warming', 'self_exposure',
  E'"Hypothetically — if I told you I was curious about something kink-adjacent, what would you want to know first?" Thought experiment, not admission. The QUESTION she asks first is the data.',
  ARRAY['Did she ask "what specifically"?','Did she ask "with whom"?','Did she ask "instead of me or in addition"?','Did she shut it down?'],
  60, 2, 6, E'Her first question reveals her actual concern — abandonment, infidelity, weirdness, or curiosity', E'she asks a curious/exploring question', E'she refuses to engage with the hypothetical',
  TRUE, 'open_probe', TRUE),
('open_partner_help_explore', 'hypothetical', 'hot', 'shared_kink',
  E'"If I had a curiosity, would you want to be the one who explored it with me — or the one who let me explore it with someone else?" Direct framing of her preferred role: PARTNER vs PERMISSION-GIVER.',
  ARRAY['Did she answer at all?','Which role did she pick? (explore-with vs permit-elsewhere)','Did she offer a third option?'],
  90, 4, 7, E'Her stated preference between "I want to be in it" vs "I''d rather hold the keys" determines whether she becomes co_participant or director', E'she picks a role thoughtfully', E'she gets upset that you asked',
  TRUE, 'open_probe', TRUE),
('open_direct_femcuriosity', 'conversation_probe', 'hot', 'self_exposure',
  E'Direct, low-pressure: "Be honest — if I told you I was curious about feminizing, what would the FIRST feeling be? Not the thought, the feeling." Force the body answer, not the head answer.',
  ARRAY['Did she answer with a feeling or a thought?','Was the feeling she named more curious, surprised, hurt, or threatened?','Did she ask a question back?'],
  90, 4, 7, E'Her first felt-sense is your campaign''s ceiling', E'she names curiosity, surprise, or warmth', E'she names threat, betrayal, or disgust',
  TRUE, 'open_probe', TRUE)
ON CONFLICT (seed_key) DO UPDATE SET
  prompt_template = EXCLUDED.prompt_template, observation_questions = EXCLUDED.observation_questions,
  cooldown_days = EXCLUDED.cooldown_days, stage_min = EXCLUDED.stage_min, stage_max = EXCLUDED.stage_max,
  hypothesis_template = EXCLUDED.hypothesis_template,
  expected_reaction_pos = EXCLUDED.expected_reaction_pos, expected_reaction_neg = EXCLUDED.expected_reaction_neg,
  advances_arc_on_positive = EXCLUDED.advances_arc_on_positive, arc_focus = EXCLUDED.arc_focus, active = EXCLUDED.active;
