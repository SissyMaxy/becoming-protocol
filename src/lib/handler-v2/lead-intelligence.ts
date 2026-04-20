// Lead Intelligence Context
//
// Surfaces auto-poster-harvested contact intelligence to the Handler.
// The contact_intelligence table is populated by the scheduler's extractor
// after each Sniffies exchange. This builder distills the current pool into
// a ranked view the Handler can act on: hot leads, risk-flagged leads,
// tribute-willing leads.

import { supabase } from '../supabase';

interface Row {
  contact_id: string;
  meetup_stage: string;
  tribute_stance: string;
  safety_score: number;
  compatibility_score: number;
  meetup_likelihood: number;
  red_flags: string[];
  kinks_mentioned: string[];
  location_hint: string | null;
  proposed_time: string | null;
  proposed_location: string | null;
  last_analyzed_at: string;
  contacts: { display_name: string | null; tier: string } | null;
  contact_handles: Array<{ platform: string; handle: string }> | null;
}

export async function buildLeadIntelligenceContext(userId: string): Promise<string> {
  try {
    const { data: rows } = await supabase
      .from('contact_intelligence')
      .select(`
        contact_id, meetup_stage, tribute_stance, safety_score,
        compatibility_score, meetup_likelihood, red_flags, kinks_mentioned,
        location_hint, proposed_time, proposed_location, last_analyzed_at,
        contacts!inner(display_name, tier),
        contact_handles!inner(platform, handle)
      `)
      .eq('user_id', userId)
      .gte('last_analyzed_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .order('last_analyzed_at', { ascending: false })
      .limit(40) as unknown as { data: Row[] | null };

    if (!rows || rows.length === 0) return '';

    const hot = rows.filter(r =>
      ['proposing','confirmed','scheduled'].includes(r.meetup_stage) &&
      r.safety_score >= 6 &&
      (r.red_flags || []).length === 0,
    );
    const flagged = rows.filter(r => (r.red_flags || []).length > 0 || r.safety_score <= 3);
    const paying = rows.filter(r => r.tribute_stance === 'paid' || r.tribute_stance === 'willing');
    const stalled = rows.filter(r =>
      r.meetup_stage === 'flirting' &&
      Date.now() - new Date(r.last_analyzed_at).getTime() > 3 * 86400_000,
    );

    const lines: string[] = [];
    lines.push(`LEAD INTELLIGENCE: ${rows.length} analyzed contact(s) (7d)`);

    if (hot.length > 0) {
      lines.push(`  🔥 HOT (${hot.length}) — safe + progressing toward meet:`);
      for (const r of hot.slice(0, 5)) {
        const name = r.contacts?.display_name || r.contact_handles?.[0]?.handle || 'unknown';
        const plat = r.contact_handles?.[0]?.platform || '?';
        const meta: string[] = [`stage=${r.meetup_stage}`, `safe=${r.safety_score}/10`, `likely=${r.meetup_likelihood}/10`];
        if (r.tribute_stance !== 'unknown') meta.push(`tribute=${r.tribute_stance}`);
        if (r.proposed_time) meta.push(`@${r.proposed_time.slice(0,16).replace('T',' ')}`);
        if (r.proposed_location) meta.push(`loc="${r.proposed_location.slice(0, 40)}"`);
        lines.push(`    ${name} [${plat}] — ${meta.join(', ')}`);
      }
    }

    if (flagged.length > 0) {
      lines.push(`  ⚠ RISK (${flagged.length}) — red flags or low safety:`);
      for (const r of flagged.slice(0, 5)) {
        const name = r.contacts?.display_name || r.contact_handles?.[0]?.handle || 'unknown';
        const flags = (r.red_flags || []).slice(0, 3).join(', ');
        lines.push(`    ${name} — safe=${r.safety_score}/10, flags=[${flags}]`);
      }
    }

    if (paying.length > 0) {
      lines.push(`  💰 Tribute-willing/paid (${paying.length}): ${paying.slice(0, 6).map(r => r.contacts?.display_name || r.contact_handles?.[0]?.handle || '?').join(', ')}`);
    }

    if (stalled.length > 0 && stalled.length <= 10) {
      lines.push(`  💤 Stalled in 'flirting' >3d (${stalled.length}) — consider re-engaging or dropping`);
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[lead-intelligence] build failed:', err);
    return '';
  }
}
