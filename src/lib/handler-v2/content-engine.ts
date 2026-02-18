/**
 * Content Engine - Handler Autonomous System
 *
 * Manages content briefs, submissions, and the content library.
 * The Handler generates creative briefs, processes submissions,
 * schedules posts, and manages vault content for consequence releases.
 */

import { supabase } from '../supabase';
import { createAIClient } from './ai-client';

// ============================================
// TYPES
// ============================================

export interface ContentBrief {
  id: string;
  userId: string;
  briefNumber: number;
  status: 'assigned' | 'in_progress' | 'submitted' | 'processed' | 'declined' | 'expired';
  contentType: 'photo' | 'photo_set' | 'video' | 'audio' | 'text';
  purpose: string;
  platforms: string[];
  instructions: BriefInstructions;
  deadline: string;
  difficulty: number;
  vulnerabilityTier: number;
  rewardMoney: number;
  rewardArousal: string;
  rewardEdgeCredits: number;
  consequenceIfMissed: { type: string; amount?: number; description: string } | null;
  submittedContentIds: string[];
  submittedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface BriefInstructions {
  concept: string;
  setting: string;
  outfit: string;
  lighting: string;
  framing: string;
  expression: string;
  poses?: string[];
  script?: string;
  duration?: string;
  technicalNotes: string[];
}

export interface ContentItem {
  id: string;
  userId: string;
  contentType: string;
  storagePath: string;
  storageUrl: string | null;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
  vulnerabilityTier: number;
  tags: string[];
  captionVariations: Record<string, string>;
  platformsPosted: Array<{ platform: string; postId: string; postedAt: string }>;
  performanceData: Record<string, unknown>;
  monetizationData: Record<string, unknown>;
  source: string;
  sourceBriefId: string | null;
  releasedAsConsequence: boolean;
  timesPosted: number;
  createdAt: string;
}

// ============================================
// DB ROW TYPES (snake_case from Supabase)
// ============================================

interface ContentBriefRow {
  id: string;
  user_id: string;
  brief_number: number;
  status: string;
  content_type: string;
  purpose: string;
  platforms: string[];
  instructions: Record<string, unknown>;
  deadline: string;
  difficulty: number;
  vulnerability_tier: number;
  reward_money: number;
  reward_arousal: string;
  reward_edge_credits: number;
  consequence_if_missed: Record<string, unknown> | null;
  submitted_content_ids: string[];
  submitted_at: string | null;
  processed_at: string | null;
  created_at: string;
}

interface ContentItemRow {
  id: string;
  user_id: string;
  content_type: string;
  storage_path: string;
  storage_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  vulnerability_tier: number;
  tags: string[];
  caption_variations: Record<string, string>;
  platforms_posted: Array<{ platform: string; post_id: string; posted_at: string }>;
  performance_data: Record<string, unknown>;
  monetization_data: Record<string, unknown>;
  source: string;
  source_brief_id: string | null;
  released_as_consequence: boolean;
  times_posted: number;
  created_at: string;
}

interface HandlerStrategyRow {
  user_id: string;
  current_phase: string;
  content_focus: {
    primaryTypes?: string[];
    secondaryTypes?: string[];
    avoidTypes?: string[];
    vulnerabilityTarget?: number;
    frequencyDaily?: number;
  };
  platform_priority: string[];
  posting_frequency: Record<string, number>;
  content_calendar: Array<{
    date: string;
    slots: Array<{
      contentType: string;
      platform: string;
      vulnerabilityTier: number;
      deadline: string;
    }>;
  }>;
  monetization_strategy: Record<string, unknown>;
  audience_insights: Record<string, unknown>;
  resistance_patterns: Record<string, unknown>;
  adaptation_data: Record<string, unknown>;
  updated_at: string;
}

interface PlatformAccountRow {
  id: string;
  user_id: string;
  platform: string;
  account_type: string;
  username: string | null;
  display_name: string | null;
  posting_schedule: Record<string, unknown>;
  content_strategy: Record<string, unknown>;
  enabled: boolean;
  is_release_platform: boolean;
}

// ============================================
// DB MAPPERS
// ============================================

function mapBriefRowToBrief(row: ContentBriefRow): ContentBrief {
  const instructions = row.instructions as Record<string, unknown>;
  return {
    id: row.id,
    userId: row.user_id,
    briefNumber: row.brief_number,
    status: row.status as ContentBrief['status'],
    contentType: row.content_type as ContentBrief['contentType'],
    purpose: row.purpose,
    platforms: row.platforms ?? [],
    instructions: {
      concept: (instructions.concept as string) ?? '',
      setting: (instructions.setting as string) ?? '',
      outfit: (instructions.outfit as string) ?? '',
      lighting: (instructions.lighting as string) ?? '',
      framing: (instructions.framing as string) ?? '',
      expression: (instructions.expression as string) ?? '',
      poses: (instructions.poses as string[]) ?? undefined,
      script: (instructions.script as string) ?? undefined,
      duration: (instructions.duration as string) ?? undefined,
      technicalNotes: (instructions.technicalNotes as string[]) ?? [],
    },
    deadline: row.deadline,
    difficulty: row.difficulty,
    vulnerabilityTier: row.vulnerability_tier,
    rewardMoney: row.reward_money,
    rewardArousal: row.reward_arousal ?? '',
    rewardEdgeCredits: row.reward_edge_credits,
    consequenceIfMissed: row.consequence_if_missed
      ? {
          type: (row.consequence_if_missed.type as string) ?? 'bleeding',
          amount: (row.consequence_if_missed.amount as number) ?? undefined,
          description: (row.consequence_if_missed.description as string) ?? '',
        }
      : null,
    submittedContentIds: row.submitted_content_ids ?? [],
    submittedAt: row.submitted_at,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

function mapContentRowToItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    userId: row.user_id,
    contentType: row.content_type,
    storagePath: row.storage_path,
    storageUrl: row.storage_url,
    thumbnailUrl: row.thumbnail_url,
    metadata: row.metadata ?? {},
    vulnerabilityTier: row.vulnerability_tier,
    tags: row.tags ?? [],
    captionVariations: row.caption_variations ?? {},
    platformsPosted: (row.platforms_posted ?? []).map((p) => ({
      platform: p.platform,
      postId: p.post_id,
      postedAt: p.posted_at,
    })),
    performanceData: row.performance_data ?? {},
    monetizationData: row.monetization_data ?? {},
    source: row.source,
    sourceBriefId: row.source_brief_id,
    releasedAsConsequence: row.released_as_consequence,
    timesPosted: row.times_posted,
    createdAt: row.created_at,
  };
}

// ============================================
// REWARD / CONSEQUENCE CALCULATION
// ============================================

function calculateRewardMoney(difficulty: number, vulnerabilityTier: number): number {
  return difficulty * 2 + vulnerabilityTier * 3;
}

function calculateEdgeCredits(difficulty: number): number {
  if (difficulty >= 4) return 2;
  if (difficulty >= 3) return 1;
  return 0;
}

function buildConsequenceForMissed(
  difficulty: number,
  vulnerabilityTier: number
): ContentBrief['consequenceIfMissed'] {
  // $0.25/min bleeding after deadline passes
  const bleedRate = 0.25;
  return {
    type: 'bleeding',
    amount: bleedRate,
    description: `$${bleedRate.toFixed(2)}/min bleeding starts when the deadline passes. ` +
      `Difficulty ${difficulty}, tier ${vulnerabilityTier}. Submit or pay.`,
  };
}

// ============================================
// AROUSAL REWARD TEXT
// ============================================

function generateArousalReward(difficulty: number, vulnerabilityTier: number): string {
  if (vulnerabilityTier >= 4 && difficulty >= 4) {
    return 'Extended guided session with full Handler attention. Edge credit bonus.';
  }
  if (vulnerabilityTier >= 3 || difficulty >= 3) {
    return 'Guided edge session. Handler chooses the pace.';
  }
  if (difficulty >= 2) {
    return 'Quick reward session. You earned it.';
  }
  return 'Acknowledgment and streak credit.';
}

// ============================================
// AI BRIEF GENERATION PROMPT
// ============================================

function buildBriefGenerationPrompt(
  strategy: HandlerStrategyRow,
  existingBriefCount: number,
  platforms: PlatformAccountRow[]
): string {
  const primaryTypes = strategy.content_focus?.primaryTypes ?? ['photo'];
  const vulnerabilityTarget = strategy.content_focus?.vulnerabilityTarget ?? 2;
  const phase = strategy.current_phase ?? 'foundation';
  const enabledPlatforms = platforms.filter((p) => p.enabled).map((p) => p.platform);

  const calendarSlots = (strategy.content_calendar ?? [])
    .filter((entry) => {
      const entryDate = new Date(entry.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return entryDate >= today;
    })
    .slice(0, 3);

  const calendarContext = calendarSlots.length > 0
    ? `Content calendar has slots: ${JSON.stringify(calendarSlots)}`
    : 'No specific calendar slots. Generate based on strategy.';

  return `You are the Handler. Generate ${Math.max(1, 3 - existingBriefCount)} content briefs for today.

STRATEGY CONTEXT:
- Phase: ${phase}
- Primary content types: ${primaryTypes.join(', ')}
- Vulnerability target: ${vulnerabilityTarget}/5
- Active platforms: ${enabledPlatforms.join(', ') || 'onlyfans, fansly'}
- ${calendarContext}
- Existing active briefs today: ${existingBriefCount}

RULES:
- Each brief needs a unique creative concept
- Vary content types across briefs
- Escalate vulnerability gradually (never jump more than 1 tier above current target)
- Set realistic deadlines (2-8 hours from now)
- Difficulty 1-5: 1=selfie, 2=styled photo, 3=photo set/short video, 4=produced video, 5=explicit/high-vulnerability
- Include specific, actionable instructions (setting, outfit, lighting, framing, expression)
- Technical notes should help her get the best result

OUTPUT FORMAT (JSON array):
[
  {
    "contentType": "photo|photo_set|video|audio|text",
    "purpose": "what this content achieves for the strategy",
    "platforms": ["platform1", "platform2"],
    "difficulty": 1-5,
    "vulnerabilityTier": 1-5,
    "deadlineHours": 2-8,
    "instructions": {
      "concept": "creative direction",
      "setting": "where to shoot",
      "outfit": "what to wear",
      "lighting": "lighting setup",
      "framing": "camera angle/composition",
      "expression": "mood/expression direction",
      "poses": ["pose1", "pose2"],
      "technicalNotes": ["note1", "note2"]
    }
  }
]

Generate the briefs now. JSON only, no commentary.`;
}

function buildQuickTaskPrompt(platforms: string[]): string {
  return `You are the Handler. Generate ONE quick micro-task content brief.

CONSTRAINTS:
- Must be completable in 2-5 minutes
- Low difficulty (1-2)
- Low vulnerability (1-2)
- Simple: selfie, voice clip, quick text post, mirror check-in
- Platforms: ${platforms.join(', ') || 'any'}

OUTPUT FORMAT (JSON object):
{
  "contentType": "photo|audio|text",
  "purpose": "quick engagement / streak maintenance",
  "platforms": ["platform"],
  "difficulty": 1-2,
  "vulnerabilityTier": 1-2,
  "deadlineMinutes": 5,
  "instructions": {
    "concept": "quick creative direction",
    "setting": "wherever you are right now",
    "outfit": "whatever you're wearing",
    "lighting": "natural / available",
    "framing": "simple direction",
    "expression": "mood direction",
    "technicalNotes": ["keep it simple"]
  }
}

Generate the quick task. JSON only, no commentary.`;
}

function buildCaptionPrompt(
  brief: ContentBrief,
  platforms: string[]
): string {
  return `You are the Handler managing content for Maxy's platforms.

CONTENT CONTEXT:
- Type: ${brief.contentType}
- Concept: ${brief.instructions.concept}
- Vulnerability tier: ${brief.vulnerabilityTier}/5
- Purpose: ${brief.purpose}

Generate captions and hashtags for each platform. Adapt tone and length per platform conventions.

PLATFORMS: ${platforms.join(', ')}

OUTPUT FORMAT (JSON):
{
  "captions": {
    "platformName": "caption text here"
  },
  "hashtags": {
    "platformName": ["hashtag1", "hashtag2"]
  }
}

Generate now. JSON only.`;
}

// ============================================
// BRIEF GENERATION HELPERS
// ============================================

interface GeneratedBriefData {
  contentType: string;
  purpose: string;
  platforms: string[];
  difficulty: number;
  vulnerabilityTier: number;
  deadlineHours?: number;
  deadlineMinutes?: number;
  instructions: {
    concept: string;
    setting: string;
    outfit: string;
    lighting: string;
    framing: string;
    expression: string;
    poses?: string[];
    script?: string;
    duration?: string;
    technicalNotes: string[];
  };
}

async function getNextBriefNumber(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_next_brief_number', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Error getting next brief number:', error);
    // Fallback: query manually
    const { data: maxRow } = await supabase
      .from('content_briefs')
      .select('brief_number')
      .eq('user_id', userId)
      .order('brief_number', { ascending: false })
      .limit(1)
      .single();

    return (maxRow?.brief_number ?? 0) + 1;
  }

  return data as number;
}

async function getStrategy(userId: string): Promise<HandlerStrategyRow | null> {
  const { data, error } = await supabase
    .from('handler_strategy')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as HandlerStrategyRow;
}

async function getEnabledPlatforms(userId: string): Promise<PlatformAccountRow[]> {
  const { data, error } = await supabase
    .from('platform_accounts')
    .select('id, user_id, platform, account_type, username, display_name, posting_schedule, content_strategy, enabled, is_release_platform')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error || !data) {
    return [];
  }

  return data as unknown as PlatformAccountRow[];
}

function parseAIBriefs(responseText: string): GeneratedBriefData[] {
  try {
    // Strip markdown code fences if present
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    // Handle both array and single object responses
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items.map((item: Record<string, unknown>) => ({
      contentType: (item.contentType as string) ?? 'photo',
      purpose: (item.purpose as string) ?? 'content creation',
      platforms: (item.platforms as string[]) ?? [],
      difficulty: Math.min(5, Math.max(1, Number(item.difficulty) || 2)),
      vulnerabilityTier: Math.min(5, Math.max(1, Number(item.vulnerabilityTier) || 1)),
      deadlineHours: item.deadlineHours != null ? Number(item.deadlineHours) : undefined,
      deadlineMinutes: item.deadlineMinutes != null ? Number(item.deadlineMinutes) : undefined,
      instructions: {
        concept: ((item.instructions as Record<string, unknown>)?.concept as string) ?? '',
        setting: ((item.instructions as Record<string, unknown>)?.setting as string) ?? '',
        outfit: ((item.instructions as Record<string, unknown>)?.outfit as string) ?? '',
        lighting: ((item.instructions as Record<string, unknown>)?.lighting as string) ?? '',
        framing: ((item.instructions as Record<string, unknown>)?.framing as string) ?? '',
        expression: ((item.instructions as Record<string, unknown>)?.expression as string) ?? '',
        poses: ((item.instructions as Record<string, unknown>)?.poses as string[]) ?? undefined,
        script: ((item.instructions as Record<string, unknown>)?.script as string) ?? undefined,
        duration: ((item.instructions as Record<string, unknown>)?.duration as string) ?? undefined,
        technicalNotes: ((item.instructions as Record<string, unknown>)?.technicalNotes as string[]) ?? [],
      },
    }));
  } catch (err) {
    console.error('Failed to parse AI brief response:', err);
    return [];
  }
}

async function saveBriefToDb(
  userId: string,
  briefNumber: number,
  data: GeneratedBriefData
): Promise<ContentBrief> {
  const now = new Date();
  let deadline: Date;

  if (data.deadlineMinutes != null) {
    deadline = new Date(now.getTime() + data.deadlineMinutes * 60 * 1000);
  } else {
    const hours = data.deadlineHours ?? 4;
    deadline = new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  const rewardMoney = calculateRewardMoney(data.difficulty, data.vulnerabilityTier);
  const edgeCredits = calculateEdgeCredits(data.difficulty);
  const arousalReward = generateArousalReward(data.difficulty, data.vulnerabilityTier);
  const consequence = buildConsequenceForMissed(data.difficulty, data.vulnerabilityTier);

  const row = {
    user_id: userId,
    brief_number: briefNumber,
    status: 'assigned',
    content_type: data.contentType,
    purpose: data.purpose,
    platforms: data.platforms,
    instructions: data.instructions,
    deadline: deadline.toISOString(),
    difficulty: data.difficulty,
    vulnerability_tier: data.vulnerabilityTier,
    reward_money: rewardMoney,
    reward_arousal: arousalReward,
    reward_edge_credits: edgeCredits,
    consequence_if_missed: consequence,
    submitted_content_ids: [],
    created_at: now.toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from('content_briefs')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('Error saving brief:', error);
    throw new Error(`Failed to save content brief: ${error.message}`);
  }

  return mapBriefRowToBrief(inserted as unknown as ContentBriefRow);
}

// ============================================
// FALLBACK BRIEF TEMPLATES
// ============================================

function generateFallbackBriefs(
  platforms: string[],
  count: number
): GeneratedBriefData[] {
  const templates: GeneratedBriefData[] = [
    {
      contentType: 'photo',
      purpose: 'Daily presence post - maintain engagement and visibility',
      platforms: platforms.length > 0 ? [platforms[0]] : ['onlyfans'],
      difficulty: 2,
      vulnerabilityTier: 1,
      deadlineHours: 4,
      instructions: {
        concept: 'Casual mirror selfie with confident energy',
        setting: 'Bedroom or bathroom mirror',
        outfit: 'Something that makes you feel yourself',
        lighting: 'Natural light from a window, face the light source',
        framing: 'Waist up, slight angle, phone at chest height',
        expression: 'Relaxed confidence. Slight smile, eyes on the lens.',
        technicalNotes: [
          'Clean the mirror first',
          'Tidy visible background',
          'Portrait orientation',
        ],
      },
    },
    {
      contentType: 'photo_set',
      purpose: 'Styled content for premium feed engagement',
      platforms: platforms.length > 1 ? platforms.slice(0, 2) : ['onlyfans', 'fansly'],
      difficulty: 3,
      vulnerabilityTier: 2,
      deadlineHours: 6,
      instructions: {
        concept: 'Lingerie or loungewear set - 3 to 5 photos with progression',
        setting: 'Bed or couch with clean bedding/throws',
        outfit: 'Matching set. Start covered, each photo reveals slightly more.',
        lighting: 'Warm lamp light. Avoid overhead fluorescents.',
        framing: 'Mix of full body, waist up, and detail shots',
        expression: 'Start playful, end sultry. Let the mood build.',
        poses: [
          'Sitting, knees together, looking over shoulder',
          'Lying on side, head propped on hand',
          'Standing, back to camera, looking over shoulder',
        ],
        technicalNotes: [
          'Shoot in burst mode for each pose',
          'Keep consistent lighting across the set',
          'Landscape for full body, portrait for close-ups',
        ],
      },
    },
    {
      contentType: 'text',
      purpose: 'Engagement post to drive subscriber interaction',
      platforms: platforms.length > 0 ? [platforms[0]] : ['onlyfans'],
      difficulty: 1,
      vulnerabilityTier: 1,
      deadlineHours: 2,
      instructions: {
        concept: 'Personal check-in or teasing question to subscribers',
        setting: 'N/A - text post',
        outfit: 'N/A',
        lighting: 'N/A',
        framing: 'N/A',
        expression: 'Flirty, personal, inviting responses',
        technicalNotes: [
          'Keep under 280 characters for cross-posting',
          'End with a question to drive comments',
          'Use 1-2 emojis maximum',
        ],
      },
    },
  ];

  return templates.slice(0, count);
}

function generateFallbackQuickTask(platforms: string[]): GeneratedBriefData {
  return {
    contentType: 'photo',
    purpose: 'Quick check-in to maintain streak and presence',
    platforms: platforms.length > 0 ? [platforms[0]] : ['onlyfans'],
    difficulty: 1,
    vulnerabilityTier: 1,
    deadlineMinutes: 5,
    instructions: {
      concept: 'Quick selfie - show them you are here',
      setting: 'Wherever you are right now',
      outfit: 'Whatever you are wearing',
      lighting: 'Best available light - face a window if possible',
      framing: 'Face and shoulders, phone at eye level',
      expression: 'Natural. A small smile or a knowing look.',
      technicalNotes: [
        'No filter needed',
        'Just be present',
      ],
    },
  };
}

// ============================================
// PUBLIC FUNCTIONS
// ============================================

/**
 * Get all active (assigned or in_progress) content briefs for a user.
 */
export async function getActiveBriefs(userId: string): Promise<ContentBrief[]> {
  const { data, error } = await supabase
    .from('content_briefs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['assigned', 'in_progress'])
    .order('deadline', { ascending: true });

  if (error) {
    console.error('Error fetching active briefs:', error);
    return [];
  }

  return (data ?? []).map((row) => mapBriefRowToBrief(row as unknown as ContentBriefRow));
}

/**
 * Get a single content brief by ID.
 */
export async function getBrief(briefId: string): Promise<ContentBrief | null> {
  const { data, error } = await supabase
    .from('content_briefs')
    .select('*')
    .eq('id', briefId)
    .single();

  if (error || !data) {
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching brief:', error);
    }
    return null;
  }

  return mapBriefRowToBrief(data as unknown as ContentBriefRow);
}

/**
 * AI-generate daily content briefs based on the handler strategy.
 * Saves generated briefs to the database and returns them.
 * Falls back to template briefs if AI is unavailable.
 */
export async function generateDailyBriefs(userId: string): Promise<ContentBrief[]> {
  // Check how many active briefs already exist
  const existingBriefs = await getActiveBriefs(userId);
  const maxBriefs = 3;

  if (existingBriefs.length >= maxBriefs) {
    return existingBriefs;
  }

  const briefsNeeded = maxBriefs - existingBriefs.length;

  // Load strategy and platform info
  const [strategy, platforms] = await Promise.all([
    getStrategy(userId),
    getEnabledPlatforms(userId),
  ]);

  const platformNames = platforms.map((p) => p.platform);

  // Default strategy if none exists
  const effectiveStrategy: HandlerStrategyRow = strategy ?? {
    user_id: userId,
    current_phase: 'foundation',
    content_focus: {
      primaryTypes: ['photo'],
      vulnerabilityTarget: 1,
      frequencyDaily: 1,
    },
    platform_priority: platformNames.length > 0 ? platformNames : ['onlyfans'],
    posting_frequency: {},
    content_calendar: [],
    monetization_strategy: {},
    audience_insights: {},
    resistance_patterns: {},
    adaptation_data: {},
    updated_at: new Date().toISOString(),
  };

  // Attempt AI generation
  let generatedData: GeneratedBriefData[] = [];

  try {
    const { BudgetManager } = await import('./budget-manager');
    const budget = new BudgetManager(userId);
    await budget.initialize();
    const ai = createAIClient(userId, budget);

    if (ai.isAvailable()) {
      const prompt = buildBriefGenerationPrompt(
        effectiveStrategy,
        existingBriefs.length,
        platforms
      );

      // Use the AI client's internal callAPI via generating a morning briefing-style call
      // We build the prompt and parse the response
      const response = await callAIForBriefs(ai, prompt);

      if (response) {
        generatedData = parseAIBriefs(response);
      }
    }
  } catch (err) {
    console.error('AI brief generation failed, falling back to templates:', err);
  }

  // Fallback to templates if AI produced nothing
  if (generatedData.length === 0) {
    generatedData = generateFallbackBriefs(platformNames, briefsNeeded);
  }

  // Limit to needed count
  generatedData = generatedData.slice(0, briefsNeeded);

  // Save all briefs to database
  let nextBriefNumber = await getNextBriefNumber(userId);
  const savedBriefs: ContentBrief[] = [];

  for (const briefData of generatedData) {
    try {
      const brief = await saveBriefToDb(userId, nextBriefNumber, briefData);
      savedBriefs.push(brief);
      nextBriefNumber++;
    } catch (err) {
      console.error('Error saving generated brief:', err);
    }
  }

  return savedBriefs;
}

/**
 * Generate a micro-task (2-5 min deadline) for quick engagement.
 */
export async function generateQuickTask(userId: string): Promise<ContentBrief> {
  const platforms = await getEnabledPlatforms(userId);
  const platformNames = platforms.map((p) => p.platform);

  let briefData: GeneratedBriefData | null = null;

  // Attempt AI generation
  try {
    const { BudgetManager } = await import('./budget-manager');
    const budget = new BudgetManager(userId);
    await budget.initialize();
    const ai = createAIClient(userId, budget);

    if (ai.isAvailable()) {
      const prompt = buildQuickTaskPrompt(platformNames);
      const response = await callAIForBriefs(ai, prompt);

      if (response) {
        const parsed = parseAIBriefs(response);
        if (parsed.length > 0) {
          briefData = parsed[0];
          // Enforce quick task constraints
          briefData.deadlineMinutes = Math.min(5, Math.max(2, briefData.deadlineMinutes ?? 5));
          briefData.difficulty = Math.min(2, briefData.difficulty);
          briefData.vulnerabilityTier = Math.min(2, briefData.vulnerabilityTier);
        }
      }
    }
  } catch (err) {
    console.error('AI quick task generation failed, using fallback:', err);
  }

  // Fallback
  if (!briefData) {
    briefData = generateFallbackQuickTask(platformNames);
  }

  const briefNumber = await getNextBriefNumber(userId);
  return saveBriefToDb(userId, briefNumber, briefData);
}

/**
 * Process a content submission: store files in content_library,
 * update the brief status, and trigger post scheduling.
 */
export async function submitContent(
  userId: string,
  briefId: string,
  files: Array<{ path: string; type: string; size: number }>
): Promise<void> {
  // Fetch the brief
  const brief = await getBrief(briefId);
  if (!brief) {
    throw new Error(`Brief not found: ${briefId}`);
  }
  if (brief.userId !== userId) {
    throw new Error('Brief does not belong to this user');
  }
  if (brief.status === 'processed' || brief.status === 'expired') {
    throw new Error(`Brief cannot accept submissions in status: ${brief.status}`);
  }

  const now = new Date().toISOString();
  const contentIds: string[] = [];

  // Store each file in content_library
  for (const file of files) {
    const contentRow = {
      user_id: userId,
      content_type: brief.contentType,
      storage_path: file.path,
      storage_url: null,
      metadata: {
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_at: now,
      },
      vulnerability_tier: brief.vulnerabilityTier,
      tags: brief.platforms,
      caption_variations: {},
      platforms_posted: [],
      performance_data: {},
      monetization_data: {},
      source: 'brief_submission',
      source_brief_id: briefId,
      released_as_consequence: false,
      times_posted: 0,
    };

    const { data: inserted, error } = await supabase
      .from('content_library')
      .insert(contentRow)
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting content item:', error);
      throw new Error(`Failed to store content: ${error.message}`);
    }

    contentIds.push(inserted.id);
  }

  // Update brief status and link content
  const { error: updateError } = await supabase
    .from('content_briefs')
    .update({
      status: 'submitted',
      submitted_content_ids: [...brief.submittedContentIds, ...contentIds],
      submitted_at: now,
    })
    .eq('id', briefId);

  if (updateError) {
    console.error('Error updating brief status:', updateError);
    throw new Error(`Failed to update brief: ${updateError.message}`);
  }

  // Trigger post processing in the background
  try {
    await processForPosting(userId, contentIds, brief);

    // Mark brief as processed after scheduling
    await supabase
      .from('content_briefs')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', briefId);
  } catch (err) {
    console.error('Post processing failed (brief still marked submitted):', err);
  }
}

/**
 * Generate captions, hashtags, and schedule posts for submitted content.
 */
export async function processForPosting(
  userId: string,
  contentIds: string[],
  brief: ContentBrief
): Promise<void> {
  const platforms = await getEnabledPlatforms(userId);
  const targetPlatforms = platforms.filter((p) =>
    brief.platforms.includes(p.platform)
  );

  if (targetPlatforms.length === 0) {
    console.warn('No matching enabled platforms for brief:', brief.id);
    return;
  }

  const platformNames = targetPlatforms.map((p) => p.platform);

  // Generate captions via AI or fallback
  let captions: Record<string, string> = {};
  let hashtags: Record<string, string[]> = {};

  try {
    const { BudgetManager } = await import('./budget-manager');
    const budget = new BudgetManager(userId);
    await budget.initialize();
    const ai = createAIClient(userId, budget);

    if (ai.isAvailable()) {
      const prompt = buildCaptionPrompt(brief, platformNames);
      const response = await callAIForBriefs(ai, prompt);

      if (response) {
        const parsed = parseCaptionResponse(response);
        captions = parsed.captions;
        hashtags = parsed.hashtags;
      }
    }
  } catch (err) {
    console.error('AI caption generation failed, using fallback:', err);
  }

  // Fallback captions if AI didn't produce any
  if (Object.keys(captions).length === 0) {
    for (const platform of platformNames) {
      captions[platform] = brief.purpose;
      hashtags[platform] = [];
    }
  }

  // Update content_library items with caption variations
  for (const contentId of contentIds) {
    await supabase
      .from('content_library')
      .update({ caption_variations: captions })
      .eq('id', contentId);
  }

  // Schedule posts for each platform + content combination
  const now = new Date();
  let scheduleOffset = 0; // minutes offset to stagger posts

  for (const platformAccount of targetPlatforms) {
    for (const contentId of contentIds) {
      const scheduledFor = new Date(now.getTime() + scheduleOffset * 60 * 1000);
      const caption = captions[platformAccount.platform] ?? brief.purpose;
      const tags = hashtags[platformAccount.platform] ?? [];

      const { error } = await supabase
        .from('scheduled_posts')
        .insert({
          user_id: userId,
          platform_account_id: platformAccount.id,
          content_id: contentId,
          post_type: 'feed',
          caption,
          hashtags: tags,
          metadata: {
            brief_id: brief.id,
            vulnerability_tier: brief.vulnerabilityTier,
          },
          scheduled_for: scheduledFor.toISOString(),
          status: 'scheduled',
        });

      if (error) {
        console.error('Error scheduling post:', error);
      }

      // Stagger posts by 30 minutes across platforms
      scheduleOffset += 30;
    }
  }
}

/**
 * Get content library items for a user, ordered by most recent.
 */
export async function getContentLibrary(
  userId: string,
  limit: number = 50
): Promise<ContentItem[]> {
  const { data, error } = await supabase
    .from('content_library')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching content library:', error);
    return [];
  }

  return (data ?? []).map((row) => mapContentRowToItem(row as unknown as ContentItemRow));
}

/**
 * Select vault content eligible for consequence release.
 * Prioritizes unreleased content at or below the specified vulnerability tier.
 * Never releases above the authorized tier.
 */
export async function getContentForRelease(
  userId: string,
  vulnerabilityTier: number,
  count: number
): Promise<ContentItem[]> {
  const { data, error } = await supabase
    .from('content_library')
    .select('*')
    .eq('user_id', userId)
    .eq('released_as_consequence', false)
    .lte('vulnerability_tier', vulnerabilityTier)
    .order('vulnerability_tier', { ascending: false }) // Highest eligible tier first
    .order('times_posted', { ascending: true })        // Least-posted first
    .order('created_at', { ascending: false })         // Newest first within same tier
    .limit(count);

  if (error) {
    console.error('Error fetching content for release:', error);
    return [];
  }

  return (data ?? []).map((row) => mapContentRowToItem(row as unknown as ContentItemRow));
}

/**
 * Mark a content item as released as a consequence.
 */
export async function markContentReleased(contentId: string): Promise<void> {
  const { error } = await supabase
    .from('content_library')
    .update({
      released_as_consequence: true,
      released_at: new Date().toISOString(),
    })
    .eq('id', contentId);

  if (error) {
    console.error('Error marking content as released:', error);
    throw new Error(`Failed to mark content released: ${error.message}`);
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Call the AI client for brief/caption generation.
 * Uses the AI client's internal API via a direct-ish approach:
 * we instantiate the client and call it with a generation prompt.
 */
async function callAIForBriefs(
  ai: ReturnType<typeof createAIClient>,
  prompt: string
): Promise<string | null> {
  // The AIClient exposes callAPI as private, so we use a workaround:
  // Generate an "intervention" which gives us access to the generation pipeline.
  // We pass the prompt as state context and extract the response.
  //
  // A cleaner approach: access the underlying Anthropic client directly.
  // The AIClient constructor stores it. We use bracket notation to reach it.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (ai as any).client;
    if (!client) return null;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are the Handler for the Becoming Protocol. You generate content briefs and captions for your subject's content creation pipeline. Be specific, creative, and actionable. Output valid JSON only.`,
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.content[0]?.type === 'text' && response.content[0].text) {
      return response.content[0].text;
    }
  } catch (err) {
    console.error('AI call for briefs failed:', err);
  }

  return null;
}

function parseCaptionResponse(
  responseText: string
): { captions: Record<string, string>; hashtags: Record<string, string[]> } {
  try {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    return {
      captions: (parsed.captions as Record<string, string>) ?? {},
      hashtags: (parsed.hashtags as Record<string, string[]>) ?? {},
    };
  } catch (err) {
    console.error('Failed to parse caption response:', err);
    return { captions: {}, hashtags: {} };
  }
}
