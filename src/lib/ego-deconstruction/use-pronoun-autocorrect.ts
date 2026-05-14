// React hook wrapping pronoun autocorrect for input components.
//
// Returns:
//   - a `transform(value)` you call from your onChange handler before
//     setState. Returns the (possibly autocorrected) value.
//   - a `recordDispute(originalText)` you call when the user reverts an
//     autocorrect within the dispute window.
//   - `mode`, the live setting from life_as_woman_settings.
//
// Logging:
//   - Every autocorrect application writes a pronoun_autocorrect_events
//     row (fire-and-forget).
//   - Disputes additionally write a slip_log row with
//     slip_type='self_pronoun_dispute'.

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import {
  AutocorrectMode,
  AutocorrectResult,
  autocorrect,
  detectDispute,
} from './pronoun-autocorrect'

export type AutocorrectSurface = 'chat' | 'confession' | 'journal' | 'sniffies' | 'other'

export interface UsePronounAutocorrectOpts {
  userId?: string
  surface: AutocorrectSurface
  fallbackMode?: AutocorrectMode
}

interface State {
  mode: AutocorrectMode
  loaded: boolean
}

export function usePronounAutocorrect(opts: UsePronounAutocorrectOpts) {
  const [state, setState] = useState<State>({ mode: opts.fallbackMode ?? 'off', loaded: false })
  const lastResultRef = useRef<AutocorrectResult | null>(null)

  useEffect(() => {
    if (!opts.userId) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('life_as_woman_system_active')
        .select('ego_pronoun_autocorrect_active, ego_pronoun_autocorrect_mode')
        .eq('user_id', opts.userId!)
        .maybeSingle()
      if (cancelled) return
      const row = data as { ego_pronoun_autocorrect_active?: boolean; ego_pronoun_autocorrect_mode?: AutocorrectMode } | null
      const active = Boolean(row?.ego_pronoun_autocorrect_active)
      const mode = active ? (row?.ego_pronoun_autocorrect_mode ?? 'soft_suggest') : 'off'
      setState({ mode, loaded: true })
    })()
    return () => { cancelled = true }
  }, [opts.userId])

  const logApplication = useCallback(async (r: AutocorrectResult) => {
    if (!opts.userId || r.changes.length === 0) return
    try {
      await supabase.from('pronoun_autocorrect_events').insert({
        user_id: opts.userId,
        surface: opts.surface,
        original_text: r.original.slice(0, 2000),
        corrected_text: r.corrected.slice(0, 2000),
        pronoun_pairs: r.changes.map(c => ({ from: c.from, to: c.to, rule: c.rule })),
        mode: state.mode === 'off' ? 'soft_suggest' : state.mode,
      })
    } catch {
      // never block typing on log failure
    }
  }, [opts.userId, opts.surface, state.mode])

  /** Call from onChange before setState. Returns the autocorrected value
   *  (or original if mode is off / soft_suggest). For soft_suggest, the
   *  caller can show suggestions from `lastResultRef.current.changes`
   *  rather than auto-applying. */
  const transform = useCallback((value: string): string => {
    if (!state.loaded || state.mode === 'off') return value
    const r = autocorrect(value, state.mode)
    lastResultRef.current = r
    if (state.mode === 'soft_suggest') {
      // do not mutate; caller may show suggestions
      return value
    }
    if (r.changes.length > 0) {
      void logApplication(r)
    }
    return r.corrected
  }, [state.loaded, state.mode, logApplication])

  /** Record a dispute when the user undoes an autocorrect. Pass the
   *  current text after the undo. */
  const recordDispute = useCallback(async (currentText: string) => {
    if (!opts.userId) return
    const prior = lastResultRef.current
    if (!prior) return
    const d = detectDispute(prior.corrected, currentText, prior.changes)
    if (!d) return
    try {
      // 1. slip log
      const { data: slip } = await supabase.from('slip_log').insert({
        user_id: opts.userId,
        slip_type: 'self_pronoun_dispute',
        slip_points: 1,
        source_text: currentText.slice(0, 500),
        source_table: 'pronoun_autocorrect_events',
        metadata: { rule: d.rule, reverted_to: d.reverted_to, surface: opts.surface },
      }).select('id').single()
      // 2. mark the most recent pronoun event as disputed
      const { data: latestEvent } = await supabase
        .from('pronoun_autocorrect_events')
        .select('id')
        .eq('user_id', opts.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestEvent) {
        await supabase.from('pronoun_autocorrect_events').update({
          user_action: 'disputed_undo',
          slip_id: (slip as { id: string } | null)?.id ?? null,
          resolved_at: new Date().toISOString(),
        }).eq('id', (latestEvent as { id: string }).id)
      }
    } catch {
      // never block typing
    }
  }, [opts.userId, opts.surface])

  return {
    mode: state.mode,
    loaded: state.loaded,
    transform,
    recordDispute,
    lastChanges: lastResultRef.current?.changes ?? [],
  }
}
