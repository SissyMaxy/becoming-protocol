/**
 * Social Escalation Pipeline
 *
 * Builds Maxy's social web. Every bilateral relationship
 * is a thread David can't cut without social cost.
 */

import { supabase } from '../supabase';

export async function calculateSocialIrreversibility(userId: string): Promise<{
  score: number;
  threads: number;
  strongThreads: number;
}> {
  const { data: web } = await supabase
    .from('social_web').select('thread_strength').eq('user_id', userId);

  if (!web) return { score: 0, threads: 0, strongThreads: 0 };

  const weights: Record<string, number> = { weak: 0.1, moderate: 0.5, strong: 2, permanent: 5 };
  const score = web.reduce((sum, w) => sum + (weights[w.thread_strength] || 0), 0);
  const strongThreads = web.filter(w => ['strong', 'permanent'].includes(w.thread_strength)).length;

  return { score, threads: web.length, strongThreads };
}

export async function getSocialContext(userId: string): Promise<string> {
  const social = await calculateSocialIrreversibility(userId);
  if (social.threads === 0) return '';

  const lines = ['## Social Web'];
  lines.push(`Total connections: ${social.threads}`);
  lines.push(`Strong threads: ${social.strongThreads}`);
  lines.push(`Irreversibility score: ${social.score.toFixed(1)}`);
  return lines.join('\n');
}

export async function logConnection(
  userId: string,
  name: string,
  platform: string,
  type: string,
  strength: string = 'weak',
  handlerInitiated: boolean = false,
): Promise<void> {
  await supabase.from('social_web').insert({
    user_id: userId, connection_name: name, platform,
    connection_type: type, thread_strength: strength,
    handler_initiated: handlerInitiated,
  });
}
