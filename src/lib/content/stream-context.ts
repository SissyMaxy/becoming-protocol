import { supabase } from '../supabase';

export async function buildStreamContext(userId: string): Promise<string> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count: streamsThisWeek } = await supabase.from('ai_generated_content')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('platform', 'chaturbate')
      .eq('generation_strategy', 'live_announce')
      .gte('posted_at', weekAgo);

    const target = 3;
    const actual = streamsThisWeek ?? 0;
    const onTrack = actual >= target;

    if (actual === 0 && target === 0 as number) return '';

    const lines = [`CAM SCHEDULE: ${actual}/${target} streams this week${onTrack ? '' : ' ⚠ BEHIND'}`];
    lines.push(`  Target: Tue 8pm, Thu 8pm, Sat 9pm (30-45 min each)`);

    if (!onTrack) {
      const remaining = target - actual;
      lines.push(`  ${remaining} stream(s) owed. Confront Maxy about going live.`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}
