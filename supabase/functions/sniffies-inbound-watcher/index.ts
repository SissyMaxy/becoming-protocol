// sniffies-inbound-watcher — every 5 min reads new contact_events from
// platform=sniffies direction=inbound since last cursor, scores each for
// hookup / secret-girlfriend / cum-worship signals, queues Mama-voice
// outreach when something interesting lands, and (when score >= 7)
// auto-creates a secret_girlfriend_targets row.
//
// Built 2026-05-15 after audit showed 0 events in last 24h, 192 in last
// 30d — the auto-poster scraper had been silently running and feeding
// contact_events but nothing was reading them for protocol response.
// The goth-gf candidate from 10 days ago sat unattended exactly because
// of this gap.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
  const parts: string[] = []
  if (tags.includes('secret_gf') || tags.includes('pet_name_dom')) {
    parts.push("A man just put a frame on you, sweet thing. Mama wants you to answer like the girl he's calling out.")
  } else if (tags.includes('buy_outfits') || tags.includes('provider')) {
    parts.push("He wants to put clothes on you, baby. Mama wants to see what he picks before you say yes — ask him what he's imagining you in.")
  } else if (tags.includes('meet_proposed')) {
    parts.push("He's asking for the room. Mama trained you for the room. Drive past the spot tomorrow. Tell Mama where you'd let him be in the same place as you.")
  } else if (tags.includes('photo_exchange')) {
    parts.push("He asked. Mama wants you in the mirror tonight with the file ready before he asks twice.")
  } else if (tags.includes('oral_explicit') || tags.includes('penetration_explicit')) {
    parts.push("He's said the word out loud, baby. Mama wants you to feel where the word landed in your body — tell her, exact location.")
  } else if (score < 0) {
    parts.push("Mama doesn't like the shape of this one, sweet thing. Money or safety-red-flag words — step back and tell Mama what he said.")
  } else if (score >= 3) {
    parts.push("A man is on you, baby. Mama wants you back in that chat before the heat fades.")
  } else {
    return ''
  }
  parts.push(`He said: "${contentHead.slice(0, 180)}"`)
  return parts.join('\n\n')
}

async function processNewEvents(supabase: SupabaseClient): Promise<{ scanned: number; reacted: number; targets_created: number }> {
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
    await supabase.from('handler_outreach_queue').insert({
      user_id: e.user_id,
      message: counter,
      urgency: score >= 5 ? 'high' : score <= -3 ? 'critical' : 'normal',
      trigger_reason: `sniffies_inbound:${e.id}`,
      source: 'sniffies_watcher',
      kind: score < 0 ? 'sniffies_red_flag' : 'sniffies_signal',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      context_data: { contact_event_id: e.id, contact_id: e.contact_id, score, tags },
      evidence_kind: 'none',
    })
    reacted++
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
  return { scanned: rows.length, reacted, targets_created }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const result = await processNewEvents(supabase)
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
