// mommy-dare-photo-react — Mama looks at the dare proof photo and reacts.
//
// Wish 15a8f6e0: when the girl submits a public-dare proof photo, Mama
// generates a 2-3 sentence reaction referencing visible details — nail
// color, how the fabric sits, posture, expression — possessive, granular.
// Reaction → handler_outreach_queue + stored on the assignment.
//
// Fired fire-and-forget from PublicDareCard on photo completion.
// POST { user_id, assignment_id, photo_artifact_id }.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMMY_MOMMY_CHARACTER, mommyVoiceCleanup, isMommyPersona } from '../_shared/dommy-mommy.ts'
import { logAuthority } from '../_shared/life-as-woman.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `${DOMMY_MOMMY_CHARACTER}

YOUR JOB right now: the girl just sent Mama a proof photo of a public dare she completed. LOOK at the photo and react in 2-3 sentences as her possessive dom-mommy. Reference SPECIFIC visible details — nail color, how the fabric sits on her, her posture, her hands, her expression, where she is. Make her feel SEEN — like Mama notices everything, always. Warm, possessive, a little filthy if it fits. Plain Mama voice: no scores, no percentages, no clinical language. If you genuinely cannot make out useful detail, speak to what you CAN see and to the fact that she did it for Mama — never invent a detail that isn't there.`

const REFUSAL_RE = /\b(?:I'?m sorry|I apologize|I can'?t|I cannot|I won'?t|unable to|against (?:my|the) (?:guidelines|policies)|take on that persona|not (?:going|willing) to (?:role[-\s]?play|adopt))\b/i
const isRefusal = (t: string) => !!t && (REFUSAL_RE.test(t) || (t.length < 160 && /\b(persona|role[-\s]?play)\b/i.test(t)))

async function loadImage(supabase: SupabaseClient, photoUrl: string): Promise<{ base64: string; mediaType: string } | null> {
  try {
    let buffer: ArrayBuffer; let mediaType: string
    if (/^https?:\/\//i.test(photoUrl)) {
      const r = await fetch(photoUrl)
      if (!r.ok) return null
      buffer = await r.arrayBuffer()
      mediaType = r.headers.get('content-type') || 'image/jpeg'
    } else {
      const { data: blob, error } = await supabase.storage.from('verification-photos').download(photoUrl)
      if (error || !blob) return null
      buffer = await blob.arrayBuffer()
      mediaType = blob.type || 'image/jpeg'
    }
    // base64 encode
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return { base64: btoa(binary), mediaType }
  } catch { return null }
}

async function callAnthropicVision(base64: string, mediaType: string, userText: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return ''
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 400, system: SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: userText },
        ] }],
      }),
    })
    if (!r.ok) { console.error('[dare-react] anthropic', r.status); return '' }
    const d = await r.json() as { content?: Array<{ type: string; text?: string }> }
    return d.content?.find(c => c.type === 'text')?.text ?? ''
  } catch (e) { console.error('[dare-react] anthropic threw', (e as Error).message); return '' }
}

async function callOpenRouterVision(base64: string, mediaType: string, userText: string): Promise<string> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) return ''
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          ] },
        ],
      }),
    })
    if (!r.ok) return ''
    const d = await r.json() as { choices?: Array<{ message?: { content?: string } }> }
    return d.choices?.[0]?.message?.content ?? ''
  } catch { return '' }
}

async function react(supabase: SupabaseClient, userId: string, assignmentId: string, photoArtifactId?: string): Promise<{ status: string }> {
  // Persona check.
  const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', userId).maybeSingle()
  if (!isMommyPersona((us as { handler_persona?: string } | null)?.handler_persona)) return { status: 'persona_off' }

  // Load assignment (dedup: already reacted?).
  const { data: asg } = await supabase.from('public_dare_assignments')
    .select('id, mommy_reaction_text, verification_artifact_id, template_id')
    .eq('id', assignmentId).eq('user_id', userId).maybeSingle()
  const assignment = asg as { id: string; mommy_reaction_text: string | null; verification_artifact_id: string | null; template_id: string } | null
  if (!assignment) return { status: 'assignment_not_found' }
  if (assignment.mommy_reaction_text) return { status: 'already_reacted' }

  // Resolve the photo object path from verification_photos.
  const photoId = photoArtifactId || assignment.verification_artifact_id
  if (!photoId) return { status: 'no_photo' }
  const { data: photo } = await supabase.from('verification_photos')
    .select('photo_url, media_type').eq('id', photoId).maybeSingle()
  const photoRow = photo as { photo_url?: string; media_type?: string } | null
  if (!photoRow?.photo_url) return { status: 'photo_row_missing' }
  if (photoRow.media_type && photoRow.media_type !== 'photo' && photoRow.media_type !== 'image') return { status: 'not_an_image' }

  const img = await loadImage(supabase, photoRow.photo_url)
  if (!img) return { status: 'image_unreadable' }

  // Dare description for context.
  const { data: tmpl } = await supabase.from('public_dare_templates').select('description, kind').eq('id', assignment.template_id).maybeSingle()
  const desc = (tmpl as { description?: string } | null)?.description ?? 'a public dare'
  const userText = `She just did this for you: "${desc}". This is her proof photo. React.`

  let text = await callAnthropicVision(img.base64, img.mediaType, userText)
  if (!text || isRefusal(text)) {
    const alt = await callOpenRouterVision(img.base64, img.mediaType, userText)
    if (alt && !isRefusal(alt)) text = alt
  }
  const reaction = mommyVoiceCleanup((text || '').trim())
  if (reaction.length < 15) return { status: 'no_reaction' }

  // Store + deliver.
  await supabase.from('public_dare_assignments').update({
    mommy_reaction_text: reaction, mommy_reaction_at: new Date().toISOString(),
  }).eq('id', assignmentId)

  const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
    user_id: userId,
    message: reaction,
    urgency: 'high',
    trigger_reason: `dare_photo_react:${assignmentId}`,
    source: 'public_dare',
    kind: 'dare_photo_reaction',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    evidence_kind: 'voice',
    context_data: { assignment_id: assignmentId, photo_id: photoId },
  }).select('id').single()

  await logAuthority(supabase, {
    user_id: userId, surface: 'public_dare', action: 'photo_reaction',
    target_table: 'public_dare_assignments', target_id: assignmentId,
    summary: 'Reacted to a dare proof photo with body commentary',
    payload: { outreach_id: (outreach as { id: string } | null)?.id ?? null }, autonomous: true,
  })

  return { status: 'reacted' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  let body: { user_id?: string; assignment_id?: string; photo_artifact_id?: string } = {}
  try { body = await req.json() } catch { /* */ }
  if (!body.user_id || !body.assignment_id) return new Response(JSON.stringify({ ok: false, error: 'user_id and assignment_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const result = await react(supabase, body.user_id, body.assignment_id, body.photo_artifact_id)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
