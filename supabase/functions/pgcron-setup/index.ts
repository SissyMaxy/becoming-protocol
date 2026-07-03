// pgcron-setup — one-shot scheduler for the http-post pg_cron jobs.
//
// The Management API token isn't in this environment, so migrations can't be
// applied the normal way. Supabase injects SUPABASE_DB_URL into edge functions,
// so this connects to Postgres directly and runs cron.schedule() itself.
//
// The established cron pattern reads app.settings.{supabase_url,service_role_key}
// — but those turned out to be UNSET (null), so every existing http_post cron
// has been POSTing to a null URL. So these jobs are made SELF-CONTAINED: the URL +
// service key are baked into the job body (from this function's env — never
// git; cron.job is superuser-only). It also best-effort sets the DB settings so
// the OTHER existing crons start resolving too.
//
// 2026-07-02: generalized from the single blind-spot job to the full JOBS list —
// meet-safety dispatch drain (SAFETY-CRITICAL), evening-prescribe dispatch, and
// the outward-consequence dispatcher all ride the same rail. SQL-fn crons
// (meet_safety_watch, machine_deadman_sweep, obligation_* etc.) don't need this:
// they're plain `SELECT fn()` bodies scheduled by their own migrations and have
// no URL/key dependency.
//
// Idempotent. Never returns the key or the job command bodies.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts'

const BASE_URL = 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1'

interface CronJob {
  name: string
  schedule: string
  fn: string
  body: string // jsonb expression for the POST body
  guard?: string // optional SQL WHERE-EXISTS guard appended to the job body
}

// SAFETY-CRITICAL entries must be whitelisted in any cron prune (see
// safety_exempt_systems, mig 633).
const JOBS: CronJob[] = [
  {
    name: 'blind-spot-monitor-safety',
    schedule: '*/5 * * * *',
    fn: 'blind-spot-monitor',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // SAFETY-CRITICAL: drains meet_escalation_dispatch (stage-3 trusted-contact
    // sends + false-alarm follow-ups). Guarded so idle minutes cost nothing.
    name: 'meet-safety-dispatch-drain',
    schedule: '* * * * *',
    fn: 'meet-safety-dispatch',
    body: `'{}'::jsonb`,
    guard: `WHERE EXISTS (SELECT 1 FROM meet_escalation_dispatch WHERE status = 'pending')`,
  },
  {
    // Nightly evening-prescribe (mig 616 documents the 21:30 ET intent;
    // pinned to 01:30 UTC).
    name: 'evening-prescribe-dispatch',
    schedule: '30 1 * * *',
    fn: 'evening-prescribe-dispatch',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Enforcement spine outward rail (mig 630): preview lifecycle + fires.
    name: 'outward-consequence-dispatcher',
    schedule: '*/15 * * * *',
    fn: 'outward-consequence-dispatcher',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Auto-Generated Guilt Reports (mig 641): weekly evidence-quoted readback
    // of surfaced-then-missed obligations. Sunday 22:00 UTC (~Sun 17:00–18:00
    // ET). The fn de-dupes to one report per user per 6 days.
    name: 'guilt-report-weekly',
    schedule: '0 22 * * 0',
    fn: 'guilt-report',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Self-voice goon loop (mig 642): daily self-echo offer built from her own
    // voice_progress_samples. Gated fail-closed on conditioning_gate('goon').
    name: 'goon-voice-loop-daily',
    schedule: '15 3 * * *',
    fn: 'goon-voice-loop',
    body: `jsonb_build_object('trigger','daily')`,
  },
  {
    // Self-echo mixer (mig 643): drains pending_mix self_echo_sessions →
    // renders the Mommy track (ElevenLabs) → flips to 'mixed' with a play-time
    // manifest. Guarded so idle minutes cost nothing. The composite itself is
    // layered client-side (Web Audio, SelfEchoPlayer) — no ffmpeg mixdown.
    name: 'self-echo-mixer-drain',
    schedule: '*/5 * * * *',
    fn: 'self-echo-mixer',
    body: `jsonb_build_object('trigger','pg_cron')`,
    guard: `WHERE EXISTS (SELECT 1 FROM self_echo_sessions WHERE mix_status = 'pending_mix' AND own_voice_path IS NOT NULL)`,
  },
  {
    // Reconditioning measurement pass (migs 648-651): weekly re-measure of each
    // target's behavioral indicator + baseline capture. Read-mostly; self-gates
    // program advancement. Quiet until recondition_enabled. Mon 08:00 UTC.
    name: 'recon-measure-weekly',
    schedule: '0 8 * * 1',
    fn: 'recon-measure',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Reconditioning conductor: emits ONE phase-appropriate Focus task/day for the
    // top active target. Gated fail-closed on conditioning_gate('recondition'). 02:00 UTC.
    name: 'recon-program-orchestrator-daily',
    schedule: '0 2 * * *',
    fn: 'recon-program-orchestrator',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Turn-out conductor: consolidation check + advance + surface ONE next step.
    // Gated fail-closed on conditioning_gate('turnout'). Delegates to the live
    // engines; never a raw physical decree. 04:00 UTC.
    name: 'turnout-orchestrator-daily',
    schedule: '0 4 * * *',
    fn: 'turnout-orchestrator',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Reconsolidation: authors 'opened' sessions + fires the micro-rep INSIDE the
    // ~2h labile window — so it MUST run at least hourly (window/2). Gated.
    name: 'recon-reconsolidation-hourly',
    schedule: '0 * * * *',
    fn: 'recon-reconsolidation',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Mommy proposes <=1 new reconditioning target/week from the corpus. Gated +
    // recon_target_guard. Tue 09:00 UTC.
    name: 'recon-target-author-weekly',
    schedule: '0 9 * * 2',
    fn: 'recon-target-author',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // TMR sleep-cue builder: pre-renders already-installed cues for deep-sleep
    // replay. Double-gated (recondition + recon_sleep_enabled). Pre-sleep 03:00 UTC.
    name: 'recon-sleep-cue-nightly',
    schedule: '0 3 * * *',
    fn: 'recon-sleep-cue-builder',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
  {
    // Commitment ladder: <=1 penalty-bearing commitment rung/run via the
    // obligation ledger. Gated. 05:00 UTC.
    name: 'recon-commitment-ladder-daily',
    schedule: '0 5 * * *',
    fn: 'recon-commitment-ladder',
    body: `jsonb_build_object('trigger','pg_cron')`,
  },
]

function jobSql(j: CronJob, key: string): string {
  // Dollar-quoted with a tag that can't collide with the JWT
  // (which is [A-Za-z0-9_.-] only).
  return `SELECT cron.schedule(
    '${j.name}',
    '${j.schedule}',
    $job$SELECT net.http_post(
      url := '${BASE_URL}/${j.fn}',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${key}'),
      body := ${j.body}
    ) ${j.guard ?? ''};$job$
  )`
}

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!dbUrl || !key) {
    return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL or SERVICE_ROLE_KEY not injected' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const client = new Client(dbUrl)
  const notes: string[] = []
  try {
    await client.connect()

    // Best-effort: set the DB settings the OTHER existing http_post crons rely
    // on (they were null). Affects new sessions, which is what pg_cron uses.
    try {
      await client.queryArray(`ALTER DATABASE postgres SET app.settings.supabase_url = 'https://atevwvexapiykchvqvhm.supabase.co'`)
      await client.queryArray(`ALTER DATABASE postgres SET app.settings.service_role_key = '${key}'`)
      notes.push('set app.settings.{supabase_url,service_role_key} (fixes existing crons too)')
    } catch (e) {
      notes.push('could not set DB settings: ' + String(e).slice(0, 120))
    }

    // (Re)schedule every job — self-contained, so they work regardless.
    const installed: Array<{ jobname: string; schedule: string; active: boolean }> = []
    for (const j of JOBS) {
      try { await client.queryArray(`SELECT cron.unschedule('${j.name}')`) } catch (_) { /* none yet */ }
      await client.queryArray(jobSql(j, key))
      const row = await client.queryObject<{ jobname: string; schedule: string; active: boolean }>(
        `SELECT jobname, schedule, active FROM cron.job WHERE jobname = '${j.name}'`,
      )
      if (row.rows[0]) installed.push(row.rows[0])
      else notes.push(`job ${j.name} did not appear in cron.job after schedule`)
    }

    // PROVE the pipe end-to-end: fire one representative body once through
    // pg_net, wait, and read the HTTP response status. 200 => pg_cron will
    // really work for all of them (same rail).
    let testFire: unknown = 'skipped'
    try {
      const fired = await client.queryObject<{ id: string }>(
        `SELECT net.http_post(url := '${BASE_URL}/blind-spot-monitor', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${key}'), body := jsonb_build_object('trigger','pg_cron_selftest'))::text AS id`,
      )
      const reqId = fired.rows[0]?.id
      await new Promise((r) => setTimeout(r, 5000))
      const resp = await client.queryObject<{ status_code: number | null; error_msg: string | null }>(
        `SELECT status_code, error_msg FROM net._http_response WHERE id = ${reqId}`,
      )
      testFire = resp.rows[0] ?? { status_code: null, error_msg: 'no response row yet (async still in flight)' }
    } catch (e) {
      testFire = { error: String(e).slice(0, 160) }
    }

    await client.end()
    return new Response(JSON.stringify({ ok: true, jobs: installed, test_fire: testFire, notes }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    try { await client.end() } catch (_) { /* */ }
    return new Response(JSON.stringify({ ok: false, error: String(e), notes }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
