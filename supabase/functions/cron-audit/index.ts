// cron-audit — read-only blast-radius map of every pg_cron job.
//
// Surfaces which jobs depend on the (null) app.settings.* and whether they've
// actually been succeeding or failing. Never returns raw command bodies (the
// safety job has a baked key) — only the extracted target fn + a settings flag
// + run outcomes.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts'

const SQL = `
SELECT j.jobname, j.schedule, j.active,
  (j.command ILIKE '%app.settings%') AS uses_null_settings,
  substring(j.command from 'functions/v1/([a-z0-9_-]+)') AS target_fn,
  COALESCE(r.failed, 0)::int    AS failed_7d,
  COALESCE(r.succeeded, 0)::int AS ok_7d,
  to_char(r.last_run, 'MM-DD HH24:MI') AS last_run,
  left(r.last_fail_msg, 140) AS last_fail_msg
FROM cron.job j
LEFT JOIN (
  SELECT jobid,
    count(*) FILTER (WHERE status = 'failed')    AS failed,
    count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
    max(end_time) AS last_run,
    (array_agg(return_message ORDER BY end_time DESC) FILTER (WHERE status = 'failed'))[1] AS last_fail_msg
  FROM cron.job_run_details
  WHERE start_time > now() - interval '7 days'
  GROUP BY jobid
) r ON r.jobid = j.jobid
ORDER BY failed_7d DESC, j.jobname
`

Deno.serve(async () => {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) return new Response(JSON.stringify({ ok: false, error: 'no SUPABASE_DB_URL' }), { status: 500 })
  const client = new Client(dbUrl)
  try {
    await client.connect()
    const res = await client.queryObject(SQL)
    await client.end()
    return new Response(JSON.stringify({ ok: true, total: res.rows.length, jobs: res.rows }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    try { await client.end() } catch (_) { /* */ }
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 })
  }
})
