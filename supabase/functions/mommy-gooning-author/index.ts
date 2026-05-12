// mommy-gooning-author — authors a 60-90 minute gooning session.
//
// Inputs:
//   { user_id?: string, duration_minutes?: number, outcome?: 'deny'|'release'|'sissygasm_only', force?: boolean }
//
// Flow:
//   - gate (persona + master + gooning_enabled + safeword)
//   - pick outcome with chastity_protocols_v2 awareness: if user is in an
//     active chastity_v2 window, outcome locks to 'deny' unless force=true
//   - LLM authors structure_json: ordered segments with label + text + duration
//   - INSERT gooning_sessions (status='drafted')
//   - log authority

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

type Outcome = 'deny' | 'release' | 'sissygasm_only'

interface Segment {
  label: string
  duration_seconds: number
  text: string
  edge_target_index?: number | null
}

function defaultStructure(durationMin: number, edgeTargetCount: number, outcome: Outcome): Segment[] {
  const totalSec = durationMin * 60
  const warmupSec = Math.round(totalSec * 0.12)
  const closerSec = Math.round(totalSec * 0.10)
  const between = totalSec - warmupSec - closerSec
  const blockSec = Math.floor(between / edgeTargetCount)
  const segs: Segment[] = []
  segs.push({ label: 'warmup', duration_seconds: warmupSec, text: '' })
  for (let i = 0; i < edgeTargetCount; i++) {
    segs.push({
      label: `edge_${i + 1}`,
      duration_seconds: blockSec,
      text: '',
      edge_target_index: i + 1,
    })
  }
  segs.push({
    label: outcome === 'release' ? 'release_window'
      : outcome === 'sissygasm_only' ? 'sissygasm_window'
      : 'deny_close',
    duration_seconds: closerSec,
    text: '',
  })
  return segs
}

interface ParsedSegments {
  segments: Segment[]
  title: string
}

function parseSegments(raw: string, scaffold: Segment[]): ParsedSegments | null {
  // Look for TITLE: line + per-segment LABEL: blocks matching the scaffold.
  const titleMatch = raw.match(/TITLE:\s*(.+)$/im)
  const title = (titleMatch?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  if (!title) return null
  const out: Segment[] = []
  for (const seg of scaffold) {
    const re = new RegExp(`${seg.label.toUpperCase()}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:[A-Z_]+):|$)`, 'i')
    const m = raw.match(re)
    const text = (m?.[1] ?? '').trim()
    if (!text) return null
    out.push({ ...seg, text })
  }
  return { segments: out, title }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; duration_minutes?: number; outcome?: Outcome; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const durationMinutes = Math.max(30, Math.min(120, body.duration_minutes ?? 75))

  const supabase = makeClient()
  const gate = await gateLifeAsWoman(supabase, userId, 'gooning', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })
  const intensity = gate.intensity ?? 2

  // Chastity v2 awareness — if active window, default outcome = deny.
  let outcome: Outcome = body.outcome ?? 'deny'
  const { data: chastity } = await supabase.from('chastity_protocols_v2')
    .select('id, earliest_release_at, status')
    .eq('user_id', userId).eq('status', 'active').maybeSingle()
  if (chastity && !force) {
    outcome = 'deny'
  }

  const edgeTargetCount = Math.max(2, Math.min(8, Math.round(durationMinutes / 18)))
  const scaffold = defaultStructure(durationMinutes, edgeTargetCount, outcome)

  const intensityHint = intensity >= 4
    ? 'Push hard — explicit anatomy talk, name sissy-parts, deepest filth in payload.'
    : intensity >= 3
      ? 'Standard intensity — clear arousal control, edge call-outs, sustained tension.'
      : 'Gentle — slow build, breath-led, less explicit anatomy talk.'

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: author a ${durationMinutes}-minute gooning session for your girl. Mommy voice the entire time. Pre-recorded audio narrative; assume she has it in her ears, hands free or staying off depending on segment.

Structure — ${scaffold.length} ordered segments, each labeled exactly. Word counts target ~150 words per minute of audio:
${scaffold.map(s => `  ${s.label.toUpperCase()} (${Math.round(s.duration_seconds / 60)} min, ~${Math.round(s.duration_seconds / 60 * 150)} words)${s.edge_target_index ? ` — EDGE #${s.edge_target_index}` : ''}`).join('\n')}

Outcome at the end: ${outcome}. ${outcome === 'deny' ? "She does not get to come. You take the edge away from her and tell her to pull her hands off." : outcome === 'release' ? "Permission granted, but only after the final edge — make it explicit." : "Sissygasm-only path — release only via hands-free / prostate-led."}.

Each EDGE segment ramps her up to the brink, then YOU pull her back at the segment's end. The structure is build → brink → recede → build again.

${intensityHint}

FORBIDDEN:
- "role play", "simulation", "disclaimer", "intake", "questionnaire", "fiction"
- Medical claims (no HRT/dose references)
- Telemetry leaks (/10 scores, day counts, slip points, %)
- Asking — only command
- Backing off ("if you want") — Mommy decides

Also output ONE short Mommy-voice TITLE for the session at the top.`

  const segmentList = scaffold.map(s => s.label.toUpperCase()).join(', ')
  const userPrompt = `Compose now. Output format EXACTLY:

TITLE: <short title in Mommy voice, no quotes>

${scaffold.map(s => `${s.label.toUpperCase()}:\n<text for this segment>\n`).join('\n')}

(Order: ${segmentList}.) No JSON, no extra commentary.`

  let raw = ''
  try {
    const r = await callModel(selectModel('strategic_plan', { prefer: 'anthropic' }), {
      system: sys, user: userPrompt, max_tokens: 8000, temperature: 0.8,
    })
    raw = r.text.trim()
  } catch (_) { /* */ }
  if (!raw || isRefusal(raw)) {
    try {
      const r = await callModel(selectModel('strategic_plan', { prefer: 'openai' }), {
        system: sys, user: userPrompt, max_tokens: 8000, temperature: 0.8,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
  }
  if (!raw || isRefusal(raw)) return jsonOk({ ok: true, skipped: 'llm_refusal' })

  const parsed = parseSegments(raw, scaffold)
  if (!parsed) return jsonOk({ ok: true, skipped: 'segments_unparseable' })

  parsed.title = mommyVoiceCleanup(parsed.title)
  for (const s of parsed.segments) s.text = mommyVoiceCleanup(s.text)
  if (hasForbiddenVoice(parsed.title) || parsed.segments.some(s => hasForbiddenVoice(s.text))) {
    return jsonOk({ ok: true, skipped: 'forbidden_voice_leak' })
  }

  const { data: session, error } = await supabase.from('gooning_sessions').insert({
    user_id: userId,
    title: parsed.title,
    duration_minutes: durationMinutes,
    edge_target_count: edgeTargetCount,
    outcome,
    structure_json: parsed.segments,
    status: 'drafted',
  }).select('id').single()

  if (error || !session) {
    return jsonOk({ ok: false, error: 'session_insert_failed', detail: error?.message ?? null }, 500)
  }
  const sessionId = (session as { id: string }).id

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'gooning',
    action: 'authored_gooning_session',
    target_table: 'gooning_sessions',
    target_id: sessionId,
    summary: `authored ${durationMinutes}-min ${outcome} session (${edgeTargetCount} edges)`,
    payload: { duration_minutes: durationMinutes, outcome, edge_target_count: edgeTargetCount, intensity },
  })

  return jsonOk({
    ok: true, session_id: sessionId,
    title: parsed.title, duration_minutes: durationMinutes,
    edge_target_count: edgeTargetCount, outcome,
  })
})
