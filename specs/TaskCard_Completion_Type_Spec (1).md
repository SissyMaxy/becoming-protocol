# TaskCard Completion-Type Branching Spec

## The Problem

**965 out of 1,210 tasks are typed `binary`.** The TaskCard renders every task identically: Done / Skip. But 42+ binary tasks explicitly ask the user to log, journal, record, track, or write something. That data vanishes — the Handler never receives it, the journal never gets an entry, and tasks that say "write down what you feel" complete with a single tap that captures nothing.

Additionally, the existing non-binary types (`duration`: 201, `scale`: 22, `count`: 15, `streak`: 5, `tally`: 2) have no differentiated UI either. A 30-minute duration task and a "did you do it?" task both get the same buttons.

The journal exists in the spec (`JournalView.tsx`, `DailyEntry.tsx`, test spec G9) but there's no bridge from task completion → journal entry. They're disconnected systems.

---

## The Fix: Completion-Type-Aware TaskCard

TaskCard reads `completion_type` and renders the appropriate capture UI instead of universal Done/Skip.

### Completion Type → UI Mapping

| completion_type | Current UI | New UI | Data Captured |
|---|---|---|---|
| `binary` | Done / Skip | Done / Skip (unchanged for pure binary) | boolean |
| `binary` + capture flag | Done / Skip | Done / Skip + inline capture field | boolean + structured data |
| `duration` | Done / Skip | Start Timer → auto-complete | boolean + actual_duration_seconds |
| `scale` | Done / Skip | Slider (1-10) + Done | numeric rating |
| `count` | Done / Skip | Counter (+/- buttons) + Done | numeric count |
| `tally` | Done / Skip | Tally counter + Done | numeric total |
| `streak` | Done / Skip | Done (streak auto-increments in backend) | boolean + streak_count |
| `log_entry` | **NEW** | Structured form fields + Submit | structured JSON |
| `reflect` | **NEW** | Text input + Submit | free text |
| `voice` | **NEW** | Record button → playback → Submit | audio blob URL |
| `photo` | **NEW** | Camera/file picker → preview → Submit | image URL |

---

## New Completion Types to Add

The CSV needs 4 new completion_type values. These don't replace existing types — they're assigned to the 42+ tasks currently mistyped as `binary` that actually need data capture, plus future tasks like the orgasm ledger.

### `log_entry`
**For:** Structured data the Handler needs to read (orgasm tracking, investment tracking, measurement tracking, baseline assessments).

**UI:** Inline form with fields defined by the task. Fields specified in a new CSV column `capture_fields` (JSON).

```
capture_fields: [
  {"key": "date", "type": "date", "default": "today"},
  {"key": "type", "type": "select", "options": ["full","ruined","hands-free","denied"]},
  {"key": "method", "type": "select", "options": ["prostate","penile","edging","other"]},
  {"key": "authorized", "type": "toggle", "label": "Authorized by Handler"},
  {"key": "arousal_before", "type": "slider", "min": 1, "max": 10},
  {"key": "arousal_after", "type": "slider", "min": 1, "max": 10},
  {"key": "notes", "type": "text", "optional": true}
]
```

**Stored as:** JSON in `task_completions.capture_data`

### `reflect`
**For:** Tasks that ask "write down," "journal," "note how you feel" — Handler reads the text to adapt prescriptions.

**UI:** Text area (2-4 lines visible, expandable). Placeholder text from the task's `subtext` field. Submit button.

**Stored as:** Text in `task_completions.capture_data.reflection` AND creates a linked `daily_entries` journal record.

### `voice`
**For:** Voice recording tasks (32 identified). "Record one sentence," "Record 5 affirmations," "Record a message to future-her."

**UI:** Record button → waveform animation while recording → Stop → Playback preview → Submit or Re-record.

**Stored as:** Audio blob uploaded to Supabase Storage → URL in `evidence` table with `evidence_type = 'recording'` AND `task_completions.capture_data.recording_url`.

### `photo`
**For:** Tasks that implicitly need photo evidence (selfies, mirror checks, outfit documentation). Note: many of the 170 keyword-matched "photo" tasks don't actually require photo capture — they reference looking in mirrors. Apply selectively.

**UI:** Camera button → capture/file picker → preview → optional caption → Submit.

**Stored as:** Image to Supabase Storage → URL in `evidence` table with `evidence_type = 'photo'` AND `task_completions.capture_data.photo_url`.

---

## Component Architecture

### Updated TaskCard.tsx

```
TaskCard
├── TaskHeader (instruction, subtext, points)
├── CompletionInput (branched by completion_type)
│   ├── BinaryInput          → Done / Skip
│   ├── DurationInput        → Timer with start/stop
│   ├── ScaleInput           → Slider + value display
│   ├── CountInput           → +/- counter
│   ├── TallyInput           → Running tally
│   ├── StreakInput           → Done (streak logic in backend)
│   ├── LogEntryInput        → Dynamic form from capture_fields
│   ├── ReflectInput         → Text area
│   ├── VoiceInput           → Record/playback
│   └── PhotoInput           → Camera/capture
├── SkipButton (always present)
└── TaskAffirmation (shown post-completion)
```

### CompletionInput.tsx (Router Component)

```tsx
interface CompletionInputProps {
  completionType: string;
  captureFields?: CaptureField[];  // from CSV for log_entry type
  targetCount?: number;            // from CSV for count type
  durationMinutes?: number;        // from CSV for duration type
  onComplete: (data: CompletionData) => void;
  onSkip: () => void;
}

type CompletionData = {
  completed: boolean;
  completion_type: string;
  actual_duration_seconds?: number;
  scale_value?: number;
  count_value?: number;
  capture_data?: Record<string, any>;
  recording_url?: string;
  photo_url?: string;
  reflection_text?: string;
};
```

### LogEntryInput.tsx

The key new component. Renders a dynamic form based on `capture_fields` JSON.

```tsx
interface CaptureField {
  key: string;
  type: 'text' | 'date' | 'select' | 'toggle' | 'slider' | 'number';
  label?: string;
  options?: string[];       // for select type
  min?: number;             // for slider/number
  max?: number;             // for slider/number
  default?: string;         // 'today' resolves to current date
  optional?: boolean;       // default false — field required
}
```

Renders each field inline within the TaskCard. No navigation away. No modal. She fills it in and taps Submit without leaving the Today View.

### ReflectInput.tsx

```tsx
// Minimal: text area with placeholder from subtext, Submit button
// Max 500 chars for quick reflections
// Submit creates:
//   1. task_completions record with capture_data.reflection
//   2. daily_entries record linked to this task (if journal integration enabled)
```

### DurationInput.tsx

```tsx
// Shows target duration from task
// Start button → running timer with elapsed display
// Can complete early (captures actual time)
// Auto-completes at target duration with haptic pulse
// Displays: "Target: 15:00 | Elapsed: 12:34"
```

---

## Database Changes

### task_completions table (extend)

```sql
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS
  capture_data JSONB DEFAULT NULL;

-- capture_data stores everything the new types collect:
-- {
--   "reflection": "free text from reflect type",
--   "recording_url": "https://...",
--   "photo_url": "https://...",
--   "fields": { "arousal_before": 7, "type": "hands-free", ... },
--   "actual_duration_seconds": 847,
--   "scale_value": 8,
--   "count_value": 12
-- }
```

### New CSV column: capture_fields

Added to `tasks_v2_full_6.csv` for `log_entry` type tasks only. JSON string defining the form fields.

For tasks typed `reflect`, `voice`, `photo` — no additional column needed. The type itself determines the UI.

---

## Migration Plan: Retyping Existing Tasks

42 tasks currently typed `binary` need retyping. Priority order:

### Batch 1: Immediate (reflect type)
These are the "write down" / "journal" tasks that lose the most value as binary:

- `reflect/inner_narrative`: "Write down 3 things that feel feminine" → `reflect`
- `practice/inner_narrative`: "Mask vs self journal" → `reflect`
- `condition/handler`: "Journal for the Handler" → `reflect`
- `practice/inner_narrative`: "Dream journaling" → `reflect`
- All tasks in category `reflect` or `write` that are currently `binary`

### Batch 2: High Value (voice type)
- `record/voice`: "Record day-zero voice" → `voice`
- `record/voice`: "Record one sentence" → `voice`
- `practice/inner_narrative`: "Affirmation recording" → `voice`
- `endgame/intimate`: "Record a voice message for future-her" → `voice`
- `normalize/intimate`: "Post-orgasm affirmation recording" → `voice`

### Batch 3: Tracking (log_entry type)
- `ratchet/irreversibility`: "Track investment" → `log_entry` with amount/item/date fields
- New task: "Orgasm control ledger" → `log_entry` with date/type/method/authorized/arousal fields
- `system` category tasks involving measurement → `log_entry`

### Batch 4: Audit remaining binary tasks
Run through all 965 binary tasks. Any that contain action verbs (log, record, write, track, note, measure, rate, compare, count) get evaluated for retyping.

---

## Handler Integration

The Handler currently gets `{ task_id, completed: true }` for every task. With this change:

```typescript
// What the Handler receives now:
{ task_id: "abc", completed: true }

// What the Handler receives after:
{
  task_id: "abc",
  completed: true,
  completion_type: "log_entry",
  capture_data: {
    fields: {
      date: "2026-02-19",
      type: "hands-free",
      method: "prostate",
      authorized: true,
      arousal_before: 8,
      arousal_after: 3,
      notes: ""
    }
  }
}
```

This feeds directly into:
- **Denial cycle tracker**: Handler reads orgasm log entries to know what day of the cycle she's on
- **Voice progress analytics**: Handler compares recordings over time
- **Journal sentiment analysis**: Handler reads reflections to calibrate prescriptions
- **Evidence accumulation**: Photos and recordings auto-populate the evidence gallery
- **Ratchet data**: Investment logs feed the sunk-cost display

---

## Implementation Priority

**Phase 1 (ship first):** `reflect` and `duration` types. Highest value, lowest complexity. Text area and timer are simple components. Covers ~240 tasks.

**Phase 2:** `log_entry` type with dynamic form renderer. Covers orgasm ledger and tracking tasks. Requires the `capture_fields` CSV column.

**Phase 3:** `voice` and `photo` types. Requires Supabase Storage integration and media handling. Covers ~32 voice tasks and selective photo tasks.

**Phase 4:** Retroactive CSV audit. Retype all 965 binary tasks that need it.

---

## Orgasm Control Ledger: Complete Task Spec

With this system built, here's the ledger task fully specified:

```
category: log
domain: intimate
level: 1
intensity: 1.0
instruction: "Open your ledger. Log your last orgasm: date, type, method, who controlled it."
steps: "1. Tap Log Entry | 2. Fill each field | 3. Submit"
subtext: "What gets measured gets managed. Her orgasms are data points in a system she handed control of."
completion_type: log_entry
capture_fields: [
  {"key":"date","type":"date","default":"today"},
  {"key":"type","type":"select","options":["full","ruined","hands-free","denied","sissygasm"]},
  {"key":"method","type":"select","options":["prostate","penile","edging","vibrator","partner","other"]},
  {"key":"authorized","type":"toggle","label":"Handler-authorized"},
  {"key":"arousal_before","type":"slider","min":1,"max":10},
  {"key":"arousal_after","type":"slider","min":1,"max":10},
  {"key":"denial_day","type":"number","label":"Day of denial cycle"},
  {"key":"notes","type":"text","optional":true}
]
duration_minutes: 2.0
points: 15
affirmation: "Every entry is proof she doesn't come without it being known."
is_core: TRUE
trigger_condition: "post_orgasm OR daily_checkin"
time_window: "any"
requires_privacy: FALSE
consequence_if_declined: "Untracked orgasms are unauthorized orgasms. The Handler remembers."
pivot_if_unable: "No orgasm to log? Log a denial entry instead. Date, day count, arousal level. The absence is data too."
```

The ledger lives in the app, in the TaskCard, captured inline. No Notes app workaround needed.
