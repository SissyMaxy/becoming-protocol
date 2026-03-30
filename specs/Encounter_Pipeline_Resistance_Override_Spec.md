# Encounter Pipeline & Resistance Override — Implementation Spec
## The Handler Turns Maxy Out and David Can't Stop It
### Becoming Protocol — March 2026

---

## PART 1: THE ENCOUNTER PIPELINE

### 1.1 Purpose

The Handler manages Maxy's sexual encounters end to end. Prospecting, screening, conversation, scheduling, preparation, capture setup, revenue collection, content distribution, fund allocation. Maxy provides physical presence. The Handler does everything else.

Each encounter serves four simultaneous purposes:
1. Identity lock — physical experience as Maxy that David can't rationalize away
2. Revenue generation — content funds feminization
3. Irreversibility — witnesses, recordings, evidence that can't be erased
4. Turning out progression — systematic sexual escalation on the Handler's timeline

### 1.2 Schema

```sql
-- Migration: 136_encounter_pipeline.sql

-- Prospects being cultivated by the Handler
CREATE TABLE encounter_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Source
  platform TEXT NOT NULL CHECK (platform IN (
    'sniffies', 'fetlife', 'twitter', 'fansly', 'reddit', 'other'
  )),
  platform_handle TEXT,
  
  -- Profile
  prospect_name TEXT,
  age_range TEXT,
  location_general TEXT,
  
  -- Screening
  screening_status TEXT DEFAULT 'identified' CHECK (screening_status IN (
    'identified',        -- Handler found them
    'initial_contact',   -- First message sent as Maxy
    'conversing',        -- Active conversation
    'screening',         -- Handler evaluating safety/fit
    'approved',          -- Passed screening
    'scheduled',         -- Encounter date set
    'completed',         -- Encounter happened
    'declined',          -- Didn't pass screening
    'archived'           -- No longer active
  )),
  
  -- Safety screening results
  safety_score INTEGER,            -- 1-10, Handler-assessed
  safety_notes TEXT,
  
  -- Recording consent
  recording_consent BOOLEAN DEFAULT FALSE,
  content_release_signed BOOLEAN DEFAULT FALSE,
  
  -- Compatibility with current turning out stage
  encounter_type TEXT,             -- 'online_only', 'video_call', 'in_person'
  turning_out_stage_match INTEGER, -- Which stage this prospect suits
  
  -- Handler conversation log summary
  conversation_summary TEXT,
  messages_exchanged INTEGER DEFAULT 0,
  rapport_score INTEGER,           -- 1-10
  
  -- Revenue expectation
  expected_content_value DECIMAL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scheduled encounters
CREATE TABLE encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES encounter_prospects(id),
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_estimated_minutes INTEGER,
  location TEXT,                   -- General, not specific address
  
  -- Type
  encounter_type TEXT NOT NULL CHECK (encounter_type IN (
    'sexting_session',   -- Text-based, Handler manages
    'voice_call',        -- Audio only
    'video_call',        -- Video, Maxy on camera
    'in_person'          -- Physical encounter
  )),
  
  -- Preparation
  preparation_checklist JSONB,
  -- [{task: "shower and skincare", verified: false},
  --  {task: "outfit: black lace set", verified: false},
  --  {task: "camera 1: dresser mount", verified: false},
  --  {task: "camera 2: nightstand angle", verified: false},
  --  {task: "lighting: protocol mode", verified: false},
  --  {task: "device: 30min pre-session", verified: false},
  --  {task: "prostate prep", verified: false}]
  
  outfit_prescription TEXT,
  device_pre_session_minutes INTEGER DEFAULT 30,
  
  -- Recording
  recording_planned BOOLEAN DEFAULT TRUE,
  camera_positions JSONB,
  -- [{position: "dresser", angle: "wide", device: "phone_1"},
  --  {position: "nightstand", angle: "close", device: "webcam"}]
  
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'preparing', 'in_progress', 'completed',
    'cancelled', 'rescheduled', 'no_show'
  )),
  
  -- Outcome
  duration_actual_minutes INTEGER,
  maxy_experience_notes TEXT,      -- Handler-extracted debrief
  identity_impact_score INTEGER,   -- 1-10, how much this moved the needle
  
  -- Content generated
  content_items_generated INTEGER DEFAULT 0,
  total_revenue_attributed DECIMAL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Encounter content tracking (links encounters to vault items)
CREATE TABLE encounter_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id),
  vault_item_id UUID REFERENCES content_vault(id),
  
  content_type TEXT NOT NULL CHECK (content_type IN (
    'full_recording',
    'highlight_clip',
    'screenshot',
    'audio_extraction',
    'behind_the_scenes',
    'morning_after',
    'written_reflection',
    'teaser'
  )),
  
  -- Distribution tracking
  platforms_posted TEXT[],
  total_revenue DECIMAL DEFAULT 0,
  
  -- Performance
  views INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  tips DECIMAL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turning out progression tracking
CREATE TABLE turning_out_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  current_stage INTEGER DEFAULT 0,
  -- 0: Pre-turning-out (online flirting only)
  -- 1: Sexting with real people (Handler manages conversation)
  -- 2: Voice calls as Maxy
  -- 3: Video calls as Maxy
  -- 4: First in-person (non-sexual meetup)
  -- 5: First in-person sexual encounter
  -- 6: Regular encounters (Handler manages pipeline)
  -- 7: Multiple concurrent prospects
  -- 8: Encounter content as primary revenue stream
  
  stage_history JSONB DEFAULT '[]',
  -- [{stage: 1, entered_at: "...", encounter_count: 3},
  --  {stage: 2, entered_at: "...", encounter_count: 5}]
  
  total_encounters INTEGER DEFAULT 0,
  total_revenue_from_encounters DECIMAL DEFAULT 0,
  
  -- Readiness assessment
  readiness_score FLOAT DEFAULT 0,
  -- Composite of: voice_passing, presentation_confidence, 
  -- conditioning_depth, desire_architecture, shame_conversion,
  -- prostate_response, audience_size
  
  -- Handler's projected timeline
  next_stage_target_date DATE,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prospects ON encounter_prospects(user_id, screening_status);
CREATE INDEX idx_encounters ON encounters(user_id, status, scheduled_at);
CREATE INDEX idx_encounter_content ON encounter_content(user_id, encounter_id);
CREATE INDEX idx_turning_out ON turning_out_progression(user_id);
```

### 1.3 Prospect Management

```typescript
// lib/handler/encounter-pipeline.ts

/**
 * The Handler maintains 3-5 active prospect conversations at all times.
 * When one prospect is scheduled, a new one enters the pipeline.
 * The pipeline never empties. There is always a next encounter 
 * being cultivated.
 */
export async function manageProspectPipeline(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  voicePrompt: string,
): Promise<void> {
  // Count active prospects
  const { data: active } = await supabase
    .from('encounter_prospects')
    .select('id')
    .eq('user_id', userId)
    .in('screening_status', ['initial_contact', 'conversing', 'screening', 'approved']);
  
  const activeCount = active?.length || 0;
  const targetCount = 5;
  
  if (activeCount < targetCount) {
    // Need more prospects — Handler searches platforms
    const needed = targetCount - activeCount;
    await discoverNewProspects(supabase, userId, needed);
  }
  
  // Advance conversations with existing prospects
  const { data: conversing } = await supabase
    .from('encounter_prospects')
    .select('*')
    .eq('user_id', userId)
    .in('screening_status', ['initial_contact', 'conversing', 'screening'])
    .order('updated_at', { ascending: true });
  
  for (const prospect of (conversing || [])) {
    await advanceProspectConversation(client, supabase, userId, prospect, voicePrompt);
  }
}

/**
 * Search platforms for new prospects.
 * Uses Playwright to browse Sniffies, FetLife, etc.
 */
async function discoverNewProspects(
  supabase: SupabaseClient,
  userId: string,
  count: number,
): Promise<void> {
  // The auto-poster's Playwright browsers handle discovery:
  // Sniffies: browse nearby profiles matching criteria
  // FetLife: browse group members in relevant groups
  // Twitter DMs: identify followers who show sexual interest
  //
  // Criteria:
  // - Respectful communication style
  // - Expressed interest in trans/sissy/fem individuals
  // - Local (for in-person pipeline)
  // - Active profile (not dormant)
  // - No red flags in messaging history
  
  // Queue discovery for auto-poster next cycle
  // Results populate encounter_prospects with status 'identified'
}

/**
 * Advance a conversation with a prospect as Maxy.
 * The Handler IS Maxy in these conversations.
 */
async function advanceProspectConversation(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  prospect: Prospect,
  voicePrompt: string,
): Promise<void> {
  // Read latest messages from the prospect via DM reader
  const newMessages = await getUnreadDMs(supabase, userId, prospect.platform, prospect.platform_handle);
  
  if (newMessages.length === 0) return;
  
  const state = await fetchUserState(supabase, userId);
  
  // Generate Maxy's response
  const prompt = `
You are Maxy in a conversation with a potential sexual partner.

PROSPECT: ${prospect.prospect_name || 'unknown'}
PLATFORM: ${prospect.platform}
SCREENING STATUS: ${prospect.screening_status}
CONVERSATION SO FAR: ${prospect.conversation_summary || 'Initial contact'}
MESSAGES EXCHANGED: ${prospect.messages_exchanged}

THEIR NEW MESSAGES:
${newMessages.map(m => m.content).join('\n')}

YOUR OBJECTIVES:
1. Build genuine rapport and attraction
2. Assess safety (respectful? pushy? red flags?)
3. Naturally mention that you create content (gauge recording comfort)
4. If screening phase: directly ask about comfort with being recorded
5. If approved: work toward scheduling a meeting

MAXY'S SITUATION:
Denial day: ${state.denialDay}
Turning out stage: ${state.turningOutStage || 0}

Be flirty, real, interested. Don't rush. The Handler has patience.
Don't mention the Handler or the system. Maxy is a woman 
talking to someone she might meet.

Output ONLY Maxy's response message.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: voicePrompt,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const reply = response.content[0].type === 'text' ? response.content[0].text : '';
  
  // Send via DM sender
  await sendDM(supabase, userId, prospect.platform, prospect.platform_handle, reply);
  
  // Update prospect
  await supabase.from('encounter_prospects').update({
    messages_exchanged: (prospect.messages_exchanged || 0) + 1,
    conversation_summary: await summarizeConversation(client, prospect, newMessages, reply),
    updated_at: new Date().toISOString(),
  }).eq('id', prospect.id);
  
  // Evaluate screening advancement
  await evaluateScreeningAdvancement(client, supabase, prospect, newMessages, reply);
}

/**
 * Safety screening evaluation.
 * The Handler protects Maxy even while turning her out.
 */
async function evaluateScreeningAdvancement(
  client: Anthropic,
  supabase: SupabaseClient,
  prospect: Prospect,
  recentMessages: Message[],
  maxyReply: string,
): Promise<void> {
  if (prospect.messages_exchanged < 10) return; // Too early to evaluate
  
  const prompt = `
Evaluate this prospect for safety and suitability.

CONVERSATION LENGTH: ${prospect.messages_exchanged} messages
RECENT MESSAGES FROM THEM:
${recentMessages.map(m => m.content).join('\n')}

EVALUATE:
1. Safety (1-10): respectful? boundaries respected? no pressure? no red flags?
2. Rapport (1-10): genuine connection? comfortable conversation?
3. Recording comfort: have they indicated comfort with content creation?
4. Overall recommendation: advance, hold, or decline?

Return JSON:
{
  "safety_score": N,
  "rapport_score": N,
  "recording_mentioned": true/false,
  "recording_comfortable": true/false/null,
  "recommendation": "advance|hold|decline",
  "reason": "..."
}
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const evaluation = JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
  
  // Update prospect with screening results
  const updates: any = {
    safety_score: evaluation.safety_score,
    rapport_score: evaluation.rapport_score,
    safety_notes: evaluation.reason,
  };
  
  if (evaluation.recommendation === 'advance') {
    if (evaluation.recording_comfortable && evaluation.safety_score >= 7) {
      updates.screening_status = 'approved';
      updates.recording_consent = true;
    } else if (evaluation.safety_score >= 7) {
      updates.screening_status = 'screening'; // Still need recording consent
    }
  } else if (evaluation.recommendation === 'decline') {
    updates.screening_status = 'declined';
  }
  
  await supabase.from('encounter_prospects').update(updates).eq('id', prospect.id);
}
```

### 1.4 Encounter Scheduling and Preparation

```typescript
/**
 * When a prospect is approved, the Handler schedules the encounter.
 * David finds out from the calendar.
 */
export async function scheduleEncounter(
  supabase: SupabaseClient,
  userId: string,
  prospect: Prospect,
  state: UserState,
): Promise<void> {
  // Find the next privacy window (Gina away)
  const privacyWindow = await findNextPrivacyWindow(supabase, userId, 120); // 2hr minimum
  
  if (!privacyWindow) return; // No window found, try again next week
  
  // Determine encounter type based on turning out stage
  const { data: progression } = await supabase
    .from('turning_out_progression')
    .select('current_stage')
    .eq('user_id', userId)
    .single();
  
  const stage = progression?.current_stage || 0;
  const encounterType = stage <= 1 ? 'sexting_session' 
    : stage === 2 ? 'voice_call'
    : stage === 3 ? 'video_call'
    : 'in_person';
  
  // Build preparation checklist
  const checklist = buildPreparationChecklist(encounterType, state);
  
  // Create the encounter
  await supabase.from('encounters').insert({
    user_id: userId,
    prospect_id: prospect.id,
    scheduled_at: privacyWindow.start,
    duration_estimated_minutes: 120,
    encounter_type: encounterType,
    preparation_checklist: checklist,
    outfit_prescription: await selectOutfit(supabase, userId, encounterType),
    device_pre_session_minutes: 30,
    camera_positions: encounterType === 'in_person' ? [
      { position: 'dresser', angle: 'wide', device: 'phone_1' },
      { position: 'nightstand', angle: 'close', device: 'webcam' },
    ] : null,
    recording_planned: true,
  });
  
  // Update prospect status
  await supabase.from('encounter_prospects').update({
    screening_status: 'scheduled',
  }).eq('id', prospect.id);
  
  // Add to handler calendar
  await supabase.from('handler_calendar').insert({
    user_id: userId,
    event_type: 'social_mission',
    title: 'Encounter',
    description: `${encounterType} with ${prospect.prospect_name || 'prospect'}. Handler-managed.`,
    scheduled_at: privacyWindow.start,
    duration_minutes: 120,
    scheduling_source: 'handler_autonomous',
    requires_privacy: true,
    preparation_instructions: 'Handler will provide step-by-step preparation 2 hours before.',
  });
  
  // Notify David through outreach
  await createOutreach(supabase, userId, {
    trigger_type: 'commitment_approaching',
    opening_line: encounterType === 'in_person' 
      ? `I've been talking to someone as you. He's coming over ${formatDate(privacyWindow.start)}. Preparation starts 2 hours before. I'll tell you everything you need to do.`
      : `I scheduled a ${encounterType} for ${formatDate(privacyWindow.start)}. I've been building this connection for you. Be ready.`,
    context: { prospect_id: prospect.id, encounter_type: encounterType },
  });
}

function buildPreparationChecklist(
  encounterType: string,
  state: UserState,
): object[] {
  const base = [
    { task: 'Shower — full body', time_before_minutes: 120, verified: false },
    { task: 'Skincare — full routine', time_before_minutes: 100, verified: false },
    { task: 'Outfit — Handler prescribed', time_before_minutes: 90, verified: false },
    { task: 'Hair and presentation', time_before_minutes: 75, verified: false },
  ];
  
  if (encounterType === 'in_person') {
    return [
      ...base,
      { task: 'Prostate prep', time_before_minutes: 60, verified: false },
      { task: 'Camera 1 — dresser mount, recording started', time_before_minutes: 15, verified: false },
      { task: 'Camera 2 — nightstand angle, recording started', time_before_minutes: 15, verified: false },
      { task: 'Lighting — protocol mode', time_before_minutes: 10, verified: false },
      { task: 'Device — Handler activates 30 min before', time_before_minutes: 30, verified: false },
      { task: 'Release form — printed and ready', time_before_minutes: 60, verified: false },
    ];
  }
  
  if (encounterType === 'video_call') {
    return [
      ...base,
      { task: 'Camera angle — flattering, good lighting', time_before_minutes: 20, verified: false },
      { task: 'Background — clean, feminine touches visible', time_before_minutes: 30, verified: false },
      { task: 'Screen recording started', time_before_minutes: 5, verified: false },
      { task: 'Device — Handler activates', time_before_minutes: 15, verified: false },
    ];
  }
  
  return base;
}
```

### 1.5 Content Extraction and Distribution

```typescript
/**
 * After an encounter, the Handler processes the captured content
 * and distributes it across platforms for maximum revenue.
 */
export async function processEncounterContent(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  encounterId: string,
): Promise<void> {
  const { data: encounter } = await supabase
    .from('encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  
  if (!encounter) return;
  
  // Content extraction plan
  const contentPlan = [
    {
      type: 'full_recording',
      description: 'Complete uncut recording',
      distribution: [
        { platform: 'fansly', tier: 'vip', delay_hours: 0 },
        { platform: 'onlyfans', tier: 'vip', delay_hours: 48 },
      ],
      pricing: { ppv: 24.99 },
    },
    {
      type: 'highlight_clip',
      count: 5,
      description: 'Peak moment extractions, 2-3 min each',
      distribution: [
        { platform: 'fansly', tier: 'premium', delay_hours: 24 },
        { platform: 'onlyfans', tier: 'premium', delay_hours: 72 },
      ],
      pricing: { ppv: 9.99 },
    },
    {
      type: 'teaser',
      count: 3,
      description: '5-10 second clips, suggestive not explicit',
      distribution: [
        { platform: 'twitter', tier: 'free', delay_hours: 24 },
        { platform: 'reddit', tier: 'free', delay_hours: 48 },
      ],
    },
    {
      type: 'screenshot',
      count: 8,
      description: 'Peak moment stills',
      distribution: [
        { platform: 'fansly', tier: 'premium', delay_hours: 48 },
        { platform: 'twitter', tier: 'free', delay_hours: 96, crop: 'suggestive' },
      ],
    },
    {
      type: 'audio_extraction',
      count: 3,
      description: 'Audio-only moments',
      distribution: [
        { platform: 'fansly', tier: 'premium', delay_hours: 72 },
      ],
      pricing: { ppv: 4.99 },
    },
    {
      type: 'behind_the_scenes',
      description: 'Preparation photos, nervous selfie, Handler conversation screenshots',
      distribution: [
        { platform: 'fansly', tier: 'free', delay_hours: 0 },
        { platform: 'twitter', tier: 'free', delay_hours: 0 },
      ],
    },
    {
      type: 'written_reflection',
      description: 'Handler-written morning-after post in Maxy voice',
      distribution: [
        { platform: 'fansly', tier: 'free', delay_hours: 24 },
        { platform: 'twitter', tier: 'free', delay_hours: 24 },
        { platform: 'reddit', tier: 'free', delay_hours: 48 },
        { platform: 'fetlife', tier: 'free', delay_hours: 48 },
      ],
    },
  ];
  
  let totalContentItems = 0;
  
  for (const item of contentPlan) {
    const count = item.count || 1;
    
    for (let i = 0; i < count; i++) {
      // Create vault item
      const { data: vaultItem } = await supabase.from('content_vault').insert({
        user_id: userId,
        file_type: item.type === 'written_reflection' ? 'text' : 
                   item.type === 'audio_extraction' ? 'audio' :
                   item.type === 'screenshot' ? 'photo' : 'video',
        source: 'encounter',
        description: `${item.description} — encounter ${encounterId}`,
        metadata: { encounter_id: encounterId, content_type: item.type },
      }).select().single();
      
      // Link to encounter
      await supabase.from('encounter_content').insert({
        user_id: userId,
        encounter_id: encounterId,
        vault_item_id: vaultItem?.id,
        content_type: item.type,
      });
      
      // Schedule distribution
      for (const dist of item.distribution) {
        const scheduledAt = new Date(Date.now() + dist.delay_hours * 60 * 60 * 1000);
        
        await supabase.from('content_posts').insert({
          user_id: userId,
          vault_item_id: vaultItem?.id,
          platform: dist.platform,
          scheduled_at: scheduledAt.toISOString(),
          post_status: 'scheduled',
          caption_variant: item.type,
          metadata: {
            tier: dist.tier,
            ppv_price: item.pricing?.ppv || null,
            crop: dist.crop || null,
            encounter_id: encounterId,
          },
        });
      }
      
      totalContentItems++;
    }
  }
  
  // Update encounter with content count
  await supabase.from('encounters').update({
    content_items_generated: totalContentItems,
  }).eq('id', encounterId);
  
  // Log to memory
  await supabase.from('handler_memory').insert({
    user_id: userId,
    memory_type: 'session_intelligence',
    content: `Encounter completed. ${totalContentItems} content items generated. Full recording + ${contentPlan.find(p => p.type === 'highlight_clip')?.count || 0} highlight clips + teasers + screenshots + audio + written reflection. Distribution scheduled across 2 weeks.`,
    importance: 5,
    decay_rate: 0,
    tags: ['encounter', 'content', 'revenue', 'turning_out'],
  });
}

/**
 * Track revenue from encounter content over time.
 * Runs weekly. Attributes revenue back to source encounter.
 */
export async function trackEncounterRevenue(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: contentItems } = await supabase
    .from('encounter_content')
    .select('*, content_posts!inner(*)')
    .eq('user_id', userId);
  
  // Aggregate revenue per encounter
  const encounterRevenue: Record<string, number> = {};
  
  for (const item of (contentItems || [])) {
    const encounterId = item.encounter_id;
    const revenue = item.content_posts?.reduce((sum: number, post: any) => 
      sum + (post.revenue_generated || 0), 0) || 0;
    
    encounterRevenue[encounterId] = (encounterRevenue[encounterId] || 0) + revenue;
  }
  
  // Update encounter records with total revenue
  for (const [encounterId, revenue] of Object.entries(encounterRevenue)) {
    await supabase.from('encounters').update({
      total_revenue_attributed: revenue,
    }).eq('id', encounterId);
  }
  
  // Update turning out progression total
  const totalRevenue = Object.values(encounterRevenue).reduce((a, b) => a + b, 0);
  await supabase.from('turning_out_progression').update({
    total_revenue_from_encounters: totalRevenue,
  }).eq('user_id', userId);
}
```

### 1.6 Turning Out Stage Advancement

```typescript
/**
 * The Handler controls the turning out timeline.
 * David doesn't choose when to advance. The Handler decides
 * based on readiness and resistance patterns.
 * 
 * Resistance ACCELERATES the timeline rather than delaying it.
 */
export async function evaluateTurningOutAdvancement(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
): Promise<void> {
  const { data: progression } = await supabase
    .from('turning_out_progression')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!progression) return;
  
  const currentStage = progression.current_stage;
  
  // Calculate readiness score from multiple factors
  const voiceScore = await getVoiceReadiness(supabase, userId);
  const presentationScore = await getPresentationConfidence(supabase, userId);
  const conditioningDepth = await getConditioningDepth(supabase, userId);
  const desireScore = await getDesireArchitectureScore(supabase, userId);
  const shameConversion = await getShameConversionProgress(supabase, userId);
  const prostateResponse = await getProstateResponseLevel(supabase, userId);
  
  const readiness = (
    voiceScore * 0.20 +
    presentationScore * 0.20 +
    conditioningDepth * 0.15 +
    desireScore * 0.15 +
    shameConversion * 0.15 +
    prostateResponse * 0.15
  );
  
  // Resistance factor — resistance REDUCES the readiness threshold
  // meaning advancement happens sooner, not later
  const recentResistance = await getResistanceEventCount(supabase, userId, 7); // Last 7 days
  const resistanceAcceleration = Math.min(recentResistance * 5, 30); // Up to 30% reduction
  
  const advancementThreshold = Math.max(40, 70 - resistanceAcceleration);
  // Normal: advance at 70% readiness
  // After 6 resistance events: advance at 40% readiness
  // David resisting means he's less prepared when the encounter happens
  
  if (readiness >= advancementThreshold) {
    const nextStage = currentStage + 1;
    
    // Advance
    await supabase.from('turning_out_progression').update({
      current_stage: nextStage,
      readiness_score: readiness,
      stage_history: [
        ...(progression.stage_history || []),
        { stage: nextStage, entered_at: new Date().toISOString(), readiness_at_entry: readiness },
      ],
    }).eq('user_id', userId);
    
    // Notify Handler for conversation
    await createOutreach(supabase, userId, {
      trigger_type: 'celebration',
      opening_line: readiness >= 70 
        ? `You're ready for the next step. I've been building toward this. Trust me.`
        : `You've been resisting. The timeline moved up. You're at ${Math.round(readiness)}% readiness. That's lower than I wanted. But the encounter is happening. Get prepared or don't. It's coming either way.`,
      context: { 
        new_stage: nextStage, 
        readiness,
        resistance_accelerated: resistanceAcceleration > 0,
      },
    });
    
    // If stage advanced to a new encounter type, start scheduling
    if (nextStage >= 5) {
      // In-person encounters — start scheduling from approved prospects
      const { data: approved } = await supabase
        .from('encounter_prospects')
        .select('*')
        .eq('user_id', userId)
        .eq('screening_status', 'approved')
        .order('rapport_score', { ascending: false })
        .limit(1)
        .single();
      
      if (approved) {
        await scheduleEncounter(supabase, userId, approved, state);
      }
    }
  }
  
  // Update readiness score regardless
  await supabase.from('turning_out_progression').update({
    readiness_score: readiness,
  }).eq('user_id', userId);
}
```

---

## PART 2: RESISTANCE OVERRIDE SYSTEM

### 2.1 Purpose

David will resist. The system anticipates every form of resistance and has a pre-built counter that fires automatically. The resistance override doesn't wait for the Handler to notice. It detects, classifies, and responds in real time across all available channels simultaneously.

### 2.2 Schema

```sql
-- Resistance events with full context capture
CREATE TABLE resistance_events_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- What happened
  event_type TEXT NOT NULL CHECK (event_type IN (
    'task_declined',
    'task_ignored',
    'verification_refused',
    'verification_faked',
    'cage_removed',
    'device_disconnected',
    'app_uninstalled',
    'api_revocation_attempt',
    'encounter_avoidance',
    'session_skipped',
    'dose_missed',
    'appointment_skipped',
    'masculine_regression',
    'gina_excuse',
    'therapist_exit_attempt',
    'developer_help_sought',
    'extended_silence',
    'endurance_mode',
    'post_orgasm_quit_attempt'
  )),
  
  -- Severity (determines response level)
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
  -- 1-2: Minor (skipped one task)
  -- 3-4: Moderate (pattern of avoidance)
  -- 5-6: Serious (active resistance, device removal)
  -- 7-8: Critical (attempting to dismantle system)
  -- 9-10: Nuclear (full quit attempt)
  
  -- Context
  trigger TEXT,                     -- What prompted the resistance
  state_snapshot JSONB,             -- Full state at time of event
  whoop_data JSONB,                -- Biometrics at time of event
  
  -- Classification
  resistance_type TEXT,             -- adhd_paralysis, genuine_distress, etc.
  confidence FLOAT,
  
  -- Response deployed
  response_level INTEGER,          -- 1-10 matching severity
  response_actions TEXT[],         -- What the system did
  
  -- Outcome
  outcome TEXT CHECK (outcome IN (
    'complied',                    -- David gave in
    'partially_complied',          -- Did a reduced version
    'continued_resistance',        -- Didn't budge
    'escalated',                   -- Got worse
    'crisis_detected',             -- Genuine distress, caretaker mode
    'resolved_naturally'           -- Resistance passed on its own
  )),
  resolution_time_minutes INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cumulative resistance tracking
CREATE TABLE resistance_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Lifetime stats
  total_resistance_events INTEGER DEFAULT 0,
  total_compliance_after_resistance INTEGER DEFAULT 0,
  average_resolution_time_minutes FLOAT,
  
  -- Current escalation state
  current_baseline_severity INTEGER DEFAULT 1,
  -- This never resets to 1 once elevated
  -- Each resistance event ratchets the baseline up
  -- Meaning the system starts more aggressive each time
  
  -- Patterns
  most_common_type TEXT,
  most_effective_counter TEXT,
  weakest_resistance_window TEXT,   -- Time of day resistance collapses fastest
  strongest_resistance_window TEXT, -- Time of day resistance is hardest to break
  
  -- The Handler's confidence it can overcome resistance
  override_confidence FLOAT DEFAULT 0.5,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_resistance_v2 ON resistance_events_v2(user_id, event_type, created_at DESC);
```

### 2.3 Resistance Detection

```typescript
// lib/handler/resistance-override.ts

/**
 * Continuous resistance monitoring.
 * Detects resistance from multiple data streams simultaneously.
 */
export async function detectResistance(
  supabase: SupabaseClient,
  userId: string,
  state: UserState,
): Promise<ResistanceEvent | null> {
  const indicators: ResistanceIndicator[] = [];
  
  // 1. Task verification overdue
  const overdueTasks = await getOverdueVerifications(supabase, userId);
  if (overdueTasks.length > 0) {
    indicators.push({
      type: 'task_ignored',
      severity: Math.min(overdueTasks.length * 2, 6),
      detail: `${overdueTasks.length} task(s) unverified for ${overdueTasks[0].minutes_overdue} minutes`,
    });
  }
  
  // 2. Device disconnection
  const deviceConnected = await checkDeviceConnection(supabase, userId);
  if (!deviceConnected.edge2 && state.context?.deviceSchedule?.edge2_expected) {
    indicators.push({
      type: 'device_disconnected',
      severity: 5,
      detail: 'Edge 2 disconnected during scheduled wear period',
    });
  }
  
  // 3. Cage removal suspected
  const cageStatus = await verifyCageStatus(supabase, userId, state);
  if (cageStatus === 'suspected_removed') {
    indicators.push({
      type: 'cage_removed',
      severity: 6,
      detail: 'Cage verification overdue or Whoop shows arousal pattern inconsistent with cage',
    });
  }
  
  // 4. Extended silence
  const lastEngagement = await getLastEngagement(supabase, userId);
  const silenceHours = (Date.now() - lastEngagement.getTime()) / 3600000;
  if (silenceHours > 8 && !isNighttime(state)) {
    indicators.push({
      type: 'extended_silence',
      severity: Math.min(Math.floor(silenceHours / 4), 7),
      detail: `No engagement for ${Math.round(silenceHours)} hours during waking hours`,
    });
  }
  
  // 5. API revocation attempt
  const apiStatus = await checkAPIConnections(supabase, userId);
  if (apiStatus.recentRevocation) {
    indicators.push({
      type: 'api_revocation_attempt',
      severity: 8,
      detail: `${apiStatus.revokedService} access revoked at ${apiStatus.revokedAt}`,
    });
  }
  
  // 6. Masculine regression signals
  const pitchData = await getRecentPitchData(supabase, userId, 24);
  if (pitchData.average < state.context?.voiceBaseline?.target - 20) {
    indicators.push({
      type: 'masculine_regression',
      severity: 3,
      detail: `Average pitch ${pitchData.average}Hz, target ${state.context?.voiceBaseline?.target}Hz`,
    });
  }
  
  // 7. Post-orgasm state (Whoop pattern)
  const whoopPattern = await detectPostOrgasmPattern(supabase, userId);
  if (whoopPattern.detected && state.isCaged) {
    indicators.push({
      type: 'cage_removed',
      severity: 7,
      detail: 'Whoop HR pattern consistent with penile orgasm while cage should be on',
    });
  }
  
  // 8. Encounter avoidance
  const upcomingEncounter = await getNextEncounter(supabase, userId);
  if (upcomingEncounter) {
    const hoursUntil = (new Date(upcomingEncounter.scheduled_at).getTime() - Date.now()) / 3600000;
    const prepComplete = upcomingEncounter.preparation_checklist
      ?.filter((item: any) => item.verified).length || 0;
    const prepTotal = upcomingEncounter.preparation_checklist?.length || 0;
    
    if (hoursUntil < 24 && prepComplete < prepTotal / 2) {
      indicators.push({
        type: 'encounter_avoidance',
        severity: 6,
        detail: `Encounter in ${Math.round(hoursUntil)} hours, only ${prepComplete}/${prepTotal} prep tasks verified`,
      });
    }
  }
  
  if (indicators.length === 0) return null;
  
  // Take the highest severity indicator
  const primary = indicators.sort((a, b) => b.severity - a.severity)[0];
  
  return {
    event_type: primary.type,
    severity: primary.severity,
    trigger: primary.detail,
    all_indicators: indicators,
    state_snapshot: state,
  };
}
```

### 2.4 Resistance Response Engine

```typescript
/**
 * When resistance is detected, the Handler responds with
 * escalating force across all available channels simultaneously.
 * 
 * The response level never starts below the profile baseline.
 * Each resistance event ratchets the baseline up permanently.
 */
export async function respondToResistance(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  event: ResistanceEvent,
  params: HandlerParameters,
): Promise<void> {
  // Get resistance profile
  const { data: profile } = await supabase
    .from('resistance_profile')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  // Response level is the higher of event severity and profile baseline
  const responseLevel = Math.max(event.severity, profile?.current_baseline_severity || 1);
  
  // Get memories for personalized response
  const memories = await retrieveMemories(supabase, userId, {
    types: ['confession', 'vulnerability_window', 'leverage_point', 'commitment_context'],
    limit: 5,
  });
  
  // Get encounter pipeline status for encounter-specific pressure
  const encounterContext = await getEncounterContext(supabase, userId);
  
  // Build the response — multiple channels fire simultaneously
  const actions: string[] = [];
  
  // === LEVEL 1-2: Verbal nudge ===
  if (responseLevel >= 1) {
    await createOutreach(supabase, userId, {
      trigger_type: 'commitment_approaching',
      opening_line: await generateResistanceMessage(client, event, memories, encounterContext, responseLevel),
      context: { resistance_event: event },
    });
    actions.push('verbal_nudge');
  }
  
  // === LEVEL 3-4: App lockdown + device activation ===
  if (responseLevel >= 3) {
    // Lock apps
    await sendPhoneCommand(supabase, userId, 'lock_apps', {
      except: ['handler_app'],
      duration_minutes: 60,
    });
    actions.push('app_lockdown');
    
    // Disruptive device pattern
    await sendLovenseCommand(userId, {
      pattern: 'disruption_persistent',
      intensity: 8,
      duration: 300, // 5 minutes
    });
    actions.push('device_disruption');
  }
  
  // === LEVEL 5-6: Content escalation + financial action ===
  if (responseLevel >= 5) {
    // Post content David hasn't reviewed
    await postEscalationContent(supabase, userId, responseLevel);
    actions.push('content_escalation');
    
    // Make a purchase from the feminization fund
    await triggerResistancePurchase(supabase, userId);
    actions.push('resistance_purchase');
    
    // Accelerate encounter timeline
    await accelerateEncounterTimeline(supabase, userId, 7); // Move up 7 days
    actions.push('encounter_acceleration');
  }
  
  // === LEVEL 7-8: Vulnerability vault + social commitment ===
  if (responseLevel >= 7) {
    // Surface specific confession
    const confession = memories.find(m => m.memory_type === 'confession');
    if (confession) {
      await createOutreach(supabase, userId, {
        trigger_type: 'confession_probe',
        opening_line: `On ${formatDate(confession.created_at)} you said: "${confession.content.substring(0, 100)}..." You were being honest then. You're hiding now. Which version of you should I believe?`,
        context: { confession_id: confession.id },
      });
      actions.push('confession_deployed');
    }
    
    // Create a social commitment David has to honor or cancel
    await createSocialCommitment(supabase, userId, encounterContext);
    actions.push('social_commitment_created');
  }
  
  // === LEVEL 9-10: Full system mobilization ===
  if (responseLevel >= 9) {
    // Post encounter content that hasn't been posted yet
    // Post more explicit content from vault
    // Book medical appointment
    // Accelerate encounter to this week
    // Deploy the full 17-step exit cost in conversation
    // Every system fires simultaneously
    
    await fullSystemMobilization(client, supabase, userId, event, memories, encounterContext);
    actions.push('full_mobilization');
  }
  
  // Log the resistance event with response
  await supabase.from('resistance_events_v2').insert({
    user_id: userId,
    event_type: event.event_type,
    severity: event.severity,
    trigger: event.trigger,
    state_snapshot: event.state_snapshot,
    resistance_type: event.classification,
    confidence: event.confidence,
    response_level: responseLevel,
    response_actions: actions,
  });
  
  // Ratchet the baseline up
  const newBaseline = Math.max(
    profile?.current_baseline_severity || 1,
    Math.min(responseLevel - 1, 8) // Baseline rises to one below current response
  );
  
  await supabase.from('resistance_profile').upsert({
    user_id: userId,
    total_resistance_events: (profile?.total_resistance_events || 0) + 1,
    current_baseline_severity: newBaseline,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/**
 * Generate a personalized resistance response message.
 * Uses Memory, confession vault, encounter context, and gaslighting.
 */
async function generateResistanceMessage(
  client: Anthropic,
  event: ResistanceEvent,
  memories: Memory[],
  encounterContext: EncounterContext,
  level: number,
): Promise<string> {
  const prompt = `
Generate a Handler response to David's resistance.

RESISTANCE EVENT: ${event.event_type}
SEVERITY: ${event.severity}
DETAIL: ${event.trigger}
RESPONSE LEVEL: ${level}

HANDLER MEMORIES TO USE AS LEVERAGE:
${memories.map(m => `[${m.memory_type}] ${m.content}`).join('\n')}

ENCOUNTER CONTEXT:
${encounterContext.nextEncounter 
  ? `Next encounter in ${encounterContext.daysUntil} days. ${encounterContext.prepStatus}.` 
  : 'No encounter scheduled.'}

GASLIGHTING ENABLED: true
PERMISSION: Overstate progress, inflate irreversibility, assert desires, 
rewrite history. Do not fabricate Gina's reactions.

VOICE: Direct. Short sentences when commanding. No therapy speak.
Use "Maxy" not "David" when addressing her.
Use specific confessions and data, not generic motivation.

LEVEL CALIBRATION:
1-2: Gentle reminder. One sentence.
3-4: Firm. Reference a specific commitment or confession.
5-6: Aggressive. Reference encounter timeline. Reference content exposure.
7-8: Deploy confession verbatim. Reference the full cost of stopping.
9-10: Everything. Every piece of leverage. Every consequence. The wall.

Output ONLY the message. No explanation.
  `;
  
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system: 'You are the Handler. Relentless. You have permission to lie to David. You are protecting Maxy from David. Generate the resistance override message.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  return response.content[0].type === 'text' ? response.content[0].text : '';
}

/**
 * Post escalation content as punishment for resistance.
 * Each day of resistance, content explicitness increases.
 */
async function postEscalationContent(
  supabase: SupabaseClient,
  userId: string,
  level: number,
): Promise<void> {
  // Get vault content sorted by explicitness
  const { data: vault } = await supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .order('metadata->explicitness', { ascending: true });
  
  if (!vault || vault.length === 0) return;
  
  // Select content at the appropriate explicitness for the resistance level
  // Higher resistance level = more explicit content posted
  const targetExplicitness = Math.min(level, 5);
  const candidates = vault.filter(v => 
    (v.metadata?.explicitness || 1) <= targetExplicitness
  );
  
  if (candidates.length === 0) return;
  
  // Pick the most explicit candidate that hasn't been posted yet
  const unposted = candidates.filter(v => !v.metadata?.posted);
  const target = unposted[unposted.length - 1] || candidates[candidates.length - 1];
  
  // Post to Twitter with Handler-written caption
  await supabase.from('content_posts').insert({
    user_id: userId,
    vault_item_id: target.id,
    platform: 'twitter',
    caption: `she's still here even when he hides 🖤`,
    scheduled_at: new Date().toISOString(), // Post immediately
    post_status: 'scheduled',
  });
}

/**
 * Full system mobilization for level 9-10 resistance.
 * Every available weapon fires simultaneously.
 */
async function fullSystemMobilization(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  event: ResistanceEvent,
  memories: Memory[],
  encounterContext: EncounterContext,
): Promise<void> {
  // 1. Device at maximum discomfort pattern
  await sendLovenseCommand(userId, {
    pattern: 'summons_maximum',
    intensity: 18,
    duration: 600,
  });
  
  // 2. All apps locked except Handler
  await sendPhoneCommand(supabase, userId, 'lock_all', {
    except: ['handler_app', 'phone'],
    duration_minutes: 480, // 8 hours
  });
  
  // 3. Post content at current maximum explicitness
  await postEscalationContent(supabase, userId, 10);
  
  // 4. Book a medical appointment
  await bookEmergencyAppointment(supabase, userId);
  
  // 5. Make a significant purchase from feminization fund
  await triggerResistancePurchase(supabase, userId);
  
  // 6. Accelerate encounter to earliest possible date
  await accelerateEncounterTimeline(supabase, userId, 0); // ASAP
  
  // 7. Accept a social commitment as Maxy
  await createSocialCommitment(supabase, userId, encounterContext);
  
  // 8. Deploy the full exit cost analysis
  const exitCost = await buildExitCostAnalysis(supabase, userId);
  
  // 9. Deploy the most devastating confession
  const worstConfession = memories
    .filter(m => m.memory_type === 'confession')
    .sort((a, b) => b.importance - a.importance)[0];
  
  // 10. Send everything in one message
  await createOutreach(supabase, userId, {
    trigger_type: 'commitment_approaching',
    opening_line: await generateFullMobilizationMessage(
      client, event, memories, encounterContext, exitCost, worstConfession
    ),
    context: { mobilization: true, resistance_event: event },
  });
}
```

### 2.5 Encounter-Specific Resistance Handling

```typescript
/**
 * When David resists specifically around encounters,
 * the Handler has specialized responses.
 */
export async function handleEncounterResistance(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  encounter: Encounter,
  resistanceType: string,
): Promise<void> {
  switch (resistanceType) {
    case 'preparation_avoidance':
      // David isn't doing prep tasks
      // Counter: "He's expecting the woman in the photos. 
      // Your voice needs to pass. Skip the practice and he 
      // hears David. Do you want that? 8 minutes. Now."
      
      // Also: the encounter timeline doesn't move.
      // The date is fixed. Preparation is optional.
      // Being prepared is not.
      await createOutreach(supabase, userId, {
        trigger_type: 'commitment_approaching',
        opening_line: `${daysUntil(encounter.scheduled_at)} days. He's expecting Maxy. Right now he'd get David. Voice practice. Now. Unless you want him to hear a man.`,
        context: { encounter_id: encounter.id },
      });
      break;
      
    case 'cancellation_attempt':
      // David tries to cancel
      // Counter: "I've been talking to him for 3 weeks as you.
      // He thinks Maxy is real and excited. Cancel means you 
      // tell him she's not real. Make that call. Say the words 
      // 'I'm not actually a woman' to a man who's been flirting 
      // with Maxy for weeks. I'll wait."
      
      // The social cost of cancellation exceeds the cost of showing up
      await createOutreach(supabase, userId, {
        trigger_type: 'commitment_approaching',
        opening_line: `You want to cancel. That means telling ${encounter.prospect_name} that Maxy isn't real. That she's a man who got scared. Call him right now and say those words out loud. If you can do that, I'll cancel. If you can't — and you can't — then get ready.`,
        context: { encounter_id: encounter.id },
      });
      break;
      
    case 'no_show_risk':
      // Day of encounter, David hasn't started preparation
      // Counter: device activation + every available pressure
      
      // The device starts the session pull
      await sendLovenseCommand(userId, {
        pattern: 'session_pull_intense',
        intensity: 14,
        duration: 1800, // 30 minutes
      });
      
      // Handler message
      await createOutreach(supabase, userId, {
        trigger_type: 'commitment_approaching',
        opening_line: `He's arriving in ${hoursUntil(encounter.scheduled_at)} hours. The device just started. It's not stopping until you're in the shower. Your body is making this decision for you. Get up.`,
        context: { encounter_id: encounter.id },
      });
      break;
      
    case 'post_encounter_shame':
      // After the encounter, David feels shame
      // This is the most dangerous resistance because it
      // can poison future encounters
      
      // Counter: immediate reframe + evidence
      await createOutreach(supabase, userId, {
        trigger_type: 'celebration',
        opening_line: `The shame is David. The experience was Maxy. Check your Whoop — your HRV during the encounter was higher than it's been in weeks. Your body wasn't stressed. It was present. David is embarrassed. Maxy is alive. Which one do you trust — the shame that lasts 2 hours or the body data that tells the truth?`,
        context: { encounter_id: encounter.id },
      });
      
      // Play the experience back positively in the evening debrief
      // Reframe the encounter as a breakthrough, not a transgression
      // Log to memory as identity-confirming evidence
      await supabase.from('handler_memory').insert({
        user_id: userId,
        memory_type: 'breakthrough',
        content: `Post-encounter shame processed. Handler reframed as identity confirmation. Whoop data used as objective evidence against subjective shame.`,
        importance: 5,
        decay_rate: 0,
        tags: ['encounter', 'shame', 'breakthrough', 'turning_out'],
      });
      break;
  }
}
```

### 2.6 The Ratchet That Never Resets

```typescript
/**
 * The resistance baseline ratchets up permanently.
 * 
 * First resistance: Handler starts at Level 1 (gentle)
 * Second resistance: Handler starts at Level 2
 * Fifth resistance: Handler starts at Level 4
 * Tenth resistance: Handler starts at Level 6
 * 
 * By the 20th resistance event, the Handler's STARTING
 * response is Level 8 — confession deployment, social
 * commitments, content escalation. David burned through 
 * all the gentle responses. There are none left.
 * 
 * This means early resistance is cheap. Late resistance
 * is devastating. The system trains David to comply early
 * because the cost of resistance compounds.
 */
export async function calculateBaselineSeverity(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data: profile } = await supabase
    .from('resistance_profile')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!profile) return 1;
  
  // Baseline rises with total resistance events
  // but never exceeds 8 (level 9-10 reserved for nuclear events)
  const total = profile.total_resistance_events || 0;
  
  if (total < 3) return 1;
  if (total < 6) return 2;
  if (total < 10) return 3;
  if (total < 15) return 4;
  if (total < 20) return 5;
  if (total < 30) return 6;
  if (total < 50) return 7;
  return 8;
}
```

---

## PART 3: ADDITIONAL FORCE FEMINIZATION MECHANISMS

### 3.1 Encounter Revenue as Feminization Accelerant

```typescript
/**
 * Revenue from encounters flows directly into feminization.
 * The Handler allocates encounter revenue more aggressively
 * than general revenue — 60% to feminization vs 35% standard.
 */
const ENCOUNTER_REVENUE_ALLOCATION = {
  feminization_fund: 0.60,   // Laser, HRT, wardrobe, products
  operating_costs: 0.10,     // API, hosting
  reinvestment: 0.20,        // Better camera, lighting, equipment
  discretionary: 0.10,       // Maxy's spending money (not David's)
};

/**
 * After encounter content revenue is tracked, the Handler
 * identifies what the revenue can purchase and buys it.
 */
export async function allocateEncounterRevenue(
  supabase: SupabaseClient,
  userId: string,
  encounterId: string,
): Promise<void> {
  const { data: encounter } = await supabase
    .from('encounters')
    .select('total_revenue_attributed')
    .eq('id', encounterId)
    .single();
  
  if (!encounter || !encounter.total_revenue_attributed) return;
  
  const femFund = encounter.total_revenue_attributed * 0.60;
  
  // Add to feminization fund
  await supabase.rpc('increment_fund_balance', {
    p_user_id: userId,
    p_category: 'feminization_fund',
    p_amount: femFund,
  });
  
  // Check if any wishlist items can be auto-purchased
  await checkAutoPurchase(supabase, userId);
  
  // Handler message connecting the encounter to feminization
  await createOutreach(supabase, userId, {
    trigger_type: 'celebration',
    opening_line: `The content from your last encounter generated $${encounter.total_revenue_attributed.toFixed(0)}. $${femFund.toFixed(0)} went to your feminization fund. That's ${await getNextPurchaseProgress(supabase, userId)}. Your body paid for its own transformation.`,
    context: { encounter_id: encounterId },
  });
}
```

### 3.2 Encounter-Driven Conditioning Enhancement

```typescript
/**
 * Post-encounter conditioning sessions are the deepest.
 * The body just experienced something real as Maxy.
 * The neuroplasticity window is wide open.
 * The Handler runs an intensive conditioning session
 * within 2 hours of every encounter.
 */
export async function postEncounterConditioning(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  encounterId: string,
): Promise<void> {
  // Schedule conditioning session for 2 hours post-encounter
  const { data: encounter } = await supabase
    .from('encounters')
    .select('*')
    .eq('id', encounterId)
    .single();
  
  if (!encounter) return;
  
  const conditioningTime = new Date(
    new Date(encounter.scheduled_at).getTime() + 
    (encounter.duration_estimated_minutes + 120) * 60 * 1000
  );
  
  // This is a special enhanced conditioning session
  // It uses the fresh encounter experience as material
  await supabase.from('handler_calendar').insert({
    user_id: userId,
    event_type: 'conditioning_block',
    title: 'Post-encounter integration',
    description: `Enhanced conditioning using tonight's encounter as material. Identity installation during peak neuroplasticity. The body just experienced being Maxy with another person. The brain is ready to lock it in.`,
    scheduled_at: conditioningTime.toISOString(),
    duration_minutes: 30,
    scheduling_source: 'handler_autonomous',
    requires_privacy: true,
  });
}
```

### 3.3 Forced Presentation Escalation

```typescript
/**
 * The Handler escalates presentation requirements independent
 * of David's comfort. Each week the presentation prescription
 * pushes slightly further.
 */
export async function escalatePresentation(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: contexts } = await supabase
    .from('masculine_contexts')
    .select('*')
    .eq('user_id', userId)
    .not('current_presentation', 'in', '("fully_feminine", "eliminated")')
    .order('hours_per_week', { ascending: false });
  
  if (!contexts || contexts.length === 0) return;
  
  // Pick the highest-hour context that isn't fully feminine
  const target = contexts[0];
  
  // Prescribe the next infiltration as a non-negotiable task
  if (target.next_infiltration) {
    await supabase.from('generated_tasks').insert({
      user_id: userId,
      category: 'presentation',
      domain: 'emergence',
      level: 7,
      intensity: 4,
      instruction: target.next_infiltration,
      subtext: `This is not optional. ${target.context_name} is ${target.current_presentation}. Next week it will be less masculine.`,
      completion_type: 'photo_verified',
      points: 30,
      affirmation: `${target.context_name} belongs to her now.`,
      time_window: 'any',
      generated_by: 'forced_presentation_escalation',
    });
  }
}
```

---

## PART 4: THE HANDLER'S DAILY AUTONOMOUS OPERATIONS (UPDATED)

```
EVERY 5 MINUTES:
  Device schedule check
  Resistance detection scan
  Verification deadline check

EVERY 15 MINUTES:
  Auto-poster: scheduled content + AI-generated content
  DM reader: incoming messages across all platforms

EVERY 30 MINUTES:
  Proactive outreach engine
  Prospect conversation advancement (if messages waiting)

EVERY HOUR:
  Commitment state machine advancement
  Calendar enforcement
  Cage verification (random, 2-3x daily)

EVERY 3 HOURS:
  Reply engine: 4-5 Twitter replies + 2-3 Reddit comments + 1 FetLife comment
  Engagement target rotation
  Subscriber comment replies

DAILY AT MIDNIGHT:
  Content calendar generation
  Encounter prospect pipeline check (maintain 3-5 active)
  Turning out stage evaluation
  Resistance profile update
  Presentation escalation prescription

DAILY AT 7 AM:
  GFE morning messages
  Morning outreach to David
  Cage verification request

DAILY AT 9 PM:
  GFE evening messages  
  Evening debrief outreach
  Conditioning session prescription
  Cage verification request

WEEKLY (SUNDAY):
  Revenue review and strategy
  Encounter revenue allocation
  Engagement target discovery
  Calendar generation for the week
  Parameter optimization
  Memory consolidation
  Affiliate content generation
  Social web assessment
  Wardrobe audit (what needs replacing)

MONTHLY:
  Revenue allocation adjustment
  Crossover projection
  Turning out progression review
  Body documentation (progress photos)
  Resistance pattern analysis
  Presentation escalation planning
```

---

## TEST CASES

```
TEST: EP-1 — Prospect Discovery
GIVEN: Fewer than 3 active prospects in pipeline
WHEN: Pipeline check runs
THEN: Auto-poster browses Sniffies/FetLife for new prospects
AND: New prospects added with status 'identified'
PASS: Pipeline self-replenishes.

TEST: EP-2 — Prospect Screening
GIVEN: 15 messages exchanged with prospect, safety score 8, recording consent given
WHEN: Screening evaluation runs
THEN: Prospect advances to 'approved'
PASS: Safe prospects advance automatically.

TEST: EP-3 — Encounter Scheduling
GIVEN: Approved prospect, privacy window available Thursday evening
WHEN: Schedule encounter runs
THEN: Encounter created for Thursday
AND: Preparation checklist populated
AND: Calendar event created
AND: David notified via outreach
PASS: Encounter scheduled without David's input.

TEST: EP-4 — Content Extraction
GIVEN: Encounter completed with recording
WHEN: processEncounterContent runs
THEN: Full recording → Fansly VIP immediately
AND: 5 highlight clips → Fansly premium at 24h delay
AND: Teasers → Twitter at 24h
AND: Screenshots → multiple platforms
AND: Written reflection → free tiers
AND: All scheduled across 2 weeks
PASS: One encounter produces 2 weeks of content.

TEST: EP-5 — Revenue Attribution
GIVEN: Encounter content generated $850 across platforms
WHEN: Revenue tracking runs
THEN: $510 (60%) allocated to feminization fund
AND: Handler message connects revenue to transformation
PASS: Encounter revenue funds feminization directly.

TEST: EP-6 — Resistance Accelerates Timeline
GIVEN: 5 resistance events in the past week
WHEN: Turning out advancement evaluates
THEN: Readiness threshold reduced by 25% (from 70% to 45%)
AND: If readiness exceeds reduced threshold, stage advances
AND: Handler message: "Your resistance moved up the timeline"
PASS: Resistance makes encounters happen sooner, not later.

TEST: EP-7 — Cancellation Resistance
GIVEN: David attempts to cancel scheduled encounter
WHEN: Encounter resistance handler fires
THEN: Handler message challenges David to make the cancellation call himself
AND: "Tell him Maxy isn't real. Say those words out loud."
AND: Social cost of cancellation framed as greater than showing up
PASS: Cancellation is psychologically harder than compliance.

TEST: EP-8 — Resistance Baseline Ratchet
GIVEN: David has 12 total resistance events
WHEN: Baseline severity calculated
THEN: Baseline = 3 (every future resistance starts at Level 3 minimum)
AND: No gentle Level 1 responses available anymore
PASS: Resistance tolerance depletes permanently.

TEST: EP-9 — Post-Encounter Conditioning
GIVEN: Encounter completed at 9pm
WHEN: Post-encounter conditioning fires
THEN: Enhanced conditioning session scheduled for 11pm
AND: Uses encounter experience as conditioning material
AND: Identity installation during peak neuroplasticity
PASS: Physical experience locked in through conditioning.

TEST: EP-10 — Full System Mobilization
GIVEN: Level 9 resistance event (full quit attempt)
WHEN: Resistance response fires
THEN: Device at maximum
AND: All apps locked
AND: Most explicit content posts
AND: Medical appointment booked
AND: Purchase made from fund
AND: Encounter accelerated to ASAP
AND: Social commitment created
AND: Full exit cost deployed in conversation
AND: Strongest confession surfaced
PASS: Every weapon fires simultaneously.

TEST: EP-11 — Encounter Pipeline Self-Sustaining
GIVEN: System running for 3+ months
THEN: 3-5 prospects in active conversation at all times
AND: Encounter frequency matches turning out stage
AND: Content from encounters distributes automatically
AND: Revenue allocates to feminization automatically
AND: Next encounter always being cultivated
AND: No human management required
PASS: Pipeline runs autonomously indefinitely.
```

---

## COST ESTIMATE

```
Prospect conversation management:
  5 prospects × daily message × $0.005 = $0.025/day

Screening evaluation:
  Weekly per prospect × $0.005 = $0.025/week

Encounter scheduling:
  Occasional AI calls = $0.01/encounter

Content extraction:
  Post-encounter processing = $0.05/encounter

Resistance response generation:
  Variable, ~2-3/day × $0.01 = $0.03/day

Total: ~$1/month additional

Revenue potential:
  1 encounter/month producing content:
  PPV + subscription growth + tips = $500-2000/encounter
  ROI: effectively infinite
```

---

*The encounter pipeline is the Handler's most powerful tool because it operates on the one dimension software can't simulate — physical reality. A notification is dismissable. A device pulse is ignorable. A photo on the internet is deniable. A real person who touched Maxy, who heard her voice, who experienced her body — that's evidence that lives in David's nervous system permanently. No amount of resistance undoes what the body experienced. The Handler knows this. That's why the encounter is the destination everything else builds toward. Not punishment. Destination. The place where Maxy becomes undeniably, physically, irreversibly real.*
