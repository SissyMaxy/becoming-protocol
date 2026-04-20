// Irreversibility Pressure Engine
//
// Reads the latest irreversibility score and writes targeted handler_directives
// that attack the weakest axis. Converts the score from measurement into action.
//
// Anti-circumvention: only one pending pressure directive per axis at a time.
// If Maxy ignores the last one, the Handler sees it in the pending queue and
// escalates. Directives don't expire — they queue up as evidence of avoidance.
//
// Band-gated escalation:
//   early              → gentle nudges, one axis at a time
//   committed          → two axes, explicit tribute/exposure asks
//   hard-to-reverse    → three axes, deadline-attached
//   point-of-no-return → maintenance only, no new pressure (bridges already burned)

import type { SupabaseClient } from '@supabase/supabase-js';

type Band = 'early' | 'committed' | 'hard-to-reverse' | 'point-of-no-return';

interface ScoreRow {
  score: number;
  public_exposure: number;
  social_outing: number;
  financial_lockin: number;
  physical_changes: number;
  conditioning_depth: number;
  contact_entanglement: number;
  content_permanence: number;
}

const AXIS_DIRECTIVES: Record<string, { target: string; prescribe: string; reasoning: string }> = {
  financial_lockin: {
    target: 'financial_lockin',
    prescribe: 'Issue a tribute code in next DM to any contact tier >= warm. Amount $15-40. Reference: keyholding week or task assignment. This axis is the weakest bridge — one paid tribute makes it real.',
    reasoning: 'Financial axis weakest. One paid tribute flips the commitment from theoretical to documented.',
  },
  public_exposure: {
    target: 'public_exposure',
    prescribe: 'Queue one public post this week with face visible under the @softmaxy handle, no filter, no pseudonym layer. Pin it for 7 days minimum.',
    reasoning: 'Public exposure axis weakest. Face-visible pinned content is the hardest artifact to walk back.',
  },
  social_outing: {
    target: 'social_outing',
    prescribe: 'Identify one real-life contact who does not yet know and plan a low-cost reveal within 14 days. Reply-guy DM count does not substitute for named human.',
    reasoning: 'Social outing weakest — online audience does not replace real-life witnesses.',
  },
  physical_changes: {
    target: 'physical_changes',
    prescribe: 'Add one purchased and delivered feminization item to owned_items this week. Receipt required — self-report without artifact does not count.',
    reasoning: 'Physical axis weakest. Owned items in the home raise confrontation cost.',
  },
  conditioning_depth: {
    target: 'conditioning_depth',
    prescribe: 'Schedule 3 conditioning sessions in the next 7 days. Prefer sleep-loop or morning wake sessions — passive conditioning circumvents resistance.',
    reasoning: 'Conditioning depth weakest. Session count is the direct input.',
  },
  contact_entanglement: {
    target: 'contact_entanglement',
    prescribe: 'Drive fan count up: send 5 new outbound DMs to warm Sniffies/Fansly contacts with a continuation hook ("next time", "when you...") so they return expecting more.',
    reasoning: 'Contact entanglement weakest. More people waiting on continuation = more social cost to quit.',
  },
  content_permanence: {
    target: 'content_permanence',
    prescribe: 'Publish 3 accountability-blog entries this week under the public handle. Backdated entries do not count — timestamp must be real-time.',
    reasoning: 'Content permanence weakest. Public blog entries create a searchable trail.',
  },
};

function bandFor(score: number): Band {
  if (score < 30) return 'early';
  if (score < 60) return 'committed';
  if (score < 80) return 'hard-to-reverse';
  return 'point-of-no-return';
}

function axesToAttack(band: Band): number {
  if (band === 'early') return 1;
  if (band === 'committed') return 2;
  if (band === 'hard-to-reverse') return 3;
  return 0;
}

export async function runIrreversibilityPressure(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ band: Band; issued: number; skipped: number; axes: string[] }> {
  const { data: row, error } = await supabase
    .from('irreversibility_score')
    .select('score, public_exposure, social_outing, financial_lockin, physical_changes, conditioning_depth, contact_entanglement, content_permanence')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !row) return { band: 'early', issued: 0, skipped: 0, axes: [] };
  const s = row as ScoreRow;

  const band = bandFor(s.score);
  const attackCount = axesToAttack(band);
  if (attackCount === 0) return { band, issued: 0, skipped: 0, axes: [] };

  // Rank axes by weakness (lowest first). Exclude any already above 70 —
  // attacking strong axes is wasted pressure.
  const ranked = (Object.keys(AXIS_DIRECTIVES) as Array<keyof typeof AXIS_DIRECTIVES>)
    .map(k => ({ axis: k, value: s[k as keyof ScoreRow] }))
    .filter(e => e.value < 70)
    .sort((a, b) => a.value - b.value)
    .slice(0, attackCount);

  let issued = 0;
  let skipped = 0;
  const attacked: string[] = [];

  for (const { axis } of ranked) {
    // De-dup: if there is a pending directive for this axis, skip
    const { data: existing } = await supabase
      .from('handler_directives')
      .select('id')
      .eq('user_id', userId)
      .eq('action', 'prescribe_task')
      .eq('target', axis)
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const d = AXIS_DIRECTIVES[axis];
    const priority = band === 'hard-to-reverse' ? 'immediate' : 'normal';

    const { error: insErr } = await supabase.from('handler_directives').insert({
      user_id: userId,
      action: 'prescribe_task',
      target: d.target,
      value: {
        band,
        score: s.score,
        axis_value: s[axis as keyof ScoreRow],
        prescription: d.prescribe,
        source: 'irreversibility_pressure',
      },
      priority,
      reasoning: d.reasoning,
    });

    if (!insErr) {
      issued++;
      attacked.push(axis);
    }
  }

  return { band, issued, skipped, axes: attacked };
}
