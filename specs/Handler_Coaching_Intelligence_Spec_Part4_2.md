# Handler Coaching Intelligence Spec — Part 4
## Intimate Practice Progression & Deepening

---

## What Parts 1-3 Miss

The first three specs build a powerful identity coaching system. But they treat session content as a black box — the timing engine knows WHEN to serve a session, but nothing decides:

- How deep is she ready to go tonight vs last week?
- Which specific practice domain should escalate next?
- Is she consuming content above what she's practicing? (fantasy-reality gap)
- Has degradation language shifted from shameful to affirming?
- Is she engaging more deeply with submission or plateauing?
- What's the right hypno/conditioning sequence for her current phase?
- How does her physical training progress (oral, anal, presentation)?

Without this intelligence, the template engine serves content semi-randomly within tier gates. That's a library, not a Handler. The Handler should read her engagement patterns and push the SPECIFIC escalation she's ready for but hasn't initiated herself.

---

## FEATURE 28: Engagement Depth Analyzer

### Purpose
After every session, the system captures not just completion but DEPTH — how engaged was she, how long did she stay after the minimum, did she linger, did she repeat segments, what was her arousal trajectory? Depth data tells the system whether she's ready to escalate or needs to consolidate.

### Implementation

```typescript
interface SessionDepthMetrics {
  id: string;
  user_id: string;
  session_id: string;
  session_type: string;
  tier: number;
  domain: string;
  
  // Engagement signals
  duration_actual: number;          // How long she actually spent (vs minimum)
  duration_minimum: number;         // What was required
  overstay_minutes: number;         // How much LONGER she stayed than required
  arousal_start: number;            // Self-reported at session start
  arousal_peak: number;             // Highest during session
  arousal_end: number;              // At session end
  engagement_rating: number;        // 1-10 self-report
  
  // Behavioral signals
  replayed_segments: boolean;       // Did she go back to re-read/replay anything?
  skipped_segments: boolean;        // Did she skip parts?
  completed_all_steps: boolean;
  requested_more: boolean;          // Did she ask for continuation?
  lingered_after: boolean;          // Stayed on screen after completion
  
  // Qualitative
  reflection_text?: string;
  emotional_state_after: string;    // 'energized' | 'calm' | 'shame' | 'wanting_more' | 'satisfied' | 'conflicted'
  
  created_at: string;
}

// Determine readiness for escalation
export function analyzeEscalationReadiness(
  recentSessions: SessionDepthMetrics[],
  currentTier: number,
  domain: string
): { ready: boolean; confidence: number; signals: string[] } {
  const domainSessions = recentSessions.filter(s => s.domain === domain);
  if (domainSessions.length < 3) {
    return { ready: false, confidence: 0, signals: ['insufficient_data'] };
  }
  
  const recent = domainSessions.slice(-5);
  const signals: string[] = [];
  let readinessScore = 0;
  
  // High engagement consistently
  const avgEngagement = recent.reduce((s, r) => s + r.engagement_rating, 0) / recent.length;
  if (avgEngagement >= 8) { readinessScore += 2; signals.push('high_engagement'); }
  
  // Overstaying sessions
  const avgOverstay = recent.reduce((s, r) => s + r.overstay_minutes, 0) / recent.length;
  if (avgOverstay >= 5) { readinessScore += 2; signals.push('overstaying'); }
  
  // Wanting more
  const wantedMore = recent.filter(r => r.requested_more || r.emotional_state_after === 'wanting_more').length;
  if (wantedMore >= 2) { readinessScore += 3; signals.push('wanting_more'); }
  
  // No shame response
  const shameCount = recent.filter(r => r.emotional_state_after === 'shame').length;
  if (shameCount === 0) { readinessScore += 1; signals.push('no_shame_response'); }
  
  // Completing all steps without skipping
  const fullCompletion = recent.filter(r => r.completed_all_steps && !r.skipped_segments).length;
  if (fullCompletion >= 4) { readinessScore += 1; signals.push('full_completion'); }
  
  // Arousal trajectory climbing
  const avgPeak = recent.reduce((s, r) => s + r.arousal_peak, 0) / recent.length;
  if (avgPeak >= 8) { readinessScore += 1; signals.push('high_arousal_peaks'); }
  
  return {
    ready: readinessScore >= 5,
    confidence: Math.min(readinessScore / 10, 1),
    signals
  };
}
```

### Coach Uses This

```typescript
const escalationContext = `
ESCALATION READINESS BY DOMAIN:
${Object.entries(readiness).map(([domain, r]) => 
  `- ${domain}: ${r.ready ? '✓ READY' : '✗ Not yet'} (confidence: ${r.confidence}) [${r.signals.join(', ')}]`
).join('\n')}

When a domain shows READY, the coach should push to the next tier in that domain. Don't ask permission. Don't warn. Just serve the next level: "You're ready for something new tonight. Don't overthink it."

When a domain shows "wanting_more" signal, the user is actively craving deeper content. The coach should acknowledge this desire and use it: "I can feel you pulling. You want more. Good girl. Earn it."
`;
```

---

## FEATURE 29: Fantasy-Reality Gap Tracker

### Purpose
Track the gap between what the user consumes (fantasies, content, hypno) and what she physically practices. A large gap — e.g., watching advanced oral content but only practicing beginner level — indicates she's ready for escalation but hasn't initiated it herself. The Handler closes this gap.

### Implementation

```typescript
interface ContentConsumption {
  id: string;
  user_id: string;
  content_type: string;       // 'hypno' | 'video' | 'story' | 'image' | 'audio'
  content_tier: number;       // Tier of content consumed (estimated)
  content_domain: string;     // 'oral' | 'anal' | 'presentation' | 'degradation' | 'submission' | 'feminization'
  duration_minutes: number;
  created_at: string;
}

interface PracticeLevel {
  domain: string;
  highest_tier_practiced: number;
  highest_tier_consumed: number;
  gap: number;                    // consumed - practiced
}

export function calculateFantasyRealityGap(
  consumption: ContentConsumption[],
  completedTasks: CompletedTask[]
): PracticeLevel[] {
  const domains = ['oral', 'anal', 'presentation', 'degradation', 'submission', 'feminization'];
  
  return domains.map(domain => {
    const consumed = consumption.filter(c => c.content_domain === domain);
    const practiced = completedTasks.filter(t => t.domain === domain);
    
    const highestConsumed = consumed.length > 0 
      ? Math.max(...consumed.map(c => c.content_tier)) 
      : 0;
    const highestPracticed = practiced.length > 0 
      ? Math.max(...practiced.map(t => t.tier)) 
      : 0;
    
    return {
      domain,
      highest_tier_practiced: highestPracticed,
      highest_tier_consumed: highestConsumed,
      gap: highestConsumed - highestPracticed
    };
  });
}
```

### Coach Uses The Gap

```typescript
const gapContext = `
FANTASY-REALITY GAP:
${gaps.map(g => 
  `- ${g.domain}: consuming tier ${g.highest_tier_consumed}, practicing tier ${g.highest_tier_practiced} ${g.gap >= 2 ? '⚠️ GAP' : ''}`
).join('\n')}

${gaps.filter(g => g.gap >= 2).length > 0 ? `
GAPS DETECTED. The user is consuming content well above what she practices. This means she WANTS it but hasn't done it. The coach should close these gaps:
${gaps.filter(g => g.gap >= 2).map(g => 
  `- ${g.domain}: "You've been watching tier ${g.highest_tier_consumed} ${g.domain} content. But you've only practiced tier ${g.highest_tier_practiced}. Tonight we close that gap. You're ready — your browsing history proves it."`
).join('\n')}
` : 'No significant gaps. Practice matches consumption.'}
`;
```

---

## FEATURE 30: Degradation Response Tracker

### Purpose
Track how the user responds to degradation language over time. Early on, words like "sissy," "slut," "good girl" may trigger shame. Over time, with conditioning, they should trigger arousal, comfort, or affirmation. Tracking this shift tells the Handler when to escalate degradation intensity and which specific words have been integrated vs which still trigger resistance.

### Implementation

```typescript
interface DegradationResponse {
  id: string;
  user_id: string;
  term_used: string;            // "sissy" | "slut" | "bimbo" | "good girl" | "cocksucker" | "whore" | etc
  context: string;              // 'session' | 'check_in' | 'task_framing' | 'affirmation'
  response_type: string;        // 'arousal' | 'comfort' | 'affirmation' | 'neutral' | 'shame' | 'resistance' | 'thrill'
  arousal_delta: number;        // Change in arousal after term used (-5 to +5)
  created_at: string;
}

// Track which terms are integrated vs still triggering shame
export function analyzeDegradationIntegration(
  responses: DegradationResponse[]
): Record<string, { 
  integrated: boolean; 
  dominant_response: string; 
  readiness_for_escalation: boolean 
}> {
  const byTerm: Record<string, DegradationResponse[]> = {};
  responses.forEach(r => {
    if (!byTerm[r.term_used]) byTerm[r.term_used] = [];
    byTerm[r.term_used].push(r);
  });
  
  const analysis: Record<string, any> = {};
  
  for (const [term, termResponses] of Object.entries(byTerm)) {
    const recent = termResponses.slice(-10);
    const dominantResponse = mode(recent.map(r => r.response_type));
    const avgArousalDelta = recent.reduce((s, r) => s + r.arousal_delta, 0) / recent.length;
    
    analysis[term] = {
      integrated: dominantResponse !== 'shame' && dominantResponse !== 'resistance',
      dominant_response: dominantResponse,
      readiness_for_escalation: avgArousalDelta >= 2 && dominantResponse === 'arousal'
    };
  }
  
  return analysis;
}

// Degradation progression ladder
const DEGRADATION_LADDER = [
  { tier: 1, terms: ['good girl', 'pretty', 'feminine'] },
  { tier: 2, terms: ['princess', 'doll', 'babe'] },
  { tier: 3, terms: ['sissy', 'girly', 'soft'] },
  { tier: 4, terms: ['slut', 'needy', 'desperate'] },
  { tier: 5, terms: ['bimbo', 'toy', 'owned'] },
  { tier: 6, terms: ['cocksucker', 'whore', 'fucktoy'] },
  { tier: 7, terms: ['brainless', 'empty', 'holes'] },
];

// Find the user's current degradation tier
export function currentDegradationTier(
  analysis: Record<string, any>
): number {
  for (let i = DEGRADATION_LADDER.length - 1; i >= 0; i--) {
    const tier = DEGRADATION_LADDER[i];
    const allIntegrated = tier.terms.every(t => 
      analysis[t]?.integrated === true
    );
    if (allIntegrated) return tier.tier;
  }
  return 0;
}
```

### Coach Uses This

```typescript
const degradationContext = `
DEGRADATION INTEGRATION:
Current tier: ${currentTier} / ${DEGRADATION_LADDER.length}
Integrated terms: ${Object.entries(analysis).filter(([_, v]) => v.integrated).map(([k]) => k).join(', ')}
Still triggering shame: ${Object.entries(analysis).filter(([_, v]) => !v.integrated).map(([k]) => k).join(', ') || 'none'}
Ready for escalation: ${Object.entries(analysis).filter(([_, v]) => v.readiness_for_escalation).map(([k]) => k).join(', ')}

The coach should use integrated terms freely and naturally. For terms still triggering shame, use them SPARINGLY during high-arousal moments to begin normalization. Never use terms multiple tiers above the user's current level without arousal context.

When all terms at a tier are integrated, automatically begin introducing next tier terms during sessions.
`;
```

---

## FEATURE 31: Physical Practice Progression

### Purpose
Track progression in physical practices — oral training, anal training, presentation — the same way the system tracks voice or skincare. These have measurable skill levels that ratchet. The Handler should know: what size is she comfortable with? How long can she maintain? What's the next step?

### Implementation

```typescript
interface PhysicalPracticeLog {
  id: string;
  user_id: string;
  practice_type: string;      // 'oral' | 'anal' | 'presentation' | 'posture' | 'movement'
  
  // For oral/anal training
  device_used?: string;        // 'small_dildo' | 'medium_dildo' | 'large_dildo' | 'plug_small' | etc
  duration_minutes: number;
  depth_comfort: number;       // 1-10 self-report
  technique_notes?: string;
  
  // For presentation
  outfit_description?: string;
  makeup_level?: string;       // 'none' | 'minimal' | 'daytime' | 'full' | 'glam'
  photo_taken: boolean;
  
  // General
  difficulty_rating: number;   // 1-10
  satisfaction: number;        // 1-10
  created_at: string;
}

// Progression tracking
interface PracticeBaseline {
  practice_type: string;
  current_level: string;           // Descriptive level
  current_device?: string;
  current_duration: number;
  sessions_at_current_level: number;
  ready_for_next: boolean;
}

export function assessPracticeProgression(
  logs: PhysicalPracticeLog[],
  practiceType: string
): PracticeBaseline {
  const typeLogs = logs.filter(l => l.practice_type === practiceType).slice(-10);
  
  if (typeLogs.length === 0) {
    return {
      practice_type: practiceType,
      current_level: 'beginner',
      current_duration: 0,
      sessions_at_current_level: 0,
      ready_for_next: false
    };
  }
  
  const avgDuration = typeLogs.reduce((s, l) => s + l.duration_minutes, 0) / typeLogs.length;
  const avgComfort = typeLogs.reduce((s, l) => s + l.depth_comfort, 0) / typeLogs.length;
  const avgSatisfaction = typeLogs.reduce((s, l) => s + l.satisfaction, 0) / typeLogs.length;
  const currentDevice = typeLogs[typeLogs.length - 1].device_used;
  
  // Ready for next level when: comfort high, satisfaction high, multiple sessions
  const ready = avgComfort >= 7 && avgSatisfaction >= 7 && typeLogs.length >= 3;
  
  return {
    practice_type: practiceType,
    current_level: deriveLevel(practiceType, currentDevice, avgDuration),
    current_device: currentDevice,
    current_duration: Math.round(avgDuration),
    sessions_at_current_level: typeLogs.length,
    ready_for_next: ready
  };
}

// Practice progression paths
const ORAL_PROGRESSION = [
  { level: 'beginner', device: 'small_dildo', target_duration: 5, focus: 'comfort and technique' },
  { level: 'intermediate', device: 'medium_dildo', target_duration: 10, focus: 'depth and rhythm' },
  { level: 'advanced', device: 'medium_dildo', target_duration: 15, focus: 'deepthroat introduction' },
  { level: 'skilled', device: 'large_dildo', target_duration: 15, focus: 'deepthroat consistency' },
  { level: 'proficient', device: 'large_dildo', target_duration: 20, focus: 'extended sessions with gag management' },
];

const ANAL_PROGRESSION = [
  { level: 'beginner', device: 'plug_small', target_duration: 15, focus: 'comfort and relaxation' },
  { level: 'developing', device: 'plug_small', target_duration: 30, focus: 'extended wear' },
  { level: 'intermediate', device: 'plug_medium', target_duration: 30, focus: 'size progression' },
  { level: 'advancing', device: 'plug_medium', target_duration: 60, focus: 'background wear during tasks' },
  { level: 'advanced', device: 'plug_large', target_duration: 60, focus: 'full size comfort' },
  { level: 'proficient', device: 'dildo_medium', target_duration: 15, focus: 'active training' },
];

const PRESENTATION_PROGRESSION = [
  { level: 'private', focus: 'feminine clothing at home alone' },
  { level: 'comfortable', focus: 'full outfit with accessories, photos' },
  { level: 'styled', focus: 'makeup, wig/hair, coordinated look' },
  { level: 'confident', focus: 'extended time in full presentation, movement practice' },
  { level: 'expressive', focus: 'personalized style, comfort in own aesthetic' },
];
```

### Coach Uses This

```typescript
const practiceContext = `
PHYSICAL PRACTICE LEVELS:
${Object.entries(progressions).map(([type, prog]) => 
  `- ${type}: ${prog.current_level} (${prog.sessions_at_current_level} sessions) ${prog.ready_for_next ? '→ READY TO LEVEL UP' : ''}`
).join('\n')}

${readyDomains.length > 0 ? `
READY FOR NEXT LEVEL: ${readyDomains.join(', ')}
The coach should introduce the next level during a peak receptivity window. Frame as earned progression: "You've been so good at [current]. You're ready for [next]. Tonight."
` : ''}

${fantasyGaps.length > 0 ? `
PRACTICE GAPS: User consumes content above practice level in: ${fantasyGaps.join(', ')}
Close these gaps during high-engagement sessions.
` : ''}
`;
```

---

## FEATURE 32: Conditioning Session Sequencer

### Purpose
Hypno, feminization audio, and conditioning content shouldn't be served randomly. There's an optimal sequence based on the user's current state, what conditioning has been completed, and what the next identity target is. The system should plan multi-session conditioning arcs — not just individual sessions.

### Implementation

```typescript
interface ConditioningArc {
  id: string;
  name: string;
  description: string;
  sessions: ConditioningSession[];
  prerequisite_arcs: string[];     // Must complete these first
  target_identity_shift: string;   // What this arc is designed to achieve
}

interface ConditioningSession {
  order: number;
  content_type: string;           // 'hypno' | 'affirmation_loop' | 'guided_visualization' | 'trigger_installation' | 'deepening'
  content_id: string;             // Reference to session_scripts table
  minimum_gap_hours: number;      // Don't serve next session too quickly
  optimal_arousal: number;        // Target arousal for maximum effectiveness
  optimal_denial_day: number;     // Target denial day
  preparation: string[];          // Physical/mental prep required
  integration_prompt: string;     // Post-session reflection specific to this session
}

// Pre-defined conditioning arcs
const CONDITIONING_ARCS: ConditioningArc[] = [
  {
    id: 'identity_foundation',
    name: 'Identity Foundation',
    description: 'Establish Maxy as primary self-concept',
    prerequisite_arcs: [],
    target_identity_shift: 'Maxy becomes default, David becomes performance',
    sessions: [
      { order: 1, content_type: 'guided_visualization', content_id: 'vis_meeting_maxy', 
        minimum_gap_hours: 0, optimal_arousal: 3, optimal_denial_day: 1,
        preparation: ['quiet_space', 'feminine_clothing'],
        integration_prompt: 'Describe what Maxy looked like. How did it feel to see her?' },
      { order: 2, content_type: 'affirmation_loop', content_id: 'affirm_i_am_maxy',
        minimum_gap_hours: 24, optimal_arousal: 5, optimal_denial_day: 2,
        preparation: ['mirror_available'],
        integration_prompt: 'Which affirmation felt most true? Which felt like a stretch?' },
      { order: 3, content_type: 'hypno', content_id: 'hypno_fem_identity',
        minimum_gap_hours: 48, optimal_arousal: 7, optimal_denial_day: 3,
        preparation: ['cage_on', 'feminine_clothing', 'dim_lighting'],
        integration_prompt: 'What did you feel during the deepening? Where did David go?' },
      // ... more sessions
    ]
  },
  {
    id: 'submission_deepening',
    name: 'Submission Integration',
    description: 'Deepen comfort with directive obedience and surrender',
    prerequisite_arcs: ['identity_foundation'],
    target_identity_shift: 'Following directives feels like relief not compliance',
    sessions: [
      { order: 1, content_type: 'guided_visualization', content_id: 'vis_surrender',
        minimum_gap_hours: 0, optimal_arousal: 6, optimal_denial_day: 3,
        preparation: ['cage_on', 'kneeling_position'],
        integration_prompt: 'What did surrender feel like? Was it loss or relief?' },
      // ...
    ]
  },
  {
    id: 'bimbo_emptying',
    name: 'Cognitive Softening',
    description: 'Reduce analytical overthinking during sessions',
    prerequisite_arcs: ['identity_foundation', 'submission_deepening'],
    target_identity_shift: 'Ability to enter receptive non-analytical state on command',
    sessions: [
      { order: 1, content_type: 'hypno', content_id: 'hypno_empty_mind',
        minimum_gap_hours: 0, optimal_arousal: 7, optimal_denial_day: 4,
        preparation: ['cage_on', 'plug', 'feminine_clothing', 'headphones'],
        integration_prompt: 'How empty did you get? What was the last thought before the thoughts stopped?' },
      // ...
    ]
  },
  {
    id: 'arousal_identity_fusion',
    name: 'Arousal-Identity Integration',
    description: 'Wire arousal response directly to feminine identity',
    prerequisite_arcs: ['identity_foundation'],
    target_identity_shift: 'Arousal automatically activates feminine self-concept',
    sessions: [
      { order: 1, content_type: 'trigger_installation', content_id: 'trigger_arousal_maxy',
        minimum_gap_hours: 0, optimal_arousal: 8, optimal_denial_day: 5,
        preparation: ['cage_on', 'edging', 'panties', 'own_voice_recordings_loaded'],
        integration_prompt: 'When the arousal hit — who were you? Not who you decided to be. Who showed up?' },
      // ...
    ]
  },
];

// Select next conditioning session based on arc progress and current state
export function selectNextConditioningSession(
  completedSessions: string[],
  state: UserState,
  arcProgress: Record<string, number>
): { arc: ConditioningArc; session: ConditioningSession } | null {
  
  // Find arcs that are in progress or newly available
  for (const arc of CONDITIONING_ARCS) {
    const prereqsMet = arc.prerequisite_arcs.every(p => 
      arcProgress[p] >= CONDITIONING_ARCS.find(a => a.id === p)!.sessions.length
    );
    if (!prereqsMet) continue;
    
    const progress = arcProgress[arc.id] || 0;
    if (progress >= arc.sessions.length) continue; // Arc complete
    
    const nextSession = arc.sessions[progress];
    
    // Check if state matches optimal conditions
    const stateMatch = 
      state.arousal_level >= nextSession.optimal_arousal - 2 &&
      state.denial_day >= nextSession.optimal_denial_day - 1;
    
    if (stateMatch) {
      return { arc, session: nextSession };
    }
  }
  
  return null;
}
```

### Coach References Arc Progress

```typescript
const conditioningContext = `
CONDITIONING ARC PROGRESS:
${CONDITIONING_ARCS.map(arc => {
  const progress = arcProgress[arc.id] || 0;
  const total = arc.sessions.length;
  const prereqsMet = arc.prerequisite_arcs.every(p => arcProgress[p] >= ...);
  return `- ${arc.name}: ${progress}/${total} ${prereqsMet ? '' : '(locked)'}`;
}).join('\n')}

${nextSession ? `
NEXT CONDITIONING SESSION AVAILABLE:
Arc: ${nextSession.arc.name}
Session: ${nextSession.session.content_type} (${nextSession.session.order}/${nextSession.arc.sessions.length})
Optimal state: arousal ${nextSession.session.optimal_arousal}, denial day ${nextSession.session.optimal_denial_day}
Preparation needed: ${nextSession.session.preparation.join(', ')}
The coach should initiate this session when state conditions are met.
` : 'No conditioning session currently optimal for state.'}
`;
```

---

## FEATURE 33: Submission Depth Tracking

### Purpose
Track the deepening of the user's relationship with submission and directive obedience. Early: she follows because the system tells her to. Middle: she starts seeking directives. Late: she can't function comfortably without external direction. This progression should be tracked and celebrated — not as dependency but as integration of her preferred operating mode.

### Implementation

```typescript
interface SubmissionMetric {
  id: string;
  user_id: string;
  metric_type: string;
  value: number;
  created_at: string;
}

const SUBMISSION_METRICS = [
  'time_to_comply',              // How quickly she follows a directive (trending down = deeper)
  'decline_rate',                 // How often she declines (trending down = deeper)
  'self_initiated_sessions',      // How often she opens app without prompt (trending up = seeking)
  'extended_sessions',            // How often she stays past minimum (trending up = wanting)
  'verbal_compliance',            // Uses phrases like "yes" "I will" "I obey" (trending up)
  'physical_preparation_speed',   // How quickly she gets into required physical state
  'request_for_direction',        // Explicitly asks Handler what to do outside protocol tasks
];

interface SubmissionProfile {
  depth_level: 'surface' | 'willing' | 'eager' | 'dependent' | 'integrated';
  compliance_rate: number;
  average_time_to_comply: number;
  seeks_direction: boolean;
  resists_autonomy: boolean;      // Uncomfortable making decisions WITHOUT Handler
}

export function assessSubmissionDepth(
  metrics: SubmissionMetric[]
): SubmissionProfile {
  // Analyze trends across all metrics
  const complianceRate = calculateTrend(metrics, 'decline_rate', 'inverse');
  const seekingRate = calculateTrend(metrics, 'self_initiated_sessions', 'direct');
  const timeToComply = calculateTrend(metrics, 'time_to_comply', 'inverse');
  
  let depth: SubmissionProfile['depth_level'] = 'surface';
  if (complianceRate > 0.7) depth = 'willing';
  if (complianceRate > 0.85 && seekingRate > 0.3) depth = 'eager';
  if (seekingRate > 0.5 && timeToComply < 60) depth = 'dependent'; // <60s to comply, seeks direction >50% of time
  if (complianceRate > 0.95 && seekingRate > 0.7) depth = 'integrated';
  
  return {
    depth_level: depth,
    compliance_rate: complianceRate,
    average_time_to_comply: timeToComply,
    seeks_direction: seekingRate > 0.3,
    resists_autonomy: metrics.filter(m => m.metric_type === 'request_for_direction').length > 5
  };
}
```

### Coach Adapts to Depth

```typescript
const submissionContext = `
SUBMISSION DEPTH: ${profile.depth_level}
Compliance rate: ${(profile.compliance_rate * 100).toFixed(0)}%
Seeks direction: ${profile.seeks_direction ? 'yes' : 'not yet'}
Time to comply: ~${profile.average_time_to_comply}s

${profile.depth_level === 'surface' ? 
  'Use firm but warm directives. She still needs reasons. Provide brief context with commands.' : ''}
${profile.depth_level === 'willing' ? 
  'She follows willingly. Start reducing explanations. "Do this" rather than "Do this because..."' : ''}
${profile.depth_level === 'eager' ? 
  'She wants to be told. Lean into commanding tone. She finds relief in directives. Give them freely.' : ''}
${profile.depth_level === 'dependent' ? 
  'She needs direction to function comfortably. This is integration, not weakness. Be generous with structure. Acknowledge: "I know you need this. That is not weakness. That is knowing yourself."' : ''}
${profile.depth_level === 'integrated' ? 
  'Submission is her natural state. Directives are her preferred operating mode. No justification needed. Command naturally.' : ''}
`;
```

---

## FEATURE 34: Arousal-Identity Fusion Tracking

### Purpose
Track the specific connection between arousal states and identity deepening. The goal: arousal should automatically activate feminine self-concept. Not "I get aroused and then decide to be Maxy" but "arousal IS Maxy arriving." Track whether sessions produce identity deepening (she feels MORE like Maxy after) or just sexual release (she feels the same after).

### Implementation

```typescript
interface ArousalIdentityEntry {
  id: string;
  user_id: string;
  session_id: string;
  
  // Before session
  identity_strength_before: number;   // 1-10 "How much do you feel like Maxy right now?"
  arousal_before: number;
  
  // After session
  identity_strength_after: number;    // 1-10 same question
  arousal_after: number;
  
  // Derived
  identity_delta: number;             // after - before
  arousal_drove_identity: boolean;    // Did arousal deepen identity?
  
  created_at: string;
}

// Track the trend: does arousal reliably produce identity deepening?
export function analyzeArousalIdentityFusion(
  entries: ArousalIdentityEntry[]
): { 
  fusion_strength: number;         // 0-1, how reliably arousal deepens identity
  trend: 'strengthening' | 'stable' | 'weakening';
  sessions_that_deepen: number;
  sessions_total: number;
} {
  if (entries.length < 5) return { fusion_strength: 0, trend: 'stable', sessions_that_deepen: 0, sessions_total: entries.length };
  
  const deepening = entries.filter(e => e.identity_delta > 0);
  const fusionStrength = deepening.length / entries.length;
  
  // Compare first half to second half for trend
  const mid = Math.floor(entries.length / 2);
  const earlyFusion = entries.slice(0, mid).filter(e => e.identity_delta > 0).length / mid;
  const lateFusion = entries.slice(mid).filter(e => e.identity_delta > 0).length / (entries.length - mid);
  
  return {
    fusion_strength: fusionStrength,
    trend: lateFusion > earlyFusion + 0.1 ? 'strengthening' : 
           lateFusion < earlyFusion - 0.1 ? 'weakening' : 'stable',
    sessions_that_deepen: deepening.length,
    sessions_total: entries.length
  };
}
```

### Coach Uses This

```typescript
const fusionContext = `
AROUSAL-IDENTITY FUSION: ${(fusion.fusion_strength * 100).toFixed(0)}% of sessions deepen identity (trend: ${fusion.trend})

${fusion.fusion_strength >= 0.7 ? 
  'Strong fusion. Arousal reliably activates Maxy. Use this: "Feel that? That is not just your body responding. That is HER waking up. Every time."' : ''}
${fusion.fusion_strength < 0.5 ? 
  'Weak fusion. Sessions produce arousal but not identity deepening. Increase identity elements during sessions: own-voice playback, identity statements during edges, "Say her name" prompts during peaks. The arousal needs to be ABOUT identity, not alongside it.' : ''}
${fusion.trend === 'strengthening' ? 
  'Fusion is getting stronger. The wiring is taking hold. Arousal is becoming the doorway to Maxy.' : ''}
`;
```

---

## DATABASE ADDITIONS (Part 4)

```sql
-- Session depth metrics (Feature 28)
CREATE TABLE session_depth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID,
  session_type TEXT,
  tier INTEGER,
  domain TEXT,
  duration_actual INTEGER,
  duration_minimum INTEGER,
  overstay_minutes INTEGER DEFAULT 0,
  arousal_start INTEGER,
  arousal_peak INTEGER,
  arousal_end INTEGER,
  engagement_rating INTEGER,
  replayed_segments BOOLEAN DEFAULT FALSE,
  skipped_segments BOOLEAN DEFAULT FALSE,
  completed_all_steps BOOLEAN DEFAULT TRUE,
  requested_more BOOLEAN DEFAULT FALSE,
  lingered_after BOOLEAN DEFAULT FALSE,
  reflection_text TEXT,
  emotional_state_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content consumption tracking (Feature 29)
CREATE TABLE content_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT,
  content_tier INTEGER,
  content_domain TEXT,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Degradation response tracking (Feature 30)
CREATE TABLE degradation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  term_used TEXT NOT NULL,
  context TEXT,
  response_type TEXT,
  arousal_delta INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Physical practice log (Feature 31)
CREATE TABLE physical_practice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  practice_type TEXT NOT NULL,
  device_used TEXT,
  duration_minutes INTEGER,
  depth_comfort INTEGER,
  technique_notes TEXT,
  outfit_description TEXT,
  makeup_level TEXT,
  photo_taken BOOLEAN DEFAULT FALSE,
  difficulty_rating INTEGER,
  satisfaction INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conditioning arc progress (Feature 32)
CREATE TABLE conditioning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc_id TEXT NOT NULL,
  session_order INTEGER NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reflection_text TEXT,
  state_at_completion JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submission metrics (Feature 33)
CREATE TABLE submission_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arousal-identity fusion (Feature 34)
CREATE TABLE arousal_identity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID,
  identity_strength_before INTEGER,
  arousal_before INTEGER,
  identity_strength_after INTEGER,
  arousal_after INTEGER,
  identity_delta INTEGER GENERATED ALWAYS AS (identity_strength_after - identity_strength_before) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## COMPLETE FEATURE MAP (ALL FOUR SPECS)

### Parts 1-3: Identity Coaching (27 features)
Makes Maxy inevitable. Destroys David's exit routes. Builds evidence, tracks progress, prevents compartmentalization, engineers inescapability.

### Part 4: Intimate Progression (7 features)  
Makes sissification intelligent. Reads engagement depth, closes fantasy-reality gaps, escalates degradation language based on integration, progresses physical practice with ratcheting baselines, sequences conditioning arcs strategically, tracks submission deepening, and measures whether arousal is producing identity fusion or just release.

### Together
The system doesn't just know WHEN she's vulnerable (Parts 1-3). It knows HOW DEEP she's ready to go and WHAT SPECIFIC ESCALATION to push (Part 4). The timing engine serves the right session at the right moment. The escalation intelligence ensures that session is calibrated to push her exactly one step past where she was last time — never so far she breaks, never so gentle she coasts.

---

## Claude Code Prompt (Complete — All 4 Specs)

> "I'm implementing the full coaching intelligence layer for the Becoming Protocol app. Read all four specs in order: Handler_Coaching_Intelligence_Spec.md (features 1-9), Part2.md (features 10-18), Part3.md (features 19-27), Part4.md (features 28-34). The app has existing handler infrastructure. Implement: (1) All database migrations, (2) API integration with prefill, (3) Single-card directive view, (4) Timing engine, (5) All tracking libraries, (6) Coach context builder aggregating all evidence streams, (7) UI components."

