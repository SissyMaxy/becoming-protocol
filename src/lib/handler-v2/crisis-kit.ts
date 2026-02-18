/**
 * Crisis Kit Curation
 *
 * Implements v2 Part FM9:
 * - Handler builds crisis kit during good periods
 * - Curates evidence for identity crisis moments
 * - Deploys kit items during crisis
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export type CrisisKitItemType =
  | 'journal_entry'
  | 'photo'
  | 'voice_recording'
  | 'therapist_quote'
  | 'peak_moment'
  | 'commitment'
  | 'milestone';

export interface CrisisKitItem {
  id: string;
  userId: string;
  itemType: CrisisKitItemType;
  sourceId?: string;
  contentPreview: string;
  curatedBy: 'handler' | 'user' | 'both';
  addedAt: Date;
  timesShown: number;
  lastShownAt?: Date;
  userEffectivenessRating?: number;
}

export interface CrisisKitDeployment {
  items: CrisisKitItem[];
  message: string;
  deliveredAt: Date;
}

// ============================================
// CURATION
// ============================================

/**
 * Handler automatically curates crisis kit during good periods.
 * Called after milestones, peak moments, strong journal entries.
 */
export async function curateForCrisisKit(
  userId: string,
  trigger: 'milestone' | 'peak_moment' | 'strong_journal' | 'voice_breakthrough' | 'session_insight',
  sourceId: string,
  contentPreview: string
): Promise<string | null> {
  // Check current kit size (target: 10-15 items)
  const { data: existing } = await supabase
    .from('crisis_kit')
    .select('id')
    .eq('user_id', userId);

  if ((existing?.length || 0) >= 15) {
    // Kit is full, only add if this is exceptional
    // Could implement quality comparison here
    return null;
  }

  // Map trigger to item type
  const itemTypeMap: Record<typeof trigger, CrisisKitItemType> = {
    milestone: 'milestone',
    peak_moment: 'peak_moment',
    strong_journal: 'journal_entry',
    voice_breakthrough: 'voice_recording',
    session_insight: 'peak_moment',
  };

  const { data, error } = await supabase
    .from('crisis_kit')
    .insert({
      user_id: userId,
      item_type: itemTypeMap[trigger],
      source_id: sourceId,
      content_preview: contentPreview,
      curated_by: 'handler',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to add to crisis kit:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * User manually adds item to their crisis kit.
 */
export async function userAddToCrisisKit(
  userId: string,
  itemType: CrisisKitItemType,
  contentPreview: string,
  sourceId?: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('crisis_kit')
    .insert({
      user_id: userId,
      item_type: itemType,
      source_id: sourceId,
      content_preview: contentPreview,
      curated_by: 'user',
    })
    .select('id')
    .single();

  if (error) return null;
  return data?.id || null;
}

// ============================================
// RETRIEVAL
// ============================================

export async function getCrisisKit(userId: string): Promise<CrisisKitItem[]> {
  const { data } = await supabase
    .from('crisis_kit')
    .select('*')
    .eq('user_id', userId)
    .order('times_shown', { ascending: true }); // Least shown first

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    itemType: row.item_type,
    sourceId: row.source_id,
    contentPreview: row.content_preview,
    curatedBy: row.curated_by,
    addedAt: new Date(row.added_at),
    timesShown: row.times_shown,
    lastShownAt: row.last_shown_at ? new Date(row.last_shown_at) : undefined,
    userEffectivenessRating: row.user_effectiveness_rating,
  }));
}

export async function getCrisisKitByType(
  userId: string,
  itemType: CrisisKitItemType
): Promise<CrisisKitItem[]> {
  const kit = await getCrisisKit(userId);
  return kit.filter(item => item.itemType === itemType);
}

// ============================================
// DEPLOYMENT
// ============================================

/**
 * Deploy crisis kit during identity crisis.
 * Returns 3-5 items, prioritizing least-shown and user-authored.
 */
export async function deployCrisisKit(userId: string): Promise<CrisisKitDeployment> {
  const kit = await getCrisisKit(userId);

  if (kit.length === 0) {
    return {
      items: [],
      message: getDefaultCrisisMessage(),
      deliveredAt: new Date(),
    };
  }

  // Select items for deployment
  // Priority: user-authored > least shown > variety of types
  const userAuthored = kit.filter(i => i.curatedBy === 'user');
  const handlerCurated = kit.filter(i => i.curatedBy === 'handler');

  const selectedItems: CrisisKitItem[] = [];

  // Always include at least 1 user-authored if available
  if (userAuthored.length > 0) {
    selectedItems.push(userAuthored[0]);
  }

  // Add variety of types
  const typesNeeded: CrisisKitItemType[] = ['journal_entry', 'photo', 'milestone', 'peak_moment'];

  for (const type of typesNeeded) {
    if (selectedItems.length >= 5) break;

    const ofType = handlerCurated.filter(i =>
      i.itemType === type && !selectedItems.includes(i)
    );

    if (ofType.length > 0) {
      // Pick least shown
      selectedItems.push(ofType.sort((a, b) => a.timesShown - b.timesShown)[0]);
    }
  }

  // Fill up to 5 with remaining least-shown
  const remaining = kit
    .filter(i => !selectedItems.includes(i))
    .sort((a, b) => a.timesShown - b.timesShown);

  while (selectedItems.length < 5 && remaining.length > 0) {
    selectedItems.push(remaining.shift()!);
  }

  // Mark items as shown
  for (const item of selectedItems) {
    await supabase
      .from('crisis_kit')
      .update({
        times_shown: item.timesShown + 1,
        last_shown_at: new Date().toISOString(),
      })
      .eq('id', item.id);
  }

  // Update last offered time
  await supabase
    .from('user_state')
    .update({ crisis_kit_last_offered: new Date().toISOString() })
    .eq('user_id', userId);

  return {
    items: selectedItems,
    message: generateCrisisKitMessage(selectedItems),
    deliveredAt: new Date(),
  };
}

function generateCrisisKitMessage(items: CrisisKitItem[]): string {
  const intro = `That voice saying "who are you kidding" — that's the one that kept you hidden for years. It's had a lot of practice sounding reasonable. But here's what it can't explain:`;

  const evidence = items.map(item => {
    switch (item.itemType) {
      case 'journal_entry':
        return `📝 Your words: "${item.contentPreview}"`;
      case 'photo':
        return `📸 A photo from when you felt real`;
      case 'voice_recording':
        return `🎤 Your voice, changed from where it started`;
      case 'milestone':
        return `🏆 ${item.contentPreview}`;
      case 'peak_moment':
        return `✨ ${item.contentPreview}`;
      case 'commitment':
        return `💫 A commitment you made when you meant it`;
      case 'therapist_quote':
        return `🩺 ${item.contentPreview}`;
      default:
        return item.contentPreview;
    }
  });

  const outro = `If this were just a phase, it wouldn't have this much evidence behind it.`;

  return [intro, '', ...evidence, '', outro].join('\n');
}

function getDefaultCrisisMessage(): string {
  return `The doubt is real. The feeling is real. But feelings aren't facts. You started this for a reason. That reason is still valid. The crisis passes. It always does. Just don't delete anything. Don't undo anything. Wait.`;
}

// ============================================
// EFFECTIVENESS TRACKING
// ============================================

export async function rateCrisisKitItem(
  itemId: string,
  rating: number // 1-5
): Promise<void> {
  await supabase
    .from('crisis_kit')
    .update({ user_effectiveness_rating: rating })
    .eq('id', itemId);
}

export async function getCrisisKitEffectiveness(userId: string): Promise<{
  averageRating: number;
  mostEffectiveType: CrisisKitItemType | null;
  leastEffectiveType: CrisisKitItemType | null;
}> {
  const kit = await getCrisisKit(userId);
  const rated = kit.filter(i => i.userEffectivenessRating !== undefined);

  if (rated.length === 0) {
    return {
      averageRating: 0,
      mostEffectiveType: null,
      leastEffectiveType: null,
    };
  }

  const avgRating = rated.reduce((sum, i) => sum + (i.userEffectivenessRating || 0), 0) / rated.length;

  // Group by type and average
  const byType: Record<string, { sum: number; count: number }> = {};
  for (const item of rated) {
    if (!byType[item.itemType]) {
      byType[item.itemType] = { sum: 0, count: 0 };
    }
    byType[item.itemType].sum += item.userEffectivenessRating || 0;
    byType[item.itemType].count += 1;
  }

  let mostEffective: CrisisKitItemType | null = null;
  let mostEffectiveAvg = 0;
  let leastEffective: CrisisKitItemType | null = null;
  let leastEffectiveAvg = 6;

  for (const [type, data] of Object.entries(byType)) {
    const avg = data.sum / data.count;
    if (avg > mostEffectiveAvg) {
      mostEffectiveAvg = avg;
      mostEffective = type as CrisisKitItemType;
    }
    if (avg < leastEffectiveAvg) {
      leastEffectiveAvg = avg;
      leastEffective = type as CrisisKitItemType;
    }
  }

  return {
    averageRating: avgRating,
    mostEffectiveType: mostEffective,
    leastEffectiveType: leastEffective,
  };
}

// ============================================
// AUTOMATIC CURATION TRIGGERS
// ============================================

/**
 * Check if current moment should be captured for crisis kit.
 */
export function shouldCaptureForKit(context: {
  arousalLevel: number;
  moodScore: number;
  justCompletedMilestone: boolean;
  journalSentiment?: 'positive' | 'negative' | 'neutral';
  streakDays: number;
}): { shouldCapture: boolean; trigger: string } {
  // After milestone
  if (context.justCompletedMilestone) {
    return { shouldCapture: true, trigger: 'milestone' };
  }

  // Peak arousal + high mood = peak moment
  if (context.arousalLevel >= 4 && context.moodScore >= 7) {
    return { shouldCapture: true, trigger: 'peak_moment' };
  }

  // Strong positive journal
  if (context.journalSentiment === 'positive' && context.moodScore >= 7) {
    return { shouldCapture: true, trigger: 'strong_journal' };
  }

  // Streak milestone
  if ([7, 14, 30, 60, 90].includes(context.streakDays)) {
    return { shouldCapture: true, trigger: 'milestone' };
  }

  return { shouldCapture: false, trigger: '' };
}

/**
 * Prompt user to write something for the crisis kit during peak moment.
 */
export function getCrisisKitPrompt(context: {
  arousalLevel: number;
  streakDays: number;
}): string {
  if (context.arousalLevel >= 5) {
    return `Write something to the version of you that will doubt this in an hour.`;
  }

  if (context.streakDays >= 7) {
    return `${context.streakDays} days in. Write a note to future-you who might want to quit.`;
  }

  return `Capture this feeling. What would you tell yourself if you doubted tomorrow?`;
}
