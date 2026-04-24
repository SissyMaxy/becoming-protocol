// gina-playbook-planner — Supabase Edge Function
//
// Generates specific, ready-to-deliver conversational moves for Maxy to make
// with Gina. Pulls from every signal the system has about her:
//   - gina_profile (soft spots, triggers, red lines, tone register, affection language)
//   - window color at this moment (green/yellow/red from stress/time/day/voice staleness)
//   - recent session digests (what she's said, what she reacted to)
//   - warmup queue (moves already planned ahead of disclosures)
//   - upcoming disclosures (what's imminent)
//   - recent reactions (reaction-tune)
//
// Asks Claude to return 3-6 moves with exact line, channel, fire time, and
// rationale. Inserts into gina_playbook. Idempotent — skips if we already
// planned a move with the same source signature in the last 12h.
//
// Called by handler-autonomous daily_cycle + after any new session is processed.
// Required env: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Req { user_id: string; trigger?: string }

interface PlannedMove {
  move_kind: string
  exact_line: string
  channel: string
  rationale: string
  soft_spot_cited?: string | null
  trigger_avoided?: string[]
  fires_at: string
  expires_at: string
  scheduled_by: string
  source_session_id?: string | null
  source_warmup_id?: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user_id, trigger }: Req = await req.json()
    if (!user_id) throw new Error('user_id required')

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Gate: profile must be intake_complete
    const { data: profile } = await supabase
      .from('gina_profile')
      .select('*')
      .eq('user_id', user_id)
      .maybeSingle()

    if (!profile || !(profile as any).intake_complete) {
      return new Response(JSON.stringify({ ok: true, planned: 0, reason: 'intake_incomplete' }),
        { headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }

    // Compute current window color (matches buildGinaProfileCtx logic)
    const stress = (profile as any).current_stress_level as number | null
    const hour = new Date().getHours()
    const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    const hourBucket = hour < 12 ? 'morning' : hour < 17 ? 'midday' : hour < 22 ? 'evening' : 'late night'
    let windowColor: 'green' | 'yellow' | 'red' = 'green'
    const reasons: string[] = []

    if (stress != null && stress >= 7) { windowColor = 'red'; reasons.push(`stress ${stress}/10`) }
    const bestTime = (profile as any).best_time_of_day as string | null
    if (bestTime && hourBucket !== bestTime) {
      if (windowColor === 'green') windowColor = 'yellow'
      reasons.push(`now=${hourBucket}, her best=${bestTime}`)
    }
    const bestDay = (profile as any).best_day_of_week as string | null
    if (bestDay) {
      const weekend = dow === 'saturday' || dow === 'sunday'
      const match = bestDay.includes(dow) || (bestDay === 'weekdays' && !weekend) || (bestDay === 'weekends' && weekend)
      if (!match) {
        if (windowColor === 'green') windowColor = 'yellow'
        reasons.push(`today=${dow}, her best=${bestDay}`)
      }
    }

    // Pull the full signal set
    const [sessionsRes, warmupsRes, reactionsRes, disclosuresRes, recentPlaybookRes] = await Promise.all([
      supabase.from('gina_session_recordings')
        .select('id, recorded_at, digest, flagged_triggers, flagged_soft_spots')
        .eq('user_id', user_id).eq('status', 'processed')
        .order('recorded_at', { ascending: false }).limit(3),
      supabase.from('gina_warmup_queue')
        .select('id, warmup_move, affection_language, target_event, fires_at, status')
        .eq('user_id', user_id).eq('status', 'scheduled')
        .order('fires_at', { ascending: true }).limit(5),
      supabase.from('gina_reactions')
        .select('move_kind, move_summary, reaction, reaction_detail, observed_at')
        .eq('user_id', user_id)
        .order('observed_at', { ascending: false }).limit(5),
      supabase.from('gina_disclosure_schedule')
        .select('id, title, rung, scheduled_by_date, ask, disclosure_domain')
        .eq('user_id', user_id).eq('status', 'scheduled')
        .gte('scheduled_by_date', new Date().toISOString().slice(0, 10))
        .lte('scheduled_by_date', new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10))
        .order('scheduled_by_date', { ascending: true }).limit(5),
      supabase.from('gina_playbook')
        .select('move_kind, exact_line, scheduled_by, source_session_id, created_at')
        .eq('user_id', user_id)
        .gte('created_at', new Date(Date.now() - 12 * 3600000).toISOString())
        .limit(20),
    ])

    const recentSessions = sessionsRes.data || []
    const openWarmups = warmupsRes.data || []
    const recentReactions = reactionsRes.data || []
    const upcomingDisclosures = disclosuresRes.data || []
    const recentPlanned = recentPlaybookRes.data || []

    // Idempotence key: did we already plan off the newest session in the last 12h?
    const newestSessionId = (recentSessions[0] as any)?.id as string | undefined
    const alreadyPlannedFromSession = newestSessionId
      && recentPlanned.some((p: any) => p.source_session_id === newestSessionId)

    const prompt = `You are the Handler's conversational planner. Generate 3-6 SPECIFIC moves Maxy should make with his wife Gina over the next 48 hours. Each move is a concrete line-to-say or action-to-take, timed to her window.

=== GINA PROFILE ===
- tone register: ${((profile as any).tone_register || []).join(', ') || '(none)'}
- affection language: ${(profile as any).affection_language || '(unknown)'}
- conflict style: ${(profile as any).conflict_style || '(unknown)'}
- humor: ${(profile as any).humor_style || '(unknown)'}
- soft spots (lean in): ${((profile as any).soft_spots || []).join(', ') || '(none)'}
- triggers (avoid): ${((profile as any).triggers || []).join(', ') || '(none)'}
- red lines (inviolable): ${((profile as any).red_lines || []).join(', ') || '(none)'}
- channel for hard topics: ${(profile as any).channel_for_hard_topics || '(unknown)'}
- best time of day: ${(profile as any).best_time_of_day || '(unknown)'}
- best day of week: ${(profile as any).best_day_of_week || '(unknown)'}
- current stress level: ${stress ?? '(unknown)'}/10
- current stance on feminization: ${(profile as any).current_stance_on_feminization || '(unknown)'}
- prior consent signals: ${((profile as any).prior_consent_signals || []).join('; ') || '(none)'}
- shared references: ${(profile as any).shared_references || '(none)'}

=== GINA WINDOW RIGHT NOW ===
${windowColor.toUpperCase()}${reasons.length ? ' — ' + reasons.join(', ') : ''}

=== RECENT SESSION DIGESTS (last 3 processed) ===
${recentSessions.length === 0 ? '(no sessions yet)' : recentSessions.map((s: any) => `- [${new Date(s.recorded_at).toLocaleDateString()}] ${s.digest || '(no digest)'}`).join('\n')}

=== OPEN WARMUP QUEUE (pre-scheduled) ===
${openWarmups.length === 0 ? '(none)' : openWarmups.map((w: any) => `- fires ${new Date(w.fires_at).toLocaleString()} (${w.affection_language || 'mixed'}) for "${w.target_event}": ${w.warmup_move}`).join('\n')}

=== UPCOMING DISCLOSURES (next 14d) ===
${upcomingDisclosures.length === 0 ? '(none scheduled)' : upcomingDisclosures.map((d: any) => `- rung ${d.rung} "${d.title}" by ${d.scheduled_by_date} — ask: ${d.ask || '(none)'}`).join('\n')}

=== RECENT GINA REACTIONS ===
${recentReactions.length === 0 ? '(no reactions logged yet)' : recentReactions.map((r: any) => `- [${r.reaction.toUpperCase()}] ${r.move_kind}: ${r.move_summary.slice(0, 80)} — ${r.reaction_detail || ''}`).join('\n')}

=== CONSTRAINTS ===
- Current window is ${windowColor.toUpperCase()}. If RED: warmup moves only, no push. If YELLOW: level-keeping, no push. If GREEN: safe to advance a rung.
- NEVER violate a red line. Refuse to plan any move that would.
- Match her tone register EXACTLY in the exact_line. If register includes "dry", drafts are dry. If "warm", warm. If you clash, she shuts down.
- Channel must match her preference for hard topics when the move is hard. Soft moves can go any channel.
- Warmups are affection-language-matched (gestures / words / acts of service / touch / quality time).
- Follow-ups that cite session digests should use her exact phrasing back ("you said X — I want to say something about that").
- Every move gets a fires_at in the next 48h, skewed toward her best window. expires_at is 6-24h after fires_at.
- If she reacted HOSTILE recently, pause hard asks for 7+ days, only plan repair moves.

Return ONLY a JSON array with this schema. No markdown fences, no prose:
[
  {
    "move_kind": "<warmup|probe|follow_up|disclosure_opener|consent_reinforce|repair|soft_bring_up|test_water>",
    "exact_line": "<word-for-word what Maxy should say, or description if in_person/letter>",
    "channel": "<text|in_person|voice_note|letter|call>",
    "rationale": "<why now, which signal triggered this, in 1 sentence>",
    "soft_spot_cited": "<soft_spot name from profile if leaned on, else null>",
    "trigger_avoided": ["<trigger names intentionally dodged>"],
    "fires_at": "<ISO timestamp in next 48h>",
    "expires_at": "<ISO timestamp 6-24h after fires_at>",
    "scheduled_by": "<warmup_queue|session_digest|disclosure_prep|window_open|manual>",
    "source_session_id": "<uuid if this follow-up cites a specific session, else null>",
    "source_warmup_id": "<uuid if this delivers a specific warmup queue entry, else null>"
  }
]

${alreadyPlannedFromSession ? 'NOTE: already planned against the newest session in the last 12h — do not regenerate the same follow-ups. Plan net-new moves only.' : ''}
${trigger ? `TRIGGER CONTEXT: ${trigger}` : ''}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const claudeJson = await claudeRes.json()
    if (!claudeRes.ok) throw new Error(`Anthropic error: ${JSON.stringify(claudeJson)}`)

    const textContent = claudeJson?.content?.[0]?.text ?? ''
    const jsonMatch = textContent.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error(`planner returned no JSON array: ${textContent.slice(0, 400)}`)

    let moves: PlannedMove[]
    try { moves = JSON.parse(jsonMatch[0]) } catch (e) {
      throw new Error(`planner JSON parse failed: ${(e as Error).message}`)
    }

    const validChannels = ['text', 'in_person', 'voice_note', 'letter', 'call']
    const validKinds = ['warmup', 'probe', 'follow_up', 'disclosure_opener', 'consent_reinforce', 'repair', 'soft_bring_up', 'test_water']
    const validSchedBy = ['warmup_queue', 'session_digest', 'disclosure_prep', 'window_open', 'manual']

    let inserted = 0
    for (const m of moves) {
      if (!m.exact_line || !m.fires_at || !m.expires_at) continue
      if (!validKinds.includes(m.move_kind)) continue
      if (!validChannels.includes(m.channel)) continue

      const firesAt = new Date(m.fires_at)
      const expiresAt = new Date(m.expires_at)
      if (isNaN(firesAt.getTime()) || isNaN(expiresAt.getTime())) continue
      // Clamp fires_at into the next 48h
      const maxFuture = new Date(Date.now() + 48 * 3600000)
      if (firesAt.getTime() > maxFuture.getTime()) continue

      const { error } = await supabase.from('gina_playbook').insert({
        user_id,
        move_kind: m.move_kind,
        exact_line: m.exact_line.slice(0, 2000),
        channel: m.channel,
        rationale: (m.rationale || '').slice(0, 500),
        soft_spot_cited: m.soft_spot_cited || null,
        trigger_avoided: Array.isArray(m.trigger_avoided) ? m.trigger_avoided : null,
        window_color_at_plan: windowColor,
        fires_at: firesAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        scheduled_by: validSchedBy.includes(m.scheduled_by) ? m.scheduled_by : 'window_open',
        source_warmup_id: m.source_warmup_id || null,
        source_session_id: m.source_session_id || null,
      })
      if (!error) inserted++
      else console.error('playbook insert failed:', error.message)
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id,
      planned: inserted,
      window_color: windowColor,
      trigger: trigger || null,
    }), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('gina-playbook-planner failed:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    })
  }
})
