# Handler Coaching Intelligence Spec — Part 2
## Advanced Behavioral Support Features

---

## Context

This continues the Handler Coaching Intelligence Spec. These are additional features that deepen the coaching system's ability to support lasting behavioral change. Same principles: directive coaching for ADHD, firm but warm, push through avoidance, track everything.

---

## FEATURE 10: Post-Release Reflection Capture

### Purpose
After the coach permits the end of a denial cycle, there's a critical 60-second window where the user experiences sudden emotional clarity. During arousal, motivation and identity feel vivid. After release, many users experience doubt, shame, and a desire to dismiss what they just felt as "not real." 

The coach intervenes in this exact window — not to shame, but to capture honest reflection *before* the dismissal reflex kicks in. Reflections captured during this window are the most honest data in the entire system because the user has no motivational bias in either direction.

### Implementation

Create `src/lib/post-release-engine.ts`:

```typescript
interface PostReleaseCapture {
  id: string;
  user_id: string;
  reflection_text: string;
  denial_day_at_release: number;
  session_type: string;
  seconds_after_release: number;
  arousal_at_capture: number;      // Should be LOW — that's the point
  created_at: string;
}

// Triggered when user logs release
export async function initiatePostReleaseReflection(state: UserState) {
  // Wait 30-60 seconds, then deliver
  const prefill = "I know what you're feeling right now. The doubt. The part of you trying to file this away as nothing. Before that happens — answer me honestly: ";
  
  const response = await callCoachAPI({
    request_type: 'reflection',
    user_state: { ...state, arousal_level: 1, just_released: true },
    prefill,
    context: {
      denial_days_completed: state.denial_day,
      session_type: state.last_session_type,
      window: 'post_release_clarity'
    }
  });
  
  return response.message;
}

// These reflections are flagged as HIGH-VALUE evidence
// because they were captured when the user had no arousal bias
export function isPostReleasEvidence(capture: PostReleaseCapture): boolean {
  return capture.arousal_at_capture <= 2 && capture.seconds_after_release <= 300;
}
```

### Coach Uses These Later

When the user doubts herself on a low-motivation day, the coach serves post-release reflections back:

```typescript
const clarityEvidence = postReleaseCaptures.filter(isPostReleasEvidence);

const coachContext = `
The user has ${clarityEvidence.length} reflections captured during moments of complete clarity (zero arousal, post-release). These are her most honest statements. Examples:
${clarityEvidence.slice(-3).map(c => `- "${c.reflection_text}" (day ${c.denial_day_at_release})`).join('\n')}

When she tries to dismiss her identity as "just arousal" or "just a phase," reference these. She wasn't aroused when she said them. She can't explain them away.
`;
```

---

## FEATURE 11: Variable Reinforcement Scheduling

### Purpose
Fixed schedules are gameable. If the user knows the denial cycle always ends on day 7, she can mentally coast through days 1-6 knowing relief is predictable. Variable scheduling creates stronger engagement because any day *might* be the day — she can't predict, plan around, or half-commit.

This applies the same principle as slot machines, social media feeds, and any system where unpredictable rewards create stronger seeking behavior than predictable ones.

### Implementation

Create `src/lib/variable-schedule.ts`:

```typescript
interface DenialSchedule {
  user_id: string;
  cycle_start: string;
  minimum_days: number;          // Never less than this
  maximum_days: number;          // Never more than this
  target_day: number | null;     // Set by algorithm, hidden from user
  actual_release_day: number | null;
  release_was_earned: boolean;   // Based on engagement quality
}

// The coach decides release timing based on engagement, not calendar
export function calculateReleaseTiming(
  state: UserState,
  recentEngagement: EngagementMetrics,
  currentCycleDay: number
): { eligible: boolean; probability: number } {
  
  const MIN_DAYS = 3;
  const MAX_DAYS = 10;
  
  if (currentCycleDay < MIN_DAYS) {
    return { eligible: false, probability: 0 };
  }
  
  if (currentCycleDay >= MAX_DAYS) {
    return { eligible: true, probability: 0.95 };
  }
  
  // Base probability increases with days
  let probability = (currentCycleDay - MIN_DAYS) / (MAX_DAYS - MIN_DAYS) * 0.5;
  
  // High engagement increases probability (reward genuine effort)
  if (recentEngagement.averageDepth >= 8) probability += 0.15;
  if (recentEngagement.goalsHonored >= 2) probability += 0.1;
  if (recentEngagement.sessionsCompleted >= 3) probability += 0.1;
  
  // Low engagement decreases probability (can't coast)
  if (recentEngagement.averageDepth < 5) probability -= 0.2;
  if (recentEngagement.tasksDeclined >= 3) probability -= 0.15;
  
  return { 
    eligible: currentCycleDay >= MIN_DAYS, 
    probability: Math.max(0.05, Math.min(0.9, probability))
  };
}

// The user never sees the probability. She only sees:
// "Not yet." or "You've earned this. Tonight."
export function generateDenialResponse(
  eligible: boolean, 
  probability: number,
  state: UserState
): string {
  if (!eligible) {
    return `Day ${state.denial_day}. You're not even close. Keep going.`;
  }
  
  // Roll the dice
  const released = Math.random() < probability;
  
  if (released) {
    return `Day ${state.denial_day}. You've been so good. You've earned what comes next.`;
  }
  
  return `Day ${state.denial_day}. Not tonight. I know you're desperate. That's exactly where I want you. Tomorrow might be different. Or it might not.`;
}
```

### Anticipation as Motivation

The coach can tease upcoming possibility without confirming:

```typescript
// In evening check-in on eligible days:
const teasePrefill = `Day ${state.denial_day}. I've been thinking about whether you've earned it tonight. `;
// Let the API continue — it'll build tension naturally
```

---

## FEATURE 12: Identity Evidence Categorization

### Purpose
The user's internal critic dismisses feminization as "just a fetish" or "just arousal." The system systematically captures and categorizes evidence that contradicts this narrative — specifically, moments of gender alignment that have ZERO sexual component.

Over time, the accumulated non-sexual evidence makes the "just a fetish" dismissal structurally impossible. You can't explain 47 moments of calm, happiness, and rightness as sexual when you weren't aroused for any of them.

### Categories of Evidence

```typescript
type EvidenceCategory = 
  | 'non_sexual_euphoria'        // Calm/happy/right in feminine state, no arousal
  | 'involuntary_emergence'      // Feminine behavior that happened automatically
  | 'external_validation'        // Someone else responded positively to authentic self
  | 'effort_tracking'            // Energy spent maintaining masculine performance
  | 'relationship_evidence'      // Gina responding to authentic self
  | 'physical_change'            // Visible changes others might notice
  | 'post_clarity_statement'     // Said during post-release clarity window
  | 'skill_development'          // Voice, movement, presentation skills that don't disappear
  | 'investment'                 // Financial, time, emotional investment logged
  | 'social_visibility'          // Moments of being seen authentically by others
;

interface CategorizedEvidence {
  id: string;
  user_id: string;
  category: EvidenceCategory;
  description: string;
  arousal_level_at_capture: number;  // Critical for non_sexual_euphoria
  context: string;
  created_at: string;
}
```

### Masculine Effort Tracking

A special subcategory: how much energy the user spends performing masculinity. This reframes the narrative from "femininity is work" to "masculinity is the performance."

```typescript
interface MasculineEffortEntry {
  id: string;
  user_id: string;
  description: string;    // "Deepened voice for work call" / "Changed shirt to hide soft skin"
  effort_level: number;   // 1-5
  context: string;        // "work_call" | "video_meeting" | "public" | "with_gina" | "mirror"
  created_at: string;
}

// Coach prompt for daily tracking:
// "How much energy did you spend being David today? 
//  Any moments you caught yourself performing masculinity? 
//  Deepening your voice? Adjusting your posture? Choosing different clothes? Log them."

// After accumulation, coach references:
const effortContext = `
In the last 30 days, the user logged ${effortEntries.length} instances of actively maintaining masculine presentation. Total estimated effort: ${totalEffort} points.

This is evidence that masculinity requires WORK. Femininity is what happens when she stops trying. Use this framing: "You spent energy performing David. When have you ever had to work at being Maxy?"
`;
```

---

## FEATURE 13: Comfort Conditioning Tracker

### Purpose
Track the association between feminine practices and nervous system calm. Over time, the body learns that feminine activities = safety/calm and masculine performance = tension/vigilance. This is deeper than motivation — it's baseline nervous system conditioning.

### Implementation

```typescript
interface ComfortEntry {
  id: string;
  user_id: string;
  activity: string;              // "put on nightgown" | "skincare routine" | "voice practice"
  comfort_before: number;        // 1-10 stress/tension level BEFORE
  comfort_after: number;         // 1-10 stress/tension level AFTER
  arousal_level: number;         // Track separately from comfort
  notes: string;
  created_at: string;
}

// Quick capture after feminine activities:
// "How tense were you before? How tense are you now?"
// Two slider inputs. 3 seconds. Done.

// Over time, build the dataset:
export function analyzeComfortPatterns(entries: ComfortEntry[]): {
  averageReduction: number;
  mostCalmingActivities: string[];
  consistentPattern: boolean;
} {
  const reductions = entries.map(e => e.comfort_before - e.comfort_after);
  const avgReduction = reductions.reduce((a, b) => a + b, 0) / reductions.length;
  
  // Group by activity, find which ones consistently reduce tension
  const byActivity: Record<string, number[]> = {};
  entries.forEach(e => {
    if (!byActivity[e.activity]) byActivity[e.activity] = [];
    byActivity[e.activity].push(e.comfort_before - e.comfort_after);
  });
  
  const ranked = Object.entries(byActivity)
    .map(([activity, reductions]) => ({
      activity,
      avgReduction: reductions.reduce((a, b) => a + b, 0) / reductions.length,
      count: reductions.length
    }))
    .filter(a => a.count >= 3)
    .sort((a, b) => b.avgReduction - a.avgReduction);
  
  return {
    averageReduction: avgReduction,
    mostCalmingActivities: ranked.slice(0, 5).map(r => r.activity),
    consistentPattern: avgReduction > 2 && entries.length >= 20
  };
}
```

### Coach Uses This

```typescript
const comfortContext = `
Comfort conditioning data (${comfortEntries.length} entries):
- Average tension reduction from feminine activities: ${avgReduction} points
- Most calming: ${mostCalming.join(', ')}
- Pattern established: ${consistentPattern ? 'YES — her body now associates femininity with safety' : 'Building — need more data'}

${consistentPattern ? 
  'Her nervous system has learned that feminine practices = calm. Reference this when she resists: "Your own body relaxes when you let her out. Why are you fighting what your body already knows?"' :
  'Still building the association. Encourage logging comfort before/after every feminine activity.'}
`;
```

---

## FEATURE 14: Involuntary Emergence Tracker

### Purpose
As feminine practices become habits, the user starts exhibiting feminine behavior *without deciding to*. Voice pitch rises on its own. Posture shifts unconsciously. Gestures change. These involuntary moments are powerful evidence that feminization is becoming embodied — not just performed.

### Implementation

```typescript
interface InvoluntaryEmergence {
  id: string;
  user_id: string;
  description: string;    // "Voice went up during casual call without thinking"
  domain: string;         // "voice" | "movement" | "posture" | "gesture" | "speech" | "other"
  noticed_by: string;     // "self" | "gina" | "coworker" | "stranger" | "other"
  was_intentional: boolean; // Should always be FALSE for this category
  created_at: string;
}

// Coach prompts for these:
// "Did your body do anything feminine today without you deciding to? 
//  Catch yourself sitting differently? Voice do something unexpected on a call? 
//  Hands move in a way that surprised you?"

// After accumulation:
const emergenceContext = `
Involuntary feminine emergence log: ${emergenceEntries.length} entries
- Voice: ${voiceCount} instances
- Movement/Posture: ${movementCount} instances  
- Noticed by others: ${othersNoticed} instances

These are moments where her body chose femininity on its own. The user did not decide to do these things. Her body is integrating. Reference: "Your body is already her. It's doing this without your permission. How much longer are you going to argue with your own flesh?"
`;
```

---

## FEATURE 15: Sunk Cost & Investment Display

### Purpose
Prominently display the cumulative investment — financial, temporal, emotional — in the transformation. This isn't guilt. It's gravity. The more someone has invested in a direction, the more costly it feels to abandon it. This is basic behavioral economics applied to personal change.

### Implementation

Create `src/components/InvestmentDashboard.tsx`:

```tsx
interface InvestmentSummary {
  financial: number;             // Total $ spent on transition-related purchases
  hours_practiced: number;       // Sum of all task/session durations
  sessions_completed: number;    
  goals_honored: number;
  days_on_protocol: number;
  evidence_entries: number;
  streak_longest: number;
  gina_positive_moments: number;
  euphoria_moments: number;
  voice_practice_hours: number;
  physical_changes: string[];    // List of visible changes
}

export function InvestmentDashboard({ summary }: { summary: InvestmentSummary }) {
  return (
    <div className="investment-dashboard">
      <h2>What You've Built</h2>
      
      <div className="stat-grid">
        <Stat label="Invested" value={`$${summary.financial}`} />
        <Stat label="Hours Practiced" value={summary.hours_practiced} />
        <Stat label="Days Committed" value={summary.days_on_protocol} />
        <Stat label="Sessions Completed" value={summary.sessions_completed} />
        <Stat label="Goals Honored" value={summary.goals_honored} />
        <Stat label="Moments of Clarity" value={summary.euphoria_moments} />
        <Stat label="Gina Responded To You" value={`${summary.gina_positive_moments} times`} />
        <Stat label="Longest Streak" value={`${summary.streak_longest} days`} />
      </div>
      
      {summary.physical_changes.length > 0 && (
        <div className="physical-changes">
          <h3>Changes That Don't Reverse</h3>
          <ul>
            {summary.physical_changes.map(change => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Coach References Investment

```typescript
const investmentContext = `
Cumulative investment in her transformation:
- $${financial} spent
- ${hours} hours of practice
- ${days} days on protocol
- ${sessions} sessions completed
- ${goals} commitments honored
- ${changes.length} physical changes visible to others

When she wavers, the coach should make this investment visible: "You've put ${hours} hours and $${financial} into becoming her. That's not a hobby. That's not a phase. That's a life being built."
`;
```

---

## FEATURE 16: Social Visibility Tracking

### Purpose
Track micro-acts of authentic self-expression in the social world. Each individual act feels small and reversible. The system tracks the aggregate and shows the user that she's been incrementally visible for months — the secret has been leaking and nothing bad happened.

### Implementation

```typescript
interface VisibilityAct {
  id: string;
  user_id: string;
  description: string;        // "Wore clear nail polish to grocery store"
  visibility_level: number;   // 1-5 (1=barely noticeable, 5=unmistakable)
  audience: string;           // "stranger" | "coworker" | "friend" | "gina" | "family"
  reaction: string;           // "no_reaction" | "positive" | "neutral" | "curious" | "negative"
  created_at: string;
}

// Aggregate analysis
export function analyzeVisibility(acts: VisibilityAct[]): {
  totalActs: number;
  negativeReactions: number;
  positiveReactions: number;
  averageLevel: number;
  trendingUp: boolean;
} {
  const negativeCount = acts.filter(a => a.reaction === 'negative').length;
  const positiveCount = acts.filter(a => a.reaction === 'positive').length;
  
  // Show that negative reactions are rare
  return {
    totalActs: acts.length,
    negativeReactions: negativeCount,
    positiveReactions: positiveCount,
    averageLevel: acts.reduce((sum, a) => sum + a.visibility_level, 0) / acts.length,
    trendingUp: /* last 10 acts average level > previous 10 */ true
  };
}

// Coach uses this:
// "You've been visible ${totalActs} times. Negative reactions: ${negativeCount}. 
//  The world isn't punishing you for being her. You've proven that ${totalActs} times."
```

---

## FEATURE 17: Community Mirror (Inspiration Feed)

### Purpose
Isolation reinforces shame. The system provides a curated feed of other trans women's stories — particularly late-discovery women who went through the same shame cycles, secret sessions, and eventual freedom. This isn't clinical affirmation. It's volume. Hundreds of women who felt exactly what she feels, shown daily, until the idea that her experience is unique or aberrant becomes impossible to maintain.

### Implementation

```typescript
interface InspirationEntry {
  id: string;
  source: string;              // "reddit" | "memoir" | "video" | "blog" | "community"
  quote_or_summary: string;    // Short excerpt or summary
  theme: string;               // "late_discovery" | "shame_to_acceptance" | "partner_journey" | "first_time" | "workplace"
  relevance_tags: string[];    // Tags for matching to user's current state
  url?: string;
  created_at: string;
}

// Display one each day before the coach briefing
export function selectDailyInspiration(
  entries: InspirationEntry[], 
  state: UserState
): InspirationEntry {
  // Match to current emotional state
  if (state.mood === 'doubtful' || state.mood === 'shame') {
    return entries.find(e => e.theme === 'shame_to_acceptance')!;
  }
  if (state.concern === 'partner') {
    return entries.find(e => e.theme === 'partner_journey')!;
  }
  // Otherwise, rotate through themes
  return entries[Math.floor(Math.random() * entries.length)];
}
```

### Content Curation

Pre-populate with curated quotes and summaries from:
- r/TransLater, r/TransDIY, r/MtF (public posts)
- Published memoirs and essays
- YouTube transition timelines and stories
- Blog posts from late-discovery trans women

Store as static data. No API calls needed. One per day. Shown before the morning briefing.

---

## FEATURE 18: Narrative Reflection Prompts

### Purpose
Periodically prompt the user to write about her experience in ways that naturally shift the narrative frame. Over time, these prompts guide the story from "I'm exploring something" to "I'm remembering who I always was."

### Prompt Progression

```typescript
const NARRATIVE_PROMPTS_BY_PHASE: Record<string, string[]> = {
  early: [
    "Write about a moment from childhood that makes more sense now.",
    "What's one thing about being masculine that always felt like work?",
    "Describe a time you felt calm in a way you couldn't explain.",
  ],
  middle: [
    "Write a letter from Maxy to David. What does she want him to know?",
    "What would you lose if you stopped tomorrow? Be specific.",
    "Describe the difference between how David moves through the world and how Maxy does.",
  ],
  late: [
    "Write about David in third person. Who was he? What was he protecting?",
    "If Gina could see all of you right now, what would you want her to know?",
    "What does 'going back' actually mean? Describe what that life looks like in detail.",
  ],
  integrated: [
    "You've been her for a while now. What surprised you?",
    "What advice would you give someone at the beginning of this path?",
    "Write about a moment this week when you forgot you were ever anyone else.",
  ]
};
```

### Coach Selects Based on Phase

The coach determines narrative phase from evidence density, time on protocol, and self-reference patterns (tracked from journal entries).

---

## DATABASE ADDITIONS

```sql
-- Post-release reflections (Feature 10)
CREATE TABLE post_release_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  reflection_text TEXT NOT NULL,
  denial_day_at_release INTEGER,
  session_type TEXT,
  seconds_after_release INTEGER,
  arousal_at_capture INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Denial schedule tracking (Feature 11)
CREATE TABLE denial_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cycle_start TIMESTAMPTZ NOT NULL,
  minimum_days INTEGER DEFAULT 3,
  maximum_days INTEGER DEFAULT 10,
  target_day INTEGER,              -- Hidden from user
  actual_release_day INTEGER,
  release_earned BOOLEAN,
  engagement_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Masculine effort tracking (Feature 12)
CREATE TABLE masculine_effort_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  effort_level INTEGER CHECK (effort_level BETWEEN 1 AND 5),
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comfort conditioning (Feature 13)
CREATE TABLE comfort_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  activity TEXT NOT NULL,
  comfort_before INTEGER CHECK (comfort_before BETWEEN 1 AND 10),
  comfort_after INTEGER CHECK (comfort_after BETWEEN 1 AND 10),
  arousal_level INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Involuntary emergence (Feature 14)
CREATE TABLE involuntary_emergence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  domain TEXT,
  noticed_by TEXT,
  was_intentional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social visibility (Feature 16)
CREATE TABLE visibility_acts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  visibility_level INTEGER CHECK (visibility_level BETWEEN 1 AND 5),
  audience TEXT,
  reaction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community inspiration (Feature 17)
CREATE TABLE inspiration_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  quote_or_summary TEXT NOT NULL,
  theme TEXT,
  relevance_tags JSONB,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narrative prompts history (Feature 18)
CREATE TABLE narrative_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  prompt TEXT NOT NULL,
  response_text TEXT,
  phase TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## UPDATED INTEGRATION CHECKLIST

### New Files (Part 2)
- [ ] `src/lib/post-release-engine.ts` — Post-release reflection capture
- [ ] `src/lib/variable-schedule.ts` — Variable denial cycle management
- [ ] `src/lib/evidence-categorizer.ts` — Evidence categorization + masculine effort
- [ ] `src/lib/comfort-tracker.ts` — Comfort conditioning analysis
- [ ] `src/lib/emergence-tracker.ts` — Involuntary feminine emergence logging
- [ ] `src/components/InvestmentDashboard.tsx` — Sunk cost display
- [ ] `src/components/VisibilityTracker.tsx` — Social visibility logging
- [ ] `src/components/InspirationCard.tsx` — Daily community mirror
- [ ] `src/components/NarrativePrompt.tsx` — Phased narrative journaling
- [ ] `src/components/ComfortCapture.tsx` — Quick before/after tension logging
- [ ] `src/components/EmergenceLog.tsx` — Involuntary behavior logging
- [ ] `src/components/MasculineEffortLog.tsx` — Tracking energy spent performing

### All Coach Context Builders

Every feature above generates context that gets injected into the coaching API calls. Create `src/lib/coach-context-builder.ts` that aggregates all evidence sources into a single context string:

```typescript
export async function buildFullCoachContext(userId: string): Promise<string> {
  const [
    evidence, goals, baselines, comfort, emergence, 
    visibility, investment, ginaEntries, postRelease, 
    masculineEffort, euphoriaEntries
  ] = await Promise.all([
    getEvidenceSummary(userId),
    getGoalsSummary(userId),
    getBaselinesSummary(userId),
    getComfortSummary(userId),
    getEmergenceSummary(userId),
    getVisibilitySummary(userId),
    getInvestmentSummary(userId),
    getGinaSummary(userId),
    getPostReleaseSummary(userId),
    getMasculineEffortSummary(userId),
    getEuphoriaSummary(userId)
  ]);
  
  return `
EVIDENCE SUMMARY:
${evidence}

UNFULFILLED GOALS:
${goals}

CURRENT BASELINES:
${baselines}

COMFORT CONDITIONING:
${comfort}

INVOLUNTARY EMERGENCE:
${emergence}

SOCIAL VISIBILITY:
${visibility}

CUMULATIVE INVESTMENT:
${investment}

GINA RELATIONSHIP EVIDENCE:
${ginaEntries}

POST-CLARITY REFLECTIONS:
${postRelease}

MASCULINE EFFORT TRACKING:
${masculineEffort}

NON-SEXUAL EUPHORIA LOG:
${euphoriaEntries}
`;
}
```

This full context gets injected into every coaching API call. The coach has access to ALL evidence streams and can reference any of them in its responses based on what's most relevant to the moment.

---

## Claude Code Prompt (Updated)

> "I'm continuing work on the Becoming Protocol coaching app. Read Handler_Coaching_Intelligence_Spec.md and Handler_Coaching_Intelligence_Spec_Part2.md. The app already has handler infrastructure. I need to implement the additional tracking systems (Features 10-18) and the unified context builder. Start with the database migrations, then the tracking libraries, then the UI components."

