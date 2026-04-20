// Standalone irreversibility score computation + persistence for the auto-poster.
// Cannot import src/lib/conditioning/irreversibility.ts because that module
// imports from src/lib/supabase.ts which uses import.meta.env (Vite-only) and
// crashes under tsx/Node. We reuse the scheduler's service-role client here.
//
// Keep this in lock-step with src/lib/conditioning/irreversibility.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

async function countRows(
  supabase: SupabaseClient,
  table: string,
  filters: (q: any) => any,
): Promise<number> {
  try {
    let q: any = supabase.from(table).select('id', { count: 'exact', head: true });
    q = filters(q);
    const { count, error } = await q;
    if (error || count == null) return 0;
    return count;
  } catch {
    return 0;
  }
}

export async function persistIrreversibilityScore(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ score: number; band: string; peak: number; components: Record<string, number> }> {
  const postedCount = await countRows(supabase, 'ai_generated_content', q =>
    q.eq('user_id', userId).eq('status', 'posted'),
  );
  const totalPosts = await countRows(supabase, 'ai_generated_content', q => q.eq('user_id', userId));

  const contentPermanence = Math.min(10, postedCount);
  const socialExposure = totalPosts === 0 ? 0 : Math.min(10, Math.round(Math.log10(totalPosts + 1) * 3.33));

  let financial = 0;
  try {
    const { data } = await supabase.from('investments').select('amount_cents').eq('user_id', userId);
    if (data && data.length > 0) {
      const dollars = data.reduce((s, r: any) => s + (r.amount_cents || 0), 0) / 100;
      financial = Math.min(10, Math.round((dollars / 500) * 10));
    }
  } catch {}

  let physical = 0;
  try {
    const { data } = await supabase.from('user_state').select('owned_items').eq('user_id', userId).maybeSingle();
    const items = Array.isArray(data?.owned_items) ? data.owned_items : [];
    physical = Math.min(10, Math.round((items.length / 20) * 10));
  } catch {}

  let identity = 0;
  try {
    const { data: st } = await supabase.from('user_state').select('streak_days').eq('user_id', userId).maybeSingle();
    const { data: pr } = await supabase.from('user_progress').select('total_days').eq('user_id', userId).maybeSingle();
    const combined = (st?.streak_days || 0) + (pr?.total_days || 0);
    identity = Math.min(10, Math.round((combined / 90) * 10));
  } catch {}

  const conditioning = Math.min(10, Math.round(
    (await countRows(supabase, 'conditioning_sessions_v2', q => q.eq('user_id', userId))) / 5,
  ));

  let relationship = 0;
  try {
    const { data } = await supabase
      .from('gina_discovery_state')
      .select('discovery_phase, channels_with_positive_seeds')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      const phase = typeof data.discovery_phase === 'number' ? data.discovery_phase : 0;
      const ch = data.channels_with_positive_seeds || 0;
      relationship = Math.min(10, Math.min(6, Math.round((phase / 3) * 6)) + Math.min(4, Math.round((ch / 5) * 4)));
    }
  } catch {}

  let audience = 0;
  try {
    const { data: rev } = await supabase.from('content_revenue').select('total_cents').eq('user_id', userId).maybeSingle();
    const revScore = rev?.total_cents > 0 ? Math.min(5, Math.round((rev.total_cents / 100000) * 5)) : 0;
    const fanCount = await countRows(supabase, 'fan_profiles', q => q.eq('user_id', userId));
    const fanScore = fanCount > 0 ? Math.min(5, Math.round((fanCount / 50) * 5)) : 0;
    audience = Math.min(10, revScore + fanScore);
  } catch {}

  const behavioral = Math.min(10, await countRows(supabase, 'conditioned_triggers', q =>
    q.eq('user_id', userId).in('estimated_strength', ['established', 'conditioned']),
  ));

  const timeInv = Math.min(10, Math.round(
    (await countRows(supabase, 'daily_entries', q => q.eq('user_id', userId))) / 20,
  ));

  const components = {
    contentPermanence, socialExposure, financial, physical, identity,
    conditioning, relationship, audience, behavioral, timeInv,
  };
  const score = Object.values(components).reduce((s, v) => s + v, 0);
  const band = score < 30 ? 'early' : score < 60 ? 'committed' : score < 80 ? 'hard-to-reverse' : 'point-of-no-return';

  const row = {
    user_id: userId,
    score,
    public_exposure: socialExposure * 10,
    social_outing: relationship * 10,
    financial_lockin: financial * 10,
    physical_changes: physical * 10,
    conditioning_depth: conditioning * 10,
    contact_entanglement: audience * 10,
    content_permanence: contentPermanence * 10,
    inputs: components as unknown as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from('irreversibility_score')
    .select('peak_score')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('irreversibility_score').update(row).eq('user_id', userId);
  } else {
    await supabase.from('irreversibility_score').insert({ ...row, peak_score: score });
  }

  await supabase.from('irreversibility_score_history').insert({
    user_id: userId,
    score,
    components: components as unknown as Record<string, unknown>,
  });

  const { data: peakRow } = await supabase
    .from('irreversibility_score')
    .select('peak_score')
    .eq('user_id', userId)
    .maybeSingle();

  return { score, band, peak: peakRow?.peak_score ?? score, components };
}
