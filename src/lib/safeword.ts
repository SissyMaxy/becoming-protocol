// Safeword latch — client helpers for the resume affordance.
//
// A safeword or panic gesture LATCHES via `safeword_latches` (mig 627):
// no timer expiry, and `conditioning_gate`/`enforcement_gate` deny every
// gated system (goon, machine, paid_monetization, temptation, recondition,
// turnout) for as long as the latch stays open. The only way out is the
// explicit `resume_from_safeword()` RPC — until this session, nothing in
// the app ever called it, so one safeword permanently stopped the whole
// protocol. This is the missing call site.

import { supabase } from './supabase'

export interface OpenSafewordLatch {
  id: string
  latchedAt: string
  source: string
}

export async function getOpenSafewordLatch(userId: string): Promise<OpenSafewordLatch | null> {
  const { data, error } = await supabase
    .from('safeword_latches')
    .select('id, latched_at, source')
    .eq('user_id', userId)
    .is('resumed_at', null)
    .order('latched_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return { id: data.id as string, latchedAt: data.latched_at as string, source: data.source as string }
}

// Stamps resumed_at + the 24h resume ramp (anti-circumvention restores
// intensities to 3, not 5, for that window — already wired downstream).
export async function resumeFromSafeword(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('resume_from_safeword', { p_user: userId })
  if (error) return false
  return data === true
}
