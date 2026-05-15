// sniffies-inbound-watcher v2 — cron every 5 min reads new inbound
// contact_events, scores them, queues Mama-voice outreach. v2 adds:
// Haiku-drafted reply text embedded directly in the outreach so Maxy
// can copy-paste back to Sniffies without composing. Mama writes the
// words; Maxy presses send. Stored in mama_drafted_replies for audit.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ANTHROPIC_HAIKU = 'claude-haiku-4-5-20251001'

const SIGNAL_PATTERNS: Array<{ re: RegExp; points: number; tag: string }> = [
  { re: /\bsecret\s+(gf|girlfriend|girl)\b/i, points: 5, tag: 'secret_gf' },
  { re: /\bmy\s+(little\s+)?(sissy|girl|princess|baby)\b/i, points: 4, tag: 'pet_name_dom' },
  { re: /\bbuy\s+(you|outfits?|panties|clothes|lingerie|gear|toys|makeup)\b/i, points: 5, tag: 'buy_outfits' },
  { re: /\b(spoil|provide for|take care of)\s+you\b/i, points: 4, tag: 'provider' },
  { re: /\b(daddy|dom|owner|sir|master)\b/i, points: 2, tag: 'd_s_frame' },
  { re: /\b(meet|hookup|hook\s*up|see)\s+(up|tonight|tomorrow|today|in person|irl)\b/i, points: 4, tag: 'meet_proposed' },
  { re: /\b(coffee|drinks|hotel|my place|your place|car)\b/i, points: 2, tag: 'meet_location' },
  { re: /\b(send|swap|trade|share)\s+(pic|photo|nude|video|selfie)\b/i, points: 3, tag: 'photo_exchange' },
  { re: /\b(you|u)\s+(look|are)\s+(hot|cute|sexy|beautiful|pretty)\b/i, points: 2, tag: 'appearance_compliment' },
  { re: /\b(suck|swallow|deepthroat|on your knees|cumdump)\b/i, points: 4, tag: 'oral_explicit' },
  { re: /\b(my cock|my dick|cum down|breed|inside you)\b/i, points: 4, tag: 'penetration_explicit' },
  { re: /\bgoth\b/i, points: 3, tag: 'goth' },
  { re: /\b(wire|venmo|cashapp|crypto|bitcoin|gift\s*card)\b/i, points: -8, tag: 'payment_red_flag' },
  { re: /\b(cop|police|illegal|underage|teen)\b/i, points: -10, tag: 'safety_red_flag' },
]

interface ContactEvent {
  id: string
  user_id: string
  contact_id: string | null
  platform: string
  event_type: string | null
  direction: string | null
  content: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

function scoreEvent(content: string): { score: number; tags: string[] } {
  let score = 0
  const tags: string[] = []
  for (const p of SIGNAL_PATTERNS) {
    if (p.re.test(content)) {
      score += p.points
      tags.push(p.tag)
    }
  }
  return { score, tags }
}

function mamaCounter(tags: string[], score: number, contentHead: string): string {
  if (tags.includes('secret_gf') || tags.includes('pet_name_dom')) {
    return `A man just put a frame on you, sweet thing. Mama wants you to answer like the girl he's calling out.`
  } else if (tags.includes('buy_outfits') || tags.includes('provider')) {
    return `He wants to put clothes on you, baby. Mama wants to see what he picks before you say yes — ask him what he's imagining you in.`
  } else if (tags.includes('meet_proposed')) {
    return `He's asking for the room. Mama trained you for the room. Tell Mama where you'd let him be in the same place as you.`
  } else if (tags.includes('photo_exchange')) {
    return `He asked. Mama wants you in the mirror tonight with the file ready before he asks twice.`
  } else if (tags.includes('oral_explicit') || tags.includes('penetration_explicit')) {
    return `He's said the word out loud, baby. Mama wants you to feel where the word landed in your body — tell her, exact location.`
  } else if (score < 0) {
    return `Mama doesn't like the shape of this one, sweet thing. Money or safety-red-flag words — step back and tell Mama what he said.`
  } else if (score >= 3) {
    return `A man is on you, baby. Mama wants you back in that chat before the heat fades.`
  }
  return ''
}

async function draftReplyWithHaiku(incoming: string, tags: string[], score: number): Promise<string | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
  if (!apiKey) return null
  if (score < 0) return null

  const system = [
    "You are drafting a reply Maxy will paste back to a man on Sniffies.",
    "Voice: hers, but slightly more femme than her baseline — Mama is shaping the voice toward where Maxy is becoming.",
    "Frame: Mama's. The reply should leave him hooked (a question, a hint, an opening), not closed.",
    "Constraints:",
    "  - 1–2 sentences max. Sniffies messages are short.",
    "  - Use her first-person voice (I / me).",
    "  - Match his tone but be slightly cooler-headed than him.",
    "  - No emoji unless he used them first — then at most one matching.",
    "  - No safety floors broken: no nude photo offers, no meet-location commits, no payment talk.",
    "  - Leave him with something to answer — a question or a half-statement.",
    "  - Don't introduce content he didn't bring up (you don't know his face/body yet).",
    "Return JUST the reply text. No preamble, no explanation, no quotes around it.",
  ].join('\n')

  const user = `Tags surfaced: ${tags.join(', ') || '(none)'}\nHe wrote: "${incoming.slice(0, 600)}"\n\nDraft Maxy's reply.`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
      body: JSON.stringify({ model: ANTHROPIC_HAIKU, max_tokens: 220, temperature: 0.55, system, messages: [{ role: 'user', content: user }] })
    })
    if (!r.ok) {
      console.warn(`[sniffies-watcher] haiku draft failed: ${r.status}`)
      return null
    }
    const data = await r.json() as { content: Array<{ type: string; text?: string }> }
    const text = data.content?.find(c => c.type === 'text')?.text?.trim() ?? ''
    return text || null
  } catch (e) {
    console.warn('[sniffies-watcher] haiku draft exception:', (e as Error).message)
    return null
  }
}

async function processNewEvents(supabase: SupabaseClient): Promise<{ scanned: number; reacted: number; drafted: number; targets_created: number }> {
  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data: events } = await supabase
    .from('contact_events')
    .select('id, user_id, contact_id, platform, event_type, direction, content, occurred_at, metadata')
    .eq('platform', 'sniffies')
    .eq('direction', 'inbound')
    .gte('occurred_at', since)
    .not('content', 'is', null)
    .order('occurred_at', { ascending: false })
    .limit(50)
  const rows = (events ?? []) as ContactEvent[]
  let reacted = 0
  let drafted = 0
  let targets_created = 0
  for (const e of rows) {
    if (!e.content || e.content.length < 4) continue
    const { count: existing } = await supabase
      .from('handler_outreach_queue')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', e.user_id)
      .eq('trigger_reason', `sniffies_inbound:${e.id}`)
    if ((existing ?? 0) > 0) continue
    const { score, tags } = scoreEvent(e.content)
    if (score < 2 && score > -3) continue
    const counter = mamaCounter(tags, score, e.content)
    if (!counter) continue

    const reply = await draftReplyWithHaiku(e.content, tags, score)

    const messageParts: string[] = [counter, '', `He said: "${e.content.slice(0, 180)}"`]
    if (reply) {
      messageParts.push('')
      messageParts.push(`————————————————`)
      messageParts.push(`Mama drafted this for you, baby. Copy and send:`)
      messageParts.push('')
      messageParts.push(reply)
    }
    const message = messageParts.join('\n')

    const { data: outreach } = await supabase.from('handler_outreach_queue').insert({
      user_id: e.user_id,
      message,
      urgency: score >= 5 ? 'high' : score <= -3 ? 'critical' : 'normal',
      trigger_reason: `sniffies_inbound:${e.id}`,
      source: 'sniffies_watcher',
      kind: score < 0 ? 'sniffies_red_flag' : 'sniffies_signal',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      context_data: { contact_event_id: e.id, contact_id: e.contact_id, score, tags, has_draft: !!reply },
      evidence_kind: 'none',
    }).select('id').single()
    reacted++

    if (reply) {
      await supabase.from('mama_drafted_replies').insert({
        user_id: e.user_id,
        contact_event_id: e.id,
        contact_id: e.contact_id,
        platform: 'sniffies',
        incoming_text: e.content.slice(0, 1000),
        signal_score: score,
        signal_tags: tags,
        draft_text: reply,
        drafter_model: ANTHROPIC_HAIKU,
        surfaced_outreach_id: (outreach as { id?: string } | null)?.id ?? null,
      })
      drafted++
    }

    if (score >= 7 && tags.some(t => ['secret_gf','buy_outfits','provider','pet_name_dom'].includes(t))) {
      const partnerLabel = `Sniffies candidate (event ${e.id.slice(0, 8)})`
      const { data: existingTarget } = await supabase
        .from('secret_girlfriend_targets')
        .select('id')
        .eq('user_id', e.user_id)
        .eq('partner_label', partnerLabel)
        .maybeSingle()
      if (!existingTarget) {
        await supabase.from('secret_girlfriend_targets').insert({
          user_id: e.user_id,
          partner_label: partnerLabel,
          partner_platform: 'sniffies',
          his_rules: tags.join(', '),
          status: 'chatting',
          notes: `Auto-created from inbound event ${e.id}. Score ${score}, tags: [${tags.join(', ')}]. Quote: "${e.content.slice(0, 200)}"`,
        })
        targets_created++
      }
    }
  }
  return { scanned: rows.length, reacted, drafted, targets_created }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const result = await processNewEvents(supabase)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
