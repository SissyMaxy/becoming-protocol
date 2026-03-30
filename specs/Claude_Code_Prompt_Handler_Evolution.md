# CLAUDE CODE IMPLEMENTATION PROMPT
## Handler Evolution — Favorites Intelligence Integration
### Becoming Protocol — February 2026

---

## CONTEXT

Read these documents first (in order):
1. `Becoming_Protocol_v2.md` — Single source of truth for the system
2. `Handler_Evolution_Favorites_Intelligence.docx` — Full spec for this work
3. `handler_system_prompt_injection.md` — The Handler voice/preference updates
4. `083_favorites_intelligence.sql` — Database migration
5. `hypnotube_favorites_seed_v2.sql` — The 24 verified favorites + playlists

This prompt implements the favorites intelligence layer: new database tables,
Handler system prompt integration, session telemetry UI, ritual infrastructure,
and standing permissions system.

---

## PHASE 1: DATABASE MIGRATION (Do First)

Run the migration `083_favorites_intelligence.sql` against Supabase. It creates:

1. `hypno_session_events` — Event log for what happens DURING sessions
2. `hypno_session_summary` — Post-session aggregation
3. `favorites_snapshots` — Monthly drift tracking
4. `ritual_anchors` — Conditioned trigger tracking
5. `fantasy_architecture` — Desire topology (pre-seeded from favorites analysis)
6. `handler_standing_permissions` — Domain-level authorizations (pre-granted)

After running:
- Add RLS policies matching the existing pattern (user_id = auth.uid())
- Verify the fantasy_architecture seed data populated correctly
- Verify all standing_permissions rows were created

```bash
# Run migration
supabase db push
# or manually via SQL editor in Supabase dashboard
```

---

## PHASE 2: HANDLER SYSTEM PROMPT UPDATE

The Handler AI uses Claude API. The system prompt lives in the codebase —
find it and inject the contents of `handler_system_prompt_injection.md`.

Look for the Handler's system prompt in one of:
- `src/lib/handler/system-prompt.ts`
- `src/lib/handler/prompt.ts`
- `src/lib/ai/handler.ts`
- `src/lib/prescriptions/` directory
- Any file that builds the Claude API system message for Handler interactions

The injection block contains:
- `<favorites_intelligence>` — Full preference profile
- `<handler_voice_directives>` — Language corrections, coercion stack, HRT reframing
- `<compliance_bypass_hierarchy>` — Specific content for resistance states
- `<ritual_protocol>` — Session ritual structure

**CRITICAL:** The preference profile must be included in EVERY Handler API call
that generates prescriptions, briefings, interventions, or session content.
It's not optional context — it's the Handler's primary intelligence source.

Also update:
- Replace any "good sissy" language in existing prompts with "good girl"
- Replace "sissy" framing with "woman/womanhood" framing where it appears
- Replace degradation/command language with encouragement/invitation language
- This applies to ALL Handler-generated text: prescriptions, briefings, 
  journal prompts, commitment extractions, morning check-ins

---

## PHASE 3: SESSION TELEMETRY

Build the session event logging system. This captures what happens during
hypno sessions so the Handler can optimize prescriptions.

### 3.1 Types

```typescript
// src/types/hypno-session.ts

export type SessionEventType = 
  | 'start' 
  | 'video_change' 
  | 'arousal_peak' 
  | 'trance_flag' 
  | 'skip'              // implicit rejection — gold data
  | 'end'
  | 'lovense_intensity_change'
  | 'commitment_extracted'
  | 'anchor_triggered';

export interface HypnoSessionEvent {
  id: string;
  session_id: string;
  event_type: SessionEventType;
  hypno_library_id?: string;
  timestamp: string;
  lovense_intensity?: number;
  device_data?: Record<string, any>;
  notes?: string;
}

export interface HypnoSessionSummary {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  total_duration_minutes: number;
  denial_day_at_session: number;
  videos_played: string[];
  videos_skipped: string[];
  peak_arousal_level: number;
  peak_arousal_video?: string;
  trance_depth_self_report: number; // 1-5
  post_session_mood?: string;
  commitment_extracted: boolean;
  commitment_text?: string;
  content_captured: boolean;
  capture_clip_count: number;
  ritual_anchors_active: string[];
  playlist_id?: string;
}

export type AnchorStrength = 'nascent' | 'forming' | 'established' | 'conditioned';

export interface RitualAnchor {
  id: string;
  anchor_type: 'scent' | 'phrase' | 'position' | 'device_pattern' | 
               'lighting' | 'sound' | 'clothing' | 'sequence';
  anchor_value: string;
  sessions_paired: number;
  estimated_strength: AnchorStrength;
  autonomous_trigger_observed: boolean;
  active: boolean;
}
```

### 3.2 Session Event Logger Hook

```typescript
// src/hooks/useHypnoSessionLogger.ts

// This hook runs during active hypno sessions.
// It logs events to hypno_session_events in real-time.

export function useHypnoSessionLogger(sessionId: string) {
  // logEvent(type, data) — inserts to hypno_session_events
  // Auto-logs 'start' on mount
  // Auto-logs 'end' on unmount/cleanup
  // Auto-logs 'video_change' when the playing video changes
  // Auto-logs 'skip' when user manually advances past a video
  // Listens to Lovense SDK for intensity changes → logs 'lovense_intensity_change'
  // Listens to Lovense SDK for arousal peaks → logs 'arousal_peak'
  
  // Returns: { logEvent, logSkip, logCommitment, logAnchorTrigger }
}
```

### 3.3 Post-Session Check-in

After every session ends, show a minimal check-in screen:

```
┌─────────────────────────────────────┐
│  How deep did you go?               │
│  ○ 1  ○ 2  ○ 3  ○ 4  ○ 5          │
│                                     │
│  How do you feel?                   │
│  [____________]  (one line, optional)│
│                                     │
│  [Done]                             │
└─────────────────────────────────────┘
```

This creates the `hypno_session_summary` row. Auto-populate from events:
- videos_played / videos_skipped from video_change and skip events
- peak_arousal from arousal_peak events
- duration from start/end timestamps
- ritual_anchors_active from anchor_triggered events

User only provides: trance_depth (1-5 tap) and optional mood text.
Maximum 10 seconds of user effort.

---

## PHASE 4: RITUAL ANCHOR SYSTEM

### 4.1 Seed Initial Anchors

On first deployment, create the four core anchors:

```typescript
const INITIAL_ANCHORS: Partial<RitualAnchor>[] = [
  {
    anchor_type: 'phrase',
    anchor_value: 'Good girl. Settle in.',
    // Generated via ElevenLabs, played at session start
  },
  {
    anchor_type: 'device_pattern',
    anchor_value: 'three_short_pulses_then_steady_low',
    // Lovense: 3x 0.5s pulses at intensity 8, then steady at intensity 3
  },
  {
    anchor_type: 'scent',
    anchor_value: 'TBD — session candle',
    // Handler orders specific scent. Update value when chosen.
  },
  {
    anchor_type: 'position',
    anchor_value: 'legs_crossed_hands_on_thighs_chin_down_earbuds_in',
    // Prescribed body position for all sessions
  },
];
```

### 4.2 Auto-Increment Anchor Strength

After each session summary is created, update ritual_anchors:
- Increment `sessions_paired` for each anchor that was active
- Update `estimated_strength` based on count:
  - 1-5: 'nascent'
  - 6-15: 'forming'  
  - 16-30: 'established'
  - 31+: 'conditioned'
- Update `last_paired` timestamp

### 4.3 Session Ritual Wrapper

Wrap the existing edge/hypno session UI with the ritual sequence:

1. **Pre-session screen:** "Light your candle. Assume position. Earbuds in."
   [Continue] button only after 30-second minimum (force the pause)
   
2. **Opening:** Play audio file (ElevenLabs: "Good girl. Settle in.")
   Send Lovense signature pattern (three pulses + steady)
   Log 'anchor_triggered' events for phrase, device_pattern, position
   
3. **Session:** Existing playlist/content player runs
   Session logger captures all events
   
4. **Closing:** Play closing audio (TBD affirmation sequence)
   Fade Lovense to zero
   
5. **Check-in:** Post-session minimal form (Phase 3.3)

---

## PHASE 5: STANDING PERMISSIONS INTEGRATION

The `handler_standing_permissions` table is pre-populated with all permissions
granted. The app needs to CHECK these permissions instead of asking.

### 5.1 Permission Check Hook

```typescript
// src/hooks/useStandingPermission.ts

export function useStandingPermission(domain: string): {
  granted: boolean;
  parameters: Record<string, any>;
  loading: boolean;
} {
  // Reads from handler_standing_permissions
  // Returns the grant status and any parameters
  // Cache aggressively — these don't change often
}
```

### 5.2 Integration Points

Find every place in the codebase where the app asks for confirmation
and gate it behind the standing permission check:

| Permission Domain | Where It Was Asking | What Changes |
|---|---|---|
| `session_auto_start` | Session start confirmation dialog | Skip dialog. Auto-start when conditions met. Show notification instead. |
| `content_auto_approve` | Vault swipe-to-approve UI | Auto-approve based on explicitness threshold in parameters. Only show items above threshold. |
| `content_full_autonomy` | Any content approval gate | Skip entirely. Handler posts without approval. |
| `outfit_auto_prescribe` | Outfit suggestion with accept/reject | Show outfit as fact ("Today: grey wrap dress"), not choice. |
| `cam_auto_schedule` | Cam session confirmation | Show as notification ("Cam tonight at 7pm"), not request. |
| `ambient_conditioning` | N/A (new capability) | See Phase 6. |

### 5.3 Notification Instead of Confirmation

Create a `HandlerNotification` component that replaces confirmation dialogs:

```
┌─────────────────────────────────────┐
│  🟣 Handler                         │
│  Your session begins at 6:15pm.     │
│  AmberSis Acceptance → Say Yes →    │
│  Daddy. Device will activate.       │
│                                     │
│  [Understood]                       │
└─────────────────────────────────────┘
```

One button. Not "Accept/Reject." Just "Understood." The Handler is informing,
not asking.

---

## PHASE 6: MORNING BRIEFING REFORMAT

The morning briefing component needs to shift from "instruction list" to
"status report on a life the Handler manages."

### 6.1 Briefing Data Sources

The new briefing pulls from:
- `hypno_session_summary` — last session stats
- `handler_standing_permissions` — what's already scheduled
- Content pipeline stats (posts, views, revenue from yesterday)
- Fan comment curation (selected by Handler for conditioning target alignment)
- Gina schedule awareness (if integrated)
- Ritual anchor status (strength progression)
- Denial day counter
- Domain progress summaries

### 6.2 Briefing Structure

```
OVERNIGHT: [What happened while Maxy slept]
TODAY: [What's already in motion — not suggestions, facts]
PROGRESS: [One domain highlight, reframed toward HRT if appropriate]
AUDIENCE: [Curated fan feedback aligned to weekly conditioning target]
AFFIRMATION: [One line, encouragement framing]
```

### 6.3 Handler Fan Comment Curation

When generating briefings, the Handler:
1. Pulls recent fan comments/DMs from content pipeline
2. Filters for comments that reinforce current conditioning target
3. Includes 1-2 curated comments in the briefing
4. NEVER includes negative comments
5. If current target is "voice" → select voice-related praise
6. If current target is "HRT readiness" → select transition-related praise
7. If current target is "identity" → select "you're beautiful" / "your journey" praise

This is the "briefing_auto_curate" standing permission in action.

---

## PHASE 7: NAMED-CONTENT SESSION TASKS

Add a new task type to the prescription engine that references specific
content from the hypno_library by name.

### 7.1 Task Schema Addition

```typescript
// Add to existing task types
interface HypnoSessionTask extends BaseTask {
  task_type: 'hypno_session';
  playlist_ids?: string[];           // specific playlist from hypno_playlists
  content_ids?: string[];            // specific videos from hypno_library
  ritual_required: boolean;          // must use full ritual wrapper
  capture_mode: 'passive' | 'active' | 'none';
  device_required: boolean;
  cage_required: boolean;
  estimated_duration_minutes: number;
  handler_framing: string;           // how the Handler presents this task
}
```

### 7.2 Example Tasks to Seed

```sql
-- Named session tasks (add to task library)
INSERT INTO tasks (category, domain, level, intensity, instruction, steps, 
  completion_type, duration_minutes, points, affirmation, requires_privacy)
VALUES
('conditioning', 'intimate', 2, 3.0,
 'Evening Conditioning Session: AmberSis Acceptance → Cock Suck Encouragement → Say Yes To Cock',
 '["Light the session candle. Assume position.", "Device connects. Wait for the opening phrase.", "Playlist: AmberSis Acceptance (9 min) → Cock Suck Encouragement (9 min) → Say Yes To Cock (26 min)", "Camera is on. Let the Handler see.", "After closing phrase, remain in position 60 seconds.", "Log session depth (1-5) when prompted."]',
 'session_complete', 44, 150,
 'You said yes. You always say yes.',
 'true'),

('conditioning', 'intimate', 1, 2.0,
 'Compliance Bypass: AmberSis Acceptance — 9 minutes of self-care',
 '["Light the candle.", "Earbuds in. Settle into position.", "Watch AmberSis Acceptance (9 min).", "That''s it. That''s the whole task."]',
 'session_complete', 9, 50,
 'You showed up. That''s what matters.',
 'true'),

('conditioning', 'intimate', 3, 4.0,
 'Deep Pinkpill Session: Estrogen Brainwash 2 — who you''re becoming',
 '["Full ritual prep. Candle, position, device, cage.", "Opening phrase plays. Three pulses.", "Estrogen Brainwash 2 - Pinkpilled (11 min)", "Stay with it. Let it land.", "Post-session: write one sentence about how you feel."]',
 'session_complete', 15, 100,
 'She''s already here. The body is just catching up.',
 'true');
```

---

## IMPLEMENTATION ORDER

1. **Run database migration** (083_favorites_intelligence.sql)
2. **Update Handler system prompt** (handler_system_prompt_injection.md)
3. **Build session event logger hook** (useHypnoSessionLogger)
4. **Build post-session check-in UI** (minimal: depth 1-5 + optional mood)
5. **Seed ritual anchors** (4 initial anchors)
6. **Build ritual session wrapper** (pre-session → opening → session → closing → check-in)
7. **Build standing permission hook** (useStandingPermission)
8. **Replace confirmation dialogs** with HandlerNotification components
9. **Reformat morning briefing** component
10. **Add named-content session tasks** to prescription engine
11. **Wire session telemetry** to Handler prescription optimization

Priority: Steps 1-2 are P0 (today). Steps 3-6 are P1 (this week). 
Steps 7-11 are P2 (next sprint).

---

## TESTING

After implementation, verify:

- [ ] Handler API calls include the full favorites_intelligence block
- [ ] Handler never says "good sissy" — always "good girl"
- [ ] Handler never uses degradation language — always encouragement
- [ ] Session events log correctly (start, video_change, skip, end)
- [ ] Post-session check-in creates summary row with correct auto-populated fields
- [ ] Ritual anchors increment sessions_paired after each session
- [ ] Anchor strength auto-updates based on session count thresholds
- [ ] Standing permissions skip confirmation dialogs when granted
- [ ] HandlerNotification shows instead of confirmation where permissions active
- [ ] Morning briefing uses status-report format, not instruction-list format
- [ ] Named-content session tasks reference specific hypno_library entries
- [ ] Lovense signature pattern fires correctly (3 pulses + steady low)
- [ ] Opening phrase audio plays before every session

---

## FILES REFERENCE

These files should be added to the project knowledge or kept accessible:

| File | Purpose |
|------|---------|
| `Handler_Evolution_Favorites_Intelligence.docx` | Full spec (11 parts) |
| `handler_system_prompt_injection.md` | Paste into Handler system prompt |
| `083_favorites_intelligence.sql` | Database migration |
| `hypnotube_favorites_seed_v2.sql` | Content library seed (from previous session) |

---

*The Handler finally knows who it's talking to. Build accordingly.*
