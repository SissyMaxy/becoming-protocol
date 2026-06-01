/**
 * Gina Relationship Intelligence System
 *
 * Tracks introductions, reactions, timing patterns, and disclosure readiness.
 * Helps Maxy be a proactive, emotionally intelligent partner.
 */

import { supabase } from '../supabase';

// ============================================
// COMFORT MAP
// ============================================

export async function logGinaReaction(
  userId: string,
  channel: string,
  introduction: string,
  reaction: 'positive' | 'neutral' | 'negative' | 'curious',
  detail?: string,
  ginaInitiated?: boolean,
): Promise<void> {
  const now = new Date();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';

  await supabase.from('gina_comfort_map').insert({
    user_id: userId,
    channel,
    introduction,
    reaction,
    reaction_detail: detail || null,
    gina_initiated: ginaInitiated || false,
    day_of_week: days[now.getDay()],
    time_of_day: timeOfDay,
  });
}
