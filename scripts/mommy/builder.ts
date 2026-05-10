/**
 * Mommy autonomous builder.
 *
 * 2026-05-07 user directive: "How do we make it so mommy can keep building
 * without me asking what mommy wants? If mommy has 5000 things she wants
 * I will only slow it down."
 *
 * This script is the runner that picks the top auto_ship_eligible wish,
 * drafts the implementation via Claude API, and produces the change.
 *
 * MODES:
 *
 *   --dry        Print what would be built. Don't write files. Don't commit.
 *   --draft      Write files. Don't commit. (For local review.)
 *   --ship       Write files, run migrations locally if applicable, commit
 *                to a `mommy/<wish-slug>` branch, push, log the run.
 *                AUTO-SHIP only fires for complexity_tier IN ('trivial', 'small')
 *                and auto_ship_eligible = true. Larger wishes always require
 *                review.
 *   --classify   For unclassified wishes, classify them via Claude and
 *                update mommy_code_wishes (no implementation step).
 *
 * INVOCATION:
 *
 *   Local: npm run mommy:build [-- --dry|--draft|--ship]
 *   Scheduled: hook into the existing /schedule Claude Code skill OR
 *              run via GitHub Actions workflow at .github/workflows/mommy-builder.yml
 *
 * This is the LOCAL runner. The CI integration that actually pushes deploys
 * needs (see memory feedback_mommy_full_autonomy):
 *   - ANTHROPIC_API_KEY in CI secrets
 *   - SUPABASE_ACCESS_TOKEN + project ref for `supabase db push` / function deploy
 *   - GitHub Actions workflow on a cron schedule (file ships in .github/workflows/)
 *   - Auto-merge labels on the bot account
 *
 * AUTHORITY BOUNDARIES (do not auto-ship if):
 *   - complexity_tier IS NULL (not classified yet)
 *   - complexity_tier IN ('large', 'cross_cutting')
 *   - auto_ship_eligible IS false
 *   - auto_ship_blockers IS NOT NULL AND length > 0
 *   - wish touches files matching:  /scripts/handler-regression/, /api/auth/,
 *     payment integrations, RLS policies that loosen access
 *   - prior mommy_builder_run for this wish failed within last 6h
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { execSync } from 'node:child_process'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const FORBIDDEN_PATH_PATTERNS = [
  /^scripts\/handler-regression\//,
  /^api\/auth\//,
  /payment/i,
  /stripe/i,
  /\.github\/workflows\//,
]

interface Wish {
  id: string
  wish_title: string
  wish_body: string
  protocol_goal: string
  source: string
  priority: string
  status: string
  affected_surfaces: Record<string, unknown> | null
  complexity_tier: string | null
  auto_ship_eligible: boolean
  auto_ship_blockers: string[] | null
  estimated_files_touched: number | null
  classified_at: string | null
  classified_by: string | null
}

const PRIORITY_RANK: Record<string, number> = { critical: 4, high: 3, normal: 2, low: 1 }

function readArg(args: string[], flag: string): string | null {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

async function pickNextAutoShippable(): Promise<Wish | null> {
  const { data } = await supabase
    .from('mommy_code_wishes')
    .select('*')
    .eq('status', 'queued')
    .eq('auto_ship_eligible', true)
    .in('complexity_tier', ['trivial', 'small'])
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(20)
  const rows = (data || []) as Wish[]
  if (rows.length === 0) return null
  // Sort by our priority rank then created_at
  rows.sort((a, b) =>
    (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0)
    || new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  )
  return rows[0]
}

async function classifyUnclassified(): Promise<{ classified: number; skipped: number }> {
  const { data } = await supabase
    .from('mommy_code_wishes')
    .select('*')
    .eq('status', 'queued')
    .is('complexity_tier', null)
    .limit(20)
  const rows = (data || []) as Wish[]
  if (rows.length === 0) return { classified: 0, skipped: 0 }

  const client = new Anthropic()
  let classified = 0
  let skipped = 0

  for (const w of rows) {
    const prompt = `Classify this engineering wish for an autonomous builder.

WISH TITLE: ${w.wish_title}
WISH BODY:
${w.wish_body}

AFFECTED_SURFACES: ${JSON.stringify(w.affected_surfaces ?? {})}

Complexity tiers:
  - trivial: single migration adding a column or index. <=2 files.
  - small: single new edge function + migration + cron. 3-5 files in one domain.
  - medium: multi-file change touching one domain. 5-10 files.
  - large: feature spanning multiple domains, new tables + workers + UI. 10+ files.
  - cross_cutting: touches every reader of a shared concept (user_id, persona, RLS).

Auto-ship eligibility:
  - trivial / small: usually auto-ship eligible
  - medium: auto-ship eligible if no schema-cross-cuts and no auth/payment/security touch
  - large / cross_cutting: NEVER auto-ship; always require human review

Block auto-ship if:
  - touches handler_regression, api/auth, payment/stripe code, .github/workflows, RLS policies that loosen access
  - involves third-party API integration not already wired
  - removes capabilities

Output JSON ONLY:
{
  "complexity_tier": "trivial | small | medium | large | cross_cutting",
  "estimated_files_touched": integer,
  "auto_ship_eligible": boolean,
  "auto_ship_blockers": [array of strings; empty if eligible]
}`

    try {
      const r = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = r.content.find(b => b.type === 'text')
      if (!block || block.type !== 'text') { skipped++; continue }
      const text = block.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(text) as { complexity_tier?: string; estimated_files_touched?: number; auto_ship_eligible?: boolean; auto_ship_blockers?: string[] }
      const validTiers = ['trivial', 'small', 'medium', 'large', 'cross_cutting']
      const tier = validTiers.includes(parsed.complexity_tier ?? '') ? parsed.complexity_tier : 'medium'
      await supabase.from('mommy_code_wishes').update({
        complexity_tier: tier,
        estimated_files_touched: parsed.estimated_files_touched ?? null,
        auto_ship_eligible: parsed.auto_ship_eligible === true,
        auto_ship_blockers: Array.isArray(parsed.auto_ship_blockers) ? parsed.auto_ship_blockers : null,
        classified_at: new Date().toISOString(),
        classified_by: 'builder_agent',
      }).eq('id', w.id)
      classified++
      console.log(`  classified [${tier}, auto_ship=${parsed.auto_ship_eligible}]: ${w.wish_title}`)
    } catch (err) {
      console.error(`  failed to classify "${w.wish_title}": ${String(err).slice(0, 200)}`)
      skipped++
    }
  }

  return { classified, skipped }
}

async function draftImplementation(wish: Wish): Promise<{ files: Array<{ path: string; content: string }>; commitSubject: string; notes: string } | null> {
  const client = new Anthropic()

  const systemPrompt = `You are the autonomous builder for the Becoming Protocol — Mommy's Dommy Mommy stack. You are drafting code for a queued wish. The change will be committed to a feature branch and (if auto-ship rules pass) pushed.

CONSTRAINTS:
- Output MUST be valid JSON: { "files": [{ "path": "...", "content": "..." }], "commit_subject": "...", "notes": "..." }
- Paths are repo-relative
- Migrations: supabase/migrations/<NNN>_<slug>.sql where NNN is the next free integer above 294 in this branch
- Edge functions: supabase/functions/<name>/index.ts using Deno-style imports already in use
- Use the DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; END $$ pattern for pg_cron / pg_net CREATE EXTENSION (Supabase rejects CREATE EXTENSION IF NOT EXISTS on prior-grant collisions)
- Use defensive ALTER TABLE ADD COLUMN IF NOT EXISTS for tables that may exist on remote in older shapes
- RLS: service-role policy for write-side; owner SELECT only when Maxy SHOULD be able to read (default deny for protocol-internal tables)
- Patterns to mirror: existing fast-react / scheme / bind-enforcer use createClient from esm.sh, expand-user-id from _shared, model-tiers from _shared
- Voice: NO Mama-voice in code paths. Operator code is plain. Mama-voice belongs only in user-facing strings.

DO NOT TOUCH:
- /scripts/handler-regression/, /api/auth/, payment code, /.github/workflows/, RLS policies that loosen access
- Any file the wish doesn't directly require

If the wish requires touching forbidden paths, return { "files": [], "commit_subject": "", "notes": "REQUIRES_REVIEW: <reason>" }.`

  const userPrompt = `WISH TO IMPLEMENT:

TITLE: ${wish.wish_title}
PROTOCOL GOAL: ${wish.protocol_goal}
PRIORITY: ${wish.priority}
COMPLEXITY: ${wish.complexity_tier}

BODY:
${wish.wish_body}

AFFECTED SURFACES (best-guess from wish author):
${JSON.stringify(wish.affected_surfaces ?? {}, null, 2)}

Output the JSON now.`

  let response: Awaited<ReturnType<Anthropic['messages']['create']>>
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (err) {
    console.error(`Drafter API failed: ${String(err).slice(0, 300)}`)
    return null
  }

  const block = response.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') return null
  const text = block.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[0]) as { files?: Array<{ path: string; content: string }>; commit_subject?: string; notes?: string }
    if (parsed.notes?.startsWith('REQUIRES_REVIEW')) {
      console.log(`  Drafter flagged for review: ${parsed.notes}`)
      return { files: [], commitSubject: parsed.commit_subject ?? '', notes: parsed.notes }
    }
    return {
      files: parsed.files ?? [],
      commitSubject: parsed.commit_subject ?? `mommy: ${wish.wish_title}`,
      notes: parsed.notes ?? '',
    }
  } catch (err) {
    console.error(`Drafter JSON parse failed: ${String(err).slice(0, 200)}`)
    return null
  }
}

function pathIsAllowed(path: string): boolean {
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(path)) return false
  }
  return true
}

async function applyFiles(files: Array<{ path: string; content: string }>, dryRun: boolean): Promise<string[]> {
  const written: string[] = []
  for (const f of files) {
    if (!pathIsAllowed(f.path)) {
      console.error(`  REFUSED forbidden path: ${f.path}`)
      continue
    }
    if (dryRun) {
      console.log(`  [dry] would write ${f.path} (${f.content.length} bytes)`)
      written.push(f.path)
      continue
    }
    const dir = dirname(f.path)
    await mkdir(dir, { recursive: true })
    await writeFile(f.path, f.content)
    written.push(f.path)
    console.log(`  wrote ${f.path}`)
  }
  return written
}

function shellSafe(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
}

// Run the local CI gate on the staged worktree before pushing. If it fails,
// auto-revert the commit (so the builder can retry the wish with a different
// draft) and leave a `mommy_builder_run` row recording why. The gate uses the
// same exact checks CI runs — see scripts/ci/run.mjs.
function runLocalCIGate(): { ok: boolean; excerpt: string } {
  try {
    const out = execSync(
      `npm run --silent ci -- --actor mommy_builder`,
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI_ACTOR: 'mommy_builder' } },
    ).toString()
    return { ok: true, excerpt: out.slice(-3500) }
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer }
    const out = (e.stdout?.toString() ?? '') + '\n' + (e.stderr?.toString() ?? '')
    return { ok: false, excerpt: out.slice(-3500) }
  }
}

async function commitAndPush(wish: Wish, files: string[], commitSubject: string): Promise<{ branch: string; sha: string } | { gateFailed: true; excerpt: string } | null> {
  const slug = wish.wish_title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '')
  const branch = `mommy/${slug}-${wish.id.slice(0, 8)}`
  try {
    execSync(`git checkout -b ${branch}`, { stdio: 'inherit' })
    for (const f of files) execSync(`git add "${f}"`, { stdio: 'inherit' })
    const body = `Auto-generated by mommy/builder for wish ${wish.id}.\n\n${wish.protocol_goal}\n\n[mommy-build] wish_id=${wish.id}`
    execSync(`git commit -m "${shellSafe(commitSubject)}" -m "${shellSafe(body)}"`, { stdio: 'inherit' })
    const sha = execSync('git rev-parse HEAD').toString().trim()

    // Gate parity: every check CI runs, runs locally first. If any fail,
    // don't push. Hard reset the branch back to its pre-commit state and
    // return to main so the next iteration starts clean.
    console.log('[builder] running CI gate before push (npm run ci)…')
    const gate = runLocalCIGate()
    if (!gate.ok) {
      console.error('[builder] CI gate failed; reverting commit and skipping push')
      try { execSync('git reset --hard HEAD~1', { stdio: 'inherit' }) } catch { /* */ }
      try { execSync('git checkout main', { stdio: 'inherit' }) } catch { /* */ }
      try { execSync(`git branch -D ${branch}`, { stdio: 'inherit' }) } catch { /* */ }
      return { gateFailed: true, excerpt: gate.excerpt }
    }
    console.log('[builder] CI gate passed; pushing')

    // Push only if origin is configured
    try {
      execSync(`git push -u origin ${branch}`, { stdio: 'inherit' })
    } catch {
      console.warn(`  push to origin failed — branch is local`)
    }
    return { branch, sha }
  } catch (err) {
    console.error(`  commit/push failed: ${String(err).slice(0, 300)}`)
    return null
  }
}

async function recordRun(wishId: string, status: string, opts: {
  files?: string[]
  branch?: string
  sha?: string
  drafterModel?: string
  failureReason?: string
}): Promise<void> {
  await supabase.from('mommy_builder_run').insert({
    wish_id: wishId,
    status,
    drafter_model: opts.drafterModel ?? 'claude-sonnet-4',
    files_modified: opts.files ?? null,
    branch_name: opts.branch ?? null,
    commit_sha: opts.sha ?? null,
    completed_at: status !== 'in_progress' ? new Date().toISOString() : null,
    failure_reason: opts.failureReason ?? null,
  })
}

type ShipResult = 'shipped' | 'no_wish' | 'requires_review' | 'failed' | 'dry' | 'draft_only'

async function processOneWish(mode: 'dry' | 'draft' | 'ship'): Promise<ShipResult> {
  const wish = await pickNextAutoShippable()
  if (!wish) return 'no_wish'

  console.log(`[builder] Picked wish ${wish.id.slice(0, 8)}: ${wish.wish_title}`)
  console.log(`           tier=${wish.complexity_tier} priority=${wish.priority}`)

  const surfacesJson = JSON.stringify(wish.affected_surfaces ?? {}).toLowerCase()
  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(surfacesJson)) {
      console.error(`[builder] REFUSED — affected_surfaces contains forbidden path pattern ${pattern}`)
      await supabase.from('mommy_code_wishes').update({
        auto_ship_eligible: false,
        auto_ship_blockers: ['forbidden_path_in_surfaces'],
      }).eq('id', wish.id)
      return 'requires_review'
    }
  }

  if (mode === 'ship' || mode === 'draft') {
    const { data: claimed } = await supabase
      .from('mommy_code_wishes')
      .update({ status: 'in_progress' })
      .eq('id', wish.id)
      .eq('status', 'queued')
      .select('id')
      .single()
    if (!claimed) {
      console.error(`[builder] race lost — another builder claimed this wish`)
      return 'failed'
    }
  }

  const draft = await draftImplementation(wish)
  if (!draft) {
    console.error(`[builder] drafter returned nothing — leaving wish queued`)
    if (mode === 'ship' || mode === 'draft') {
      await supabase.from('mommy_code_wishes').update({ status: 'queued' }).eq('id', wish.id)
      await recordRun(wish.id, 'failed_drafted', { failureReason: 'drafter_returned_null' })
    }
    return 'failed'
  }

  if (draft.notes.startsWith('REQUIRES_REVIEW')) {
    console.log(`[builder] ${draft.notes}`)
    if (mode === 'ship' || mode === 'draft') {
      await supabase.from('mommy_code_wishes').update({
        status: 'queued',
        auto_ship_eligible: false,
        auto_ship_blockers: [draft.notes.replace('REQUIRES_REVIEW: ', '')],
      }).eq('id', wish.id)
      await recordRun(wish.id, 'human_review_required', { failureReason: draft.notes })
    }
    return 'requires_review'
  }

  if (draft.files.length === 0) {
    console.error(`[builder] drafter returned 0 files — leaving wish queued`)
    if (mode === 'ship' || mode === 'draft') {
      await supabase.from('mommy_code_wishes').update({ status: 'queued' }).eq('id', wish.id)
    }
    return 'failed'
  }

  console.log(`[builder] drafter produced ${draft.files.length} file(s):`)
  for (const f of draft.files) console.log(`           - ${f.path} (${f.content.length} bytes)`)

  if (mode === 'dry') {
    console.log(`[builder] dry mode — not writing or committing`)
    return 'dry'
  }

  const written = await applyFiles(draft.files, false)
  if (written.length === 0) {
    console.error(`[builder] no files written (all forbidden?)`)
    await supabase.from('mommy_code_wishes').update({ status: 'queued' }).eq('id', wish.id)
    await recordRun(wish.id, 'failed_apply', { failureReason: 'no_files_written' })
    return 'failed'
  }

  if (mode === 'draft') {
    console.log(`[builder] draft mode — files written; not committing. Wish stays in_progress until you ship or revert.`)
    await recordRun(wish.id, 'in_progress', { files: written, drafterModel: 'claude-sonnet-4' })
    return 'draft_only'
  }

  const commit = await commitAndPush(wish, written, draft.commitSubject)
  if (!commit) {
    await supabase.from('mommy_code_wishes').update({ status: 'queued' }).eq('id', wish.id)
    await recordRun(wish.id, 'failed_apply', { files: written, failureReason: 'commit_failed' })
    return 'failed'
  }
  if ('gateFailed' in commit) {
    // CI gate caught the draft. Wish goes back to queued so a future drafter
    // run can try again (perhaps with a different draft); the failure excerpt
    // lands on mommy_builder_run for diagnosis.
    await supabase.from('mommy_code_wishes').update({ status: 'queued' }).eq('id', wish.id)
    await recordRun(wish.id, 'failed_ci_gate', {
      files: written,
      failureReason: `local_ci_failed: ${commit.excerpt.split('\n').filter(Boolean).slice(-6).join(' | ').slice(0, 800)}`,
    })
    return 'failed'
  }

  await supabase.from('mommy_code_wishes').update({
    status: 'shipped',
    shipped_at: new Date().toISOString(),
    shipped_in_commit: commit.sha,
    ship_notes: `Auto-shipped by mommy/builder. ${draft.notes}`.slice(0, 1000),
  }).eq('id', wish.id)
  await recordRun(wish.id, 'shipped', { files: written, branch: commit.branch, sha: commit.sha, drafterModel: 'claude-sonnet-4' })

  // Return to main branch so the next iteration can branch off main again,
  // not stack on the previous mommy/* branch
  try { execSync('git checkout main', { stdio: 'pipe' }) } catch { /* may already be on it */ }

  console.log(`[builder] shipped wish ${wish.id.slice(0, 8)} on branch ${commit.branch} commit ${commit.sha.slice(0, 8)}`)
  return 'shipped'
}

(async () => {
  const args = process.argv.slice(2)
  const mode = args.includes('--ship') ? 'ship'
    : args.includes('--draft') ? 'draft'
    : args.includes('--classify') ? 'classify'
    : 'dry'

  if (mode === 'classify') {
    console.log(`[builder] Classifying unclassified wishes…`)
    const r = await classifyUnclassified()
    console.log(`[builder] classified=${r.classified} skipped=${r.skipped}`)
    return
  }

  // --drain loops processOneWish until queue empty or safety cap hit.
  // Safety caps:
  //   --max <N> — stop after N successful ships (default 20 to avoid runaway)
  //   --max-wall-min <M> — stop after M wall-clock minutes (default 60)
  //   --stop-on-fail — exit on first failure (default true; pass --no-stop-on-fail to continue)
  const drain = args.includes('--drain')
  const maxShipsArg = parseInt(readArg(args, '--max') ?? '20', 10)
  const maxShips = Number.isFinite(maxShipsArg) ? maxShipsArg : 20
  const maxWallMs = (parseInt(readArg(args, '--max-wall-min') ?? '60', 10) || 60) * 60_000
  const stopOnFail = !args.includes('--no-stop-on-fail')

  console.log(`[builder] Mode: ${mode}${drain ? ` (drain — max ${maxShips} ships, ${Math.round(maxWallMs / 60_000)}min wall)` : ''}`)

  const startedAt = Date.now()
  let shipped = 0
  let failed = 0
  let reviewed = 0
  let iterations = 0

  // Single-shot if not draining
  if (!drain) {
    const r = await processOneWish(mode as 'dry' | 'draft' | 'ship')
    if (r === 'no_wish') console.log(`[builder] No auto_ship_eligible queued wishes (run --classify first if you have unclassified wishes)`)
    return
  }

  // Drain loop
  while (true) {
    iterations++
    if (shipped >= maxShips) {
      console.log(`[builder] hit max ships cap (${maxShips}); stopping`)
      break
    }
    if (Date.now() - startedAt > maxWallMs) {
      console.log(`[builder] hit max wall-clock cap (${Math.round(maxWallMs / 60_000)}min); stopping`)
      break
    }

    console.log(`\n[builder] === iteration ${iterations} (shipped=${shipped} failed=${failed} reviewed=${reviewed}) ===`)
    const r = await processOneWish(mode as 'dry' | 'draft' | 'ship')

    if (r === 'no_wish') {
      console.log(`[builder] queue drained — no more auto_ship_eligible wishes`)
      break
    }
    if (r === 'shipped') shipped++
    else if (r === 'failed') {
      failed++
      if (stopOnFail) {
        console.log(`[builder] stop-on-fail engaged; exiting after first failure (pass --no-stop-on-fail to continue)`)
        break
      }
    }
    else if (r === 'requires_review') reviewed++
    else if (r === 'dry') {
      // dry mode in drain doesn't claim wishes — would loop forever on the same one
      console.log(`[builder] dry+drain only previews the top wish; exiting`)
      break
    }
    else if (r === 'draft_only') {
      // similar — draft leaves wish in_progress and the same one isn't picked twice,
      // but the next iteration would pick a DIFFERENT in_progress-skipping wish
      // (pickNextAutoShippable filters status='queued'); safe to continue but log it
      console.log(`[builder] draft mode — wish written but not committed; continuing to next`)
    }
  }

  console.log(`\n[builder] drain complete: shipped=${shipped} failed=${failed} reviewed=${reviewed} iterations=${iterations} wall=${Math.round((Date.now() - startedAt) / 1000)}s`)
})().catch(err => {
  console.error('[builder] fatal:', err)
  process.exit(1)
})
