import { supabase } from './supabase';

export interface GateStatus {
  voicePractice: boolean;
  confession: boolean;
  outfitVerification: boolean;
  denialCheckIn: boolean;
  allComplete: boolean;
  completedCount: number;
  totalRequired: number;
}

export async function checkDailyGates(userId: string): Promise<GateStatus> {
  const today = new Date().toISOString().split('T')[0];

  const [voice, confession, outfit, denial] = await Promise.allSettled([
    supabase.from('voice_practice_log').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('shame_journal').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('verification_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', `${today}T00:00:00`),
    supabase.from('mood_checkins').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('recorded_at', `${today}T00:00:00`),
  ]);

  const voiceDone = voice.status === 'fulfilled' && (voice.value.count || 0) > 0;
  const confessionDone = confession.status === 'fulfilled' && (confession.value.count || 0) > 0;
  const outfitDone = outfit.status === 'fulfilled' && (outfit.value.count || 0) > 0;
  const denialDone = denial.status === 'fulfilled' && (denial.value.count || 0) > 0;

  const completedCount = [voiceDone, confessionDone, outfitDone, denialDone].filter(Boolean).length;

  return {
    voicePractice: voiceDone,
    confession: confessionDone,
    outfitVerification: outfitDone,
    denialCheckIn: denialDone,
    allComplete: completedCount >= 4,
    completedCount,
    totalRequired: 4,
  };
}

// Determine which features are locked based on how many gates are incomplete
export function getLockedFeatures(gates: GateStatus): string[] {
  const locked: string[] = [];

  if (gates.completedCount < 1) {
    // Nothing done - everything locked
    locked.push('edge_sessions', 'conditioning', 'content_library', 'device_control', 'social_posting');
  } else if (gates.completedCount < 2) {
    // 1 done - most still locked
    locked.push('edge_sessions', 'conditioning', 'device_control');
  } else if (gates.completedCount < 3) {
    // 2 done - some locked
    locked.push('edge_sessions', 'conditioning');
  } else if (gates.completedCount < 4) {
    // 3 done - conditioning locked until all complete
    locked.push('conditioning');
  }
  // 4 done - nothing locked

  return locked;
}
