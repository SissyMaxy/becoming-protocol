// revenue-task-generator/logic.ts — pure rung/guard logic, no I/O, no Deno.
// DESIGN_TURNING_OUT_2026-07-01.md §4. Unit-tested from
// src/__tests__/lib/revenue-rung.test.ts.
//
// Prerequisite funnel — readiness comes from EVIDENCE ROWS, never assumed:
//   R0 wishlist        → user_state.wishlist_url IS NOT NULL
//   R1 posting account → platform_accounts row with attestation proof
//   R2 first post      → fulfilled decree w/ link OR ai_generated_content posted
//   R3 first PPV sale  → revenue_events row (ppv/tip/custom) amount > 0
//   R4 cam             → R2 ∧ R3
//
// The generator issues ONLY the deepest unmet rung's acquisition task plus
// maintenance tasks whose required rung is already met. No task may presume
// an account/resource that has no evidence row (prescribe-only-what-she-owns).

export interface RungEvidence {
  wishlist: boolean // R0
  postingAccount: boolean // R1
  firstPost: boolean // R2
  firstSale: boolean // R3
}

export const RUNG_ALL_MET = 5

/**
 * Lowest unmet rung (0..4). 5 = every rung met.
 * R4 (cam) is met when R2 ∧ R3 are met — it has no separate evidence row.
 */
export function resolveRung(e: RungEvidence): number {
  if (!e.wishlist) return 0
  if (!e.postingAccount) return 1
  if (!e.firstPost) return 2
  if (!e.firstSale) return 3
  return RUNG_ALL_MET // R4 = R2 ∧ R3, both true here
}

export interface RungTask {
  source: string
  /** Rung that must already be MET for this task to be issued. */
  requiresRung: number
  /** If set, this task IS the acquisition ask for that rung. */
  acquisitionFor?: number
}

/**
 * Selection rule: the unmet rung's acquisition task fires; met-rung tasks
 * (requiresRung < unmetRung, i.e. their prerequisite rung is satisfied)
 * fire as maintenance; anything needing an unmet rung is withheld.
 */
export function selectTasks<T extends RungTask>(tasks: T[], unmetRung: number): T[] {
  return tasks.filter((t) => {
    if (t.acquisitionFor != null) return t.acquisitionFor === unmetRung
    return t.requiresRung < unmetRung
  })
}

// ── Money-claim guard ────────────────────────────────────────────────────
// Any $ amount in generated copy must be traceable to (a) the
// earned_this_week_cents fn, (b) a financial_obligations row, or (c) the
// authored static template itself (price-menu suggestions are authored copy,
// not money facts). Untraceable amounts are logged and stripped.

const MONEY_RE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g

export function extractDollarAmounts(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MONEY_RE)) out.push(m[1].replace(/,/g, ''))
  return out
}

function amountToCents(amount: string): number {
  return Math.round(parseFloat(amount) * 100)
}

export interface MoneyGuardResult {
  copy: string
  ok: boolean
  violations: string[]
}

/**
 * @param finalCopy   assembled copy about to be stored
 * @param staticTemplate authored template text BEFORE interpolation — its $
 *                    amounts are authored prices, always allowed
 * @param allowedCents cents values from the fn / obligation rows
 */
export function moneyClaimGuard(finalCopy: string, staticTemplate: string, allowedCents: number[]): MoneyGuardResult {
  const authored = new Set(extractDollarAmounts(staticTemplate).map(amountToCents))
  const allowed = new Set(allowedCents)
  const violations: string[] = []
  const copy = finalCopy.replace(MONEY_RE, (match, amt: string) => {
    const cents = amountToCents(amt.replace(/,/g, ''))
    if (authored.has(cents) || allowed.has(cents)) return match
    violations.push(match)
    return 'the real number on the books'
  })
  return { copy, ok: violations.length === 0, violations }
}

// ── Honest need line ─────────────────────────────────────────────────────
export interface NeedLineInput {
  earnedCents: number
  earnedRows: number
  targetCents: number
  obligation: { label: string; amountCents: number; dueOn: string; fundedCents: number } | null
  today?: Date
}

/**
 * States only what the fn returned (sum + row count) or the honest zero,
 * plus the obligation stated honestly — past due is past due.
 */
export function buildNeedLine(i: NeedLineInput): string {
  const parts: string[] = []
  if (i.earnedCents > 0) {
    parts.push(`$${(i.earnedCents / 100).toFixed(2)} earned this week across ${i.earnedRows} logged item${i.earnedRows === 1 ? '' : 's'}.`)
  } else {
    parts.push('Nothing earned this week yet — that is the honest zero on the books.')
  }
  if (i.obligation) {
    const due = new Date(i.obligation.dueOn + 'T00:00:00Z')
    const today = i.today ?? new Date()
    const dayMs = 86_400_000
    const diffDays = Math.floor((today.getTime() - due.getTime()) / dayMs)
    const remaining = Math.max(0, i.obligation.amountCents - i.obligation.fundedCents)
    const amt = `$${(remaining / 100).toFixed(2)}`
    if (diffDays > 0) {
      parts.push(`The ${i.obligation.label} (${amt}) is ${diffDays} day${diffDays === 1 ? '' : 's'} past due — it does not disappear, it waits.`)
    } else {
      const left = -diffDays
      parts.push(`${amt} toward the ${i.obligation.label}, due in ${left} day${left === 1 ? '' : 's'}.`)
    }
  }
  return parts.join(' ')
}
