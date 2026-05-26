/**
 * One-off triage of the stale mommy_code_wishes queue (2026-05-26).
 *
 * The queue was 15 wishes dated 5/10–5/11. Per the 2026-05-25 signal
 * (live mommy beats the scheduled protocol — memory:
 * project_live_mommy_beats_protocol), timer/anniversary mechanics that
 * "tell me what to do and when" are the wrong direction; several wishes
 * were also already shipped or are architecturally impossible.
 *
 * This applies each disposition by id-prefix against the *queued* set only,
 * so it is safe to re-run (already-resolved rows won't match). #6
 * (873aedbe — wardrobe photo → immediate Mommy reaction) is intentionally
 * NOT touched here; it is the one keeper and gets marked shipped after build.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Disposition =
  | { action: 'ship'; commit: string; notes: string }
  | { action: 'reject'; reason: string }

// keyed by 8-char id prefix
const PLAN: Record<string, Disposition> = {
  '8b836394': {
    action: 'ship',
    commit: '0f1f96e',
    notes: 'Implemented by mig 580: classify_cron_failure() classifies return_message into 12 failure modes, cron_failure_log is the signature table, cron_job_health view surfaces per-job state. Consolidated into one migration (no separate edge fn needed).',
  },
  '74569c6e': {
    action: 'reject',
    reason: 'Architecturally impossible: Supabase blocks DDL on the cron schema, so cron.job_run_details cannot take an error_message column. The underlying need (capture + classify cron errors) is met by mig 580 public-schema cron_failure_log wrapper.',
  },
  '6c2e20f9': {
    action: 'reject',
    reason: 'Stale premise. The "6 never-run jobs" symptom was addressed by moving heavy crons to GitHub Actions (mig 332) plus stagger/prune (mig 327-329); visibility is now mig 580 cron_job_health. A pg_cron schedule auto-resolver targets a deprecated surface. If conflicts recur, fix at the GH-Actions scheduling layer.',
  },
  '837ed9ab': {
    action: 'ship',
    commit: '0f1f96e',
    notes: 'handler-outreach now uses persona-keyed opening pools — possessive/teasing/hungry Mommy variants, all telemetry refs demoted to hr_forensic so they never reach the opening line. Judge_rank 1.',
  },
  '21d48a99': {
    action: 'ship',
    commit: '0f1f96e',
    notes: 'mommy-leak-cascade writes paired outreach next to each touch task, framed "Mama caught herself slipping — help her come back" with the quoted clinical snippet. Judge_rank 2.',
  },
  '9efba820': {
    action: 'reject',
    reason: 'Conflicts with the live Gina co-participation arc (mig 455; baseline-use 2026-05-25 — she is becoming a real co-mommy). A weekly cron firing FABRICATED Gina observations lags and undercuts real Gina — the exact "protocol is behind where I am with Gina" problem from 5/25. A second voice belongs in live chat reading real state, not on a timer.',
  },
  '2da11f3e': {
    action: 'reject',
    reason: 'Voice training already exists: mig 374 voice_lesson_curriculum + VoiceGate v2 (Whisper-authoritative) + WhisperToMama at /#/whisper. The net-new ask here is "penalty for masculine vocal slips / forced feminine scoring," which violates the standing rule: track natural pitch over time, do not force feminine targets — forcing causes dysphoria.',
  },
  '72909270': {
    action: 'reject',
    reason: 'Superseded by the gina_disclosure_pressure 7-rung ladder (mig 449): panty_drop→full_disclosure, photo/voice/text proof per rung, variable cadence, pause-respect. The timed-draft mechanic here is the weaker earlier form of that already-shipped system.',
  },
  'e67e3a06': {
    action: 'reject',
    reason: 'HRT-gated (hrt_30d+); user is pre-HRT so it cannot fire. Biweekly photo/voice/measurement ledger is a timer mechanic — the archetype 5/25 says to stop. Permanence is already covered by the irreversibility ladder (mig 538-543). Revisit post-HRT as a live-offered ritual, not a biweekly cron.',
  },
  '5bc044e3': {
    action: 'reject',
    reason: 'HRT-gated (hrt_30d); user is pre-HRT so it cannot fire. "Estrogen-cycle reframing" also risks medical fabrication — framing mood as estrogen effects without an active regimen violates the no-medical-fabrication rule. Revisit only with active-regimen context.',
  },
  '8e840336': {
    action: 'ship',
    commit: 'mig-415',
    notes: 'Already shipped as mig 415 disclosure_rehearsal_compulsion ("try it on me first" rehearsal), reinforced by mig 508 disclosure_courage rehearsal trance and mig 418 disclosure_near_misses. The mechanic exists.',
  },
  '84e0d0dc': {
    action: 'reject',
    reason: 'HRT-gated (hrt_90d); user is pre-HRT so it cannot fire. 90-day anniversary ritual is a timer mechanic. Old-self archival is already served by the irreversibility ladder (mig 538-543) + ego-deconstruction (mig 375-379). Revisit post-HRT as a live ritual.',
  },
  '5926e04d': {
    action: 'reject',
    reason: 'HRT-gated (hrt_30d+); user is pre-HRT so it cannot fire. Comparative reality anchor is timer-based. Revisit post-HRT, and as a live-offered reflection rather than a scheduled fire.',
  },
  '5de482f3': {
    action: 'reject',
    reason: 'HRT-gated milestones; user is pre-HRT so it cannot fire. Pure anniversary-timer mechanic — the exact "tell me what to do and when" pattern 5/25 flags. Revisit post-HRT.',
  },
}

async function run(): Promise<void> {
  const { data: queued, error } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, status')
    .eq('status', 'queued')
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }

  const rows = queued || []
  let shipped = 0, rejected = 0, skipped = 0
  console.log(`\nTriage 2026-05-26 — ${rows.length} queued wishes\n${'='.repeat(60)}`)

  for (const [prefix, disp] of Object.entries(PLAN)) {
    const matches = rows.filter(r => r.id.startsWith(prefix))
    if (matches.length !== 1) {
      console.log(`  SKIP ${prefix}… — ${matches.length} matches in queued set (already resolved?)`)
      skipped++
      continue
    }
    const w = matches[0]
    if (disp.action === 'ship') {
      const { error: e } = await supabase.from('mommy_code_wishes').update({
        status: 'shipped',
        shipped_at: new Date().toISOString(),
        shipped_in_commit: disp.commit,
        ship_notes: disp.notes,
      }).eq('id', w.id).eq('status', 'queued')
      if (e) { console.log(`  ERR  ship ${prefix}… ${e.message}`); continue }
      console.log(`  SHIP ${prefix}… ${w.wish_title}  (@${disp.commit})`)
      shipped++
    } else {
      const { error: e } = await supabase.from('mommy_code_wishes').update({
        status: 'rejected',
        rejection_reason: disp.reason,
      }).eq('id', w.id).eq('status', 'queued')
      if (e) { console.log(`  ERR  reject ${prefix}… ${e.message}`); continue }
      console.log(`  REJ  ${prefix}… ${w.wish_title}`)
      rejected++
    }
  }

  const { count } = await supabase
    .from('mommy_code_wishes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'queued')

  console.log(`${'='.repeat(60)}`)
  console.log(`shipped=${shipped} rejected=${rejected} skipped=${skipped}`)
  console.log(`remaining queued: ${count ?? '?'} (expect 1 — #6 873aedbe wardrobe-photo reaction, kept for build)`)
}

run().catch(e => { console.error(e); process.exit(1) })
