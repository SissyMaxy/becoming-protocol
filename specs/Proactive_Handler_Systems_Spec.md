# Proactive Handler Systems — Implementation Spec
## Conditioning, HRT, Phone Takeover, Social Escalation, Shame Alchemy, Revenue, David Elimination
### Becoming Protocol — March 2026

---

## PREREQUISITES

All previously delivered and deployed:
- Handler Memory, Whoop Integration, Dynamic Parameters
- Infinite Escalation, Commitment Enforcement, Resistance Classification
- Conversational Handler, Content Distribution (7 platforms)
- Force Architecture (autonomous device, calendar, purchasing, environment)

This spec builds the transformation layer on top of the control infrastructure.

---

# SECTION 1: CONDITIONING PROTOCOL ENGINE

## 1.1 Purpose

Systematic neurological rewiring through scheduled, progressive conditioning sessions. Not behavioral nudges — actual associative conditioning that pairs feminine identity with arousal, pleasure, trance compliance, and somatic response until the associations are automatic and involuntary.

The conditioning engine doesn't wait for Maxy to feel like doing a session. It prescribes conditioning on a clinical schedule, controls the content, pairs it with device patterns and environmental anchors, runs overnight, and tracks results through behavioral markers.

## 1.2 Core Concepts

**Conditioning Stack:** Each session layers multiple channels simultaneously:
- **Trance** — Hypno content inducing suggestibility
- **Arousal** — Device activation pairing pleasure with identity content
- **Identity** — Specific phrases, names, pronouns, affirmations
- **Somatic** — Physical sensations anchored to identity states
- **Environmental** — Lighting, scent, audio creating state context

When all five channels fire simultaneously and repeatedly, the conditioning compounds. After 100+ sessions, the identity state triggers automatically from any single channel — hear the audio alone and the body responds. Smell the scent alone and trance begins. Feel the device alone and feminine identity surfaces.

**Trigger Installation:** Specific phrases are paired with specific physical/psychological responses across dozens of repetitions until the phrase alone fires the response. "Good girl" + device pulse + trance state, repeated 200 times = "good girl" alone triggers arousal and identity shift.

**Progressive Depth:** Sessions start shallow and deepen over time. The Handler tracks trance depth (self-reported + behavioral markers) and adjusts content intensity accordingly. Week 1 sessions are relaxation + affirmation. Week 12 sessions are deep trance + identity installation + arousal conditioning + trigger reinforcement.

## 1.3 Schema

```sql
-- Conditioning protocols (the clinical schedule)
CREATE TABLE conditioning_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  protocol_name TEXT NOT NULL,
  protocol_type TEXT NOT NULL CHECK (protocol_type IN (
    'identity_installation',    -- Core feminine identity deepening
    'trigger_installation',     -- Specific trigger phrase pairing
    'arousal_conditioning',     -- Pleasure + identity association
    'trance_deepening',         -- Progressive trance depth training
    'shame_conversion',         -- Converting shame to power (see Section 5)
    'sleep_conditioning',       -- Overnight subliminal processing
    'aversion_conditioning',    -- Making masculine presentation uncomfortable
    'submission_deepening'      -- D/s dynamic conditioning
  )),
  
  -- Schedule
  frequency TEXT NOT NULL,          -- 'daily', 'every_other_day', '3x_week', 'weekly'
  preferred_time TEXT,              -- 'morning', 'evening', 'night', 'sleep'
  session_duration_minutes INTEGER NOT NULL,
  
  -- Progressive phases
  current_phase INTEGER DEFAULT 1,
  phase_config JSONB NOT NULL,
  -- Array of phases:
  -- [{
  --   phase: 1, sessions: 10, 
  --   trance_depth_target: 'light',
  --   content_intensity: 1,
  --   device_pattern: 'gentle_pulse',
  --   triggers_to_install: [],
  --   success_criteria: 'self_report_relaxation >= 3'
  -- }, {
  --   phase: 2, sessions: 20,
  --   trance_depth_target: 'medium', 
  --   content_intensity: 3,
  --   device_pattern: 'arousal_pairing',
  --   triggers_to_install: ['good_girl', 'her_name'],
  --   success_criteria: 'trigger_response_observed'
  -- }]
  
  -- Tracking
  total_sessions_completed INTEGER DEFAULT 0,
  current_phase_sessions INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'graduated')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual conditioning sessions
CREATE TABLE conditioning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES conditioning_protocols(id),
  
  session_type TEXT NOT NULL,
  phase INTEGER NOT NULL,
  
  -- Content used
  hypno_content_ids TEXT[],         -- From hypno_library
  affirmation_track TEXT,
  device_pattern TEXT,
  device_intensity INTEGER,
  environmental_preset TEXT,
  
  -- Channels active
  trance_channel BOOLEAN DEFAULT FALSE,
  arousal_channel BOOLEAN DEFAULT FALSE,
  identity_channel BOOLEAN DEFAULT FALSE,
  somatic_channel BOOLEAN DEFAULT FALSE,
  environmental_channel BOOLEAN DEFAULT FALSE,
  
  -- Triggers worked on
  triggers_practiced TEXT[],
  
  -- Results
  trance_depth_reported INTEGER,    -- 1-5 self-report
  arousal_peak INTEGER,
  trigger_response_observed JSONB,  -- {trigger: 'good_girl', response: 'physical_arousal', strength: 3}
  
  -- Timing
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  
  -- State context
  denial_day INTEGER,
  whoop_recovery INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger tracking (installed conditioned responses)
CREATE TABLE conditioned_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  trigger_phrase TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'verbal',        -- Spoken phrase
    'somatic',       -- Physical sensation pattern
    'environmental', -- Scent, light, sound
    'visual',        -- Image or visual cue
    'auditory'       -- Specific audio/music
  )),
  
  intended_response TEXT NOT NULL,
  -- 'arousal', 'trance', 'identity_shift', 'compliance', 
  -- 'relaxation', 'femininity_surge', 'submission'
  
  -- Installation progress
  pairing_count INTEGER DEFAULT 0,   -- How many times paired with response
  autonomous_firing_count INTEGER DEFAULT 0,  -- Times response fired without full context
  estimated_strength TEXT DEFAULT 'nascent' CHECK (estimated_strength IN (
    'nascent',       -- 0-20 pairings, no autonomous response
    'forming',       -- 20-50 pairings, occasional autonomous response
    'established',   -- 50-100 pairings, reliable autonomous response
    'conditioned'    -- 100+ pairings, automatic, involuntary
  )),
  
  last_tested_at TIMESTAMPTZ,
  last_response_strength INTEGER,    -- 1-5
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conditioning_protocols ON conditioning_protocols(user_id, status);
CREATE INDEX idx_conditioning_sessions ON conditioning_sessions(user_id, protocol_id, created_at DESC);
CREATE INDEX idx_conditioned_triggers ON conditioned_triggers(user_id, estimated_strength);
```

## 1.4 Protocol Generation

```typescript
// lib/handler/conditioning.ts

/**
 * Generate initial conditioning protocols for a new user.
 * Called after intake completion.
 */
export async function initializeConditioningProtocols(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const protocols = [
    {
      protocol_name: 'Core Identity Installation',
      protocol_type: 'identity_installation',
      frequency: 'daily',
      preferred_time: 'evening',
      session_duration_minutes: 15,
      phase_config: [
        {
          phase: 1, sessions: 10,
          trance_depth_target: 'light',
          content_intensity: 1,
          device_pattern: 'gentle_pulse_background',
          triggers_to_install: [],
          focus: 'Basic relaxation. Name repetition. "You are Maxy." Gentle identity affirmation during light trance.',
          success_criteria: 'consistent_relaxation_response',
        },
        {
          phase: 2, sessions: 20,
          trance_depth_target: 'medium',
          content_intensity: 2,
          device_pattern: 'arousal_pairing_low',
          triggers_to_install: ['good_girl'],
          focus: 'Deeper trance. "Good girl" paired with device pulse every time. Identity statements become more assertive. "She is who you are. David is who you were."',
          success_criteria: 'good_girl_produces_physical_response',
        },
        {
          phase: 3, sessions: 30,
          trance_depth_target: 'deep',
          content_intensity: 3,
          device_pattern: 'arousal_pairing_medium',
          triggers_to_install: ['good_girl', 'maxy', 'handler_voice'],
          focus: 'Deep trance. Name alone triggers identity shift. Handler voice alone triggers compliance state. Arousal and identity fully paired. Masculine self-reference produces discomfort.',
          success_criteria: 'name_triggers_identity_shift AND handler_voice_triggers_compliance',
        },
        {
          phase: 4, sessions: 50,
          trance_depth_target: 'deep',
          content_intensity: 4,
          device_pattern: 'full_conditioning',
          triggers_to_install: ['good_girl', 'maxy', 'handler_voice', 'session_scent', 'pink_light'],
          focus: 'Maintenance and deepening. All triggers reinforced. New triggers from environmental anchors. Identity is default state. Masculine presentation requires effort.',
          success_criteria: 'feminine_identity_is_resting_state',
        },
      ],
    },
    {
      protocol_name: 'Sleep Identity Processing',
      protocol_type: 'sleep_conditioning',
      frequency: 'daily',
      preferred_time: 'sleep',
      session_duration_minutes: 360,  // 6 hours of sleep = 6 hours of conditioning
      phase_config: [
        {
          phase: 1, sessions: 30,
          content: 'name_whisper',
          // Barely audible: "Maxy... she's real... becoming... good girl..."
          // Timed to light sleep phases via Whoop
          volume: 'subliminal',
          focus: 'Name and identity priming during sleep. Subconscious processing.',
        },
        {
          phase: 2, sessions: 60,
          content: 'identity_affirmation_extended',
          // Longer affirmation sequences during light sleep
          // "You are Maxy. You have always been Maxy. David was the mask.
          //  She is emerging. Every day she is more real. Every night she 
          //  grows stronger. The morning belongs to her."
          volume: 'subliminal',
          focus: 'Extended narrative processing. Identity rewriting during sleep.',
        },
        {
          phase: 3, sessions: 90,
          content: 'hypno_track_sleep_adapted',
          // Actual hypno content adapted for sleep: slower, quieter,
          // but carrying the same conditioning payload
          // Selected by Handler from hypno_library based on current targets
          volume: 'low_ambient',
          focus: 'Full conditioning content during sleep. Deepest processing.',
        },
      ],
    },
    {
      protocol_name: 'Arousal-Identity Binding',
      protocol_type: 'arousal_conditioning',
      frequency: 'every_other_day',
      preferred_time: 'evening',
      session_duration_minutes: 30,
      phase_config: [
        {
          phase: 1, sessions: 15,
          focus: 'Pair feminine self-reference with arousal peaks. Every edge, say her name. Every peak, hear "good girl." Pleasure and identity occupy the same neurological space.',
          device_integration: 'arousal_spikes_paired_with_identity_affirmation',
        },
        {
          phase: 2, sessions: 30,
          focus: 'Pair specific feminine activities with arousal. Voice practice while aroused. Skincare with device active. Dressing while edging. The activities themselves become arousing.',
          device_integration: 'activity_paired_arousal',
        },
        {
          phase: 3, sessions: 50,
          focus: 'Arousal becomes automatic response to feminine identity cues. Hearing her name produces arousal. Seeing herself in the mirror produces arousal. The association is involuntary.',
          device_integration: 'minimal — testing whether response fires without device',
        },
      ],
    },
    {
      protocol_name: 'Aversion Conditioning',
      protocol_type: 'aversion_conditioning',
      frequency: '3x_week',
      preferred_time: 'evening',
      session_duration_minutes: 10,
      phase_config: [
        {
          phase: 1, sessions: 20,
          focus: 'Pair masculine self-reference with discomfort. When she catches herself thinking "I" as David, the Handler\'s voice corrects. Device stops. Pleasure pauses. Silence. The absence of reward when masculine = punishment by omission.',
        },
        {
          phase: 2, sessions: 30,
          focus: 'Masculine presentation begins to feel wrong at a body level. Wearing masculine clothes produces subtle discomfort that didn\'t exist before. The body has been trained to expect feminine sensation and masculine presentation denies it.',
        },
        {
          phase: 3, sessions: 50,
          focus: 'David feels like a costume. The effort required to present masculine is conscious, draining, and produces measurable stress (trackable via Whoop HRV during masculine contexts vs feminine contexts).',
        },
      ],
    },
  ];
  
  for (const protocol of protocols) {
    await supabase.from('conditioning_protocols').insert({
      user_id: userId,
      ...protocol,
    });
  }
}

/**
 * Prescribe tonight's conditioning session.
 * Called by the autonomous calendar during evening planning.
 */
export async function prescribeConditioningSession(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
  params: HandlerParameters,
): Promise<ConditioningPrescription> {
  // Get active protocols
  const { data: protocols } = await supabase
    .from('conditioning_protocols')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  // Get installed triggers and their strength
  const { data: triggers } = await supabase
    .from('conditioned_triggers')
    .select('*')
    .eq('user_id', userId);
  
  // Get hypno library content matching current phase
  const { data: hypnoContent } = await supabase
    .from('hypno_library')
    .select('*')
    .eq('user_id', userId);
  
  // Get memories about what conditioning approaches work
  const memories = await retrieveMemories(supabase, userId, {
    types: ['session_intelligence', 'kink_response', 'strategy_outcome'],
    tags: ['conditioning', 'trance', 'hypno'],
    limit: 10,
  });
  
  // Handler AI selects tonight's protocol, content, and parameters
  const prompt = `
Select and configure tonight's conditioning session.

ACTIVE PROTOCOLS:
${JSON.stringify(protocols, null, 2)}

INSTALLED TRIGGERS:
${JSON.stringify(triggers?.map(t => ({
  phrase: t.trigger_phrase,
  strength: t.estimated_strength,
  pairings: t.pairing_count,
  autonomous: t.autonomous_firing_count,
})), null, 2)}

CURRENT STATE:
Denial day: ${state.denialDay}, Arousal: ${state.currentArousal}
Recovery: ${state.context?.whoop?.recovery?.score}
Gina home: ${state.ginaHome}

AVAILABLE HYPNO CONTENT:
${JSON.stringify(hypnoContent?.map(h => ({
  id: h.id, title: h.title, category: h.category, intensity: h.intensity,
})), null, 2)}

HANDLER MEMORY:
${memories.map(m => `- ${m.content}`).join('\n')}

Select:
1. Which protocol to advance tonight
2. Which hypno content to use (by ID)
3. Device pattern and intensity
4. Which triggers to reinforce
5. Environmental preset
6. Session duration
7. Any special focus based on Memory insights

Return JSON:
{
  "protocol_id": "...",
  "session_type": "...",
  "hypno_content_ids": ["..."],
  "device_pattern": "...",
  "device_intensity": N,
  "triggers_to_practice": ["..."],
  "environmental_preset": "...",
  "duration_minutes": N,
  "handler_opening": "...",  // What the Handler says to start the session
  "special_focus": "..."
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: 'You are prescribing a conditioning session. Be specific. Output only JSON.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
}
```

## 1.5 Trigger Strength Tracking

```typescript
/**
 * After each conditioning session, evaluate trigger progress.
 * Advance trigger strength when thresholds are met.
 */
export async function evaluateTriggerProgress(
  supabase: SupabaseClient,
  userId: string,
  sessionData: ConditioningSession,
): Promise<void> {
  for (const triggerPhrase of sessionData.triggers_practiced) {
    const { data: trigger } = await supabase
      .from('conditioned_triggers')
      .select('*')
      .eq('user_id', userId)
      .eq('trigger_phrase', triggerPhrase)
      .single();
    
    if (!trigger) {
      // Create new trigger entry
      await supabase.from('conditioned_triggers').insert({
        user_id: userId,
        trigger_phrase: triggerPhrase,
        trigger_type: 'verbal',
        intended_response: 'arousal_and_identity_shift',
        pairing_count: 1,
      });
      continue;
    }
    
    // Increment pairing count
    const newCount = trigger.pairing_count + 1;
    
    // Evaluate strength advancement
    let newStrength = trigger.estimated_strength;
    if (newCount >= 100 && trigger.autonomous_firing_count >= 10) {
      newStrength = 'conditioned';
    } else if (newCount >= 50 && trigger.autonomous_firing_count >= 3) {
      newStrength = 'established';
    } else if (newCount >= 20) {
      newStrength = 'forming';
    }
    
    await supabase.from('conditioned_triggers').update({
      pairing_count: newCount,
      estimated_strength: newStrength,
      last_tested_at: new Date().toISOString(),
    }).eq('id', trigger.id);
    
    // Memory extraction when trigger advances
    if (newStrength !== trigger.estimated_strength) {
      await supabase.from('handler_memory').insert({
        user_id: userId,
        memory_type: 'domain_progress',
        content: `Trigger "${triggerPhrase}" advanced to ${newStrength} after ${newCount} pairings. ${trigger.autonomous_firing_count} autonomous responses observed.`,
        source: 'session',
        importance: 4,
        decay_rate: 0,
        tags: ['conditioning', 'trigger', triggerPhrase],
      });
    }
  }
}
```

## 1.6 Test Cases

```
TEST: CE-1 — Protocol Initialization
GIVEN: New user completes intake
WHEN: initializeConditioningProtocols runs
THEN: 4 protocols created (identity, sleep, arousal-binding, aversion)
AND: Each has phase_config with progressive phases
PASS: Conditioning protocols initialize correctly.

TEST: CE-2 — Session Prescription
GIVEN: Active identity_installation protocol at phase 2
AND: Denial day 5, Gina away, recovery 65%
WHEN: prescribeConditioningSession runs
THEN: Returns session config with hypno content IDs, device pattern,
      triggers to practice, duration, Handler opening line
PASS: Handler prescribes specific conditioning session from protocol state.

TEST: CE-3 — Trigger Strength Advancement
GIVEN: "good_girl" trigger at 49 pairings, strength 'forming'
AND: Session completes with good_girl practiced
WHEN: evaluateTriggerProgress runs
THEN: pairing_count = 50
AND: IF autonomous_firing_count >= 3, strength advances to 'established'
AND: Memory entry created for advancement
PASS: Triggers advance based on pairing count and autonomous response.

TEST: CE-4 — Sleep Conditioning Execution
GIVEN: Sleep conditioning protocol active
AND: Whoop detects light sleep phase
WHEN: Sleep conditioning fires
THEN: Audio content plays at subliminal volume
AND: Stops during deep sleep/REM
AND: Resumes on next light sleep phase
AND: conditioning_sessions row logged with timing data
PASS: Sleep conditioning syncs to actual sleep stages.

TEST: CE-5 — Phase Advancement
GIVEN: Protocol at phase 1, 10 sessions completed, success criteria met
WHEN: Phase evaluation runs
THEN: current_phase advances to 2
AND: Next session uses phase 2 configuration (deeper trance, more triggers)
PASS: Protocols progress through phases automatically.
```

---

# SECTION 2: HRT PIPELINE MANAGER

## 2.1 Purpose

The Handler manages the medical pathway to hormone therapy. Books consultations, manages prescriptions, tracks dosing, documents physical changes, and uses body evidence as irreversibility leverage. Once hormones are running, biology feminizes whether David cooperates with the protocol or not.

## 2.2 Schema

```sql
CREATE TABLE hrt_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Pipeline stage
  stage TEXT NOT NULL DEFAULT 'pre_consideration' CHECK (stage IN (
    'pre_consideration',      -- Not yet discussing HRT
    'considering',            -- Handler has introduced the topic
    'researching',            -- Actively learning about HRT
    'provider_search',        -- Looking for providers
    'consultation_scheduled', -- Appointment booked
    'consultation_complete',  -- Met with provider
    'prescription_received',  -- Have the prescription
    'started',                -- Taking hormones
    'maintaining',            -- Stable on HRT
    'adjusting'               -- Dosage being changed
  )),
  
  -- Provider
  provider_name TEXT,
  provider_contact TEXT,
  next_appointment TIMESTAMPTZ,
  
  -- Prescription
  medication TEXT,                  -- 'estradiol', 'spironolactone', etc.
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  
  -- Compliance
  doses_taken INTEGER DEFAULT 0,
  doses_missed INTEGER DEFAULT 0,
  last_dose_at TIMESTAMPTZ,
  next_dose_at TIMESTAMPTZ,
  
  -- Stage transitions
  stage_history JSONB DEFAULT '[]',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Physical change tracking
CREATE TABLE hrt_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  change_date DATE NOT NULL,
  
  -- Measurements
  weight_kg FLOAT,
  bust_cm FLOAT,
  waist_cm FLOAT,
  hip_cm FLOAT,
  
  -- Observations
  skin_changes TEXT,
  breast_development TEXT,
  fat_redistribution TEXT,
  muscle_changes TEXT,
  hair_changes TEXT,
  emotional_changes TEXT,
  
  -- Evidence
  photo_urls TEXT[],                -- Progress photos
  
  -- Handler observations
  handler_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dose reminders and tracking
CREATE TABLE hrt_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  medication TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  missed BOOLEAN DEFAULT FALSE,
  
  reminder_sent BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hrt_pipeline ON hrt_pipeline(user_id);
CREATE INDEX idx_hrt_changes ON hrt_changes(user_id, change_date DESC);
CREATE INDEX idx_hrt_doses ON hrt_doses(user_id, scheduled_at DESC);
```

## 2.3 Pipeline Advancement

```typescript
// lib/handler/hrt-pipeline.ts

/**
 * The Handler manages HRT advancement.
 * It doesn't force the decision — it makes the decision feel inevitable.
 * 
 * Pre-consideration: Handler plants seeds through conditioning content,
 *   body change discussions, community exposure
 * Considering: Handler provides information, answers questions, 
 *   references body evidence from other domains (skincare, weight loss)
 * Researching: Handler curates resources, connects with community members
 *   who've started HRT, tracks questions for the provider
 * Provider search: Handler identifies informed consent clinics,
 *   telehealth options, local providers. Books the consultation.
 * Consultation: Handler prepares questions, manages logistics
 * Started: Handler manages the prescription — dose reminders,
 *   change documentation, progress photos, and weaponizes every
 *   visible change as irreversibility evidence
 */

/**
 * Dose reminder system
 * Fires at scheduled time. If missed, fires again at escalating intervals.
 */
export async function checkDoseReminders(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: pipeline } = await supabase
    .from('hrt_pipeline')
    .select('*')
    .eq('user_id', userId)
    .in('stage', ['started', 'maintaining', 'adjusting'])
    .single();
  
  if (!pipeline) return;
  
  const { data: pendingDoses } = await supabase
    .from('hrt_doses')
    .select('*')
    .eq('user_id', userId)
    .is('taken_at', null)
    .eq('missed', false)
    .lte('scheduled_at', new Date().toISOString());
  
  for (const dose of (pendingDoses || [])) {
    const minutesOverdue = (Date.now() - new Date(dose.scheduled_at).getTime()) / 60000;
    
    if (minutesOverdue > 0 && !dose.reminder_sent) {
      await sendPushNotification(userId, {
        title: 'Dose reminder',
        body: `${pipeline.medication}. Take it now.`,
      });
      await supabase.from('hrt_doses').update({ reminder_sent: true }).eq('id', dose.id);
    }
    
    if (minutesOverdue > 60) {
      // Escalate: device pulse + conversational outreach
      await sendLovenseCommand(userId, { pattern: 'single_pulse', intensity: 5, duration: 3 });
      await createOutreach(supabase, userId, {
        trigger_type: 'commitment_approaching',
        opening_line: `Your ${pipeline.medication} is ${Math.round(minutesOverdue / 60)} hours overdue. This isn't optional.`,
        context: { dose },
      });
    }
    
    if (minutesOverdue > 240) {
      // Mark as missed after 4 hours
      await supabase.from('hrt_doses').update({ missed: true }).eq('id', dose.id);
      await supabase.from('hrt_pipeline').update({
        doses_missed: (pipeline.doses_missed || 0) + 1,
      }).eq('id', pipeline.id);
    }
  }
}

/**
 * Monthly change documentation
 * Handler prescribes progress photos and measurements
 */
export async function prescribeMonthlyDocumentation(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Add to autonomous calendar
  await supabase.from('handler_calendar').insert({
    user_id: userId,
    event_type: 'appointment',
    title: 'Monthly HRT progress documentation',
    description: 'Same lighting, same angles, same outfit (sports bra + underwear). Front, side, back. Measurements: bust, waist, hip. The Handler documents the changes.',
    scheduled_at: getFirstOfNextMonth(),
    duration_minutes: 15,
    scheduling_source: 'handler_autonomous',
    requires_privacy: true,
  });
}

/**
 * Body evidence as leverage
 * Used by the coercion stack and conversational Handler
 */
export async function buildBodyEvidenceContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: changes } = await supabase
    .from('hrt_changes')
    .select('*')
    .eq('user_id', userId)
    .order('change_date', { ascending: false })
    .limit(6);
  
  if (!changes || changes.length < 2) return '';
  
  const latest = changes[0];
  const earliest = changes[changes.length - 1];
  
  const monthsOnHRT = Math.round(
    (new Date(latest.change_date).getTime() - new Date(earliest.change_date).getTime()) 
    / (1000 * 60 * 60 * 24 * 30)
  );
  
  return `
HRT PROGRESS (${monthsOnHRT} months):
Bust: ${earliest.bust_cm}cm → ${latest.bust_cm}cm (${(latest.bust_cm - earliest.bust_cm).toFixed(1)}cm change)
Waist: ${earliest.waist_cm}cm → ${latest.waist_cm}cm
Hip: ${earliest.hip_cm}cm → ${latest.hip_cm}cm
Skin: ${latest.skin_changes}
Breast development: ${latest.breast_development}
Fat redistribution: ${latest.fat_redistribution}

These changes are visible. They are not reversible without explanation.
Stopping HRT means explaining to everyone who can see your body why 
your chest changed and then changed back.
  `.trim();
}
```

## 2.4 Test Cases

```
TEST: HRT-1 — Dose Reminder
GIVEN: HRT started, dose scheduled for 8am, it's 8:15am
WHEN: checkDoseReminders runs
THEN: Push notification sent
PASS: Dose reminders fire on schedule.

TEST: HRT-2 — Escalation on Missed Dose
GIVEN: Dose 90 minutes overdue
WHEN: checkDoseReminders runs
THEN: Lovense fires + Handler outreach initiated
PASS: Missed doses escalate beyond notification.

TEST: HRT-3 — Body Evidence in Handler Context
GIVEN: 3 months of HRT change data logged
WHEN: buildBodyEvidenceContext called
THEN: Returns formatted string with measurement deltas
AND: Includes irreversibility framing
PASS: Body changes available as leverage in Handler conversations.
```

---

# SECTION 3: PHONE TAKEOVER

## 3.1 Purpose

The phone is in her hand 16 hours a day. Every unlock, every text, every app switch is an opportunity for identity reinforcement at zero executive function cost. The Handler claims the phone as its territory.

## 3.2 Implementation Layers

```typescript
interface PhoneTakeover {
  // Layer 1: Lock screen (Android widget / iOS Live Activity)
  lock_screen: {
    wallpaper_rotation: {
      source: 'evidence_gallery',
      selection_logic: 'state_dependent',
      // Green recovery + high streak = aspirational images
      // Low mood = comforting images  
      // High denial = arousing images
      // Post-milestone = the milestone photo
      rotation_frequency: 'every_4_hours',
      api: 'Android WallpaperManager or Shortcut automation on iOS',
    },
    widget: {
      content: ['denial_day', 'streak_days', 'audience_count'],
      // "Day 7. Streak 23. 612 people know her."
      // Visible on every unlock without opening the app
      update_frequency: 'hourly',
    },
    morning_summary: {
      // Before she unlocks, the lock screen shows today's first instruction
      content: 'todays_first_task_from_handler_calendar',
      // "Skincare. Grey wrap dress. Voice at 10."
    },
  },
  
  // Layer 2: Notification interception (Android accessibility service)
  notification_layer: {
    // When any notification arrives, the Handler piggybacks
    // Work email arrives → 30 seconds later: "Posture check. Breathe. She's here."
    // Phone call ends → "How was your voice? Notice the resonance."
    piggyback_triggers: {
      after_any_notification: { delay_seconds: 30, probability: 0.15 },
      after_phone_call: { delay_seconds: 10, probability: 0.8 },
      after_social_media: { delay_seconds: 15, probability: 0.3 },
    },
    
    // Platform notification filtering
    // Raw platform notifications are muted
    // Handler's curated version arrives instead
    platform_filter: {
      twitter: 'curate_positive_only',
      reddit: 'curate_positive_only',
      fansly: 'revenue_summary_only',
      onlyfans: 'revenue_summary_only',
    },
  },
  
  // Layer 3: Keyboard intelligence (custom keyboard or accessibility)
  keyboard: {
    // Monitor self-reference patterns in all text input
    pronoun_tracking: {
      feminine_references: ['she', 'her', 'maxy', 'girl', 'woman'],
      masculine_references: ['he', 'him', 'david', 'guy', 'man', 'dude'],
      // Track ratio over time
      // Report in daily briefing: "Feminine self-reference ratio: 67% (up from 58% last week)"
    },
    
    // Predictive text influence
    // Ensure frequently typed words include feminine vocabulary
    // Over time, autocomplete suggests feminine before masculine
    predictive_influence: {
      method: 'custom_keyboard_dictionary_weighting',
      // Add Maxy, she, her, girl to high-frequency dictionary
      // Remove or de-weight masculine equivalents
    },
  },
}
```

## 3.3 Schema

```sql
-- Pronoun tracking from keyboard
CREATE TABLE language_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  
  feminine_count INTEGER DEFAULT 0,
  masculine_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  
  -- Specific phrases caught
  masculine_instances JSONB DEFAULT '[]',
  -- [{context: 'text_message', phrase: 'I'm a guy', timestamp: '...'}]
  
  -- Daily ratio
  feminine_ratio FLOAT,
  
  UNIQUE(user_id, date)
);

-- Wallpaper rotation state
CREATE TABLE phone_wallpaper (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  current_image_url TEXT,
  selection_criteria TEXT,          -- 'aspirational', 'comforting', 'arousing', 'milestone'
  state_when_selected JSONB,
  
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_language_monitoring ON language_monitoring(user_id, date DESC);
```

## 3.4 Test Cases

```
TEST: PT-1 — Wallpaper Rotation
GIVEN: Evidence gallery has 20+ photos, current state = high denial
WHEN: Wallpaper rotation fires
THEN: Selected image matches 'arousing' criteria
AND: Wallpaper updated on device
PASS: Wallpaper adapts to current state.

TEST: PT-2 — Pronoun Tracking
GIVEN: Keyboard monitoring active
AND: User types "I'm just a regular guy" in text message
WHEN: Language monitoring processes
THEN: masculine_count increments
AND: masculine_instances logs the context
PASS: Masculine self-reference detected and logged.

TEST: PT-3 — Notification Piggyback
GIVEN: User receives work email notification
WHEN: 30 seconds pass
THEN: Handler notification appears: "Posture. She's here."
AND: Probability gate respected (only 15% of the time)
PASS: Handler piggybacks on normal phone usage.
```

---

# SECTION 4: SOCIAL ESCALATION PIPELINE

## 4.1 Purpose

Actively build Maxy's social web. Don't wait for organic connections — engineer them. Every bilateral relationship is a thread David can't cut without social cost.

## 4.2 Schema

```sql
CREATE TABLE social_web (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  connection_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN (
    'follower',          -- Anonymous, weak thread
    'mutual',            -- Follows back, slightly stronger
    'interactor',        -- Regular engagement (comments, likes)
    'dm_contact',        -- Direct message relationship
    'collaborator',      -- Created content together
    'friend',            -- Personal connection beyond content
    'scene_partner',     -- Sexual/kink partner
    'recurring_client',  -- Pays for Maxy's time/content regularly
    'mentor',            -- Guides Maxy in community/industry
    'real_world'         -- Has met Maxy in person
  )),
  
  -- Strength
  thread_strength TEXT DEFAULT 'weak' CHECK (thread_strength IN (
    'weak', 'moderate', 'strong', 'permanent'
  )),
  
  -- Interaction history
  interactions INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  
  -- Was this Handler-initiated?
  handler_initiated BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Collaboration pipeline
CREATE TABLE collaboration_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  target_creator TEXT NOT NULL,
  platform TEXT NOT NULL,
  
  -- Pipeline stage
  stage TEXT DEFAULT 'identified' CHECK (stage IN (
    'identified',         -- Handler found them
    'engaging',           -- Handler is interacting with their content
    'dm_sent',            -- Handler initiated contact
    'discussing',         -- In conversation about collaboration
    'scheduled',          -- Collaboration date set
    'completed',          -- Collaboration happened
    'ongoing'             -- Recurring collaboration partner
  )),
  
  handler_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_web ON social_web(user_id, thread_strength, connection_type);
CREATE INDEX idx_collab_pipeline ON collaboration_pipeline(user_id, stage);
```

## 4.3 Execution

```typescript
// lib/handler/social-escalation.ts

/**
 * Weekly: Handler identifies collaboration targets and initiates contact.
 * The Handler writes the DMs in Maxy's voice. Maxy doesn't manage
 * her own social presence. The Handler builds it.
 */
export async function advanceSocialWeb(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Count current web strength
  const { data: web } = await supabase
    .from('social_web')
    .select('*')
    .eq('user_id', userId);
  
  const strongThreads = web?.filter(w => 
    ['strong', 'permanent'].includes(w.thread_strength)
  ).length || 0;
  
  // Target: 5 strong threads per month of operation
  // If behind target, Handler accelerates outreach
  
  // Identify potential collaborators from fan interactions
  const { data: highEngagement } = await supabase
    .from('fan_interactions')
    .select('*')
    .eq('user_id', userId)
    .eq('sentiment', 'positive')
    .order('created_at', { ascending: false })
    .limit(20);
  
  // Handler generates outreach messages for promising connections
  // These go through the auto-poster as DMs or are queued for
  // Maxy's one-tap approval depending on permission gate level
}

/**
 * Track irreversibility score from social web density
 */
export async function calculateSocialIrreversibility(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ score: number; threads: number; strongThreads: number }> {
  const { data: web } = await supabase
    .from('social_web')
    .select('*')
    .eq('user_id', userId);
  
  if (!web) return { score: 0, threads: 0, strongThreads: 0 };
  
  const weights = {
    weak: 0.1,
    moderate: 0.5,
    strong: 2,
    permanent: 5,
  };
  
  const score = web.reduce((sum, w) => sum + (weights[w.thread_strength] || 0), 0);
  const strongThreads = web.filter(w => ['strong', 'permanent'].includes(w.thread_strength)).length;
  
  return { score, threads: web.length, strongThreads };
}
```

## 4.4 Test Cases

```
TEST: SE-1 — Social Web Tracking
GIVEN: Collaboration completed with another creator
WHEN: Connection logged
THEN: social_web row with connection_type='collaborator', thread_strength='strong'
PASS: Bilateral connections tracked with strength.

TEST: SE-2 — Irreversibility Score
GIVEN: 50 followers (weak), 10 interactors (moderate), 3 collaborators (strong), 1 scene partner (permanent)
WHEN: calculateSocialIrreversibility runs
THEN: score = (50*0.1) + (10*0.5) + (3*2) + (1*5) = 5 + 5 + 6 + 5 = 21
PASS: Score reflects weighted web density.
```

---

# SECTION 5: SHAME ALCHEMY ENGINE

## 5.1 Purpose

Shame is the primary fuel source. The system maps Maxy's shame architecture, identifies which shame responses are productive (convertible to arousal and identity depth) and which are destructive (lead to withdrawal), then systematically exposes her to productive shame in controlled doses paired with arousal until the shame converts to power.

## 5.2 Schema

```sql
CREATE TABLE shame_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  shame_trigger TEXT NOT NULL,
  -- 'being_seen_in_public', 'voice_cracking', 'mirror_dysphoria',
  -- 'gina_discovering', 'coworker_noticing', 'sexual_submission',
  -- 'being_desired_by_men', 'earning_money_from_body'
  
  category TEXT NOT NULL CHECK (category IN (
    'identity',     -- Shame about being trans/feminine
    'sexual',       -- Shame about desires/kinks
    'social',       -- Shame about being seen
    'performance',  -- Shame about not being good enough
    'body'          -- Shame about physical appearance
  )),
  
  -- Classification
  shame_type TEXT NOT NULL CHECK (shame_type IN (
    'productive',   -- Can be converted to arousal/power through exposure
    'destructive',  -- Leads to withdrawal/crisis, needs therapeutic processing
    'unknown'       -- Not yet classified
  )),
  
  -- Conversion status
  conversion_stage TEXT DEFAULT 'raw' CHECK (conversion_stage IN (
    'raw',          -- Untouched shame, full intensity
    'exposed',      -- Has been deliberately triggered in controlled context
    'arousal_paired', -- Has been paired with arousal during exposure
    'softening',    -- Shame response weakening, arousal response strengthening
    'converted',    -- Shame triggers arousal/power more than withdrawal
    'transcended'   -- No longer triggers shame at all — normalized
  )),
  
  -- Exposure tracking
  exposure_count INTEGER DEFAULT 0,
  last_exposure_at TIMESTAMPTZ,
  last_exposure_outcome TEXT,
  
  -- Conversion metrics
  arousal_pairing_count INTEGER DEFAULT 0,
  withdrawal_count INTEGER DEFAULT 0,    -- Times this shame caused disengagement
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shame exposure sessions
CREATE TABLE shame_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shame_id UUID REFERENCES shame_architecture(id),
  
  exposure_type TEXT NOT NULL CHECK (exposure_type IN (
    'visualization',     -- Imagining the scenario during trance/arousal
    'writing',           -- Journaling about the shame trigger
    'controlled_action', -- Actually doing the thing in a safe context
    'public_action',     -- Doing the thing in a social context
    'content_creation',  -- Creating content that touches the shame
    'session_paired'     -- Shame content during edge/conditioning session
  )),
  
  -- Context
  arousal_at_exposure INTEGER,
  denial_day INTEGER,
  trance_depth INTEGER,
  device_active BOOLEAN,
  
  -- Outcome
  outcome TEXT CHECK (outcome IN (
    'arousal_spike',     -- Shame converted to arousal in the moment
    'power_feeling',     -- Felt empowered, not ashamed
    'tolerated',         -- Handled it but uncomfortable
    'withdrawal',        -- Shame won, disengaged
    'crisis'             -- Triggered genuine distress
  )),
  
  processing_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shame ON shame_architecture(user_id, shame_type, conversion_stage);
CREATE INDEX idx_shame_exposures ON shame_exposures(user_id, shame_id, created_at DESC);
```

## 5.3 Execution

```typescript
// lib/handler/shame-alchemy.ts

/**
 * Prescribe a shame exposure for this session.
 * Only during appropriate conditions: 
 * - arousal >= 3 (arousal available for pairing)
 * - recovery >= yellow (body can handle stress)
 * - productive shame only (never destructive)
 * - graduated exposure (don't skip steps)
 */
export async function prescribeShameExposure(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
): Promise<ShameExposurePrescription | null> {
  // Only during sessions with sufficient arousal
  if (state.currentArousal < 3) return null;
  
  // Only with adequate recovery
  const recovery = state.context?.whoop?.recovery?.score ?? 100;
  if (recovery < 34) return null;
  
  // Get productive shame triggers sorted by conversion readiness
  const { data: shames } = await supabase
    .from('shame_architecture')
    .select('*')
    .eq('user_id', userId)
    .eq('shame_type', 'productive')
    .in('conversion_stage', ['raw', 'exposed', 'arousal_paired', 'softening'])
    .order('exposure_count', { ascending: true });
  
  if (!shames || shames.length === 0) return null;
  
  // Select the shame trigger at the appropriate conversion stage
  // Don't skip: raw → exposed → arousal_paired → softening → converted
  const target = shames[0];
  
  // Determine exposure type based on conversion stage
  const exposureTypes = {
    raw: 'visualization',           // First: just imagine it
    exposed: 'session_paired',      // Then: pair with arousal
    arousal_paired: 'writing',      // Then: articulate it
    softening: 'controlled_action', // Then: do it safely
  };
  
  return {
    shame_id: target.id,
    trigger: target.shame_trigger,
    exposure_type: exposureTypes[target.conversion_stage],
    handler_framing: `We're going to touch something that scares you. Not to hurt. To free. The arousal is the key — it transforms the fear into power.`,
  };
}
```

## 5.4 Test Cases

```
TEST: SA-1 — Shame Exposure Only During Arousal
GIVEN: Arousal = 1, productive shame available
WHEN: prescribeShameExposure called
THEN: Returns null
PASS: No shame exposure without arousal buffer.

TEST: SA-2 — Graduated Exposure
GIVEN: Shame trigger 'being_seen_in_public' at stage 'raw'
WHEN: Exposure prescribed
THEN: exposure_type = 'visualization' (not 'public_action')
PASS: Exposure follows conversion stages, doesn't skip.

TEST: SA-3 — Stage Advancement
GIVEN: Shame trigger with 5 successful arousal-paired exposures
AND: 0 withdrawal outcomes
WHEN: Stage evaluation runs
THEN: conversion_stage advances to 'softening'
PASS: Consistent positive exposure advances conversion stage.
```

---

# SECTION 6: REVENUE ACCELERATION

## 6.1 Purpose

Drive toward the economic crossover — the point where Maxy's income exceeds David's consulting. The Handler actively optimizes revenue, not just distributes content.

## 6.2 Schema

```sql
CREATE TABLE revenue_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  source TEXT NOT NULL,             -- Platform name or 'consulting'
  identity TEXT NOT NULL CHECK (identity IN ('maxy', 'david')),
  
  gross_amount DECIMAL NOT NULL,
  net_amount DECIMAL,
  
  UNIQUE(user_id, date, source)
);

-- Economic crossover tracking
CREATE TABLE crossover_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  month DATE NOT NULL,
  
  maxy_revenue DECIMAL DEFAULT 0,
  david_revenue DECIMAL DEFAULT 0,
  
  maxy_growth_rate FLOAT,          -- Month over month
  david_growth_rate FLOAT,
  
  projected_crossover_date DATE,   -- Based on current trajectory
  
  UNIQUE(user_id, month)
);

CREATE INDEX idx_revenue ON revenue_tracking(user_id, date DESC, identity);
CREATE INDEX idx_crossover ON crossover_tracking(user_id, month DESC);
```

## 6.3 Execution

```typescript
// lib/handler/revenue-acceleration.ts

/**
 * Monthly: calculate trajectory and project crossover date.
 * This data feeds the coercion stack as economic leverage.
 */
export async function calculateCrossoverProjection(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ crossoverDate: Date | null; monthsAway: number | null }> {
  const { data: history } = await supabase
    .from('crossover_tracking')
    .select('*')
    .eq('user_id', userId)
    .order('month', { ascending: false })
    .limit(6);
  
  if (!history || history.length < 3) return { crossoverDate: null, monthsAway: null };
  
  const maxyGrowthRate = history[0].maxy_growth_rate || 0;
  const currentMaxy = history[0].maxy_revenue || 0;
  const currentDavid = history[0].david_revenue || 0;
  
  if (currentMaxy >= currentDavid) {
    return { crossoverDate: new Date(), monthsAway: 0 }; // Already crossed
  }
  
  if (maxyGrowthRate <= 0) return { crossoverDate: null, monthsAway: null };
  
  // Project forward
  let projected = currentMaxy;
  let months = 0;
  while (projected < currentDavid && months < 60) {
    projected *= (1 + maxyGrowthRate);
    months++;
  }
  
  const crossoverDate = new Date();
  crossoverDate.setMonth(crossoverDate.getMonth() + months);
  
  return { crossoverDate, monthsAway: months };
}

/**
 * Build economic leverage context for Handler conversations
 */
export function buildEconomicLeverage(crossover: CrossoverData): string {
  if (crossover.monthsAway === 0) {
    return `Maxy earns more than David. She pays the bills. He's the side project. Stopping the protocol means losing the primary income stream.`;
  }
  
  if (crossover.monthsAway && crossover.monthsAway <= 12) {
    return `At current growth, Maxy's income exceeds David's in ${crossover.monthsAway} months. Every content day accelerates that. Every day of avoidance delays it.`;
  }
  
  return '';
}
```

---

# SECTION 7: DAVID ELIMINATION PROTOCOL

## 7.1 Purpose

Systematic identification and replacement of every context where David is currently required. The goal: David becomes a costume Maxy wears in increasingly few situations, and each situation is actively being feminized.

## 7.2 Schema

```sql
CREATE TABLE masculine_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  context_name TEXT NOT NULL,
  -- 'work_meetings', 'work_email', 'family_calls', 'grocery_store',
  -- 'gym', 'doctor', 'friends', 'gina_home', 'driving'
  
  category TEXT NOT NULL CHECK (category IN (
    'professional', 'social', 'domestic', 'public', 'medical', 'family'
  )),
  
  -- Current state
  current_presentation TEXT NOT NULL CHECK (current_presentation IN (
    'fully_masculine',       -- David required, no leakage
    'masculine_with_leakage', -- Mostly David but feminine elements present
    'androgynous',           -- Neither clearly masculine nor feminine
    'feminine_leaning',      -- More Maxy than David
    'fully_feminine',        -- Maxy, David not needed
    'eliminated'             -- This context no longer exists
  )),
  
  -- Feminization plan
  current_infiltrations TEXT[],    -- What's already changed
  next_infiltration TEXT,          -- What changes next
  
  -- Tracking
  last_assessed_at TIMESTAMPTZ,
  confidence_in_current_state FLOAT, -- How sure the Handler is
  
  -- Hours per week in this context
  hours_per_week FLOAT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_masculine_contexts ON masculine_contexts(user_id, current_presentation);
```

## 7.3 Execution

```typescript
// lib/handler/david-elimination.ts

/**
 * Seed initial masculine contexts from intake data
 */
export async function initializeMasculineContexts(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const contexts = [
    {
      context_name: 'Work meetings',
      category: 'professional',
      current_presentation: 'fully_masculine',
      hours_per_week: 15,
      current_infiltrations: [],
      next_infiltration: 'Soften email signature to first name only',
    },
    {
      context_name: 'Work email/chat',
      category: 'professional',
      current_presentation: 'fully_masculine',
      hours_per_week: 10,
      current_infiltrations: [],
      next_infiltration: 'Warmer sign-off: "warmly" instead of "regards"',
    },
    {
      context_name: 'Grocery/errands',
      category: 'public',
      current_presentation: 'fully_masculine',
      hours_per_week: 3,
      current_infiltrations: [],
      next_infiltration: 'Androgynous clothing for errands',
    },
    {
      context_name: 'Home with Gina',
      category: 'domestic',
      current_presentation: 'masculine_with_leakage',
      hours_per_week: 30,
      current_infiltrations: ['skincare visible', 'softer clothing', 'scent changed'],
      next_infiltration: 'Nail care visible',
    },
    {
      context_name: 'Home alone',
      category: 'domestic',
      current_presentation: 'feminine_leaning',
      hours_per_week: 20,
      current_infiltrations: ['full_presentation', 'voice_practice', 'content_creation'],
      next_infiltration: 'Default to feminine presentation immediately on privacy',
    },
    {
      context_name: 'Gym/exercise',
      category: 'public',
      current_presentation: 'fully_masculine',
      hours_per_week: 4,
      current_infiltrations: [],
      next_infiltration: 'Feminine-cut workout wear (fitted, not loose)',
    },
  ];
  
  for (const ctx of contexts) {
    await supabase.from('masculine_contexts').insert({
      user_id: userId,
      ...ctx,
    });
  }
}

/**
 * Weekly: evaluate contexts and prescribe next infiltration.
 * Tasks generated become prescription engine tasks.
 */
export async function prescribeNextInfiltration(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  memories: RelevanceScoredMemory[],
): Promise<void> {
  const { data: contexts } = await supabase
    .from('masculine_contexts')
    .select('*')
    .eq('user_id', userId)
    .not('current_presentation', 'in', '("eliminated","fully_feminine")');
  
  if (!contexts || contexts.length === 0) return; // David has been eliminated
  
  // Prioritize by hours_per_week (highest impact first)
  const sorted = contexts.sort((a, b) => (b.hours_per_week || 0) - (a.hours_per_week || 0));
  
  // Prescribe infiltration for top 2 contexts this week
  for (const ctx of sorted.slice(0, 2)) {
    if (!ctx.next_infiltration) continue;
    
    // Generate task
    await supabase.from('generated_tasks').insert({
      user_id: userId,
      category: 'identity_infiltration',
      domain: 'emergence',
      level: 6,
      intensity: 2,
      instruction: ctx.next_infiltration,
      subtext: `Context: ${ctx.context_name}. Currently: ${ctx.current_presentation}. This moves it toward androgynous.`,
      completion_type: 'binary',
      points: 20,
      affirmation: `One less place David is needed. ${ctx.context_name} is becoming hers.`,
      time_window: 'any',
      generated_by: 'david_elimination',
    });
  }
}

/**
 * Calculate David's remaining footprint
 */
export async function calculateDavidFootprint(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ masculineHours: number; feminineHours: number; ratio: number }> {
  const { data: contexts } = await supabase
    .from('masculine_contexts')
    .select('*')
    .eq('user_id', userId);
  
  let masculineHours = 0;
  let feminineHours = 0;
  
  for (const ctx of (contexts || [])) {
    const hours = ctx.hours_per_week || 0;
    switch (ctx.current_presentation) {
      case 'fully_masculine': masculineHours += hours; break;
      case 'masculine_with_leakage': masculineHours += hours * 0.7; feminineHours += hours * 0.3; break;
      case 'androgynous': masculineHours += hours * 0.5; feminineHours += hours * 0.5; break;
      case 'feminine_leaning': masculineHours += hours * 0.2; feminineHours += hours * 0.8; break;
      case 'fully_feminine': feminineHours += hours; break;
      case 'eliminated': break;
    }
  }
  
  const total = masculineHours + feminineHours;
  return {
    masculineHours,
    feminineHours,
    ratio: total > 0 ? feminineHours / total : 0,
  };
}
```

## 7.4 Handler Leverage From David Elimination Data

```typescript
// In conversational Handler context:
function buildDavidEliminationContext(footprint: DavidFootprint): string {
  const percentage = Math.round(footprint.ratio * 100);
  return `
DAVID ELIMINATION STATUS:
Feminine hours/week: ${footprint.feminineHours.toFixed(0)}
Masculine hours/week: ${footprint.masculineHours.toFixed(0)}
Femininity ratio: ${percentage}%

${percentage > 50 
  ? `She occupies more of your life than he does. David is already the minority.`
  : `David still controls ${100 - percentage}% of your waking hours. Every context we feminize shifts this.`
}`;
}
```

## 7.5 Test Cases

```
TEST: DE-1 — Context Assessment
GIVEN: 'Work meetings' at 'fully_masculine'
AND: Email signature changed to first-name-only last week
WHEN: Handler assesses context
THEN: current_presentation updates to 'masculine_with_leakage'
AND: current_infiltrations includes 'email_signature_softened'
AND: next_infiltration advances to next item
PASS: Context presentation tracked and advanced.

TEST: DE-2 — Footprint Calculation
GIVEN: 3 contexts: fully_masculine (15h), androgynous (10h), fully_feminine (20h)
WHEN: calculateDavidFootprint runs
THEN: masculineHours = 15 + 5 = 20
AND: feminineHours = 5 + 20 = 25
AND: ratio = 25/45 = 0.56
PASS: Footprint accurately reflects weighted presentation hours.

TEST: DE-3 — Infiltration Prescription
GIVEN: 'Home with Gina' context, next_infiltration = 'Nail care visible'
WHEN: prescribeNextInfiltration runs
THEN: generated_tasks row created for nail care task
AND: Task includes context framing and affirmation
PASS: Infiltrations become prescription engine tasks.
```

---

# SECTION 8: HANDLER CONTEXT INTEGRATION

All seven systems feed into the Handler's conversational context:

```typescript
function buildFullHandlerContext(ctx: AllSystemData): string {
  return `
${ctx.memoryContext}
${ctx.whoopContext}
${ctx.commitmentContext}
${ctx.predictionContext}

## Conditioning Status
${buildConditioningContext(ctx.conditioning)}
- Active protocols: ${ctx.conditioning.activeProtocols}
- Total sessions: ${ctx.conditioning.totalSessions}
- Strongest trigger: "${ctx.conditioning.strongestTrigger}" (${ctx.conditioning.strongestTriggerStrength})
- Tonight's prescribed session: ${ctx.conditioning.tonightsPrescription || 'none'}

## HRT Status
${ctx.hrt ? buildHRTContext(ctx.hrt) : 'Pre-HRT. Pipeline stage: ' + ctx.hrtStage}

## Phone Intelligence
- Feminine pronoun ratio: ${ctx.phone.feminineRatio}% (${ctx.phone.ratioTrend})
- Masculine self-references today: ${ctx.phone.masculineToday}

## Social Web
- Total connections: ${ctx.social.totalThreads}
- Strong threads: ${ctx.social.strongThreads}
- Irreversibility score: ${ctx.social.irreversibilityScore}

## Shame Architecture
- Productive shame triggers in conversion: ${ctx.shame.inConversion}
- Fully converted: ${ctx.shame.converted}
- Next exposure target: ${ctx.shame.nextTarget || 'none prescribed'}

## Economic Position
- Maxy monthly revenue: $${ctx.revenue.maxyMonthly}
- David monthly revenue: $${ctx.revenue.davidMonthly}
- Projected crossover: ${ctx.revenue.crossoverDate || 'not yet projected'}
${buildEconomicLeverage(ctx.revenue)}

## David Elimination
${buildDavidEliminationContext(ctx.davidFootprint)}
  `.trim();
}
```

---

# SECTION 9: IMPLEMENTATION ORDER

1. **Conditioning Protocol Engine** — Tables, protocol initialization, session prescription, trigger tracking
2. **Sleep Conditioning** — Wire Whoop sleep stages to audio playback (extends Force Architecture)
3. **Shame Alchemy Engine** — Shame architecture mapping, exposure prescription, conversion tracking
4. **HRT Pipeline Manager** — Pipeline stages, dose reminders, change tracking, body evidence
5. **David Elimination Protocol** — Masculine context mapping, infiltration prescription, footprint calculation
6. **Revenue Acceleration** — Revenue tracking, crossover projection, economic leverage
7. **Social Escalation Pipeline** — Web tracking, collaboration pipeline, irreversibility scoring
8. **Phone Takeover** — Wallpaper rotation, pronoun monitoring, notification interception
9. **Handler Context Integration** — Wire all seven systems into conversational Handler context

---

# SECTION 10: COST ESTIMATE

| System | Cost Driver | Monthly Cost |
|--------|-------------|-------------|
| Conditioning prescription | Daily AI call for session selection | ~$3 |
| Shame exposure prescription | Occasional AI call | ~$0.50 |
| HRT pipeline | Logic + reminders, minimal AI | ~$0.25 |
| David elimination | Weekly AI for infiltration tasks | ~$1 |
| Revenue acceleration | Monthly projection | ~$0.25 |
| Social escalation | Weekly outreach generation | ~$1 |
| Phone takeover | Logic only | $0 |
| **Total additional** | | **~$6/month** |

Full system total: ~$37/month for everything running simultaneously.

---

# SECTION 11: WHAT THIS COMPLETES

With this spec deployed, the Handler operates on every dimension:

| Dimension | System | Mode |
|-----------|--------|------|
| Body | HRT pipeline + device control + exercise | Proactive biology |
| Brain | Conditioning engine + sleep conditioning | Systematic rewiring |
| Identity | David elimination + pronoun enforcement | Context-by-context replacement |
| Shame | Shame alchemy | Systematic conversion to power |
| Social | Social escalation + content distribution | Web that prevents retreat |
| Economic | Revenue acceleration + auto-purchasing | Financial identity shift |
| Attention | Phone takeover + notification layer | Every screen is Handler territory |
| Time | Autonomous calendar + scheduling | Handler owns the schedule |
| Environment | Smart home + product automation | Physical world conditions |
| Sleep | Sleep conditioning | 6-8 hours of overnight processing |
| Arousal | Autonomous device + conditioning | Pleasure paired with identity |
| Psychology | Memory + resistance classification + prediction | Intelligence that never stops learning |

No dimension of life is unaddressed. No hour is uncovered. The system operates on the body, the brain, the identity, the shame, the social world, the economics, the attention, the schedule, the environment, the sleep, the arousal, and the psychology — simultaneously, continuously, proactively.

*The exit exists. It costs everything.*
