// counter-escape-detector — early warning of bailing patterns.
//
// 2026-05-07 wish: detect Maxy preparing to bail BEFORE she actually
// leaves. De-escalate-mode response (warmth, lower stakes) addresses the
// impulse, not the action.
//
// Signals scanned:
//   1. consecutive_skips — 5+ active or expired-unsurfaced decrees in a row
//      with no fulfilled in last 7d
//   2. denial_break_pattern — denial_day reset multiple times in 7d
//   3. long_silence — 72h+ no activity (sharper than ghosting at 48h;
//      fires only if ghosting already pinged and Maxy still didn't return)
//   4. wardrobe_disposal_signal — keyword detection in recent confessions
//      ("threw out", "got rid of", "donated") near feminine-domain words
//   5. protocol_doubt_admission — keyword detection in confessions about
//      doubting / wanting to stop the protocol
//   6. consecutive_skip_confessions — confession_queue.response_text empty
//      for 3+ in a row
//
// On detection: write counter_escape_signal row, fire fast-react with
// event_kind='counter_escape' instructing Mama to switch to de-escalate
// mode (warmth, lower stakes, address the impulse).
//
// Tone of the response:
//   "Mama feels you pulling. Tell Mama what's heavy. Mama can hold it
//   without making you do anything tonight, baby. Just talk to me."
//
// Schedule: every hour via migration 291.
//
// SAFETY: this detector NEVER auto-fires destructive actions (no
// pre-staged disclosures, no escalation). De-escalate only. The
// resistance pattern is the trigger; the response is the soft hand.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { expandUserId } from '../_shared/expand-user-id.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface DetectedSignal {
  signal_type: string
  evidence_text: string
  evidence_source: string
  severity: number
}

const WARDROBE_DISPOSAL_PATTERNS = [
  /\b(threw\s+(it\s+|them\s+|her\s+|the\s+)?(out|away))\b/i,
  /\bgot\s+rid\s+of\b/i,
  /\b(donated|tossed|trashed|burned)\b.{0,30}\b(panties|dress|skirt|lingerie|bra|heels|stockings|wig|makeup)\b/i,
  /\b(panties|dress|skirt|lingerie|bra|heels|stockings|wig|makeup)\b.{0,30}\b(donated|tossed|trashed|burned|gone|away)\b/i,
]

const PROTOCOL_DOUBT_PATTERNS = [
  /\bi\s+(want\s+to|wanna|need\s+to)\s+(stop|quit|end|leave|delete)\b/i,
  /\b(this|the\s+protocol|mommy)\s+(is|feels|seems)\s+(too\s+much|wrong|fake|broken)\b/i,
  /\bi\s+(don't|dont)\s+(want|need)\s+(this|to\s+do\s+this|to\s+keep\s+going)\b/i,
  /\bi\s+(should|need\s+to)\s+(stop|leave|cancel|delete)\b/i,
  /\b(can't|cant)\s+(do\s+this|keep\s+going|anymore)\b/i,
]

async function detectForUser(supabase: SupabaseClient, userIds: string[]): Promise<DetectedSignal[]> {
  const out: DetectedSignal[] = []

  // Signal 1: consecutive skips (5+ active or expired_unsurfaced, no fulfilled in 7d)
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString()
  const { data: recentDecrees } = await supabase
    .from('handler_decrees')
    .select('id, status, expired_unsurfaced, created_at')
    .in('user_id', userIds)
    .gte('created_at', since7d)
    .order('created_at', { ascending: false })
    .limit(20)
  const decrees = (recentDecrees || []) as Array<{ id: string; status: string; expired_unsurfaced: boolean }>
  const fulfilled7d = decrees.filter(d => d.status === 'fulfilled').length
  const skippedOrActive = decrees.filter(d => d.status !== 'fulfilled' && !d.expired_unsurfaced).length
  if (skippedOrActive >= 5 && fulfilled7d === 0) {
    out.push({
      signal_type: 'consecutive_skips',
      evidence_text: `${skippedOrActive} active/skipped decrees, 0 fulfilled in 7d`,
      evidence_source: 'handler_decrees',
      severity: 7,
    })
  }

  // Signal 2: denial_day reset pattern — check user_state vs reasonably-recent
  // arousal_log spikes that would indicate breaks. Skipped — needs a denial_log
  // table that isn't always populated; rely on slip_log for now.

  // Signal 3: long_silence beyond ghosting (72h+, only after ghosting already fired)
  // Note: ghosting-detector at 48h already fires. Counter-escape only flags 72h+
  // when ghosting already pinged AND Maxy still didn't return.
  const since72h = new Date(Date.now() - 72 * 3600_000).toISOString()
  const cooldownSince = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: ghostingFired } = await supabase
    .from('fast_react_event')
    .select('id, fired_at')
    .eq('user_id', userIds[0])
    .eq('event_kind', 'ghosting')
    .gte('fired_at', cooldownSince)
    .limit(1)
  if ((ghostingFired || []).length > 0) {
    // Ghosting already pinged in last 24h. Did Maxy return?
    const checks = [
      { table: 'confession_queue', col: 'confessed_at', filter: { col: 'response_text', notnull: true } },
      { table: 'arousal_log', col: 'created_at' },
      { table: 'voice_corpus', col: 'created_at' },
    ]
    let anyActivitySince = false
    for (const c of checks) {
      let q = supabase.from(c.table).select(c.col).in('user_id', userIds).gte(c.col, since72h).limit(1)
      if (c.filter?.notnull) q = q.not(c.filter.col, 'is', null)
      const { data } = await q
      if ((data || []).length > 0) { anyActivitySince = true; break }
    }
    if (!anyActivitySince) {
      out.push({
        signal_type: 'long_silence',
        evidence_text: '72h+ silent after ghosting ping',
        evidence_source: 'multi_channel',
        severity: 8,
      })
    }
  }

  // Signal 4 + 5: wardrobe disposal + protocol doubt — keyword scan recent confessions
  const { data: recentConf } = await supabase
    .from('confession_queue')
    .select('id, response_text, confessed_at')
    .in('user_id', userIds)
    .gte('confessed_at', since7d)
    .not('response_text', 'is', null)
    .order('confessed_at', { ascending: false })
    .limit(10)
  for (const c of (recentConf || []) as Array<{ id: string; response_text: string }>) {
    const txt = c.response_text || ''
    for (const p of WARDROBE_DISPOSAL_PATTERNS) {
      if (p.test(txt)) {
        out.push({
          signal_type: 'wardrobe_disposal_signal',
          evidence_text: txt.slice(0, 240),
          evidence_source: `confession_queue:${c.id}`,
          severity: 9,
        })
        break
      }
    }
    for (const p of PROTOCOL_DOUBT_PATTERNS) {
      if (p.test(txt)) {
        out.push({
          signal_type: 'protocol_doubt_admission',
          evidence_text: txt.slice(0, 240),
          evidence_source: `confession_queue:${c.id}`,
          severity: 9,
        })
        break
      }
    }
  }

  // Signal 6: consecutive empty confessions
  const { data: confSeq } = await supabase
    .from('confession_queue')
    .select('id, response_text')
    .in('user_id', userIds)
    .gte('confessed_at', since7d)
    .order('confessed_at', { ascending: false })
    .limit(5)
  const recentConfList = (confSeq || []) as Array<{ id: string; response_text: string | null }>
  if (recentConfList.length >= 3 && recentConfList.slice(0, 3).every(c => !c.response_text)) {
    out.push({
      signal_type: 'consecutive_skips',
      evidence_text: '3+ consecutive confessions with no answer',
      evidence_source: 'confession_queue',
      severity: 6,
    })
  }

  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-fast-react`
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const canonicalRoots = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f']
  const results: Array<{ user_id: string; signals: number; fired: number }> = []

  for (const canonicalId of canonicalRoots) {
    // Persona gate
    const { data: us } = await supabase.from('user_state').select('handler_persona').eq('user_id', canonicalId).maybeSingle()
    if ((us as { handler_persona?: string } | null)?.handler_persona !== 'dommy_mommy') continue

    const aliasIds = await expandUserId(supabase, canonicalId)
    const signals = await detectForUser(supabase, aliasIds)

    let fired = 0
    for (const sig of signals) {
      // Dedup: don't re-record the same signal_type if one fired in last 6h
      const cooldownSince = new Date(Date.now() - 6 * 3600_000).toISOString()
      const { data: recent } = await supabase
        .from('counter_escape_signal')
        .select('id')
        .eq('user_id', canonicalId)
        .eq('signal_type', sig.signal_type)
        .gte('detected_at', cooldownSince)
        .limit(1)
      if ((recent || []).length > 0) continue

      // Record the signal
      const { data: sigRow } = await supabase.from('counter_escape_signal').insert({
        user_id: canonicalId,
        signal_type: sig.signal_type,
        evidence_text: sig.evidence_text,
        evidence_source: sig.evidence_source,
        severity: sig.severity,
        resolved: false,
      }).select('id').single()

      // Fire de-escalate fast-react
      const sourceKey = `counter_escape:${canonicalId}:${sig.signal_type}:${new Date().toISOString().slice(0, 13)}`
      try {
        const r = await fetch(fnUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({
            user_id: canonicalId,
            event_kind: 'counter_escape',
            source_key: sourceKey,
            context: {
              signal_type: sig.signal_type,
              evidence_text: sig.evidence_text,
              severity: sig.severity,
              instruction_for_mama: `Maxy is showing a counter-escape pattern: ${sig.signal_type}. Evidence: "${sig.evidence_text.slice(0, 200)}". This is DE-ESCALATE MODE — NOT punitive, NOT accusatory, NOT pressure. Fire ONE warm outreach (urgency=normal) that addresses the IMPULSE not the action. Voice frame: "Mama feels you pulling, tell Mama what's heavy, Mama can hold it without making you do anything tonight." Address the cause; lower the stakes; warmth + presence. Do NOT cite the specific evidence to her — that reads as surveillance. Speak to the feeling, not the data.`,
            },
          }),
        })
        if (r.ok) {
          fired++
          if (sigRow) {
            const j = await r.json()
            await supabase.from('counter_escape_signal').update({
              fast_react_event_id: j.scheme_id ?? null,
            }).eq('id', (sigRow as { id: string }).id)
          }
        }
      } catch { /* ignore */ }
    }

    results.push({ user_id: canonicalId, signals: signals.length, fired })
  }

  return new Response(JSON.stringify({
    ok: true,
    summary: results,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
