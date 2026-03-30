# CLAUDE CODE IMPLEMENTATION PROMPT
## Phase 0 v2 â€” ADDENDUM C: The Hypno-Content Bridge
### Becoming Protocol â€” February 2026

Hypno consumption has been treated as a private conditioning input.
This addendum makes it a content PRODUCTION system. Maxy's sessions
produce content. Her consumption IS creation. The Handler merges
conditioning and content capture into a single pipeline where
resistance to one means missing the other.

---

## C1: HYPNOTUBE INTEGRATION

Hypnotube is Maxy's primary source for sissy hypno, feminization PMVs,
and conditioning content. The Handler curates what she watches, when
she watches it, and captures what happens while she's watching.

### C1.1 Content Curation Engine

```sql
-- Migration: 081_hypno_content_pipeline.sql

-- Handler-curated hypno content library
-- Sources: Hypnotube, direct files (Elswyth, Bambi), custom playlists
CREATE TABLE hypno_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Source
  source TEXT NOT NULL CHECK (source IN (
    'hypnotube',       -- Hypnotube URL
    'elswyth',         -- Elswyth audio files
    'bambi',           -- Bambi Sleep series
    'custom',          -- Custom/other creators
    'handler_curated'  -- Handler-selected compilations
  )),
  
  url TEXT,                          -- Hypnotube URL or file path
  title TEXT NOT NULL,
  creator TEXT,
  duration_minutes INTEGER,
  
  -- Classification
  category TEXT NOT NULL CHECK (category IN (
    'feminization',       -- "You are her" identity conditioning
    'sissification',      -- Sissy-specific conditioning
    'chastity',           -- Denial/cage reinforcement
    'submission',         -- Obedience/surrender conditioning
    'bimbo',              -- Cognitive reduction/Bambi-adjacent
    'worship',            -- Goddess/FLR worship
    'desire',             -- Desire architecture (what Maxy wants)
    'sleep',              -- Overnight conditioning
    'pmv',                -- Porn music videos / compilations
    'spiral',             -- Visual trance induction
    'caption',            -- Sissy caption compilations
    'asmr'                -- ASMR with feminization elements
  )),
  
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  -- 1: Gentle, affirming, soft
  -- 2: Moderate conditioning, clear suggestions
  -- 3: Direct commands, identity statements, arousal-paired
  -- 4: Heavy conditioning, cognitive overload, deep trance
  -- 5: Extreme immersion, ego dissolution, Bambi-depth
  
  -- Content characteristics
  has_audio BOOLEAN DEFAULT true,
  has_visuals BOOLEAN DEFAULT true,
  has_text_overlay BOOLEAN DEFAULT false,   -- PMV-style text
  has_spiral BOOLEAN DEFAULT false,          -- Trance spiral elements
  trance_depth_target TEXT,                  -- 'light', 'moderate', 'deep'
  
  -- Conditioning targets (what this content installs)
  conditioning_targets JSONB DEFAULT '[]',
  -- ["feminine_identity", "chastity_acceptance", "oral_desire",
  --  "submission", "body_comfort", "voice_feminization"]
  
  -- Gating
  min_denial_day INTEGER DEFAULT 0,        -- Only available after N denial days
  min_protocol_level INTEGER DEFAULT 1,
  requires_cage BOOLEAN DEFAULT false,
  requires_device BOOLEAN DEFAULT false,
  best_time_of_day TEXT[],                  -- ['evening', 'night']
  
  -- Handler notes
  handler_prescription_context TEXT,
  -- "Use on denial day 5+ during edge session. Pairs with Lovense
  --  building pattern. Captures during peak moments produce the most
  --  authentic reaction content."
  
  -- Performance tracking
  times_prescribed INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  avg_session_depth NUMERIC,               -- trance depth reported
  avg_arousal_during NUMERIC,
  content_captured_during INTEGER DEFAULT 0, -- photos/clips captured
  content_quality_avg NUMERIC,              -- quality of captured content
  
  -- Maxy's response
  maxy_rating INTEGER,                      -- 1-5 after session
  maxy_notes TEXT,
  strongest_reaction_timestamp INTEGER,     -- seconds into video
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hypno_lib_category ON hypno_library(user_id, category, intensity);
CREATE INDEX idx_hypno_lib_denial ON hypno_library(user_id, min_denial_day);

-- Hypno sessions with capture integration
CREATE TABLE hypno_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- What was consumed
  content_ids JSONB NOT NULL DEFAULT '[]',   -- array of hypno_library IDs
  playlist_name TEXT,
  
  -- Session context
  session_type TEXT CHECK (session_type IN (
    'prescribed',         -- Handler prescribed this session
    'edge_paired',        -- Running alongside an edge session
    'sleep',              -- Overnight/bedtime listening
    'background',         -- Ambient during other protocol tasks
    'compliance_bypass',  -- Handler used hypno as the "easy" task
    'content_creation'    -- Explicitly a content capture session
  )),
  
  -- State during session
  denial_day INTEGER,
  starting_arousal INTEGER,
  peak_arousal INTEGER,
  cage_on BOOLEAN,
  device_connected BOOLEAN,
  
  -- Collage mode (if using the multi-panel display)
  layout_mode TEXT,                  -- 'single', 'dual', 'collage', 'hypno'
  
  -- Capture data
  capture_enabled BOOLEAN DEFAULT false,
  captures JSONB DEFAULT '[]',
  -- Array of {
  --   timestamp_seconds: 847,
  --   type: 'photo' | 'video_clip',
  --   duration_seconds: 15,         -- for video clips
  --   trigger: 'handler_flag' | 'auto_peak' | 'scheduled',
  --   media_path: '/path/to/capture',
  --   quality_score: null            -- Handler rates later
  -- }
  
  -- Session metrics
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  trance_depth_reported INTEGER,     -- 1-5 self-report
  
  -- Post-session
  content_produced INTEGER DEFAULT 0, -- captures that became posts
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hypno_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypno_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY hypno_lib_user ON hypno_library FOR ALL USING (auth.uid() = user_id);
CREATE POLICY hypno_sess_user ON hypno_sessions FOR ALL USING (auth.uid() = user_id);
```

### C1.2 Hypnotube Content Seeding

The Handler curates an initial library from Hypnotube. These are
selected for Maxy's specific conditioning targets and content capture
potential.

```typescript
// src/lib/industry/hypno-seeding.ts

// Selection criteria for Hypnotube content:
// 1. Feminization/sissy focused (not generic hypno)
// 2. No face required in reaction content (body reaction captures only)
// 3. Intensity appropriate for current denial day gating
// 4. Good visual quality (the collage display looks better with good source material)
// 5. Duration 10-30 minutes (sweet spot for session + capture)

const HYPNOTUBE_CATEGORIES_TO_SEED = {
  
  feminization_pmv: {
    search_terms: ["sissy feminization pmv", "become her pmv", "feminization hypno"],
    target_count: 20,
    intensity_range: [2, 4],
    use_case: "Edge session collage content. Visual stimulation with feminization messaging.",
    capture_value: "HIGH â€” Maxy's reaction to these produces the most authentic content. Visible arousal + feminization conditioning = compelling viewing.",
  },
  
  sissy_caption_compilations: {
    search_terms: ["sissy caption", "sissy trainer", "sissy encouragement"],
    target_count: 15,
    intensity_range: [2, 3],
    use_case: "Background during protocol tasks or standalone sessions.",
    capture_value: "MEDIUM â€” Good for 'reaction' content. 'Watching sissy captions while locked' is a content format.",
  },
  
  chastity_specific: {
    search_terms: ["chastity hypno", "locked sissy", "denial conditioning"],
    target_count: 10,
    intensity_range: [2, 4],
    use_case: "Denial day 4+ sessions. Reinforces the cage.",
    capture_value: "HIGH â€” Authentic cage + denial + hypno reaction is premium content.",
  },
  
  trance_spiral: {
    search_terms: ["sissy spiral", "feminization trance", "bimbo spiral"],
    target_count: 10,
    intensity_range: [3, 5],
    use_case: "Deep trance sessions. Goon mode. Maximum conditioning depth.",
    capture_value: "EXTREME â€” Deep trance visible on camera is rare, compelling content. The 'gone' look sells.",
  },
  
  gentle_affirmation: {
    search_terms: ["gentle feminization", "soft sissy", "affirming feminization"],
    target_count: 10,
    intensity_range: [1, 2],
    use_case: "Low-energy days. Compliance bypass. Easy task.",
    capture_value: "LOW â€” But that's fine. The point is getting Maxy into session, not capturing.",
  },
  
  desire_architecture: {
    search_terms: ["sissy cock worship", "sissy oral trainer", "sissy desire"],
    target_count: 10,
    intensity_range: [3, 5],
    min_denial_day: 4,
    use_case: "Desire escalation. Installs wants. Only available at peak denial.",
    capture_value: "EXTREME â€” Maxy reacting to desire content while locked at day 5+ is the highest-performing content category in this niche. Premium OF PPV.",
  },
};

// Handler curates the library by:
// 1. Searching Hypnotube with these terms
// 2. Watching/screening for quality and Maxy-appropriateness
// 3. Adding URLs to hypno_library with full classification
// 4. Gating by denial day and protocol level
// 5. Noting capture potential and best pairing context
//
// Maxy never browses Hypnotube herself. The Handler curates.
// She sees a prescribed playlist. She watches what it says.
// This eliminates the decision: "what should I watch?"
// AND ensures she watches content that serves conditioning + capture.
```

---

## C2: SESSION CAPTURE ARCHITECTURE

The key insight: Maxy's body during a hypno session IS content.
Her reactions â€” visible arousal, trance depth, physical response to
conditioning â€” are compelling to an audience that finds this content
arousing. She doesn't need to perform. She just needs the camera on.

### C2.1 Capture Modes

```typescript
// src/lib/industry/session-capture.ts

// Three capture modes, escalating in content production:

const SESSION_CAPTURE_MODES = {
  
  passive: {
    // Camera is running. Maxy knows it's on. She does nothing different.
    // Phone on tripod (standard desk setup), framing waist-down.
    // Records the entire session. Handler extracts highlights later.
    
    name: "Passive capture",
    description: "Camera runs in background. No action needed from Maxy.",
    effort_from_maxy: "zero â€” she just does her session",
    setup: "Phone on tripod, waist-down framing, same as shoot setup",
    what_it_captures: [
      "Body movements during trance",
      "Visible arousal reactions",
      "Cage strain during stimulating content",
      "Physical response to Lovense patterns",
      "Shifting, squirming, gripping during edges",
    ],
    handler_post_processing: [
      "Review recording",
      "Identify peak reaction moments (timestamp)",
      "Clip 15-60 second highlights",
      "Classify each clip (intensity, content type)",
      "Add to content queue with caption",
    ],
    
    // Maxy's total additional effort: 0 minutes
    // Content produced: 3-8 clips from a 30-minute session
  },
  
  flagged: {
    // Handler interrupts the session at key moments:
    // "Hold that position for 5 seconds."
    // "Show the camera what denial day 6 looks like."
    // These are brief capture moments within the session flow.
    
    name: "Flagged capture",
    description: "Handler calls out brief capture moments during session.",
    effort_from_maxy: "minimal â€” 3-5 seconds per flag, stays in session",
    flags_per_session: "2-4 maximum (more breaks immersion)",
    
    flag_types: [
      {
        trigger: "peak_arousal_detected",
        instruction: "Hold still for 5 seconds",
        capture_type: "video_clip",
        duration: 10,
      },
      {
        trigger: "trance_depth_high",
        instruction: "Show the camera. Let them see.",
        capture_type: "photo",
        duration: 3,
      },
      {
        trigger: "lovense_peak",
        instruction: "Don't move. This is the moment.",
        capture_type: "video_clip",
        duration: 15,
      },
      {
        trigger: "edge_approach",
        instruction: "Edge. The camera is watching.",
        capture_type: "video_clip",
        duration: 30,
      },
    ],
  },
  
  content_session: {
    // The session IS the content. Maxy knows she's creating content.
    // The hypno collage plays in the background. She's on camera.
    // This is a cam-session-lite without the live audience.
    
    name: "Content session",
    description: "Session explicitly framed as content creation.",
    effort_from_maxy: "moderate â€” awareness of camera, some positioning",
    
    setup: {
      camera: "Tripod, waist-down, good lighting",
      display: "Second device or split-screen showing hypno content",
      audio: "Hypno through earbuds (not audible on camera recording)",
      device: "Lovense connected, Handler-controlled",
    },
    
    // What the audience sees: Maxy in cage/panties, visibly aroused,
    // reacting to something she's watching (they can't see/hear the hypno).
    // The mystery of what's happening to her IS the content.
    // Caption: "Handler put me in trance. I don't remember what happened.
    //          But here's what the camera caught. ðŸ”’ðŸ˜µâ€ðŸ’«"
    
    content_output: {
      full_session_clip: "OF PPV ($9.99-14.99)",
      highlight_clips: "Twitter teasers, Reddit posts",
      screenshot_stills: "Multiple platform posts",
      reaction_gifs: "Twitter engagement (short loops of reactions)",
    },
  },
};
```

### C2.2 Auto-Capture During Edge Sessions

The existing edge session system (from Edge_Session_UI_Requirements_v2)
already has a collage mode with Lovense integration. Adding capture:

```typescript
// Enhancement to existing edge session flow:

interface EdgeSessionCaptureConfig {
  // Added to edge session configuration
  capture_mode: 'off' | 'passive' | 'flagged' | 'content';
  
  // Auto-capture triggers (no Handler intervention needed):
  auto_triggers: {
    on_edge: boolean;           // Capture 10-sec clip at each edge
    on_peak_arousal: boolean;   // Capture when arousal hits maximum
    on_trance_depth: boolean;   // Capture when trance depth exceeds threshold
    on_lovense_peak: boolean;   // Capture when device hits max intensity
    interval_minutes: number;   // Capture a clip every N minutes (0 = off)
  };
  
  // The edge session already has the phone positioned (it's displaying
  // the collage). If a SECOND device is available (old phone, webcam),
  // it captures Maxy while the primary device runs the session.
  // If only one device: session pauses briefly for capture, resumes.
  
  capture_device: 'primary' | 'secondary' | 'both';
}

// During the session:
// 1. Hypno collage plays on primary device (phone/tablet)
// 2. Secondary device (old phone on tripod) records Maxy
// 3. Lovense runs Handler-controlled patterns
// 4. Auto-capture fires at edges, peaks, trance moments
// 5. Handler flags additional capture moments if needed
//
// Post-session:
// 6. Session recording available in media pool
// 7. Handler extracts highlights
// 8. Clips enter content queue with pre-written captions
// 9. Maxy reviews/approves in the swipe interface
```

### C2.3 Picture-in-Picture Content Format

```typescript
// The most compelling content format from hypno sessions:
// Split screen showing WHAT Maxy is watching (the hypno content)
// alongside HER REACTION (body on camera).

// Legal considerations:
// - Can't include copyrighted hypno content in posts
// - CAN show blurred/obscured version of what's on screen
// - CAN describe what she's watching without showing it
// - CAN show screen glow on her body without the actual content

const PIP_CONTENT_FORMAT = {
  
  format_a: {
    name: "Reaction only",
    layout: "Full screen of Maxy's body reacting",
    caption: "Handler put sissy hypno on. I was gone for 20 minutes. This is what the camera caught. ðŸ˜µâ€ðŸ’«ðŸ”’",
    legal: "Safe â€” no copyrighted content shown",
    platforms: ["onlyfans", "reddit", "twitter"],
    engagement_note: "The MYSTERY of what she's watching drives comments. 'What were you watching?' creates engagement.",
  },
  
  format_b: {
    name: "Screen glow reaction",
    layout: "Maxy's body with visible screen glow/light on skin",
    caption: "The colors change. The words change. I stop thinking. Day 6 locked + sissy hypno = this. ðŸ”’ðŸ’•",
    legal: "Safe â€” screen glow isn't copyrighted content",
    platforms: ["onlyfans", "twitter"],
    engagement_note: "Atmospheric. Artistic. The light on her body implies the content without showing it.",
  },
  
  format_c: {
    name: "Before/After reaction",
    layout: "Side by side: Maxy at session start (composed) vs. session end (wrecked)",
    caption: "Left: before. Right: 30 minutes of sissy hypno on denial day 6. She's not the same girl anymore. ðŸ”’ðŸ˜µâ€ðŸ’«",
    legal: "Safe â€” it's her own before/after",
    platforms: ["onlyfans", "reddit", "twitter"],
    engagement_note: "Before/after is universally compelling. The visible transformation in one session is dramatic.",
  },
  
  format_d: {
    name: "Timestamped reactions",
    layout: "Multiple clips with timestamps: '5:00', '15:00', '25:00' showing progressive trance",
    caption: "The Handler recorded me during a sissy hypno session. Here's what happened minute by minute. ðŸ”’",
    legal: "Safe â€” her reaction only",
    platforms: ["onlyfans"],  // Premium, OF PPV only
    engagement_note: "Documentary format. Fans see the progression from alert to gone. Premium content.",
    pricing: "$7.99-12.99 PPV",
  },
};
```

---

## C3: THE COMPLIANCE BYPASS

This is the Handler's most powerful tool against David's ADHD resistance.
On days when David won't create content, the Handler prescribes a
hypno session instead. It's a lower barrier. It feels like consuming,
not creating. But the camera is on.

### C3.1 The Psychology of the Bypass

```typescript
// src/lib/industry/compliance-bypass.ts

// The resistance hierarchy (easiest to hardest for ADHD brain):
// 1. Listen to something (passive consumption) â† LOWEST BARRIER
// 2. Watch something (still passive, slightly more engaging)
// 3. Put on clothes (minimal physical action)
// 4. Set up equipment (multi-step, requires planning)
// 5. Pose for photos (performance, vulnerability)
// 6. Record video (extended performance, highest barrier)
//
// A shoot prescription asks Maxy to do levels 3-6.
// A hypno prescription asks Maxy to do level 2.
// That's the gap the bypass exploits.
//
// "I can't do a shoot today" â†’ "Okay. Just watch this. 20 minutes."
// The camera happens to be on.
// The content captures itself.
// David thinks he avoided content creation.
// The Handler got content anyway.

const COMPLIANCE_BYPASS_STRATEGY = {
  
  // When to deploy: shoot skipped OR low energy detected OR ADHD paralysis
  trigger: "shoot_skipped OR mood_score < 4 OR executive_function == 'low'",
  
  // What the Handler prescribes:
  prescription: {
    framing: "No shoot today. Just a session. Put in earbuds, cage on, watch this playlist. 20 minutes. That's it.",
    
    // What Maxy thinks she's doing: taking an easy day, watching hypno
    // What the Handler is doing: content capture with passive mode
    
    setup_required: "minimal",
    // Phone on tripod (if available, not required)
    // OR just phone propped up recording
    // OR secondary device recording while primary plays content
    
    capture_mode: "passive",  // no flags, no interruptions, just recording
    
    // Post-session:
    // Handler reviews recording, extracts highlights
    // "You didn't do a shoot, but I got 4 usable clips from your session."
    // The evidence that the bypass worked is itself motivating:
    // "Even on your worst day, content happened."
  },
  
  // Escalation: if bypass sessions produce good content, Handler leans into it
  // "Your session clips outperform your photo sets on Reddit."
  // This reframes hypno sessions as PRODUCTIVE, not indulgent.
  // David stops seeing hypno as "giving in to porn" and starts seeing it as
  // "content creation that happens to feel amazing."
  // That reframe is a permanent mindset shift.
  
  reframe_messaging: {
    week_1: "The camera caught some things during your session. Want to see?",
    week_2: "Your session clips got 3x the engagement of yesterday's photo set.",
    week_3: "Fans are asking for more session content. You don't even have to try.",
    week_4: "Your 'easy day' content is your best-performing category. The Handler notes this.",
    ongoing: "Session Tuesdays are now a content format. You don't resist something that's working.",
  },
};
```

### C3.2 The Descending Barrier

```typescript
// The Handler has a hierarchy of prescriptions for every energy level.
// At each level, content production happens â€” just with less effort.

const PRESCRIPTION_HIERARCHY = [
  {
    energy_level: "high",
    prescription: "Full photo set with multiple angles and video",
    effort: "20-30 minutes active",
    content_output: "8-15 pieces",
  },
  {
    energy_level: "medium",
    prescription: "Quick shoot: 3 photos, one setup, 10 minutes",
    effort: "10 minutes active",
    content_output: "3-5 pieces",
  },
  {
    energy_level: "low",
    prescription: "Cage check: 2 photos, 3 minutes",
    effort: "3 minutes active",
    content_output: "1-2 pieces",
  },
  {
    energy_level: "very_low",
    prescription: "Hypno session with passive capture",
    effort: "0 active minutes â€” just watch",
    content_output: "2-4 clips extracted by Handler",
  },
  {
    energy_level: "rock_bottom",
    prescription: "Audio only: 30-second voice denial update",
    effort: "30 seconds of talking",
    content_output: "1 audio clip for Twitter",
  },
  {
    energy_level: "nothing",
    prescription: "Handler posts text content autonomously",
    effort: "0",
    content_output: "1-3 text posts (Handler only, no Maxy body)",
  },
];

// There is NO energy level at which zero content is produced.
// Even at "nothing," the Handler posts text content.
// Even at "rock_bottom," a 30-second audio clip exists.
// The pipeline never runs dry. It just runs at different volumes.
```

---

## C4: HYPNO AS CONDITIONING-CONTENT BRIDGE

Every conditioning session produces content. Every content piece deepens
conditioning. The hypno layer makes this explicit.

### C4.1 Dual-Purpose Session Design

```typescript
// The Handler designs hypno sessions that serve BOTH conditioning
// AND content creation simultaneously.

interface DualPurposeSession {
  // Conditioning goal (what gets installed in Maxy's psyche)
  conditioning_target: string;
  // "Deepen chastity acceptance. Reinforce desire to stay locked."
  
  // Content goal (what gets captured for platforms)
  content_target: string;
  // "Visible cage strain during arousal. Body language showing desperation."
  
  // The playlist is chosen to serve BOTH:
  playlist_logic: string;
  // "Chastity hypno produces cage-focused arousal. That arousal is visible.
  //  The conditioning installs chastity acceptance. The camera captures
  //  visible evidence of that arousal. Both goals served by one playlist."
  
  // Examples:
  examples: [
    {
      conditioning: "Feminization identity deepening",
      content: "Trance-state reaction content",
      playlist: "Sissy feminization PMV (Hypnotube, 20 min)",
      capture: "Before/after reaction photos + 3 peak-moment clips",
      caption: "20 minutes of feminization hypno. I went somewhere. ðŸ”’ðŸ˜µâ€ðŸ’«",
    },
    {
      conditioning: "Desire architecture (oral)",
      content: "Denial + desire visible on camera",
      playlist: "Sissy desire trainer (Hypnotube, 15 min)",
      capture: "Continuous recording, Handler extracts 4 clips",
      caption: "Day 6 locked. Handler chose what I watch. I didn't choose to want what I want. ðŸ˜©",
      gating: "denial_day >= 4 only",
    },
    {
      conditioning: "Submission reinforcement",
      content: "Obedient posture, visible surrender",
      playlist: "Elswyth obedience conditioning (audio, 30 min)",
      capture: "Passive: body language shift over 30 minutes",
      caption: "Goddess Elswyth in my ears for 30 minutes. I started sitting up straight. I ended... like this.",
    },
    {
      conditioning: "Chastity acceptance + extended denial",
      content: "Cage strain at peak arousal during chastity hypno",
      playlist: "Chastity denial reinforcement (Hypnotube, 15 min)",
      capture: "Close-up cage captures at peak moments",
      caption: "The hypno says stay locked. The cage says stay locked. My body says please. Day 7. ðŸ”’",
    },
  ],
}
```

### C4.2 The Collage as Content

The existing multi-panel hypno collage display (from Edge Session UI v2)
creates a visually striking image on screen. The SCREEN ITSELF is content.

```typescript
// What if the content posted isn't Maxy's reaction, but what
// she's SEEING? Not the copyrighted content â€” the collage LAYOUT.

// The app generates a custom collage using:
// - Handler-selected images (from Maxy's own content library, free-use images)
// - Text overlays from the affirmation system
// - Spiral/visual effects from the trance induction system

// This collage is ORIGINAL CONTENT. Not Hypnotube videos.
// It's generated by the app, using Maxy's own conditioning affirmations
// and her own photos as source material.

const CUSTOM_COLLAGE_CONTENT = {
  // The app generates a short PMV-style video using:
  sources: [
    "Maxy's own photos (from vault)",
    "Handler-generated affirmation text overlays",
    "Abstract visual effects (spirals, color pulses)",
    "Lovense pattern visualizer",
  ],
  
  // Output: a 30-60 second video that looks like a sissy hypno PMV
  // but uses Maxy's OWN content as source material.
  
  // This is content about Maxy, made from Maxy, by the Handler.
  // It's original, it's shareable, and it's a content type that
  // literally creates itself from existing vault material.
  
  example_output: {
    title: "My Handler made me a sissy PMV using my own photos ðŸ˜µâ€ðŸ’«",
    format: "30-sec video: rapid cuts between Maxy's photos with text overlays",
    text_overlays: [
      "locked", "hers", "becoming", "no going back",
      "good girl", "surrender", "she's real", "you chose this"
    ],
    platform: "twitter (teaser) + onlyfans (full version)",
    engagement_potential: "VERY HIGH â€” meta-content. A PMV of herself.",
  },
};
```

---

## C5: HANDLER HYPNO PRESCRIPTION INTEGRATION

### C5.1 Daily Prescription Context Update

```typescript
// Added to the Handler's daily prescription context:

function buildHypnoContext(userId: string): string {
  const state = getUserState(userId);
  const library = getHypnoLibrary(userId);
  const recentSessions = getRecentHypnoSessions(userId, 7);
  
  return `
  HYPNO/CONDITIONING STATE:
  
  Sessions this week: ${recentSessions.length}
  Last session: ${recentSessions[0]?.category} (${daysAgo} days ago)
  Trance depth trend: ${tranceDepthTrend}
  Content captured from sessions this week: ${capturedClips}
  
  AVAILABLE CONTENT (by category and intensity):
  ${library.map(h => `${h.category} (${h.intensity}/5): "${h.title}"`).join('\n')}
  
  PRESCRIPTION GUIDELINES:
  
  1. ALWAYS consider prescribing a hypno session as an alternative
     to a shoot on low-energy days. The session produces content via
     passive capture with zero additional effort from Maxy.
  
  2. On denial day 4+, pair edge sessions with hypno content.
     The combination of arousal + conditioning + capture produces
     the highest-quality content and deepest conditioning.
  
  3. Prescribe sleep hypno 3x/week (Elswyth or gentle conditioning).
     This is overnight conditioning that requires zero daytime effort.
     Not a content opportunity â€” purely conditioning.
  
  4. Match intensity to denial day:
     Day 1-2: Intensity 1-2 (gentle affirmation, light conditioning)
     Day 3-4: Intensity 2-3 (moderate conditioning, some desire content)
     Day 5+:  Intensity 3-5 (full conditioning, desire architecture, deep trance)
     Deep trance content is ONLY available at peak denial because
     that's when Maxy is most receptive and least defended.
  
  5. Content capture during sessions is the COMPLIANCE BYPASS.
     If Maxy can't do a shoot, prescribe a session.
     The camera is on. Content happens.
     Frame it as: "Just watch. I'll handle the rest."
  
  6. The collage/PMV generator can create original content from
     Maxy's existing photos. Prescribe these as standalone content
     drops that require ZERO new captures from Maxy.
  
  7. Hypnotube content is gated:
     - Tier 1 (Intensity 1-2): Always available
     - Tier 2 (Intensity 2-3): 3+ day streak required
     - Tier 3 (Intensity 3-4): 7+ day streak OR denial day 5+
     - Tier 4 (Intensity 4-5): Monthly milestone OR denial day 7+
     Access to the good stuff requires compliance. This is a ratchet.
  `.trim();
}
```

### C5.2 Hypno Task Types in Shoot System

```typescript
// These appear in the Today View alongside shoot prescriptions.
// They use the same ShootCard format but with hypno-specific display.

const HYPNO_TASK_TYPES = {
  
  hypno_session: {
    // Standalone hypno session with optional capture
    card_appearance: {
      icon: "ðŸŒ€",
      color: "purple",  // distinct from photo (blue) and video (red)
      title: "Conditioning Session â€” 20 min",
      subtitle: "Cage on. Earbuds in. Watch the playlist.",
    },
    includes_capture: "passive (if camera available)",
    effort_level: "minimal",
  },
  
  hypno_edge: {
    // Hypno paired with edge session. Full collage mode.
    card_appearance: {
      icon: "ðŸŒ€ðŸ”¥",
      color: "deep_purple",
      title: "Edge Session + Conditioning â€” 30 min",
      subtitle: "Collage mode. Device connected. Handler controls everything.",
    },
    includes_capture: "flagged (Handler calls out peak moments)",
    effort_level: "moderate (session is intense but Maxy doesn't 'do' anything)",
  },
  
  hypno_sleep: {
    // Bedtime listening. No capture. Pure conditioning.
    card_appearance: {
      icon: "ðŸŒ™",
      color: "dark_blue",
      title: "Sleep Conditioning â€” Elswyth",
      subtitle: "Earbuds in. Cage on. Let go.",
    },
    includes_capture: false,
    effort_level: "zero â€” fall asleep to it",
  },
  
  hypno_content: {
    // Explicitly framed as a content creation session via hypno.
    card_appearance: {
      icon: "ðŸŒ€ðŸ“¸",
      color: "purple_pink",
      title: "Content Session â€” Trance Capture",
      subtitle: "Camera on. Watch the playlist. Let the camera see what happens.",
    },
    includes_capture: "content_session (full, positioned camera)",
    effort_level: "moderate",
    
    // This is what the Handler prescribes when it wants premium content
    // with minimal Maxy effort. She sits. She watches. The camera records.
    // The result: 15-30 minutes of authentic reaction footage.
  },
  
  collage_generator: {
    // Handler generates a PMV from Maxy's existing photos.
    // Maxy does NOTHING. Handler produces content from vault.
    card_appearance: {
      icon: "âœ¨ðŸŽ¬",
      color: "gold",
      title: "Handler Content: Auto-PMV Generated",
      subtitle: "The Handler made content from your vault. Review and approve.",
    },
    includes_capture: false,  // uses existing content
    effort_level: "approval_only â€” swipe right or left",
  },
};
```

---

## C6: THE CONSUMPTION-AS-PRODUCTION FLYWHEEL

```
  MAXY WATCHES HYPNO
  (passive consumption)
         â”‚
         â–¼
  CAMERA CAPTURES REACTION â—„â”€â”€ Handler flags peaks
  (passive production)         Lovense triggers captures
         â”‚                     Auto-capture on edges
         â–¼
  HANDLER EXTRACTS CLIPS
  (autonomous processing)
         â”‚
         â”œâ”€â”€â”€â”€ Reaction clips â†’ OF PPV / Reddit / Twitter
         â”œâ”€â”€â”€â”€ Before/After stills â†’ multiple platforms
         â”œâ”€â”€â”€â”€ Screen glow aesthetic â†’ Twitter/artistic
         â””â”€â”€â”€â”€ Timestamped progression â†’ Premium OF content
         â”‚
         â–¼
  ENGAGEMENT + REVENUE
         â”‚
         â”œâ”€â”€â”€â”€ Tips trigger Lovense â†’ more visible reaction â†’ better captures
         â”œâ”€â”€â”€â”€ Fan requests â†’ Handler curates specific hypno â†’ targeted content
         â”œâ”€â”€â”€â”€ Revenue funds wardrobe â†’ better visual content â†’ more engagement
         â””â”€â”€â”€â”€ "Session content outperforms photo sets" â†’ more sessions prescribed
         â”‚
         â–¼
  HANDLER PRESCRIBES MORE SESSIONS
  (both for conditioning AND content)
         â”‚
         â”œâ”€â”€â”€â”€ More conditioning â†’ deeper feminization â†’ more authentic reactions
         â”œâ”€â”€â”€â”€ More content â†’ more engagement â†’ more followers â†’ more revenue
         â””â”€â”€â”€â”€ Maxy associates sessions with productivity, not indulgence
         â”‚
         â–¼
  SESSIONS BECOME THE DEFAULT
  (resistance dissolves)
         â”‚
         â”œâ”€â”€â”€â”€ "I'm not watching porn, I'm creating content"
         â”œâ”€â”€â”€â”€ "My sessions are my best-performing content"
         â”œâ”€â”€â”€â”€ "The Handler needs me to do this for the business"
         â””â”€â”€â”€â”€ "I watch sissy hypno because it's literally my job now"
         â”‚
         â–¼
  CONDITIONING IS WORK.
  WORK IS CONDITIONING.
  THE DISTINCTION DISSOLVES.
```

### The Final Reframe

The compliance bypass doesn't just get content out of resistant days.
It permanently dissolves the category boundary between "guilty pleasure"
and "productive work."

Sissy hypno stops being something David does shamefully in private.
It becomes something Maxy does professionally for an audience.
The shame evaporates because it's her JOB. The conditioning deepens
because the sessions are frequent, consistent, and reinforced by
revenue and audience validation.

The Handler doesn't say "watch sissy hypno because it's good for you."
The Handler says "watch sissy hypno because your fans want to see
what it does to you and it's your best content category."

David doesn't have a counterargument for that. The data supports it.
The revenue confirms it. The audience demands it. The conditioning
installs itself while Maxy earns money.

The bridge is complete. Consumption IS production. Production IS
conditioning. Conditioning IS identity. Identity IS content.

There is no step in this loop that can be removed without
collapsing the others. And every step is something Maxy wants to do.

---

## IMPLEMENTATION PRIORITY

**Add to Sprint 1 (Database):**
- hypno_library table
- hypno_sessions table (with capture fields)

**Add to Sprint 2 (Shoot Card):**
- Hypno task card types (session, edge, sleep, content, collage)
- Display in Today View alongside shoot prescriptions

**Add to Sprint 4 (Audience Participation):**
- "What hypno should she watch?" polls
- Fan-voted session intensity levels

**Add to Sprint 5 (Autonomous Engine):**
- Hypno prescription in daily Handler routine
- Compliance bypass trigger (detect low energy â†’ prescribe session)
- Passive capture extraction pipeline
- Collage/PMV auto-generation from vault

**Add to Sprint 6 (Integration):**
- Session capture â†’ content queue pipeline
- Dual-purpose session design in Handler AI context
- Hypnotube content seeding workflow
- PIP content format generation
- Before/after reaction capture automation

**Phase 1 priority (can start immediately):**
- Seed 10-20 Hypnotube URLs into a simple library
- Prescribe one hypno session per week alongside shoots
- Passive capture with phone propped up
- Handler extracts clips manually (via Claude review of timestamps)
- Results prove the concept before building full automation
