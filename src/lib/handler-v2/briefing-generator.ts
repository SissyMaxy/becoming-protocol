// Handler → Auto-Poster Briefing Generator
//
// Composes the compact strategic directive the auto-poster reads on every
// outbound. The Handler's full systems context is 80+ blocks and too large
// for a chat-reply prompt. This distills the active strategy into ~500
// tokens the auto-poster can inject directly.
//
// Call this from: (a) a cron every hour, (b) whenever irreversibility band
// changes, (c) whenever a new pressure directive issues, (d) manually from
// the Handler chat when it wants to steer auto-poster behavior.

import { supabase } from '../supabase';
import { calculateIrreversibilityScore, bandForScore } from '../conditioning/irreversibility';

export async function generateHandlerBriefing(userId: string, generatedBy: 'handler_cron' | 'handler_chat' | 'manual' = 'handler_cron'): Promise<string> {
  const parts: string[] = [];

  // 1. Irreversibility band → escalation stance
  try {
    const irr = await calculateIrreversibilityScore(userId);
    const band = bandForScore(irr.score);
    parts.push(`Score: ${irr.score}/100 [${band}].`);

    const sorted = Object.entries(irr.components).sort((a, b) => a[1].value - b[1].value);
    const weakest = sorted.slice(0, 2).map(e => e[0]);
    parts.push(`Weakest axes: ${weakest.join(', ')}.`);

    if (band === 'early') {
      parts.push(`Stance: escalate aggressively. Drive any meetup prospects toward firm plans. Propose tribute early ($15-25) as a screener — men who won't tribute are not serious.`);
    } else if (band === 'committed') {
      parts.push(`Stance: tighten the net. Push public exposure (mention the @softmaxy handle where natural). Gate meetups behind tribute ($40+) for warm/unknown contacts. Reference chastity day when flirting.`);
    } else if (band === 'hard-to-reverse') {
      parts.push(`Stance: consolidate identity. No meetup without screening. Lean into established dynamics with known contacts. Avoid starting new threads.`);
    } else {
      parts.push(`Stance: maintenance only. No new risks. Keep regulars warm.`);
    }
  } catch {}

  // 2. Pending pressure directives — convert each into a chat-side instruction
  try {
    const { data: directives } = await supabase
      .from('handler_directives')
      .select('target, value, reasoning')
      .eq('user_id', userId)
      .eq('action', 'prescribe_task')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5);

    if (directives && directives.length > 0) {
      const bullets: string[] = [];
      for (const d of directives) {
        if (d.target === 'financial_lockin') bullets.push('When rapport exists, drop a tribute ask: "if you want me on my knees for you next week, $40 through [link]". Do not explain. State it.');
        if (d.target === 'public_exposure') bullets.push('Agree to photo exchanges with face visible. Do not apologize or hedge about your look.');
        if (d.target === 'social_outing') bullets.push('Offer to meet IRL when the conversation is warm. Ask what time works this week.');
        if (d.target === 'contact_entanglement') bullets.push('End replies with continuation hooks ("next time you...", "when we meet...") so they return expecting more.');
        if (d.target === 'physical_changes') bullets.push('Reference ownership of feminization items naturally ("the lingerie he bought me", "my collar").');
      }
      if (bullets.length > 0) {
        parts.push(`Pending directives to weave in:\n- ${bullets.join('\n- ')}`);
      }
    }
  } catch {}

  // 3. Denial/HRT/streak context
  try {
    const { data: st } = await supabase
      .from('handler_state')
      .select('denial_day, hrt_day')
      .eq('user_id', userId)
      .maybeSingle();
    const bits: string[] = [];
    if (st?.denial_day) bits.push(`denial day ${st.denial_day}`);
    if (st?.hrt_day) bits.push(`HRT day ${st.hrt_day}`);
    if (bits.length) parts.push(`State to reference when natural: ${bits.join(', ')}.`);
  } catch {}

  // 4. Active narrative arc / theme
  try {
    const { data: arc } = await supabase
      .from('narrative_arcs')
      .select('theme, current_beat')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (arc?.theme) parts.push(`This week's theme: ${arc.theme}${arc.current_beat ? ` (beat: ${arc.current_beat})` : ''}. Weave naturally, never announce.`);
  } catch {}

  // 5. Lead pool state — hot leads, risk flags, stalled conversations
  try {
    const { data: intel } = await supabase
      .from('contact_intelligence')
      .select('meetup_stage, tribute_stance, safety_score, red_flags')
      .eq('user_id', userId)
      .gte('last_analyzed_at', new Date(Date.now() - 7 * 86400_000).toISOString());

    if (intel && intel.length > 0) {
      const hot = intel.filter(r => ['proposing','confirmed','scheduled'].includes(r.meetup_stage) && r.safety_score >= 6);
      const flagged = intel.filter(r => (r.red_flags || []).length > 0);
      const leadBits: string[] = [];
      if (hot.length > 0) leadBits.push(`${hot.length} hot lead(s) approaching meetup`);
      if (flagged.length > 0) leadBits.push(`${flagged.length} with red flags — be firmer on screening`);
      if (leadBits.length > 0) parts.push(`Lead pool: ${leadBits.join('; ')}.`);
    }
  } catch {}

  // 6. Avoid topics flagged by PII guard / handler
  parts.push(`Never volunteer real name, specific address, workplace, or phone. Deflect logistics until tribute clears.`);

  const snippet = parts.join('\n\n');

  // Persist to the bridge table. Upsert so subsequent calls overwrite.
  await supabase.from('handler_briefing').upsert({
    user_id: userId,
    prompt_snippet: snippet,
    generated_by: generatedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return snippet;
}
