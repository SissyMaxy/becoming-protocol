#!/usr/bin/env node
// Invoke a deployed edge function. Usage: node scripts/ops/invoke-fn.mjs <fn-name>
// Reads SERVICE_ROLE key from env; does not print it.
import 'dotenv/config'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const BASE = 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1'
const fn = process.argv[2]
if (!fn) { console.error('usage: invoke-fn.mjs <fn-name>'); process.exit(1) }
if (!KEY) { console.error('NO SERVICE_ROLE key in env'); process.exit(2) }
const r = await fetch(`${BASE}/${fn}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ trigger: 'manual_verify' }),
})
const t = await r.text()
console.log(`HTTP ${r.status}`)
console.log(t.slice(0, 1500))
