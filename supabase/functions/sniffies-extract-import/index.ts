// sniffies-extract-import — process a queued sniffies_chat_imports row.
//
// Reads the import row, fetches source content (private storage signed URL
// for screenshots/export_files, or inline raw_text for text_paste), runs
// LLM extraction to produce a contacts + messages structure, redacts PII,
// upserts contacts, inserts messages, updates the import row.
//
// POST { import_id: string, raw_text?: string }
//
// Privacy floor:
//   - Service-role-only writes; the user authorizes via the import_id row
//     (RLS-protected on read in the UI).
//   - PII redacted via _shared/sniffies-redaction.ts BEFORE any insert.
//   - On redaction signal, status moves to 'manual_review' instead of
//     'processed' so the user reviews before persona use.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { redact, shouldHoldForReview } from '../_shared/sniffies-redaction.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ExtractedMessage {
  contact_label: string
  direction: 'inbound' | 'outbound'
  text: string
  message_at?: string | null
  kink_tags?: string[]
}

interface ExtractedContact {
  display_name: string
  kinks_mentioned?: string[]
  outcomes?: string[]
}

interface ExtractionPayload {
  contacts: ExtractedContact[]
  messages: ExtractedMessage[]
}

const ALLOWED_OUTCOMES = new Set([
  'met', 'ghosted', 'met_then_ghosted', 'ongoing', 'blocked', 'planning',
])

const SYSTEM_PROMPT = `You are an extractor for hookup-app chat content. Your output is consumed by a privacy-sensitive system.

Given chat content (text or screenshot OCR), produce a strict JSON object:
{
  "contacts": [
    { "display_name": "string", "kinks_mentioned": ["string"], "outcomes": ["met"|"ghosted"|"met_then_ghosted"|"ongoing"|"blocked"|"planning"] }
  ],
  "messages": [
    { "contact_label": "string matching a contacts[].display_name", "direction": "inbound"|"outbound", "text": "string", "message_at": "ISO timestamp or null", "kink_tags": ["string"] }
  ]
}

Rules:
- "outbound" = sent by the app's user. "inbound" = sent by the contact.
- If the contact has no obvious display name, use "Anon-1", "Anon-2", etc.
- kinks_mentioned and kink_tags are short lowercase free-form tags, not full sentences.
- outcomes is a small enum — pick at most 2 per contact based on conversation evidence.
- Never include phone numbers, email addresses, street addresses, or financial info in the output text. If you see one, replace it with [redacted].
- Output ONLY the JSON object. No prose, no markdown.`

async function callExtractor(content: { kind: 'text', text: string } | { kind: 'image', dataUrl: string }): Promise<ExtractionPayload> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY missing')

  const userContent = content.kind === 'text'
    ? [{ type: 'text', text: `Extract from this chat text:\n\n${content.text.slice(0, 12000)}` }]
    : [
      { type: 'text', text: 'Extract contacts and messages from this Sniffies chat screenshot.' },
      { type: 'image_url', image_url: { url: content.dataUrl } },
    ]

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json() as { choices?: Array<{ message: { content: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  let parsed: ExtractionPayload
  try {
    parsed = JSON.parse(raw) as ExtractionPayload
  } catch {
    throw new Error('extractor returned invalid JSON')
  }
  if (!Array.isArray(parsed.contacts)) parsed.contacts = []
  if (!Array.isArray(parsed.messages)) parsed.messages = []
  return parsed
}

async function fetchBlobAsDataUrl(admin: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await admin.storage.from('sniffies-imports').download(path)
  if (error || !data) return null
  const buf = await data.arrayBuffer()
  // base64 encode in chunks to avoid stack overflow on large blobs.
  let bin = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const b64 = btoa(bin)
  const mime = data.type || 'image/png'
  return `data:${mime};base64,${b64}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { import_id?: string; raw_text?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const importId = body.import_id
  if (!importId) {
    return new Response(JSON.stringify({ ok: false, error: 'import_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // 1. Load the import row.
  const { data: imp, error: impErr } = await admin
    .from('sniffies_chat_imports')
    .select('*')
    .eq('id', importId)
    .maybeSingle()
  if (impErr || !imp) {
    return new Response(JSON.stringify({ ok: false, error: 'import_not_found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = (imp as Record<string, unknown>).user_id as string

  // 2. Master switch — if integration is off, refuse to process. The UI
  // shouldn't have queued the import in the first place, but we belt-and-
  // suspenders here.
  const { data: settings } = await admin
    .from('sniffies_settings')
    .select('sniffies_integration_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const integrationOn = !!(settings as { sniffies_integration_enabled?: boolean } | null)?.sniffies_integration_enabled
  if (!integrationOn) {
    await admin
      .from('sniffies_chat_imports')
      .update({
        extraction_status: 'failed',
        error_text: 'integration_disabled',
        processed_at: new Date().toISOString(),
      })
      .eq('id', importId)
    return new Response(JSON.stringify({ ok: false, error: 'integration_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 3. Mark processing.
  await admin
    .from('sniffies_chat_imports')
    .update({ extraction_status: 'processing' })
    .eq('id', importId)

  try {
    const sourceKind = (imp as Record<string, unknown>).source_kind as string
    const blobPath = (imp as Record<string, unknown>).source_blob_path as string | null

    let extracted: ExtractionPayload

    if (sourceKind === 'text_paste') {
      const text = body.raw_text
        ?? ((imp as Record<string, unknown>).extraction_summary as Record<string, unknown> | undefined)?.raw_text_preview as string
        ?? ''
      if (!text || text.length < 20) throw new Error('text_paste: missing or too short')
      extracted = await callExtractor({ kind: 'text', text })
    } else if (sourceKind === 'screenshot' && blobPath) {
      const dataUrl = await fetchBlobAsDataUrl(admin, blobPath)
      if (!dataUrl) throw new Error('screenshot: blob fetch failed')
      extracted = await callExtractor({ kind: 'image', dataUrl })
    } else if (sourceKind === 'export_file' && blobPath) {
      // Treat .json/.txt as text. Download then extract.
      const { data: blob, error: dlErr } = await admin.storage.from('sniffies-imports').download(blobPath)
      if (dlErr || !blob) throw new Error('export_file: blob fetch failed')
      const text = await blob.text()
      extracted = await callExtractor({ kind: 'text', text: text.slice(0, 15000) })
    } else {
      throw new Error(`unsupported source_kind: ${sourceKind}`)
    }

    // 4. Redact every message text. Track whether anything fired so we can
    // route to manual_review if needed.
    const allFlags = new Set<string>()
    const messagesRedacted = extracted.messages.map(m => {
      const r = redact(m.text || '')
      r.flags.forEach(f => allFlags.add(f))
      return { ...m, text: r.text }
    })
    const flagsArr = Array.from(allFlags) as Parameters<typeof shouldHoldForReview>[0]
    const holdForReview = shouldHoldForReview(flagsArr)

    // 5. Upsert contacts. Map by display_name for the message link.
    const contactNameToId = new Map<string, string>()
    for (const c of extracted.contacts) {
      const displayName = (c.display_name || 'Anon-1').slice(0, 80)
      // Look for an existing contact with this display_name + user.
      const { data: existing } = await admin
        .from('sniffies_contacts')
        .select('id, kinks_mentioned, outcomes')
        .eq('user_id', userId)
        .eq('display_name', displayName)
        .maybeSingle()

      const incomingKinks = (c.kinks_mentioned ?? []).map(k => k.toLowerCase().slice(0, 32)).filter(Boolean).slice(0, 16)
      const incomingOutcomes = (c.outcomes ?? []).filter(o => ALLOWED_OUTCOMES.has(o)).slice(0, 4)

      if (existing) {
        const merged = {
          kinks_mentioned: Array.from(new Set([
            ...((existing as Record<string, unknown>).kinks_mentioned as string[] ?? []),
            ...incomingKinks,
          ])).slice(0, 32),
          outcomes: Array.from(new Set([
            ...((existing as Record<string, unknown>).outcomes as string[] ?? []),
            ...incomingOutcomes,
          ])).slice(0, 6),
          last_seen_at: new Date().toISOString(),
        }
        await admin.from('sniffies_contacts').update(merged).eq('id', (existing as { id: string }).id)
        contactNameToId.set(displayName, (existing as { id: string }).id)
      } else {
        const { data: ins } = await admin
          .from('sniffies_contacts')
          .insert({
            user_id: userId,
            display_name: displayName,
            kinks_mentioned: incomingKinks,
            outcomes: incomingOutcomes,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (ins) contactNameToId.set(displayName, (ins as { id: string }).id)
      }
    }

    // 6. Insert messages. Skip empty after redaction.
    const messageRows = messagesRedacted
      .filter(m => m.text && m.text.trim().length > 0)
      .map(m => ({
        user_id: userId,
        import_id: importId,
        contact_id: contactNameToId.get((m.contact_label || '').slice(0, 80)) ?? null,
        direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
        text: m.text.slice(0, 4000),
        message_at: m.message_at || null,
        kink_tags: (m.kink_tags ?? []).slice(0, 16).map(t => t.toLowerCase().slice(0, 32)),
        // Per-message manual-review flag — when redaction fired but the
        // overall import didn't trip hold-for-review, still mark messages
        // with redaction signals for closer inspection.
        needs_review: m.text.includes('[redacted-'),
      }))
    if (messageRows.length > 0) {
      await admin.from('sniffies_chat_messages').insert(messageRows)
    }

    // 7. Update the import row.
    const summary = {
      contacts: extracted.contacts.length,
      messages: messageRows.length,
      kinks: Array.from(new Set(messagesRedacted.flatMap(m => m.kink_tags ?? []))).slice(0, 32),
      by_direction: {
        inbound: messageRows.filter(r => r.direction === 'inbound').length,
        outbound: messageRows.filter(r => r.direction === 'outbound').length,
      },
    }

    await admin
      .from('sniffies_chat_imports')
      .update({
        extraction_status: holdForReview ? 'manual_review' : 'processed',
        extraction_summary: summary,
        redaction_flags: flagsArr,
        processed_at: new Date().toISOString(),
        error_text: null,
      })
      .eq('id', importId)

    return new Response(JSON.stringify({
      ok: true,
      contacts: extracted.contacts.length,
      messages: messageRows.length,
      hold_for_review: holdForReview,
      redaction_flags: flagsArr,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await admin
      .from('sniffies_chat_imports')
      .update({
        extraction_status: 'failed',
        error_text: msg.slice(0, 500),
        processed_at: new Date().toISOString(),
      })
      .eq('id', importId)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
