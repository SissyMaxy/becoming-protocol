-- Seed Data: Task Templates
-- Rich task content library for feminization practices
-- All templates from the Task Description Template System

-- ===========================================
-- VOICE DOMAIN (V1-V5)
-- ===========================================

INSERT INTO task_templates (template_code, domain, name, short_description, full_description, time_minutes, difficulty, frequency, requires_privacy, requires_supplies, prescription_context, min_phase) VALUES

-- V1: Pitch Awareness Baseline
('V1', 'voice', 'Record Your Voice Baseline',
'Record yourself speaking naturally to establish your starting point.',
'{
  "whatToDo": "1. Find a quiet space where you won''t be interrupted.\n2. Open a voice recording app on your phone.\n3. Read the following passage aloud in your normal, everyday voice:\n\n\"Hello, my name is [your chosen name]. I''m recording this to track my voice progress. Today I feel [describe how you feel]. The weather outside is [describe it]. I''m looking forward to [something you''re anticipating].\"\n\n4. Then, without reading, just talk for 30 seconds about your day.\n5. Save the recording with today''s date.\n6. If you have a pitch analyzer app (like Voice Tools or Vocal Pitch Monitor), note your average pitch in Hz.",
  "whyItMatters": "Your voice is one of the most socially gendered cues. When someone hears you before seeing you, your voice shapes their perception. The average male voice sits around 100-150 Hz; the average female voice around 180-230 Hz. But pitch isn''t everything—resonance, intonation, and speech patterns matter just as much.\n\nThis baseline recording is your \"before.\" In weeks and months, you''ll listen back and hear the change. That evidence is powerful when doubt creeps in.",
  "tipsForBeginners": [
    "Don''t try to sound feminine yet—this is about capturing where you are now",
    "Your voice might sound worse to you than it does to others (everyone hates their recorded voice at first)",
    "Store recordings somewhere private but accessible—you''ll want them later",
    "Morning voice is lower than evening voice; try to record at the same time each day for consistency"
  ]
}',
5, 'beginner', 'once', true, ARRAY['Phone with recording app', 'Pitch analyzer app (optional)'],
'Prescribe at the start of voice training journey. Good first voice task.', 1),

-- V2: Pitch Glides
('V2', 'voice', 'Pitch Glides / Sirens',
'Slide your voice up and down to expand your range and find your feminine register.',
'{
  "whatToDo": "1. Sit or stand comfortably. Relax your shoulders and jaw.\n2. Take a breath and hum at your normal comfortable pitch.\n3. Slowly slide your hum UP as high as you can go without straining—like a siren going up.\n4. Hold at the top for a moment (this might feel squeaky or thin—that''s okay).\n5. Slowly slide back DOWN to your starting pitch.\n6. Repeat 5 times.\n7. Now try starting in the middle and only going UP, staying in the higher range for a few seconds before coming back down.\n8. Notice where in your range your voice feels \"bright\" versus \"dark.\" The bright area is closer to feminine resonance.",
  "whyItMatters": "Most people have a wider pitch range than they use in daily speech. You''ve been unconsciously keeping your voice in a masculine range for years—your vocal cords can actually go much higher. This exercise:\n- Warms up your voice safely\n- Shows you what higher pitches feel like in your body\n- Begins training the muscles that control pitch\n- Helps you find your \"target range\" (usually 180-220 Hz for a natural feminine voice)",
  "tipsForBeginners": [
    "Don''t push into pain—strain means you''re forcing it",
    "Your voice might crack or flip into falsetto; that''s normal and will smooth out with practice",
    "The goal isn''t to speak in falsetto (that airy, Mickey Mouse sound)—it''s to strengthen your modal voice at higher pitches",
    "Try this in the shower; the acoustics are forgiving and the water covers the sound"
  ],
  "variations": [
    "Do it on different vowels: \"eeee,\" \"oooo,\" \"aaaa\"",
    "Try it while yawning (opens the throat)",
    "Hum through a straw for added resistance training"
  ]
}',
5, 'beginner', 'daily', true, ARRAY[]::TEXT[],
'Daily voice warmup. Prescribe frequently for voice training.', 1),

-- V3: Resonance Shifting
('V3', 'voice', 'Resonance Practice (Brightening Your Voice)',
'Learn to shift where your voice resonates from chest to head, creating a more feminine timbre.',
'{
  "whatToDo": "1. Place one hand on your chest and one on your cheek/jaw.\n2. Say \"HMMM\" at a comfortable pitch. Feel where the vibration is strongest—probably your chest.\n3. Now, keeping the same pitch, try to move the vibration UP. Imagine the sound is coming from behind your eyes or the top of your head instead of your chest.\n4. Say \"HMMM\" again. The hand on your chest should feel less vibration; the hand on your face should feel more.\n5. Once you can feel the shift, try saying these words while keeping the resonance HIGH:\n   - \"Hello\"\n   - \"How are you\"\n   - \"My name is [name]\"\n6. It will feel strange and maybe \"small\" or \"thin.\" That''s the direction you want.\n7. Practice holding this resonance while speaking a full sentence.",
  "whyItMatters": "Resonance is often MORE important than pitch for gendering a voice. A voice can be at 150 Hz and still sound feminine if the resonance is bright and forward. Conversely, a voice at 200 Hz can sound masculine if it''s chest-resonant.\n\nThink of it like this: pitch is the note you''re singing; resonance is which instrument is playing it. You''re learning to be a flute instead of a cello.\n\nThis is one of the core skills of voice feminization and takes time to develop. The goal is for high resonance to become your default without thinking about it.",
  "tipsForBeginners": [
    "This feels WEIRD at first—like you''re doing a character voice. That''s normal.",
    "It''s not about sounding \"girly\" or \"cute\"—it''s about shifting the physical placement of sound.",
    "Some people find it helps to imagine speaking \"through their nose\" (but without actually being nasal).",
    "YouTube videos from voice coaches like TransVoiceLessons can demonstrate this visually.",
    "You might feel like you''re \"faking it.\" Keep going. It becomes real."
  ],
  "nextLevel": "Once you can find the resonance at will, the goal is to hold it while speaking at normal conversational speed without losing it."
}',
10, 'intermediate', 'daily', true, ARRAY['Mirror (helpful)'],
'Core voice feminization skill. Prescribe after pitch basics established.', 1),

-- V4: Feminine Intonation
('V4', 'voice', 'Intonation Practice',
'Learn the musical patterns of feminine speech—how pitch rises and falls within sentences.',
'{
  "whatToDo": "1. Feminine speech tends to have MORE pitch variation than masculine speech. Men often speak in a narrower range; women use more \"melody.\"\n\n2. Practice these patterns:\n\n   **Rising at the end (uptalk):**\n   Say: \"I went to the store?\" (pitch goes UP at the end)\n   vs: \"I went to the store.\" (pitch stays flat or drops)\n   \n   Women use rising intonation more often, even in statements. Not every sentence—but more than you currently do.\n\n3. **Wider pitch swings:**\n   Say: \"That''s SO amazing!\" \n   Let \"SO\" go high, \"amazing\" start high and slide down.\n   vs: \"That''s so amazing.\" (flat, monotone)\n\n4. **Practice these sentences with exaggerated melody:**\n   - \"Oh my god, really?\"\n   - \"I was thinking we could go to that new place.\"\n   - \"That''s so sweet of you!\"\n   - \"Wait, what do you mean?\"\n\n5. Record yourself and compare to recordings of cis women you admire (podcasts, YouTubers, friends).",
  "whyItMatters": "Even with perfect pitch and resonance, monotone delivery will be read as masculine. The \"music\" of speech is deeply gendered. Women tend to:\n- Use more pitch variation\n- Rise at the end of phrases more often\n- Emphasize words with pitch changes rather than just volume\n- Have more \"animated\" vocal delivery\n\nThis isn''t about being bubbly or fake—it''s about matching the patterns your brain expects from a female voice.",
  "tipsForBeginners": [
    "This might feel performative or \"gay\" at first. That''s internalized expectations. Push through.",
    "Listen to women who match your personality—not all women sound the same. Find YOUR feminine voice.",
    "Start exaggerated in practice; it will naturally tone down in real conversation.",
    "You''re not changing your personality, just how you express it."
  ]
}',
10, 'intermediate', '2-3x_weekly', true, ARRAY['Voice recorder', 'Headphones for playback'],
'Prescribe after basic pitch and resonance work.', 1),

-- V5: Reading Aloud
('V5', 'voice', 'Read Aloud Practice',
'Practice maintaining your feminine voice while reading passages aloud.',
'{
  "whatToDo": "1. Choose a passage to read. Good options:\n   - A page from a novel you''re reading\n   - A news article\n   - Song lyrics (spoken, not sung)\n   - The \"Rainbow Passage\" (a standard voice therapy text—Google it)\n\n2. Before you start, warm up with 5 pitch glides.\n\n3. Set your voice:\n   - Raise pitch slightly above your default\n   - Shift resonance forward/bright\n   - Breathe from your diaphragm\n\n4. Read the passage aloud slowly, focusing on maintaining:\n   - Consistent higher pitch\n   - Forward resonance\n   - Melodic intonation\n   \n5. Record yourself.\n\n6. Listen back. Note:\n   - Where did you slip back into chest voice?\n   - Where did your pitch drop?\n   - Where did you go monotone?\n\n7. Re-read the same passage, addressing those moments.",
  "whyItMatters": "Speaking naturally requires your voice to become automatic. You can''t think about pitch, resonance, AND intonation in real-time conversation—it''s too much. Reading aloud is controlled practice where you can build muscle memory without the cognitive load of also thinking about what to say.\n\nThink of it like playing scales on piano before performing a song.",
  "tipsForBeginners": [
    "Start with 1-2 minutes of reading. It''s tiring at first.",
    "Your voice will fatigue. That''s okay—don''t push through pain, just practice consistently.",
    "Hydration matters. Drink water. Avoid excessive caffeine before practice.",
    "Morning practice is harder (voice is lower); evening practice may feel easier."
  ]
}',
15, 'intermediate', 'daily', true, ARRAY['Reading material', 'Recording device'],
'Daily voice practice for building muscle memory.', 1),

-- ===========================================
-- MOVEMENT DOMAIN (M1-M4)
-- ===========================================

-- M1: Posture Reset
('M1', 'movement', 'Feminine Posture Reset',
'Align your body into a more feminine posture and hold it for 60 seconds.',
'{
  "whatToDo": "1. Stand in front of a mirror if possible.\n\n2. **Feet:** Place them closer together than you usually would. Masculine stance is wide; feminine stance is narrower. Point your toes slightly outward.\n\n3. **Hips:** Shift your weight slightly onto one hip. Let that hip rise a bit. This is the classic \"hip pop\" that creates a feminine silhouette.\n\n4. **Pelvis:** Tuck your pelvis slightly—imagine lifting your pubic bone. This reduces the appearance of a lower belly and creates a feminine curve.\n\n5. **Shoulders:** Roll them back and DOWN. Masculine posture tends to be forward and raised; feminine posture has shoulders back but low and relaxed.\n\n6. **Chest:** Lift your sternum slightly without puffing out your chest. Think \"elegant,\" not \"military.\"\n\n7. **Head:** Lengthen your neck. Imagine a string pulling the crown of your head toward the ceiling. Chin slightly tucked, not jutting forward.\n\n8. **Arms:** Let them rest at your sides with a slight curve at the elbow. Hands can face your body or slightly forward. No fists; fingers relaxed and slightly separated.\n\n9. Hold this position for 60 seconds while breathing normally.\n\n10. Release and shake out. Then return to the posture.",
  "whyItMatters": "Posture is read instantly and subconsciously. Before anyone hears your voice or sees your face, your silhouette communicates gender. Masculine posture takes up space (wide stance, shoulders forward, chest out); feminine posture is more contained and curved.\n\nThis isn''t about shrinking yourself—it''s about learning a different physical vocabulary. Over time, feminine posture becomes your default, and masculine posture feels unnatural.",
  "tipsForBeginners": [
    "This will feel awkward and unstable at first. Your muscles aren''t used to holding this position.",
    "Don''t overcorrect into stiffness. Feminine posture is relaxed, not rigid.",
    "Check yourself throughout the day: how are you standing right now?",
    "Crossing your arms or putting hands in pockets is fine—just notice how you do it."
  ]
}',
2, 'beginner', 'daily', false, ARRAY['Mirror (helpful)'],
'Quick daily reset. Can be done multiple times per day.', 1),

-- M2: Walking Practice
('M2', 'movement', 'Feminine Gait Training',
'Practice walking with a narrower, hip-forward gait instead of a wide masculine stride.',
'{
  "whatToDo": "1. Find a space where you can walk at least 15-20 steps in a straight line.\n\n2. **First, notice your default walk:**\n   Walk naturally for 10 steps. Pay attention to:\n   - How wide apart are your feet?\n   - Do your feet land in two parallel tracks or one line?\n   - Where does your forward motion come from—your hips or your shoulders?\n   - How big are your strides?\n\n3. **Now adjust:**\n\n   **Feet:** Imagine you''re walking on a narrow beam or a single line. Your feet should land almost in front of each other, not side by side. This naturally creates hip movement.\n\n   **Hips:** Let your hips shift side to side. Don''t force it—when your feet land in a narrow track, your hips HAVE to move to balance. Allow it.\n\n   **Stride:** Shorten your steps slightly. Masculine walking covers ground; feminine walking is more contained.\n\n   **Arms:** Let them swing gently, but closer to your body. Less \"marching,\" more \"flowing.\" Slight bend at the elbow.\n\n   **Speed:** Slightly slower than your default. You''re not in a rush.\n\n4. Walk this way for 2-3 minutes. Notice how it feels in your body.\n\n5. If you have a mirror or can record yourself, do it. The visual feedback is invaluable.",
  "whyItMatters": "Gait is one of the most reliable gender cues. Studies show people can identify gender from walking silhouettes with high accuracy—even from a distance where no other features are visible. Men walk with lateral stability (wide, shoulders driving); women walk with vertical stability (narrow, hips driving).\n\nYou''ve been walking \"like a man\" for your entire life. This takes conscious retraining, but eventually becomes automatic.",
  "tipsForBeginners": [
    "Don''t exaggerate into a \"runway walk\"—that looks performative. You want subtle.",
    "Practice in private first. It feels silly until it doesn''t.",
    "Wearing feminine shoes (even just around the house) can help your body find the gait naturally.",
    "Watch how women you admire walk. Not models—regular women. Notice the variation."
  ],
  "variations": [
    "Practice walking in heels (even low ones) to train balance and hip movement",
    "Practice walking while holding something (purse, coffee)—how does that change your posture?",
    "Practice walking with intention toward something vs. wandering"
  ]
}',
10, 'beginner', 'daily', true, ARRAY['Clear walking space', 'Mirror/camera (helpful)'],
'Daily movement practice. Builds automatic feminine gait.', 1),

-- M3: Sitting Practice
('M3', 'movement', 'Feminine Sitting Positions',
'Practice sitting in feminine positions until they become natural.',
'{
  "whatToDo": "1. Sit in a chair with a flat seat (not a deep couch).\n\n2. **The default masculine sit:**\n   Wide legs, feet flat, leaning back, taking up space. This is what you''re unlearning.\n\n3. **Feminine sitting options to practice:**\n\n   **Knees together, feet together:**\n   Basic and neutral. Knees and ankles touching, feet flat on the floor. Hands resting on thighs or in lap.\n\n   **Knees together, ankles crossed:**\n   Same as above, but cross your ankles. This is a classic \"polite\" feminine position.\n\n   **Legs crossed at the knee:**\n   Cross one leg over the other at the knee. Let the top foot hang. Notice which direction feels natural. Switch and practice the other way.\n\n   **Legs crossed, leaning slightly:**\n   Same as above but lean very slightly toward the crossed leg. This creates a curved silhouette.\n\n   **The \"royal\" sit:**\n   Both feet on floor, knees angled slightly to one side together. Like you''re sitting side-saddle on an invisible horse. Very elegant.\n\n4. For each position, hold for 30-60 seconds. Notice where you feel tension or instability.\n\n5. Practice getting INTO and OUT OF these positions gracefully. Don''t flop or spread—move with intention.",
  "whyItMatters": "How you sit signals gender constantly—at work, at restaurants, on the subway, at home. Masculine sitting claims space; feminine sitting is contained and often angled. Crossing your legs at the knee is read as feminine in Western culture.\n\nThis is also about comfort. Once these positions become natural, you''ll find yourself defaulting to them without thinking, and the dysphoria of \"sitting like a man\" will fade.",
  "tipsForBeginners": [
    "Your hip flexibility might limit some positions at first. That improves with practice.",
    "If crossing at the knee is uncomfortable, start with ankles crossed and work up.",
    "Practice while watching TV, working at your desk, eating meals. Low stakes, high reps.",
    "Notice how you sit when you''re NOT thinking about it. Catching yourself is progress."
  ]
}',
5, 'beginner', 'daily', false, ARRAY['Chair'],
'Can be practiced anywhere. Good for passive daily practice.', 1),

-- M4: Hand Gestures
('M4', 'movement', 'Feminine Hand Mannerisms',
'Practice more feminine hand gestures and resting positions.',
'{
  "whatToDo": "1. **Resting hand positions:**\n\n   **Hands in lap (sitting):**\n   Rest one hand on top of the other, fingers relaxed and slightly separated (not interlaced). Palms can be up or down.\n\n   **Arms at sides (standing):**\n   Let arms hang with a slight curve at the elbow. Fingers relaxed, not balled into fists. Wrists slightly turned so palms face your thighs or slightly forward.\n\n   **One hand on hip:**\n   Place your hand on your hip with fingers pointing DOWN or BACK, not forward. Elbow out slightly. This is a classic feminine pose.\n\n   **Touching your face/hair:**\n   Women touch their face and hair more often than men. Practice light touches—tucking hair behind ear, resting fingertips on your cheek while listening, touching your collarbone.\n\n2. **Gestures while speaking:**\n\n   **Open palms:**\n   When gesturing, show your palms more often. Feminine gestures tend to be open; masculine gestures are more closed (pointing, chopping).\n\n   **Wrist movement:**\n   Let your wrists be loose. Feminine gestures have more wrist rotation; masculine gestures are stiff-wristed.\n\n   **Smaller movements:**\n   Feminine gestures tend to be in the area directly in front of the body, not sweeping widely. Contained but expressive.\n\n3. Practice a few minutes of speaking (narrate what you''re doing, or talk to yourself) while consciously using these gestures.",
  "whyItMatters": "Hand mannerisms are subtle but constant. They''re part of the unconscious \"feminine body language\" package that cis women learn through socialization. You''re installing this software retroactively.\n\nThese aren''t about being dainty or delicate—plenty of women have bold gestures. It''s about the QUALITY of movement: curved vs. angular, open vs. closed, fluid vs. rigid.",
  "tipsForBeginners": [
    "Don''t worry about overdoing it in practice—it will naturally tone down in real life.",
    "Watch interviews with women you find relatable. Notice their hands.",
    "Your hands will feel performative at first. That fades.",
    "Rings and bracelets draw attention to hands and can help you feel more feminine while practicing."
  ]
}',
5, 'beginner', '2-3x_weekly', false, ARRAY['Mirror (helpful)'],
'Subtle but constant gender cue. Good for ongoing awareness.', 1);

-- Continue with more templates...
INSERT INTO task_templates (template_code, domain, name, short_description, full_description, time_minutes, difficulty, frequency, requires_privacy, requires_supplies, prescription_context, min_phase) VALUES

-- ===========================================
-- SKINCARE DOMAIN (S1-S3)
-- ===========================================

-- S1: Morning Routine
('S1', 'skincare', 'Morning Skincare Routine',
'A simple AM skincare routine that cares for your skin and builds a feminine self-care habit.',
'{
  "whatToDo": "1. **Cleanser** (1 minute)\n   - Splash your face with lukewarm water.\n   - Apply a gentle cleanser (like CeraVe, La Roche-Posay, or Cetaphil) to damp skin.\n   - Massage in circular motions for 30-60 seconds.\n   - Rinse completely.\n   - Pat dry with a clean towel—don''t rub.\n\n2. **Moisturizer** (30 seconds)\n   - While your face is still slightly damp, apply a moisturizer.\n   - Use about a nickel-sized amount.\n   - Apply in upward and outward motions—be gentle around your eyes.\n\n3. **Sunscreen** (30 seconds)\n   - Apply SPF 30+ sunscreen even if you''re staying indoors (screens emit UV).\n   - This is the single most important anti-aging step.\n   - Reapply every 2 hours if you''re outside.\n\n4. **The framing:**\n   As you do this, internally narrate: \"I''m caring for her skin. This is her face. She deserves this care.\"",
  "whyItMatters": "Skincare is one of the most consistent gender-socializing activities women do. Little girls watch their mothers moisturize; teenagers bond over skincare routines; adult women have rituals. You''re giving yourself what you should have had all along.\n\nBeyond the emotional component: healthy skin reads as more feminine. Clear, hydrated, protected skin is the canvas for everything else. If you go on HRT, your skin will change—this routine prepares it.\n\nAnd the ritual itself creates a daily anchor. Two minutes every morning where you are explicitly caring for the woman you''re becoming.",
  "tipsForBeginners": [
    "Don''t buy 10 products at once. Start with these three.",
    "\"Fancy\" isn''t better. Drugstore products work great. CeraVe and Cetaphil are trans girl staples.",
    "If your skin feels tight after washing, your cleanser is too harsh.",
    "Consistency matters more than perfection. Every day, simple."
  ]
}',
5, 'beginner', 'daily', false, ARRAY['Gentle cleanser', 'Moisturizer', 'SPF 30+ sunscreen'],
'Foundation habit. Prescribe early and often.', 1),

-- S2: Evening Routine
('S2', 'skincare', 'Evening Skincare Ritual',
'A nightly routine that removes the day, treats your skin, and serves as an evening wind-down anchor.',
'{
  "whatToDo": "1. **Remove makeup/sunscreen** (if wearing) (1 minute)\n   - Use micellar water on a cotton pad OR a cleansing oil/balm.\n   - Gently wipe across your entire face.\n   - This breaks down SPF and any makeup so your cleanser can work.\n\n2. **Cleanse** (1 minute)\n   - Use your morning cleanser or a slightly richer one for evening.\n   - Massage for 60 seconds. This is not a race.\n   - Be gentle around your eyes.\n\n3. **Treatment** (30 seconds)\n   - If you''re using any actives (retinol, vitamin C, AHA/BHA), apply them now.\n   - Start slowly with actives—every other night.\n   - For beginners: skip this step until you''ve got the basics down.\n\n4. **Moisturize** (30 seconds)\n   - Evening moisturizer can be richer than morning.\n   - Or use the same one—that''s fine.\n\n5. **Eye cream** (optional) (15 seconds)\n   - Dab a small amount around the orbital bone (not on the lid).\n   - Use your ring finger—it applies the lightest pressure.\n\n6. **The framing:**\n   Make this feel like a ritual, not a chore. Light a candle. Play soft music. Look at yourself in the mirror and say goodnight to her.",
  "whyItMatters": "The evening routine is longer and more intentional than the morning. It''s a transition ritual: the day is over, you''re washing it away, you''re preparing for sleep. This is \"her time.\"\n\nNight is also when your skin repairs itself. The products you apply before bed have 7-8 hours to work. This is when actives like retinol are most effective.\n\nAs a practice: if you only do one skincare routine, do this one. Most skin damage happens during the day; repair happens at night.",
  "tipsForBeginners": [
    "Don''t introduce actives (retinol, acids) until your basic routine is solid.",
    "If you have facial hair you''re not yet removing, skincare still matters—just work around it.",
    "Double cleansing (oil/balm + regular cleanser) is a game changer for removing sunscreen.",
    "This is a gift to yourself. Don''t rush it."
  ]
}',
10, 'beginner', 'daily', false, ARRAY['Makeup remover/micellar water', 'Cleanser', 'Moisturizer', 'Optional treatments'],
'Evening ritual. Pairs with morning routine.', 1),

-- S3: Body Care
('S3', 'skincare', 'Full Body Care Session',
'Care for the skin on your whole body, not just your face.',
'{
  "whatToDo": "1. **In the shower:**\n   - Use a gentle body wash (avoid harsh bar soaps that dry skin).\n   - Consider a loofah or exfoliating gloves 2-3x/week for smoother skin.\n   - Wash thoroughly but gently in areas you want to be soft.\n\n2. **After the shower (while skin is damp):**\n   - Apply body lotion or cream everywhere. Yes, everywhere.\n   - Pay special attention to: elbows, knees, hands, feet (often neglected).\n   - Use upward strokes—toward your heart.\n\n3. **Special areas:**\n   - **Hands:** Apply hand cream after every wash. Keep some by every sink.\n   - **Feet:** Use a thicker foot cream at night. Consider socks over it.\n   - **Lips:** Apply lip balm. Keep one by your bed, one in your bag.\n\n4. **The framing:**\n   As you moisturize, notice how your skin feels. Appreciate your body. This is her body. You''re caring for it.",
  "whyItMatters": "Women are socialized to have soft, cared-for skin everywhere. Men are socialized to ignore their bodies. This is literally a practice of treating your entire body as worthy of care.\n\nSoft skin also feels more feminine when YOU touch it. Every time you brush your arm against something, you''re reminded: this is her body, and it''s soft.\n\nIf you''re shaving your legs, arms, or body—moisturized skin shaves better, gets less irritation, and heals faster.",
  "tipsForBeginners": [
    "Buy a big pump bottle of body lotion. Fancy isn''t necessary—CeraVe, Aveeno, or even Lubriderm work great.",
    "Apply lotion within 3 minutes of showering while skin is still damp. It locks in moisture.",
    "Your skin may feel \"greasy\" at first if you''re not used to lotion. That fades as your skin adjusts.",
    "This is especially important in winter or dry climates."
  ]
}',
10, 'beginner', 'daily', true, ARRAY['Body wash', 'Loofah/gloves (optional)', 'Body lotion', 'Hand cream', 'Lip balm'],
'Full body self-care. Good post-shower routine.', 1),

-- ===========================================
-- STYLE DOMAIN (ST1-ST3)
-- ===========================================

-- ST1: Wardrobe Inventory
('ST1', 'style', 'Current Wardrobe Assessment',
'Take inventory of what you own and identify gaps for building a feminine wardrobe.',
'{
  "whatToDo": "1. Set aside 30-60 minutes when you won''t be interrupted.\n\n2. Go through your entire wardrobe and sort into:\n   - **Keep masculine:** Items you need for work, family events, or public situations where you''re not yet out.\n   - **Neutral:** Items that could work for any gender (t-shirts, jeans, sweaters).\n   - **Donate/remove:** Items that make you feel dysphoric and you don''t need.\n   - **Feminine owned:** Any feminine items you already have.\n   - **Feminine wishlist:** Items you want but don''t yet own (note these down).\n\n3. For feminine items, further categorize:\n   - Underwear/shapewear\n   - Loungewear/sleepwear\n   - Casual daytime\n   - Going out\n   - Exercise/athleisure\n\n4. Identify the biggest gap. Where do you need to start?\n\n5. Make a shopping list of 3-5 items to acquire next. Keep it specific.",
  "whyItMatters": "You can''t build a wardrobe without knowing what you have. Most trans women start with random pieces—panties, a dress bought on impulse—but no cohesive collection. This exercise helps you see the full picture.\n\nIt also forces confrontation: how many masculine items are you holding onto out of obligation? What would it feel like to let go of some of them?\n\nThe goal isn''t to throw everything away—it''s to make conscious choices and build intentionally.",
  "tipsForBeginners": [
    "Don''t get rid of masculine items you actually need yet. Stealth requires options.",
    "The \"wishlist\" is as important as the \"have\" list. Desire is data.",
    "If you have feminine items hidden, bring them into your inventory. They count.",
    "Size guides vary wildly between brands. Keep your measurements handy."
  ]
}',
45, 'beginner', 'once', true, ARRAY['Pen and paper or notes app', 'Your wardrobe'],
'Foundation for style building. Do early in journey.', 1),

-- ST2: First Outfit
('ST2', 'style', 'Put Together a Complete Look',
'Assemble a complete feminine outfit from head to toe and wear it.',
'{
  "whatToDo": "1. Choose an outfit you own (or acquire one). It should include:\n   - Underwear (panties, bra or bralette if desired)\n   - Bottom (skirt, dress, leggings, feminine jeans)\n   - Top (blouse, feminine t-shirt, or the top half of a dress)\n   - Optional: Shapewear if you want more curves\n\n2. Put on each piece thoughtfully. Don''t rush.\n\n3. Look at yourself in a full-length mirror. Really look.\n   - What do you notice?\n   - What creates euphoria?\n   - What feels off?\n   - What would you change?\n\n4. Move around. Sit down. Walk. Reach for something. How does the outfit feel in motion?\n\n5. Take a photo if you''re comfortable. Not for anyone else—for you. Evidence of her.\n\n6. Wear it for at least 30 minutes. Do something normal: make tea, watch TV, work on your computer. Let the outfit become unremarkable.",
  "whyItMatters": "A complete outfit is different from a single item. Anyone can put on panties—but panties plus a skirt plus a top plus looking at yourself in the mirror is a full embodiment experience.\n\nThis practice makes \"being dressed as her\" normal. The first time feels monumental. The tenth time feels like getting dressed.",
  "tipsForBeginners": [
    "Start with comfort over style. Leggings and an oversized feminine sweater is valid.",
    "Don''t expect to look like a cis woman. Look for what makes YOU feel good.",
    "Imperfect fits are okay. You''re learning what works for your body.",
    "If you feel ridiculous, that''s normal. It fades with exposure.",
    "Euphoria often mixes with fear. That''s not a contradiction—it''s both at once."
  ]
}',
30, 'beginner', 'as_needed', true, ARRAY['A complete outfit'],
'Full embodiment practice. Prescribe when user has clothing.', 1),

-- ST3: Underwear Practice
('ST3', 'style', 'Wearing Feminine Underwear Today',
'Wear panties or other feminine underwear all day, even under masculine clothes.',
'{
  "whatToDo": "1. Select a pair of panties or feminine underwear.\n   - For beginners: bikini or hipster cuts offer good coverage\n   - If tucking: look for underwear designed for tucking, or use a gaff\n\n2. Put them on in the morning like any other underwear.\n\n3. Go about your day.\n\n4. Notice:\n   - How does the fabric feel different?\n   - When are you aware of them?\n   - How does knowing you''re wearing them affect your inner state?\n   - Is there a \"secret self\" pleasure? (There often is.)\n\n5. At the end of the day, reflect: Was this comfortable? Affirming? Something you want to continue?",
  "whyItMatters": "This is one of the simplest and most consistent feminization anchors. No one can see it. You can do it anywhere. But YOU know. That knowledge creates a constant low-level reminder of who you are.\n\nOver time, masculine underwear starts to feel wrong—like wearing the wrong uniform. Feminine underwear becomes your default, and the identity shift follows.",
  "tipsForBeginners": [
    "Cotton is breathable and good for daily wear.",
    "Size up if you''re between sizes, especially if tucking.",
    "Having 7+ pairs means you''re not doing constant laundry.",
    "If you''re worried about others seeing them, hand-wash and hang to dry in a private spot."
  ]
}',
1, 'beginner', 'daily', true, ARRAY['Feminine underwear'],
'Daily anchor practice. Very low effort, high impact.', 1);

-- Continue with more templates...
INSERT INTO task_templates (template_code, domain, name, short_description, full_description, time_minutes, difficulty, frequency, requires_privacy, requires_supplies, prescription_context, min_phase) VALUES

-- ===========================================
-- MINDSET DOMAIN (MI1-MI4)
-- ===========================================

-- MI1: Morning Affirmation
('MI1', 'mindset', 'Morning Mirror Affirmation',
'Start your day by affirming your identity to yourself in the mirror.',
'{
  "whatToDo": "1. Stand in front of a mirror. Can be bathroom mirror, bedroom mirror—wherever you have a moment of privacy.\n\n2. Look at yourself. Make eye contact with your reflection.\n\n3. Say the following affirmations out loud (not in your head):\n   - \"Good morning, [your chosen name].\"\n   - \"I am a woman.\"\n   - \"Today, I will honor who I am.\"\n   - \"She is here. She has always been here.\"\n\n4. If you want to add more, add ones that address your specific doubts:\n   - \"I am not too old for this.\"\n   - \"My body is already becoming more feminine.\"\n   - \"I don''t need anyone''s permission to be who I am.\"\n   - \"What other people think of me is not my business.\"\n\n5. Take one deep breath. Look at yourself again. Notice how it feels.\n\n6. Go about your day.",
  "whyItMatters": "You''ve likely spent decades with a default inner monologue that misgenders you—that refers to you as \"he,\" that sees your reflection as male. This isn''t neutral; it''s active identity suppression.\n\nAffirmations feel corny because you''re not used to them. But they work. They plant seeds. They override the old programming. \"I am a woman\" said out loud, to yourself, is a radical act when you''ve been told you''re not.\n\nMorning affirmation sets the tone for the day. You''ve begun by asserting who you are.",
  "tipsForBeginners": [
    "It WILL feel fake at first. Do it anyway.",
    "If you cry, that''s good. Something is landing.",
    "If you can''t say \"I am a woman\" yet, start with \"I am becoming the woman I am.\"",
    "Saying it out loud is more powerful than thinking it silently. Your voice matters.",
    "This takes 60 seconds. You have 60 seconds."
  ]
}',
2, 'beginner', 'daily', true, ARRAY['Mirror'],
'Daily identity anchor. Prescribe as morning routine.', 1),

-- MI2: Visualization
('MI2', 'mindset', 'Future Self Visualization',
'Close your eyes and vividly imagine yourself as the woman you''re becoming.',
'{
  "whatToDo": "1. Find a comfortable position—sitting or lying down. Somewhere you won''t be interrupted for 5-10 minutes.\n\n2. Close your eyes. Take 5 slow, deep breaths.\n\n3. Imagine yourself 6 months from now. This isn''t fantasy—it''s a visualization of your realistic future self.\n\n4. Build the image in detail:\n   - **Body:** What does she look like? How has her body changed? Maybe softer skin, different fat distribution, small breast buds if on HRT. Maybe just better grooming and posture.\n   - **Hair:** How does she style it? Is it longer? Colored?\n   - **Clothes:** What is she wearing? What''s her style? How does the outfit make her feel?\n   - **Movement:** How does she walk? How does she hold herself?\n   - **Voice:** How does she sound? Lighter? More melodic?\n   - **Face:** What expression does she have? Is she smiling? Confident?\n\n5. Now imagine her in a scenario:\n   - She''s walking into a coffee shop.\n   - She orders confidently.\n   - The barista says, \"Here you go, ma''am.\"\n   - How does that feel?\n\n6. Stay with the image for a few minutes. Let yourself feel what she feels.\n\n7. Slowly open your eyes. Take a breath. Notice how you feel.",
  "whyItMatters": "Your brain doesn''t fully distinguish between vividly imagined experiences and real ones. Visualization builds neural pathways. Athletes use it; performers use it; you can use it for transition.\n\nMore importantly: you need an image to move toward. If you can''t picture her, how will you become her? This practice clarifies who she is and makes her feel real.",
  "tipsForBeginners": [
    "If visualization is hard for you, try looking at photos of trans women you admire first. Let their images inform yours.",
    "It''s okay if the image shifts over time. She''s becoming clearer as you become clearer.",
    "Don''t police the visualization—let it show you what you want, even if it surprises you.",
    "Some days this is hard. Some days it flows. Both are fine."
  ]
}',
10, 'beginner', '2-3x_weekly', true, ARRAY['Quiet space'],
'Powerful identity building. Good for evening practice.', 1),

-- MI3: Internal Narration
('MI3', 'mindset', 'Catch & Correct Self-Gendering',
'Notice when you misgender yourself internally, and correct it.',
'{
  "whatToDo": "1. Throughout the day, pay attention to your inner monologue.\n\n2. Notice when you refer to yourself in gendered terms—or when your internal \"I\" defaults to masculine assumptions.\n\n3. **Catch it:** \"I need to... like a man...\" or \"He would...\" or even just a masculine image of yourself.\n\n4. **Correct it:** Rephrase in feminine terms.\n   - \"I need to...\" → \"She needs to...\"\n   - \"He would go to the gym.\" → \"She would go to the gym.\"\n   - Internal image of masculine self → mentally replace with your feminine self-image.\n\n5. **Affirm:** Add a quick encouragement.\n   - \"There she is.\"\n   - \"Good girl.\"\n   - \"That''s better.\"\n\n6. **Count:** Keep a rough count of how many times you catch and correct in a day. This is a game you''re winning each time.",
  "whyItMatters": "Your internal monologue has been running in \"male\" mode for potentially decades. That''s not neutral—it''s active misgendering. Every time you think of yourself as \"he\" or picture yourself as male, you''re reinforcing the old identity.\n\nCatching and correcting is rewiring. It''s tedious at first, but over time, the catches become fewer because the corrections become the default. Eventually, \"she\" just IS how you think about yourself.\n\nThis is one of the most powerful identity ratchets—it requires no money, no supplies, no time, no privacy. Just attention.",
  "tipsForBeginners": [
    "This is hard. Your brain has been doing it automatically for years.",
    "Don''t beat yourself up for catches—celebrate them. A catch is a WIN. It means you noticed.",
    "It gets easier. The first week you might catch 50 times a day. A month later, maybe 5.",
    "Try narrating routine tasks: \"She''s making coffee. She''s checking her email.\""
  ]
}',
0, 'intermediate', 'daily', false, ARRAY[]::TEXT[],
'All-day practice. Core identity rewiring technique.', 1),

-- MI4: Doubt Processing
('MI4', 'mindset', 'Journaling Through Doubt',
'When doubt or imposter syndrome hits, write through it instead of repressing it.',
'{
  "whatToDo": "1. When you''re experiencing doubt—\"Am I really trans? What if I''m wrong? This is stupid\"—get out a journal or open a note.\n\n2. Write the doubt down explicitly:\n   - \"I''m doubting that I''m really trans because...\"\n   - \"I''m afraid that...\"\n   - \"The voice telling me to stop is saying...\"\n\n3. Ask yourself these questions and write the answers:\n   - \"Where does this doubt come from? Is it MY voice or someone else''s?\"\n   - \"If I knew with 100% certainty that I am trans, what would I do differently right now?\"\n   - \"What does my euphoria tell me? When have I felt most like myself?\"\n   - \"What am I actually afraid of? (Not the surface—the real fear.)\"\n\n4. Write a response to the doubt as if talking to a friend who was experiencing it:\n   - \"Of course you''re doubting—this is scary.\"\n   - \"Your fear is not evidence that you''re wrong.\"\n   - \"Cis people don''t spend years wishing they were another gender.\"\n\n5. Close with an affirmation. Even if you don''t fully believe it yet.",
  "whyItMatters": "Doubt is part of the process. Every trans person experiences imposter syndrome. The problem isn''t having doubt—it''s letting doubt run unchallenged in your head.\n\nWriting externalizes the doubt. It takes it out of the spinning mental loop and puts it where you can see it. From there, you can question it, challenge it, and often see how flimsy it actually is.\n\nRepressed doubt festers. Processed doubt loses power.",
  "tipsForBeginners": [
    "Don''t journal only when things are hard—but definitely journal when things are hard.",
    "No one will read this but you. Be honest.",
    "Doubt often peaks right before breakthroughs. If you''re doubting a lot, you might be close to something important.",
    "Keep these entries. When doubt comes back, you can re-read your own wisdom."
  ]
}',
15, 'intermediate', 'as_needed', true, ARRAY['Journal or notes app'],
'Prescribe when user expresses doubt or imposter syndrome.', 1),

-- ===========================================
-- SOCIAL DOMAIN (SO1-SO3)
-- ===========================================

-- SO1: Name Practice
('SO1', 'social', 'Practice Introducing Yourself',
'Practice saying your chosen name out loud until it feels natural.',
'{
  "whatToDo": "1. Stand in front of a mirror (or sit at a desk, or wherever you are).\n\n2. Say out loud: \"Hi, I''m [chosen name].\" Use your target voice if you''re practicing it.\n\n3. Repeat it 10 times.\n\n4. Now try variations:\n   - \"My name is [name].\"\n   - \"I''m [name], nice to meet you.\"\n   - \"People call me [name].\"\n   - \"[Name]. Yeah, just [name].\"\n\n5. Practice as if responding to different scenarios:\n   - A barista asking for your name for an order\n   - Meeting someone at a party\n   - A work introduction\n   - A phone call\n\n6. Notice how it feels. Awkward? Exciting? Terrifying? Right?\n\n7. Do this practice multiple times until saying the name becomes automatic.",
  "whyItMatters": "Your name is the most frequent word others will use to refer to you. If you hesitate, stumble, or look uncertain when giving your name, people notice—even subconsciously.\n\nPracticing alone makes the word familiar in your mouth. It removes the cognitive load of producing the name on demand. When the moment comes to use it in public, you want it to flow naturally.",
  "tipsForBeginners": [
    "If you''re still exploring names, practice several. See which one feels best to say.",
    "Record yourself. How does the name sound in your voice?",
    "Practice with different last names if you''re considering changing yours.",
    "This feels silly. Do it anyway. The silliness fades; the skill remains."
  ]
}',
5, 'beginner', 'daily', true, ARRAY['Mirror (optional)'],
'Prescribe when user has chosen a name.', 1),

-- SO2: Name in Public
('SO2', 'social', 'Use Your Name in Public',
'Use your chosen name in a low-stakes real-world situation.',
'{
  "whatToDo": "1. Choose a situation where someone will ask your name and it doesn''t matter if it''s \"wrong\":\n   - Coffee shop order\n   - Restaurant reservation\n   - Pickup order (online order for food, etc.)\n   - Loyalty card at a store you''ll never return to\n   - Hotel check-in if traveling\n\n2. When they ask \"Name?\" give your chosen name. Just say it.\n\n3. If they ask you to spell it, spell it.\n\n4. Watch their reaction (or non-reaction). Notice: they don''t care. They wrote it down. It''s just a name.\n\n5. When they call your name—\"[Name], your order is ready\"—that''s someone using your name in the world. Notice how that feels.\n\n6. Log the experience. What happened? How did it feel?",
  "whyItMatters": "Hearing your name from someone else''s mouth is powerful. It makes the name real. It exists in the world now, not just in your head.\n\nStarting with strangers who have no investment in your gender is low stakes. They don''t know your deadname. They have no expectations. They just write down what you tell them.\n\nThis builds confidence for higher-stakes disclosures later.",
  "tipsForBeginners": [
    "Coffee shops are ideal—short interaction, they call your name out loud, you leave.",
    "Phone orders work too if face-to-face feels too intense at first.",
    "If they mishear or misspell it, correct them gently. \"Actually, it''s [name].\" This is normal.",
    "Celebrate this. You used your name in public. That''s huge."
  ]
}',
5, 'intermediate', 'weekly', false, ARRAY[]::TEXT[],
'Prescribe after user has practiced name alone.', 2),

-- SO3: Trusted Person Disclosure
('SO3', 'social', 'Tell One Trusted Person',
'Come out to one trusted person and ask them to use your name/pronouns.',
'{
  "whatToDo": "1. **Choose the person carefully:**\n   - Someone you trust to react with kindness even if they''re surprised\n   - Someone who can keep confidence if you''re not out broadly\n   - Ideally someone who isn''t your partner (partner dynamics are different)\n   - A friend, sibling, therapist, or understanding family member\n\n2. **Prepare what you want to say:**\n   Write it down if that helps. Example:\n   \n   \"I need to tell you something important. I''ve been doing a lot of self-reflection, and I''ve come to understand that I''m transgender. I''m a trans woman. My name is [name], and I''d like you to use she/her pronouns for me. This is real and important to me, and I wanted you to know.\"\n\n3. **Choose the context:**\n   - Private (not in public or with others around)\n   - When you both have time (not in passing)\n   - In person if possible (more connection than text)\n   - Have an exit strategy if you need to leave\n\n4. **Tell them.** You can read from notes if you need to.\n\n5. **Give them space to respond.** They may have questions. They may be surprised. They may be supportive immediately or need time.\n\n6. **Set expectations:**\n   - Ask them to use your name/pronouns\n   - Tell them who else knows (or doesn''t)\n   - Let them know how they can support you\n\n7. **After:** Journal about the experience. You just told someone. She exists for them now.",
  "whyItMatters": "There''s a limit to how much identity work you can do alone. At some point, she needs to exist for someone other than you. Being known—being seen—makes the identity real in a new way.\n\nEach person you tell is a ratchet. You can''t untell them. She exists in their reality now. That''s both terrifying and stabilizing.",
  "tipsForBeginners": [
    "You don''t have to tell the \"most important\" person first. Start where it''s safest.",
    "Their first reaction isn''t always their final reaction. Give time.",
    "If they mess up your name/pronouns, gently correct. They''re learning.",
    "This might be the hardest task on this list. It''s also one of the most important."
  ]
}',
60, 'advanced', 'as_needed', true, ARRAY['Script (optional)'],
'Major milestone. Only prescribe when user is ready.', 3),

-- ===========================================
-- BODY DOMAIN (B1-B3)
-- ===========================================

-- B1: Body Scan
('B1', 'body', 'Feminine Body Scan',
'Scan through your body with attention, noticing and appreciating it as hers.',
'{
  "whatToDo": "1. Lie down or sit comfortably. Close your eyes.\n\n2. Take 5 deep breaths to settle.\n\n3. Slowly scan through your body, part by part. For each area, notice:\n   - How does it feel right now? (temperature, tension, sensation)\n   - What is your relationship to this part? (acceptance, dysphoria, neutral)\n   - How might this part change? (HRT effects, weight redistribution, etc.)\n\n4. **The scan:**\n   - **Feet:** Notice the shape, the arches. Women''s feet tend to be narrower. How do yours feel?\n   - **Legs:** Feel your calves, thighs. Imagine them softer, potentially smoothed.\n   - **Hips:** Notice your hip bones. Imagine more fat depositing here over time.\n   - **Belly:** Breathe into it. Release any holding.\n   - **Chest:** Notice your chest. Imagine soft tissue growing here. What would that feel like?\n   - **Shoulders:** Feel their width. Imagine them feeling less dominant as posture shifts.\n   - **Arms:** Notice your arms, hands. Imagine them softer, perhaps with painted nails.\n   - **Neck:** Feel its length. This is her neck.\n   - **Face:** Notice your face. This is her face. It may change; it''s already hers.\n   - **Scalp:** Feel your scalp. Imagine hair growing, styling, becoming hers.\n\n5. At the end, say to yourself: \"This is my body. This is her body. It is becoming what it should be.\"\n\n6. Rest for a moment before opening your eyes.",
  "whyItMatters": "Many trans people dissociate from their bodies—it''s a survival mechanism when your body feels wrong. But transition requires RE-inhabiting your body, not leaving it.\n\nThis practice builds body awareness and begins reframing your relationship to your physical form. The body you have now IS her body—it''s just in transition. Making peace with it, even while wanting it to change, is part of the journey.",
  "tipsForBeginners": [
    "Some parts may trigger dysphoria. Don''t force positivity. Just notice.",
    "This practice can be emotional. That''s allowed.",
    "If you''re on HRT, you can adjust the visualization to match what''s actually changing.",
    "Do this practice before bed—it''s calming and embodying."
  ]
}',
15, 'beginner', 'weekly', true, ARRAY['Comfortable space to lie down'],
'Body reconnection practice. Good for evening/bedtime.', 1),

-- B2: Tucking Practice
('B2', 'body', 'Learn to Tuck Comfortably',
'Practice tucking your genitals to create a flatter, more feminine front profile.',
'{
  "whatToDo": "1. **Understand the anatomy:**\n   Tucking involves pushing the testes up into the inguinal canals (they came from there originally) and pulling the penis back between your legs. This is then held in place with tight underwear or a gaff.\n\n2. **Find the inguinal canals:**\n   - Lie on your back with knees up.\n   - Gently press on either side of your pubic area, above where your legs meet your body.\n   - You should feel a \"give\" or opening there. This is where testes can go.\n\n3. **Do a basic tuck:**\n   - Gently guide each testicle up into its canal. This shouldn''t hurt—if it does, stop.\n   - Pull the penis back between your legs, pointing toward your tailbone.\n   - Hold everything in place with your hand.\n\n4. **Secure the tuck:**\n   - Pull on tight underwear (boyshorts, compression shorts, or specially designed tucking underwear) while holding the tuck.\n   - Or use a gaff (a garment designed for this).\n   - Or use medical tape designed for skin (KT tape, Trans Tape).\n\n5. **Check your profile:**\n   Look in a mirror from the side. Is it flat? Smooth? How does it look in tight pants?\n\n6. **Wear the tuck for 1-2 hours to start.** Notice any discomfort. Adjust as needed.",
  "whyItMatters": "A visible bulge can be a major source of dysphoria, especially in tight clothing, swimwear, or when wearing dresses/skirts. Tucking creates a smooth, feminine front profile and reduces dysphoria immediately.\n\nIt also changes how you experience your body. With no bulge, your silhouette is feminine. Clothes fit differently. You move differently. Many trans women describe tucking as one of the most quickly affirming practices.",
  "tipsForBeginners": [
    "It feels weird at first. That''s normal. You get used to it.",
    "Some people can tuck all day; some need breaks. Listen to your body.",
    "Specialized tucking underwear (TomboyX, LeoLines, Origami Customs) makes this much easier.",
    "If you experience pain, you''re doing something wrong. Stop and reassess.",
    "Hygiene matters—clean underwear daily, keep the area dry."
  ]
}',
10, 'beginner', 'as_needed', true, ARRAY['Tight underwear or gaff', 'Medical tape (optional)'],
'Body modification technique. Prescribe when user is ready.', 1),

-- B3: Breast Forms
('B3', 'body', 'Wearing Breast Forms',
'Try on breast forms to see what a feminine chest looks like and feels like on you.',
'{
  "whatToDo": "1. **Choose your forms:**\n   - Silicone forms look and feel most realistic but are expensive ($50-300+).\n   - Foam or fiberfill forms are cheap ($10-30) and good for starting.\n   - Some women make DIY forms from rice in stockings or birdseed in balloons (cheap, customizable).\n\n2. **Choose a bra:**\n   - Your bra size will depend on your band measurement and form size.\n   - For beginners, a bralette or sports bra is forgiving.\n   - Mastectomy bras have pockets designed for forms.\n\n3. **Insert the forms:**\n   - Place forms in the bra cups (or pockets).\n   - Put on the bra and adjust so the forms sit where natural breasts would.\n   - They should fill the cup without bulging out the top.\n\n4. **Look at yourself:**\n   - Stand in front of a mirror. How does your silhouette change?\n   - Try on a top. How does it fit now?\n   - Notice how you feel. Euphoria? Strangeness? Recognition?\n\n5. **Move around:**\n   - Walk, sit, reach. Forms should stay in place.\n   - If they shift, adjust or try a different bra.\n\n6. **Wear them for a while:**\n   - Try wearing forms for an hour, then longer.\n   - See how it changes your posture, your movement, your sense of your body.",
  "whyItMatters": "Breast development on HRT is slow—typically 2-3+ years to reach full size, and results are genetic. Forms give you an immediate preview of what having breasts feels like. This can:\n- Reduce dysphoria\n- Help you figure out what size you want (if considering augmentation eventually)\n- Change how clothes fit\n- Give you the experience of a feminine chest silhouette\n\nMany trans women use forms even after HRT if their breast growth is small.",
  "tipsForBeginners": [
    "Start smaller than you think. B/C cups look more natural on most frames.",
    "Adhesive forms exist if you want them to stay put without a bra—but they require more care.",
    "In summer/heat, forms can be hot. Look for breathable options.",
    "You can wear forms under loose tops around others without detection—they just look like a fuller chest."
  ]
}',
15, 'beginner', 'as_needed', true, ARRAY['Breast forms', 'Appropriate bra'],
'Body modification. Prescribe when user has or wants forms.', 1);

-- Verify insertion
SELECT COUNT(*) as total_templates,
       domain,
       COUNT(*) as domain_count
FROM task_templates
GROUP BY domain
ORDER BY domain;
