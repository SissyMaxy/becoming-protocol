#!/usr/bin/env node
import 'dotenv/config'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'atevwvexapiykchvqvhm'
if (!TOKEN) { console.error('NO_TOKEN'); process.exit(2) }
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
async function q(sql){const r=await fetch(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});const t=await r.text();if(!r.ok)throw new Error(`HTTP ${r.status}: ${t.slice(0,400)}`);return JSON.parse(t)}
const tables = process.argv[2] ? process.argv[2].split(',') : [
  'machine_programs','machine_sessions','machine_events','realcock_discovery_ladder',
  'realcock_discovery_events','hrt_dose_evidence',
]
const functions = process.argv[3] ? process.argv[3].split(',') : [
  'machine_session_guard','machine_deadman_sweep','hrt_dose_evidence_guard',
]
const tRes = tables.length ? await q(`select table_name from information_schema.tables where table_schema='public' and table_name = any(array[${tables.map(t=>`'${t}'`).join(',')}]);`) : []
const fRes = functions.length ? await q(`select proname from pg_proc where pronamespace='public'::regnamespace and proname = any(array[${functions.map(f=>`'${f}'`).join(',')}]);`) : []
const haveT=new Set(tRes.map(r=>r.table_name)), haveF=new Set(fRes.map(r=>r.proname))
console.log('TABLES:'); for(const t of tables) console.log(`  ${haveT.has(t)?'✓':'✗'} ${t}`)
console.log('FUNCTIONS:'); for(const f of functions) console.log(`  ${haveF.has(f)?'✓':'✗'} ${f}`)
