// letters/auto-archive — policy helper.
//
// Decides which outreach rows earn a place in the letters archive (the
// permanent museum view). Lives next to its consumers in src/ for the UI
// path; an identical Deno-flavored copy sits in supabase/functions/_shared/
// so the edge fns can call it without a node import.
//
// The matrix:
//   mommy-praise  + affect ∈ { delighted, possessive }                → archive
//   mommy-bedtime (any affect)                                        → archive
//   mommy-recall  + status ≥ acknowledged                             → archive
//   mommy-mantra  + status ≥ acknowledged                             → archive
//   everything else                                                   → no
//
// The user can still pin any non-archived row manually from the UI.

export type LettersOutreachRow = {
  source: string | null;
  affect_snapshot: string | null;
  status?: string | null;
  delivered_at?: string | null;
};

const PRAISE_AFFECTS_THAT_ARCHIVE = new Set(['delighted', 'possessive']);

// "Acknowledged" in this codebase = status='delivered' OR delivered_at is set.
// The two are kept in sync by migration 300_outreach_status_sets_delivered_at,
// but check both so we still archive correctly if a caller sets only one.
function isAcknowledged(row: LettersOutreachRow): boolean {
  if (row.status === 'delivered') return true;
  if (row.delivered_at) return true;
  return false;
}

export function shouldAutoArchive(row: LettersOutreachRow): boolean {
  const src = (row.source || '').toLowerCase();

  if (src === 'mommy_praise') {
    return PRAISE_AFFECTS_THAT_ARCHIVE.has(row.affect_snapshot || '');
  }

  if (src === 'mommy_bedtime') {
    return true;
  }

  if (src === 'mommy_recall' || src === 'mommy_mantra') {
    return isAcknowledged(row);
  }

  return false;
}
