// Client-side helpers for the "life as a woman" surfaces.
//
// All writes go through supabase-js with the authenticated user; RLS
// owner-only policies enforce who can read/write what. Functions return
// typed rows; errors propagate to the caller.

import { supabase } from '../supabase'
import type {
  LifeAsWomanSettings, SniffiesDraft, HypnoTranceSession,
  GooningSession, MommyEditorialNote, MommyContentPrompt, TranceTrigger,
} from './types'

// ─── Settings ──────────────────────────────────────────────────────────
export async function loadSettings(userId: string): Promise<LifeAsWomanSettings | null> {
  const { data, error } = await supabase
    .from('life_as_woman_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[life-as-woman] loadSettings failed', error.message)
    return null
  }
  return (data as LifeAsWomanSettings | null) ?? null
}

export async function upsertSettings(
  userId: string,
  patch: Partial<LifeAsWomanSettings>,
): Promise<LifeAsWomanSettings | null> {
  const { data, error } = await supabase
    .from('life_as_woman_settings')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle()
  if (error) {
    console.warn('[life-as-woman] upsertSettings failed', error.message)
    return null
  }
  return (data as LifeAsWomanSettings | null) ?? null
}

// ─── Sniffies ──────────────────────────────────────────────────────────
export async function loadPendingSniffiesDrafts(userId: string): Promise<SniffiesDraft[]> {
  const { data, error } = await supabase
    .from('sniffies_outbound_drafts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    console.warn('[life-as-woman] loadPendingSniffiesDrafts failed', error.message)
    return []
  }
  return (data || []) as SniffiesDraft[]
}

/**
 * Mark a sniffies draft as sent. CLIENT-SIDE ONLY — there is no auto-send
 * to Sniffies; this records that the user clicked Send (and is expected
 * to have manually pasted the text into the Sniffies app). The
 * clear-headed gate is enforced by the caller before invoking this.
 */
export async function markSniffiesDraftSent(draftId: string): Promise<boolean> {
  const { error } = await supabase
    .from('sniffies_outbound_drafts')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', draftId)
  if (error) {
    console.warn('[life-as-woman] markSniffiesDraftSent failed', error.message)
    return false
  }
  return true
}

export async function discardSniffiesDraft(draftId: string, reason?: string): Promise<boolean> {
  const { error } = await supabase
    .from('sniffies_outbound_drafts')
    .update({ status: 'discarded', discard_reason: reason ?? null })
    .eq('id', draftId)
  if (error) {
    console.warn('[life-as-woman] discardSniffiesDraft failed', error.message)
    return false
  }
  return true
}

// ─── Trance ────────────────────────────────────────────────────────────
export async function loadTodayTranceSession(
  userId: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<HypnoTranceSession | null> {
  const { data, error } = await supabase
    .from('hypno_trance_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_date', date)
    .maybeSingle()
  if (error) {
    console.warn('[life-as-woman] loadTodayTranceSession failed', error.message)
    return null
  }
  return (data as HypnoTranceSession | null) ?? null
}

export async function loadTranceTriggers(userId: string): Promise<TranceTrigger[]> {
  const { data, error } = await supabase
    .from('trance_triggers')
    .select('*')
    .eq('user_id', userId)
    .order('exposure_count', { ascending: false })
    .limit(30)
  if (error) {
    console.warn('[life-as-woman] loadTranceTriggers failed', error.message)
    return []
  }
  return (data || []) as TranceTrigger[]
}

export async function markTranceSessionStatus(
  id: string,
  status: HypnoTranceSession['status'],
  extra?: Record<string, unknown>,
): Promise<boolean> {
  const patch: Record<string, unknown> = { status, ...extra }
  if (status === 'in_progress') patch.started_at = new Date().toISOString()
  if (status === 'completed' || status === 'aborted') patch.completed_at = new Date().toISOString()
  const { error } = await supabase
    .from('hypno_trance_sessions')
    .update(patch)
    .eq('id', id)
  if (error) return false
  return true
}

// ─── Gooning ───────────────────────────────────────────────────────────
export async function loadRecentGooningSessions(userId: string, limit = 5): Promise<GooningSession[]> {
  const { data, error } = await supabase
    .from('gooning_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data || []) as GooningSession[]
}

export async function logGooningEdge(args: {
  session_id: string
  edge_index: number
  hr_spike_bpm?: number
  hr_returned?: boolean
}): Promise<boolean> {
  const fullValue = !!(args.hr_spike_bpm && args.hr_returned)
  const { error } = await supabase
    .from('gooning_edge_events')
    .insert({
      session_id: args.session_id,
      edge_index: args.edge_index,
      hr_spike_bpm: args.hr_spike_bpm ?? null,
      hr_returned: args.hr_returned ?? null,
      full_value: fullValue,
    })
  return !error
}

// ─── Editorial notes ───────────────────────────────────────────────────
export async function loadPendingEditorialNotes(userId: string): Promise<MommyEditorialNote[]> {
  const { data, error } = await supabase
    .from('mommy_editorial_notes')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return []
  return (data || []) as MommyEditorialNote[]
}

export async function acceptEditorialNote(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('mommy_editorial_notes')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

export async function declineEditorialNote(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('mommy_editorial_notes')
    .update({ status: 'declined', declined_at: new Date().toISOString() })
    .eq('id', id)
  return !error
}

// ─── Today's content prompt ────────────────────────────────────────────
export async function loadTodayContentPrompt(
  userId: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<MommyContentPrompt | null> {
  const { data, error } = await supabase
    .from('mommy_content_prompts')
    .select('*')
    .eq('user_id', userId)
    .eq('for_date', date)
    .maybeSingle()
  if (error) return null
  return (data as MommyContentPrompt | null) ?? null
}

// ─── Safeword gate (client-side mirror of is_safeword_active) ──────────
/**
 * Returns TRUE if a safeword event has fired in the last `seconds` seconds.
 * Mirrors the SQL helper. The UI uses this to disable click-to-send
 * buttons within 60s of a safeword.
 */
export async function isSafewordActive(userId: string, seconds = 60): Promise<boolean> {
  const cutoff = new Date(Date.now() - seconds * 1000).toISOString()
  const { data } = await supabase
    .from('meta_frame_breaks')
    .select('id')
    .eq('user_id', userId)
    .eq('triggered_by', 'safeword')
    .gte('created_at', cutoff)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

/**
 * Returns TRUE if the user is currently mid-intense-scene.
 * Heuristic: open aftercare_sessions row OR very recent distortion event.
 * The click-to-send buttons consult this for the 60-second cooldown.
 */
export async function isInIntenseScene(userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString()
  const [aftercare, distortion] = await Promise.all([
    supabase.from('aftercare_sessions')
      .select('id').eq('user_id', userId).is('exited_at', null).limit(1),
    supabase.from('mommy_distortion_log')
      .select('id').eq('user_id', userId).gte('created_at', cutoff).limit(1),
  ])
  return ((aftercare.data || []).length > 0) || ((distortion.data || []).length > 0)
}
