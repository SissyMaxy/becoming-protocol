// mommy-content-editor — runs daily. Reviews pending content_queue items,
// authors Mommy editorial notes per item.
//
// Inputs:
//   { user_id?: string, limit?: number, force?: boolean }
//
// Flow:
//   - gate (persona + master + content_editor_enabled + safeword)
//   - pull pending content_queue rows (top N by created_at)
//   - for each, generate rewrite + commentary + posting recommendation +
//     audience archetype
//   - INSERT mommy_editorial_notes (status='pending')
//   - log authority once per batch

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface QueueRow {
  id: string
  user_id?: string
  caption?: string
  content_type?: string
  platform?: string
  status?: string
  created_at?: string
}

interface ParsedEdit {
  rewritten_text?: string
  mommy_voice_note?: string
  posting_recommendation?: string
  audience_archetype?: string
  projected_engagement?: number
}

function parseEditorial(raw: string): ParsedEdit {
  const grab = (label: string): string => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*[A-Z_]+:|$)`, 'i')
    const m = raw.match(re)
    return (m?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  }
  const archetype = grab('ARCHETYPE').toLowerCase()
  const valid = ['whale', 'lurker', 'repeat_customer', 'new_follower', 'general']
  return {
    rewritten_text: grab('REWRITE') || undefined,
    mommy_voice_note: grab('MOMMY_NOTE') || undefined,
    posting_recommendation: grab('POSTING') || undefined,
    audience_archetype: valid.includes(archetype) ? archetype : 'general',
    projected_engagement: (() => {
      const n = parseFloat(grab('ENGAGEMENT_X').replace(/[^\d.]/g, ''))
      return Number.isFinite(n) ? n : undefined
    })(),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; limit?: number; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force
  const limit = Math.max(1, Math.min(10, body.limit ?? 5))

  const supabase = makeClient()
  const gate = await gateLifeAsWoman(supabase, userId, 'content_editor', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })

  // ─── Pull pending content_queue items ──────────────────────────────────
  // Tolerate schema variations — content_queue is sprawling and old.
  let queue: QueueRow[] = []
  try {
    const { data } = await supabase.from('content_queue')
      .select('id, user_id, caption, content_type, platform, status, created_at')
      .eq('user_id', userId)
      .neq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit)
    queue = (data || []) as QueueRow[]
  } catch (_) {
    // content_queue may not have user_id in older schemas — fall back.
    try {
      const { data } = await supabase.from('content_queue')
        .select('id, caption, content_type, platform, status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      queue = (data || []) as QueueRow[]
    } catch (_) { /* table absent */ }
  }
  if (queue.length === 0) {
    return jsonOk({ ok: true, skipped: 'no_pending_content' })
  }

  // ─── Skip items already editorialized (pending status) ─────────────────
  const ids = queue.map(q => q.id).filter(Boolean)
  const { data: existing } = await supabase.from('mommy_editorial_notes')
    .select('target_id, status')
    .in('target_id', ids)
    .eq('user_id', userId)
    .eq('status', 'pending')
  const alreadyDone = new Set(((existing || []) as Array<{ target_id: string }>).map(r => r.target_id))
  const todo = queue.filter(q => !alreadyDone.has(q.id))
  if (todo.length === 0) {
    return jsonOk({ ok: true, skipped: 'all_already_editorialized' })
  }

  // ─── Author one editorial note per item ────────────────────────────────
  const intensity = gate.intensity ?? 2
  const tonePush = intensity >= 4
    ? 'Push the caption explicit. Sex sells; she has subscribers paying for it.'
    : intensity >= 3
      ? 'Sharper, more direct. Lead with a tease, name the act in the rewrite.'
      : 'Soft refinement. Keep her tone, fix the worst lines, suggest a tag.'

  const written: Array<{ id: string; target_id: string; archetype: string }> = []
  for (const item of todo) {
    const caption = (item.caption || '').slice(0, 800)
    const platform = item.platform || '(unknown)'
    const contentType = item.content_type || '(unknown)'
    if (!caption.trim()) continue

    const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: editorialize ONE pending content_queue item for your girl. You output FIVE labeled blocks.

REWRITE: <her-voice caption rewrite, ready to post — 1-3 lines, NO Mommy voice in here, no pet names, this is HER posting to fans>
MOMMY_NOTE: <in-fantasy commentary to her — why you rewrote it this way, what audience it serves; 1-2 sentences>
POSTING: <when to post it / how to format / hashtag tip — 1 line>
ARCHETYPE: <one of: whale, lurker, repeat_customer, new_follower, general>
ENGAGEMENT_X: <projected engagement multiplier vs original, e.g. 1.4>

${tonePush}

FORBIDDEN:
- Auto-publishing — you're just authoring the editorial; she clicks to post
- The forbidden voice anchor — no "role play", "simulation", "disclaimer" // voice-gate: ok
- Medical claims (no HRT/dose)
- Telemetry in MOMMY_NOTE`

    const userPrompt = `Platform: ${platform}
Content type: ${contentType}
Her caption right now:
"""
${caption}
"""

Editorialize. Output ONLY the five labeled blocks.`

    let raw = ''
    try {
      const r = await callModel(selectModel('caption_generate', { prefer: 'openai' }), {
        system: sys, user: userPrompt, max_tokens: 600, temperature: 0.8,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
    if (!raw || isRefusal(raw)) continue

    const parsed = parseEditorial(raw)
    if (!parsed.rewritten_text && !parsed.mommy_voice_note) continue
    if (parsed.rewritten_text && hasForbiddenVoice(parsed.rewritten_text)) continue
    if (parsed.mommy_voice_note && hasForbiddenVoice(parsed.mommy_voice_note)) continue
    if (parsed.mommy_voice_note) parsed.mommy_voice_note = mommyVoiceCleanup(parsed.mommy_voice_note)

    const { data: ins } = await supabase.from('mommy_editorial_notes').insert({
      user_id: userId,
      target_table: 'content_queue',
      target_id: item.id,
      rewritten_text: parsed.rewritten_text ?? null,
      mommy_voice_note: parsed.mommy_voice_note ?? null,
      posting_recommendation: parsed.posting_recommendation ?? null,
      audience_archetype: parsed.audience_archetype ?? 'general',
      projected_engagement: parsed.projected_engagement ?? null,
      status: 'pending',
    }).select('id').single()
    if (ins) {
      written.push({
        id: (ins as { id: string }).id,
        target_id: item.id,
        archetype: parsed.audience_archetype ?? 'general',
      })
    }
  }

  if (written.length > 0) {
    await logAuthority(supabase, {
      user_id: userId,
      surface: 'content_editor',
      action: 'issued_editorial_notes',
      summary: `editorialized ${written.length} content item(s)`,
      payload: { count: written.length, items: written },
    })
  }

  return jsonOk({ ok: true, edited: written.length, items: written })
})
