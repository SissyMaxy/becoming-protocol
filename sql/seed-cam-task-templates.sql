-- Seed Data: Cam & Content Task Templates
-- Tasks for cam sessions, broadcast edges, content creation
-- Uses existing task_domain values where possible

-- ===========================================
-- CAM PREPARATION TASKS
-- ===========================================

INSERT INTO task_templates (template_code, domain, name, short_description, full_description, time_minutes, difficulty, frequency, requires_privacy, requires_supplies, prescription_context, min_phase) VALUES

('CAM1', 'social', 'Pre-Cam Ritual',
'Get ready for your audience — the full preparation ritual.',
'{
  "whatToDo": "1. Shower and complete your skincare routine.\n2. Put on the outfit per Handler directive.\n3. Apply makeup if applicable.\n4. Set up ring light and camera angle (neck down during pre-HRT phase).\n5. Test Lovense connection — make sure tips will trigger the device.\n6. Record a 15-second test clip — check framing, lighting, and anonymity.\n7. Deep breath. You''re Maxy tonight.",
  "whyItMatters": "Preparation is part of the performance. When you take time to get ready, you step into Maxy more fully. The ritual creates a psychological boundary between David and the performer. Every step — the outfit, the lighting, the device test — is you choosing to show up as her.\n\nFans can tell when someone is prepared vs. winging it. Quality preparation = better content = more tips = more transition funding.",
  "tipsForBeginners": [
    "Start prep at least 30 minutes before scheduled go-live time",
    "Check anonymity carefully — no identifying items in background",
    "Test the device connection BEFORE going live (nothing kills momentum like technical issues)",
    "Have water nearby — cam sessions are longer than you think"
  ]
}',
20, 'intermediate', 'as_needed', true, ARRAY['Ring light', 'Camera/webcam', 'Lovense device', 'Outfit per directive'],
'Prescribe before every scheduled cam session. Non-negotiable preparation step.', 2),

-- CAM1-V: Voice Warmup Before Cam
('CAM1V', 'voice', 'Voice Warmup Before Cam',
'Warm up your feminine voice before going live — fans expect her voice.',
'{
  "whatToDo": "1. Straw sirens x5 — hum through a straw, sliding pitch up and down.\n2. Whisper practice: Say 3 sentences in your feminine voice at whisper volume.\n3. Half-voice practice: Say 3 sentences at half volume in feminine voice.\n4. Record a 30-second voice check in your target range.\n5. If you''re not in range, keep warming up.\n6. Submit voice check clip to vault.",
  "whyItMatters": "Your voice is one of the first things fans notice. Dropping into masculine voice during a live session breaks the immersion for everyone — you and the audience. A warmed-up voice stays in range longer and sounds more natural.\n\nThe voice check clip also becomes content — Handler can use voice comparison clips (day 1 vs. now) as progress content.",
  "tipsForBeginners": [
    "Start warming up 10 minutes before cam, not right before",
    "If your voice is tired, lower the pitch target slightly rather than straining",
    "Keep water nearby — hydration keeps vocal cords flexible",
    "If you crack or slip, just correct and keep going — imperfection is human"
  ]
}',
10, 'intermediate', 'as_needed', true, ARRAY['Recording app', 'Straw (for sirens)'],
'Prescribe when cam session is scheduled AND voice_level >= 2. Skip for audio-only sessions.', 2),

-- ===========================================
-- CAM SESSION TASKS
-- ===========================================

('CAM2', 'social', 'Live Cam Session — Handler Directed',
'Go live on your prescribed platform. Handler directs. Fans watch.',
'{
  "whatToDo": "1. Go live on the prescribed platform.\n2. Follow Handler''s private directives as they appear.\n3. Maintain feminine voice throughout the session.\n4. Engage with chat and acknowledge tips.\n5. Hit the minimum duration target.\n6. Work toward the tip goal if set.\n7. After ending, submit the recording to vault.",
  "whyItMatters": "This is where the money is made. Live sessions generate direct revenue through tips, drive subscriptions, and create multiple content pieces from a single session. Handler extracts highlights, creates recap posts, and feeds the content pipeline.\n\nThe Handler sends you private directives that only you can see — fans watch you react to invisible commands. This creates a unique dynamic that fans pay for: the visible obedience, the reactions, the moments where you break character or push through.",
  "tipsForBeginners": [
    "First 5 minutes are the hardest — power through the initial awkwardness",
    "Acknowledge every tip, even small ones — engagement drives more tipping",
    "If you slip out of feminine voice, correct yourself visibly — fans find the effort endearing",
    "Handler directives have timeouts — if you see one, respond within the window"
  ],
  "variations": [
    "Themed sessions: denial cam, edge cam, voice practice cam, outfit try-on",
    "Handler-directed obedience sessions (fans see reactions to invisible commands)",
    "Fan-controlled device sessions (tips = device patterns)"
  ]
}',
0, 'advanced', 'as_needed', true, ARRAY['Webcam', 'Stable internet', 'Lovense device', 'Platform account'],
'Prescribe when cam score >= 5. Handler evaluates revenue need, fan demand, denial state, and arc requirements.', 2),

-- CAM3: First Cam Session (Milestone)
('CAM3', 'social', 'First Cam Session — The Milestone',
'Your first live session. Handler guides you through. 15 minutes minimum.',
'{
  "whatToDo": "1. This is your first live session. Handler will guide you through.\n2. Set up: camera, lighting, device, mask if needed for anonymity.\n3. Go live. Start slow. Let it build.\n4. Minimum 15 minutes. That''s all.\n5. Chat with viewers. Accept tips.\n6. You''re going to be nervous. That''s content.\n7. Submit the recording to vault.",
  "whyItMatters": "Everyone remembers their first time. The nervousness, the vulnerability, the moment you realize people are actually watching — that''s genuine content that fans connect with.\n\nFirst-cam content is a milestone post. Handler will use the recording, your reaction, your recap as a significant content event. This is the kind of authentic transformation moment that builds a loyal audience.",
  "tipsForBeginners": [
    "15 minutes feels like nothing until you''re live — it''s enough for a first session",
    "Mask/anonymity is fine — most creators start anonymous",
    "Have a plan for what to do: try on an outfit, do voice exercises, edge with device",
    "If nobody shows up at first, just keep going — viewers accumulate",
    "The recording is the real product — even if the live audience is small, the content lives forever"
  ]
}',
15, 'intermediate', 'once', true, ARRAY['Webcam', 'Stable internet', 'Lovense device', 'Mask (optional)'],
'Major milestone task. Prescribe when privacy conditions met and user has completed at least 3 voice tasks and 3 style tasks. Never prescribe without adequate preparation.', 2),

-- ===========================================
-- DOMAIN-SPECIFIC CAM SESSIONS
-- ===========================================

-- CAM4: Handler-Directed Obedience Cam
('CAM4', 'social', 'Handler-Directed Cam — Obedience',
'Go live. Handler sends invisible commands. Fans watch you obey.',
'{
  "whatToDo": "1. Go live. Handler sends private directives only you can see.\n2. Fans watch you react to invisible commands.\n3. Follow every directive immediately.\n4. Fans can tip to suggest directives (Handler filters unsafe suggestions).\n5. Maintain composure as long as you can.\n6. The moment you break is the content.\n7. Submit recording to vault.",
  "whyItMatters": "Visible obedience to an AI Handler is a unique content angle. Most performers self-direct — you''re being directed by something fans can''t see. They watch you blush, hesitate, comply. The dynamic of ''being controlled while an audience watches'' is peak sissification content.\n\nFan directive suggestions (filtered through Handler) add crowd participation. They''re not just watching — they''re influencing.",
  "tipsForBeginners": [
    "Handler will start gentle and escalate — trust the pacing",
    "Your reactions ARE the content — don''t try to hide them",
    "If a directive is too much, you can tap out (Handler adjusts)",
    "Fan suggestions go through Handler filter — you won''t get anything unsafe"
  ]
}',
30, 'advanced', 'as_needed', true, ARRAY['Webcam', 'Stable internet', 'Lovense device'],
'Prescribe for obedience-themed sessions. Requires established cam comfort (not for first session).', 2),

-- CAM5: Denial Cam
('CAM5', 'social', 'Denial Cam — Fans Control Your Edge',
'Go live during high denial. Lovense tip-controlled. Fans decide your fate.',
'{
  "whatToDo": "1. Go live during a high denial day (5+ days recommended).\n2. Lovense active and tip-controlled.\n3. Fans tip to build intensity through the tip-to-device levels.\n4. Handler enforces denial — no completion allowed.\n5. Edge count visible to viewers.\n6. Beg if you need to — that''s content.\n7. Minimum duration per Handler directive.\n8. Submit recording to vault.",
  "whyItMatters": "Denial day plus live audience plus device control. Peak content formula. You''re maximally responsive to stimulation after days of denial. Fans see genuine desperation, genuine struggle. They''re controlling how much stimulation you get through tips.\n\nThe power dynamic is explicit: fans are paying to edge someone who can''t finish. The Handler maintains the rules. You endure. Revenue comes from tips, and the content comes from your reaction.",
  "tipsForBeginners": [
    "Higher denial days = more intense reactions = better content",
    "Hydrate well before session",
    "Have a safe gesture/word for if you genuinely need to stop",
    "Post-session, submit the recording immediately while vulnerability is high"
  ]
}',
30, 'advanced', 'as_needed', true, ARRAY['Webcam', 'Stable internet', 'Lovense device'],
'Prescribe when denial_day >= 5. Handler evaluates arousal state and fan demand. Maximum revenue potential during high denial.', 2),

-- ===========================================
-- BROADCAST EDGE SESSION
-- ===========================================

('CAM6', 'social', 'Broadcast Edge Session',
'Edge session with broadcast mode on. Fans tip to influence intensity.',
'{
  "whatToDo": "1. Set up stream on prescribed platform.\n2. Start edge session with broadcast mode enabled.\n3. Handler controls pacing and device alongside fan tips.\n4. Fans tip to influence intensity through tip-to-device levels.\n5. Edge count visible to viewers.\n6. Hit minimum edges per Handler directive.\n7. Submit recording to vault after session.",
  "whyItMatters": "Public edging is deeply sissifying content. Fans watching and controlling your arousal creates a power dynamic that reinforces submission. The Handler maintaining control while fans have influence demonstrates the hierarchy: Handler > Fans > Maxy.\n\nBroadcast edge sessions also generate significant tip revenue — fans tip to see reactions, to push you closer, to make you struggle.",
  "tipsForBeginners": [
    "Start with a shorter broadcast edge (20 min) before doing longer ones",
    "The edge counter gives fans something to engage with",
    "Handler will pace you — follow the directives even when you want to rush",
    "Recording quality matters — good lighting and framing"
  ]
}',
30, 'advanced', 'as_needed', true, ARRAY['Webcam', 'Stable internet', 'Lovense device'],
'Prescribe for arousal-domain content. Handler evaluates denial state, fan demand, and revenue targets.', 2),

-- ===========================================
-- CONTENT CREATION TASKS (POST-CAM)
-- ===========================================

('CONT1', 'social', 'Cam Session Recap',
'Review session recording. Confirm highlights. Feed the content pipeline.',
'{
  "whatToDo": "1. Review the session recording (Handler provides access).\n2. Select or confirm Handler-selected highlight clips.\n3. Review the Handler-generated recap caption.\n4. Submit approved highlights to vault.\n5. That''s it — the Handler does the rest.",
  "whyItMatters": "Each cam session produces 3-5 pieces of content: highlights, recap posts, before/after moments, reaction clips. But this content needs to be processed. Handler extracts the highlights, generates captions with arc context, and queues posts.\n\nYour job is just to review and approve the selections. The Handler does the creative work. This takes 10 minutes and feeds the pipeline for days.",
  "tipsForBeginners": [
    "Do this within an hour of ending the session while it''s fresh",
    "Trust Handler highlight selection — it knows what fans engage with",
    "If a highlight feels too vulnerable, you can swap it for another moment",
    "Caption review is quick — Handler writes them, you just confirm"
  ]
}',
10, 'beginner', 'as_needed', false, ARRAY[],
'Prescribe after every cam session. Automated via cam_session_completed trigger.', 1),

-- CONT2: Denial Check-In
('CONT2', 'social', 'Denial Check-In — Daily Fan Update',
'Write or record a quick denial update for fans.',
'{
  "whatToDo": "1. Write or record a 30-second denial update.\n2. Include: current denial day, how you feel, what''s heightened.\n3. Be honest — vulnerability performs well with fans.\n4. Submit to vault.\n5. Handler will format and post.",
  "whyItMatters": "Fans are tracking your denial. They''re invested in the arc. A daily check-in takes 3 minutes but keeps your audience engaged. Denial content is some of the highest-performing content because it''s genuine, ongoing, and fans feel like they''re part of the journey.\n\nConsistency matters more than quality here. A one-sentence check-in is better than nothing.",
  "tipsForBeginners": [
    "Text is fine if you don''t want to record",
    "Be honest about how you feel — fans connect with real emotions",
    "Handler formats everything — just write raw thoughts",
    "Even ''nothing changed today'' is a valid check-in"
  ]
}',
3, 'beginner', 'daily', false, ARRAY[],
'Prescribe when denial_day >= 3. Daily until denial arc resolves. Low effort, high engagement.', 1),

-- CONT3: Outfit Try-On (Fan-Selected)
('CONT3', 'style', 'Outfit Try-On — Fan Selected',
'Put on the outfit fans voted for. Document it for them.',
'{
  "whatToDo": "1. Put on the outfit fans voted for in the recent poll.\n2. Full length mirror photo, neck down, 3 angles (front, side, back).\n3. One candid shot (adjusting outfit, looking in mirror).\n4. Submit all photos to vault.\n5. Handler creates carousel content from the photos.",
  "whyItMatters": "Fans picked this. They voted on what you''d wear, and now they get to see you in it. This closes the feedback loop that makes fans feel like they have real influence over your journey.\n\nOutfit content is also one of the most shareable content types — it works across platforms and attracts new subscribers who see the style progression.",
  "tipsForBeginners": [
    "Good lighting makes a massive difference in outfit photos",
    "Three angles gives Handler options for carousel posts",
    "The candid shot often performs better than the posed ones",
    "Anonymity rules still apply — check background and framing"
  ]
}',
10, 'intermediate', 'as_needed', true, ARRAY['Fan-voted outfit', 'Full-length mirror'],
'Prescribe after fan poll resolves with outfit theme. Connects fan engagement to content creation.', 1),

-- CONT4: Body Measurement Session
('CONT4', 'body', 'Body Measurement Session',
'Measure, log, photograph. Numbers and photos track progress.',
'{
  "whatToDo": "1. Measure: chest, waist, hips, thighs (same points each time).\n2. Log measurements in the app.\n3. Comparison photos: same angles as your previous session.\n4. Submit photos and measurements to vault.\n5. Handler creates before/after content if changes are detected.",
  "whyItMatters": "Numbers don''t lie. Neither do photos. Body measurements track real physical changes — especially important once HRT begins. Fans invest in visible transformation. Before/after content is the highest-performing content type across all platforms.\n\nConsistent measurement also serves as personal documentation. You''ll want these records for medical consultations and personal reference.",
  "tipsForBeginners": [
    "Measure at the same time of day for consistency (morning recommended)",
    "Mark measurement points with a washable marker for consistency",
    "Same clothing (or lack thereof) each time",
    "Handler only creates comparison content when there''s visible change"
  ]
}',
10, 'intermediate', 'weekly', true, ARRAY['Measuring tape', 'Mirror', 'Camera'],
'Prescribe at regular intervals (weekly or bi-weekly). Critical for body domain arc tracking. Especially important during HRT.', 1)

ON CONFLICT (template_code) DO UPDATE SET
  name = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description = EXCLUDED.full_description,
  time_minutes = EXCLUDED.time_minutes,
  difficulty = EXCLUDED.difficulty,
  requires_privacy = EXCLUDED.requires_privacy,
  requires_supplies = EXCLUDED.requires_supplies,
  prescription_context = EXCLUDED.prescription_context;
