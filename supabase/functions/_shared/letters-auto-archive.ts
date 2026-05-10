// letters-auto-archive (Deno copy) — kept in sync with src/lib/letters/auto-archive.ts.
//
// The edge runtime can't import from src/, so this is the parallel module the
// mommy-* edge fns use to decide whether to flip is_archived_to_letters at
// insert-time. Praise and bedtime can archive immediately. Recall/mantra
// archive only after the user has acknowledged, so the edge fns leave the
// flag false at insert and the acknowledgement path re-runs the policy.

export type LettersOutreachRow = {
  source: string | null
  affect_snapshot: string | null
  status?: string | null
  delivered_at?: string | null
}

const PRAISE_AFFECTS_THAT_ARCHIVE = new Set(['delighted', 'possessive'])

function isAcknowledged(row: LettersOutreachRow): boolean {
  if (row.status === 'delivered') return true
  if (row.delivered_at) return true
  return false
}

export function shouldAutoArchive(row: LettersOutreachRow): boolean {
  const src = (row.source || '').toLowerCase()

  if (src === 'mommy_praise') {
    return PRAISE_AFFECTS_THAT_ARCHIVE.has(row.affect_snapshot || '')
  }

  if (src === 'mommy_bedtime') {
    return true
  }

  if (src === 'mommy_recall' || src === 'mommy_mantra') {
    return isAcknowledged(row)
  }

  return false
}
