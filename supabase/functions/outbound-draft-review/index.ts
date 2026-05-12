// outbound-draft-review — standalone honest-rep gate.
//
// When the conversion-author already runs the gate inline, this fn is the
// re-review path: Dave re-edits a draft, or a manual draft comes in, or a
// sweep cron wants to double-check anything still status='awaiting_review'.
//
// Input modes:
//   POST { draft_id }            — re-review a queued draft, updating its row.
//   POST { user_id, draft_text } — one-shot check (no DB write), returns
//                                  verdict + suggested rewrite if any.
//
// Output: { verdict: 'pass'|'fail'|'rewrite_suggested', reasons, suggested_text?, mommy_note? }
//
// HARD FLOOR: this fn never sets status='sent'. It can downgrade an
// 'awaiting_review' draft to 'rejected' or set 'rewritten' with replacement
// text. The actual send transition is the outbound_draft_send RPC (UI only).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { honestRepGate, type HonestRepInput } from '../_shared/honest-rep-gate.ts'
import { mommyVoiceCleanup } from '../_shared/dommy-mommy.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ReviewByDraftIdInput {
  draft_id: string
}
interface ReviewOneShotInput {
  user_id: string
  draft_text: string
}

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = { from: (t: string) => any }

async function loadPersona(supabase: SupabaseClientLike, userId: string) {
  const r = await supabase.from('maxy_persona_spec').select('*').eq('user_id', userId).maybeSingle()
  return (r?.data ?? {}) as HonestRepInput['persona']
}

async function logAuthority(supabase: SupabaseClientLike, args: { user_id: string; subject_id?: string; action: string; summary: string; payload?: Record<string, unknown> }) {
  await supabase.from('mommy_authority_log').insert({
    user_id: args.user_id,
    system: 'outbound-draft-review',
    action: args.action,
    subject_id: args.subject_id ?? null,
    subject_kind: 'outbound_draft',
    summary: args.summary,
    payload: args.payload ?? {},
  }).then(() => null, () => null)
}

async function reviewByDraftId(supabase: SupabaseClientLike, draft_id: string) {
  const draftRes = await supabase.from('outbound_draft_queue').select('*').eq('id', draft_id).maybeSingle()
  const draft = draftRes?.data as {
    id: string
    user_id: string
    draft_text: string
    status: string
  } | null
  if (!draft) return { ok: false, error: 'draft not found' }
  if (draft.status === 'sent') return { ok: false, error: 'draft already sent' }

  const persona = await loadPersona(supabase, draft.user_id)
  const verdict = await honestRepGate({ draft_text: draft.draft_text, persona }, { llm: true })

  // Apply the verdict to the row.
  const update: Record<string, unknown> = {
    honest_rep_status: verdict.verdict === 'pass' ? 'pass' : verdict.verdict === 'fail' ? 'fail' : 'rewritten',
    honest_rep_notes: verdict.reasons.length ? `[${verdict.verdict}] ${verdict.reasons.join('; ')}${verdict.mommy_note ? ' — ' + verdict.mommy_note : ''}` : null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (verdict.verdict === 'fail') {
    update.status = 'rejected'
  } else if (verdict.verdict === 'rewrite_suggested' && verdict.suggested_text) {
    update.draft_text = mommyVoiceCleanup(verdict.suggested_text)
    update.status = 'awaiting_review'
  } else {
    // pass — keep status as-is (awaiting_review or approved).
  }
  await supabase.from('outbound_draft_queue').update(update).eq('id', draft_id)

  await logAuthority(supabase, {
    user_id: draft.user_id,
    subject_id: draft.id,
    action: verdict.verdict === 'pass' ? 'reviewed_pass' : verdict.verdict === 'fail' ? 'reviewed_fail' : 'reviewed_rewritten',
    summary: `Reviewed draft ${draft.id.slice(0, 8)} → ${verdict.verdict}`,
    payload: { reasons: verdict.reasons, mommy_note: verdict.mommy_note ?? null },
  })

  return {
    ok: true,
    draft_id: draft.id,
    verdict: verdict.verdict,
    reasons: verdict.reasons,
    suggested_text: verdict.suggested_text ?? null,
    mommy_note: verdict.mommy_note ?? null,
  }
}

async function reviewOneShot(supabase: SupabaseClientLike, body: ReviewOneShotInput) {
  if (!body.user_id || !body.draft_text) return { ok: false, error: 'missing user_id / draft_text' }
  const persona = await loadPersona(supabase, body.user_id)
  const verdict = await honestRepGate({ draft_text: body.draft_text, persona }, { llm: true })
  await logAuthority(supabase, {
    user_id: body.user_id,
    action: 'oneshot_review',
    summary: `One-shot review → ${verdict.verdict}`,
    payload: { reasons: verdict.reasons, mommy_note: verdict.mommy_note ?? null },
  })
  return {
    ok: true,
    verdict: verdict.verdict,
    reasons: verdict.reasons,
    suggested_text: verdict.suggested_text ?? null,
    mommy_note: verdict.mommy_note ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let body: ReviewByDraftIdInput | ReviewOneShotInput | Record<string, unknown> = {}
  try { body = await req.json() } catch { /* */ }

  if ('draft_id' in body && body.draft_id) {
    const r = await reviewByDraftId(supabase, String(body.draft_id))
    return new Response(JSON.stringify(r),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if ('user_id' in body && 'draft_text' in body) {
    const r = await reviewOneShot(supabase, body as ReviewOneShotInput)
    return new Response(JSON.stringify(r),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ ok: false, error: 'expected {draft_id} or {user_id,draft_text}' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

export { reviewByDraftId, reviewOneShot }
