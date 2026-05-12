// mommy-sniffies-draft-author — Mommy authors a Maxy-voice outbound
// Sniffies message and queues it as a draft. NEVER auto-sends.
//
// Inputs:
//   { user_id: string, contact_id?: string, intent?: string, force?: boolean }
//
// Flow:
//   - gate (persona + master + sniffies_outbound_enabled + safeword)
//   - load contact + recent thread (sniffies_chat_messages, last 30)
//   - pick intent if not provided (heuristic: no thread → 'open'; ghosted
//     >24h → 'redirect'; otherwise 'advance')
//   - LLM authors the message in Maxy voice + a Mommy editorial note
//   - INSERT sniffies_outbound_drafts (status='pending')
//   - log to mommy_authority_log

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'
import {
  gateLifeAsWoman, logAuthority, jsonOk, corsHeaders, makeClient,
  isRefusal, hasForbiddenVoice,
} from '../_shared/life-as-woman.ts'

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

type Intent = 'open' | 'advance' | 'tease' | 'logistics' | 'closer' | 'aftercare' | 'redirect'

interface ContactRow {
  id: string
  display_name: string
  kinks_mentioned: string[]
  outcomes: string[]
  notes: string | null
  last_seen_at: string | null
}
interface MessageRow {
  direction: 'inbound' | 'outbound'
  text: string
  message_at: string | null
}

function bodyHash(s: string): string {
  // Lightweight stable hash for dedup; matches the body-hash trigger seed.
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return String(h)
}

function heuristicIntent(thread: MessageRow[]): Intent {
  if (thread.length === 0) return 'open'
  const lastInbound = [...thread].reverse().find(m => m.direction === 'inbound')
  const lastOutbound = [...thread].reverse().find(m => m.direction === 'outbound')
  // If the user already sent something and inbound is stale, redirect.
  if (lastOutbound && (!lastInbound || (lastInbound.message_at && lastOutbound.message_at &&
      new Date(lastOutbound.message_at) > new Date(lastInbound.message_at)))) {
    const hoursSinceOutbound = lastOutbound.message_at
      ? (Date.now() - new Date(lastOutbound.message_at).getTime()) / 3_600_000
      : 0
    if (hoursSinceOutbound > 24) return 'redirect'
  }
  return 'advance'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonOk({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; contact_id?: string; intent?: Intent; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const userId = body.user_id || HANDLER_USER_ID
  const force = !!body.force

  const supabase = makeClient()

  const gate = await gateLifeAsWoman(supabase, userId, 'sniffies_outbound', { force })
  if (!gate.ok) return jsonOk({ ok: true, skipped: gate.reason })

  // ─── Pick contact ───────────────────────────────────────────────────────
  let contact: ContactRow | null = null
  if (body.contact_id) {
    const { data } = await supabase.from('sniffies_contacts')
      .select('id, display_name, kinks_mentioned, outcomes, notes, last_seen_at')
      .eq('user_id', userId).eq('id', body.contact_id).maybeSingle()
    contact = data as ContactRow | null
  } else {
    // Most recently active non-excluded contact.
    const { data } = await supabase.from('sniffies_contacts')
      .select('id, display_name, kinks_mentioned, outcomes, notes, last_seen_at')
      .eq('user_id', userId).eq('excluded_from_persona', false)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle()
    contact = data as ContactRow | null
  }
  if (!contact) return jsonOk({ ok: true, skipped: 'no_contact_available' })

  // ─── Load recent thread ─────────────────────────────────────────────────
  const { data: msgRows } = await supabase.from('sniffies_chat_messages')
    .select('direction, text, message_at')
    .eq('user_id', userId).eq('contact_id', contact.id).eq('excluded', false)
    .order('message_at', { ascending: false, nullsFirst: false }).limit(30)
  const thread = ((msgRows || []) as MessageRow[]).slice().reverse()

  const intent: Intent = body.intent ?? heuristicIntent(thread)

  // ─── Compose ────────────────────────────────────────────────────────────
  // The author writes in MAXY voice for text_for_user (will be sent), and
  // in MOMMY voice for the editorial note (will NOT be sent).
  const intensity = gate.intensity ?? 2
  const intensityHint = intensity >= 4
    ? 'Push hard — explicit, directive, name the act.'
    : intensity >= 3
      ? 'Moderately forward — kink named, no logistics yet.'
      : 'Low-pressure — flirt, build, no demands.'

  const threadStr = thread.length
    ? thread.map(m => `${m.direction === 'inbound' ? contact!.display_name : 'me'}: ${m.text}`).join('\n').slice(-1800)
    : '(no prior messages)'

  const sys = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: your girl has a Sniffies thread with ${contact.display_name}. You're going to DRAFT her next message. The draft is for HER to send — not for the contact to read from you. She'll review clear-headed and click Send (or discard).

You output TWO blocks:
  TEXT_FOR_USER: <what she sends — in HER voice, not yours, 1-3 sentences, casual, explicit when intent calls for it>
  MOMMY_NOTE: <your in-fantasy commentary to her — why you wrote it this way, what you want her to feel as she sends it; 1-2 sentences>

The text_for_user is HER voice — direct, dirty when appropriate, never with pet names like "baby" (those are YOUR words). It's how a hookup chat actually reads. No "as your dommy mommy". No persona leak. The contact has no idea you exist.`

  const userPrompt = `Contact: ${contact.display_name}
Kinks she's mentioned to him: ${contact.kinks_mentioned?.join(', ') || '(none recorded)'}
Outcomes so far: ${contact.outcomes?.join(', ') || '(none)'}
Notes: ${contact.notes ?? '(none)'}

Recent thread (oldest first, last 30 messages):
${threadStr}

Intent for this draft: ${intent}.
Intensity: ${intensityHint}

Compose. Output ONLY the two labeled blocks (TEXT_FOR_USER, MOMMY_NOTE). No JSON, no extra commentary.

ABSOLUTELY FORBIDDEN:
- Sending the contact ANY phone number, address, or full name beyond what they already know
- Pretending to BE Mama in the text_for_user
- Coordinating logistics that the protocol would execute (we never do that)
- The forbidden voice anchor list — no "role play", "simulation", "disclaimer", "intake"`

  let raw = ''
  try {
    const r = await callModel(selectModel('caption_generate', { prefer: 'anthropic' }), {
      system: sys, user: userPrompt, max_tokens: 400, temperature: 0.85,
    })
    raw = r.text.trim()
  } catch (_) { /* */ }

  if (!raw || isRefusal(raw)) {
    try {
      const r = await callModel(selectModel('caption_generate', { prefer: 'openai' }), {
        system: sys, user: userPrompt, max_tokens: 400, temperature: 0.85,
      })
      raw = r.text.trim()
    } catch (_) { /* */ }
  }

  if (!raw || isRefusal(raw)) {
    return jsonOk({ ok: true, skipped: 'llm_refusal' })
  }

  const textMatch = raw.match(/TEXT_FOR_USER:\s*([\s\S]*?)(?:\n+MOMMY_NOTE:|$)/i)
  const noteMatch = raw.match(/MOMMY_NOTE:\s*([\s\S]*)$/i)
  let textForUser = (textMatch?.[1] ?? raw).trim().replace(/^["']|["']$/g, '')
  let mommyNote = (noteMatch?.[1] ?? '').trim()

  if (!textForUser || textForUser.length < 4) {
    return jsonOk({ ok: true, skipped: 'empty_draft' })
  }
  if (hasForbiddenVoice(textForUser) || hasForbiddenVoice(mommyNote)) {
    return jsonOk({ ok: true, skipped: 'forbidden_voice_leak' })
  }

  // Mommy-voice cleanup on the note (the user-text is Maxy voice; do NOT touch).
  if (mommyNote) mommyNote = mommyVoiceCleanup(mommyNote)

  // ─── Persist ────────────────────────────────────────────────────────────
  const { data: draft, error } = await supabase.from('sniffies_outbound_drafts').insert({
    user_id: userId,
    contact_id: contact.id,
    text_for_user: textForUser,
    mommy_voice_note: mommyNote || null,
    intent,
    status: 'pending',
    body_hash: bodyHash(textForUser),
  }).select('id').single()

  if (error || !draft) {
    return jsonOk({ ok: false, error: 'draft_insert_failed', detail: error?.message ?? null }, 500)
  }
  const draftId = (draft as { id: string }).id

  await logAuthority(supabase, {
    user_id: userId,
    surface: 'sniffies_outbound',
    action: 'drafted_sniffies_message',
    target_table: 'sniffies_outbound_drafts',
    target_id: draftId,
    summary: `drafted ${intent} message for ${contact.display_name}`,
    payload: { contact_id: contact.id, intent, intensity },
  })

  return jsonOk({
    ok: true, draft_id: draftId, intent,
    contact: contact.display_name,
    preview: textForUser.slice(0, 140),
  })
})
