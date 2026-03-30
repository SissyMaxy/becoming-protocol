# CLAUDE CODE IMPLEMENTATION PROMPT
## Cam Session System â€” The Revenue Engine
### Becoming Protocol â€” February 2026

---

## THE CORE CONCEPT

A cam session is an edge session that's broadcast. David shows up, goes live,
is present on camera. The Handler runs everything else: device control, tip
response, session pacing, edge prevention, go-live announcements, post-session
highlight extraction, and revenue logging.

David's cam session experience:
1. Handler notification: "Cam tonight at 7pm. Denial day 6. Wear the black set."
2. David preps per instructions. One tap: "Ready."
3. Handler posts go-live announcements across platforms.
4. David goes live. Is present. Reacts authentically.
5. Handler controls device (independent of AND responsive to fan tips).
6. Handler sends on-screen prompts David can see but viewers can't.
7. Handler signals when to end.
8. Post-session: Handler extracts highlights, logs revenue, schedules clips.
   David's involvement: zero.

The cam system builds on the existing edge session infrastructure. Edge sessions
already have: phases, edge tracking, device control, commitment extraction,
content display, timer, and session logging. Cam sessions ADD: tip-to-device
mapping, viewer-facing tip menu, Handler on-screen prompts, recording with
highlight markers, go-live/end-stream controls, and post-session content pipeline
integration.

---

## Context: What Already Exists

From the Edge2 Hardware Integration spec (already in DB):
- 7 cam tip patterns seeded in lovense_patterns table:
  cam_tip_tickle (1-9 tokens), cam_tip_buzz (10-24), cam_tip_wave (25-49),
  cam_tip_surge (50-99), cam_tip_overload (100-199), cam_tip_edge_denial (200+)
- Handler control patterns: handler_reward_cam, handler_punish_voice_drop,
  handler_edge_prevent, handler_edge_rebuild
- EDGE2_TIP_LEVELS array with token ranges, channel configs, display labels

From the edge session UI:
- Session phases (prep, active, recovery, completion)
- Edge tracking (counter, timestamps, intensity logging)
- Commitment extraction at arousal peaks
- Lovense device control via WebSocket
- Content display (affirmations, hypno collage)
- Session timer and logging

From the content pipeline (just built):
- content_vault table for captures
- content_distribution for scheduling posts
- narrative_arcs for story planning
- revenue_log for income tracking
- Platform posting stubs

---

## PART 1: Database Schema

```sql
-- Migration: 069_cam_sessions.sql

-- Cam session tracking (extends arousal_sessions)
CREATE TABLE cam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Links to edge session
  edge_session_id UUID, -- references arousal_sessions if applicable
  
  -- Session config (Handler prescribes all of this)
  prescribed_outfit TEXT,
  prescribed_makeup TEXT,
  prescribed_setup TEXT, -- "Ring light position 2, phone on tripod"
  denial_day INTEGER,
  
  -- Timing
  scheduled_at TIMESTAMPTZ,
  prep_started_at TIMESTAMPTZ,
  live_started_at TIMESTAMPTZ,
  live_ended_at TIMESTAMPTZ,
  
  -- Platform
  platform TEXT DEFAULT 'self_hosted' CHECK (platform IN (
    'self_hosted',    -- just recording locally (no stream platform yet)
    'chaturbate',     -- future: Chaturbate integration
    'fansly_live',    -- future: Fansly live
    'other'
  )),
  stream_url TEXT,
  
  -- Recording
  is_recording BOOLEAN DEFAULT true,
  recording_url TEXT,         -- Supabase storage
  recording_duration_seconds INTEGER,
  
  -- Session metrics
  peak_viewer_count INTEGER DEFAULT 0,
  total_tips_tokens INTEGER DEFAULT 0,
  total_tips_amount NUMERIC DEFAULT 0,
  tip_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  
  -- Handler control log (what the Handler did during session)
  handler_actions JSONB DEFAULT '[]',
  -- Array of { timestamp, action, details }
  -- e.g. { t: "7:14pm", action: "device_override", details: "edge_prevention" }
  -- e.g. { t: "7:22pm", action: "prompt_sent", details: "Voice check" }
  
  -- Highlight markers (Handler flags moments for clip extraction)
  highlights JSONB DEFAULT '[]',
  -- Array of { timestamp_seconds, duration_seconds, type, description }
  -- e.g. { ts: 840, dur: 30, type: "tip_reaction", desc: "100-token overload reaction" }
  -- e.g. { ts: 1200, dur: 15, type: "edge_denial", desc: "Edge & deny moment" }
  
  -- Revenue
  revenue_logged BOOLEAN DEFAULT false,
  revenue_amount NUMERIC,
  
  -- Session status
  session_status TEXT DEFAULT 'scheduled' CHECK (session_status IN (
    'scheduled', 'prepping', 'live', 'ended', 'cancelled'
  )),
  
  -- Content pipeline integration
  vault_items_created INTEGER DEFAULT 0, -- how many clips extracted to vault
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tip log (every tip during cam)
CREATE TABLE cam_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,
  
  tipper_username TEXT,
  tipper_platform TEXT,
  token_amount INTEGER NOT NULL,
  tip_amount_usd NUMERIC, -- converted amount
  
  -- Device response
  pattern_triggered TEXT, -- which lovense pattern fired
  device_response_sent BOOLEAN DEFAULT true,
  
  -- Timing
  session_timestamp_seconds INTEGER, -- seconds into session
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Handler prompts sent during cam (invisible to viewers)
CREATE TABLE cam_handler_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,
  
  prompt_type TEXT CHECK (prompt_type IN (
    'voice_check',      -- "Voice check â€” drop your pitch"
    'engagement',       -- "Read the top comment"
    'pacing',           -- "Slow down. Build the tension."
    'tip_goal',         -- "Tip goal approaching â€” lean into teasing"
    'edge_warning',     -- "Getting close. Handler taking control."
    'outfit_adjust',    -- "Adjust the strap on your left shoulder"
    'position_change',  -- "Turn to show your profile"
    'affirmation',      -- "You're doing beautifully"
    'wind_down',        -- "5 more minutes. Start wrapping up."
    'custom'
  )),
  prompt_text TEXT NOT NULL,
  
  -- Response tracking
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  
  session_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE cam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_handler_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cam_sessions_user ON cam_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cam_tips_user ON cam_tips FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cam_prompts_user ON cam_handler_prompts FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_cam_sessions_user ON cam_sessions(user_id, session_status, scheduled_at DESC);
CREATE INDEX idx_cam_tips_session ON cam_tips(cam_session_id, created_at);
CREATE INDEX idx_cam_prompts_session ON cam_handler_prompts(cam_session_id, created_at);
```

---

## PART 2: TypeScript Types

```typescript
// src/types/cam-session.ts

export type CamSessionStatus = 'scheduled' | 'prepping' | 'live' | 'ended' | 'cancelled';
export type CamPlatform = 'self_hosted' | 'chaturbate' | 'fansly_live' | 'other';

export type PromptType =
  | 'voice_check' | 'engagement' | 'pacing' | 'tip_goal'
  | 'edge_warning' | 'outfit_adjust' | 'position_change'
  | 'affirmation' | 'wind_down' | 'custom';

export interface CamSession {
  id: string;
  edge_session_id?: string;
  prescribed_outfit?: string;
  prescribed_makeup?: string;
  prescribed_setup?: string;
  denial_day?: number;
  scheduled_at?: string;
  prep_started_at?: string;
  live_started_at?: string;
  live_ended_at?: string;
  platform: CamPlatform;
  is_recording: boolean;
  recording_url?: string;
  recording_duration_seconds?: number;
  peak_viewer_count: number;
  total_tips_tokens: number;
  total_tips_amount: number;
  tip_count: number;
  edge_count: number;
  handler_actions: HandlerAction[];
  highlights: SessionHighlight[];
  session_status: CamSessionStatus;
  vault_items_created: number;
}

export interface HandlerAction {
  timestamp: string;
  action: string;
  details: string;
}

export interface SessionHighlight {
  timestamp_seconds: number;
  duration_seconds: number;
  type: 'tip_reaction' | 'edge_denial' | 'voice_moment' | 'viewer_peak' |
        'desperation' | 'vulnerability' | 'funny' | 'milestone';
  description: string;
  extracted_to_vault?: boolean;
}

export interface CamTip {
  id: string;
  tipper_username?: string;
  token_amount: number;
  tip_amount_usd?: number;
  pattern_triggered?: string;
  session_timestamp_seconds: number;
  created_at: string;
}

export interface HandlerPrompt {
  id: string;
  prompt_type: PromptType;
  prompt_text: string;
  acknowledged: boolean;
  session_timestamp_seconds: number;
}

// Tip-to-device mapping (from Edge2 spec)
export interface TipLevel {
  min_tokens: number;
  max_tokens: number | null;
  pattern_name: string;
  duration_seconds: number;
  display_label: string;
  fan_description: string;
  channels: {
    internal: number;
    external: number;
    rotation: number;
  };
}

// What the Handler prescribes for tonight's cam
export interface CamPrescription {
  scheduled_time: string;
  outfit: string;
  makeup: string;
  setup: string;
  session_type: 'standard' | 'denial' | 'voice_practice' | 'milestone';
  estimated_duration_minutes: number;
  tip_goals: TipGoal[];
  handler_strategy: string; // "Build slow, edge at 20min, denial moment at 35min"
}

export interface TipGoal {
  target_tokens: number;
  description: string; // what fans see: "Unlock level 2 intensity"
  reward_description: string; // what actually happens
  is_real: boolean; // Handler decides. Often: the "unlock orgasm" goal is fake.
}

// Post-session summary for Handler and content pipeline
export interface CamSessionSummary {
  duration_minutes: number;
  edge_count: number;
  total_tips: number;
  tip_count: number;
  peak_viewers: number;
  highlights_count: number;
  top_tipper?: string;
  revenue_usd: number;
  vault_items_created: number;
  handler_note: string;
}
```

---

## PART 3: Core Libraries

### 3.1 Cam Session Management

```typescript
// src/lib/cam/session.ts

// Handler schedules a cam session
export async function scheduleCamSession(
  userId: string,
  prescription: CamPrescription
): Promise<string>; // returns session ID
// Creates cam_sessions row with status='scheduled'
// Queues go-live announcement distribution for 2hr + 30min before

// David starts prepping
export async function startPrep(sessionId: string): Promise<void>;
// Sets status='prepping', prep_started_at=now
// Handler can send prep checklist prompts

// David confirms ready, goes live
export async function goLive(sessionId: string): Promise<void>;
// Sets status='live', live_started_at=now
// Starts recording (MediaRecorder API)
// Posts go-live announcements across configured platforms
// Initializes tip listener
// Handler takes device control

// End session
export async function endSession(sessionId: string): Promise<CamSessionSummary>;
// Sets status='ended', live_ended_at=now
// Stops recording, saves to Supabase storage
// Calculates session summary
// Triggers post-session pipeline (highlight extraction, vault creation, revenue log)
// Posts session summary to platforms

// Cancel scheduled session
export async function cancelSession(sessionId: string): Promise<void>;

// Get upcoming scheduled sessions
export async function getUpcomingSessions(userId: string): Promise<CamSession[]>;

// Get session history
export async function getSessionHistory(
  userId: string,
  limit?: number
): Promise<CamSession[]>;
```

### 3.2 Tip Processing

```typescript
// src/lib/cam/tips.ts

// Tip level definitions (from Edge2 spec)
export const TIP_LEVELS: TipLevel[] = [
  {
    min_tokens: 1, max_tokens: 9,
    pattern_name: 'cam_tip_tickle',
    duration_seconds: 5,
    display_label: 'âœ¨ Tickle (1+)',
    fan_description: "She feels it. You might not see it.",
    channels: { internal: 5, external: 0, rotation: 0 },
  },
  {
    min_tokens: 10, max_tokens: 24,
    pattern_name: 'cam_tip_buzz',
    duration_seconds: 10,
    display_label: 'ðŸ’– Buzz (10+)',
    fan_description: "External pulse. Watch for the reaction.",
    channels: { internal: 0, external: 10, rotation: 0 },
  },
  {
    min_tokens: 25, max_tokens: 49,
    pattern_name: 'cam_tip_wave',
    duration_seconds: 15,
    display_label: 'ðŸ”¥ Wave (25+)',
    fan_description: "Rotation activated. Different kind of stimulation.",
    channels: { internal: 8, external: 0, rotation: 10 },
  },
  {
    min_tokens: 50, max_tokens: 99,
    pattern_name: 'cam_tip_surge',
    duration_seconds: 15,
    display_label: 'âš¡ Surge (50+)',
    fan_description: "All three motors building. Edge territory.",
    channels: { internal: 14, external: 12, rotation: 12 },
  },
  {
    min_tokens: 100, max_tokens: 199,
    pattern_name: 'cam_tip_overload',
    duration_seconds: 60,
    display_label: 'ðŸŒŠ Overload (100+)',
    fan_description: "Full power. 60 seconds. She can't hide this one.",
    channels: { internal: 18, external: 16, rotation: 16 },
  },
  {
    min_tokens: 200, max_tokens: null,
    pattern_name: 'cam_tip_edge_denial',
    duration_seconds: 45,
    display_label: 'ðŸ’€ Edge & Deny (200+)',
    fan_description: "Max everything for 45 seconds. Then sudden stop. Cruel.",
    channels: { internal: 20, external: 20, rotation: 20 },
  },
];

// Process incoming tip
export async function processTip(
  sessionId: string,
  tip: { username?: string; tokens: number; platform?: string }
): Promise<{ pattern_triggered: string; level: TipLevel }>;
// 1. Find matching tip level
// 2. Log to cam_tips
// 3. Fire Lovense pattern via device control
// 4. Update cam_sessions totals (tip_count, total_tips_tokens)
// 5. Check tip goals â€” if goal reached, trigger goal response
// 6. If Handler has edge prevention active, cap tip intensity
// 7. Mark highlight if tip >= 100 tokens (significant reaction moment)

// Get tip level for token amount
export function getTipLevel(tokens: number): TipLevel;

// Get session tip summary
export async function getTipSummary(sessionId: string): Promise<{
  total_tokens: number;
  total_usd: number;
  tip_count: number;
  top_tipper: string | null;
  by_level: Record<string, number>; // count per tip level
}>;
```

### 3.3 Handler Session Control

```typescript
// src/lib/cam/handler-control.ts

// Handler's autonomous control during live session.
// This is the Handler's real-time brain during cam.

// Send a prompt to David's screen (viewers can't see)
export async function sendPrompt(
  sessionId: string,
  prompt: { type: PromptType; text: string; timestamp_seconds: number }
): Promise<void>;
// Inserts into cam_handler_prompts
// UI renders it as a subtle overlay David sees

// Mark prompt as acknowledged (David taps to dismiss)
export async function acknowledgePrompt(promptId: string): Promise<void>;

// Get active (unacknowledged) prompts for session
export async function getActivePrompts(sessionId: string): Promise<HandlerPrompt[]>;

// Handler device override (independent of tips)
export async function handlerDeviceOverride(
  sessionId: string,
  action: 'edge_prevention' | 'reward' | 'voice_correction' | 'edge_rebuild' |
          'baseline_set' | 'all_stop' | 'custom',
  details?: { pattern?: string; duration?: number; intensity?: Record<string, number> }
): Promise<void>;
// Logs to cam_sessions.handler_actions
// Sends device command via Lovense

// Mark a highlight moment
export async function markHighlight(
  sessionId: string,
  highlight: Omit<SessionHighlight, 'extracted_to_vault'>
): Promise<void>;
// Appends to cam_sessions.highlights

// Handler generates prompts based on session state
export async function generateSessionPrompts(
  sessionId: string,
  sessionState: {
    minutes_elapsed: number;
    edge_count: number;
    tip_total: number;
    viewer_count: number;
    last_tip_minutes_ago: number;
    denial_day: number;
  }
): Promise<HandlerPrompt[]>;
// Uses Claude API to generate contextual prompts:
// - Voice check every 10-15 minutes
// - Engagement prompts during quiet periods
// - Pacing adjustments based on edge count vs time
// - Tip goal updates when approaching milestones
// - Wind-down signal at target duration
```

### 3.4 Recording & Highlights

```typescript
// src/lib/cam/recording.ts

// Start recording using MediaRecorder API
export function startRecording(): {
  mediaRecorder: MediaRecorder;
  stream: MediaStream;
};
// Uses navigator.mediaDevices.getUserMedia({ video: true, audio: true })
// Records to webm format
// Returns handle for stop/pause control

// Stop recording and save
export async function stopAndSaveRecording(
  userId: string,
  sessionId: string,
  mediaRecorder: MediaRecorder
): Promise<{ recording_url: string; duration_seconds: number }>;
// Stops MediaRecorder, collects blob
// Uploads to Supabase storage
// Updates cam_sessions with recording_url and duration

// Extract highlights to content vault
export async function extractHighlightsToVault(
  userId: string,
  sessionId: string
): Promise<number>; // returns count of vault items created
// For each highlight in cam_sessions.highlights:
//   1. If we have the full recording: note the timestamp (actual clipping
//      requires server-side FFmpeg or manual extraction)
//   2. Create a vault item with:
//      source = 'session_capture'
//      source_session_id = sessionId
//      content_type = 'cam_highlight'
//      handler_notes = highlight.description
//   3. Queue for Handler classification
// Update cam_sessions.vault_items_created

// Post-session pipeline (called from endSession)
export async function runPostSessionPipeline(
  userId: string,
  sessionId: string
): Promise<void>;
// 1. Save recording to storage
// 2. Extract highlights to vault
// 3. Log revenue to revenue_log
// 4. Generate session summary post for platforms
// 5. Schedule highlight distributions
// 6. Update content corruption advancement data
// 7. Log session stats for Handler context
```

### 3.5 Go-Live Announcements

```typescript
// src/lib/cam/announcements.ts

// Generate and schedule go-live announcements across platforms
export async function scheduleGoLiveAnnouncements(
  userId: string,
  sessionId: string,
  scheduledAt: string
): Promise<void>;
// Creates content_distribution entries for:
// - 2 hours before: "Going live tonight at [time]. [arc-relevant tease]"
// - 30 minutes before: "30 minutes. [outfit tease or denial day context]"
// - At go-live: "Live now. [link]"
// Captions generated by Claude API in Maxy's voice, informed by:
// - Current narrative arc
// - Denial day (higher = more desperation angle)
// - Session type (standard vs denial vs milestone)
// Posts to all configured platforms

// Post session summary
export async function postSessionSummary(
  userId: string,
  sessionId: string,
  summary: CamSessionSummary
): Promise<void>;
// Creates content_distribution entries:
// "Tonight's session: [X] edges, [Y] minutes, $[Z] in tips. Thank you [top tipper]."
// Different caption per platform (OF gets more detail, Twitter gets tease)
```

---

## PART 4: React Hook

```typescript
// src/hooks/useCamSession.ts

export function useCamSession(sessionId?: string) {
  // Manages the full lifecycle of a cam session from David's perspective.
  
  return {
    // Current session state
    session: CamSession | null,
    isLive: boolean,
    isPrepping: boolean,
    elapsedSeconds: number, // live timer
    
    // Tip state
    tips: CamTip[],
    tipTotal: number,
    lastTip: CamTip | null,
    tipGoals: TipGoal[],
    
    // Handler prompts (only unacknowledged ones)
    activePrompts: HandlerPrompt[],
    acknowledgePrompt: (id: string) => Promise<void>,
    
    // Recording
    isRecording: boolean,
    
    // Edge tracking (delegated to existing edge session hook)
    edgeCount: number,
    recordEdge: () => void,
    
    // Lifecycle actions
    startPrep: () => Promise<void>,
    goLive: () => Promise<void>,
    endSession: () => Promise<CamSessionSummary>,
    
    // Manual tip entry (for self-hosted sessions without platform integration)
    logTip: (tokens: number, username?: string) => Promise<void>,
    
    // Mark highlight manually
    markHighlight: (type: string, description: string) => Promise<void>,
    
    // Upcoming sessions
    upcomingSessions: CamSession[],
    
    loading: boolean,
  };
}
```

---

## PART 5: UI Components

### 5.1 Cam Session Launcher

```typescript
// src/components/cam/CamLauncher.tsx

// Handler has scheduled a cam session. This is what David sees.
// Accessed from the daily task list or a dedicated "Cam" section.

// STATE: SCHEDULED
// â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
// â”‚  Cam Session                             â”‚
// â”‚  Tonight at 7:00 PM                      â”‚
// â”‚                                          â”‚
// â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
// â”‚  â”‚  Handler Instructions              â”‚  â”‚
// â”‚  â”‚                                    â”‚  â”‚
// â”‚  â”‚  Outfit: Black lace set + sheer    â”‚  â”‚
// â”‚  â”‚  robe. Camisole underneath.        â”‚  â”‚
// â”‚  â”‚                                    â”‚  â”‚
// â”‚  â”‚  Makeup: Technique #4. Soft eyes,  â”‚  â”‚
// â”‚  â”‚  pink lip. Extra highlight on      â”‚  â”‚
// â”‚  â”‚  cheekbones.                       â”‚  â”‚
// â”‚  â”‚                                    â”‚  â”‚
// â”‚  â”‚  Setup: Ring light position 2.     â”‚  â”‚
// â”‚  â”‚  Phone on tripod, landscape.       â”‚  â”‚
// â”‚  â”‚  Edge 2 charged and connected.     â”‚  â”‚
// â”‚  â”‚                                    â”‚  â”‚
// â”‚  â”‚  Denial day 6. She's responsive.   â”‚  â”‚
// â”‚  â”‚  The audience will see it.         â”‚  â”‚
// â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
// â”‚                                          â”‚
// â”‚  [ Start Prep ]                          â”‚
// â”‚                                          â”‚
// â”‚  Announcements: 2hr posted âœ…            â”‚
// â”‚                  30min at 6:30 PM        â”‚
// â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

// STATE: PREPPING
// Checklist of prep tasks with checkboxes.
// Handler sends prompts if prep takes too long.
// "Ready" button only active when device is connected.

// STATE: READY TO GO LIVE
// â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
// â”‚  Ready?                                  â”‚
// â”‚                                          â”‚
// â”‚  âœ… Outfit on                            â”‚
// â”‚  âœ… Makeup done                          â”‚
// â”‚  âœ… Ring light positioned                â”‚
// â”‚  âœ… Edge 2 connected                     â”‚
// â”‚  âœ… Camera tested                        â”‚
// â”‚                                          â”‚
// â”‚        [ ðŸ”´ GO LIVE ]                    â”‚
// â”‚                                          â”‚
// â”‚  Recording will start automatically.     â”‚
// â”‚  Handler will control the device.        â”‚
// â”‚  Just be present. The rest is handled.   â”‚
// â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 5.2 Live Session UI

```typescript
// src/components/cam/CamLiveView.tsx

// The primary UI during a live cam session.
// David sees this on his phone while camera streams from phone/laptop.
// If phone IS the camera: this is a compact overlay.
// If phone is secondary device: this is the control dashboard.

// LAYOUT:
// â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
// â”‚  ðŸ”´ LIVE  â—  00:34:12       ðŸ’° $47.50  â”‚ <- timer + revenue
// â”‚                                          â”‚
// â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
// â”‚  â”‚  Handler                           â”‚  â”‚ <- Handler prompt overlay
// â”‚  â”‚  "Voice check â€” you're drifting    â”‚  â”‚    (David sees, viewers don't)
// â”‚  â”‚   low. Find the resonance."        â”‚  â”‚
// â”‚  â”‚                      [ Got it âœ“ ]  â”‚  â”‚
// â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
// â”‚                                          â”‚
// â”‚  Edges: â— â— â— â— â— â— â—‹ â—‹ â—‹ â—‹    6     â”‚ <- edge counter
// â”‚                                          â”‚
// â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”              â”‚
// â”‚  â”‚ ðŸ”¥ Edge  â”‚ â”‚ â­ Mark  â”‚              â”‚ <- record edge / mark highlight
// â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜              â”‚
// â”‚                                          â”‚
// â”‚  Last tip: ðŸ’– Buzz (15 tokens) @user    â”‚ <- last tip feed
// â”‚  Tip goal: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 340/500           â”‚ <- tip goal progress
// â”‚                                          â”‚
// â”‚  Device: Internal 8 / External 4 / R 0  â”‚ <- current device state
// â”‚  Handler: Active   Tips: Active          â”‚ <- control status
// â”‚                                          â”‚
// â”‚  [ â¹ End Session ]                      â”‚
// â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

// HANDLER PROMPT OVERLAY:
// Slides in from top when Handler sends a prompt.
// Semi-transparent dark background with purple accent.
// "Got it" button dismisses. Auto-dismisses after 15 seconds.
// Types trigger different visual treatments:
//   voice_check â†’ yellow accent (attention)
//   edge_warning â†’ red accent (urgent)
//   affirmation â†’ green accent (reward)
//   wind_down â†’ blue accent (calm)

// EDGE BUTTON:
// Same as existing edge session. Tap when approaching edge.
// Handler uses edge count to pace the session.
// After edge 3+: Handler may add rotation.
// After edge 8+: Handler starts denial moments (device drops).

// MARK HIGHLIGHT:
// Manual highlight marker. David taps when something notable happens.
// Opens quick-select: tip_reaction, edge_denial, voice_moment,
// vulnerability, funny, milestone.
// Handler also marks highlights autonomously based on tip surges
// and edge count.

// TIP FEED:
// Shows last tip with pattern label and username.
// Fades after 5 seconds. Stacks if tips come fast.

// TIP GOAL:
// Handler sets goals. Progress bar fills as tips accumulate.
// When goal reached: celebration animation + device reward burst.
// If goal is "unlock orgasm" but is_real=false:
//   "Sorry. Goal reached. Handler says no."
//   (This is content. Fans love it.)

// END SESSION:
// Confirmation dialog: "End the session? Handler will handle everything else."
// On confirm: triggers post-session pipeline.
```

### 5.3 Post-Session Summary

```typescript
// src/components/cam/CamSummary.tsx

// Shown after session ends. David's debrief.
// Handler generates the summary. David just reads it.

// â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
// â”‚  Session Complete âœ¨                     â”‚
// â”‚                                          â”‚
// â”‚  Duration: 42 minutes                    â”‚
// â”‚  Edges: 9                                â”‚
// â”‚  Tips: $47.50 (23 tips)                  â”‚
// â”‚  Top tipper: @username (100 tokens)      â”‚
// â”‚  Peak viewers: 34                        â”‚
// â”‚                                          â”‚
// â”‚  Handler: "Good session. Your voice held â”‚
// â”‚  above 185Hz for 80% of it. The denial   â”‚
// â”‚  moment at 35 minutes was content gold.  â”‚
// â”‚  4 highlights marked for clip extraction.â”‚
// â”‚  Revenue logged. Highlights will hit     â”‚
// â”‚  your vault tomorrow morning."           â”‚
// â”‚                                          â”‚
// â”‚  Commitments made during session:        â”‚
// â”‚  â€¢ "I'll wear the plug to the gym"       â”‚
// â”‚  â€¢ "Voice practice every day this week"  â”‚
// â”‚                                          â”‚
// â”‚  [ Done ]                                â”‚
// â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 5.4 Tip Menu Display

```typescript
// src/components/cam/TipMenu.tsx

// Visual tip menu showing what each tip level does.
// Can be displayed on screen during cam for viewers,
// or exported as an image for platform posts.

// â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
// â”‚  Tip Menu                                â”‚
// â”‚                                          â”‚
// â”‚  âœ¨  1+     Tickle    She feels it.     â”‚
// â”‚  ðŸ’–  10+    Buzz      Watch the pulse.  â”‚
// â”‚  ðŸ”¥  25+    Wave      Rotation starts.  â”‚
// â”‚  âš¡  50+    Surge     Edge territory.   â”‚
// â”‚  ðŸŒŠ  100+   Overload  60s full power.   â”‚
// â”‚  ðŸ’€  200+   Edge&Deny Max then stop.    â”‚
// â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

// Also exported as a shareable image for platform posts.
// Handler uses this in go-live announcements.
```

---

## PART 6: Handler Context Integration

```typescript
// Add cam session data to Handler AI context

function buildCamContext(userId: string): string {
  // Pull: upcoming sessions, last session summary, tip trends,
  // highlight extraction status, recording availability
  
  return `
CAM SESSIONS:
  Next scheduled: ${nextSession?.scheduled_at || 'none'}
  Last session: ${lastSession ? `${lastSession.duration}min, $${lastSession.revenue}, ${lastSession.edge_count} edges` : 'never'}
  Total sessions: ${totalCount}
  Total cam revenue: $${totalCamRevenue}
  Average per session: $${avgRevenue}
  Best session: $${bestRevenue}
  
  ${nextSession ? `
  TONIGHT'S PRESCRIPTION:
  - Outfit: ${nextSession.prescribed_outfit}
  - Setup: ${nextSession.prescribed_setup}
  - Denial day: ${denialDay}
  - Strategy: Build slow, edge at 20min, denial moment at 35min
  - Tip goals: [goal descriptions]
  ` : ''}
  
  HANDLER CAM DIRECTIVES:
  - Schedule 2-3 sessions per week during denial days 4-7 (peak responsiveness)
  - If denial day 6+: prescribe denial cam (no completion, tip-to-unlock is fake)
  - Voice check every 10-15 minutes during session
  - Mark highlights when tips >= 100 tokens or edge denial moments
  - Post-session: extract highlights to vault within 24 hours
  `.trim();
}
```

---

## PART 7: Corruption Integration

Cam sessions feed content corruption advancement:

```typescript
cam_sessions_total: /* count from cam_sessions where status='ended' */,
cam_sessions_30d: /* last 30 days */,
cam_revenue_total: /* sum from cam_sessions.revenue_amount */,
cam_average_duration: /* avg duration_minutes */,
cam_highlights_extracted: /* total vault_items_created */,
first_cam_session: /* boolean â€” major milestone */,
cam_tip_goal_reached: /* any session where goal was hit */,
```

Content corruption milestones:
- First cam session ever ("she went live")
- 5 cam sessions completed
- First $100 cam session
- Cam session during denial day 7+ ("she performed in desperation")
- 10+ highlights extracted to vault from cam sessions

---

## PART 8: Navigation

Add cam session UI to the app:
- Task list: When Handler prescribes a cam session, it appears as a task card
  with "Cam at 7pm" and launches CamLauncher on tap
- Dedicated route: /cam â†’ CamLauncher (shows upcoming + history)
- Active session: /cam/live â†’ CamLiveView (takes over the screen)
- Post-session: /cam/summary/:id â†’ CamSummary
- Settings: Tip levels display, default recording settings

---

## PART 9: Self-Hosted Mode

Until external platform streaming is integrated, cam sessions run in
"self-hosted" mode:

1. David goes live on his own (opens Chaturbate/Fansly manually)
2. The app runs alongside as a companion:
   - Device control (Handler + manual tip logging)
   - Handler prompts on David's phone screen
   - Edge tracking
   - Highlight marking
   - Timer + revenue tracking
3. David manually logs tips (quick number input) OR
   connects to Chaturbate's tip API if available
4. Recording happens via the platform (not the app)
5. Post-session: David enters total revenue, Handler logs it

This means the cam system is USEFUL TODAY even without full streaming
integration. David can use Chaturbate for the stream and the Becoming
Protocol app as his Handler-controlled companion dashboard.

Future: OBS integration, Chaturbate API for real-time tips, RTMP
streaming from the app itself.

---

## IMPLEMENTATION NOTES

1. **Self-hosted mode is the MVP.** Don't block on streaming integration.
   The value is Handler control + tip processing + highlight marking +
   post-session pipeline. Actual streaming happens on external platforms.

2. **Manual tip logging is fine for v1.** Quick number pad: David types
   "50" when he sees a 50-token tip on Chaturbate. App fires the device
   pattern. Future: Chaturbate websocket API for real-time tips.

3. **Handler prompts are the killer feature.** No other cam tool gives you
   an AI director sending invisible prompts during a live session. Voice
   checks, pacing adjustments, edge warnings â€” this is the showrunner.

4. **Recording is optional for v1.** Many cam platforms already record.
   The app's recording via MediaRecorder is a bonus for self-hosted or
   for capturing the phone-side view.

5. **Highlights are the content pipeline bridge.** Every marked highlight
   becomes a vault item. The Handler classifies and distributes it. One
   cam session produces a week of content. This is the revenue engine's
   core output.

6. **Tip goals create drama.** The Handler sets goals fans can see. Some
   goals are real (unlock higher intensity). Some are fake (unlock orgasm
   â€” but denial is enforced). The fake goals are the best content. "Goal
   reached. Handler says no." Fans love the dynamic.

7. **Denial day scheduling is strategic.** The Handler schedules cam
   sessions on denial days 4-7 because arousal is highest, reactions are
   most visible, and desperation is authentic. This isn't cruelty â€” it's
   optimizing for both conditioning effectiveness and content quality.
