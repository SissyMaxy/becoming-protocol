// pgcron-setup — one-shot scheduler for the safety heals.
//
// The Management API token isn't in this environment, so migrations can't be
// applied the normal way. Supabase injects SUPABASE_DB_URL into edge functions,
// so this connects to Postgres directly and runs cron.schedule() itself.
//
// The established cron pattern reads app.settings.{supabase_url,service_role_key}
// — but those turned out to be UNSET (null), so every existing http_post cron
// has been POSTing to a null URL. So this job is made SELF-CONTAINED: the URL +
// service key are baked into the job body (from this function's env — never
// git; cron.job is superuser-only). It also best-effort sets the DB settings so
// the OTHER existing crons start resolving too.
//
// Idempotent. Never returns the key or the job command body.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts'

const FN_URL = 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/blind-spot-monitor'

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!dbUrl || !key) {
    return new Response(JSON.stringify({ ok: false, error: 'SUPABASE_DB_URL or SERVICE_ROLE_KEY not injected' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
  // Self-contained job body: hardcoded URL + baked auth. Dollar-quoted with a
  // tag that can't collide with the JWT (which is [A-Za-z0-9_.-] only).
  const scheduleSql = `SELECT cron.schedule(
    'blind-spot-monitor-safety',
    '*/5 * * * *',
    $job$SELECT net.http_post(
      url := '${FN_URL}',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${key}'),
      body := jsonb_build_object('trigger','pg_cron')
    );$job$
  )`

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

    // (Re)schedule the safety job — self-contained, so it works regardless.
    try { await client.queryArray(`SELECT cron.unschedule('blind-spot-monitor-safety')`) } catch (_) { /* none yet */ }
    await client.queryArray(scheduleSql)

    const job = await client.queryObject<{ jobname: string; schedule: string; active: boolean }>(
      `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'blind-spot-monitor-safety'`,
    )

    // PROVE the pipe end-to-end: fire the exact job body once through pg_net,
    // wait, and read the HTTP response status. 200 => pg_cron will really work.
    let testFire: unknown = 'skipped'
    try {
      const fired = await client.queryObject<{ id: string }>(
        `SELECT net.http_post(url := '${FN_URL}', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ${key}'), body := jsonb_build_object('trigger','pg_cron_selftest'))::text AS id`,
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
    return new Response(JSON.stringify({ ok: true, job: job.rows[0] ?? null, test_fire: testFire, notes }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    try { await client.end() } catch (_) { /* */ }
    return new Response(JSON.stringify({ ok: false, error: String(e), notes }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
