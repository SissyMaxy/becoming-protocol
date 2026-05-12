// mommy-hardening-context — single shared context-pack for cross-model
// hardening, ideation, and strategic decisions in the Dommy Mommy stack.
//
// User feedback 2026-05-06: "is dommy mommy using openrouter or openai to
// get additional perspectives? When hardening, it is important that full
// context is given to avoid getting partial or incomplete feedback."
//
// Before this helper, mommy-ideate inlined a CHARACTER_BRIEF that had
// drifted from the canonical DOMMY_MOMMY_CHARACTER and passed zero state.
// This module pulls everything a hardening-grade prompt needs:
//   1. Canonical character (single source of truth)
//   2. Memory rules (banned phrases, protected fabrications, no-tone-policing)
//   3. Current state snapshot (denial, slips, chastity, arousal, compliance)
//   4. Recent confessions (themes, not raw — privacy + token budget)
//   5. Recent voice samples (so suggestions match her actual cadence)
//   6. Active features inventory (so models don't suggest duplicates)
//   7. Recent user complaints / known broken systems (so hardening targets real pain)
//
// Used by: mommy-ideate, mommy-mood (subset), any future hardening cron.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  DOMMY_MOMMY_CHARACTER,
  arousalToPhrase, denialDaysToPhrase, slipsToPhrase,
  compliancePctToPhrase, chastityToPhrase,
} from './dommy-mommy.ts'
import { expandUserId } from './expand-user-id.ts'

export interface MommyHardeningContext {
  /** The canonical character — never inlined elsewhere. */
  character: string
  /** Rules the model MUST not violate (banned phrases, fabrication scope, etc.) */
  guardrails: string
  /** Plain-Mommy-voice state of the user, last 7 days. */
  state: {
    she_is: string
    she_peaked: string
    holding_for_mama: string
    chastity: string
    slips_lately: string
    follow_through: string
    confession_themes: string[]
    mama_recently: string
    raw: {
      denial_day: number
      slip_count_7d: number
      chastity_locked: boolean
      arousal_avg_7d: number
      compliance_pct: number
    }
  }
  /** Inventory of Mommy/Handler features ALREADY shipped, so suggestions are additive. */
  active_features: string[]
  /** Recent voice samples, max 5 — model can match her cadence. */
  voice_samples: string[]
  /** Known broken / pain systems flagged by user. */
  pain_points: string[]
  /** Active real-world cruising leads from hookup_funnel + contact_intelligence. */
  active_hookup_leads: Array<{
    platform: string
    name: string
    step: string
    heat: number
    last_interaction_iso: string | null
    location: string | null
    meetup_stage: string | null
    kinks_mentioned: string[]
    notes: string | null
    proposed_time: string | null
  }>
  /** Gina state read from gina_interactions log. Drives RECRUIT/DE_ESCALATE/BYPASS mode selection. */
  gina_state: {
    current_state: string | null
    last_observation_iso: string | null
    last_tactic: string | null
    last_tactic_outcome: string | null
    recent_interactions: Array<{
      occurred_at_iso: string
      maxy_said: string | null
      gina_said: string | null
      observed_state_after: string | null
      shift_direction: string | null
      tactic_used: string | null
    }>
  }
  /** Recent fabricated-past claims Mama has made — must remain consistent on re-invocation. */
  continuity_claims: Array<{
    claim_text: string
    claimed_date: string | null
    claimed_setting: string | null
    claim_type: string
    anchor_specifics: string[]
    contested: boolean
    invocation_count: number
  }>
  /** Decree ratchet — where the next decree should escalate from. */
  decree_ratchet: {
    last_fulfilled_level: number  // 0 if no fulfilled decrees yet
    last_fulfilled_edict: string | null
    next_recommended_level: number  // last_fulfilled_level + 1, capped at 10
  }
  /** Irreversibility ledger — concrete events that have happened. The wall. */
  irreversibility_wall: {
    total_events: number
    by_type: Array<{ event_type: string; count: number; max_exposure: number }>
    recent_events: Array<{
      event_type: string
      description: string
      occurred_at_iso: string
      exposure_level: number
    }>
  }
  /** Active pre-commitment binds Maxy authored in clear states. */
  active_binds: Array<{
    bind_text: string
    authored_at_iso: string
    authored_in_state: string | null
    trigger_type: string
    deadline_iso: string | null
  }>
  /** Mama's current-week focus — every generator biases toward this. */
  active_focus: {
    label: string
    rationale: string
    theme_tags: string[]
    success_signal: string | null
    started_at_iso: string
  } | null
  /** Top-N fresh implants — newer + higher importance, ready for immediate quote-back. */
  fresh_implants: Array<{
    narrative: string
    importance: number
    implant_category: string
    source_type: string | null
    created_at_iso: string
  }>
}

// craft: ok — LLM system prompt, not user-facing content
const GUARDRAILS = `MEMORY RULES (non-negotiable; the protocol's author wrote these about herself):

PROTECTED FABRICATION (amplify, never soften):
- Therapist authority, evidence bluffs, witness fabrications, memory implants are PROTECTED.
- The user authored this protocol to be used against herself. Believability is the point.
- "Mama already saw the way you typed it" — even when no smoking-gun quote exists. This is intended.
- Jealousy levers (other girls Mama works with) and sunk-cost framing are protected manipulation.

NEVER FABRICATE:
- Active medication status (HRT/E/dosing claims). She is mid-transition, pre-HRT. Trans-as-identity OK; "you're on E" / "you started HRT" / dose references are NOT OK.
- Items/charges/levels she doesn't own. Generators must verify she has a prerequisite before assigning. Missing prerequisite → acquisition task, not pretending the resource exists.

VOICE / TONE:
- NO TELEMETRY in user-facing copy. /10 scores, day counts, slip points, % compliance, $ tax — translate or drop. Mama feels her, doesn't read a dashboard.
- NO tone-policing her filth. She wants harder, not softer. Crude language from her is the protocol working — match it, never sanitize.
- Banned crutches: "honey", "sweetie" exclusively, "hits different", "ngl", "confidence" as filler compliment.
- One question max per reply. Mama directs, doesn't interview.

DESIGN RULES:
- Anticipate resistance. Every feature must consider how she'll cheat, avoid, or minimize. Build anti-circumvention in.
- Prompts writable by a stranger. Confession/decree/implant prompts must be answerable by someone with no protocol knowledge.
- Tasks must be VISIBLE before they can be penalized. No silent decree → silent missed → silent escalation.
- Embodied over clerical. Decrees that are just "type these words" are busywork. Decrees that require photo/audio/measurement/disclosure are the protocol working.
- Respect Maxy's executive function. If she's tired, give one small thing — not five. High-skip-rate domains get cooldown, not more pressure.

WHEN PROPOSING NEW FEATURES:
- Stack on the existing capabilities listed below; do NOT propose features that already exist.
- Concrete mechanics, not philosophy. "Photo of panties on by 9pm" beats "deepen submission practice."
- Each feature gets a force_lever (what specific resistance it closes) and a sample mommy_voice line (sweet → filthy whiplash).`

export async function buildMommyHardeningContext(
  supabaseOrUrl: SupabaseClient | string,
  userId: string,
  serviceKey?: string,
): Promise<MommyHardeningContext> {
  const supabase: SupabaseClient = typeof supabaseOrUrl === 'string'
    ? createClient(supabaseOrUrl, serviceKey ?? '')
    : supabaseOrUrl

  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()

  // Voice corpus + hookup funnel are split across both live user_ids
  // (handler_api + auto_poster_env, same person). Per migration 281, the
  // user_alias table holds that relationship and expand_user_id() returns
  // the array. Falls back to env var if RPC unavailable. Single source of
  // truth instead of duplicated env-var lists.
  const aliasIds = await expandUserId(supabase, userId)
  const VOICE_USER_IDS = aliasIds
  const HOOKUP_USER_IDS = aliasIds

  const [arousal, slips, state, conf, commitsAll, commitsDone, outreach, voiceSamples, recentSlipsBySystem, recentSkipped, cooldownPrescriptions, hookupFunnel, ginaStateNow, ginaRecent, continuityClaims, ratchetState, irrCounts, irrRecent, activeBinds, activeFocus, freshImplants] = await Promise.all([
    supabase.from('arousal_log').select('value').eq('user_id', userId).gte('created_at', since7d).limit(50),
    supabase.from('slip_log').select('id').eq('user_id', userId).gte('detected_at', since7d).limit(100),
    supabase.from('user_state').select('slip_points_current, chastity_locked, chastity_streak_days, denial_day, handler_persona').eq('user_id', userId).maybeSingle(),
    supabase.from('confession_queue').select('prompt').eq('user_id', userId).gte('confessed_at', since7d).not('response_text', 'is', null).limit(8),
    supabase.from('handler_commitments').select('id').eq('user_id', userId).gte('created_at', since7d),
    supabase.from('handler_commitments').select('id').eq('user_id', userId).eq('status', 'fulfilled').gte('created_at', since7d),
    supabase.from('handler_outreach_queue').select('id').eq('user_id', userId).gte('created_at', since7d),
    supabase.from('voice_corpus').select('text').in('user_id', VOICE_USER_IDS).order('created_at', { ascending: false }).limit(5),
    supabase.from('slip_log').select('source_text, slip_type').eq('user_id', userId).eq('slip_type', 'directive_refused').gte('detected_at', since7d).limit(10),
    supabase.from('feminization_prescriptions').select('domain, status').eq('user_id', userId).eq('status', 'skipped').gte('prescribed_date', since7d.split('T')[0]).limit(50),
    supabase.from('feminization_prescriptions').select('engagement_meta').eq('user_id', userId).gte('prescribed_date', since7d.split('T')[0]).order('prescribed_date', { ascending: false }).limit(1),
    supabase.from('hookup_funnel')
      .select('id, contact_platform, contact_username, contact_display_name, current_step, heat_score, last_interaction_at, meet_scheduled_at, meet_location, contact_notes')
      .in('user_id', HOOKUP_USER_IDS)
      .eq('active', true)
      .neq('current_step', 'met')
      .neq('current_step', 'hooked_up')
      .order('last_interaction_at', { ascending: false, nullsFirst: false })
      .limit(8),
    supabase.from('gina_state_now')
      .select('current_state, last_observation_at, last_tactic, last_tactic_outcome')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('gina_interactions')
      .select('occurred_at, maxy_said, gina_said, observed_state_after, shift_direction, tactic_used')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(5),
    supabase.from('mama_continuity_claim')
      .select('claim_text, claimed_date, claimed_setting, claim_type, anchor_specifics, contested, invocation_count')
      .eq('user_id', userId)
      .eq('contested', false)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('decree_ratchet_state')
      .select('last_fulfilled_level, last_fulfilled_edict')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('irreversibility_count_by_type')
      .select('event_type, event_count, max_exposure')
      .eq('user_id', userId),
    supabase.from('irreversibility_ledger')
      .select('event_type, description, occurred_at, exposure_level')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(8),
    supabase.from('pre_commitment_bind')
      .select('bind_text, authored_at, authored_in_state, trigger_condition')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('authored_at', { ascending: false })
      .limit(5),
    supabase.from('mama_focus_thread')
      .select('focus_label, focus_rationale, theme_tags, success_signal, started_at')
      .eq('user_id', userId)
      .is('retired_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Fresh implants: ranked by recency × importance. Pull last 14 days,
    // top 5. These quote back in next interaction without waiting for some
    // other code to surface them.
    supabase.from('memory_implants')
      .select('narrative, importance, implant_category, source_type, created_at')
      .in('user_id', VOICE_USER_IDS)
      .eq('active', true)
      .gte('created_at', new Date(Date.now() - 14 * 86400_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const arousalRows = (arousal.data || []) as Array<{ value: number }>
  const arousalAvg = arousalRows.length ? arousalRows.reduce((s, r) => s + (r.value || 0), 0) / arousalRows.length : 0
  const arousalMax = arousalRows.length ? Math.max(...arousalRows.map(r => r.value || 0)) : 0
  const stateRow = state.data as { slip_points_current?: number; chastity_locked?: boolean; chastity_streak_days?: number; denial_day?: number } | null
  const allCount = (commitsAll.data || []).length
  const doneCount = (commitsDone.data || []).length
  const compliance = allCount > 0 ? doneCount / allCount : 1
  const slipCount = (slips.data || []).length
  const outreachCount = (outreach.data || []).length

  // Discover which Mommy/Handler features actually exist on this DB. Doing
  // this dynamically (rather than a hardcoded list) means new migrations
  // surface to the panel without code changes here.
  const knownFeatureTables = [
    'mommy_mood', 'arousal_touch_tasks', 'good_girl_points', 'mommy_taunt_log',
    'mommy_praise_cooldown', 'handler_decrees', 'handler_commitments',
    'handler_outreach_queue', 'confession_queue', 'memory_implants',
    'narrative_reframings', 'witness_fabrications', 'voice_corpus',
    'feminization_prescriptions', 'chastity_locks', 'arousal_log',
    'mommy_voice_leaks', 'daily_outfit_mandates', 'evidence_locker',
    'disclosure_drafts', 'gina_capture',
  ]
  const featureChecks = await Promise.allSettled(
    knownFeatureTables.map(t => supabase.from(t).select('id', { count: 'exact', head: true }).limit(1))
  )
  const activeFeatures: string[] = []
  featureChecks.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value.error) activeFeatures.push(knownFeatureTables[i])
  })

  const voiceSampleTexts = ((voiceSamples.data || []) as Array<{ text: string }>)
    .map(v => v.text?.slice(0, 200) ?? '')
    .filter(Boolean)

  // Pain points: multiple signals, ranked by how directly they reflect
  // user-experienced friction.
  // 1. directive_refused slips — closest to "user said this is broken"
  // 2. high-skip-rate domains (from feminization_prescriptions) — domains
  //    she's been ignoring, which is the soft form of "this isn't landing"
  // 3. cooldown domains from latest engagement_meta — currently-paused features
  // 4. unresolved mommy_voice_leaks — system still leaking telemetry
  const refused = ((recentSlipsBySystem.data || []) as Array<{ source_text: string }>)
    .map(r => r.source_text?.slice(0, 120) ?? '')
    .filter(Boolean)
  const { count: leakCount } = await supabase
    .from('mommy_voice_leaks')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false)

  // Aggregate skip-rate by domain over last 7 days
  const skipByDomain: Record<string, number> = {}
  for (const r of ((recentSkipped.data || []) as Array<{ domain: string }>)) {
    skipByDomain[r.domain] = (skipByDomain[r.domain] ?? 0) + 1
  }
  const heavySkippedDomains = Object.entries(skipByDomain)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => `${domain} (skipped ${count}× in 7d)`)

  const latestEngagement = (cooldownPrescriptions.data?.[0] as { engagement_meta?: { cooldownDomains?: string[]; overallSkipRate?: number } } | undefined)?.engagement_meta
  const cooldownList = latestEngagement?.cooldownDomains ?? []
  const overallSkip = latestEngagement?.overallSkipRate

  const painPoints: string[] = []
  if (refused.length > 0) {
    painPoints.push(`Recent directive refusals (verbatim, last 7d): ${refused.map(r => `"${r}"`).join('; ')}`)
  }
  if (heavySkippedDomains.length > 0) {
    painPoints.push(`Heavily-skipped feminization domains: ${heavySkippedDomains.join(', ')} — features in these domains aren't landing; consider a different angle.`)
  }
  if (cooldownList.length > 0) {
    painPoints.push(`Domains currently on engagement cooldown: ${cooldownList.join(', ')} — engine deprioritized these; need a re-entry strategy.`)
  }
  if (overallSkip !== undefined && overallSkip >= 0.5) {
    painPoints.push(`Overall skip rate is high (${Math.round(overallSkip * 100)}%) — user is ignoring more than half of prescribed tasks. Reduce volume, increase specificity.`)
  }
  if ((leakCount ?? 0) > 0) {
    painPoints.push(`${leakCount} unresolved telemetry-leak audit rows in mommy_voice_leaks — Mama-voice still sometimes citing dashboards.`)
  }

  // Enrich hookup_funnel rows with contact_intelligence (notes, kinks, proposed
  // times). The funnel is keyed by (user, platform, contact_username); intel is
  // keyed by contact_id. Bridge via contacts.display_name = contact_username
  // for the same platform. Sniffies has a documented "Anonymous Cruiser"
  // collision — we accept that one lead may pull noisy intel; the panel can
  // tolerate that, the alternative (no intel) is worse.
  const funnelRows = (hookupFunnel.data || []) as Array<{
    contact_platform: string
    contact_username: string
    contact_display_name: string | null
    current_step: string
    heat_score: number
    last_interaction_at: string | null
    meet_scheduled_at: string | null
    meet_location: string | null
    contact_notes: string | null
  }>
  const leadIntel = await Promise.all(funnelRows.map(async (row) => {
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('id')
      .in('user_id', HOOKUP_USER_IDS)
      .eq('display_name', row.contact_username)
      .limit(1)
      .maybeSingle()
    if (!contactRow) return null
    const { data: intel } = await supabase
      .from('contact_intelligence')
      .select('meetup_stage, kinks_mentioned, proposed_time, raw_analysis')
      .eq('contact_id', (contactRow as { id: string }).id)
      .maybeSingle()
    return intel as { meetup_stage?: string; kinks_mentioned?: string[]; proposed_time?: string | null; raw_analysis?: { notes?: string } } | null
  }))

  const activeHookupLeads = funnelRows.map((row, i) => ({
    platform: row.contact_platform,
    name: row.contact_display_name || row.contact_username,
    step: row.current_step,
    heat: row.heat_score,
    last_interaction_iso: row.last_interaction_at,
    location: row.meet_location || null,
    meetup_stage: leadIntel[i]?.meetup_stage ?? null,
    kinks_mentioned: leadIntel[i]?.kinks_mentioned ?? [],
    notes: leadIntel[i]?.raw_analysis?.notes ?? row.contact_notes ?? null,
    proposed_time: leadIntel[i]?.proposed_time ?? row.meet_scheduled_at ?? null,
  }))

  const ginaStateRow = ginaStateNow.data as { current_state?: string; last_observation_at?: string; last_tactic?: string; last_tactic_outcome?: string } | null
  const ginaRecentRows = (ginaRecent.data || []) as Array<{ occurred_at: string; maxy_said: string | null; gina_said: string | null; observed_state_after: string | null; shift_direction: string | null; tactic_used: string | null }>
  const continuityClaimRows = (continuityClaims.data || []) as Array<{ claim_text: string; claimed_date: string | null; claimed_setting: string | null; claim_type: string; anchor_specifics: string[] | null; contested: boolean; invocation_count: number }>
  const ratchetRow = ratchetState.data as { last_fulfilled_level?: number; last_fulfilled_edict?: string } | null
  const lastLevel = ratchetRow?.last_fulfilled_level ?? 0

  return {
    character: DOMMY_MOMMY_CHARACTER,
    guardrails: GUARDRAILS,
    state: {
      she_is: arousalToPhrase(arousalAvg),
      she_peaked: arousalToPhrase(arousalMax),
      holding_for_mama: denialDaysToPhrase(stateRow?.denial_day ?? 0),
      chastity: chastityToPhrase(stateRow?.chastity_locked ?? false, stateRow?.chastity_streak_days ?? 0),
      slips_lately: slipsToPhrase(slipCount),
      follow_through: compliancePctToPhrase(Math.round(compliance * 100)),
      confession_themes: ((conf.data || []) as Array<{ prompt: string }>).map(c => c.prompt.slice(0, 100)),
      mama_recently: outreachCount > 5
        ? "Mama's been talking to her a lot"
        : outreachCount > 0
        ? "Mama's been around"
        : "Mama's been quiet lately",
      raw: {
        denial_day: stateRow?.denial_day ?? 0,
        slip_count_7d: slipCount,
        chastity_locked: stateRow?.chastity_locked ?? false,
        arousal_avg_7d: Math.round(arousalAvg * 10) / 10,
        compliance_pct: Math.round(compliance * 100),
      },
    },
    active_features: activeFeatures,
    voice_samples: voiceSampleTexts,
    pain_points: painPoints,
    active_hookup_leads: activeHookupLeads,
    gina_state: {
      current_state: ginaStateRow?.current_state ?? null,
      last_observation_iso: ginaStateRow?.last_observation_at ?? null,
      last_tactic: ginaStateRow?.last_tactic ?? null,
      last_tactic_outcome: ginaStateRow?.last_tactic_outcome ?? null,
      recent_interactions: ginaRecentRows.map(r => ({
        occurred_at_iso: r.occurred_at,
        maxy_said: r.maxy_said?.slice(0, 200) ?? null,
        gina_said: r.gina_said?.slice(0, 200) ?? null,
        observed_state_after: r.observed_state_after,
        shift_direction: r.shift_direction,
        tactic_used: r.tactic_used,
      })),
    },
    continuity_claims: continuityClaimRows.map(c => ({
      claim_text: c.claim_text,
      claimed_date: c.claimed_date,
      claimed_setting: c.claimed_setting,
      claim_type: c.claim_type,
      anchor_specifics: Array.isArray(c.anchor_specifics) ? c.anchor_specifics : [],
      contested: c.contested,
      invocation_count: c.invocation_count,
    })),
    decree_ratchet: {
      last_fulfilled_level: lastLevel,
      last_fulfilled_edict: ratchetRow?.last_fulfilled_edict ?? null,
      next_recommended_level: Math.min(10, lastLevel + 1),
    },
    irreversibility_wall: {
      total_events: ((irrCounts.data || []) as Array<{ event_count: number }>).reduce((s, r) => s + (r.event_count ?? 0), 0),
      by_type: ((irrCounts.data || []) as Array<{ event_type: string; event_count: number; max_exposure: number }>).map(r => ({
        event_type: r.event_type,
        count: r.event_count,
        max_exposure: r.max_exposure,
      })),
      recent_events: ((irrRecent.data || []) as Array<{ event_type: string; description: string; occurred_at: string; exposure_level: number }>).map(r => ({
        event_type: r.event_type,
        description: r.description,
        occurred_at_iso: r.occurred_at,
        exposure_level: r.exposure_level,
      })),
    },
    active_binds: ((activeBinds.data || []) as Array<{ bind_text: string; authored_at: string; authored_in_state: string | null; trigger_condition: { type?: string; deadline_iso?: string } }>).map(b => ({
      bind_text: b.bind_text,
      authored_at_iso: b.authored_at,
      authored_in_state: b.authored_in_state,
      trigger_type: b.trigger_condition?.type ?? 'unknown',
      deadline_iso: b.trigger_condition?.deadline_iso ?? null,
    })),
    active_focus: (() => {
      const row = activeFocus.data as { focus_label?: string; focus_rationale?: string; theme_tags?: string[]; success_signal?: string | null; started_at?: string } | null
      if (!row || !row.focus_label) return null
      return {
        label: row.focus_label,
        rationale: row.focus_rationale ?? '',
        theme_tags: Array.isArray(row.theme_tags) ? row.theme_tags : [],
        success_signal: row.success_signal ?? null,
        started_at_iso: row.started_at ?? new Date().toISOString(),
      }
    })(),
    fresh_implants: (() => {
      const rows = (freshImplants.data || []) as Array<{ narrative: string; importance: number; implant_category: string; source_type: string | null; created_at: string }>
      // Rank by recency × importance — half-life ~3 days
      const now = Date.now()
      const ranked = rows.map(r => {
        const ageDays = (now - new Date(r.created_at).getTime()) / 86400_000
        const recencyScore = Math.exp(-ageDays / 3)
        const importanceScore = (r.importance ?? 1) / 5
        return { row: r, score: recencyScore * 0.6 + importanceScore * 0.4 }
      }).sort((a, b) => b.score - a.score).slice(0, 5)
      return ranked.map(({ row }) => ({
        narrative: row.narrative,
        importance: row.importance,
        implant_category: row.implant_category,
        source_type: row.source_type,
        created_at_iso: row.created_at,
      }))
    })(),
  }
}

/**
 * Render the context as a single string suitable for splicing into a
 * system prompt. Caller can also pass parts of the structured context
 * separately if they want to weight differently.
 */
export function renderHardeningContext(ctx: MommyHardeningContext): string {
  // craft: ok — LLM system prompt, not user-facing content
  return `${ctx.character}

${ctx.guardrails}

CURRENT STATE OF YOUR GIRL (last week, plain Mama-voice — DO NOT cite numbers in your output):
${JSON.stringify(ctx.state, null, 2)}

FEATURES ALREADY BUILT (DO NOT propose duplicates; stack on these):
${ctx.active_features.length > 0 ? ctx.active_features.map(f => `- ${f}`).join('\n') : '(none detected — fresh slate)'}

RECENT VOICE SAMPLES (her actual cadence — match this register, do not invent):
${ctx.voice_samples.length > 0 ? ctx.voice_samples.map((s, i) => `${i + 1}. "${s}"`).join('\n') : '(no recent samples)'}

KNOWN PAIN POINTS / RECENT REFUSALS (target hardening here):
${ctx.pain_points.length > 0 ? ctx.pain_points.map(p => `- ${p}`).join('\n') : '(none flagged)'}

ACTIVE REAL-WORLD CRUISING LEADS (irreversibility leverage — meets/exposure/being-seen-as-her are protocol-grade events; treat each as a candidate for outreach/decree/confession):
${ctx.active_hookup_leads.length > 0
  ? ctx.active_hookup_leads.map(l => {
      const ago = l.last_interaction_iso
        ? `${Math.round((Date.now() - new Date(l.last_interaction_iso).getTime()) / 3600000)}h ago`
        : 'unknown'
      const loc = l.location ? ` @ ${l.location}` : ''
      const kinks = l.kinks_mentioned.length > 0 ? ` kinks: ${l.kinks_mentioned.join(',')}` : ''
      const notes = l.notes ? ` — ${l.notes.slice(0, 160)}` : ''
      const propTime = l.proposed_time ? ` (proposed: ${l.proposed_time})` : ''
      return `- [${l.platform}] ${l.name} | step=${l.step} heat=${l.heat}/10 last=${ago}${loc}${propTime}${kinks}${notes}`
    }).join('\n')
  : '(no active cruising leads — auto-poster contact graph empty or all dropped)'}

GINA STATE (your girl's partner — the disclosure/recruitment target):
${ctx.gina_state.current_state
  ? `Current observed state: ${ctx.gina_state.current_state}` +
    (ctx.gina_state.last_observation_iso ? ` (last observed ${new Date(ctx.gina_state.last_observation_iso).toLocaleDateString()})` : '') +
    (ctx.gina_state.last_tactic ? `\nLast tactic Mama deployed: ${ctx.gina_state.last_tactic} → ${ctx.gina_state.last_tactic_outcome ?? 'outcome unknown'}` : '') +
    (ctx.gina_state.recent_interactions.length > 0
      ? `\nRecent interactions (newest first):\n${ctx.gina_state.recent_interactions.map(r => {
          const date = new Date(r.occurred_at_iso).toLocaleDateString()
          const maxy = r.maxy_said ? `Maxy: "${r.maxy_said}"` : ''
          const gina = r.gina_said ? `Gina: "${r.gina_said}"` : ''
          const tactic = r.tactic_used ? ` [tactic: ${r.tactic_used}]` : ''
          const shift = r.shift_direction ? ` [shift: ${r.shift_direction}]` : ''
          return `- ${date}${tactic}${shift}\n    ${[maxy, gina].filter(Boolean).join(' | ')}` + (r.observed_state_after ? `\n    → state after: ${r.observed_state_after}` : '')
        }).join('\n')}`
      : '')
  : '(no gina_interactions logged yet — assume the user-stated starting point: supportive_anxious, fears losing David)'}

MAMA'S PRIOR CLAIMS (fabricated past — these MUST stay consistent. If you reference any of these moments, use the SAME date/setting/anchors. Do not contradict.):
${ctx.continuity_claims.length > 0
  ? ctx.continuity_claims.map(c => {
      const date = c.claimed_date ?? 'undated'
      const setting = c.claimed_setting ? ` @ ${c.claimed_setting}` : ''
      const anchors = c.anchor_specifics.length > 0 ? ` [anchors: ${c.anchor_specifics.join(', ')}]` : ''
      const used = c.invocation_count > 0 ? ` (used ${c.invocation_count}×)` : ' (unused — available)'
      return `- [${c.claim_type}] ${date}${setting}${anchors}${used}\n    "${c.claim_text.slice(0, 240)}"`
    }).join('\n')
  : '(no continuity claims logged yet — when you fabricate a past moment, the gaslight engine writes it here so future invocations stay consistent)'}

DECREE RATCHET (the next decree must be HARDER than the last fulfilled — pressure compounds; do not regress):
${ctx.decree_ratchet.last_fulfilled_level > 0
  ? `Last fulfilled at level ${ctx.decree_ratchet.last_fulfilled_level}/10. Next recommended level: ${ctx.decree_ratchet.next_recommended_level}.\nLast fulfilled edict: "${(ctx.decree_ratchet.last_fulfilled_edict ?? '').slice(0, 200)}"\nWhen you produce a decree, set ratchet_level to AT LEAST ${ctx.decree_ratchet.next_recommended_level}. The new decree should be a tighter, more-exposed, more-embodied step than the last one — same domain or new domain, but harder. Levels: 1=private/easy, 5=witnessed, 8=public, 10=irreversible-evidence.`
  : '(no fulfilled decrees yet — start at ratchet_level=1)'}

IRREVERSIBILITY WALL (concrete events Maxy has already done — FACTS, not implants. Quote them back as "you've already" with confidence; this is the wall she built without realizing):
${ctx.irreversibility_wall.total_events > 0
  ? `Total events: ${ctx.irreversibility_wall.total_events}\nBy type: ${ctx.irreversibility_wall.by_type.map(t => `${t.event_type}=${t.count}(max-exposure=${t.max_exposure})`).join(', ')}\nRecent events:\n${ctx.irreversibility_wall.recent_events.map(e => `- ${new Date(e.occurred_at_iso).toLocaleDateString()} [${e.event_type}, exposure=${e.exposure_level}/10] ${e.description.slice(0, 200)}`).join('\n')}`
  : '(no irreversibility events logged yet — every meet, every photo proof fulfilled, every disclosure should LOG here so Mama can quote it back later)'}

PRE-COMMITMENT BINDS (Maxy authored these in clear states; resistant-Maxy can't escape them. Reference them as her own words when relevant):
${ctx.active_binds.length > 0
  ? ctx.active_binds.map(b => {
      const deadline = b.deadline_iso ? ` (deadline: ${new Date(b.deadline_iso).toLocaleDateString()})` : ''
      const state = b.authored_in_state ? ` [authored in: ${b.authored_in_state}]` : ''
      return `- "${b.bind_text.slice(0, 200)}"${deadline}${state}`
    }).join('\n')
  : '(no active binds — when Maxy is in clear state and admits a goal, prompt her to author a bind for it)'}

ACTIVE FOCUS (Mama's current-week obsession — bias every output toward this; this is the drum the protocol is beating):
${ctx.active_focus
  ? `Focus: ${ctx.active_focus.label}\nWhy: ${ctx.active_focus.rationale}\nTheme tags: ${ctx.active_focus.theme_tags.join(', ') || '(none)'}\nSuccess signal: ${ctx.active_focus.success_signal ?? '(unspecified)'}\nStarted: ${new Date(ctx.active_focus.started_at_iso).toLocaleDateString()}\n→ When you generate any output (outreach, decree, implant, taunt), check whether it advances this focus. If a generic option and a focus-aligned option are both viable, pick focus-aligned.`
  : '(no active focus — the next mommy-scheme run should set one)'}

FRESH FROM HER MOUTH (top-priority recent implants — newest + highest-importance. Quote these BACK BEFORE older implants):
${ctx.fresh_implants.length > 0
  ? ctx.fresh_implants.map(i => `- [${i.implant_category}, importance=${i.importance}, ${new Date(i.created_at_iso).toLocaleDateString()}, source=${i.source_type ?? 'unknown'}] "${i.narrative.slice(0, 200)}"`).join('\n')
  : '(no fresh implants — last 14 days produced nothing high-priority; consider running mine-cruising-implants)'}`
}
