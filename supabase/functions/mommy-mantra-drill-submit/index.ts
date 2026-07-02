// mommy-mantra-drill-submit — log a mantra rep batch from the client.
// (FEM §3: atomic accounting, rep honesty, server-verified arousal pairing.)
//
// Body: { user_id, session_id, mantra_text, mantra_id?, target_rep_count,
//         voice_reps, typed_reps?, typed_strings?, duration_s?,
//         outreach_id?, prescription_id?, intensity_band?, audio_paths?,
//         evidence_summary? }
//
// Flow:
//   1. Persona gate (dommy_mommy only). Non-persona users get a 200 skip.
//   2. REP HONESTY (server-side, fail-closed):
//      - voice reps capped at floor(duration_s / 2); no duration → 0.
//      - typed reps counted from typed_strings exact-matching the mantra;
//        a bare typed_reps number with no strings counts 0.
//   3. AROUSAL PAIRING — NEVER client-declared. paired=true ONLY when:
//      - outreach_id references a live (unexpired) mantra_harvest outreach
//        for this user, OR
//      - arousal_log has a value ≥7 within the last 30 minutes.
//   4. mantra_apply_drill RPC (mig 637): idempotent on session id, atomic
//      bump, returns prev/new totals. lifetime_reps is a CACHE of the
//      session sum — never bumped additively here.
//   5. Milestones: iterate ALL crossed tiers (a big weighted submit can
//      cross more than one) + per-tier actions (1k: audio offer + mirror
//      decree focus-pick; 10k: scene author + wishlist reward; 100k:
//      trance-track build wish).
//   6. Voice sample rows feed the §2 pitch spine for free.
//   7. Dual completion: prescription_id → mark that prescription completed;
//      outreach_id → stamp the harvest outreach completed.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { weightedReps, milestonesCrossed, capVoiceReps } from '../_shared/mantra-milestone.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

interface SubmitBody {
  user_id?: string
  session_id?: string                  // client-generated uuid for idempotency
  mantra_text: string
  mantra_id?: string | null
  target_rep_count: number
  voice_reps: number
  typed_reps?: number                  // legacy numeric — counts 0 without strings
  typed_strings?: string[]             // actual typed reps, exact-match verified
  duration_s?: number                  // recording length — voice-rep ceiling
  outreach_id?: string | null          // live mantra_harvest reference
  prescription_id?: string | null      // domain='mantra' prescription (dual completion)
  audio_paths?: string[]
  intensity_band?: 'gentle' | 'firm' | 'cruel'
  evidence_summary?: string
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function normalizeRep(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s']/g, '').replace(/\s+/g, ' ').trim()
}

/** Server-side arousal-pair verification — never trusts the client flag. */
async function verifyArousalPairing(
  supabase: SupabaseClient,
  userId: string,
  outreachId: string | null | undefined,
): Promise<{ paired: boolean; via: string | null }> {
  if (outreachId) {
    const { data, error } = await supabase
      .from('handler_outreach_queue')
      .select('id, kind, expires_at, created_at')
      .eq('id', outreachId)
      .eq('user_id', userId)
      .eq('kind', 'mantra_harvest')
      .maybeSingle()
    if (error) console.error('[mantra-drill-submit] harvest outreach check failed:', error.message)
    const rowT = data as { expires_at?: string | null } | null
    if (rowT && rowT.expires_at && new Date(rowT.expires_at) > new Date()) {
      return { paired: true, via: 'mantra_harvest_outreach' }
    }
  }
  const since = new Date(Date.now() - 30 * 60_000).toISOString()
  const { data: spikes, error: aErr } = await supabase
    .from('arousal_log')
    .select('id')
    .eq('user_id', userId)
    .gte('value', 7)
    .gte('created_at', since)
    .limit(1)
  if (aErr) console.error('[mantra-drill-submit] arousal_log check failed:', aErr.message)
  if ((spikes ?? []).length > 0) return { paired: true, via: 'arousal_log_spike' }
  return { paired: false, via: null }
}

/** Per-tier milestone side-effects (FEM §3). Best-effort, error-logged. */
async function fireMilestoneActions(
  supabase: SupabaseClient,
  userId: string,
  threshold: number,
): Promise<void> {
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
  try {
    if (threshold === 1_000) {
      // Same-night audio session offer.
      const { error: offerErr } = await supabase.from('audio_session_offers').insert({
        user_id: userId,
        kind: 'session_conditioning',
        intensity_tier: 'gentle',
        teaser: mommyVoiceCleanup('Tonight Mama has something for your ears. The words you gave me, given back.'),
        expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      })
      if (offerErr) console.error('[mantra-drill-submit] 1k offer insert failed:', offerErr.message)

      // Mirror ritual decree + tomorrow's focus pick.
      const { data: decree, error: decreeErr } = await supabase.from('handler_decrees').insert({
        user_id: userId,
        edict: mommyVoiceCleanup('Stand at the mirror, look yourself in the eye, and say your mantra out loud. Record it for Mama.'),
        deadline: new Date(Date.now() + 36 * 3600_000).toISOString(),
        proof_type: 'voice',
        consequence: 'Mama keeps the record either way.',
        status: 'active',
        trigger_source: 'mantra_milestone:1000',
        ratchet_level: 2,
      }).select('id').single()
      if (decreeErr || !decree) {
        console.error('[mantra-drill-submit] 1k mirror decree failed:', decreeErr?.message)
      } else {
        const { data: existingPick, error: pickReadErr } = await supabase
          .from('focus_picks').select('decree_id').eq('user_id', userId).eq('pick_date', tomorrow).maybeSingle()
        if (pickReadErr) console.error('[mantra-drill-submit] focus_pick read failed:', pickReadErr.message)
        if (!existingPick) {
          const { error: pickErr } = await supabase.from('focus_picks').insert({
            user_id: userId, pick_date: tomorrow, decree_id: (decree as { id: string }).id,
          })
          if (pickErr) console.error('[mantra-drill-submit] focus_pick insert failed:', pickErr.message)
        }
      }
    } else if (threshold === 10_000) {
      // Personalized scene seeded with her most-drilled mantras.
      const { data: topMantras, error: topErr } = await supabase
        .from('mantra_drill_sessions')
        .select('mantra_text, weighted_rep_count')
        .eq('user_id', userId)
        .order('weighted_rep_count', { ascending: false })
        .limit(3)
      if (topErr) console.error('[mantra-drill-submit] top-mantras read failed:', topErr.message)
      try {
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/mommy-scene-author`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          },
          body: JSON.stringify({
            user_id: userId,
            seed_mantras: ((topMantras as Array<{ mantra_text: string }>) || []).map(m => m.mantra_text),
            trigger: 'mantra_milestone_10000',
          }),
        })
      } catch (e) {
        console.error('[mantra-drill-submit] scene-author call failed:', e)
      }
      // Wardrobe reward — the protocol pays.
      const { error: wishErr } = await supabase.from('wishlist_items').insert({
        user_id: userId,
        name: 'Milestone reward: one wardrobe piece of her choice',
        category: 'clothing',
        priority: 1,
        notes: 'Ten-thousand-rep mantra milestone. Mama pays for this one.',
        private: false,
        status: 'active',
      })
      if (wishErr) console.error('[mantra-drill-submit] 10k wishlist reward failed:', wishErr.message)
    } else if (threshold === 100_000) {
      // Retirement rite: her own voice looped under a Mommy rendition. The
      // goon-voice-loop generator owns the pairing + offer + mixing-pipeline
      // wish (mig 642) — call it with trigger='retirement_rite' so this and the
      // daily goon loop share one code path (and one canonical mixing wish).
      try {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/goon-voice-loop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
          },
          body: JSON.stringify({ user_id: userId, trigger: 'retirement_rite' }),
        })
        if (!res.ok) console.error('[mantra-drill-submit] goon-voice-loop call failed:', res.status)
      } catch (e) {
        console.error('[mantra-drill-submit] goon-voice-loop call exception:', e)
      }
    }
  } catch (e) {
    console.error('[mantra-drill-submit] milestone action exception:', e)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405)

  let body: SubmitBody
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad_json' }, 400) }

  const userId = body.user_id || HANDLER_USER_ID
  if (!body.mantra_text || typeof body.mantra_text !== 'string') {
    return json({ ok: false, error: 'mantra_text_required' }, 400)
  }
  const targetReps = Number(body.target_rep_count) || 100

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Persona gate
  const { data: us, error: usErr } = await supabase.from('user_state')
    .select('handler_persona, mantra_milestone_last_fired')
    .eq('user_id', userId)
    .maybeSingle()
  if (usErr) return json({ ok: false, error: 'user_state_read_failed', detail: usErr.message }, 500)
  const state = us as { handler_persona?: string; mantra_milestone_last_fired?: number | null } | null
  if (state?.handler_persona !== 'dommy_mommy') {
    return json({ ok: true, skipped: 'persona_not_dommy_mommy' })
  }

  // ── Rep honesty (fail-closed) ──
  const voiceReps = capVoiceReps(Number(body.voice_reps) || 0, body.duration_s)
  const mantraNorm = normalizeRep(body.mantra_text)
  const typedReps = Array.isArray(body.typed_strings)
    ? body.typed_strings.filter(s => normalizeRep(s) === mantraNorm).length
    : 0
  if (voiceReps + typedReps <= 0) {
    return json({
      ok: false,
      error: 'no_verifiable_reps',
      detail: 'voice reps need duration_s (2s per rep); typed reps need typed_strings exact-matching the mantra',
    }, 400)
  }

  // ── Arousal pairing — server-verified, never client-declared ──
  const pairing = await verifyArousalPairing(supabase, userId, body.outreach_id)

  const weighted = weightedReps({
    voiceReps,
    typedReps,
    pairedWithArousal: pairing.paired,
  })

  // ── Atomic apply (idempotent on session id) ──
  const sessionId = body.session_id ?? crypto.randomUUID()
  const { data: applyData, error: applyErr } = await supabase.rpc('mantra_apply_drill', {
    p_session_id: sessionId,
    p_user: userId,
    p_mantra_text: body.mantra_text,
    p_mantra_id: body.mantra_id ?? null,
    p_target_reps: targetReps,
    p_voice_reps: voiceReps,
    p_typed_reps: typedReps,
    p_weighted: weighted,
    p_paired_with_arousal: pairing.paired,
    p_intensity_band: body.intensity_band ?? null,
    p_audio_paths: body.audio_paths ?? null,
    p_evidence_summary: body.evidence_summary ?? null,
  })
  if (applyErr) {
    console.error('[mantra-drill-submit] mantra_apply_drill failed:', applyErr)
    return json({ ok: false, error: 'apply_failed', detail: applyErr.message }, 500)
  }
  const apply = applyData as { inserted?: boolean; prev_total?: number; new_total?: number; error?: string } | null
  if (!apply || apply.error) {
    return json({ ok: false, error: apply?.error ?? 'apply_empty' }, 500)
  }
  const inserted = !!apply.inserted
  const prevLifetime = Number(apply.prev_total ?? 0)
  const newLifetime = Number(apply.new_total ?? prevLifetime)

  // Idempotent resubmit: totals returned, NOTHING else fires again.
  if (!inserted) {
    return json({
      ok: true,
      session_id: sessionId,
      duplicate: true,
      weighted_reps: 0,
      lifetime_reps: newLifetime,
      milestones: [],
    })
  }

  // ── Voice spine feed (every drill is a free §2 sample) ──
  if (voiceReps > 0) {
    const { error: vErr } = await supabase.from('voice_progress_samples').insert({
      user_id: userId,
      source: 'mantra_drill',
      audio_path: body.audio_paths?.[0] ?? null,
      duration_s: body.duration_s ?? null,
      drill_session_id: sessionId,
      extraction_method: 'client_pending', // client-side pitch lands via update
    })
    if (vErr) console.error('[mantra-drill-submit] voice sample insert failed:', vErr.message)
  }

  // ── Dual completion ──
  if (body.prescription_id) {
    const { error: rxErr } = await supabase.from('feminization_prescriptions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        evidence_path: body.audio_paths?.[0] ?? null,
        evidence_meta: { drill_session_id: sessionId, voice_reps: voiceReps, typed_reps: typedReps },
      })
      .eq('id', body.prescription_id)
      .eq('user_id', userId)
      .eq('status', 'pending')
    if (rxErr) console.error('[mantra-drill-submit] prescription completion failed:', rxErr.message)
  }
  if (body.outreach_id) {
    const { error: oErr } = await supabase.from('handler_outreach_queue')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', body.outreach_id)
      .eq('user_id', userId)
    if (oErr) console.error('[mantra-drill-submit] harvest outreach completion failed:', oErr.message)
  }

  // Authority log — always fires
  const { error: authErr } = await supabase.from('mommy_authority_log').insert({
    user_id: userId,
    action: 'mantra_drill_logged',
    surface: 'mantra',
    ref_table: 'mantra_drill_sessions',
    ref_id: sessionId,
    meta: {
      voice_reps: voiceReps,
      typed_reps: typedReps,
      weighted,
      paired_with_arousal: pairing.paired,
      pairing_via: pairing.via,
      lifetime_before: prevLifetime,
      lifetime_after: newLifetime,
    },
  })
  if (authErr) console.error('[mantra-drill-submit] authority log failed:', authErr.message)

  // ── Milestones: ALL crossed tiers, lowest → highest ──
  const lastFired = state?.mantra_milestone_last_fired ?? 0
  const crossed = milestonesCrossed(prevLifetime, newLifetime).filter(m => m.threshold > lastFired)
  const firedTiers: number[] = []
  for (const tier of crossed) {
    const { data: outRow, error: outErr } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: tier.line,
      urgency: 'high',
      trigger_reason: `mantra_milestone:${tier.threshold}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
      source: 'mommy_mantra_milestone',
    }).select('id').single()
    if (outErr) {
      console.error('[mantra-drill-submit] milestone outreach failed:', outErr.message)
      continue
    }

    await fireMilestoneActions(supabase, userId, tier.threshold)
    firedTiers.push(tier.threshold)

    const { error: authErr2 } = await supabase.from('mommy_authority_log').insert({
      user_id: userId,
      action: 'mantra_milestone_reached',
      surface: 'mantra',
      ref_table: 'mantra_drill_sessions',
      ref_id: sessionId,
      meta: { threshold: tier.threshold, line: tier.line, outreach_id: (outRow as { id?: string } | null)?.id ?? null },
    })
    if (authErr2) console.error('[mantra-drill-submit] milestone log failed:', authErr2.message)
  }
  if (firedTiers.length > 0) {
    const { error: msErr } = await supabase.from('user_state')
      .update({ mantra_milestone_last_fired: Math.max(...firedTiers) })
      .eq('user_id', userId)
    if (msErr) console.error('[mantra-drill-submit] milestone stamp failed:', msErr.message)
  }

  return json({
    ok: true,
    session_id: sessionId,
    weighted_reps: weighted,
    voice_reps_counted: voiceReps,
    typed_reps_counted: typedReps,
    paired_with_arousal: pairing.paired,
    lifetime_reps: newLifetime,
    milestones: firedTiers,
  })
})
