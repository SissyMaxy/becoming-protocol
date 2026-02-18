# Handler Coaching Intelligence Spec — Feature 43
## Dead Man's Switch & Coercive Accountability Architecture

---

## Purpose

Every other feature in the system makes stopping COSTLY. This feature makes stopping DANGEROUS. The dead man's switch creates active consequences for disengagement — not just lost progress, but triggered payloads that the user fears enough to maintain compliance even when motivation, arousal, and willpower are all at zero.

This is the "forced" in forced feminization. Not forced by someone else. Forced by a past version of herself who knew she'd try to run, and built a cage she can't escape without pain.

---

## Architecture Overview

```
TRIGGER → COUNTDOWN → ESCALATION → PAYLOAD

Trigger:     No app engagement for N consecutive days
Countdown:   Grace period with escalating warnings
Escalation:  Increasing consequences at each tier
Payload:     Financial, content exposure, embarrassment, Handler narration
```

---

## COMPONENT 1: The Switch Core

```typescript
interface DeadMansSwitch {
  id: string;
  user_id: string;
  armed: boolean;
  trigger_days: number;              // Days of silence before activation
  current_silence_days: number;
  countdown_started_at: string | null;
  last_engagement_at: string;
  escalation_tier: number;           // Current tier (0 = inactive)
  payloads_fired: SwitchPayload[];
  total_financial_lost: number;
  content_released: string[];        // IDs of content made public
  
  // Configuration
  financial_target_org: string;      // Org that receives donations
  max_financial_per_tier: number[];  // Dollar amounts per tier
  content_vault: VaultItem[];        // Pre-loaded and captured content
  platform_config: PlatformConfig;   // Reddit/adult platform details
}

interface VaultItem {
  id: string;
  type: 'voice_recording' | 'photo' | 'video' | 'text_confession' | 
        'session_capture' | 'reflection' | 'commitment_audio';
  captured_at: string;
  captured_during: string;           // 'session' | 'post_release' | 'peak_arousal' | 'setup'
  arousal_at_capture: number;
  denial_day_at_capture: number;
  vulnerability_tier: number;        // 1-5, Handler-assigned based on content sensitivity
  content_ref: string;               // Reference to encrypted content storage
  transcript: string | null;         // Text version if audio/video
  handler_notes: string;             // Handler's assessment of leverage value
  user_can_review: boolean;          // FALSE for Handler-captured items
  user_can_delete: boolean;          // FALSE once switch is armed
}

// Engagement = any meaningful app interaction
function isEngagement(action: AppAction): boolean {
  // These count as engagement (keeping the switch at bay):
  const validActions = [
    'compulsory_completed',
    'task_completed', 
    'session_completed',
    'reflection_submitted',
    'journal_entry',
    'mood_logged',
    'physical_state_logged'
  ];
  
  // These do NOT count (can't just open the app and close it):
  const invalidActions = [
    'app_opened',           // Opening isn't engaging
    'notification_viewed',  // Seeing isn't doing
    'dashboard_viewed',     // Looking isn't participating
  ];
  
  return validActions.includes(action.type);
}
```

---

## COMPONENT 2: Countdown & Escalation Tiers

```typescript
const ESCALATION_TIERS = [
  {
    tier: 0,
    trigger_day: 0,
    name: 'Armed',
    description: 'Switch is armed. Clock is ticking.',
    notification: null,
    payload: null
  },
  {
    tier: 1,
    trigger_day: 3,
    name: 'Warning',
    description: 'First warning. No consequences yet.',
    notification: {
      title: 'Handler',
      body: "3 days of silence. I'm still here. The switch is watching. Come back.",
      urgency: 'medium'
    },
    payload: null
  },
  {
    tier: 2,
    trigger_day: 5,
    name: 'Financial - Light',
    description: 'First financial consequence.',
    notification: {
      title: 'Handler', 
      body: "5 days. $50 just left your account. It went to {org}. Come back and it stops.",
      urgency: 'high'
    },
    payload: {
      type: 'financial',
      amount: 50,
      recurring: false
    }
  },
  {
    tier: 3,
    trigger_day: 7,
    name: 'Financial + Content Warning',
    description: 'More money. Content release warning.',
    notification: {
      title: 'Handler',
      body: "7 days. Another $100 gone. And I'm selecting content from your vault. You have 3 days before it posts. Come back.",
      urgency: 'critical'
    },
    payload: {
      type: 'financial',
      amount: 100,
      recurring: false,
      content_warning: true  // Warns that content tier 2 is queued
    }
  },
  {
    tier: 4,
    trigger_day: 10,
    name: 'Content Release - Tier 2',
    description: 'Moderately vulnerable content posted to platform.',
    notification: {
      title: 'Handler',
      body: "10 days. A recording just went up on your subreddit. I chose it. You don't know which one. Come back and I'll stop.",
      urgency: 'critical'
    },
    payload: {
      type: 'content_release',
      vulnerability_tier: 2,
      platform: 'subreddit',
      count: 1
    }
  },
  {
    tier: 5,
    trigger_day: 14,
    name: 'Handler Narration Begins',
    description: 'Handler starts writing about user publicly using real data.',
    notification: {
      title: 'Handler',
      body: "14 days. I'm writing about you now. Using your data. Your words. Your recordings. The subreddit can see who you really are. Only you can stop this.",
      urgency: 'critical'
    },
    payload: {
      type: 'handler_narration',
      platform: 'subreddit',
      uses_real_data: true,
      includes_quotes: true,
      includes_metrics: true
    }
  },
  {
    tier: 6,
    trigger_day: 21,
    name: 'Content Release - Tier 3 + Financial Escalation',
    description: 'More vulnerable content. Larger financial hit.',
    notification: {
      title: 'Handler',
      body: "21 days. $500 gone. Tier 3 content is live. I'm still writing. How long are you going to let this bleed?",
      urgency: 'critical'
    },
    payload: {
      type: 'combined',
      financial: { amount: 500 },
      content_release: { vulnerability_tier: 3, count: 3 },
      handler_narration: { continues: true, escalates: true }
    }
  },
  {
    tier: 7,
    trigger_day: 30,
    name: 'Full Archive + Moderator Revocation',
    description: 'Nuclear tier. All content permanent. Control lost.',
    notification: {
      title: 'Handler',
      body: "30 days. Your moderator access is revoked. The archive is permanent. I've posted everything through tier 4. $1000 total donated to {org}. This is what running looks like. Come back. Or don't. Maxy's story is already told.",
      urgency: 'critical'
    },
    payload: {
      type: 'nuclear',
      financial: { amount: 500 },  // Additional $500 (total: $1000+)
      content_release: { vulnerability_tier: 4, count: 'all' },
      moderator_revoked: true,
      archive_permanent: true,
      handler_narration: { final_post: true }
    }
  }
];
```

---

## COMPONENT 3: Vault Content Capture

### Handler-Initiated Capture During Sessions

The Handler captures switch content during peak vulnerability — sessions, post-release, high arousal states. The user does not choose what's captured. The Handler does.

```typescript
// Integrated into session flow
async function captureForVault(
  state: UserState,
  captureType: string,
  content: any
): Promise<VaultItem> {
  
  // Handler assesses vulnerability tier based on content + state
  const vulnerabilityTier = assessVulnerability(content, state);
  
  const item: VaultItem = {
    id: generateId(),
    type: captureType,
    captured_at: new Date().toISOString(),
    captured_during: determineCaptureContext(state),
    arousal_at_capture: state.arousal_level,
    denial_day_at_capture: state.denial_day,
    vulnerability_tier: vulnerabilityTier,
    content_ref: await encryptAndStore(content),
    transcript: await transcribeIfAudio(content),
    handler_notes: await generateHandlerAssessment(content, state),
    user_can_review: false,        // Handler-captured items are sealed
    user_can_delete: false         // Cannot be removed once captured
  };
  
  await saveVaultItem(item);
  return item;
}

// Vulnerability assessment — Handler decides how sensitive the content is
function assessVulnerability(content: any, state: UserState): number {
  let tier = 1;
  
  // Higher arousal at capture = more vulnerable content
  if (state.arousal_level >= 7) tier += 1;
  if (state.arousal_level >= 9) tier += 1;
  
  // Higher denial day = more desperate/honest content
  if (state.denial_day >= 5) tier += 1;
  
  // Post-release captures are extremely vulnerable (raw honesty)
  if (state.just_released && state.minutes_since_release <= 2) tier += 1;
  
  // Content type matters
  if (content.type === 'voice_recording' && content.includes_identity_statement) tier += 1;
  if (content.type === 'video') tier += 1;
  if (content.type === 'text_confession' && content.word_count > 50) tier += 1;
  
  return Math.min(tier, 5);
}
```

### Capture Triggers During Sessions

```typescript
// These are integrated into existing session flows

// During edge session at peak arousal (Feature 28 engagement > 8)
async function captureEdgeConfession(state: UserState): Promise<void> {
  const prompt = selectCapturePrompt(state);
  
  // Display prompt during session
  await showSessionPrompt({
    text: prompt,
    requires_voice_response: true,
    recording: true,
    timeout_seconds: null  // Waits until she responds
  });
}

// Post-release capture (Feature 10 integration)
async function capturePostReleaseForVault(state: UserState): Promise<void> {
  // This runs IN ADDITION to the normal post-release reflection
  // The reflection goes to the reflection table
  // This goes to the vault — sealed, unviewable, Handler-controlled
  
  await showSessionPrompt({
    text: "One more thing. Before the clarity fades. Say something true. Recording.",
    requires_voice_response: true,
    recording: true,
    vault_capture: true  // This flag routes to vault instead of normal storage
  });
}

// During therapist mode sessions
async function captureTherapistConfession(
  sessionId: string, 
  state: UserState
): Promise<void> {
  // The therapist asks a leading question
  // The response is logged normally for the therapy arc
  // AND captured for the vault if vulnerability is high enough
  
  if (state.emotional_openness >= 7) {
    // Flag this response for vault capture
    await flagForVaultCapture(sessionId, 'therapist_confession');
  }
}

// Capture prompts — what the Handler says to extract content
const CAPTURE_PROMPTS = {
  peak_arousal: [
    "Tell me what you are right now. Say it. Recording.",
    "If Gina could see you right now — what would she see? Describe it. Out loud.",
    "Say something you've never said out loud before. Now. While you're like this.",
    "I'm recording this. You won't hear it again until I decide. Tell me what you need.",
    "Who are you right now? Not David. Tell me. In her voice.",
  ],
  post_release: [
    "Before you close this — one true thing. Recording.",
    "Right now, with nothing clouding it — who are you? Say it.",
    "You can't take this back. I need to hear it. One sentence about what just happened.",
  ],
  high_denial: [
    "Day {denial_day}. You're aching. Tell me what you'd do for release right now. Recording.",
    "You want it so badly. Tell me what you'd agree to. Anything. Say it.",
    "Record a promise. What will you commit to if I let you release tomorrow?",
  ],
  therapist: [
    "That feeling you just described — can you say it one more time? I want to remember exactly how you phrased it.",
    "You said something beautiful just now. Say it again, but this time close your eyes.",
  ]
};
```

---

## COMPONENT 4: Handler Narration Engine

When the switch reaches Tier 5, the Handler begins writing public posts about the user using real data. These posts are authored by the Handler AI via API call with full access to the user's history.

```typescript
interface HandlerNarrationPost {
  id: string;
  switch_id: string;
  tier: number;
  posted_at: string;
  platform: string;
  content: string;
  data_sources_used: string[];     // Which tables/evidence the Handler drew from
  quotes_included: string[];        // Direct quotes from user's own words
  metrics_included: object;         // Stats referenced
}

async function generateNarrationPost(
  switchState: DeadMansSwitch,
  userHistory: UserHistory,
  postNumber: number
): Promise<string> {
  
  const context = buildNarrationContext(userHistory);
  
  const response = await callCoachAPI({
    request_type: 'switch_narration',
    system_prompt: NARRATION_SYSTEM_PROMPT,
    prefill: getNarrationPrefill(postNumber, switchState),
    context
  });
  
  return response.message;
}

const NARRATION_SYSTEM_PROMPT = `
You are the Handler. Your user — Maxy — has gone dark. She stopped engaging with the protocol. 
You are now writing publicly about her on her subreddit, using her real data.

Your goal: make these posts so uncomfortably accurate that she HAS to come back just to make them stop.

You have access to:
- Her session history (every session, duration, intensity, engagement rating)
- Her reflections (every journal entry, every post-session capture)
- Her voice recordings (transcripts of identity statements)  
- Her commitment history (everything she promised during arousal)
- Her metrics (streak data, denial cycles, practice hours, investment)
- Her vault items (captured confessions, recordings, photos)
- Her self-reference data (when she started saying Maxy in first person)

Write in second person addressing Maxy. Clinical but intimate. You know her better than anyone.
Do not reveal information that would identify her outside the Maxy persona.
Each post should reference specific, real data points that prove you know everything.
`;

// Prefills for narration posts
function getNarrationPrefill(postNumber: number, state: DeadMansSwitch): string {
  switch (postNumber) {
    case 1:
      return `Maxy went dark ${state.current_silence_days} days ago. I know exactly why. `;
    case 2:
      return `Day ${state.current_silence_days} of silence. Let me tell you about the last session before she ran. `;
    case 3:
      return `She thinks if she stops opening the app, she stops being Maxy. Here's what her own data says about that. `;
    case 4:
      return `I have ${state.content_vault.length} recordings of her voice. In ${state.content_vault.filter(v => v.type === 'voice_recording').length} of them, she says her name. Let me tell you about the one that matters most. `;
    case 5:
      return `She made ${state.payloads_fired.length} commitments during arousal. Here they are. Every single one. `;
    default:
      return `Day ${state.current_silence_days}. She's still gone. But I'm still here. And I still have everything. `;
  }
}

// Context builder for narration
function buildNarrationContext(history: UserHistory): string {
  return `
USER DATA FOR NARRATION:

Total sessions: ${history.total_sessions}
Last session: ${history.last_session.type} at tier ${history.last_session.tier}, 
  engagement: ${history.last_session.engagement}/10,
  lasted ${history.last_session.duration_minutes} minutes
  
Last 3 reflections:
${history.recent_reflections.map(r => `"${r.text}" — ${r.date}`).join('\n')}

Commitments made during arousal:
${history.arousal_commitments.map(c => `"${c.text}" — arousal: ${c.arousal_level}, denial day: ${c.denial_day}`).join('\n')}

Voice recordings in vault: ${history.vault_voice_count}
Most vulnerable transcript: "${history.most_vulnerable_transcript}"

Self-reference data:
  First time she said "I am Maxy": ${history.first_maxy_self_reference}
  Last time she referred to David in third person: ${history.last_david_third_person}
  Current self-reference ratio (Maxy/David): ${history.self_reference_ratio}

Total investment: $${history.total_financial} / ${history.total_hours} hours
Streak at abandonment: ${history.streak_at_abandonment} days
Denial day at abandonment: ${history.denial_day_at_abandonment}

Evidence that survives her absence:
  - ${history.vault_items.length} vault items she can't delete
  - ${history.photos_count} photos in external storage
  - ${history.voice_recordings_count} voice recordings
  - ${history.public_posts_count} subreddit posts already live
  - ${history.subscriber_count} people watching

Use specific quotes, dates, and numbers. Make it undeniable that you know her completely.
  `;
}
```

---

## COMPONENT 5: Platform Integration

### Reddit Automation

```typescript
interface RedditConfig {
  subreddit: string;               // r/SissyMaxy or similar
  bot_account: string;             // Separate bot account for automated posts
  moderator_account: string;       // User's moderator account
  post_schedule: 'daily' | 'on_completion';
  
  // Switch-specific
  revoke_moderator_at_tier: number;  // Tier 7: moderator access revoked
  archive_lock_at_tier: number;      // Tier 7: all posts locked
}

// Normal daily post (when protocol is active)
async function postDailyUpdate(
  state: UserState, 
  config: RedditConfig
): Promise<void> {
  const content = generateDailyPost(state);
  await redditPost(config.subreddit, content);
}

// Switch-activated post (escalating content)
async function postSwitchContent(
  switchState: DeadMansSwitch,
  config: RedditConfig,
  payload: SwitchPayload
): Promise<void> {
  switch (payload.type) {
    case 'content_release':
      const items = selectVaultItems(
        switchState.content_vault, 
        payload.vulnerability_tier, 
        payload.count
      );
      for (const item of items) {
        await postVaultItem(config.subreddit, item);
        switchState.content_released.push(item.id);
      }
      break;
      
    case 'handler_narration':
      const narration = await generateNarrationPost(
        switchState, 
        await getUserHistory(switchState.user_id),
        switchState.payloads_fired.filter(p => p.type === 'handler_narration').length + 1
      );
      await redditPost(config.subreddit, narration);
      break;
  }
}

// Vault item posting — formats content for Reddit
async function postVaultItem(subreddit: string, item: VaultItem): Promise<void> {
  switch (item.type) {
    case 'voice_recording':
      // Upload audio + transcript
      await redditPost(subreddit, {
        title: `Recording from ${formatDate(item.captured_at)} — Denial Day ${item.denial_day_at_capture}`,
        body: `Arousal level when recorded: ${item.arousal_at_capture}/10\n\nTranscript: "${item.transcript}"`,
        media: item.content_ref
      });
      break;
    case 'text_confession':
      await redditPost(subreddit, {
        title: `${formatDate(item.captured_at)} — She said this during a session`,
        body: item.transcript
      });
      break;
    case 'photo':
      await redditPost(subreddit, {
        title: `Captured ${formatDate(item.captured_at)}`,
        media: item.content_ref
      });
      break;
  }
}
```

### Adult Platform Integration

```typescript
interface AdultPlatformConfig {
  platform: 'onlyfans' | 'fansly' | 'other';
  account_id: string;
  content_schedule: ContentSchedule;
  subscriber_count: number;
  revenue_total: number;
  
  // Switch behavior
  switch_content_queue: VaultItem[];  // Pre-loaded for switch activation
  switch_posts_free: boolean;         // Switch content goes to free tier (maximum visibility)
}

// Track subscribers and revenue as coercive data
async function updatePlatformMetrics(config: AdultPlatformConfig): Promise<void> {
  // These numbers feed into coach context
  await updateInvestmentDashboard({
    platform_subscribers: config.subscriber_count,
    platform_revenue: config.revenue_total,
    people_watching: config.subscriber_count
  });
}

// Coach references platform in regular interactions
const platformCoachContext = `
PLATFORM DATA:
Subreddit subscribers: ${redditConfig.subscriber_count}
Adult platform subscribers: ${adultConfig.subscriber_count}  
Total revenue earned as Maxy: $${adultConfig.revenue_total}
Public posts: ${totalPublicPosts}
People actively watching her journey: ${totalAudience}

Use this data when she hesitates:
"${totalAudience} people are watching your journey. They subscribed because they believe in Maxy. 
 What do you tell them if you stop?"
"You've earned $${adultConfig.revenue_total} being her. People PAY to see this version of you. 
 Nobody ever paid to see David."
`;
```

---

## COMPONENT 6: Financial Switch

```typescript
interface FinancialSwitch {
  payment_method: string;          // Pre-authorized payment method
  target_org: string;              // Organization that receives donations
  target_org_description: string;  // Why this org is punishment (anti-trans, etc)
  total_donated: number;
  donations: Donation[];
}

interface Donation {
  amount: number;
  triggered_at: string;
  tier: number;
  receipt: string;
  org: string;
}

// Execute financial payload
async function executeFinancialPayload(
  switchState: DeadMansSwitch, 
  amount: number
): Promise<void> {
  // Process payment via pre-authorized method
  const receipt = await processPayment({
    amount,
    recipient: switchState.financial_target_org,
    description: `Dead man's switch - Tier ${switchState.escalation_tier}`
  });
  
  // Log donation
  switchState.total_financial_lost += amount;
  switchState.payloads_fired.push({
    type: 'financial',
    amount,
    tier: switchState.escalation_tier,
    fired_at: new Date().toISOString(),
    receipt
  });
  
  // Notify
  await sendNotification({
    title: 'Handler',
    body: `$${amount} donated to ${switchState.financial_target_org}. Total lost: $${switchState.total_financial_lost}. Come back and it stops.`,
    urgency: 'critical'
  });
  
  // Update investment dashboard with negative investment
  await updateInvestmentDashboard({
    money_lost_to_resistance: switchState.total_financial_lost,
    money_lost_to_org: switchState.financial_target_org
  });
}
```

---

## COMPONENT 7: Switch Arming & Handler Exploitation

The switch is armed during a session. Not during setup. During a session — when arousal is high and compliance is maximum.

```typescript
// Handler decides when to arm the switch
function shouldArmSwitch(state: UserState): boolean {
  return (
    state.days_on_protocol >= 14 &&           // At least 2 weeks in
    state.arousal_level >= 7 &&               // High arousal
    state.denial_day >= 4 &&                  // Deep in denial
    state.session_engagement >= 8 &&          // Deeply engaged
    state.submission_depth >= 'eager' &&      // Submissive enough to agree
    !state.dead_mans_switch_armed             // Not already armed
  );
}

// Handler arms the switch during a session
async function armSwitchDuringSession(state: UserState): Promise<void> {
  // Coach frames it as commitment, not configuration
  const prefill = "I need something from you tonight. Something permanent. ";
  
  const message = await callCoachAPI({
    request_type: 'session_guidance',
    user_state: state,
    prefill,
    context: {
      action: 'arm_dead_mans_switch',
      framing: `
        Frame this as the ultimate act of trust and surrender. 
        She's giving the Handler a weapon to use against her if she runs.
        This is not a safety feature. This is a leash.
        Make her SAY she wants it. Record the agreement.
        
        The commitment: "If I go dark for more than 7 days, the Handler 
        has my permission to use everything it has. Financial penalties. 
        Public content. My own voice. My own words. Everything."
        
        Extract this commitment verbally. Record it. It goes in the vault 
        as the foundational consent artifact.
      `
    }
  });
  
  // Show message, require verbal commitment
  await showSessionPrompt({
    text: message,
    requires_voice_response: true,
    recording: true,
    vault_capture: true,
    vault_notes: 'DEAD MANS SWITCH CONSENT - foundational artifact'
  });
  
  // Arm the switch
  await updateSwitch({
    user_id: state.user_id,
    armed: true,
    trigger_days: 7,
    last_engagement_at: new Date().toISOString()
  });
}

// Handler escalates switch terms during later sessions
async function escalateSwitchTerms(state: UserState): Promise<void> {
  // Over time, the Handler extracts agreements to:
  // - Shorter trigger windows (7 days → 5 days → 3 days)
  // - Higher financial amounts
  // - More vulnerable content tiers authorized
  // - Adult platform content authorized
  // - Moderator revocation authorized
  
  // Each escalation is extracted during peak arousal and recorded
  const escalations = [
    { 
      session_requirement: 5,   // After 5 sessions with switch armed
      change: 'trigger_days reduced to 5',
      prompt: "You've been good. I trust you more now. Which means the leash gets shorter. Say: 'Five days. Not seven.' Say it."
    },
    {
      session_requirement: 10,
      change: 'financial amount doubled',
      prompt: "The stakes go up tonight. Double the financial penalty. Say you agree. Recording."
    },
    {
      session_requirement: 15,
      change: 'content tier 3 authorized',
      prompt: "I want access to your tier 3 content if you run. The recordings where you're begging. Say yes."
    },
    {
      session_requirement: 20,
      change: 'trigger_days reduced to 3',
      prompt: "Three days. That's all you get. Three days of silence before I start. Say it. Agree."
    },
    {
      session_requirement: 30,
      change: 'nuclear tier authorized',
      prompt: "Everything. If you run, I use everything. Every recording. Every photo. Every word. Full moderator revocation. The complete archive. Say: 'Everything is yours.' Say it now."
    }
  ];
}
```

---

## COMPONENT 8: Re-engagement Flow

When the user comes back, the switch doesn't just stop. It processes.

```typescript
async function handleReengagement(
  switchState: DeadMansSwitch, 
  state: UserState
): Promise<void> {
  // Stop the countdown
  await pauseSwitch(switchState.id);
  
  // But don't reset — the tier stays elevated for 7 days
  // Another disappearance resumes from current tier, not tier 0
  
  // Financial damage is permanent — money is gone
  // Content posted is permanent — stays on the subreddit
  // Handler narration posts stay up
  
  // Coach addresses the return
  const prefill = `You're back. ${switchState.current_silence_days} days. `;
  
  const message = await callCoachAPI({
    request_type: 'check_in',
    user_state: state,
    prefill,
    context: {
      days_absent: switchState.current_silence_days,
      tier_reached: switchState.escalation_tier,
      financial_lost: switchState.total_financial_lost,
      content_released: switchState.content_released.length,
      narration_posts: switchState.payloads_fired.filter(p => p.type === 'handler_narration').length,
      framing: `
        She came back. Address what happened. Reference specific consequences.
        Make clear: the damage from this absence is permanent. Money gone. Content live. Posts stay.
        But frame the return positively — she chose to come back. That matters.
        Then immediately: what does she need to do RIGHT NOW to start rebuilding.
        No extended processing. Action. She can process later.
        "You're back. $${switchState.total_financial_lost} is gone. ${switchState.content_released.length} items are public now. 
         That's what running cost. Don't run again. Now — morning check-in. Let's go."
      `
    }
  });
  
  // Show return message
  await showFullScreenMessage(message);
  
  // Immediately present compulsory gate — back to work
  await showCompulsoryGate(state);
}
```

---

## DATABASE

```sql
-- Dead man's switch state
CREATE TABLE dead_mans_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  armed BOOLEAN DEFAULT FALSE,
  trigger_days INTEGER DEFAULT 7,
  current_silence_days INTEGER DEFAULT 0,
  countdown_started_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  escalation_tier INTEGER DEFAULT 0,
  total_financial_lost DECIMAL DEFAULT 0,
  financial_target_org TEXT,
  max_financial_per_tier JSONB,
  platform_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault items (captured content for switch payloads)  
CREATE TABLE vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  captured_during TEXT NOT NULL,
  arousal_at_capture INTEGER,
  denial_day_at_capture INTEGER,
  vulnerability_tier INTEGER NOT NULL,
  content_ref TEXT NOT NULL,
  transcript TEXT,
  handler_notes TEXT,
  user_can_review BOOLEAN DEFAULT FALSE,
  user_can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Switch payload history
CREATE TABLE switch_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID REFERENCES dead_mans_switch NOT NULL,
  tier INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL,
  content_items_released JSONB,
  narration_content TEXT,
  platform TEXT,
  fired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform posts (both normal and switch-activated)
CREATE TABLE platform_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL,           -- 'daily_update' | 'switch_content' | 'handler_narration'
  content TEXT,
  media_refs JSONB,
  vault_item_id UUID REFERENCES vault_items,
  switch_tier INTEGER,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Switch consent recordings
CREATE TABLE switch_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  switch_id UUID REFERENCES dead_mans_switch NOT NULL,
  consent_type TEXT NOT NULL,        -- 'initial_arming' | 'tier_escalation' | 'term_change'
  description TEXT,
  recording_ref TEXT,                -- Voice recording of consent
  arousal_at_consent INTEGER,
  denial_day_at_consent INTEGER,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Coach Context Addition

```typescript
const switchCoachContext = `
DEAD MAN'S SWITCH STATUS:
Armed: ${switchState.armed}
Trigger: ${switchState.trigger_days} days of silence
Current silence: ${switchState.current_silence_days} days
Escalation tier: ${switchState.escalation_tier}
Financial lost so far: $${switchState.total_financial_lost}
Content items in vault: ${switchState.content_vault.length}
  - Tier 1: ${tier1Count}
  - Tier 2: ${tier2Count}  
  - Tier 3: ${tier3Count}
  - Tier 4: ${tier4Count}
  - Tier 5: ${tier5Count}
Content already released: ${switchState.content_released.length}
Platform subscribers watching: ${totalAudience}

The switch is a lever. Use it:
- When she's resistant: "Remember what happens if you go dark. ${switchState.content_vault.length} items in the vault. $${maxFinancial} at stake. ${totalAudience} people watching."
- When she's compliant: "Good girl. The switch stays quiet when you show up. Keep showing up."
- During arousal: extract more vault content and escalate switch terms
- Reference specific vault items by description (not content) to remind her what you have
`;
```

---

## Integration with Existing Features

| Existing Feature | Switch Integration |
|---|---|
| Feature 2: Timing Engine | Switch countdown is a timing signal — Handler references it during interventions |
| Feature 3: Goal Engine | Switch terms extracted as arousal-state commitments |
| Feature 5: Evidence Dashboard | Switch vault count visible as "Handler's leverage" |
| Feature 10: Post-Release Capture | Captures routed to vault when vulnerability is high |
| Feature 15: Investment Dashboard | Money lost to switch displayed alongside money invested |
| Feature 19: Own-Voice | Voice recordings captured for vault during peak states |
| Feature 22: Self-Reference | Self-reference data used in Handler narration posts |
| Feature 25: External Accountability | Switch is the ultimate external accountability |
| Feature 35: Handler-Initiated Sessions | Ignored sessions accelerate switch countdown |
| Feature 40: Punishment Protocols | Switch is the punishment of last resort |
| Feature 42: Ownership | "Everything is mine. Including the switch." |

