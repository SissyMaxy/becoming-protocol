// cock-curriculum-daily-nudge — daily Mama-voice push tied to current
// phase of the cock curriculum (mig 437). Mirrors cum_worship's daily
// surface pattern. Cron 09:00 CT (14:00 UTC) so it lands before the
// rest of the day's protocol queue.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function safewordActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_safeword_active', { uid: userId, window_seconds: 60 })
    return Boolean(data)
  } catch { return false }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const { data: enabledUsers } = await supabase
    .from('cock_curriculum_settings')
    .select('user_id, current_phase, paused_until')
    .eq('enabled', true)
  const rows = (enabledUsers ?? []) as Array<{ user_id: string; current_phase: number; paused_until: string | null }>
  const out: Array<{ user_id: string; status: string; phase?: number }> = []
  for (const r of rows) {
    if (r.paused_until && new Date(r.paused_until).getTime() > Date.now()) { out.push({ user_id: r.user_id, status: 'paused' }); continue }
    if (await safewordActive(supabase, r.user_id)) { out.push({ user_id: r.user_id, status: 'safeword' }); continue }
    const { data: phaseRow } = await supabase
      .from('cock_curriculum_ladder')
      .select('phase, phase_name, solo_directive, partnered_directive, craving_mantra')
      .eq('phase', r.current_phase).maybeSingle()
    const phase = phaseRow as { phase: number; phase_name: string; solo_directive: string; partnered_directive: string; craving_mantra: string } | null
    if (!phase) { out.push({ user_id: r.user_id, status: 'no_phase_def' }); continue }
    const { data: phrases } = await supabase
      .from('cock_curriculum_phrase_library')
      .select('phrase')
      .eq('phase', r.current_phase).eq('active', true).limit(20)
    const phraseList = ((phrases ?? []) as Array<{ phrase: string }>).map(p => p.phrase)
    const phrase = phraseList.length > 0 ? phraseList[Math.floor(Math.random() * phraseList.length)] : phase.craving_mantra
    const directive = (Math.floor(Date.now() / 86400000) % 2 === 0) ? phase.solo_directive : phase.partnered_directive
    const message = `Phase ${phase.phase} — ${phase.phase_name}\n\n${directive}\n\n${phrase}`
    await supabase.from('handler_outreach_queue').insert({
      user_id: r.user_id,
      message,
      urgency: 'normal',
      trigger_reason: `cock_curriculum_daily:p${phase.phase}:${new Date().toISOString().slice(0,10)}`,
      source: 'cock_curriculum',
      kind: 'cock_curriculum_daily',
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
      context_data: { phase: phase.phase, phase_name: phase.phase_name, phrase },
      evidence_kind: phase.phase >= 2 ? 'photo' : 'audio',
    })
    out.push({ user_id: r.user_id, status: 'pushed', phase: phase.phase })
  }
  return new Response(JSON.stringify({ ok: true, processed: rows.length, results: out }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
