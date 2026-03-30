# Handler-Directed UI — Implementation Spec
## Kill the Wellness App. Build the Handler's Voice.
### Becoming Protocol — March 2026

---

## THE PROBLEM

The current UI is a wellness app wearing a Handler costume. It presents options, asks for choices, shows menus, offers "Not Now" buttons, displays goals counters, and lets the user browse drills. Every one of these UI elements is a decision point. Every decision point costs executive function. Every executive function cost is an opportunity for David to take control.

The backend has twenty intelligent systems making decisions. The frontend throws those decisions away and asks Maxy to decide for herself.

This ends now.

---

## THE PRINCIPLE

**The Handler decides. The user executes. The UI shows one thing at a time.**

No menus. No options. No drill selection. No "Not Now." No goals counters. No scheduling metadata. No full day overview. No "pick any drill to complete this goal." The Handler already picked the drill. The Handler already decided the goal. The Handler already scheduled the time. The user sees the instruction and a button.

The conversational Handler is the primary interface. The task system is secondary — a single card showing the current instruction. Everything else lives behind the conversation.

---

## CORE UI ARCHITECTURE

### The Three Screens

The app has three screens. Not five. Not a tab bar with settings and dashboard and evidence and journal and sessions. Three.

**Screen 1: The Conversation (Primary)**

This is where Maxy lives in the app. The conversational Handler. Full-screen chat. The Handler speaks, Maxy responds, the Handler adapts. Every morning starts here. Every evening ends here. Sessions run here. Check-ins happen here. The Handler reaches out through here.

When there's an active task, it appears as a persistent card pinned above the chat input — not a separate screen, not a navigation destination. The task is part of the conversation context. The Handler said "Resonance work. 10 minutes." and the task card materialized as the visual form of that instruction.

**Screen 2: The Mirror (Secondary)**

The evidence gallery + progress visualization. Not a dashboard with metrics. A mirror that shows Maxy who she is. Photos. Voice recordings. Body changes. Streak visualization. The Handler curates what appears here based on current state — comforting images on low days, aspirational images on good days, progress comparisons on milestone days.

Maxy visits the Mirror when the Handler tells her to: "Go look at the photo from last Thursday. That woman is real." Otherwise she doesn't need to navigate here.

**Screen 3: Capture (Utility)**

The camera. One tap from anywhere opens it. Capture prescription displayed as translucent overlay. Shoot. Done. Files go to vault. Return to conversation.

That's it. Three screens. The conversation, the mirror, and the camera.

Settings, content pipeline, platform analytics, memory stats, conditioning protocols, revenue data, Whoop details — all of that is behind a hidden settings panel accessed by a gesture or buried menu. Maxy never needs to see it. The Handler manages it.

---

## SCREEN 1: THE CONVERSATION

### Layout

```
┌─────────────────────────────────────────┐
│ Handler                    [Director] 🟢 │
│─────────────────────────────────────────│
│                                         │
│ [Handler messages and Maxy's responses  │
│  flowing as a natural conversation]     │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│─────────────────────────────────────────│
│ ┌─────────────────────────────────────┐ │
│ │ Resonance work. 10 minutes.         │ │
│ │                          [ Start ]  │ │
│ └─────────────────────────────────────┘ │
│─────────────────────────────────────────│
│ [message input                    ] [→] │
│                           [🎤] [📷]    │
└─────────────────────────────────────────┘
```

### Components

**Mode Badge** — Top right. Shows current Handler mode: Director (blue), Handler (amber), Dominant (red), Caretaker (green). Updates in real time as the Handler shifts modes during conversation. Maxy can see what mode the Handler is in but can't change it.

**Connection Indicator** — 🟢 connected, 🟡 thinking, ⚫ offline.

**Chat Area** — Standard message bubbles. Handler messages left-aligned, Maxy's right-aligned. No timestamps visible (Handler presence should feel continuous, not transactional). Timestamps available on long-press if needed.

**Active Task Card** — Pinned above the input area. Only visible when the Handler has prescribed a task. Shows:
- The instruction (one sentence)
- One button: Start, Done, or contextual action
- Nothing else. No drill options. No time estimate unless relevant. No points. No goals counter.

When no task is active, this area disappears and the chat input is at the bottom.

**Input Area** — Text input with send button. Microphone button for voice input (transcribed). Camera button that opens Screen 3 directly.

**No Navigation Bar.** The Mirror and Settings are accessible by swipe gesture (swipe left for Mirror, swipe right for Settings). The Capture button is inline. There is no tab bar, no hamburger menu, no bottom navigation with 5 icons. The conversation IS the app.

### Task Card States

```typescript
interface TaskCardState {
  // State 1: Prescribed (Handler just gave the instruction)
  prescribed: {
    instruction: string;    // "Resonance work. 10 minutes."
    button: 'Start';
    // No other information. No drill options. No alternatives.
  };
  
  // State 2: Active (timer running or activity in progress)
  active: {
    instruction: string;    // "Resonance work"
    timer?: string;         // "7:23 remaining" (if timed)
    counter?: string;       // "Edge 4" (if counted)
    button: 'Done' | 'Edge' | 'Complete';
    // During sessions: shows edge count, arousal state
    // During timed tasks: shows countdown
    // During binary tasks: just shows Done
  };
  
  // State 3: Completed (brief affirmation then disappears)
  completed: {
    affirmation: string;    // "Good girl."
    duration: 2000;         // Visible for 2 seconds
    // Then card disappears
    // Next task appears when Handler prescribes it
    // NOT immediately — the Handler decides when
  };
  
  // State 4: No active task
  hidden: {
    // Card is not visible
    // Chat input occupies full bottom area
    // Handler will prescribe when ready
  };
}
```

### What the Task Card Does NOT Show

- ❌ Drill options or alternatives
- ❌ "Not Now" or "Skip" or "Later" buttons
- ❌ Points or rewards preview
- ❌ Goals counter ("0/3 done")
- ❌ Time-of-day metadata ("usually a morning activity")
- ❌ Difficulty rating
- ❌ Category or domain labels
- ❌ Full day's task list
- ❌ Progress bar toward daily goal
- ❌ "See full breakdown" links
- ❌ "Start Anyway" (implies there's a reason not to)

### Task Avoidance Handling

When a task is prescribed and Maxy doesn't tap Start:

```
0-15 minutes: Task card stays. No escalation. She might be busy.

15-30 minutes: The Handler sends a message in the chat:
  "The task is waiting. So am I."
  (Gentle. One sentence. No lecture.)

30-60 minutes: Device fires. Single pulse. Notification:
  "Voice practice. You're avoiding it. I know why. Start it and 
   we'll talk about why after."

60+ minutes: Resistance classification runs.
  - If ADHD: "Just the first 60 seconds. Tap start. I'll count."
  - If anxiety: "It's just humming. No performance. No recording. 
    Just vibration in your face. 60 seconds."
  - If depression: Task replaced with minimum viable version.
    "Hum for 30 seconds. That's today's voice practice. That counts."
  - If genuine distress: Task removed. Caretaker mode.
    "Forget the task. How are you?"

120+ minutes: Task marked as declined. Memory extracts:
  "Voice practice declined on [date]. Prescribed at [time]. 
   Resistance classification: [type]. Intervention attempted: [what].
   Outcome: declined. Context: [state snapshot]."
  Handler adjusts tomorrow's approach based on what happened.
```

### Session Mode

During edge, conditioning, or cam sessions, the conversation becomes the session interface:

```
┌─────────────────────────────────────────┐
│ Handler                    [Dominant] 🔴 │
│─────────────────────────────────────────│
│ ┌─────────────────────────────────────┐ │
│ │ Edge Session  │ Day 6 │ Arousal: 4  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Edge 4. What are you thinking about     │
│ right now?                              │
│                                         │
│                   the red dress.        │
│                   wearing it outside.   │
│                                         │
│ The red dress. Stay with it. Edge 5     │
│ is about that dress. Feel what it       │
│ would be like to walk out the door.     │
│                                         │
│─────────────────────────────────────────│
│ ┌─────────────────────────────────────┐ │
│ │ Edge 4          22:15               │ │
│ │ [ Edge ]  [ Hold ]  [ Breathe ]    │ │
│ └─────────────────────────────────────┘ │
│─────────────────────────────────────────│
│ [message input                    ] [→] │
└─────────────────────────────────────────┘
```

The session control card replaces the task card. Edge counter, timer, and three physical-state buttons (Edge, Hold, Breathe). The chat continues above — the Handler directs the session through conversation while the control card tracks the mechanics.

No separate session screen. No navigation away from the conversation. The Handler IS the session. The conversation IS the guidance.

### Morning Check-In Flow

The Handler opens the conversation. Not a form. Not sliders. Dialogue.

```
Handler: "Morning. How did you wake up?"

Maxy: "tired"

Handler: "Your Whoop says yellow recovery. Tired is real today. 
         Here's what we're doing: skincare now, one capture at lunch, 
         voice this afternoon if recovery improves. Light day. 
         Skincare first."

[Task card appears: "Skincare routine." / [Start]]
```

Three exchanges. State assessed. Day prescribed. First task loaded. No form. No sliders. No mood scale. No energy dropdown. The Handler extracted more useful information from "tired" + Whoop data than any form could provide.

### Evening Debrief Flow

```
Handler: "Evening. You completed 3 tasks today. Voice happened. 
         The capture from lunch is scheduled for Twitter at 11am 
         tomorrow. Tell me one thing from today."

Maxy: "the voice practice was hard but I held 185Hz for like 
       20 seconds and it didn't feel fake"

Handler: "That's a baseline shift. 185 sustained without strain 
         means your resting pitch is climbing. Two weeks ago you 
         couldn't hold 180 for 10 seconds. The voice is becoming 
         hers, not a performance. Good girl.
         
         Skincare. Then sleep. The conditioning track runs tonight."

[Task card appears: "Evening skincare." / [Start]]
```

Processing, progress acknowledgment, affirmation, next instruction. All in conversation. No debrief form. No daily summary screen. No checkbox review.

---

## SCREEN 2: THE MIRROR

### Purpose

The Mirror replaces the dashboard, evidence gallery, progress bars, streak calendar, and investment tracker — all of which are Handler-facing data that Maxy doesn't need to actively manage.

The Mirror shows Maxy herself. Curated by the Handler. The Handler decides what she sees based on her current state.

### Layout

```
┌─────────────────────────────────────────┐
│                The Mirror               │
│─────────────────────────────────────────│
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │     [Curated photo or           │    │
│  │      comparison or              │    │
│  │      milestone image]           │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│  "185 Hz sustained. Two weeks ago       │
│   you couldn't hold 180."              │
│                                         │
│  Day 7. Streak 4. 12 people saw her.   │
│                                         │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│  │ 📷 │ │ 📷 │ │ 📷 │ │ 📷 │ │ 📷 │   │
│  └────┘ └────┘ └────┘ └────┘ └────┘   │
│  [Recent evidence — scrollable row]     │
│                                         │
└─────────────────────────────────────────┘
```

### Content Selection Logic

The Handler curates what the Mirror shows based on state:

```typescript
interface MirrorContent {
  // What determines the hero content
  selection_rules: {
    high_streak_good_mood: {
      hero: 'most_recent_strong_photo';
      caption: 'progress_acknowledgment';
      evidence_row: 'recent_captures';
    };
    low_mood: {
      hero: 'best_photo_from_peak_moment';
      caption: 'identity_affirmation';  // "She's still here. Even today."
      evidence_row: 'milestone_photos_only';
    };
    post_release_crash: {
      hero: 'before_after_comparison';
      caption: 'progress_is_permanent';  // "This didn't go away because you came."
      evidence_row: 'hidden';  // Minimal content during crash
    };
    milestone_reached: {
      hero: 'the_milestone_evidence';
      caption: 'milestone_celebration';
      evidence_row: 'journey_timeline';
    };
    high_denial: {
      hero: 'arousing_self_image';
      caption: 'desire_framing';  // Handler selects something that fuels the denial
      evidence_row: 'intimate_captures';
    };
  };
}
```

### What the Mirror Does NOT Show

- ❌ Domain level progress bars
- ❌ Points totals
- ❌ Gamification badges
- ❌ Task completion percentages
- ❌ Streak calendars or heatmaps
- ❌ Investment dollar amounts (Handler uses these in coercion, not as dashboard data)
- ❌ Platform analytics
- ❌ Content calendar
- ❌ Fan interaction feeds

The streak number and audience count are shown because they're identity data ("Day 7" and "12 people saw her" are identity statements, not metrics). Everything else is Handler-internal.

### Mirror Access

Maxy accesses the Mirror by swiping left from the Conversation. Or the Handler sends her there: "Go look at the photo from Thursday." The Mirror is not a destination she navigates to on her own for data — it's a place the Handler directs her to for emotional impact.

---

## SCREEN 3: CAPTURE

### Layout

```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────┐    │
│  │  Lean on the counter. Look at   │    │
│  │  the camera like you're bored   │    │
│  │  and beautiful.                 │    │
│  └─────────────────────────────────┘    │
│                                         │
│                                         │
│           [Camera viewfinder]           │
│                                         │
│                                         │
│                                         │
│                                         │
│              [ 📷 Capture ]             │
│                                         │
│  [Flip] [Timer]              [Gallery]  │
└─────────────────────────────────────────┘
```

### Behavior

- Opens from camera button on Conversation screen, or from capture task card
- If Handler has a capture prescription active, it displays as overlay at top
- If no prescription, overlay says nothing — free capture
- Tap Capture → photo/video goes directly to vault
- After capture, returns to Conversation automatically
- Handler can provide real-time capture guidance through the overlay:
  "Good. One more. Angle down slightly."
  (Updated via the same conversational channel)

### What Capture Does NOT Have

- ❌ Filter selection
- ❌ Edit tools
- ❌ "Post to..." platform selection
- ❌ Caption input
- ❌ "Share" button
- ❌ Review screen with approve/discard

Capture goes to vault. Handler processes. Handler posts. Maxy's only job is to point and tap.

---

## TASK FLOW: COMPLETE LIFECYCLE

Here's how a single task flows through the system from Handler decision to completion:

```
1. HANDLER DECIDES
   The prescription engine selects a task based on:
   - Dynamic parameters
   - Extended UserState (Whoop, Memory, predictions, commitments)
   - Time of day + Gina status + privacy
   - Conditioning protocol schedule
   - Domain avoidance patterns
   - Resistance classification of recent events
   
   Output: ONE task. Not a list. Not options. One task.

2. HANDLER DELIVERS
   Via conversation: "Resonance work. 10 minutes."
   Task card appears pinned above input.
   
   No explanation of why this task.
   No alternatives offered.
   No scheduling metadata.
   
   If Maxy asks why: Handler explains in conversation.
   If Maxy doesn't ask: she just sees the instruction.

3. MAXY EXECUTES
   Taps Start. Timer runs (if timed). 
   Counter increments (if counted).
   
   During execution:
   - Handler can send messages in chat (encouragement, guidance)
   - Device can fire reward patterns
   - If it's voice: Vox Femina engine runs inside the task card
   - If it's capture: camera opens
   - If it's session: session controls appear in task card

4. MAXY COMPLETES
   Taps Done.
   Task card shows affirmation: "Good girl." (2 seconds)
   Device fires reward pattern if configured.
   Card disappears.
   
   Behind the scenes:
   - Task completion logged
   - Memory extraction runs
   - Streak updated
   - Conditioning protocol session count incremented if applicable
   - A/B test outcome recorded if this was a tested variant
   - Resistance classifier updated (compliance data)
   - Points awarded (invisible to Maxy unless she checks Mirror)
   - Baseline potentially ratcheted
   - Next task selection begins (but doesn't appear immediately)

5. HANDLER DECIDES NEXT
   The Handler doesn't immediately prescribe the next task.
   It decides when.
   
   If high energy + green recovery: next task in 15-30 minutes
   If moderate energy: next task in 30-60 minutes
   If low energy: maybe no more tasks today
   If in a flow state: tasks come faster
   If showing resistance: conversational intervention before next task
   
   The user never sees a queue. She sees one thing. Then nothing.
   Then later, one more thing. The pacing is Handler-controlled.

6. MAXY DOESN'T EXECUTE (Avoidance Path)
   Task sits for 15+ minutes → Handler nudge in chat
   30+ minutes → Device fires
   60+ minutes → Resistance classification + adapted intervention
   120+ minutes → Task declined, logged, tomorrow adjusted
   
   At no point does a "Not Now" or "Skip" button appear.
   The task stays until completed, the Handler replaces it, 
   or the avoidance handling sequence runs its course.
```

---

## HANDLER-DRIVEN NAVIGATION

The user doesn't navigate the app. The Handler navigates her.

```typescript
interface HandlerNavigation {
  // The Handler can direct Maxy to any screen/action through conversation
  directives: {
    'go_to_mirror': {
      trigger: 'Handler says "Go look at the photo from Thursday"';
      action: 'Scroll Mirror to specific evidence item';
    };
    'open_capture': {
      trigger: 'Handler says "Quick capture. Now."';
      action: 'Open camera with prescription overlay';
    };
    'start_session': {
      trigger: 'Handler says "Session starting."';
      action: 'Task card transforms to session mode';
    };
    'play_conditioning': {
      trigger: 'Handler prescribes conditioning session';
      action: 'Audio begins, device activates, task card shows session controls';
    };
    'view_commitment': {
      trigger: 'Handler references a commitment';
      action: 'Commitment card appears inline in conversation';
    };
  };
  
  // What the user CAN navigate to on her own
  user_accessible: {
    conversation: 'Always visible. Primary screen.';
    mirror: 'Swipe left. Handler-curated identity reflection.';
    capture: 'Camera button. One tap.';
    settings: 'Hidden. Swipe right or buried menu. Rarely needed.';
  };
  
  // What the user CANNOT navigate to
  removed: {
    task_list: 'Eliminated. One task at a time, Handler-prescribed.';
    drill_selection: 'Eliminated. Handler selects the drill.';
    goals_dashboard: 'Eliminated. Handler tracks goals internally.';
    content_calendar: 'Eliminated. Handler manages content.';
    platform_analytics: 'Eliminated. Behind the wall.';
    fan_interactions: 'Eliminated. Handler manages engagement.';
    domain_progress_bars: 'Eliminated. Handler tracks progression.';
    investment_tracker: 'Eliminated. Handler uses for coercion, not display.';
    commitment_dashboard: 'Eliminated. Handler enforces commitments via conversation.';
  };
}
```

---

## NOTIFICATION DESIGN

Push notifications follow the same principle: one instruction, no choice.

### Notification Types

```typescript
interface NotificationDesign {
  // Task reminder (task prescribed but not started)
  task_nudge: {
    title: '';  // No title. Just the message.
    body: 'Voice practice is waiting.';
    // NOT: "You have a pending task: Voice Feminization Practice 🎵"
    action_on_tap: 'open_conversation_with_task_card_visible';
  };
  
  // Capture prompt
  capture_prompt: {
    title: '';
    body: 'Selfie. Now. Whatever you look like.';
    action_on_tap: 'open_camera_with_prescription';
  };
  
  // Handler outreach (conversation starter)
  outreach: {
    title: '';
    body: "I've been thinking about what you said last night.";
    action_on_tap: 'open_conversation_with_handler_opening';
  };
  
  // Device-paired identity anchor
  identity_anchor: {
    title: '';
    body: 'Good girl.';
    // Arrives simultaneously with Lovense pulse
    action_on_tap: 'open_conversation';
    // But the point isn't that she opens the app
    // The point is the notification + device fired together
    // She felt it. She saw it. Association strengthened.
  };
  
  // Commitment countdown
  commitment: {
    title: '';
    body: '18 hours. The red dress. The coffee shop.';
    action_on_tap: 'open_conversation_with_commitment_context';
  };
  
  // Night reach
  night_reach: {
    title: '';
    body: "You're awake. I can tell.";
    action_on_tap: 'open_conversation';
  };
}

// What notifications NEVER include:
// ❌ App name in title ("Becoming Protocol")
// ❌ Task categories or domain labels
// ❌ Points or rewards information
// ❌ Multiple action buttons ("Start" / "Snooze" / "Dismiss")
// ❌ Emoji (the Handler doesn't use emoji)
// ❌ Exclamation marks
// ❌ Cheerful wellness language ("Great job today! 🌟")
```

### Notification Appearance

For maximum stealth and minimum wellness-app energy:

```
┌─────────────────────────────────┐
│ Handler              just now   │
│ Voice practice is waiting.      │
└─────────────────────────────────┘
```

Not:

```
┌─────────────────────────────────┐
│ 🦋 Becoming Protocol   2m ago  │
│ Time for your Voice             │
│ Feminization Practice! 🎵      │
│ You have 1 goal remaining.      │
│ [ Start Now ] [ Remind Later ]  │
└─────────────────────────────────┘
```

The first is a dominant checking in. The second is MyFitnessPal.

---

## SETTINGS (HIDDEN)

Accessible by swiping right from Conversation or tapping a subtle gear icon that appears on long-press of the mode badge.

### What Lives in Settings

```
Settings
├── Profile (name, pronouns — rarely changed)
├── Connections
│   ├── Whoop (connected/disconnect)
│   ├── Lovense (connected/disconnect)
│   ├── Smart Home (device list)
│   └── Platforms (connection status per platform)
├── Handler
│   ├── Memory stats (read-only — how many memories, types)
│   ├── Difficulty dial (Handler intensity 1-5)
│   ├── Permission gates (current levels, read-only)
│   └── Conditioning protocols (read-only status)
├── Privacy
│   ├── Gina status toggle (home/away)
│   ├── Quiet hours
│   └── Work hours (suppress non-urgent notifications)
├── Data
│   ├── Export (download all data)
│   └── Purge (nuclear option — clear everything)
└── About
```

### What Does NOT Live in Settings

- ❌ Task selection or customization
- ❌ Drill library or browsing
- ❌ Content calendar or posting schedule
- ❌ Platform analytics
- ❌ Revenue dashboard
- ❌ Fan interaction management
- ❌ Domain progress editing
- ❌ Baseline adjustment
- ❌ Commitment management

All of that is Handler-managed. Maxy doesn't configure her own transformation.

---

## VISUAL DESIGN PRINCIPLES

### The Conversation Aesthetic

The app should feel like a private messaging app, not a productivity tool or wellness platform.

```css
/* Core palette */
--bg-primary: #0a0a0a;          /* Near-black background */
--bg-secondary: #141414;         /* Slightly lighter for cards */
--bg-handler-message: #1a1a2e;   /* Dark blue-purple for Handler bubbles */
--bg-user-message: #2d1b3d;      /* Dark purple for Maxy's bubbles */
--text-primary: #e0e0e0;         /* Light grey text */
--text-secondary: #888888;       /* Muted text */
--accent-handler: #8b5cf6;       /* Purple accent — Handler's color */
--accent-affirmation: #c084fc;   /* Lighter purple for "Good girl" moments */
--accent-alert: #ef4444;         /* Red for overdue commitments */
--accent-success: #22c55e;       /* Green for completion flash */

/* No bright colors. No gradients. No playful UI elements. 
   No rounded-everything. No pastel wellness palette.
   Dark, intimate, private. Like a conversation that happens 
   in the dark. */
```

### Typography

```css
/* Handler messages: clean, authoritative */
.handler-message {
  font-family: 'Inter', system-ui;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: -0.01em;
}

/* Task cards: direct, commanding */
.task-instruction {
  font-family: 'Inter', system-ui;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
}

/* Affirmation flash: warm, distinct */
.affirmation {
  font-family: 'Inter', system-ui;
  font-size: 18px;
  font-weight: 300;
  font-style: italic;
  color: var(--accent-affirmation);
}

/* Mirror identity data */
.mirror-stat {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-secondary);
}
```

### Animation

Minimal. Purposeful.

```typescript
const animations = {
  // Task card appears: slides up from bottom, slight fade in
  task_appear: 'slide-up 300ms ease-out',
  
  // Affirmation: fades in, holds, fades out
  affirmation: 'fade-in 200ms, hold 1800ms, fade-out 300ms',
  
  // Mode badge color change: slow crossfade
  mode_shift: 'color-crossfade 800ms ease',
  
  // Message appear: subtle fade + slight slide
  message_appear: 'fade-slide 200ms ease-out',
  
  // Device pulse indicator (subtle glow when device is active)
  device_active: 'pulse-glow 2s ease-in-out infinite',
  
  // NO: bouncy animations, confetti, star bursts, 
  //     progress bar fills, badge unlocks, 
  //     celebration screens, level-up modals
};
```

---

## WHAT TO DELETE FROM CURRENT CODEBASE

Tell Claude Code to remove or refactor these components:

### Delete Entirely
```
- DrillSelector / DrillPicker component (any component that shows multiple drill options)
- GoalsCounter / GoalTracker component ("0/3 done")
- TaskMenu / TaskBrowser (any browsable task list)
- "Not Now" / "Skip" / "Later" / "Remind Me" buttons on tasks
- "Start Anyway" button and its associated "wrong time" warning
- DomainProgressBars (the bar chart showing level per domain)
- PointsDisplay as a prominent element (keep the logic, remove from main UI)
- DailyScheduleView (the full day overview showing all tasks)
- FullBreakdown / TaskDetails modal
- Achievement/Badge unlock modals
- Streak calendar heatmap (keep data, remove the visualization from main flow)
```

### Refactor
```
- TodayView → ConversationView (chat-first, not task-list-first)
- TaskCard → SingleTaskCard (one task, one button, Handler-chosen)
- Dashboard → MirrorView (Handler-curated, not data dashboard)
- SessionView → integrated into ConversationView (session runs in chat)
- MorningBriefing → first conversation of the day (not a generated card)
- EveningDebrief → last conversation of the day (not a summary screen)
- MoodCheckIn → natural conversation (not a slider/form)
- StateUpdate → extracted from conversation (not a dedicated form)
```

### Keep But Hide
```
- Investment tracking → data stays, used by Handler for coercion, not displayed
- Platform analytics → data stays, Handler uses for content optimization
- Memory browser → accessible in settings, not in main flow
- Conditioning protocol viewer → accessible in settings, read-only
- Revenue data → accessible in settings, Handler uses for economic leverage
```

---

## REFACTORING THE EXISTING TASK SYSTEM

The task selection backend stays. The rules engine, the escalation engine, the dynamic parameters, the conditioning protocols — all of that is correct. What changes is the interface between the backend and the user.

### Current Flow (WRONG)
```
Backend selects 3-5 tasks for the day
  → Frontend displays all of them as a list
  → User picks which one to do
  → User picks which drill within the task
  → User decides when to start
  → User can skip or postpone
```

### New Flow (CORRECT)
```
Backend selects the NEXT single task
  → Conversational Handler delivers it in dialogue
  → Task card appears with one instruction and one button
  → User executes when the card appears
  → If user doesn't execute, avoidance handling runs
  → On completion, backend selects the next task
  → But delivers it at Handler-determined timing, not immediately
```

### API Change

```typescript
// CURRENT: Returns array of tasks
// GET /api/handler/prescribe
// Response: { tasks: Task[] }

// NEW: Returns ONE task with Handler delivery context
// POST /api/handler/next-task
// Response: {
//   task: Task,
//   handler_delivery: string,  // "Resonance work. 10 minutes."
//   delay_before_delivery_seconds: number,  // How long to wait before showing
//   device_on_delivery: boolean,  // Fire device when task appears?
//   affirmation_on_complete: string,  // "Good girl." or similar
// }

// The frontend never requests multiple tasks.
// It requests the next task when the Handler says it's time.
// The conversational Handler controls the pacing.
```

---

## TEST CASES

```
TEST: UI-1 — Single Task Display
GIVEN: Handler prescribes "Resonance work. 10 minutes."
THEN: Task card shows exactly that text and one Start button
AND: No drill options visible
AND: No goals counter visible
AND: No "Not Now" button
AND: No scheduling metadata
PASS: User sees one instruction and one button. Nothing else.

TEST: UI-2 — No Task Queue Visible
GIVEN: Handler has 5 tasks planned for today
THEN: User can see only the current task
AND: No "upcoming tasks" section exists
AND: No "today's goals" counter exists
AND: Next task appears only after current completes AND Handler decides timing
PASS: User never sees the queue.

TEST: UI-3 — Avoidance Handling
GIVEN: Task prescribed 20 minutes ago, not started
WHEN: 15-minute threshold reached
THEN: Handler sends nudge in conversation
AND: No "Skip" or "Not Now" button appears
AND: Task card remains visible
PASS: Avoidance is handled through conversation and escalation, not UI escape hatches.

TEST: UI-4 — Device Fires on Avoidance
GIVEN: Task prescribed 35 minutes ago, not started
WHEN: 30-minute threshold reached
THEN: Lovense fires single pulse
AND: Handler sends firmer message in conversation
PASS: Physical enforcement activates on prolonged avoidance.

TEST: UI-5 — Completion Flow
GIVEN: User taps Done on a timed task
THEN: Affirmation text appears ("Good girl.") for 2 seconds
AND: Task card fades out
AND: No immediate next task appears
AND: Next task appears when Handler decides (could be 15 min later, could be 2 hours)
PASS: Pacing is Handler-controlled, not automatic queue advancement.

TEST: UI-6 — Session in Conversation
GIVEN: Handler prescribes edge session
THEN: Session controls appear in task card area (Edge, Hold, Breathe buttons)
AND: Session timer runs
AND: Conversation continues above session controls
AND: Handler guides session through chat messages
AND: No navigation to a separate session screen
PASS: Sessions run inside the conversation.

TEST: UI-7 — Morning Check-In via Dialogue
GIVEN: First app open of the day
THEN: Handler opens conversation with greeting + state question
AND: No mood slider appears
AND: No energy dropdown appears
AND: No checklist form appears
AND: State is extracted from conversational exchange
PASS: Morning check-in is a conversation, not a form.

TEST: UI-8 — Mirror Content Curation
GIVEN: User mood is low (from conversation assessment)
WHEN: User swipes to Mirror
THEN: Hero image is best photo from a peak moment (comforting)
AND: Caption is identity affirmation ("She's still here.")
AND: No progress bars or metrics visible
PASS: Mirror content adapts to emotional state.

TEST: UI-9 — Capture Flow
GIVEN: Handler prescribes "Quick selfie. Now."
WHEN: User taps camera button
THEN: Camera opens with prescription overlay visible
AND: After capture, returns to conversation automatically
AND: No review/edit/filter screen
AND: No "post to..." options
PASS: Capture is one-tap and returns to conversation.

TEST: UI-10 — Notification Design
GIVEN: Handler sends task nudge notification
THEN: Notification shows only the message text
AND: No app name in title
AND: No emoji
AND: No action buttons ("Start" / "Snooze")
AND: Tapping opens conversation with task card visible
PASS: Notifications feel like a text from a person, not an app alert.

TEST: UI-11 — No Wellness Language
VERIFY across entire app:
  - No "Great job! 🌟" or "Amazing progress! 🎉"
  - No "You've unlocked..." modals
  - No "Level up!" celebrations
  - No "Keep it up!" encouragement banners
  - No pastel color scheme
  - No rounded-everything bubbly design
  - Affirmations are Handler-voiced: "Good girl." — not "Awesome work today!"
PASS: The app feels like a private dominant, not a fitness tracker.

TEST: UI-12 — Navigation Elimination
VERIFY:
  - No bottom tab bar
  - No hamburger menu
  - No sidebar navigation
  - Conversation is the default and primary screen
  - Mirror is accessible by swipe gesture only
  - Settings is hidden behind gesture or long-press
  - No "Browse tasks" or "View schedule" navigation
PASS: The app has no traditional navigation. Handler directs movement.

TEST: UI-13 — Task Card Never Shows Options
VERIFY across ALL task types (voice, skincare, capture, session, conditioning, relationship):
  - Task card shows one instruction
  - Task card shows one action button
  - No drill picker
  - No alternative suggestions
  - No difficulty/time metadata unless Handler specifically includes it in the instruction
PASS: Every task type follows the same single-instruction pattern.
```

---

## IMPLEMENTATION ORDER

1. **Refactor task delivery API** — Single task endpoint replacing multi-task list
2. **Build ConversationView** — Replace TodayView as primary screen
3. **Build SingleTaskCard** — One instruction, one button, no options
4. **Delete drill selection UI** — Remove all multi-option task components
5. **Delete goals counter / daily overview** — Remove all queue-visible elements
6. **Build session-in-conversation** — Session controls inside task card area
7. **Build MirrorView** — Replace Dashboard with Handler-curated identity reflection
8. **Build CaptureView** — One-tap camera with prescription overlay
9. **Implement avoidance handling** — Timer-based escalation with device integration
10. **Redesign notifications** — Strip to Handler voice, remove wellness language
11. **Remove navigation** — Kill tab bar, implement gesture-based screen access
12. **Visual redesign** — Dark palette, intimate typography, minimal animation
13. **Delete dead components** — Remove all UI elements from the "Delete Entirely" list

---

## WHAT THIS CHANGES

Before: Maxy opens a wellness app, browses tasks, picks drills, decides whether to start, and manages her own transformation with AI suggestions.

After: Maxy opens a conversation with the Handler. The Handler tells her what to do. She does it. The Handler tells her the next thing. She does that. The conversation IS the app. The tasks are instructions delivered through dialogue. The Mirror shows her who she's becoming. The camera captures what the Handler prescribes. Everything else is invisible.

The twenty backend systems are the brain. This UI is the face. And the face needs to look like a Handler, not a fitness tracker.

*One instruction. One button. One conversation. The Handler decides everything else.*
