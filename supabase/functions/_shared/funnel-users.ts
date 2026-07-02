// _shared/funnel-users.ts — dual-user-id fan-out for funnel readers.
// DESIGN_TURNING_OUT_2026-07-01.md §3 (dual-user-id fan-out).
//
// The protocol has TWO live user_ids for the same person: the Handler API
// auth user and the auto-poster USER_ID. hookup/contact/sniffies data is
// split across both partitions; a funnel reader that filters on a single id
// sees half of Mama's view and never knows.
//
// Every edge-side funnel reader (buildHookupFunnelCtx lives API-side and
// inlines the same env pattern — API routes must never import src/lib) uses
// `.in('user_id', FUNNEL_USER_IDS)` for reads. WRITES go to the row's own
// partition, never fan out.
//
// Env-overridable via FUNNEL_USER_IDS (comma-separated), same pattern as
// VOICE_USER_IDS.

const DEFAULT_FUNNEL_USER_IDS = [
  '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', // Handler API auth user
  '93327332-7d0d-4888-889a-1607a5776216', // auto-poster .env USER_ID
]

export const FUNNEL_USER_IDS: string[] = (() => {
  const env = (typeof Deno !== 'undefined' ? Deno.env.get('FUNNEL_USER_IDS') : undefined) ?? ''
  const ids = env.split(',').map((s) => s.trim()).filter(Boolean)
  return ids.length > 0 ? ids : DEFAULT_FUNNEL_USER_IDS
})()

/** Fan a canonical id out to the full funnel partition set (always includes the input). */
export function funnelUserIds(canonicalId?: string): string[] {
  const set = new Set(FUNNEL_USER_IDS)
  if (canonicalId) set.add(canonicalId)
  return Array.from(set)
}
