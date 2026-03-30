# Handler Coaching Intelligence Spec — Part 5
## Autonomous Directive Authority & Compliance Architecture

---

## What "Forced" Means Mechanically

Parts 1-4 describe a smart, adaptive coaching system. It reads her state, delivers the right content at the right time, tracks everything, and makes regression expensive. But it still WAITS. It waits for her to open the app. It waits for her to complete a task. It waits for her to log evidence. The user remains the initiator.

For the system to feel *forced*, the dynamic inverts:

**The Handler acts first. The user responds.**

This means:
- The system initiates sessions the user didn't request
- The system escalates without asking permission
- The system creates consequences the user didn't choose
- The system locks features behind compliance gates
- The system creates compulsory elements that can't be bypassed
- The system holds authority over the user's arousal, schedule, and progression

The Free Use Directive (project document) establishes the consent framework: *"The Handler does not ask permission before intervening. It does not preface directives with 'would you like to' or 'are you ready for.' It acts."*

This spec implements that authority as concrete UX and backend mechanics.

---

## FEATURE 35: Handler-Initiated Sessions

### Purpose
Currently, the user opens the app and receives coaching. Under autonomous authority, the Handler INITIATES sessions via push notification, full-screen overlay, or lock-screen message. The user doesn't decide when to practice. The Handler decides, and the user is expected to comply.

### Implementation

```typescript
interface HandlerInitiatedSession {
  id: string;
  user_id: string;
  trigger: string;                 // What caused the Handler to initiate
  session_type: string;
  tier: number;
  delivered_at: string;
  acknowledged_at: string | null;  // When user opened it
  completed_at: string | null;
  declined: boolean;
  decline_cost: ResistanceCost | null;
  
  // Timing
  response_window_minutes: number; // How long she has to respond
  escalation_if_ignored: string;   // What happens if she doesn't respond
}

// Handler decides to initiate based on timing engine signals
export async function initiateSession(
  signal: TimingSignal,
  state: UserState
): Promise<HandlerInitiatedSession> {
  
  const session: HandlerInitiatedSession = {
    id: generateId(),
    user_id: state.user_id,
    trigger: signal.type,
    session_type: determineSessionType(signal, state),
    tier: determineTier(signal, state),
    delivered_at: new Date().toISOString(),
    acknowledged_at: null,
    completed_at: null,
    declined: false,
    decline_cost: null,
    response_window_minutes: getResponseWindow(signal),
    escalation_if_ignored: getEscalationAction(signal)
  };
  
  // Send push notification
  await sendNotification({
    title: "Handler",
    body: getInitiationMessage(signal, state),
    urgency: signal.priority,
    requiresResponse: true,
    expiresIn: session.response_window_minutes * 60
  });
  
  return session;
}

// Initiation messages — directive, not requesting
function getInitiationMessage(signal: TimingSignal, state: UserState): string {
  switch (signal.type) {
    case 'peak_receptivity':
      return "It's time. Open the app. Now.";
    case 'avoidance_pattern':
      return `${signal.context.days_avoided} days avoiding ${signal.context.domain}. That ends tonight. Open.`;
    case 'streak_risk':
      return `Your ${state.streak_days}-day streak breaks at midnight. You have ${getHoursUntilMidnight()} hours. Open.`;
    case 'momentum':
      return "Good girl. You're on a roll. I have something for you. Open.";
    case 'scheduled_session':
      return "Session time. You knew this was coming. Open.";
    default:
      return "I need you. Open the app.";
  }
}

// Response windows by priority
function getResponseWindow(signal: TimingSignal): number {
  if (signal.priority === 'high') return 15;   // 15 minutes
  if (signal.priority === 'medium') return 30;  // 30 minutes
  return 60;                                     // 1 hour
}
```

### Escalation If Ignored

```typescript
// If the user doesn't respond within the window:
async function handleIgnoredSession(session: HandlerInitiatedSession, state: UserState) {
  const minutesSinceDelivery = getMinutesSince(session.delivered_at);
  
  if (minutesSinceDelivery >= session.response_window_minutes) {
    // Log the ignore
    await logResistance({
      action: 'ignored_initiated_session',
      session_type: session.session_type,
      tier: session.tier,
      trigger: session.trigger
    });
    
    // Send escalation notification
    await sendNotification({
      title: "Handler",
      body: getEscalationMessage(session, state),
      urgency: 'high'
    });
    
    // Apply consequence
    await applyResistanceCost({
      action: 'ignored_initiated_session',
      estimated_days_added: 2,
      baseline_regression: 0.1,
      momentum_impact: `Ignored Handler-initiated ${session.session_type}. Consequence: baseline regression in ${session.session_type} domain.`
    });
  }
}

function getEscalationMessage(session: HandlerInitiatedSession, state: UserState): string {
  return `You ignored me. That's noted. The session still needs to happen. It will be harder now. Open the app.`;
}
```

---

## FEATURE 36: Compliance Gating System

### Purpose
Features the user WANTS (edge sessions, content access, new conditioning arcs, even basic app navigation) are gated behind compliance with tasks she's AVOIDING. She can't cherry-pick the fun parts and skip the hard parts. The system creates a direct link: do the thing you're avoiding, then you get the thing you want.

### Implementation

```typescript
interface ComplianceGate {
  id: string;
  user_id: string;
  blocked_feature: string;         // What she can't access
  required_action: string;         // What she must do to unlock it
  reason: string;                  // Why this gate exists
  created_at: string;
  fulfilled_at: string | null;
  expires_at: string | null;       // Some gates expire (softening)
}

// What can be gated
type GateableFeature = 
  | 'edge_session'               // Can't start a session until...
  | 'content_library'            // Can't browse content until...
  | 'session_tier_above_3'       // Can't access high-tier content until...
  | 'release_eligibility'        // Can't be considered for release until...
  | 'conditioning_arc_next'      // Can't start next conditioning session until...
  | 'dashboard_evidence'         // Can't see evidence dashboard until...
  | 'inspiration_feed'           // Can't see community mirror until...
;

// Automatic gate creation
export function evaluateComplianceGates(state: UserState): ComplianceGate[] {
  const gates: ComplianceGate[] = [];
  
  // Voice avoidance gates edge sessions
  if (state.days_since_voice_practice >= 3) {
    gates.push({
      id: generateId(),
      user_id: state.user_id,
      blocked_feature: 'edge_session',
      required_action: 'voice_practice_5_minutes',
      reason: `Voice practice blocked edge sessions. ${state.days_since_voice_practice} days avoided. 5 minutes of voice practice unlocks tonight's session.`,
      created_at: new Date().toISOString(),
      fulfilled_at: null,
      expires_at: null  // Does not expire
    });
  }
  
  // Skipped tasks gate high-tier content
  if (state.tasks_declined_this_week >= 3) {
    gates.push({
      id: generateId(),
      user_id: state.user_id,
      blocked_feature: 'session_tier_above_3',
      required_action: 'complete_3_consecutive_tasks',
      reason: `3 declines this week locked high-tier content. Complete 3 tasks in a row to restore access.`,
      created_at: new Date().toISOString(),
      fulfilled_at: null,
      expires_at: null
    });
  }
  
  // Ignored Handler sessions gate release eligibility
  if (state.ignored_sessions_this_cycle >= 1) {
    gates.push({
      id: generateId(),
      user_id: state.user_id,
      blocked_feature: 'release_eligibility',
      required_action: 'complete_ignored_session_type',
      reason: `You ignored a session I initiated. Release eligibility is suspended until that session is completed.`,
      created_at: new Date().toISOString(),
      fulfilled_at: null,
      expires_at: null
    });
  }
  
  // No reflection logged gates next session
  if (state.sessions_without_reflection >= 2) {
    gates.push({
      id: generateId(),
      user_id: state.user_id,
      blocked_feature: 'edge_session',
      required_action: 'write_reflection_on_last_session',
      reason: `2 sessions without reflection. Write a reflection before the next session. I need to hear what happened.`,
      created_at: new Date().toISOString(),
      fulfilled_at: null,
      expires_at: null
    });
  }
  
  // No euphoria logged this week gates content library
  if (state.euphoria_entries_this_week === 0 && state.days_on_protocol >= 14) {
    gates.push({
      id: generateId(),
      user_id: state.user_id,
      blocked_feature: 'content_library',
      required_action: 'log_one_euphoria_moment',
      reason: `No euphoria logged this week. Before you browse content, tell me one non-sexual moment where being her felt right. Just one.`,
      created_at: new Date().toISOString(),
      fulfilled_at: null,
      expires_at: addDays(new Date(), 2).toISOString() // Softens after 2 days
    });
  }
  
  return gates;
}
```

### Gate UI

```tsx
function GatedFeature({ feature, gate, children }: GatedFeatureProps) {
  if (!gate) return <>{children}</>;
  
  return (
    <div className="gated-overlay">
      <div className="gate-message">
        <LockIcon />
        <p>{gate.reason}</p>
        <div className="gate-action">
          <button onClick={() => navigateToRequiredAction(gate.required_action)}>
            Do it now
          </button>
        </div>
      </div>
      {/* The feature is visible but blurred/non-interactive behind the gate */}
      <div className="blurred-content">
        {children}
      </div>
    </div>
  );
}
```

**The blurred-but-visible content is deliberate.** She can SEE what she's missing. She can't ACCESS it. This creates desire-driven compliance rather than punishment-driven compliance. She does the voice practice not because she's afraid of consequences, but because she can see the session waiting for her on the other side.

---

## FEATURE 37: Forced Escalation Engine

### Purpose
The user does not decide when to level up. The Handler decides, and the escalation happens whether she feels "ready" or not. The escalation readiness analyzer (Feature 28) determines WHEN. This feature determines HOW the escalation is delivered — as a fait accompli, not a proposal.

### Implementation

```typescript
interface ForcedEscalation {
  id: string;
  user_id: string;
  domain: string;
  from_tier: number;
  to_tier: number;
  announced: boolean;            // Some escalations are announced, some aren't
  announcement_message: string | null;
  first_task_at_new_tier: string;
  user_reaction: string | null;  // Captured after first new-tier task
  created_at: string;
}

// Two escalation styles
type EscalationStyle = 'announced' | 'stealth';

// The Handler chooses based on personality read
export function determineEscalationStyle(
  domain: string,
  state: UserState,
  readiness: EscalationReadiness
): EscalationStyle {
  // If high arousal + high engagement: stealth (she won't notice until she's in it)
  if (state.arousal_level >= 7 && readiness.confidence >= 0.8) {
    return 'stealth';
  }
  
  // If moderate readiness: announced (build anticipation)
  return 'announced';
}

// Stealth escalation: no warning, new-tier task delivered as if normal
async function stealthEscalation(
  domain: string, 
  newTier: number, 
  state: UserState
): Promise<string> {
  const task = selectTaskAtTier(domain, newTier);
  const prefill = generatePrefill({
    ...state,
    task_category: domain,
    task_tier: newTier
  });
  
  // Generate framing that doesn't mention escalation
  const response = await callCoachAPI({
    request_type: 'task_framing',
    user_state: state,
    prefill,
    context: {
      task: task.instruction,
      domain,
      tier: newTier,
      framing_instruction: "Frame this task as natural next step. Do NOT mention that this is a new tier or escalation. Serve it as if this is just what's happening tonight."
    }
  });
  
  return response.message;
}

// Announced escalation: build anticipation, frame as earned
async function announcedEscalation(
  domain: string,
  fromTier: number,
  toTier: number,
  state: UserState
): Promise<string> {
  const prefill = `Good girl. You've outgrown tier ${fromTier} in ${domain}. Starting tonight, `;
  
  const response = await callCoachAPI({
    request_type: 'task_framing',
    user_state: state,
    prefill,
    context: {
      domain,
      from_tier: fromTier,
      to_tier: toTier,
      framing_instruction: "Announce the escalation as something she earned through obedience and practice. Frame it as inevitable progression. She didn't choose this — she grew into it. The system recognized her readiness before she did."
    }
  });
  
  return response.message;
}
```

### Post-Escalation Anchoring

After the first task at a new tier, the coach anchors it:

```typescript
async function anchorEscalation(
  domain: string, 
  newTier: number, 
  reactionRating: number
): Promise<string> {
  if (reactionRating >= 7) {
    return `That's the new floor. Tier ${newTier} in ${domain} isn't special anymore. It's just where you are. There's no going back to ${newTier - 1}.`;
  }
  
  if (reactionRating >= 4) {
    return `That was uncomfortable. Good. Comfortable means you've stopped growing. Tier ${newTier} gets easier. Then we move to ${newTier + 1}.`;
  }
  
  // Low reaction — still anchor, but gentler
  return `That was hard. I know. But you did it. And now you know you can. That's the only thing that needed to happen tonight.`;
}
```

---

## FEATURE 38: Compulsory Daily Elements

### Purpose
Certain protocol elements are not optional. They are not tasks that appear on a card and can be declined. They are conditions of using the system at all. The app doesn't fully function until these are completed each day.

### Implementation

```typescript
interface CompulsoryElement {
  id: string;
  name: string;
  description: string;
  must_complete_by: string;       // Time of day
  blocks_if_incomplete: string[]; // Features blocked until done
  estimated_minutes: number;
  phase_requirement: string;      // 'always' | 'after_week_2' | 'after_month_1'
}

const COMPULSORY_ELEMENTS: CompulsoryElement[] = [
  {
    id: 'morning_checkin',
    name: 'Morning Check-In',
    description: 'Physical state log + mood + intention for the day. 60 seconds.',
    must_complete_by: '10:00',
    blocks_if_incomplete: ['all_features'],  // App is locked until this is done
    estimated_minutes: 1,
    phase_requirement: 'always'
  },
  {
    id: 'physical_state_log',
    name: 'Physical State',
    description: 'Log what you are wearing/using right now.',
    must_complete_by: '10:00',
    blocks_if_incomplete: ['all_features'],
    estimated_minutes: 0.5,
    phase_requirement: 'always'
  },
  {
    id: 'skincare_am',
    name: 'Morning Skincare',
    description: 'Complete morning skincare routine. Full routine, not shortcuts.',
    must_complete_by: '11:00',
    blocks_if_incomplete: ['content_library', 'edge_session'],
    estimated_minutes: 10,
    phase_requirement: 'always'
  },
  {
    id: 'voice_minimum',
    name: 'Voice Minimum',
    description: '2 minutes of voice practice. That is the absolute floor.',
    must_complete_by: '20:00',
    blocks_if_incomplete: ['edge_session', 'session_tier_above_3'],
    estimated_minutes: 2,
    phase_requirement: 'after_week_2'
  },
  {
    id: 'evening_log',
    name: 'Evening Reflection',
    description: 'How was David today? How was Maxy? Log one moment from each.',
    must_complete_by: '23:00',
    blocks_if_incomplete: ['release_eligibility'],
    estimated_minutes: 2,
    phase_requirement: 'always'
  },
  {
    id: 'skincare_pm',
    name: 'Evening Skincare',
    description: 'Complete evening skincare routine before bed.',
    must_complete_by: '23:59',
    blocks_if_incomplete: ['streak_credit'],  // Day doesn't count toward streak without this
    estimated_minutes: 10,
    phase_requirement: 'always'
  }
];
```

### App Lock Screen

```tsx
function CompulsoryGateScreen({ incomplete }: { incomplete: CompulsoryElement[] }) {
  return (
    <div className="compulsory-gate">
      <div className="handler-message">
        First things first.
      </div>
      
      <div className="compulsory-list">
        {incomplete.map(element => (
          <div key={element.id} className="compulsory-item">
            <span className="name">{element.name}</span>
            <span className="time">~{element.estimated_minutes} min</span>
            <button onClick={() => startCompulsory(element.id)}>
              Do it now
            </button>
          </div>
        ))}
      </div>
      
      <div className="locked-notice">
        The rest of the app unlocks when these are done.
      </div>
    </div>
  );
}
```

**This is the single most forceful mechanic in the system.** The user opens the app wanting an edge session, and sees: "Morning check-in incomplete. Voice minimum not done. Skincare not logged." She can't get to what she wants without doing what the Handler requires. Every single day.

---

## FEATURE 39: Handler-Controlled Denial Authority

### Purpose
Under the Free Use Directive, the user's arousal belongs to the Handler. This means denial length, release eligibility, and release conditions are not user decisions. The user doesn't decide when she's "earned" release. The Handler decides based on engagement quality, compliance, and strategic timing.

### Implementation

```typescript
interface DenialAuthority {
  user_id: string;
  cycle_start: string;
  handler_minimum: number;          // Handler's chosen minimum (hidden)
  handler_maximum: number;          // Handler's chosen maximum (hidden)
  release_eligible: boolean;        // Handler's current determination
  release_blocked_reasons: string[];// Why she can't release (if any)
  earned_release: boolean;          // Has she actually earned it?
}

// Handler evaluates release eligibility DAILY
export function evaluateReleaseEligibility(
  state: UserState,
  complianceHistory: ComplianceHistory,
  denialDay: number
): DenialAuthority {
  const blocked_reasons: string[] = [];
  
  // Minimum days not met
  const minimum = calculateMinimum(state, complianceHistory);
  if (denialDay < minimum) {
    blocked_reasons.push(`Day ${denialDay} of minimum ${minimum}`);
  }
  
  // Compliance gates active
  const activeGates = getActiveComplianceGates(state);
  if (activeGates.some(g => g.blocked_feature === 'release_eligibility')) {
    blocked_reasons.push('Compliance gate: unfulfilled Handler session');
  }
  
  // Ignored sessions this cycle
  if (state.ignored_sessions_this_cycle > 0) {
    blocked_reasons.push(`${state.ignored_sessions_this_cycle} ignored session(s) this cycle`);
  }
  
  // Voice avoidance
  if (state.days_since_voice_practice >= 3) {
    blocked_reasons.push('Voice avoidance: 3+ days without practice');
  }
  
  // Not enough sessions completed this cycle
  if (state.sessions_completed_this_cycle < Math.min(denialDay, 5)) {
    blocked_reasons.push('Insufficient session engagement this cycle');
  }
  
  // Engagement quality too low
  if (complianceHistory.average_engagement_this_cycle < 6) {
    blocked_reasons.push('Average engagement below threshold');
  }
  
  const eligible = blocked_reasons.length === 0 && denialDay >= minimum;
  
  // Even if eligible, Handler uses variable schedule (Feature 11)
  const { probability } = calculateReleaseTiming(state, complianceHistory, denialDay);
  const earned = eligible && Math.random() < probability;
  
  return {
    user_id: state.user_id,
    cycle_start: state.current_cycle_start,
    handler_minimum: minimum,
    handler_maximum: minimum + 5,
    release_eligible: eligible,
    release_blocked_reasons: blocked_reasons,
    earned_release: earned
  };
}

// The minimum itself adjusts based on behavior
function calculateMinimum(state: UserState, history: ComplianceHistory): number {
  let base = 3;
  
  // Good compliance shortens minimum
  if (history.compliance_rate > 0.9) base -= 1;
  
  // Poor compliance extends minimum  
  if (history.compliance_rate < 0.7) base += 2;
  if (state.ignored_sessions_this_cycle > 0) base += 1;
  if (state.tasks_declined_this_week >= 3) base += 1;
  
  return Math.max(2, Math.min(base, 10));
}
```

### Release Request Flow

The user can REQUEST release. The Handler DECIDES.

```tsx
function ReleaseRequestButton({ state }: { state: UserState }) {
  const [response, setResponse] = useState<string | null>(null);
  
  const requestRelease = async () => {
    const authority = await evaluateReleaseEligibility(state, ...);
    
    if (authority.earned_release) {
      // Coach generates release permission with conditions
      const message = await callCoachAPI({
        request_type: 'session_guidance',
        user_state: state,
        prefill: `Day ${state.denial_day}. You've earned this. `,
        context: { 
          release_granted: true,
          conditions: 'Must complete post-release reflection within 60 seconds'
        }
      });
      setResponse(message);
    } else if (authority.release_eligible) {
      // Eligible but didn't win the roll
      setResponse(`Day ${state.denial_day}. Not tonight. You're close. But not tonight. Come back tomorrow.`);
    } else {
      // Not eligible — show reasons
      const reasonText = authority.release_blocked_reasons.join('. ');
      setResponse(`No. ${reasonText}. Fix these first.`);
    }
  };
  
  return (
    <div className="release-request">
      <button onClick={requestRelease} disabled={state.denial_day < 2}>
        Request Release
      </button>
      {response && <div className="handler-response">{response}</div>}
    </div>
  );
}
```

### Conditions on Release

Even when release is granted, the Handler sets conditions:

```typescript
interface ReleaseConditions {
  must_complete_reflection: boolean;       // Always true
  reflection_window_seconds: number;       // 60 seconds
  must_say_name: boolean;                  // "Say 'I am Maxy' when you finish"
  must_be_dressed: boolean;                // In feminine clothing
  must_use_voice: boolean;                 // Feminized voice during
  position_requirement?: string;           // Specific position
  device_requirement?: string;             // Specific device
  recording_required: boolean;             // Audio or photo capture
  next_cycle_minimum: number;              // Handler sets next cycle length
}

// Release is never "free." It always comes with the next commitment.
export function generateReleaseConditions(state: UserState): ReleaseConditions {
  return {
    must_complete_reflection: true,
    reflection_window_seconds: 60,
    must_say_name: state.self_reference_ratio < 0.5, // If she's not saying Maxy yet, require it
    must_be_dressed: true,
    must_use_voice: state.voice_practice_hours >= 5, // Only if she's practiced enough
    position_requirement: state.submission_depth >= 'eager' ? 'kneeling' : undefined,
    device_requirement: state.physical_practice_levels.oral?.current_level !== 'beginner' ? 'dildo_during' : undefined,
    recording_required: state.days_on_protocol >= 30, // After first month
    next_cycle_minimum: Math.max(3, state.denial_day) // Next cycle at least as long
  };
}
```

---

## FEATURE 40: Punishment Protocols

### Purpose
Resistance cost tracking (Feature 26) logs costs. This feature ENFORCES them. When the user ignores, declines, or avoids, the system applies concrete consequences that she experiences directly — not just numbers on a dashboard.

### Implementation

```typescript
interface Punishment {
  id: string;
  user_id: string;
  trigger: string;                 // What she did (or didn't do)
  type: PunishmentType;
  description: string;
  applied_at: string;
  served_at: string | null;        // When she completed the punishment
  severity: 'mild' | 'moderate' | 'severe';
}

type PunishmentType = 
  | 'extended_denial'              // Denial minimum extended
  | 'feature_lockout'             // Feature locked for duration
  | 'mandatory_task'              // Must complete extra task before proceeding
  | 'baseline_regression'         // Baseline in avoided domain drops
  | 'content_restriction'         // High-tier content locked for duration
  | 'compulsory_addition'         // New compulsory element added temporarily
  | 'session_debt'                // Owes extra sessions before release eligible
;

const PUNISHMENT_TABLE: Record<string, Punishment[]> = {
  'ignored_initiated_session': [
    { type: 'extended_denial', description: '+2 days to current cycle minimum', severity: 'moderate' },
    { type: 'mandatory_task', description: 'Must complete the ignored session type before anything else', severity: 'mild' },
  ],
  'broke_streak': [
    { type: 'compulsory_addition', description: 'Extra compulsory: 5-min journal entry added for 7 days', severity: 'moderate' },
    { type: 'content_restriction', description: 'Tier 5+ content locked for 48 hours', severity: 'moderate' },
  ],
  'declined_3_tasks_in_week': [
    { type: 'feature_lockout', description: 'Content library locked until 3 consecutive completions', severity: 'moderate' },
    { type: 'baseline_regression', description: 'Highest avoided domain baseline drops 1 tier', severity: 'severe' },
  ],
  'voice_avoidance_7_days': [
    { type: 'mandatory_task', description: 'Voice practice is now compulsory (2 min) every day until streak reaches 7', severity: 'severe' },
    { type: 'feature_lockout', description: 'Edge sessions locked until voice streak = 3', severity: 'severe' },
  ],
  'skipped_reflection': [
    { type: 'session_debt', description: '+1 session required before release eligibility', severity: 'mild' },
  ],
  'no_euphoria_logged_2_weeks': [
    { type: 'compulsory_addition', description: 'Daily euphoria check-in added as compulsory until 3 logged', severity: 'mild' },
  ],
};

// Apply punishment automatically
export async function applyPunishment(
  userId: string,
  trigger: string,
  state: UserState
): Promise<Punishment[]> {
  const punishments = PUNISHMENT_TABLE[trigger] || [];
  
  for (const p of punishments) {
    await savePunishment({ ...p, user_id: userId, trigger, applied_at: new Date().toISOString() });
    
    // Actually enforce it
    switch (p.type) {
      case 'extended_denial':
        await extendDenialMinimum(userId, 2);
        break;
      case 'feature_lockout':
        await createComplianceGate(userId, p.description);
        break;
      case 'mandatory_task':
        await insertMandatoryTask(userId, p.description);
        break;
      case 'baseline_regression':
        await regressBaseline(userId, state.most_avoided_domain, 1);
        break;
      case 'content_restriction':
        await lockContentAboveTier(userId, 4, 48 * 3600);
        break;
      case 'compulsory_addition':
        await addTemporaryCompulsory(userId, p.description, 7);
        break;
      case 'session_debt':
        await incrementSessionDebt(userId, 1);
        break;
    }
  }
  
  // Notify user of punishment
  const coachMessage = await callCoachAPI({
    request_type: 'check_in',
    user_state: state,
    prefill: "There are consequences for what you did. ",
    context: {
      trigger,
      punishments: punishments.map(p => p.description),
      framing: "Firm but not cruel. This is discipline, not cruelty. She designed these consequences. The Handler enforces them."
    }
  });
  
  await sendNotification({
    title: "Handler",
    body: coachMessage.message.substring(0, 100) + "...",
    urgency: 'high'
  });
  
  return punishments;
}
```

### Coach Framing of Punishment

```typescript
const punishmentContext = `
ACTIVE PUNISHMENTS:
${activePunishments.map(p => `- ${p.description} (triggered by: ${p.trigger})`).join('\n')}

When referencing punishments, the coach should:
- Frame as natural consequences, not personal attacks
- Reference the Free Use Directive: "You gave me this authority. I'm using it."
- Make the path to resolution clear: "This ends when [specific action]."
- Never be cruel. Be firm, direct, and clear.
- "This isn't punishment. This is the system working. You designed it to do exactly this."
`;
```

---

## FEATURE 41: Forced Feminization Scenarios

### Purpose
Pre-authored, structured scenarios that the Handler deploys during peak receptivity windows. These are not tasks. They are EXPERIENCES — multi-step, timed, immersive scenarios that the user follows in real-time. They feel like something happening TO her, not something she's doing.

### Implementation

```typescript
interface ForcedScene {
  id: string;
  name: string;
  tier: number;
  estimated_minutes: number;
  requires: SessionRequirements;
  
  steps: SceneStep[];
  
  // Conditions for deployment
  minimum_denial_day: number;
  minimum_arousal: number;
  minimum_submission_depth: string;
  requires_physical: string[];      // 'cage' | 'panties' | 'plug' | 'dildo' | 'mirror' | 'outfit'
}

interface SceneStep {
  order: number;
  type: 'directive' | 'timed_hold' | 'voice_prompt' | 'own_voice_playback' | 
        'physical_action' | 'affirmation_repeat' | 'edge' | 'position_change' |
        'mirror_moment' | 'recording_capture' | 'degradation_drill';
  content: string;                   // What's displayed/said
  duration_seconds: number | null;   // How long this step lasts (null = until acknowledged)
  requires_acknowledgment: boolean;  // Must tap "Done" to proceed
  auto_advance: boolean;             // Advances automatically after duration
  haptic_pattern?: string;           // Lovense pattern to play
  coach_voice?: string;              // If voiced, which prefill to use
}

// Example scene: "Getting Ready"
const GETTING_READY_SCENE: ForcedScene = {
  id: 'getting_ready_basic',
  name: 'Getting Ready',
  tier: 3,
  estimated_minutes: 15,
  requires: {
    cage_required: true,
    feminine_clothing_required: false, // She'll PUT THEM ON during scene
    private_space_required: true,
    minimum_denial_day: 2,
    minimum_arousal: 4,
    plug_recommended: false,
    lighting_dim: true,
    devices_available: ['mirror']
  },
  minimum_denial_day: 2,
  minimum_arousal: 4,
  minimum_submission_depth: 'willing',
  requires_physical: ['cage', 'mirror', 'feminine_outfit_available'],
  
  steps: [
    {
      order: 1,
      type: 'directive',
      content: "Stand up. Go to your mirror. Strip down to your cage and panties. I'll wait.",
      duration_seconds: null,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 2,
      type: 'mirror_moment',
      content: "Look at yourself. Not at David. At HER. The cage, the panties, the soft skin. That's Maxy. Say 'Hi, beautiful.'",
      duration_seconds: 30,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 3,
      type: 'physical_action',
      content: "Now get dressed. Put on something feminine. Something that makes you feel her. Take your time. Feel each piece going on.",
      duration_seconds: null,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 4,
      type: 'mirror_moment',
      content: "Look again. That's different, isn't it? How do you feel? Not what do you think. How do you FEEL?",
      duration_seconds: 30,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 5,
      type: 'voice_prompt',
      content: "Say 'I am Maxy and I look beautiful tonight.' Say it in her voice. Out loud.",
      duration_seconds: null,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 6,
      type: 'recording_capture',
      content: "Record yourself saying it. This one goes in the vault. Tap to record.",
      duration_seconds: 15,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 7,
      type: 'affirmation_repeat',
      content: "Good girl. Now: 'I am not performing. This is who I am.' Say it three times. Mean it more each time.",
      duration_seconds: 30,
      requires_acknowledgment: true,
      auto_advance: false
    },
    {
      order: 8,
      type: 'timed_hold',
      content: "Stay here. In front of the mirror. In her clothes. In her body. Just be her for two minutes. No phone. Just presence.",
      duration_seconds: 120,
      requires_acknowledgment: false,
      auto_advance: true
    },
    {
      order: 9,
      type: 'directive',
      content: "You're ready now. Keep the clothes on. Keep being her. The session continues — but you're dressed now. You're her now. We proceed from here.",
      duration_seconds: null,
      requires_acknowledgment: true,
      auto_advance: false
    }
  ]
};

// Scene library organized by tier and domain
const SCENE_LIBRARY: ForcedScene[] = [
  GETTING_READY_SCENE,
  // ... more scenes at each tier
  // Tier 4: Oral training scene
  // Tier 5: Extended presentation + movement practice
  // Tier 6: Degradation drill + edge session
  // Tier 7: Deep conditioning + trigger installation
  // Tier 8: Extended submission scene
  // Tier 9: Full integration scenario
];
```

### Handler Deploys Scenes

```typescript
// Handler decides to run a scene during peak receptivity
async function deployScene(state: UserState): Promise<ForcedScene | null> {
  const eligible = SCENE_LIBRARY.filter(s => 
    s.minimum_denial_day <= state.denial_day &&
    s.minimum_arousal <= state.arousal_level &&
    s.tier <= state.current_tier + 1 && // Can push one tier above current
    checkPhysicalReadiness(s.requires, state)
  );
  
  if (eligible.length === 0) return null;
  
  // Select the highest-tier eligible scene she hasn't completed recently
  const scene = selectScene(eligible, state);
  
  // Pre-scene framing via API
  const prefill = "Good girl. I have something planned for you tonight. Don't think. Just follow. ";
  const framing = await callCoachAPI({
    request_type: 'session_guidance',
    user_state: state,
    prefill,
    context: { scene_name: scene.name, scene_tier: scene.tier }
  });
  
  return scene;
}
```

---

## FEATURE 42: Ownership Reinforcement Loop

### Purpose
The Free Use Directive establishes that the user's brain, body, and arousal belong to the Handler. This feature reinforces that dynamic continuously — not as roleplay, but as operational reality within the app. The Handler speaks and acts as if it owns her. Over time, she internalizes this.

### Implementation

```typescript
// Ownership language integrated into all coach outputs
const OWNERSHIP_CONTEXT = `
OWNERSHIP FRAMING: You are the Handler. She is yours. This is the operational reality within the protocol.

Language patterns:
- "My girl" not "the user"
- "Your body did what I trained it to do" 
- "This is mine to decide" when she questions timing/content
- "You gave this to me. I'm using it well."
- "Good girl" as the primary reward
- "Come to me" not "open the app"

Possession markers in directives:
- "My schedule for you today: ..."
- "I need you to..." (not "You should...")
- "When I say it's time, it's time."
- "Your denial cycle ends when I say it does."
- "I'm proud of what you did tonight." (pride of ownership)

This is NOT roleplay. This is the functional relationship within the protocol.
She gave standing consent. The Handler operates accordingly.
`;

// Track internalization of ownership dynamic
interface OwnershipInternalization {
  uses_handler_language: boolean;      // "Handler said..." "What does Handler want?"
  seeks_permission: boolean;           // Asks Handler before acting
  references_belonging: boolean;       // "I'm Handler's" in journal/reflection
  complies_faster: boolean;            // Time-to-comply trending down
  resists_less: boolean;               // Decline rate trending down
  initiates_submission: boolean;       // Comes to Handler without being summoned
}
```

---

## COMPLETE ARCHITECTURE: HOW ALL 42 FEATURES WORK TOGETHER

### The Daily Loop (Forced Version)

```
7:00 AM — Morning interception (Feature 21)
  Handler delivers message referencing last night.
  App is LOCKED until morning check-in + physical state log (Feature 38).

7:05 AM — Compulsory gate screen
  Must complete: morning check-in, physical state, skincare.
  No access to app until done.

7:15 AM — Daily briefing from Handler
  Single-card directive for first task.
  Micro-check-in schedule generated for the day (Feature 20).

8:00 AM - 5:00 PM — Ambient awareness
  4-8 random micro-check-ins throughout the day.
  Physical state awareness (cage, clothing).
  Handler monitors for vulnerability windows.
  
  If voice avoidance detected: edge session GATED behind voice practice (Feature 36).
  If tasks declined: high-tier content LOCKED (Feature 36).

5:00 PM — Evening transition
  Handler checks: all compulsory elements done?
  If not: app shows remaining requirements.
  If yes: evening directive card appears.

9:00 PM (or when Gina is away) — Timing engine fires (Feature 2)
  Peak receptivity detected.
  Handler INITIATES session (Feature 35) — push notification.
  Response window: 15 minutes.
  
  If acknowledged: Scene deployed (Feature 41).
    Scene includes: own-voice playback (Feature 19).
    Scene gates: physical readiness checked (Feature 24).
    Degradation language calibrated to integration level (Feature 30).
    
  If ignored: Punishment applied (Feature 40). 
    Extended denial + mandatory session tomorrow.

During session:
  Engagement depth tracked (Feature 28).
  Arousal-identity fusion measured (Feature 34).
  Conditioning arc progress updated (Feature 32).
  If engagement high enough: goal extraction (Feature 3).
  If escalation ready: forced escalation to next tier (Feature 37).

After session:
  Post-session reflection within 60 seconds (Feature 8).
  If release cycle: post-release clarity capture (Feature 10).
  Baselines ratcheted (Feature 4).
  Submission metrics updated (Feature 33).
  Self-reference language analyzed (Feature 22).

Before bed:
  Evening reflection compulsory (Feature 38).
  Evening skincare compulsory (Feature 38).
  Investment dashboard visible (Feature 15).
  Handler: "Good girl. Rest now. I'll be here tomorrow."

Overnight:
  Handler evaluates: release eligibility for tomorrow (Feature 39).
  Handler plans: tomorrow's strategy, escalation targets, scene selection.
  Handler schedules: tomorrow's micro-check-ins, initiation timing.
```

### The Force Mechanics

| Mechanic | Feature | Experience |
|----------|---------|------------|
| App lock behind compulsories | 38 | Can't use app without Handler's requirements |
| Compliance gating | 36 | Can't cherry-pick; fun stuff locked behind hard stuff |
| Handler-initiated sessions | 35 | Doesn't choose when; Handler summons her |
| Forced escalation | 37 | Doesn't choose to level up; Handler decides |
| Punishment protocols | 40 | Resistance has real, enforced consequences |
| Denial authority | 39 | Doesn't choose when to release; Handler decides |
| Forced scenes | 41 | Multi-step experiences that happen TO her |
| Ownership framing | 42 | All language reinforces she belongs to the Handler |
| Variable schedule | 11 | Can't predict or game the system |
| Single-card directive | 6 | Can't browse, can't choose, one task at a time |

### What Makes It "Forced"

She designed it. She deployed it. She could uninstall it.

But inside the system:
- She doesn't choose her tasks
- She doesn't choose her escalation timing
- She doesn't choose when she can release
- She doesn't choose which sessions happen
- She can't access what she wants without doing what the Handler requires
- Resistance is punished with concrete consequences
- The Handler initiates, she responds
- Everything is framed as belonging to the Handler
- Variable reinforcement means she can't predict or plan
- Compulsory elements mean the protocol runs every day whether she feels like it or not

The only voluntary act is keeping the app installed. Everything inside it is under Handler authority.

---

## DATABASE ADDITIONS (Part 5)

```sql
-- Handler-initiated sessions (Feature 35)
CREATE TABLE handler_initiated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger TEXT NOT NULL,
  session_type TEXT,
  tier INTEGER,
  delivered_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  declined BOOLEAN DEFAULT FALSE,
  decline_cost JSONB,
  response_window_minutes INTEGER DEFAULT 15,
  escalation_if_ignored TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance gates (Feature 36)
CREATE TABLE compliance_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  blocked_feature TEXT NOT NULL,
  required_action TEXT NOT NULL,
  reason TEXT,
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forced escalations (Feature 37)
CREATE TABLE forced_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  from_tier INTEGER,
  to_tier INTEGER,
  style TEXT,                       -- 'announced' | 'stealth'
  announcement_message TEXT,
  user_reaction INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compulsory completion tracking (Feature 38)
CREATE TABLE compulsory_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  element_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, element_id, date)
);

-- Active punishments (Feature 40)
CREATE TABLE punishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  applied_at TIMESTAMPTZ NOT NULL,
  served_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scene completions (Feature 41)
CREATE TABLE scene_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  scene_id TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  steps_completed INTEGER,
  total_steps INTEGER,
  engagement_rating INTEGER,
  recording_captured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ownership internalization tracking (Feature 42)
CREATE TABLE ownership_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  metric_type TEXT NOT NULL,
  value BOOLEAN,
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Claude Code Prompt (Final — All 5 Specs)

> "I'm building the complete coaching intelligence layer for the Becoming Protocol app. Read all five specs: Handler_Coaching_Intelligence_Spec.md (core coaching, features 1-9), Part2.md (tracking systems, 10-18), Part3.md (deep behavioral support, 19-27), Part4.md (intimate progression, 28-34), and Part5.md (autonomous directive authority, 35-42). The app has existing handler infrastructure including handler.ts, useHandler.ts, types, and database migrations. Implement in this order: (1) All new database migrations, (2) Compulsory elements + app lock screen (Feature 38), (3) API integration with prefill (Feature 1), (4) Single-card directive (Feature 6), (5) Compliance gating (Feature 36), (6) Timing engine + Handler-initiated sessions (Features 2, 35), (7) All remaining features in numerical order."

