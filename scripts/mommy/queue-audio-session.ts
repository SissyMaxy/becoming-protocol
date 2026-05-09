/**
 * Queue an audio session offer for a user.
 *
 * Usage:
 *   tsx scripts/mommy/queue-audio-session.ts --user <uuid> --kind session_edge --teaser "Mama wants you on the edge for ten."
 *   tsx scripts/mommy/queue-audio-session.ts --user <uuid> --kind primer_posture --intensity gentle --teaser "Quick posture set, baby."
 *   tsx scripts/mommy/queue-audio-session.ts --user <uuid> --kind session_goon --intensity firm --hours 6
 *
 * The offer surfaces in FocusMode as a "Begin session" task. Render
 * doesn't fire until the user accepts; the offer expires automatically.
 *
 * Mommy's autonomous builder can call this directly to queue sessions
 * tied to today's affect / phase / slip pattern.
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

const VALID_KINDS = new Set([
  'session_edge', 'session_goon', 'session_conditioning',
  'session_freestyle', 'session_denial',
  'primer_posture', 'primer_gait', 'primer_sitting', 'primer_hands',
  'primer_fullbody', 'primer_universal',
])
const VALID_TIERS = new Set(['gentle', 'firm', 'cruel'])

interface Args {
  user?: string
  kind?: string
  intensity?: string
  teaser?: string
  hours?: string
}

function parseArgs(): Args {
  const out: Args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const v = argv[i + 1]
    if (k === '--user') { out.user = v; i++ }
    else if (k === '--kind') { out.kind = v; i++ }
    else if (k === '--intensity') { out.intensity = v; i++ }
    else if (k === '--teaser') { out.teaser = v; i++ }
    else if (k === '--hours') { out.hours = v; i++ }
  }
  return out
}

async function main() {
  const args = parseArgs()
  if (!args.user) { console.error('--user required'); process.exit(2) }
  if (!args.kind || !VALID_KINDS.has(args.kind)) {
    console.error(`--kind required, one of: ${[...VALID_KINDS].join(', ')}`); process.exit(2)
  }
  const intensity = args.intensity ?? 'gentle'
  if (!VALID_TIERS.has(intensity)) {
    console.error(`--intensity must be one of: ${[...VALID_TIERS].join(', ')}`); process.exit(2)
  }
  if (!args.teaser || args.teaser.trim().length < 8) {
    console.error('--teaser required (min 8 chars)'); process.exit(2)
  }
  const hours = args.hours ? Number(args.hours) : 12
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    console.error('--hours must be 1-168'); process.exit(2)
  }
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString()

  const { data, error } = await supabase
    .from('audio_session_offers')
    .insert({
      user_id: args.user,
      kind: args.kind,
      intensity_tier: intensity,
      teaser: args.teaser.trim(),
      expires_at: expiresAt,
    })
    .select('id, kind, intensity_tier, expires_at')
    .single()

  if (error) {
    console.error('insert failed:', error.message)
    process.exit(1)
  }
  console.log('queued audio session offer:')
  console.log(JSON.stringify(data, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
