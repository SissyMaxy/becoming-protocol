#!/usr/bin/env node
// Read-only introspection helper: pass a SQL SELECT as argv[1]. No secrets printed.
import 'dotenv/config'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'atevwvexapiykchvqvhm'
if (!TOKEN) { console.error('NO_TOKEN'); process.exit(2) }
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
const sql = process.argv[2]
if (!sql) { console.error('usage: introspect.mjs "<sql>"'); process.exit(1) }
const r = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })
const t = await r.text()
if (!r.ok) { console.error(`HTTP ${r.status}: ${t.slice(0, 800)}`); process.exit(1) }
console.log(JSON.stringify(JSON.parse(t), null, 2))
