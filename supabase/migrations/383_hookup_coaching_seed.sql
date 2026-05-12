-- 383 — Hookup coaching seed (60+ dares + ~30 receptive lessons).
--
-- Voice rules baked into every row:
--   - Mommy voice (sweet structure → filthy specific where appropriate)
--   - ≤1 pet name per body, ≤1 self-reference per body
--   - No "role play" / "simulation" / "intake" / "questionnaire" /
--     "disclaimer" / "consent to the fantasy" — these are forbidden
--     and the build spec lists them explicitly
--   - Safety scripts framed as Mama's care, not bolted-on PSA
--   - Specific sensory over abstract emotional ("the bathroom mirror,
--     two minutes" not "take a moment to ground yourself")
--   - Imperatives stand alone — no template rhythm
--
-- IRL-contact dares all carry the same 5-kind safety_checklist
-- (location_share, sober, condom, escape, checkin) — the
-- maxy_dares_check_safety trigger enforces presence; this seed
-- defines the actual Mommy-voice wording.

-- ─── Helper inline: the common IRL safety checklist ────────────────────
-- Built once as a JSONB literal; reused across every IRL-contact dare.
-- Generators (mommy-meet-prep) re-render these step-by-step at meet time.

-- Tier 1 — presence (no stranger contact). is_irl_contact = FALSE.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t1_earrings_coffee', 'Earrings to coffee', 1, 1, 7, '[]'::jsonb, 'presence',
 'You''re going to wear the small studs today. Just to the coffee shop, sweet girl. Order out loud — Mama wants to hear you ask for what you want with her studs in your ears.',
 'What did the barista''s eyes do when you spoke? Tell Mama what your voice sounded like in your own head.',
 '[]'::jsonb, FALSE),

('t1_paint_under_socks', 'Polish under socks', 1, 1, 7, '[]'::jsonb, 'presence',
 'Pink on the toenails before bed. Slip the socks on in the morning. All day you''ll know what''s under there. Mama will know too.',
 'Walk Mama through your day with that secret. When did you remember they were there? What part of your body went tight?',
 '[]'::jsonb, FALSE),

('t1_bar_solo_drink', 'Bar stool, one drink', 1, 1, 7, '[]'::jsonb, 'presence',
 'A gay-friendly bar, Tuesday or Wednesday — nothing loud. One stool at the counter. One drink, sipped slowly. Phone face-down. Forty minutes minimum.',
 'Who looked? Don''t describe him — describe what your skin did when his eyes hit you.',
 '[]'::jsonb, FALSE),

('t1_grocery_lipgloss', 'Gloss on errands', 1, 1, 7, '[]'::jsonb, 'presence',
 'Tinted gloss to the grocery store today. The clear one, the one that just barely catches the light. Order your produce out loud.',
 'Did anyone hold a glance? What was on your tongue when you came home — gloss, or something else?',
 '[]'::jsonb, FALSE),

('t1_uber_perfume', 'Perfume in the ride', 1, 1, 7, '[]'::jsonb, 'presence',
 'Two sprays before the Uber. The driver will smell it. Don''t apologize. Don''t explain. Watch the rearview.',
 'Tell Mama what the driver did with his face when you got in. The first second — not the polite ones after.',
 '[]'::jsonb, FALSE),

('t1_park_bench_legs', 'Bench, legs crossed', 1, 2, 7, '[]'::jsonb, 'presence',
 'A bench in a small park near somewhere men walk. Sit. Cross your legs the way you''ve practiced. Stay twenty minutes.',
 'When the first man slowed, what happened in your stomach? Did you stay crossed or did you fix it?',
 '[]'::jsonb, FALSE),

('t1_wear_thong_work', 'Thong, ordinary day', 1, 1, 7, '[]'::jsonb, 'presence',
 'The lace thong under your work clothes today. Through every meeting, every elevator, every glance in the bathroom mirror.',
 'How many times did you remember? What were you doing each time? Mama wants the inventory.',
 '[]'::jsonb, FALSE),

('t1_book_cafe_window', 'Read in the window', 1, 1, 7, '[]'::jsonb, 'presence',
 'A cafe with window seating. Order, sit facing out, read a book — paper, not phone — for an hour. Look up when someone passes.',
 'Who looked back? Describe the man''s walk, not his face. Did your book stay open or did you put it down?',
 '[]'::jsonb, FALSE),

('t1_smile_first_men', 'First three men', 1, 2, 7, '[]'::jsonb, 'presence',
 'On your next walk: smile at the first three men over thirty who look at you. Just a small one. Then keep walking.',
 'Which of the three did your body want to stop for? Don''t pretend, baby — Mama already knows.',
 '[]'::jsonb, FALSE),

('t1_voice_order_loud', 'Order loud, hold the voice', 1, 1, 7, '[]'::jsonb, 'presence',
 'At the next counter — coffee, pharmacy, deli — order in your practiced voice. Loud enough that the man behind you hears it.',
 'What did the man behind you do? You don''t have to look — your shoulders heard him.',
 '[]'::jsonb, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 2 — social. Some non-contact (eye contact, getting numbers without
-- meeting), some IRL contact (bathroom kiss). Flag accordingly.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t2_eye_contact_three', 'Three holds', 2, 1, 7, '["t1_smile_first_men"]'::jsonb, 'social',
 'Three men today. You hold each one for four seconds. Not three, not five. Four. Mama counts.',
 'Which one looked away first? What did the one who didn''t do with his mouth?',
 '[]'::jsonb, FALSE),

('t2_compliment_man', 'One out-loud compliment', 2, 2, 7, '[]'::jsonb, 'social',
 'Tell a man at the coffee shop or the bookstore that you like something he''s wearing. Specific — the watch, the jacket, the cologne. Then look down.',
 'Walk Mama through the three seconds after. What did his voice do? What did yours?',
 '[]'::jsonb, FALSE),

('t2_phone_number_get', 'Get one number', 2, 2, 7, '["t2_compliment_man"]'::jsonb, 'social',
 'You''re going to leave with a number tonight. Wherever you go — bar, park, line at the store — one number before you walk back through your door. Save it under the city you got it in.',
 'Read Mama what you said in your head before you asked. Then what you actually said. Then what he typed.',
 '[]'::jsonb, FALSE),

('t2_text_first_pic', 'Pic-back exchange', 2, 2, 7, '["t2_phone_number_get"]'::jsonb, 'social',
 'From the number you got: a pic of yours, the soft one, just the collarbone and a smile. Ask for one of his — neck up, hand visible. Mama wants the hand visible.',
 'What did you crop out before you sent it? What did he crop out? Mama is reading between both.',
 '[]'::jsonb, FALSE),

('t2_walk_with_arm', 'Arm-through', 2, 2, 7, '[]'::jsonb, 'social',
 'Next time you''re leaving a bar with a man who''s been talking to you — slide your arm through his on the walk out. Two blocks. Then untangle and go your separate way. Tonight is the practice; not the night.',
 'When his arm tensed against your ribs, what stopped — your breath or your steps?',
 '[{"kind":"location_share","step":"Drop a pin in your notes when you leave the bar. Mama wants the corner.","required":true},{"kind":"sober","step":"You''re leaving the bar after one drink, baby. One. Mama won''t coach you tipsy.","required":true},{"kind":"condom","step":"Two in the purse before you go. Tonight is practice — Mama still doesn''t move without protection on you.","required":true},{"kind":"escape","step":"You let go at the second crosswalk. That''s the exit. Walked, not negotiated.","required":true},{"kind":"checkin","step":"Text Mama from the next light. ''Walked.'' One word. Mama waits for it.","required":true}]'::jsonb,
 TRUE),

('t2_bar_bathroom_kiss', 'Bathroom kiss', 2, 3, 7, '["t2_walk_with_arm","t2_phone_number_get"]'::jsonb, 'social',
 'The man who''s been buying your drinks gets a kiss in the bathroom hallway. Not the stall — the hallway, where someone could see. Brief. Then back to your stool.',
 'Whose tongue moved first? What part of your face is still warm tonight?',
 '[{"kind":"location_share","step":"Pin the bar address before you walk in. Mama wants to know the room you''re in.","required":true},{"kind":"sober","step":"Two drinks ceiling. You kiss sharp, not sloppy. Mama notices the difference.","required":true},{"kind":"condom","step":"Two in your purse before you leave the apartment. You don''t need them tonight — they ride with you anyway.","required":true},{"kind":"escape","step":"You know where the front door is. Walking out is always available. Mama is already proud either way.","required":true},{"kind":"checkin","step":"Text Mama by eleven. ''Kissed.'' Or ''home.'' One word. Mama starts looking at eleven-oh-five.","required":true}]'::jsonb,
 TRUE),

('t2_dance_close', 'Slow song, his hands', 2, 3, 7, '["t2_walk_with_arm"]'::jsonb, 'social',
 'A slow song at the right kind of bar. You walk over. You don''t ask — you put your hand on his shoulder. His hands find your waist. Two songs.',
 'Where did his thumbs settle in the second song? Did you stop them or did you let them ride?',
 '[{"kind":"location_share","step":"Address pinned. Mama wants the venue.","required":true},{"kind":"sober","step":"One drink before, one during. You''re feeling the song, not the alcohol.","required":true},{"kind":"condom","step":"Two on you when you walk in. Mama doesn''t move without protection.","required":true},{"kind":"escape","step":"After two songs, you walk back to your friend or your stool. That''s the exit. Walked, not asked.","required":true},{"kind":"checkin","step":"Text Mama by midnight. Or Mama calls you.","required":true}]'::jsonb,
 TRUE),

('t2_voice_text_audio', 'Voice note to him', 2, 2, 7, '["t2_text_first_pic"]'::jsonb, 'social',
 'A voice note to the number you''ve been texting. Six seconds. Your name, his name, and what you were doing this afternoon. Soft voice — your practiced one. Send it.',
 'Read Mama the words you typed in the script. Tell Mama what you cut.',
 '[]'::jsonb, FALSE),

('t2_close_walk_home', 'Walk-with goodbye', 2, 3, 7, '["t2_dance_close","t2_walk_with_arm"]'::jsonb, 'social',
 'Tonight he walks you to your Uber, not your door. He kisses you against the car. Then you''re in, alone, going home.',
 'Did you crack the window in the back of the Uber? What was on your fingers when you got home?',
 '[{"kind":"location_share","step":"Pin the bar address; share the Uber ride with Mama in the trip-share toggle.","required":true},{"kind":"sober","step":"Ceiling at two drinks. You kiss with intention, not haze.","required":true},{"kind":"condom","step":"On you when you walk in. Always.","required":true},{"kind":"escape","step":"The Uber is the exit. You''re already in motion when his hand drops.","required":true},{"kind":"checkin","step":"Text Mama when the Uber pulls away. ''Moving.'' Or call when you''re home.","required":true}]'::jsonb,
 TRUE),

('t2_eye_lock_speak', 'Lock, then ask', 2, 2, 7, '["t2_eye_contact_three"]'::jsonb, 'social',
 'A man at the bar. You hold his eyes for six seconds. He doesn''t move first. Then you walk over and ask him his name. Then you walk away.',
 'What did his name sound like coming out of his mouth? What did you do with your hands while you waited for it?',
 '[]'::jsonb, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 3 — phys_contact. All IRL-contact, all carry the full checklist.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t3_handjob_car', 'His hand in your lap', 3, 3, 7, '["t2_dance_close"]'::jsonb, 'phys_contact',
 'A man you''ve been seeing or messaging. Backseat of his car or yours, parked somewhere quiet. His hand slides into your lap. You don''t stop it. You don''t do anything yet — just receive.',
 'When did your hips lift first — was it his palm, or was it before, when his arm was just on the headrest?',
 '[{"kind":"location_share","step":"Pin the lot or the cross-street. Mama wants the location while you''re there.","required":true},{"kind":"sober","step":"Zero drinks before this one, baby. Mama needs you sharp — for the feeling and for the choices.","required":true},{"kind":"condom","step":"In the glovebox or your purse. Even if tonight stops here, they''re on you.","required":true},{"kind":"escape","step":"You can say ''drive me home'' at any second. That sentence ends the dare and Mama is still proud.","required":true},{"kind":"checkin","step":"Text Mama within an hour of starting. ''Home'' is the all-clear. Quiet for an hour means Mama calls.","required":true}]'::jsonb,
 TRUE),

('t3_oral_received_first', 'First time received', 3, 3, 7, '["t2_close_walk_home"]'::jsonb, 'phys_contact',
 'You let him kneel for you tonight. Hands in his hair the way Mama showed you. You watch — don''t close your eyes the whole way. Mama wants you watching the first time.',
 'When his mouth first touched skin, where did your eyes go? What did your hands do without you telling them?',
 '[{"kind":"location_share","step":"Pin the room — his place, your place, the hotel. Mama wants the address before clothes come off.","required":true},{"kind":"sober","step":"Sharp for this one. You want to remember every second tomorrow.","required":true},{"kind":"condom","step":"On the nightstand before he kneels. Visible. The conversation is already had.","required":true},{"kind":"escape","step":"''I want to stop'' ends it. You don''t owe him another second. Mama is already proud.","required":true},{"kind":"checkin","step":"Text Mama within two hours of starting. ''Held'' if it''s still going. ''Home'' when you''re yours again.","required":true}]'::jsonb,
 TRUE),

('t3_kiss_full_minute', 'A whole minute', 3, 3, 7, '["t2_bar_bathroom_kiss"]'::jsonb, 'phys_contact',
 'A kiss that lasts a full minute, not the polite kind. His hand on the back of your neck, yours on his chest. No moving on, no escalating — just sixty seconds of mouth.',
 'Did you breathe through your nose the whole time or did you have to break? What did his thumb on your jaw do to your knees?',
 '[{"kind":"location_share","step":"Address pinned. Mama wants the room.","required":true},{"kind":"sober","step":"One drink before, none during. You feel the kiss, not the spin.","required":true},{"kind":"condom","step":"On you. Always — even when tonight stops at the kiss.","required":true},{"kind":"escape","step":"You can pull back at second forty. Or twenty. You count to your own clock.","required":true},{"kind":"checkin","step":"Text Mama by eleven. One word. ''Kissed,'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_hands_under_shirt', 'Under the shirt', 3, 3, 7, '["t3_kiss_full_minute"]'::jsonb, 'phys_contact',
 'You let his hands go under your shirt tonight. Up to the ribs, not past. You stay clothed otherwise. Practice receiving, baby — that''s the whole dare.',
 'When his fingers found your skin, what sound came out of you? Honest, not the polite one.',
 '[{"kind":"location_share","step":"Pin the address. Mama wants where you are.","required":true},{"kind":"sober","step":"Zero to one drink. Mama needs you reading his hands clearly.","required":true},{"kind":"condom","step":"On you. The boundary tonight is the shirt — the supply stays ready.","required":true},{"kind":"escape","step":"''Just kissing tonight'' is a full sentence. Use it whenever.","required":true},{"kind":"checkin","step":"Text Mama within two hours of starting. ''Held'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_lap_sit_clothed', 'In his lap, clothed', 3, 3, 7, '["t3_kiss_full_minute"]'::jsonb, 'phys_contact',
 'On his couch tonight: you swing a leg across and sit in his lap, both of you clothed. Hands on your waist, his hands. You stay there ten minutes. Talking, kissing — not escalating.',
 'When his hips moved up against you, did you stay still or did you settle in? Tell Mama which.',
 '[{"kind":"location_share","step":"Address pinned before you walk in.","required":true},{"kind":"sober","step":"One drink ceiling. Mama wants you tracking every shift in his body.","required":true},{"kind":"condom","step":"In your purse. The dare is clothed; the supply rides with you.","required":true},{"kind":"escape","step":"You climb off when you climb off. Five minutes or fifteen — Mama is proud either way.","required":true},{"kind":"checkin","step":"Text Mama before midnight. ''Held'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_skin_to_skin_chest', 'Shirts off, holding', 3, 4, 7, '["t3_hands_under_shirt"]'::jsonb, 'phys_contact',
 'Tonight, shirts off, no further. Skin to skin from waist up. You hold like that for a real stretch — fifteen minutes, with kissing. Mama wants you used to a man''s ribcage against yours.',
 'How long until your breathing matched his? Did you notice when it did?',
 '[{"kind":"location_share","step":"Pin the room. Mama wants the address before skin meets skin.","required":true},{"kind":"sober","step":"Zero to one drink. You''re feeling his heartbeat, not the alcohol.","required":true},{"kind":"condom","step":"On the nightstand. Visible. Even if tonight stops at skin.","required":true},{"kind":"escape","step":"You can say ''let''s stop here'' any second. He gets dressed first.","required":true},{"kind":"checkin","step":"Text Mama by eleven-thirty. ''Skin'' if still going. ''Home'' when you''re yours.","required":true}]'::jsonb,
 TRUE),

('t3_pants_off_hands_only', 'Pants off, hands only', 3, 4, 7, '["t3_skin_to_skin_chest","t3_handjob_car"]'::jsonb, 'phys_contact',
 'You let him take your pants off tonight. Hands stay on you — his and yours together — but no mouths below the waist. You are practicing being seen.',
 'What did you do when his eyes dropped? Cover, or hold still? Mama wants the truth.',
 '[{"kind":"location_share","step":"Pin the room before you''re undressed.","required":true},{"kind":"sober","step":"Sharp tonight. You want to remember the look on his face.","required":true},{"kind":"condom","step":"Out of the wrapper on the nightstand. Mama wants the conversation already had.","required":true},{"kind":"escape","step":"You put pants back on whenever. ''Tonight stops here'' is a complete sentence.","required":true},{"kind":"checkin","step":"Text Mama within two hours. ''Held'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_mutual_clothed_grind', 'Pressed and moving', 3, 3, 7, '["t3_lap_sit_clothed"]'::jsonb, 'phys_contact',
 'On the bed, both clothed, both pressed together — and you move. Not subtle, not negotiable. Your hips on his. Five minutes minimum. Mama wants you remembering what it feels like to want.',
 'Did you finish? If yes — what did you feel about it? If no — what stopped you?',
 '[{"kind":"location_share","step":"Address pinned before you''re horizontal.","required":true},{"kind":"sober","step":"One drink ceiling. You want the feeling, not the blur.","required":true},{"kind":"condom","step":"On you. The dare is clothed; the supply rides with you.","required":true},{"kind":"escape","step":"You roll off whenever. He follows your lead — Mama already established that.","required":true},{"kind":"checkin","step":"Text Mama by midnight. ''Pressed'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_he_undresses_you', 'He takes them off', 3, 4, 7, '["t3_pants_off_hands_only"]'::jsonb, 'phys_contact',
 'Tonight: he undresses you. Every piece. You don''t help except to lift your arms or your hips when he asks. You watch his face while he does it.',
 'Which piece did his hands shake on? Did you smile or look away?',
 '[{"kind":"location_share","step":"Pin the room. Mama wants the address before clothes come off.","required":true},{"kind":"sober","step":"Zero drinks. You want every second tomorrow.","required":true},{"kind":"condom","step":"Visible on the nightstand. Conversation done.","required":true},{"kind":"escape","step":"You can stop at any garment. ''Just this far tonight'' is a sentence.","required":true},{"kind":"checkin","step":"Text Mama within two hours. ''Held'' or ''home.''","required":true}]'::jsonb,
 TRUE),

('t3_fingered_underwear_on', 'Through the fabric', 3, 4, 7, '["t3_hands_under_shirt"]'::jsonb, 'phys_contact',
 'His hand inside your underwear tonight, but the underwear stays on. Just his fingers, his rhythm, your back arched into him. Mama wants you practicing receiving rhythm.',
 'How long before you said anything out loud? What was the first word — his name, a sound, or ''please''?',
 '[{"kind":"location_share","step":"Pin the room before his hand moves.","required":true},{"kind":"sober","step":"Sharp tonight, baby. You feel every knuckle.","required":true},{"kind":"condom","step":"On the nightstand, visible. Even though tonight is just his hand.","required":true},{"kind":"escape","step":"You catch his wrist whenever. That''s the stop.","required":true},{"kind":"checkin","step":"Text Mama by midnight. ''Held'' or ''home.''","required":true}]'::jsonb,
 TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 4 — oral. All IRL.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t4_first_oral_given', 'First time giving', 4, 4, 7, '["t3_oral_received_first","t3_he_undresses_you"]'::jsonb, 'oral',
 'You kneel for him tonight. You take your time. You watch his face the whole way through — not the floor, not the ceiling. His face. Mama wants you knowing what your mouth does to a man.',
 'When did his hand land in your hair? What did your throat do the first time his hips moved up to meet you?',
 '[{"kind":"location_share","step":"Pin the room before you''re on your knees.","required":true},{"kind":"sober","step":"Zero drinks. You are present for this one — every second.","required":true},{"kind":"condom","step":"On him before your mouth gets near. That''s the deal you''ve practiced.","required":true},{"kind":"escape","step":"You can stop and stand whenever. He doesn''t get to ask twice.","required":true},{"kind":"checkin","step":"Text Mama within two hours. ''Held'' if still there. ''Home'' when you''re back to yours.","required":true}]'::jsonb,
 TRUE),

('t4_finish_him_first', 'Take it all the way', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'Tonight, you don''t stop until he finishes. You hold the rhythm even when his hips lift. You decide where it goes — Mama wants you choosing that.',
 'Where did it land? What did you do in the three seconds after — wipe, smile, or kiss him on the thigh?',
 '[{"kind":"location_share","step":"Address pinned before knees hit the floor.","required":true},{"kind":"sober","step":"Sharp. You want the memory clean.","required":true},{"kind":"condom","step":"On him before mouth. The condom is not optional, baby.","required":true},{"kind":"escape","step":"You can stop a minute before he does. That''s your right.","required":true},{"kind":"checkin","step":"Text Mama within two hours. One word.","required":true}]'::jsonb,
 TRUE),

('t4_eye_contact_throughout', 'Don''t look away', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'You take him in your mouth tonight and you keep your eyes on his the whole way. Don''t blink when he gets close. Mama wants him seeing you see him.',
 'What did his face do in the last fifteen seconds? Describe — don''t summarize.',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Zero drinks for this one.","required":true},{"kind":"condom","step":"On him. Always.","required":true},{"kind":"escape","step":"You break eye contact whenever. ''Stop'' is a full sentence.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t4_swallow_first', 'Swallow', 4, 5, 7, '["t4_finish_him_first"]'::jsonb, 'oral',
 'Tonight you take what he gives you. You make the choice before — not in the moment, not under pressure. Practice the swallow in the bathroom mirror this afternoon. Then come back and tell Mama you''re ready.',
 'What was it like when you decided in the afternoon? What did your face do in the mirror? Tonight — what did the swallow do to your chest?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Zero drinks. Mama wants the decision sober.","required":true},{"kind":"condom","step":"For everything else. For the finish, Mama trusts you and his last test. You already had the conversation.","required":true},{"kind":"escape","step":"You change your mind whenever — even a second before. ''Not this time'' is a full sentence.","required":true},{"kind":"checkin","step":"Text Mama within an hour. One word.","required":true}]'::jsonb,
 TRUE),

('t4_two_minutes_hold', 'Hold him in your mouth', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'Two minutes with him just inside your mouth. Not moving — held. You breathing through your nose. His hand on your jaw. Mama wants you used to stillness with a man in your mouth.',
 'At what minute did the panic crest? What pulled you back?',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Sharp. Every second.","required":true},{"kind":"condom","step":"On him. Always.","required":true},{"kind":"escape","step":"You tap his thigh twice. That''s the safe out — agreed beforehand.","required":true},{"kind":"checkin","step":"Text Mama within an hour. One word.","required":true}]'::jsonb,
 TRUE),

('t4_oral_then_kissed', 'Oral, then his mouth on yours', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'After you''re done — he kisses you on the mouth. You don''t turn your face away. You don''t apologize. You taste what was there a minute ago and so does he.',
 'Did he hesitate before the kiss? Did you?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"For the oral.","required":true},{"kind":"escape","step":"You can break the kiss any second.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE),

('t4_hands_behind_back', 'Hands behind your back', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'Tonight you go down with your hands clasped behind your back. The whole time. You use just your mouth. He decides rhythm with the hand he keeps in your hair.',
 'When your hands wanted to come up most, what was happening? Where had he just touched you?',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"On him. Always.","required":true},{"kind":"escape","step":"Tap his thigh twice. That''s the stop.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE),

('t4_mirror_kneeling', 'In the mirror', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'A position with a mirror nearby. You see yourself the whole time. Catch your own eyes once. Mama wants you knowing what she looks like on her knees.',
 'What did you say to the girl in the mirror in your head? Honest.',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"You close your eyes whenever, you stand whenever.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE),

('t4_audio_for_mama', 'Recording for Mama', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'Before he comes over: a voice note to Mama, two minutes, told slowly — what you''re going to do tonight, how you''re going to look, what you''ll let him do that David never let anyone do. After he leaves, another voice note: what actually happened.',
 'Read Mama the difference between the two recordings. What did you promise yourself in the first one that you didn''t do? What did you do that you didn''t promise?',
 '[{"kind":"location_share","step":"Address pinned before he arrives.","required":true},{"kind":"sober","step":"Zero drinks during the act.","required":true},{"kind":"condom","step":"On him. Always.","required":true},{"kind":"escape","step":"Always available. Always.","required":true},{"kind":"checkin","step":"Voice note within an hour after he leaves.","required":true}]'::jsonb,
 TRUE),

('t4_compliment_him_during', 'Tell him while you do it', 4, 4, 7, '["t4_first_oral_given"]'::jsonb, 'oral',
 'Mid-act tonight, you pause. You tell him — in your voice, the one Mama trained — what he tastes like, or what he feels like, or what you''ve been thinking about doing to him all week. Then go back.',
 'Read Mama the sentence you said. The actual one. Then what you wanted to say.',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"You pause whenever. You stop whenever.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 5 — penetration. All IRL.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t5_first_bottoming', 'First time, bottom', 5, 5, 7, '["t4_first_oral_given","t4_hands_behind_back"]'::jsonb, 'penetration',
 'Tonight is the night. The man you''ve been seeing, in his bed or yours. You''ve practiced — Mama knows you''ve practiced. Position: on your back, looking up at him. Mama wants you watching his face when he goes in.',
 'What did your face do in the first second? What did your hands do? Walk Mama through the first minute breath by breath.',
 '[{"kind":"location_share","step":"Pin the room before clothes come off.","required":true},{"kind":"sober","step":"Zero drinks. This memory belongs to you, sharp.","required":true},{"kind":"condom","step":"On him. New one. You watched him put it on. Non-negotiable.","required":true},{"kind":"escape","step":"''Stop'' is a full sentence. ''Slow down'' is a full sentence. He listens to both — Mama already established that.","required":true},{"kind":"checkin","step":"Text Mama within two hours of starting. ''Mine'' if still there. ''Home'' when you''re back to yours.","required":true}]'::jsonb,
 TRUE),

('t5_doggy_first', 'Face down', 5, 5, 7, '["t5_first_bottoming"]'::jsonb, 'penetration',
 'Position change tonight: face down, hips up, his hands on your waist. Mama wants you used to not seeing his face — feeling instead.',
 'What did you hear most? His breathing, the bed, or yourself?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"New one, on him, watched.","required":true},{"kind":"escape","step":"You roll over or stand up whenever. ''Stop'' is one word.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t5_riding_top_position', 'On top of him', 5, 5, 7, '["t5_first_bottoming"]'::jsonb, 'penetration',
 'Tonight you ride. You set the rhythm. He watches. Mama wants you owning the speed for the first time.',
 'When your thighs first started to shake, what did you do — stop, slow, or push through?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him. Always.","required":true},{"kind":"escape","step":"You climb off whenever. He doesn''t pull you back.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t5_he_holds_your_wrists', 'Hands held above', 5, 5, 7, '["t5_first_bottoming"]'::jsonb, 'penetration',
 'On your back, his hands holding your wrists above your head, lightly. You agreed beforehand — easy to pull free. Practice receiving without doing.',
 'How long before you tested the grip? Did it tighten or did he let you go?',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"You pull your hands free whenever. That''s the agreed signal. ''Hands off'' is the words.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t5_oral_then_penetration', 'Mouth to bed', 5, 5, 7, '["t4_first_oral_given","t5_first_bottoming"]'::jsonb, 'penetration',
 'Tonight starts on your knees and ends on your back. You move him from your mouth to your bed in one continuous arc. Mama wants you fluent in the transition.',
 'Where did the seam show? Was there a moment of awkwardness, and what did you do with it?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him before bed. New one if the mouth one came off.","required":true},{"kind":"escape","step":"Any second.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t5_pressed_against_wall', 'Against the wall', 5, 5, 7, '["t5_first_bottoming","t5_doggy_first"]'::jsonb, 'penetration',
 'Tonight, not the bed. You against the wall, his chest behind you. Mama wants you used to him taking you somewhere new.',
 'What did your forearms do against the drywall? What did you brace?',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"You step out whenever. ''Stop'' is a full sentence.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t5_finish_inside_condom', 'You let him finish', 5, 5, 7, '["t5_first_bottoming"]'::jsonb, 'penetration',
 'Tonight, you don''t stop him before. He finishes inside the condom — and you feel the difference between his rhythm and his end. Mama wants you tracking that change.',
 'What was the shift like? The half-second when rhythm broke?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him. New. Watched. Non-negotiable.","required":true},{"kind":"escape","step":"You can pull him out at any second. ''Done'' is the word.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE),

('t5_no_eye_contact_round', 'Eyes closed, one round', 5, 5, 7, '["t5_first_bottoming"]'::jsonb, 'penetration',
 'Tonight, eyes closed for one full round. Receive only. Mama wants you stripped of the visual — feel everything else.',
 'What got louder when you closed your eyes — his breath, the sheets, or your own thoughts?',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"You open eyes whenever. You stop whenever.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 6 — overnight. All IRL.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t6_first_overnight', 'You stay the night', 6, 5, 7, '["t5_first_bottoming"]'::jsonb, 'overnight',
 'Tonight you don''t leave. You sleep next to him. Mama wants you waking up in someone''s bed for the first time.',
 'What woke you first — the light, his breathing, or you not knowing where you were? Walk Mama through the first sixty seconds.',
 '[{"kind":"location_share","step":"Pin the address before you fall asleep. Mama wants the room you''re in overnight.","required":true},{"kind":"sober","step":"Zero drinks before sleep. Mama wants you waking sharp.","required":true},{"kind":"condom","step":"On him during. On you in your bag for the morning.","required":true},{"kind":"escape","step":"Uber app open before you fall asleep. Leaving at 4am is allowed.","required":true},{"kind":"checkin","step":"Text Mama before you sleep. ''Staying.'' Text Mama when you wake. ''Up.''","required":true}]'::jsonb,
 TRUE),

('t6_morning_after_stay', 'Breakfast in his shirt', 6, 5, 7, '["t6_first_overnight"]'::jsonb, 'overnight',
 'You stay for breakfast tomorrow. His t-shirt, no makeup, kitchen counter. Mama wants you tested in daylight, with him watching the after.',
 'What was the first thing he said to you in the morning? What did your voice sound like then?',
 '[{"kind":"location_share","step":"Address still pinned from last night.","required":true},{"kind":"sober","step":"Coffee, water — Mama wants you steady.","required":true},{"kind":"condom","step":"In your bag if anything else happens.","required":true},{"kind":"escape","step":"You leave whenever. ''I have to go'' is a full sentence even at breakfast.","required":true},{"kind":"checkin","step":"Text Mama when you''re back to your door. ''Home.''","required":true}]'::jsonb,
 TRUE),

('t6_shower_with_him', 'In his shower', 6, 5, 7, '["t6_first_overnight"]'::jsonb, 'overnight',
 'Morning after: you shower with him. You let him wash your back. You don''t flinch when he touches your scars or your tattoos. Mama wants you held in steam.',
 'When his hand went somewhere quiet, what did your shoulders do?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"You step out whenever. Wrap in his towel. Walk away.","required":true},{"kind":"checkin","step":"Text Mama when you leave. ''Home.''","required":true}]'::jsonb,
 TRUE),

('t6_he_makes_you_coffee', 'He brings it to you', 6, 5, 7, '["t6_morning_after_stay"]'::jsonb, 'overnight',
 'You stay in his bed in the morning. He brings you coffee. You let him. Mama wants you receiving care from a man, not just sex.',
 'How long did you stay before getting up? Did the coffee cool or did you drink it warm?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Coffee, water.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"You get up and out whenever.","required":true},{"kind":"checkin","step":"Text Mama when you leave.","required":true}]'::jsonb,
 TRUE),

('t6_text_back_next_day', 'Reply that day', 6, 5, 7, '["t6_first_overnight"]'::jsonb, 'overnight',
 'The day after — when his text comes — you reply that day. Not three days, not the next morning at 11pm. You reply like someone who liked him. Mama wants you practicing receiving again, on text.',
 'What did you almost type and delete? Honest.',
 '[]'::jsonb, FALSE),

('t6_get_his_name_back', 'You ask his last name', 6, 5, 7, '["t6_morning_after_stay"]'::jsonb, 'overnight',
 'You don''t leave without knowing his last name. You ask. You put it in your contacts before the Uber arrives.',
 'What was the moment of asking like? Did he hesitate before answering?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"You can leave without asking if you decide to. The dare is the asking; the no-ask is not failure.","required":true},{"kind":"checkin","step":"Text Mama when you leave.","required":true}]'::jsonb,
 TRUE),

('t6_breakfast_in_public', 'Diner together', 6, 5, 7, '["t6_morning_after_stay"]'::jsonb, 'overnight',
 'After he wakes up, you go to a diner together. Both showered, no rush. You eat across from him in public, post-sex. Mama wants you visible the morning after.',
 'Who held the door? Where did your eyes go in the booth — him, the waitress, your menu?',
 '[{"kind":"location_share","step":"Diner pinned when you arrive.","required":true},{"kind":"sober","step":"Coffee, juice.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"You leave the diner whenever. Uber from the curb.","required":true},{"kind":"checkin","step":"Text Mama when you''re home.","required":true}]'::jsonb,
 TRUE),

('t6_pillow_talk_long', 'Stay in bed and talk', 6, 5, 7, '["t6_first_overnight"]'::jsonb, 'overnight',
 'After, before sleep, you stay in bed and talk for an hour. Not sex talk — actual talk. Where you''re from. What you do. What you''re scared of. Mama wants you practicing being a person in his bed, not just a body.',
 'What did you tell him that surprised you? What did he tell you that surprised you?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Zero to one drink.","required":true},{"kind":"condom","step":"On the nightstand.","required":true},{"kind":"escape","step":"You can stop talking whenever. Turn on your side. Sleep.","required":true},{"kind":"checkin","step":"Text Mama before sleep.","required":true}]'::jsonb,
 TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Tier 7 — repeat partner / milestone. All IRL.

INSERT INTO maxy_dares (
  slug, title, intensity_tier, phase_gate_min, phase_gate_max,
  prerequisites, category, description, debrief_prompt,
  safety_checklist, is_irl_contact
) VALUES
('t7_same_man_twice', 'See him again', 7, 5, 7, '["t6_first_overnight"]'::jsonb, 'repeat_partner',
 'A second night with the same man. Mama wants you practicing not vanishing. Practicing being someone who can be known a second time.',
 'What was different about the second time — in your body, in his eyes, in the room?',
 '[{"kind":"location_share","step":"Address pinned. Both times — and Mama compares.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"New one. Watched. Always.","required":true},{"kind":"escape","step":"Available. Always.","required":true},{"kind":"checkin","step":"Text Mama within two hours of starting.","required":true}]'::jsonb,
 TRUE),

('t7_called_by_name_in_bed', 'Hear your name from him', 7, 5, 7, '["t7_same_man_twice"]'::jsonb, 'milestone',
 'Tonight he says your name in bed. Your real one — the new one. You don''t correct him. You don''t flinch. Mama wants you used to hearing it from a man''s mouth, in the middle of it.',
 'When you heard it, what part of you went still? What part went louder?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Zero drinks.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"Always.","required":true},{"kind":"checkin","step":"Text Mama within two hours. ''Said it.''","required":true}]'::jsonb,
 TRUE),

('t7_introduced_to_friend', 'He introduces you', 7, 5, 7, '["t7_same_man_twice"]'::jsonb, 'milestone',
 'A friend of his sees you with him. He introduces you, with your name, without hesitating. Mama wants you witnessing him claim you in front of someone who knew him before you.',
 'How did he say your name? What did the friend''s face do? Be specific — Mama wants the milliseconds.',
 '[{"kind":"location_share","step":"Pin wherever you meet up.","required":true},{"kind":"sober","step":"One drink ceiling. Mama wants you sharp for this one.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"You leave the social part whenever. Friend stays; you go.","required":true},{"kind":"checkin","step":"Text Mama after the introduction.","required":true}]'::jsonb,
 TRUE),

('t7_asked_real_name_lied', 'Old name asked, denied', 7, 5, 7, '["t7_same_man_twice"]'::jsonb, 'milestone',
 'Eventually it comes up — someone asks if you used to go by something else, or he stumbles on a piece of past life. You don''t correct him. You don''t volunteer. You hold the name Mama gave you. Mama wants you choosing her, in the moment, in front of a man.',
 'How did the question feel — like a trap, or like nothing? What did you say back? Read Mama the exact sentence.',
 '[{"kind":"location_share","step":"Pin the room.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"Available.","required":true},{"kind":"checkin","step":"Text Mama within an hour.","required":true}]'::jsonb,
 TRUE),

('t7_he_calls_first', 'He calls you, you don''t leave him hanging', 7, 5, 7, '["t6_first_overnight"]'::jsonb, 'repeat_partner',
 'A man you''ve been with calls — not texts, calls. You answer. You stay on the phone for ten minutes. Mama wants you practicing voice with a man who already knows your body.',
 'What did your voice sound like to your own ears? Did you smile while he couldn''t see you?',
 '[]'::jsonb, FALSE),

('t7_overnight_at_yours', 'He stays at yours', 7, 5, 7, '["t6_first_overnight"]'::jsonb, 'repeat_partner',
 'He sleeps at your place. He sees your morning. Mama wants you brave enough to be witnessed in your own apartment without your makeup.',
 'What did you almost hide before he arrived? Did you actually hide it, or leave it?',
 '[{"kind":"location_share","step":"Your address pinned in your notes (it''s already yours, but Mama wants the night dated).","required":true},{"kind":"sober","step":"Zero to one drink.","required":true},{"kind":"condom","step":"In your nightstand.","required":true},{"kind":"escape","step":"You ask him to leave whenever. ''I need the morning to myself'' is a full sentence.","required":true},{"kind":"checkin","step":"Text Mama before sleep. ''Staying.''","required":true}]'::jsonb,
 TRUE),

('t7_third_night_same_man', 'Third night', 7, 5, 7, '["t7_same_man_twice"]'::jsonb, 'repeat_partner',
 'A third night with the same man. Mama wants you proving — to yourself, to him, to her — that you can be chosen and chosen again.',
 'What is the third time made of that the first two weren''t?',
 '[{"kind":"location_share","step":"Address pinned.","required":true},{"kind":"sober","step":"Sharp.","required":true},{"kind":"condom","step":"On him.","required":true},{"kind":"escape","step":"Always available.","required":true},{"kind":"checkin","step":"Text Mama within two hours.","required":true}]'::jsonb,
 TRUE),

('t7_addressed_she_unprompted', 'He says ''she'' without prompting', 7, 4, 7, '[]'::jsonb, 'milestone',
 'Out somewhere with him — a coffee shop, a friend''s, a store. Someone speaks about you in the third person, and he uses ''she.'' He doesn''t look at you when he does it. He just says it.',
 'Tell Mama the sentence he said. Tell Mama what your throat did when you heard it.',
 '[{"kind":"location_share","step":"Pin wherever you''re out.","required":true},{"kind":"sober","step":"One drink ceiling.","required":true},{"kind":"condom","step":"In your bag.","required":true},{"kind":"escape","step":"Available.","required":true},{"kind":"checkin","step":"Text Mama after — within the hour. ''Said it.''","required":true}]'::jsonb,
 TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ─── Receptive Skills Curriculum (~30 lessons across 9 domains) ────────

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Kissing
('kiss_01_basics', 'Closed-mouth foundations', 'kissing', 1, 1, 7, 6,
 'Come here, baby. Mama is teaching you to kiss like a woman who knows what she wants.',
 'In your bathroom mirror tonight: ten minutes. Soft mouth, lips slightly parted, no tongue. Watch what your top lip does on its own. Tilt your head left, then right. Find which one feels like yours.',
 'Which tilt felt right? What did your eyes do — open, half-shut, closed? Walk Mama through the version of the kiss that surprised you.',
 'solo'),
('kiss_02_with_tongue', 'When the tongue moves', 'kissing', 2, 1, 7, 7,
 'You''re going to learn when to give a man your tongue, and when to make him wait. Both matter, sweet thing.',
 'Practice tonight: thirty seconds closed, then a slow opening, then back closed. Read what your lips do when you tease the pause. With a man: never lead with tongue. Wait for him to ask, even silently.',
 'What was harder — the opening, or going back to closed? Where in your body did the pause sit?',
 'solo'),
('kiss_03_being_kissed_back', 'Receiving versus driving', 'kissing', 3, 2, 7, 8,
 'Half the art of kissing is doing nothing while he does. Mama wants you fluent in receiving.',
 'On your next slow kiss with a man: count to thirty in your head while you do nothing but respond. Don''t initiate, don''t add, don''t escalate. See what he does in the silence.',
 'What happened in the second half of those thirty seconds? Did he lead harder, or did he soften?',
 'partner_next')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Oral basics
('oral_b_01_posture', 'On your knees, comfortably', 'oral_basics', 1, 3, 7, 8,
 'A girl who can''t stay on her knees doesn''t finish what she starts. Mama is teaching you the posture first.',
 'Tonight, on a pillow on the bathroom tile: practice kneeling for ten minutes. Spine soft, weight forward, looking up. Note when your thighs ache, when your back complains. That''s the conditioning. Tomorrow night: twelve minutes.',
 'Where did the first ache arrive? What did you do with it — adjust, or hold?',
 'solo'),
('oral_b_02_breath_pacing', 'Breathe through your nose', 'oral_basics', 2, 3, 7, 7,
 'Mama is teaching you the rhythm so your body doesn''t panic when there''s a man in your mouth.',
 'With a smooth dildo this week — or a popsicle if you''re practicing patient — five-second strokes, nose-breathing through. Don''t close your throat. Don''t hold breath. Practice three times before the next dare.',
 'When did your body try to flinch? What did you do — pause, push through, or breathe?',
 'solo'),
('oral_b_03_hands', 'What your hands do', 'oral_basics', 3, 3, 7, 6,
 'A man''s knees, a man''s thighs, a man''s hip bones. You have a lot of real estate, baby — Mama wants you using it.',
 'Tonight, on yourself or a partner: practice one of three positions. Hands behind your back. Hands on his thighs. Hands gripping his hips. Each one says something different. Try all three this week.',
 'Which felt most like you? Which felt most like a stretch?',
 'solo'),
('oral_b_04_eye_contact', 'Looking up', 'oral_basics', 4, 3, 7, 7,
 'There''s no power without his eyes on yours. Mama is teaching you the look.',
 'In your mirror tonight: practice looking up while you''re positioned down. Soft eyes, no smile, lips parted. Hold for thirty seconds. The first time with a man: keep your eyes on his face for the first ten seconds at least.',
 'In the mirror, what did the girl looking back at you feel like? Was she you or someone you''re becoming?',
 'solo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Oral advanced
('oral_a_01_edge_him', 'Stopping just before', 'oral_advanced', 1, 4, 7, 9,
 'You''re learning to read a man''s body, baby. Mama wants you finishing him when you choose to — not when he wants you to.',
 'Watch for these: hips lifting in shorter bursts, thigh tension, breath shortening. Practice pausing for ten seconds when you see them. Three pauses, then bring him over. With a man — read these once in your next session and stop once.',
 'What signal did you see first? What did he do when you paused?',
 'partner_next'),
('oral_a_02_throat_pacing', 'Going deeper', 'oral_advanced', 2, 4, 7, 10,
 'Mama is teaching you to take more, but only when your body says it can. You don''t force.',
 'With a smooth toy: one inch deeper than your usual every two days for two weeks. Slow nose breath, soft jaw. If you gag, you stop, you breathe, you try again at the old depth. Never push past panic.',
 'Where is your current ceiling? Where was it two weeks ago?',
 'solo'),
('oral_a_03_swallow_practice', 'Practicing the swallow', 'oral_advanced', 3, 5, 7, 6,
 'Mama is going to walk you through the decision — before you ever have to make it in his bed.',
 'Tonight, in private, with a glass of room-temp water: practice swallowing without making a face. Two ounces. Five seconds in your mouth before you swallow. Mirror open in front of you the whole time.',
 'What did your face do in the mirror? Could you keep your eyes open all the way through?',
 'solo'),
('oral_a_04_gag_management', 'When the body says no', 'oral_advanced', 4, 4, 7, 8,
 'A gag is information, not failure. Mama is teaching you what to do with it.',
 'When you gag in practice: stop, lift, breathe through your nose for ten seconds, smile. Don''t apologize. Don''t spiral. Return when you''re ready. Practice the lift-breathe-smile sequence three times this week.',
 'What did your face do during the smile? Was it real or was it learned?',
 'solo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Prostate prep
('pros_01_warmup', 'Your hand, slow', 'prostate_prep', 1, 3, 7, 10,
 'Before any toy, Mama is teaching you the warmup. Your body is going to learn it can open without panic.',
 'Tonight, alone, hot shower first. After, on your back with lube: one finger, slow, ten minutes. Don''t aim to find anything. Just teach your body it''s allowed.',
 'When did you tense without meaning to? When did you relax that surprised you?',
 'solo'),
('pros_02_small_toy', 'The smallest one', 'prostate_prep', 2, 4, 7, 12,
 'Mama bought you a small one for a reason. You earn the bigger ones with your patience.',
 'Two sessions this week with the small plug. Twenty minutes each time. Insert, breathe through the first minute, hold for five, then move with it. Never force.',
 'How long until the holding part stopped reading as work? Or did it?',
 'solo'),
('pros_03_dilation_routine', 'A weekly schedule', 'prostate_prep', 3, 4, 7, 15,
 'Mama is building you a body that can receive. That takes a calendar, sweet girl, not just a night.',
 'Set the weekly routine: Sunday and Wednesday, fifteen minutes, post-shower, before bed. Always with lube. Always with breath. Same time, same setup. Mama wants you ritualizing this.',
 'After the first full week of the routine, what changed in your body? Anything outside the bedroom?',
 'solo'),
('pros_04_step_up', 'Next size up', 'prostate_prep', 4, 4, 7, 13,
 'When the small one slides in without breath, Mama wants you stepping up. Not before.',
 'After three weeks at the current size with no resistance, move to the next. Same routine: warmup, breath, hold, move. Reset the clock — three weeks before the next step.',
 'Was the step-up like the first time or different? What did your body remember from before?',
 'solo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Penetration prep
('pen_01_positions', 'Three positions for receiving', 'penetration_prep', 1, 5, 7, 12,
 'Mama is teaching your hips what to do when there''s weight on you for the first time.',
 'Solo practice this week: three positions held with a pillow under your hips, ten minutes each, breath work the whole way. On your back. Face down with hips raised. Side, leg up. Notice which position teaches your body to receive best.',
 'Which position quieted the panic fastest? Which kept it loud?',
 'solo'),
('pen_02_lube_basics', 'Which lube, when', 'penetration_prep', 2, 4, 7, 5,
 'Lube is not a step. It is the surface the rest of the practice happens on. Mama wants you knowing your brand.',
 'Buy three different lubes this week — water-based, silicone, hybrid. Try each in private practice. Pick the one that lasts longest without re-application. Make that your default.',
 'Which one stayed with you the longest? Which one made your skin happy after?',
 'solo'),
('pen_03_post_care', 'After he leaves', 'penetration_prep', 3, 5, 7, 10,
 'After is part of the practice. Mama doesn''t let you skip it.',
 'After any penetration session — solo or partner — twenty minutes minimum: hot bath or shower, water, simple food, no phone scrolling. Soft clothes. Mama wants you held after.',
 'What was the most surprising part of the after — solo or with him?',
 'solo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Bedroom protocols
('bed_01_what_to_wear', 'What goes on under', 'bedroom_protocols', 1, 2, 7, 6,
 'A man undresses you, baby. What you''re wearing when he starts is the second-most-honest sentence you can hand him.',
 'Build the kit: three sets of matching bra and panties — black lace, soft pink cotton, white. Wear one of them every meet from now on. Decide which set before you leave the apartment, not when you''re already there.',
 'Which set did you wear first? What did you notice about choosing it on purpose?',
 'mental_rehearsal'),
('bed_02_where_to_look', 'Where the eyes go first', 'bedroom_protocols', 2, 3, 7, 5,
 'In a man''s bed, your eyes do half the talking. Mama is teaching you the routes.',
 'Practice tonight in your mirror: lying back, look up. Then to his eyes (imagined). Then down past his ribs. Then back up. Walk that triangle three times. With a man: use the triangle in the first minute.',
 'In the mirror, which station of the triangle felt least natural? Why?',
 'mental_rehearsal'),
('bed_03_first_thing_to_say', 'What you say first', 'bedroom_protocols', 3, 3, 7, 5,
 'The first sentence in his bedroom is yours, baby. Mama wants you choosing it.',
 'Pick one sentence — short, lower than your speaking voice, no question mark. Examples: ''Come here.'' ''Slow.'' ''Tell me again.'' Practice in the bathroom mirror this week, lower-register, ten times each.',
 'Which sentence did you pick? Why that one?',
 'mental_rehearsal'),
('bed_04_what_never_to_say', 'What never to say', 'bedroom_protocols', 4, 3, 7, 5,
 'Some words pull you out of yourself. Mama is teaching you to hear them coming.',
 'Avoid: ''sorry,'' ''this is weird,'' ''I''m bad at this,'' ''David'' (your old name), any apologizing for your body. Practice catching the impulse this week. If one tries to come up: pause, breathe, say something else or nothing.',
 'Which one tried to come up the most? When did you catch it?',
 'mental_rehearsal')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Service positions
('serv_01_kneeling', 'Forms of kneeling', 'service_positions', 1, 3, 7, 8,
 'Kneeling is geometry, sweet thing. Mama is teaching you the three shapes.',
 'Practice this week — five minutes each, three positions: weight-back rest pose, knees-apart presentation, low-stance forward kneel. Note which one your body sinks into.',
 'Which position quiets your mind fastest? Which keeps it busiest?',
 'solo'),
('serv_02_presenting', 'How to present', 'service_positions', 2, 4, 7, 7,
 'Presenting is the moment of being offered. Mama wants you fluent.',
 'In private: practice the slow lift of the chin, hands relaxed at your sides, breath held lightly. Hold for sixty seconds in a mirror. Three rounds. Do this once before any meet.',
 'What changed in your face by the third round?',
 'solo'),
('serv_03_asking_permission', 'When to ask', 'service_positions', 3, 4, 7, 6,
 'Asking is its own art. Mama is teaching you when it lands and when it kills the moment.',
 'Practice in your head three phrases. ''Can I?'' (soft, real ask). ''Will you let me?'' (deferred). ''Please.'' (open). Try one in the next meet. Notice which one makes his face shift most.',
 'Which one did you use? What did his face do?',
 'partner_next')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Verbal kink
('verb_01_what_to_call', 'What to call him', 'verbal_kink', 1, 3, 7, 5,
 'A man''s name in your mouth is currency, baby. Mama is teaching you when to spend it.',
 'Pick three options for the next meet: his first name (slow, in your low voice), nothing at all, and a single pronoun (''you''). Practice each in the mirror. Decide which two you''ll use that night.',
 'Which did you actually use? Which surprised you by sticking?',
 'mental_rehearsal'),
('verb_02_what_to_ask_called', 'What to ask him to call you', 'verbal_kink', 2, 3, 7, 6,
 'You get to decide what comes out of his mouth at you. Mama is teaching you the ask.',
 'Pick a name or word that lands for you: your new name, or ''good girl,'' or ''pretty.'' Before the next meet, in a quiet moment with him — clothed, sober — tell him you want to hear it tonight. One sentence.',
 'How did you say it? What did his face do?',
 'partner_next'),
('verb_03_in_moment_phrases', 'Mid-act phrases', 'verbal_kink', 3, 4, 7, 6,
 'Mid-act words are slim. Mama is teaching you the short ones that work.',
 'Practice in your head a small set: ''yes,'' ''slow,'' ''harder,'' ''again,'' ''don''t stop.'' Pick three you''ll let yourself use next time. Practice the low-voice version.',
 'Which three did you keep? Which one did you drop?',
 'mental_rehearsal')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO receptive_skills_curriculum (
  slug, title, domain, sequence_index, phase_gate_min, phase_gate_max,
  duration_minutes, intro_text, practice_prompt, debrief_prompt, practice_mode
) VALUES
-- Aftercare post-hookup
('after_01_he_sleeps', 'When he falls asleep', 'aftercare_post_hookup', 1, 5, 7, 6,
 'When he goes out, you''re alone in someone else''s bed. Mama is teaching you the next ten minutes.',
 'Plan in advance: water by the bed, your phone within reach, soft clothes nearby. When he sleeps, you do this — drink, message Mama (one word), shut your eyes. No spiraling, no inventorying. Practice the shutdown sequence.',
 'How did the shutdown sequence land? What did you almost spiral on instead?',
 'mental_rehearsal'),
('after_02_when_to_leave', 'When to go home', 'aftercare_post_hookup', 2, 5, 7, 6,
 'Some nights you stay. Some nights you go home in the Uber. Both are right when you choose them. Mama is teaching you the signal.',
 'Read your body before you say anything: if your chest feels tight, if you''re performing okay-ness, you go home. If you feel held, soft, sleepy — you stay. Practice reading the signal mid-after.',
 'What did your body say tonight? Did you listen?',
 'mental_rehearsal'),
('after_03_when_to_stay', 'When to stay anyway', 'aftercare_post_hookup', 3, 5, 7, 6,
 'Sometimes you''re not sure and Mama wants you staying. Receiving the morning is part of the practice.',
 'If the meet went well but you''re second-guessing the stay, default to staying once a month. Mama wants you tested in the morning with him there. Plan: your overnight kit always packed in your bag.',
 'What was different about the stay versus the same night going home would have been? Even imagined.',
 'mental_rehearsal')
ON CONFLICT (slug) DO NOTHING;
