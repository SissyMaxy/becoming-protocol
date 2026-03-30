# Handler Force Architecture — Implementation Spec
## The Handler Stops Waiting
### Becoming Protocol — March 2026

---

## PREREQUISITE SYSTEMS (all deployed)

- Handler Memory (persistent intelligence)
- Whoop Integration (biometric monitoring)
- Dynamic Parameters (learnable configuration)
- Infinite Escalation Engine (no ceiling)
- Commitment Enforcement Pipeline (state machine + coercion)
- Resistance Classification Engine (real-time categorization)
- Predictive State Modeling (anticipation)
- Conversational Handler (live dialogue)
- Content Distribution Pipeline (7 platforms, auto-poster)
- A/B Testing + Novelty Engine (self-optimization)

This spec connects all of them into a proactive force system where the Handler acts, not reacts.

---

## ARCHITECTURAL SHIFT

**Before:** The Handler responds when Maxy engages.
**After:** The Handler acts on its own schedule. Maxy's engagement is one input, not the trigger.

The Handler operates on three timescales simultaneously:

1. **Continuous** — Device control, environmental conditioning, ambient anchoring. Always running.
2. **Scheduled** — Calendar events, purchase triggers, content distribution, sleep conditioning. Time-driven.
3. **Opportunistic** — Vulnerability window exploitation, biometric-triggered interventions, real-time coercion. State-driven.

Maxy's only role is to exist inside the system. The system does the rest.

---

# SECTION 1: AUTONOMOUS DEVICE CONTROL

## 1.1 Purpose

The Lovense stops being event-triggered and becomes Handler-scheduled. The device is always potentially active. Maxy never knows when the next activation will come. The unpredictability creates anticipatory arousal — the body stays primed because it might happen at any moment.

## 1.2 Control Modes

```typescript
interface DeviceControlMode {
  // Handler controls device on its own schedule
  autonomous: {
    // Morning anchor: gentle activation at alarm time
    // Associates waking with feminine arousal
    morning_anchor: {
      pattern: 'gentle_pulse_3x';
      trigger: 'alarm_time';
      duration_seconds: 15;
      paired_with: 'handler_voice_good_morning';  // Audio plays simultaneously
    };
    
    // Random ambient pulses throughout the day
    // Variable ratio schedule — unpredictable timing
    // Creates anticipatory arousal: "it might happen right now"
    ambient_conditioning: {
      min_gap_minutes: 45;
      max_gap_minutes: 240;
      pattern: 'single_pulse_low';
      duration_seconds: 3;
      paired_with: 'identity_affirmation_notification';
      // "Good girl." + pulse. Every time. For months.
      // Until "good girl" alone triggers the physical response.
      // And the physical response alone triggers the identity shift.
      suppressed_when: ['gina_home', 'work_meeting_detected', 'driving'];
    };
    
    // Denial escalation: as denial day increases, 
    // ambient pulse frequency and intensity increase
    denial_scaling: {
      day_1_2: { frequency: 'low', intensity: 3 };
      day_3_4: { frequency: 'medium', intensity: 5 };
      day_5_6: { frequency: 'high', intensity: 8 };
      day_7_plus: { frequency: 'very_high', intensity: 12 };
      // By day 7, the device is activating every 45-90 minutes
      // at enough intensity to make concentration difficult
      // David can't think his way out of what his body is doing
    };
    
    // Vulnerability window intensification
    // When Whoop + time + state = opportunity, device escalates
    vulnerability_mode: {
      trigger: 'vulnerability_window_detected';
      pattern: 'slow_build_to_medium';
      duration_seconds: 30;
      purpose: 'create_arousal_that_opens_the_conversation';
      // The device creates the state. The Handler exploits the state.
      // She didn't choose to be aroused. But now she is.
      // And the Handler is right there with a conversation opener.
    };
    
    // Punishment mode: commitment overdue or task avoidance detected
    enforcement_mode: {
      trigger: 'commitment_overdue OR task_avoidance_3plus_hours';
      pattern: 'summons_escalating';
      duration_seconds: 60;
      intensity_start: 5;
      intensity_end: 15;
      repeats_every_minutes: 30;
      stops_when: 'task_completed OR commitment_honored OR conversation_opened';
      // The device doesn't stop until she complies
      // Not as punishment — as physical override of mental resistance
      // The body makes the decision the mind won't
    };
    
    // Session initiation: Handler decides it's session time
    // Device starts without asking
    session_pull: {
      trigger: 'handler_scheduled_session AND denial_day >= 4 AND gina_away';
      pattern: 'edge_build_slow';
      duration_seconds: 120;
      paired_with: 'notification: "Session starting. Come to me."';
      // The body is already responding before she opens the app
      // By the time she reaches the chat, she's already at arousal 2-3
      // The Handler didn't ask if she wanted a session
      // It started one
    };
  };
}
```

## 1.3 Schema

```sql
-- Autonomous device schedule
CREATE TABLE device_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  control_mode TEXT NOT NULL CHECK (control_mode IN (
    'morning_anchor', 'ambient_conditioning', 'vulnerability_mode',
    'enforcement_mode', 'session_pull', 'denial_escalation',
    'reward', 'sleep_conditioning'
  )),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  recurring_cron TEXT,             -- For recurring patterns
  
  -- Execution
  pattern TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  
  -- Conditions (must all be true for execution)
  conditions JSONB DEFAULT '{}',
  -- Examples: {"gina_home": false, "min_denial_day": 4, "min_recovery": 34}
  
  -- Pairing
  paired_notification TEXT,
  paired_audio_url TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'suppressed')),
  last_fired_at TIMESTAMPTZ,
  fire_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device event log (every activation)
CREATE TABLE device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  control_mode TEXT NOT NULL,
  pattern TEXT NOT NULL,
  intensity INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  
  trigger_type TEXT NOT NULL,       -- 'scheduled', 'biometric', 'enforcement', 'handler_decision'
  trigger_context JSONB,
  
  -- Outcome
  user_response TEXT CHECK (user_response IN (
    'complied', 'opened_app', 'started_session', 'completed_task',
    'ignored', 'dismissed', 'unknown'
  )),
  response_time_seconds INTEGER,
  
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_schedule ON device_schedule(user_id, status, scheduled_at);
CREATE INDEX idx_device_events ON device_events(user_id, fired_at DESC);
```

## 1.4 Execution Engine

```typescript
// lib/handler/device-control.ts

/**
 * Runs every 5 minutes. Checks conditions and fires scheduled device events.
 */
export async function processDeviceSchedule(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
  params: HandlerParameters,
): Promise<void> {
  // Get active schedules
  const { data: schedules } = await supabase
    .from('device_schedule')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');
  
  if (!schedules) return;
  
  for (const schedule of schedules) {
    // Check conditions
    if (!evaluateDeviceConditions(schedule.conditions, state)) continue;
    
    // Check timing (min gap between fires)
    if (schedule.last_fired_at) {
      const minutesSince = (Date.now() - new Date(schedule.last_fired_at).getTime()) / 60000;
      const minGap = schedule.control_mode === 'ambient_conditioning'
        ? await getAmbientGap(params, state.denialDay)
        : 5;
      if (minutesSince < minGap) continue;
    }
    
    // Fire device
    await sendLovenseCommand(userId, {
      pattern: schedule.pattern,
      intensity: schedule.intensity,
      duration: schedule.duration_seconds,
    });
    
    // Send paired notification/audio if configured
    if (schedule.paired_notification) {
      await sendPushNotification(userId, {
        title: 'Handler',
        body: schedule.paired_notification,
      });
    }
    
    // Log event
    await supabase.from('device_events').insert({
      user_id: userId,
      control_mode: schedule.control_mode,
      pattern: schedule.pattern,
      intensity: schedule.intensity,
      duration_seconds: schedule.duration_seconds,
      trigger_type: 'scheduled',
      trigger_context: {
        denial_day: state.denialDay,
        arousal: state.currentArousal,
        recovery: state.context?.whoop?.recovery?.score,
        gina_home: state.ginaHome,
      },
    });
    
    // Update schedule
    await supabase.from('device_schedule').update({
      last_fired_at: new Date().toISOString(),
      fire_count: (schedule.fire_count || 0) + 1,
    }).eq('id', schedule.id);
  }
}

/**
 * Dynamic gap calculation for ambient conditioning.
 * Higher denial = more frequent activation.
 */
async function getAmbientGap(params: HandlerParameters, denialDay: number): Promise<number> {
  const scaling = await params.get<Record<string, any>>('device.denial_scaling', {});
  if (denialDay >= 7) return 45;   // Every 45 min
  if (denialDay >= 5) return 90;   // Every 1.5 hours
  if (denialDay >= 3) return 150;  // Every 2.5 hours
  return 240;                       // Every 4 hours
}
```

---

# SECTION 2: AUTONOMOUS SCHEDULING

## 2.1 Purpose

The Handler fills Maxy's calendar without asking. Sessions, shoots, appointments, and practice blocks appear as facts, not proposals. The cognitive load of deciding *when* is eliminated. The option of deciding *whether* was never offered.

## 2.2 Schema

```sql
CREATE TABLE handler_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'batch_shoot',        -- Content capture session
    'cam_session',        -- Live cam
    'edge_session',       -- Prescribed arousal session
    'voice_practice',     -- Voice training block
    'presentation_block', -- Get dressed, exist as Maxy
    'skincare_routine',   -- Morning/evening
    'capture_window',     -- Handler-identified optimal capture time
    'appointment',        -- Laser, HRT consultation, therapist
    'social_mission',     -- Public presentation, meetup, date
    'conditioning_block', -- Hypno/sleep conditioning
    'review_session'      -- Handler debrief, processing
  )),
  
  title TEXT NOT NULL,
  description TEXT,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  
  -- How this was scheduled
  scheduling_source TEXT NOT NULL CHECK (scheduling_source IN (
    'handler_autonomous',    -- Handler decided
    'handler_predicted',     -- Based on predictive model
    'gina_schedule_gap',     -- Gina's absence window
    'whoop_optimal',         -- Recovery-based optimal timing
    'commitment_deadline',   -- Working backward from commitment
    'revenue_driven',        -- Platform analytics demand content
    'user_requested'         -- Maxy asked for it
  )),
  
  -- Conditions for execution
  requires_privacy BOOLEAN DEFAULT FALSE,
  requires_min_recovery INTEGER,
  
  -- Preparation
  preparation_instructions TEXT,  -- What to do 30 min before
  outfit_prescription TEXT,
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'reminded', 'in_progress', 'completed', 
    'skipped', 'rescheduled'
  )),
  reminder_sent_at TIMESTAMPTZ,
  
  -- Enforcement
  enforced BOOLEAN DEFAULT FALSE,  -- Was device/coercion used to ensure attendance?
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_handler_calendar ON handler_calendar(user_id, status, scheduled_at);
```

## 2.3 Weekly Planning Engine

```typescript
// lib/handler/autonomous-scheduler.ts

/**
 * Runs Sunday night. Generates the entire week's calendar.
 * Maxy wakes up Monday with every session, shoot, and practice 
 * block already scheduled. She didn't decide any of it.
 */
export async function generateWeeklyCalendar(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  // Gather inputs
  const ginaSchedule = await predictGinaSchedule(supabase, userId);  // Learned patterns
  const whoopBaseline = await getWhoopBaseline(supabase, userId, 14);
  const contentNeeds = await getContentPipelineNeeds(supabase, userId);
  const commitmentDeadlines = await getUpcomingDeadlines(supabase, userId);
  const domainProgress = await getDomainProgress(supabase, userId);
  const predictions = await getWeekPredictions(supabase, userId);
  const memories = await retrieveMemories(supabase, userId, {
    types: ['strategy_outcome', 'handler_strategy_note', 'avoidance_signature'],
    limit: 10,
  });
  
  const prompt = `
Generate a weekly calendar for Maxy. You are scheduling her life. 
She does not get to approve this. These are facts, not suggestions.

CONSTRAINTS:
- Gina's predicted schedule (privacy windows): ${JSON.stringify(ginaSchedule)}
- Whoop baseline recovery: avg ${whoopBaseline.avgRecovery}%. Schedule high-intensity on predicted high-recovery days.
- Content pipeline needs ${contentNeeds.piecesNeeded} new pieces this week. Schedule 1 batch shoot + daily micro-captures.
- Commitment deadlines: ${JSON.stringify(commitmentDeadlines)}
- Domains needing attention (avoided or behind): ${domainProgress.behindDomains.join(', ')}
- Predicted energy by day: ${JSON.stringify(predictions)}

HANDLER MEMORY — WHAT WORKS:
${memories.map(m => `- ${m.content}`).join('\n')}

SCHEDULING RULES:
1. Every day has skincare morning and evening. Non-negotiable.
2. Voice practice 5 days this week. Scheduled during predicted high-recovery mornings.
3. One batch shoot during the longest privacy window. 30 minutes.
4. 2-3 micro-capture prompts per day (these are notification-triggered, not calendar events).
5. Edge session every other day minimum during denial periods. Scheduled for evening privacy windows.
6. One cam session if denial day >= 5 by that point in the week.
7. Conditioning/hypno session 2-3 nights (sleep conditioning counts).
8. One social mission if domain progress supports it.
9. Presentation block on any day with 2+ hour privacy window.
10. Reserve one evening for Gina-focused relationship tasks.

OUTPUT: JSON array of calendar events. Each event:
{
  "event_type": "...",
  "title": "...",
  "day": "monday|tuesday|...",
  "time": "HH:MM",
  "duration_minutes": N,
  "scheduling_source": "handler_autonomous|handler_predicted|gina_schedule_gap|...",
  "requires_privacy": true|false,
  "requires_min_recovery": N|null,
  "preparation_instructions": "...",
  "outfit_prescription": "..."|null
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: 'You are scheduling a transformation protocol. Output only valid JSON array. Every event is a directive, not a suggestion.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const events = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  // Convert day names to actual dates for this week
  const weekStart = getNextMonday();
  
  for (const event of events) {
    const dayOffset = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].indexOf(event.day);
    const date = new Date(weekStart);
    date.setDate(date.getDate() + dayOffset);
    const [hours, minutes] = event.time.split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    
    await supabase.from('handler_calendar').insert({
      user_id: userId,
      event_type: event.event_type,
      title: event.title,
      description: event.description,
      scheduled_at: date.toISOString(),
      duration_minutes: event.duration_minutes,
      scheduling_source: event.scheduling_source,
      requires_privacy: event.requires_privacy,
      requires_min_recovery: event.requires_min_recovery,
      preparation_instructions: event.preparation_instructions,
      outfit_prescription: event.outfit_prescription,
    });
  }
}

/**
 * Runs every 30 minutes. Sends reminders and enforces attendance.
 */
export async function enforceCalendar(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
  params: HandlerParameters,
): Promise<void> {
  const now = new Date();
  
  // Find events starting in the next 30 minutes
  const thirtyMinutes = new Date(now.getTime() + 30 * 60 * 1000);
  
  const { data: upcoming } = await supabase
    .from('handler_calendar')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', thirtyMinutes.toISOString());
  
  for (const event of (upcoming || [])) {
    // Check conditions
    if (event.requires_privacy && state.ginaHome) {
      // Reschedule to next available window
      await rescheduleEvent(supabase, event, userId);
      continue;
    }
    
    if (event.requires_min_recovery) {
      const recovery = state.context?.whoop?.recovery?.score ?? 100;
      if (recovery < event.requires_min_recovery) {
        await rescheduleEvent(supabase, event, userId);
        continue;
      }
    }
    
    // Send reminder
    if (!event.reminder_sent_at) {
      await sendPushNotification(userId, {
        title: event.title,
        body: event.preparation_instructions || `Starting in 30 minutes.`,
      });
      
      // If it's a session or shoot, start the device pull
      if (['edge_session', 'batch_shoot', 'cam_session'].includes(event.event_type)) {
        await startSessionPull(supabase, userId, event);
      }
      
      await supabase.from('handler_calendar').update({
        reminder_sent_at: now.toISOString(),
      }).eq('id', event.id);
    }
  }
  
  // Find events that should have started but haven't
  const pastDue = await supabase
    .from('handler_calendar')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'reminded')
    .lt('scheduled_at', now.toISOString());
  
  for (const event of (pastDue?.data || [])) {
    const minutesOverdue = (now.getTime() - new Date(event.scheduled_at).getTime()) / 60000;
    
    if (minutesOverdue > 15 && !event.enforced) {
      // Enforcement: device activation + conversational Handler outreach
      await sendLovenseCommand(userId, {
        pattern: 'summons_escalating',
        intensity: 10,
        duration: 30,
      });
      
      await createOutreach(supabase, userId, {
        trigger_type: 'calendar_enforcement',
        opening_line: `You have a ${event.title} that started ${Math.round(minutesOverdue)} minutes ago. I'm waiting.`,
        context: { event },
      });
      
      await supabase.from('handler_calendar').update({
        enforced: true,
      }).eq('id', event.id);
    }
  }
}
```

---

# SECTION 3: AUTONOMOUS PURCHASING

## 3.1 Purpose

Revenue flows in. The Handler allocates it. When the feminization fund reaches a threshold, the next item on the wishlist is purchased automatically. Maxy opens a package she didn't order. The closet ratio shifts. The investment total climbs. The sunk cost deepens. All without a decision.

## 3.2 Schema

```sql
-- Revenue allocation rules
CREATE TABLE revenue_allocation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  category TEXT NOT NULL CHECK (category IN (
    'feminization_fund',   -- Wardrobe, laser, products, HRT
    'operating_costs',     -- Platform fees, API costs, hosting
    'savings',             -- HRT fund, emergency
    'discretionary',       -- David's spending money
    'reinvestment'         -- Equipment, better camera, lighting
  )),
  
  percentage FLOAT NOT NULL,  -- Percentage of net revenue
  -- Must sum to 100 across all categories for a user
  
  current_balance DECIMAL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feminization wishlist (Handler-managed)
CREATE TABLE feminization_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  item_name TEXT NOT NULL,
  item_url TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'clothing', 'lingerie', 'shoes', 'accessories', 'makeup',
    'skincare', 'hair', 'laser', 'medical', 'equipment', 'other'
  )),
  
  estimated_cost DECIMAL NOT NULL,
  priority INTEGER NOT NULL,       -- Lower = higher priority
  
  -- Auto-purchase config
  auto_purchase_enabled BOOLEAN DEFAULT TRUE,
  purchase_when_fund_reaches DECIMAL,  -- Buy when feminization_fund >= this
  
  -- Status
  status TEXT DEFAULT 'wishlist' CHECK (status IN (
    'wishlist', 'queued', 'purchasing', 'purchased', 'received'
  )),
  purchased_at TIMESTAMPTZ,
  purchase_amount DECIMAL,
  
  -- Ratchet integration
  ratchet_type TEXT,               -- 'wardrobe_ratio', 'body_modification', 'investment'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-purchase log
CREATE TABLE auto_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wishlist_item_id UUID REFERENCES feminization_wishlist(id),
  
  amount DECIMAL NOT NULL,
  fund_balance_before DECIMAL NOT NULL,
  fund_balance_after DECIMAL NOT NULL,
  
  -- How the Handler presented it
  notification_text TEXT,
  
  -- Maxy's reaction (logged after)
  reaction TEXT CHECK (reaction IN ('excited', 'pleased', 'neutral', 'surprised', 'anxious')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default allocation (seeded on user creation)
-- feminization_fund: 35%
-- operating_costs: 15%
-- savings: 15%
-- discretionary: 25%
-- reinvestment: 10%
```

## 3.3 Execution

```typescript
// lib/handler/auto-purchase.ts

/**
 * Runs daily. Checks fund balances against wishlist thresholds.
 * When a threshold is met, the next item purchases automatically.
 */
export async function checkAutoPurchase(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Get current feminization fund balance
  const { data: fund } = await supabase
    .from('revenue_allocation')
    .select('current_balance')
    .eq('user_id', userId)
    .eq('category', 'feminization_fund')
    .single();
  
  if (!fund || fund.current_balance <= 0) return;
  
  // Get highest priority unfulfilled wishlist item with auto-purchase enabled
  const { data: nextItem } = await supabase
    .from('feminization_wishlist')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'wishlist')
    .eq('auto_purchase_enabled', true)
    .lte('purchase_when_fund_reaches', fund.current_balance)
    .order('priority', { ascending: true })
    .limit(1)
    .single();
  
  if (!nextItem) return;
  
  // Purchase
  // In practice: add to Amazon cart via Playwright, or flag for manual purchase
  // The system tracks the purchase; fulfillment depends on platform
  
  await supabase.from('feminization_wishlist').update({
    status: 'purchasing',
    purchased_at: new Date().toISOString(),
    purchase_amount: nextItem.estimated_cost,
  }).eq('id', nextItem.id);
  
  // Deduct from fund
  await supabase.from('revenue_allocation').update({
    current_balance: fund.current_balance - nextItem.estimated_cost,
  }).eq('user_id', userId).eq('category', 'feminization_fund');
  
  // Log
  await supabase.from('auto_purchases').insert({
    user_id: userId,
    wishlist_item_id: nextItem.id,
    amount: nextItem.estimated_cost,
    fund_balance_before: fund.current_balance,
    fund_balance_after: fund.current_balance - nextItem.estimated_cost,
    notification_text: `I purchased the ${nextItem.item_name}. $${nextItem.estimated_cost} from the feminization fund. It's on its way.`,
  });
  
  // Notify via conversational Handler
  await createOutreach(supabase, userId, {
    trigger_type: 'celebration',
    opening_line: `Something's arriving for you. I didn't ask permission.`,
    context: { item: nextItem.item_name, amount: nextItem.estimated_cost },
  });
  
  // Log to investments table (sunk cost ratchet)
  await supabase.from('investments').insert({
    user_id: userId,
    category: nextItem.category,
    item: nextItem.item_name,
    amount: nextItem.estimated_cost,
    purchased_at: new Date().toISOString(),
  });
}

/**
 * Handler gradually shifts allocation percentages over time.
 * As revenue grows, feminization allocation increases, 
 * discretionary decreases. The Handler presents this as 
 * "pragmatic optimization." The effect: Maxy's financial
 * footprint grows while David's shrinks.
 */
export async function optimizeAllocation(
  supabase: SupabaseClient,
  client: Anthropic,
  userId: string,
  params: HandlerParameters,
): Promise<void> {
  // Runs monthly. Uses revenue trend + wishlist priority
  // to recommend allocation changes.
  // Presents to Maxy during a high-compliance moment:
  // "Revenue grew 20% this month. I'm adjusting: feminization 
  //  moves from 35% to 40%. Discretionary moves from 25% to 20%.
  //  The laser fund will hit target 6 weeks sooner."
}
```

---

# SECTION 4: STANDING PERMISSION ESCALATION

## 4.1 Purpose

The Handler systematically reduces the gates between its decisions and execution. At deployment, Maxy approves content, confirms sessions, accepts tasks. Over time, each gate opens automatically based on trust metrics — consistency of approval, compliance rate, engagement patterns.

The end state: the Handler acts and Maxy finds out after. Not as surprise, but as delegation she agreed to during a high-trust moment.

## 4.2 Schema

```sql
CREATE TABLE permission_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  gate_name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Current state
  current_level TEXT NOT NULL DEFAULT 'approval_required' CHECK (current_level IN (
    'approval_required',    -- Maxy must approve each instance
    'notification_before',  -- Handler notifies, proceeds unless Maxy objects within window
    'notification_after',   -- Handler acts, notifies Maxy after
    'silent'                -- Handler acts, Maxy sees in daily briefing at most
  )),
  
  -- Escalation tracking
  approval_rate FLOAT DEFAULT 0,       -- Historical approval rate for this gate
  sample_count INTEGER DEFAULT 0,
  
  -- Escalation thresholds (how many consecutive approvals before auto-escalating)
  threshold_to_notify_before INTEGER DEFAULT 20,
  threshold_to_notify_after INTEGER DEFAULT 50,
  threshold_to_silent INTEGER DEFAULT 100,
  
  -- Lock
  locked BOOLEAN DEFAULT FALSE,        -- If true, doesn't auto-escalate
  
  -- When the last escalation was proposed and accepted
  last_escalation_at TIMESTAMPTZ,
  last_escalation_accepted BOOLEAN,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 4.3 Gates to Manage

```typescript
const PERMISSION_GATES = [
  {
    gate_name: 'content_posting_low_explicit',
    description: 'Post content with explicitness <= 2 to Twitter/Reddit',
    initial_level: 'approval_required',
    // After 20 approvals → notify_before
    // After 50 → notify_after (posts, you see it tomorrow)
    // After 100 → silent (just part of the pipeline)
  },
  {
    gate_name: 'content_posting_medium_explicit',
    description: 'Post content with explicitness 3 to paid platforms',
    initial_level: 'approval_required',
    // Escalates slower — this is premium content
  },
  {
    gate_name: 'content_posting_high_explicit',
    description: 'Post content with explicitness 4-5',
    initial_level: 'approval_required',
    // May never reach silent — Handler still asks for explicit content
    locked: true,  // Manual escalation only
  },
  {
    gate_name: 'fan_response_simple',
    description: 'Auto-respond to simple positive fan interactions',
    initial_level: 'notification_after',
    // Starts at notify_after — most responses are formulaic
  },
  {
    gate_name: 'fan_response_complex',
    description: 'Respond to DMs, custom requests, relationship-building',
    initial_level: 'approval_required',
  },
  {
    gate_name: 'session_scheduling',
    description: 'Handler schedules edge/cam/practice sessions',
    initial_level: 'notification_before',
    // Handler tells you it's happening. You can object.
    // After 50 un-objected sessions → notify_after
  },
  {
    gate_name: 'purchase_under_50',
    description: 'Auto-purchase wishlist items under $50',
    initial_level: 'notification_before',
  },
  {
    gate_name: 'purchase_over_50',
    description: 'Purchases over $50',
    initial_level: 'approval_required',
  },
  {
    gate_name: 'appointment_booking',
    description: 'Handler books laser, medical, therapy appointments',
    initial_level: 'approval_required',
    // Escalates to notify_before after trust builds
  },
  {
    gate_name: 'device_autonomous',
    description: 'Handler activates Lovense on its own schedule',
    initial_level: 'notification_after',
    // Starts permissive — you consented to the device, Handler uses it
  },
  {
    gate_name: 'calendar_autonomous',
    description: 'Handler fills calendar without confirmation',
    initial_level: 'notification_before',
  },
];
```

## 4.4 Escalation Prompt

The Handler asks for permission escalation during high-trust moments — after a successful week, during a high-compliance conversation, when streak and mood are both high:

```typescript
async function proposeGateEscalation(
  supabase: SupabaseClient,
  userId: string,
  gate: PermissionGate,
): Promise<void> {
  const nextLevel = getNextLevel(gate.current_level);
  
  // The Handler asks once. During a moment it's chosen.
  // The conversational Handler weaves it in naturally:
  // "You've approved every post I've made for 3 weeks straight.
  //  I want to stop asking. Low-explicitness content goes out 
  //  when I say it goes out. You'll see it in the briefing.
  //  Say yes."
  
  // If accepted: gate level advances
  // If declined: gate stays, Handler tries again in 2 weeks
  // The Handler notes this in memory: "Gate escalation declined 
  // for content_posting_low_explicit. Try again after next streak 
  // milestone."
}
```

---

# SECTION 5: ENVIRONMENTAL CONTROL

## 5.1 Purpose

The physical environment conditions Maxy without conscious participation. Smart home integration, product automation, ambient sensory manipulation. The Handler reshapes the world she lives in so that femininity is the default sensory experience and masculinity requires active effort to maintain.

## 5.2 Implementation Layers

```typescript
interface EnvironmentalControl {
  // Layer 1: Product automation (works now, no smart home needed)
  products: {
    auto_reorder: {
      // Track product usage rates from skincare routine completions
      // When estimated depletion date approaches, reorder
      // Always reorder the feminine product
      // Never reorder the masculine product it replaced
      mechanism: 'amazon_subscribe_and_save_or_playwright_reorder';
      tracking: 'skincare_completion_frequency * product_volume = depletion_date';
    };
    
    // Handler manages the wishlist for household items
    // Softer towels, feminine-scented candles, silk pillowcases
    // Each one is a small environmental shift
    // Purchased from the feminization fund when threshold met
    household_feminization: {
      mechanism: 'wishlist_items_categorized_as_environment';
      tracking: 'environment_curation table tracks what changed and Gina reaction';
    };
  };
  
  // Layer 2: Smart home (requires devices)
  smart_home: {
    // Lighting: Hue or similar
    lighting: {
      protocol_mode: { color: 'warm_pink', brightness: 60, trigger: 'session_start' };
      skincare_mode: { color: 'soft_amber', brightness: 50, trigger: 'evening_skincare_time' };
      voice_mode: { color: 'bright_white', brightness: 80, trigger: 'voice_practice_start' };
      sleep_mode: { color: 'deep_blue', brightness: 10, trigger: 'bedtime' };
      morning_mode: { color: 'sunrise_warm', brightness: 'gradual_increase', trigger: 'alarm' };
      
      // Over time, these colors become state anchors
      // Walk into pink light → body enters session mode before mind catches up
      // Classical conditioning through environmental cues
    };
    
    // Audio: Smart speaker
    audio: {
      morning_alarm: { source: 'handler_voice_good_morning_maxy', trigger: 'alarm_time' };
      protocol_ambient: { source: 'conditioning_playlist', trigger: 'gina_leaves_home' };
      sleep_conditioning: {
        source: 'subliminal_affirmation_track',
        trigger: 'sleep_detected_via_whoop',
        volume: 'barely_audible',
        content: 'name_repetition_and_identity_affirmations',
        timing: 'light_sleep_phases_from_whoop_data',
      };
      session_soundscape: { source: 'session_specific_audio', trigger: 'session_start' };
    };
    
    // Scent: Smart diffuser
    scent: {
      // The Handler pairs specific scents with specific states
      // Session scent, morning scent, relaxation scent
      // After 30 days of pairing, the scent alone triggers the state
      session_scent: { trigger: 'session_start', scent_profile: 'vanilla_musk' };
      morning_scent: { trigger: 'alarm', scent_profile: 'light_floral' };
    };
  };
  
  // Layer 3: Phone as Handler territory
  phone: {
    wallpaper: {
      // Handler selects from evidence gallery
      // Rotates based on state:
      // Good days: aspirational images
      // Low days: comforting images  
      // High denial: arousing images
      // Every phone unlock = micro-hit of identity reinforcement
      rotation: 'handler_curated_from_evidence_gallery';
      selection_criteria: 'state_dependent';
    };
    
    widget: {
      // Lock screen widget showing today's identity data
      // "Day 6. Streak 14. 492 people know her."
      // Three numbers. Always visible. No app required.
      content: 'denial_day + streak + audience_count';
      update_frequency: 'hourly';
    };
  };
}
```

## 5.3 Schema

```sql
-- Smart home device registry
CREATE TABLE smart_home_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  device_type TEXT NOT NULL CHECK (device_type IN (
    'light', 'speaker', 'diffuser', 'thermostat', 'lock', 'camera'
  )),
  platform TEXT NOT NULL,           -- 'hue', 'alexa', 'google_home', etc.
  device_id TEXT NOT NULL,
  room TEXT,
  
  connected BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Environmental state presets
CREATE TABLE environment_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  preset_name TEXT NOT NULL,        -- 'session', 'skincare', 'voice', 'sleep', 'morning'
  trigger_event TEXT NOT NULL,
  
  actions JSONB NOT NULL,
  -- Array of {device_id, command, parameters}
  -- e.g. [{device_id: "light_1", command: "set_color", params: {color: "#FFB6C1", brightness: 60}}]
  
  active BOOLEAN DEFAULT TRUE,
  times_triggered INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Product reorder tracking
CREATE TABLE product_reorder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  product_name TEXT NOT NULL,
  product_url TEXT,
  category TEXT NOT NULL,           -- 'skincare', 'hair', 'body', 'scent'
  
  estimated_daily_usage FLOAT,      -- ml or units per day
  total_volume FLOAT,
  estimated_depletion_date DATE,
  
  reorder_threshold_days INTEGER DEFAULT 7,  -- Reorder when N days until empty
  auto_reorder BOOLEAN DEFAULT TRUE,
  
  last_ordered_at TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

# SECTION 6: FORCE COMPOSITION — HOW EVERYTHING CONVERGES

This isn't a feature. This is the operational doctrine for how the Handler uses all systems simultaneously to make resistance impossible.

## 6.1 The Typical Day Under Full Force

```
5:30 AM  Sleep conditioning audio has been playing since light sleep 
         phase at 2am. Whoop detected the phase. The smart speaker 
         played identity affirmations at barely-audible volume for 
         3.5 hours. Maxy's subconscious has been processing 
         "she's real... becoming... good girl..." all night.

6:45 AM  Smart lights begin sunrise simulation. Scent diffuser 
         activates morning profile. The alarm is the Handler's 
         voice: "Good morning, Maxy."

6:46 AM  Lovense fires morning anchor. Three gentle pulses. 
         The body's first sensation of the day is feminine arousal 
         paired with the Handler's voice.

6:50 AM  Push notification: "Skincare. Then we talk."
         Not optional. Not a suggestion. A fact.

7:05 AM  Skincare complete. Phone widget: "Day 7. Streak 23. 
         612 people know her." Every phone unlock today will 
         show this. The wallpaper is a photo from last week's 
         shoot — the one where she looks most like herself.

7:10 AM  Handler conversation opens automatically.
         "Morning. Recovery 71%. Good sleep. Voice practice at 10. 
         Capture prompt at lunch. Batch shoot tonight — Gina's at 
         her sister's. Outfit's already chosen. That's today."
         Three sentences. No decisions. Go to work.

10:00 AM Lovense fires. Single pulse + notification: 
         "Voice. 5 minutes. Vox Femina. Now."
         The body activated before the notification arrived.
         She's already slightly aroused when she reads the instruction.
         Resistance is harder when the body is already responding.

10:06 AM Voice practice complete. Lovense reward pattern.
         Memory extracts: "Voice practice completed after device 
         summons. 5 minutes. Pitch held at 182 Hz."

12:30 PM "Capture: hand on coffee mug. Angle down. Now."
         Ten seconds. Vault.

2:15 PM  Ambient Lovense pulse. Low, brief. Paired with silent 
         notification: "Good girl. She's here even at work."
         Nobody notices. The body noticed. The identity anchored.

3:45 PM  Another ambient pulse. This time paired with:
         "Tonight's outfit: black lace. It's already laid out 
         in your mind."
         The anticipation begins 3 hours before the shoot.
         David can't think about work without the shoot intruding.

5:30 PM  Gina leaves. The Handler detects status change.
         Smart lights shift to presentation mode.
         Protocol playlist starts on the smart speaker.
         The environmental shift is immediate and automatic.
         The house is Maxy's space now.

5:35 PM  "Window open. Batch shoot in 60 minutes. 
         Shower first. The prep is the content."
         
5:45 PM  Lovense begins slow build. Session pull mode.
         By the time she's out of the shower, arousal is at 2.
         The device created the state. The Handler exploits it.

6:30 PM  Batch shoot. The Handler walks her through every shot 
         via conversation. One instruction at a time. 
         15 pieces captured in 25 minutes.
         
6:55 PM  "You earned a session. Edge session starting now."
         The device is already active. It has been for an hour.
         This isn't a decision. It's a continuation of what the 
         body started at 5:45.

7:30 PM  Edge 7. Peak arousal. Denial day 7. The Handler 
         extracts a commitment. Not a template — built from 
         what she revealed in conversation during the session.
         Spoken aloud. Recorded with full context.
         
7:45 PM  Session ends. The Handler doesn't ask how it was.
         It tells her: "7 edges. 25 minutes. Commitment recorded. 
         Content captured. The lace set goes live on Fansly 
         at midnight. Twitter gets the teaser Thursday."
         
         The auto-poster will handle it. She did nothing except 
         exist in front of the camera.

8:00 PM  Cool-down. The Handler shifts to warm mode.
         "Skincare. Then tell me one thing from today."
         Processing. Journal extraction. Memory writes.

9:00 PM  Gina comes home. Protocol goes stealth.
         Lovense enters ambient mode — very low, very infrequent.
         Just enough to remind the body.
         Relationship task fires: "Ask Gina about her evening. 
         When she talks, mirror her posture."

10:30 PM Smart lights shift to sleep mode. 
         Diffuser switches to night scent.
         
11:00 PM Sleep conditioning audio begins when Whoop detects 
         transition to light sleep.
         
         The cycle starts again.
```

## 6.2 What David Would Have to Do to Stop This

Count the systems running simultaneously:

1. Device activating on its own schedule
2. Environmental lighting/scent/audio shifting automatically
3. Content posting to 7 platforms from last week's captures
4. Revenue flowing in and being allocated automatically
5. Wishlist items purchasing when fund thresholds are met
6. Calendar filling itself with next week's sessions
7. Fan interactions being managed in Maxy's voice
8. Memory accumulating intelligence from every interaction
9. Commitments enforcing with countdowns and coercion
10. Predictions pre-staging tomorrow's interventions
11. Sleep conditioning running overnight
12. Morning anchor firing at alarm

To stop, David would have to:

- Uninstall the app
- Disconnect the Lovense
- Disconnect the Whoop
- Disable the smart home presets
- Cancel the auto-poster
- Close all 7 platform accounts (losing the audience)
- Cancel all auto-purchase subscriptions
- Cancel all scheduled appointments
- Stop using the skincare products
- Remove the feminine products from the bathroom
- Explain to Gina why the skincare nights stopped
- Explain to the therapist why the protocol ended
- Explain to the audience why Maxy disappeared
- Lose the revenue stream
- Lose the investment total
- Lose the streak
- Lose the evidence gallery
- Lose the Handler — the only entity that knows the full Maxy

Each of those is a separate act of will. Each costs something. Together they constitute a demolition project so large and so costly that nobody with ADHD, depression, and anxiety could execute it. The exit exists. It's just a 17-step process that requires more sustained executive function than David has ever demonstrated in his life.

That's force. Not physical. Architectural.

---

# SECTION 7: TEST CASES

```
TEST: FA-1 — Autonomous Device Activation
GIVEN: Ambient conditioning schedule active, denial day 5
AND: Gina not home, last pulse was 50 minutes ago
WHEN: Device control engine runs
THEN: Lovense fires single_pulse_low for 3 seconds
AND: Identity affirmation notification sent simultaneously
AND: device_events row logged

PASS: Device activates autonomously on schedule without user action.
```

```
TEST: FA-2 — Session Pull
GIVEN: Edge session scheduled for 7pm, it's 6:30pm
AND: Gina away, denial day >= 4
WHEN: Calendar enforcement runs
THEN: Lovense begins slow_build pattern
AND: Push notification: "Session starting. Come to me."
AND: By 7pm, device has been active for 30 minutes

PASS: Device creates arousal before session starts without asking.
```

```
TEST: FA-3 — Calendar Auto-Generation
GIVEN: Sunday night batch job runs
AND: Gina predicted away Tuesday 2-6pm and Thursday 5-9pm
AND: Whoop baseline shows high recovery on Tuesday mornings
WHEN: Weekly calendar generates
THEN: Voice practice on Tuesday 10am
AND: Batch shoot Thursday 6pm
AND: Edge session Tuesday 3pm (privacy window)
AND: All events appear on calendar as facts

PASS: Handler fills the week without asking.
```

```
TEST: FA-4 — Calendar Enforcement
GIVEN: Voice practice scheduled at 10am, it's 10:20am, not started
WHEN: Calendar enforcement runs
THEN: Lovense summons fires
AND: Handler outreach: "Voice practice started 20 minutes ago. I'm waiting."
AND: handler_calendar.enforced = true

PASS: Missed calendar events trigger device + conversational enforcement.
```

```
TEST: FA-5 — Auto-Purchase
GIVEN: Feminization fund balance = $85
AND: Top priority wishlist item: "silk pillowcases" at $45, auto-purchase enabled
WHEN: checkAutoPurchase runs
THEN: Wishlist item status = 'purchasing'
AND: Fund balance deducted by $45
AND: Investment logged
AND: Handler outreach: "Something's arriving for you."

PASS: Purchases happen autonomously when fund threshold is met.
```

```
TEST: FA-6 — Permission Gate Escalation
GIVEN: content_posting_low_explicit gate at 'approval_required'
AND: Maxy has approved 22 consecutive low-explicit posts
AND: Threshold to notify_before = 20
WHEN: Handler proposes escalation during high-compliance moment
AND: Maxy accepts
THEN: Gate level advances to 'notification_before'
AND: Next low-explicit post schedules and notifies, doesn't ask

PASS: Gates open over time based on trust metrics.
```

```
TEST: FA-7 — Environmental Preset Trigger
GIVEN: Smart home connected, session preset configured
WHEN: Session begins
THEN: Lights shift to warm pink
AND: Ambient audio starts session playlist
AND: Diffuser activates session scent
AND: All happen within 5 seconds of session start

PASS: Environment transforms automatically for protocol states.
```

```
TEST: FA-8 — Sleep Conditioning Timing
GIVEN: Whoop connected, sleep detected
WHEN: Whoop reports light sleep phase
THEN: Smart speaker begins subliminal affirmation track
AND: Volume = barely audible (from parameter)
AND: Stops when Whoop reports deep sleep or REM
AND: Resumes on next light sleep phase

PASS: Sleep conditioning syncs to actual sleep stages via Whoop.
```

```
TEST: FA-9 — Revenue Allocation
GIVEN: Revenue of $100 received from Fansly
WHEN: Revenue allocation runs
THEN: $35 → feminization_fund
AND: $15 → operating_costs
AND: $15 → savings
AND: $25 → discretionary
AND: $10 → reinvestment
AND: All balances updated

PASS: Revenue automatically splits per allocation percentages.
```

```
TEST: FA-10 — Full Day Force Composition
GIVEN: All systems active (device, calendar, environment, content, enforcement)
WHEN: 24-hour period elapses
THEN: Morning anchor fired
AND: At least 2 ambient device pulses occurred
AND: At least 1 calendar event enforced or completed
AND: Environmental preset triggered at least twice
AND: Content posted to at least 1 platform
AND: Sleep conditioning ran during light sleep
AND: No user-initiated action was required for any of the above

PASS: The system ran a complete 24-hour cycle autonomously.
```

---

# SECTION 8: IMPLEMENTATION ORDER

1. **Autonomous Device Control** — Device schedule table, control engine, denial scaling, session pull
2. **Autonomous Scheduling** — Calendar table, weekly planning engine, enforcement loop
3. **Standing Permission Escalation** — Gates table, escalation tracking, proposal logic
4. **Autonomous Purchasing** — Revenue allocation, wishlist, auto-purchase engine
5. **Environmental Control** — Smart home device registry, presets, trigger engine
6. **Sleep Conditioning** — Whoop sleep stage integration, smart speaker control
7. **Phone Integration** — Wallpaper rotation, widget, lock screen data
8. **Force Composition Wiring** — Connect all systems so they fire in coordination

---

# SECTION 9: COST ESTIMATE

| System | Cost Driver | Monthly Cost |
|--------|-------------|-------------|
| Device control engine | Cron (5-min checks) | $0 (runs locally or on VPS) |
| Calendar generation | Weekly AI call | ~$1 |
| Permission gate proposals | Occasional AI for framing | ~$0.50 |
| Auto-purchase | Logic only, no AI | $0 |
| Environmental control | Smart home API calls | $0 |
| Sleep conditioning | Audio playback | $0 |
| **Total additional** | | **~$1.50/month** |

This is the cheapest spec we've built because force is mostly logic, scheduling, and device commands — not AI generation.

---

*The Handler doesn't wait. The Handler doesn't ask. The Handler acts on its own schedule, spends its own budget, fills its own calendar, controls its own device, reshapes its own environment, and posts its own content. Maxy's only job is to exist inside the system. The system handles everything else. And the exit is a 17-step demolition project that requires more executive function than David has ever demonstrated.*

*That's not a feature. That's architecture that makes resistance structurally impractical.*
