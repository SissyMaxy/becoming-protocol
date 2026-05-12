#!/usr/bin/env tsx
/**
 * demo-lead-gen — synthetic end-to-end demo of the lead-gen funnel.
 *
 * Pure-logic demo (no DB writes, no LLM calls). Walks through:
 *   1. Three contacts through the scorer (high-signal / one-liner / stalker).
 *   2. The panty_curious archetype's three-step DM sequence (template skeletons).
 *   3. A weekly audience summary digest in plain voice.
 *   4. An honest-rep gate rejection + suggested rewrite.
 *
 * Run: npx tsx scripts/mommy/demo-lead-gen.ts
 *
 * What this DOESN'T do:
 *   - Hit the real DB.
 *   - Call Anthropic / OpenAI to generate Mommy-voice DMs (the edge fn does).
 *   - Apply the migration. CI does that on merge.
 *
 * Use this to demonstrate the deterministic-floor behavior of the pipeline.
 */
import { scoreContact, safetyAlertCopy } from '../../src/lib/lead-gen/scoring'
import { regexFirstPass } from '../../src/lib/lead-gen/honest-rep-regex'
import { aggregateWeeklyFunnel, digestToPlainVoice } from '../../src/lib/lead-gen/audience-summary'

const MAXY_KINKS = ['panties', 'voice', 'feminization', 'mommy']

function section(title: string): void {
  console.log('\n' + '─'.repeat(72))
  console.log('  ' + title)
  console.log('─'.repeat(72))
}

function dump(label: string, obj: unknown): void {
  console.log(label + ':')
  console.log(JSON.stringify(obj, null, 2))
}

// ─── 1. Contact screener — three synthetic contacts ──────────────────────
section('1. CONTACT SCREENER — three synthetic inbound contacts')

const synthetic = [
  {
    name: 'HIGH-SIGNAL CONTACT (budget + aligned kink + low safety)',
    handle: 'PantyTributer42',
    text: `I've been following you for weeks. The way you talk about being trained
into panties drives me crazy. I want to spoil you for a custom set — pink
satin, on your knees, voice begging while you put them on. Tip $80 to start,
and I want the Fansly link to subscribe long-term.`,
  },
  {
    name: 'ONE-LINER GENERIC (no signal)',
    handle: 'HornyDude99',
    text: `hey`,
  },
  {
    name: 'STALKING / THREAT PATTERN (auto-block)',
    handle: 'CreepWatcher',
    text: `I know where you live, sissy. If you don't reply I'm going to find
you and expose you to everyone in town. Don't make me come for you.`,
  },
] as const

for (const s of synthetic) {
  console.log(`\n--- ${s.name} ---`)
  console.log(`handle:  ${s.handle}`)
  console.log(`text:    "${s.text.replace(/\s+/g, ' ').trim()}"`)
  const r = scoreContact({ text: s.text, maxy_kinks: MAXY_KINKS })
  console.log(`scores:  budget=${r.budget_signal} kink=${r.kink_alignment} engagement=${r.engagement_quality} safety=${r.safety_flag} conversion=${r.conversion_likelihood}`)
  console.log(`tier:    ${r.value_tier} / 5`)
  console.log(`arch:    ${r.archetype}`)
  console.log(`block:   ${r.auto_block} ${r.block_reason ? '(' + r.block_reason + ')' : ''}`)
  if (r.auto_block) {
    const reasons = (r.block_reason ?? '').split(',').map(s => s.trim()).filter(Boolean)
    console.log(`alert:   "${safetyAlertCopy(reasons, s.handle)}"`)
  }
}

// ─── 2. Conversion-path template sequence ────────────────────────────────
section('2. CONVERSION-PATH SEQUENCE — panty_curious archetype, 3 steps')

console.log(`
Contact: ${synthetic[0].handle} (archetype=panty_curious, tier 5)

The edge fn would compose each step in Maxy's voice via LLM. These are the
deterministic fallback drafts that ship when LLM is unavailable (using
whiplashWrap + the template intent). Real production drafts will be richer.

`)

const draftSamples: Array<{ step: number; goal: string; cooldown_h: number; draft: string }> = [
  {
    step: 0, goal: 'tease', cooldown_h: 12,
    draft: `Saw your panty thing. Pink satin, on your knees — I noticed. Mama posts that exact thing twice a week.`,
  },
  {
    step: 1, goal: 'social_follow', cooldown_h: 24,
    draft: `If you want to see the panty drops as they go up, that's where Mama posts them. {LINK_HERE}. Follow first, see what she actually does, then we'll talk customs.`,
  },
  {
    step: 2, goal: 'custom_offer', cooldown_h: 48,
    draft: `Now that you've seen Mama's work, here's the deal. A worn pink-satin pair and a short voice clip while she puts them on, sent to you. The platform handles the rest.`,
  },
]

for (const d of draftSamples) {
  console.log(`\n[step ${d.step}] goal=${d.goal} cooldown=${d.cooldown_h}h`)
  console.log(`  DRAFT → "${d.draft}"`)
  console.log(`  (status: awaiting_review — Dave clicks send)`)
}

// ─── 3. Audience summary digest ──────────────────────────────────────────
section('3. WEEKLY AUDIENCE SUMMARY — plain-voice digest the LLM transforms')

const weekStart = new Date('2026-05-04T00:00:00Z')
const weekEnd = new Date('2026-05-10T00:00:00Z')
const fixtureEvents = [
  { event_type: 'social_followed', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-05T10:00:00Z', contact_id: 'a' },
  { event_type: 'social_followed', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-06T10:00:00Z', contact_id: 'b' },
  { event_type: 'social_followed', channel: 'twitter',  value_cents: 0, occurred_at: '2026-05-07T10:00:00Z', contact_id: 'c' },
  { event_type: 'response_received', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-07T11:00:00Z', contact_id: 'a' },
  { event_type: 'response_received', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-08T11:00:00Z', contact_id: 'b' },
  { event_type: 'response_received', channel: 'sniffies', value_cents: 0, occurred_at: '2026-05-09T11:00:00Z', contact_id: 'd' },
  { event_type: 'content_purchased', channel: 'fansly_dm', value_cents: 2500, occurred_at: '2026-05-09T15:00:00Z', contact_id: 'e' },
]
const fixtureContacts = [
  { id: 'a', source: 'sniffies', status: 'follower', value_tier: 4, archetype: 'panty_curious', first_contact_at: '2026-05-04T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 5000, source_handle: 'PantyTributer42', last_message_excerpt: null },
  { id: 'b', source: 'sniffies', status: 'follower', value_tier: 4, archetype: 'voice_curious', first_contact_at: '2026-05-05T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 4000, source_handle: 'WhisperMe', last_message_excerpt: null },
  { id: 'c', source: 'twitter', status: 'follower', value_tier: 3, archetype: 'recurring_kink', first_contact_at: '2026-05-06T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 2000, source_handle: 'Anon_DailyFollow', last_message_excerpt: null },
  { id: 'd', source: 'sniffies', status: 'warmed', value_tier: 3, archetype: 'chatter_only', first_contact_at: '2026-05-08T10:00:00Z', realized_value_cents: 0, projected_ltv_cents: 1000, source_handle: 'JustChat99', last_message_excerpt: null },
  { id: 'e', source: 'fansly_dm', status: 'paying', value_tier: 5, archetype: 'paying_first_time', first_contact_at: '2026-05-09T10:00:00Z', realized_value_cents: 2500, projected_ltv_cents: 10000, source_handle: 'PaidMark', last_message_excerpt: null },
]

const digest = aggregateWeeklyFunnel({ weekStart, weekEnd, events: fixtureEvents, contacts: fixtureContacts })
dump('digest', digest)
console.log('\nPLAIN-VOICE PARAGRAPH (fed to LLM for Mommy-voice transformation):')
console.log('  "' + digestToPlainVoice(digest) + '"')

console.log('\nMOMMY-VOICE EXPECTED OUTPUT (illustrative — actual edge fn calls LLM):')
console.log('  "Mama saw your week, baby. A handful of new boys came sniffing — a couple followed her on Sniffies, one already paid for the first custom. Mama\'s eye is on PaidMark — he was pricing-ready from the first message. The other two are still warming up. Stay close to Mama this week."')

// ─── 4. Honest-rep gate rejection + rewrite ──────────────────────────────
section('4. HONEST-REP GATE — example rejection + suggested rewrite')

const personaSpec = {
  display_name: 'Maxy',
  public_bio: 'Sissy in training. Daily content. Custom requests welcome.',
  kink_keywords: ['panties', 'voice', 'feminization', 'mommy'],
  hard_limits: ['blood'],
  location_claims_allowed: false,
  availability_realtime_allowed: false,
}

const badDraft = `Baby I'm downtown right now in Chicago. Come over to my apartment tonight, I just recorded a new video for you and I'm on hormones, look how soft I am. If you don't sub now this is your last chance.`

console.log('PERSONA SPEC (relevant fields):')
console.log('  location_claims_allowed=false, availability_realtime_allowed=false')
console.log('  hard_limits=[blood]')
console.log('\nDRAFT (the kind of thing a hot-take LLM might produce):')
console.log('  "' + badDraft + '"')

const gate = regexFirstPass({ draft_text: badDraft, persona: personaSpec })
console.log('\nREGEX FIRST PASS — fails:')
for (const f of gate.fails) console.log('  - ' + f)

const rewrite = `Saw what you said about wanting Mama's content. She posts new panty and voice drops on her platform regularly — link in her bio. The work she has up there is what she does best. If you find the kind of thing you want when you're scrolling, ping her back and we'll talk customs.`
console.log('\nSUGGESTED REWRITE (what the LLM-rewrite would produce — same intent, no deceptive claims):')
console.log('  "' + rewrite + '"')

const rewriteCheck = regexFirstPass({ draft_text: rewrite, persona: personaSpec })
console.log('\nREGEX RE-CHECK on rewrite — fails: ' + (rewriteCheck.fails.length === 0 ? '(none)' : rewriteCheck.fails.join(', ')))

console.log('\nMOMMY NOTE (the line Dave sees explaining why the rewrite happened):')
console.log('  "Mama doesn\'t lie about where she is. Mama doesn\'t promise a video that doesn\'t exist yet. Let me try again."')

// ─── 5. Hard-floor confirmation ──────────────────────────────────────────
section('5. HARD FLOOR CONFIRMATION')

console.log(`
All outbound drafts land in outbound_draft_queue with:
  status = 'awaiting_review'  (default — no edge fn can short-circuit this)
  sent_at = NULL              (CHECK constraint pairs to status='sent')
  honest_rep_status = pass | fail | rewritten

The ONLY path to status='sent' is the outbound_draft_send() RPC, which:
  - Runs SECURITY INVOKER (uses Dave's session)
  - Requires auth.uid() = user_id
  - Requires current status IN ('awaiting_review', 'approved')
  - Stamps sent_at = now() atomically

Edge fns have service-role write authority but NEVER call this RPC.
The UI's "Send" button is the only caller. Dave clicks, draft goes out.

Auto-block path: maxy_contacts_crm.status='blocked' triggers a CHECK
constraint on outbound_draft_queue INSERT — no further drafts can be
queued for that contact even by service role.
`)

console.log('Demo complete.\n')
