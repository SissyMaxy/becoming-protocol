-- New Domains & Tasks Migration
-- Adds columns: level, steps, trigger_condition, time_window, requires_privacy,
-- resource_url, consequence_if_declined, pivot_if_unable
-- Adds 5 new domains: exercise, scent, identity (exists), nutrition, wigs
-- Inserts ~40 new tasks across all five domains

-- ============================================
-- ADD MISSING COLUMNS TO task_bank
-- ============================================

ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS steps TEXT;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS trigger_condition TEXT;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS time_window TEXT DEFAULT 'any';
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS requires_privacy BOOLEAN DEFAULT FALSE;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS resource_url TEXT;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS consequence_if_declined TEXT;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS pivot_if_unable TEXT;

-- Index on new columns used for filtering
CREATE INDEX IF NOT EXISTS idx_task_bank_level ON task_bank(level);
CREATE INDEX IF NOT EXISTS idx_task_bank_time_window ON task_bank(time_window);
CREATE INDEX IF NOT EXISTS idx_task_bank_requires_privacy ON task_bank(requires_privacy);

-- ============================================
-- EXERCISE TASKS (15 tasks)
-- ============================================

INSERT INTO task_bank (category, domain, level, intensity, instruction, steps, subtext, completion_type, duration_minutes, target_count, points, affirmation, is_core, trigger_condition, time_window, requires_privacy) VALUES

('practice','exercise',1,1,'Glute activation — wake up your butt','Lie on your back, knees bent, feet flat|Squeeze your glutes AS HARD AS YOU CAN for 5 seconds|Release completely|Do 10 squeezes|Most people can''t feel their glutes activate — they''re asleep from sitting all day|If you feel it in your lower back: push through HEELS harder|If you feel it in your quads: scoot feet further from butt|When you feel a deep burn in your actual butt cheeks: THAT''S IT','Before you can build it, you have to wake it up.','count',NULL,10,15,'She found her glutes. They''re awake now.',true,NULL,'morning',false),

('practice','exercise',1,1,'Glute bridge — the foundation','Lie on back, feet flat, hip-width apart|Drive heels into floor, lift hips|SQUEEZE glutes hard at top — hold 2 seconds|Lower slowly — don''t just drop|20 reps, 3 sets|Rest 30 seconds between sets|If lower back hurts: you''re arching too much. Tuck pelvis slightly|This is the foundation exercise. Master this before anything else','60 bridges. 60 reps building her shape.','count',NULL,60,20,'60 bridges done. Her body is being built, rep by rep.',true,NULL,'any',false),

('practice','exercise',1,1,'Clamshells — build the hip shelf','Lie on side, knees bent 90 degrees, feet together|Open top knee toward ceiling — keep feet touching|Don''t roll hips backward|Pause at top, lower slowly|20 each side, 3 sets|This targets the gluteus medius — the muscle on the SIDE of the hip|This is the muscle that creates the hip shelf','The side of the hip. The shelf. The curve.','count',NULL,120,20,'120 clamshells. The hip shelf is being constructed.',false,NULL,'any',false),

('practice','exercise',1,2,'Fire hydrants — outer hip sculptor','All fours, hands under shoulders, knees under hips|Lift one knee out to the side, keeping it bent 90 degrees|Lift to hip height — no higher|Pause 1 second, lower slowly|15 each side, 3 sets|Keep core tight','Building the curve from every angle.','count',NULL,90,15,'90 fire hydrants. Her hips are being sculpted.',false,NULL,'any',false),

('practice','exercise',1,1,'Stomach vacuum — the natural corset','Stand with hands on hips|Exhale ALL air from lungs — completely empty|Without breathing in: pull belly button toward spine as hard as possible|HOLD for 10-15 seconds (work up to 30-60)|Release, breathe normally, rest 30 seconds|5 holds total|This trains the transverse abdominis — pulls waist IN|Do this EVERY morning. 3 minutes','The deep muscle that pulls the waist in.','duration',3,NULL,15,'Her waist is tightening from the inside.',true,NULL,'morning',false),

('practice','exercise',1,1,'Minimum viable workout — just 10 bridges','Lie on your back. Knees bent. Feet flat|Do 10 glute bridges. Squeeze at the top|That''s it. That''s the whole workout|If you want to do more: do more. If not: 10 was enough|The streak is alive','Bad days don''t break streaks.','count',NULL,10,10,'She showed up. The streak lives.',true,NULL,'any',false),

('practice','exercise',2,2,'Hip thrusts — the queen of glute exercises','Upper back against couch edge, feet flat on floor|Drive through heels, thrust hips toward ceiling|SQUEEZE glutes at top for 2-3 seconds|Lower until butt nearly touches floor|20 reps, 3 sets|This single exercise builds more glute than everything else combined','The single most effective exercise for building her butt.','count',NULL,60,25,'60 hip thrusts. She''s building the ass she wants.',true,NULL,'any',false),

('practice','exercise',2,2,'Sumo squats — inner thighs and glutes','Feet wider than shoulder-width, toes pointed out 30-45 degrees|Lower by pushing hips back, bending knees|Keep chest up, back straight|Thighs parallel to floor|Push through heels|15 reps, 3 sets|Wide stance shifts work from quads to glutes','Wide stance. Feminine development pattern.','count',NULL,45,25,'45 sumo squats. Building curves, not bulk.',false,NULL,'any',false),

('practice','exercise',2,3,'Curtsy lunges — the hip shelf builder','Stand feet hip-width apart|Step right foot BEHIND and to the LEFT — crossing behind like a curtsy|Lower into lunge, back knee toward floor|Push through front heel to stand|12 each side, 3 sets','The curtsy. Building the shelf that standard lunges miss.','count',NULL,72,30,'72 curtsy lunges. She curtsied her way to better hips.',false,NULL,'any',false),

('practice','exercise',3,3,'Full glute session — 25 minutes of building','5 min warmup: 2x15 bridges + 1x15 clamshells each side|Hip thrusts: 3x20|Sumo squats: 3x15|Curtsy lunges: 3x12 each side|Banded lateral walks: 3x10 each direction|5 min cooldown: hip flexor stretch + pigeon pose|25 minutes, ~200 reps total','25 minutes. 200 reps. Building her body.','duration',25,NULL,40,'Full session done. Consistency wins.',true,NULL,'any',false),

('condition','exercise',3,3,'Arousal-paired glute session','Device at level 1-2 during warmup bridges|Main work: device PULSES at top of each hip thrust|Feel both: the glute burn AND the device|Peak set: device at level 3-4 during last set|Cooldown stretches with device at gentle steady|After weeks: squeezing glutes WITHOUT device produces micro-pleasure','Her body = pleasure. Every rep pairs the two.','duration',25,NULL,45,'Arousal-paired session complete.',false,NULL,'any',true),

('condition','exercise',3,4,'Denial day 5+ power session','Testosterone spikes around day 7 — max muscle building|Device running throughout at building intensity|Heavy resistance on all exercises|Push to muscular burn on every set','Peak denial. Peak building.','duration',30,NULL,50,'Power session on denial peak.',false,'denial_day_5_plus','any',true),

('measure','exercise',2,1,'Monthly body measurements','Soft measuring tape|HIPS: widest point of glutes|WAIST: narrowest point of torso|CALCULATE: hips / waist = hip-to-waist ratio|THIGHS: widest point each thigh|SHOULDERS: widest point of deltoids|Compare to last month|Take 3 progress photos: front, side, back','Numbers don''t lie.','binary',NULL,NULL,25,'Measurements taken. Transformation documented.',true,NULL,'any',false),

('milestone','exercise',2,2,'Gym gate evaluation','6-week home consistency check|18+ sessions in 6 weeks?|Full Tier 2 with correct form?|Feels exercises in glutes not quads/back?|2+ measurement sessions?|Used resistance bands and weights?|If ALL yes: gym gate is open','Gym doesn''t unlock until home is mastered.','binary',NULL,NULL,20,'Gate evaluation complete.',false,NULL,'any',false),

('milestone','exercise',3,3,'First gym visit — reconnaissance only','Drive to the WAC. Park. Walk in|Tour facility. Sign up|Note: free weights, cable machines, locker room, exits|Do NOT work out today. Just join and leave|Post-visit: How did it feel? Where is the sauna?','First visit is joining. First workout is next time.','binary',NULL,NULL,30,'She walked into the gym.',false,NULL,'any',false)

ON CONFLICT DO NOTHING;

-- ============================================
-- NUTRITION TASKS (3 tasks)
-- ============================================

INSERT INTO task_bank (category, domain, level, intensity, instruction, steps, subtext, completion_type, duration_minutes, target_count, points, affirmation, is_core, trigger_condition, time_window, requires_privacy) VALUES

('care','nutrition',1,1,'Post-workout protein shake','Workout done. Walk to kitchen|1 scoop protein powder + milk or water|Shake 10 seconds. Drink|30g of protein to muscles you just worked|This is the reward — chocolate shake after a hard session','30g protein. 60 seconds.','binary',NULL,NULL,15,'Shake done. 30g fueling her glutes.',true,NULL,'any',false),

('care','nutrition',1,1,'Stock the protein pantry','Check kitchen for: protein powder, eggs, Greek yogurt|Chicken or beef, cheese, milk|Peanut butter, deli meat|Missing items on grocery list','If pantry is stocked, protein takes care of itself.','binary',NULL,NULL,10,'Pantry stocked.',false,NULL,'any',false),

('care','nutrition',2,1,'Evening protein check','Quick check — no counting, just boxes|Post-workout shake (~30g)|Breakfast protein (~20g)|Lunch protein (~30g)|Dinner protein (~30g)|Protein snack (~15g)|4 out of 5 = she''s building','Did she feed the body she''s building?','binary',NULL,NULL,10,'Protein check done.',false,NULL,'any',false)

ON CONFLICT DO NOTHING;

-- ============================================
-- SCENT TASKS (4 tasks)
-- ============================================

INSERT INTO task_bank (category, domain, level, intensity, instruction, steps, subtext, completion_type, duration_minutes, target_count, points, affirmation, is_core, trigger_condition, time_window, requires_privacy) VALUES

('acquire','scent',1,1,'Switch to feminine body wash','Next time you buy body wash: women''s section|Pick something that smells good — floral, vanilla, coconut|Use starting tomorrow|Baseline body scent is feminine now','Feminine body wash. Most invisible first step.','binary',NULL,NULL,10,'She smells like her now.',true,NULL,'any',false),

('acquire','scent',1,1,'Buy feminine hand cream','Small tube of women''s hand cream at desk|Apply after washing hands, before calls, during breaks|3-5 times a day|Each application refreshes feminine scent','Hand cream. 10 seconds. All day.','binary',NULL,NULL,10,'Hand cream acquired.',true,NULL,'any',false),

('explore','scent',2,2,'Fragrance shopping — find HER scent','Go to fragrance counter or Sephora|Sample 5-7 women''s fragrances|Narrow to 2-3 favorites|Wear each for a day|The one that makes you feel most like HER is the one','Finding her signature scent.','binary',NULL,NULL,20,'She found candidates for her scent.',false,NULL,'any',false),

('condition','scent',2,3,'Scent anchoring — pair fragrance with arousal','Apply signature fragrance before arousal session|Edge session, conditioning — wear the fragrance|Limbic system learning: this scent = this state|After 10-15 pairings: fragrance triggers micro-arousal','Pairing her scent with her state.','duration',NULL,NULL,25,'Scent paired with arousal.',false,NULL,'any',true)

ON CONFLICT DO NOTHING;

-- ============================================
-- IDENTITY / ANCHOR TASKS (7 tasks)
-- ============================================

INSERT INTO task_bank (category, domain, level, intensity, instruction, steps, subtext, completion_type, duration_minutes, target_count, points, affirmation, is_core, trigger_condition, time_window, requires_privacy) VALUES

('acquire','identity',1,1,'Buy Maxy''s lip balm','Women''s lip balm. Subtly scented|Put in pocket right now|Apply 5-10 times today|Each application is a 5-second feminine ritual','Her lip balm. In her pocket.','binary',NULL,NULL,10,'Lip balm acquired.',true,NULL,'any',false),

('acquire','identity',2,1,'Choose Maxy''s ring','Simple ring. Thin band. Not ring finger|Wear from today forward. Every day|Feel it every time you type, gesture','Her ring. Every keystroke.','binary',NULL,NULL,15,'Her ring is on.',false,NULL,'any',false),

('practice','identity',1,1,'Maxy''s phone — make it hers','Change wallpaper to something SHE chose|Change protocol app notification sound|Organize home screen her way|150 touches a day — every one hers','150 touches a day. Every one hers.','binary',NULL,NULL,10,'Her phone now.',false,NULL,'any',false),

('ritual','identity',1,1,'Morning micro-ritual','Before getting out of bed. 2 minutes|Read Handler morning notification|One deep breath|Internal: Good morning, Maxy|Feel the sheets. Be in body 5 seconds|Get up. Day is hers','2 minutes. Before coffee. She exists first.','binary',NULL,NULL,10,'She woke up first today.',true,NULL,'morning',false),

('acquire','identity',1,1,'Sleep earbuds — own the hypnagogic window','Buy sleep earbuds. Low profile, comfortable|Fall asleep to Handler-selected content|Tell Gina: sleep meditation|Actually: feminization affirmations or soft hypno|5-10 min before sleep = most suggestible state','Hypnagogic window. Claimed.','binary',NULL,NULL,15,'Sleep earbuds acquired.',true,NULL,'any',false),

('practice','identity',2,1,'Bridge clothing for work','Work in leggings instead of jeans|Or women''s joggers, women''s oversized sweater|Bridge pieces — gender-ambiguous, comfortable|8 hours of feminine fabric','8 hours feminine fabric at work.','binary',NULL,NULL,15,'Women''s clothing to work all day.',false,NULL,'any',false),

('practice','identity',1,1,'Maxy''s desk — make workspace hers','Add one of her objects to desk|Her hand cream, lip balm, candle, mug|Within a week: 3+ objects chosen by Maxy','Her desk. He just works at it.','binary',NULL,NULL,10,'Her territory expanding.',false,NULL,'any',false)

ON CONFLICT DO NOTHING;

-- ============================================
-- WIG TASKS (4 tasks)
-- ============================================

INSERT INTO task_bank (category, domain, level, intensity, instruction, steps, subtext, completion_type, duration_minutes, target_count, points, affirmation, is_core, trigger_condition, time_window, requires_privacy) VALUES

('acquire','wigs',2,2,'First wig — she has hair now','Lace front synthetic. Natural or chosen color|$30-60 from protocol revenue|Wig cap on. Wig placed. Adjusted in mirror|Look up. There she is|Capture: photo, video if ready','First wig. There she is.','binary',NULL,NULL,30,'She has hair now.',true,NULL,'any',true),

('practice','wigs',2,2,'Wig application practice','Wig cap smooth, no wrinkles|Place wig, align with hairline|Adjust lace front|Grip band or tape|Baby hairs forward with edge brush|Goal: under 5 minutes, natural at arm''s length','Making it look real.','duration',15,NULL,20,'Getting faster. More natural.',false,NULL,'any',true),

('explore','wigs',3,2,'Choose second wig — she gets OPTIONS','Different length, color, vibe from first|If first practical: second expressive|$40-80 from protocol revenue','Options. Choice. Feminine.','binary',NULL,NULL,20,'Second wig. She has OPTIONS.',false,NULL,'any',false),

('milestone','wigs',4,3,'Human hair wig — the upgrade','$100-250 from protocol revenue|Moves naturally. Heat styleable. Lasts years|This is the wig for public, gym, missions','Human hair. She looks real.','binary',NULL,NULL,40,'Human hair wig acquired.',false,NULL,'any',true)

ON CONFLICT DO NOTHING;
