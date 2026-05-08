// patterns.ts — pure pattern library for the deploy-fixer.
//
// Each pattern matches a known shape of build/deploy failure log, extracts
// the failing file/line/identifier, and (for the auto-patchable kinds)
// produces a deterministic source-level patch.
//
// THIS MODULE MUST STAY PURE. No Deno.* or process.env imports — it's
// loaded both by the Deno edge function (deploy-fixer/index.ts) and by
// Node-side vitest tests in src/__tests__/lib/. Adding env-coupled imports
// breaks one of the two consumers.
//
// Adding a new pattern:
//   1. Append a Pattern object to PATTERNS below.
//   2. Set canAutoPatch = false if the fix is non-trivial / risky
//      (escalate to operator). Don't pretend a fix is safe to ship.
//   3. Add a fixture-driven test in src/__tests__/lib/deploy-fixer-patterns.test.ts.
//
// Hard rules baked in here:
//   - Schema migration failures NEVER auto-patch (data risk).
//   - Function-count overruns NEVER auto-patch (consolidation is judgment).
//   - Missing env vars NEVER auto-patch (no creds in this layer).

export interface PatternMatch {
  patternId: PatternId
  canAutoPatch: boolean
  filePath?: string
  lineNumber?: number
  columnNumber?: number
  errorCode?: string
  errorMessage?: string
  varName?: string
  envVarName?: string
  extracted?: Record<string, unknown>
  escalationDetail?: string
}

export type PatternId =
  | 'ts_coercion_null_undefined'
  | 'ts_variable_redeclare'
  | 'ts_spread_widened_type'
  | 'vercel_function_count_exceeded'
  | 'missing_env_var'
  | 'failed_migration'

export interface PatchResult {
  newContent: string
  diffSummary: string
}

export interface Pattern {
  id: PatternId
  description: string
  canAutoPatch: boolean
  match(buildLog: string): PatternMatch | null
  applyPatch?(fileContent: string, match: PatternMatch): PatchResult | null
}

// ============================================================
// Helpers
// ============================================================

// Extract a leading "<file>:<line>:<col>" or "<file>(<line>,<col>)" prefix
// from an error line. Both Vercel (tsc --noEmit) and GitHub Actions emit
// the colon-delimited form; older tsc emits the parenthesized form.
function extractLocation(errorLine: string):
  { filePath: string; lineNumber: number; columnNumber: number } | null
{
  // Vercel: "./api/handler/chat.ts:2219:11 - error TS2451: ..."
  // tsc:    "api/handler/chat.ts(2219,11): error TS2451: ..."
  const reColon = /(?:\.\/)?([\w./\-[\]]+\.tsx?):(\d+):(\d+)/
  const reParen = /([\w./\-[\]]+\.tsx?)\((\d+),(\d+)\)/
  let m = reColon.exec(errorLine)
  if (!m) m = reParen.exec(errorLine)
  if (!m) return null
  return {
    filePath: m[1].replace(/^\.\//, ''),
    lineNumber: parseInt(m[2], 10),
    columnNumber: parseInt(m[3], 10),
  }
}

// Split the build log into one-error-per-block. tsc errors typically
// span 1–4 lines; we slide a small window per match.
function findErrorLine(log: string, errorCodeRegex: RegExp): string | null {
  const lines = log.split(/\r?\n/)
  for (const line of lines) {
    if (errorCodeRegex.test(line)) return line.trim()
  }
  return null
}

// ============================================================
// Pattern 1 — TS2322: null is not assignable to undefined
//
// Real fixture (commit 26b07b6):
//   ./api/handler/chat.ts:4142:13 - error TS2322: Type 'string | null' is
//   not assignable to type 'string | undefined'.
//
// Patch: wrap the offending RHS with `(...) ?? undefined`. We locate the
// expression on the indicated line, wrap whatever comes after the last
// `=`/`:`/`return ` keyword on that line up through the trailing comma /
// semicolon / end-of-line.
// ============================================================

const RE_TS2322_NULL_TO_UNDEF = /error\s+TS2322:\s*Type\s+'([^']*\bnull\b[^']*)'\s+is\s+not\s+assignable\s+to\s+type\s+'([^']*\bundefined\b[^']*)'/

const tsCoercionPattern: Pattern = {
  id: 'ts_coercion_null_undefined',
  description: 'TS2322 null→undefined: wrap call site with ?? undefined',
  canAutoPatch: true,
  match(buildLog) {
    const line = findErrorLine(buildLog, RE_TS2322_NULL_TO_UNDEF)
    if (!line) return null
    const sigMatch = RE_TS2322_NULL_TO_UNDEF.exec(line)
    if (!sigMatch) return null
    const loc = extractLocation(line)
    if (!loc) return null
    return {
      patternId: 'ts_coercion_null_undefined',
      canAutoPatch: true,
      filePath: loc.filePath,
      lineNumber: loc.lineNumber,
      columnNumber: loc.columnNumber,
      errorCode: 'TS2322',
      errorMessage: line,
      extracted: { sourceType: sigMatch[1], targetType: sigMatch[2] },
    }
  },
  applyPatch(fileContent, match) {
    if (!match.lineNumber) return null
    const lines = fileContent.split('\n')
    // Lines are 1-indexed in tsc output, 0-indexed in our array
    const idx = match.lineNumber - 1
    if (idx < 0 || idx >= lines.length) return null
    const original = lines[idx]
    // Find the assignment / property RHS:
    //  - "key: <expr>,"          object literal property
    //  - "name = <expr>;"        variable assignment
    //  - "return <expr>;"        return
    //  - "<expr>"                bare expression line (rare for TS2322)
    // The general form: the last delimiter (`:` or `=` outside a type
    // annotation) introduces the value. Conservatively, find the rightmost
    // `: ` or ` = ` (with space) and wrap from there to the trailing
    // separator (`,` `;` or end of line).
    const trailingSep = /([,;])\s*(\/\/.*)?$/
    const sepMatch = trailingSep.exec(original)
    const trailingIdx = sepMatch ? sepMatch.index : original.length
    const before = original.slice(0, trailingIdx)
    const after = original.slice(trailingIdx)

    // Find rightmost RHS-introducing token. We try in priority order.
    let rhsStart = -1
    const propMatch = /(:\s+)(?=\S)/g
    let pm: RegExpExecArray | null
    while ((pm = propMatch.exec(before)) !== null) {
      // Skip type annotations: `name: Type =` — the `:` we want is the
      // value after a property name, not a type annotation. A simple
      // disambiguator: type annotations are followed by a type then `=`
      // or `,`. Property values are followed by a value then `,` or
      // end-of-line. If the line ends with comma/semicolon and there's no
      // `=` after this `:`, treat this as a property RHS.
      const tail = before.slice(pm.index + pm[0].length)
      if (!/[=]/.test(tail)) rhsStart = pm.index + pm[0].length
    }
    if (rhsStart < 0) {
      const eqMatch = /(\s=\s+)(?=\S)/g
      let em: RegExpExecArray | null
      while ((em = eqMatch.exec(before)) !== null) rhsStart = em.index + em[0].length
    }
    if (rhsStart < 0) {
      const retMatch = /(^|\s)(return\s+)(?=\S)/g
      let rm: RegExpExecArray | null
      while ((rm = retMatch.exec(before)) !== null) rhsStart = rm.index + rm[0].length
    }
    if (rhsStart < 0) return null

    const rhs = before.slice(rhsStart).trimEnd()
    if (!rhs) return null
    // Idempotency: if it already has `?? undefined`, skip.
    if (/\?\?\s*undefined\s*$/.test(rhs)) return null
    const wrapped = `(${rhs}) ?? undefined`
    const newLine = before.slice(0, rhsStart) + wrapped + after
    lines[idx] = newLine
    return {
      newContent: lines.join('\n'),
      diffSummary: `${match.filePath}:${match.lineNumber} — coerce null→undefined with ?? undefined`,
    }
  },
}

// ============================================================
// Pattern 2 — TS2451: Cannot redeclare block-scoped variable
//
// Real fixture (commit c6fd353):
//   ./api/handler/chat.ts:2219:11 - error TS2451: Cannot redeclare
//   block-scoped variable 'mommyOverlay'.
//
// Patch: rename the LATTER declaration AND every subsequent reference in
// the file to <name>2, until the next declaration of the same identifier
// (which would shadow anyway). The first binding's references stay intact
// because they precede the renamed line.
//
// This is heuristic — without AST we can't perfectly track scope — so the
// orchestrator MUST verify a green build before merging. If the build
// fails, the PR is opened for human review.
// ============================================================

const RE_TS2451_REDECLARE = /error\s+TS2451:\s*Cannot\s+redeclare\s+block-scoped\s+variable\s+'([^']+)'/

const tsRedeclarePattern: Pattern = {
  id: 'ts_variable_redeclare',
  description: 'TS2451 redeclare: rename later binding to <name>2',
  canAutoPatch: true,
  match(buildLog) {
    const line = findErrorLine(buildLog, RE_TS2451_REDECLARE)
    if (!line) return null
    const sig = RE_TS2451_REDECLARE.exec(line)
    if (!sig) return null
    const loc = extractLocation(line)
    if (!loc) return null
    return {
      patternId: 'ts_variable_redeclare',
      canAutoPatch: true,
      filePath: loc.filePath,
      lineNumber: loc.lineNumber,
      columnNumber: loc.columnNumber,
      errorCode: 'TS2451',
      errorMessage: line,
      varName: sig[1],
    }
  },
  applyPatch(fileContent, match) {
    if (!match.varName || !match.lineNumber) return null
    const lines = fileContent.split('\n')
    const idx = match.lineNumber - 1
    if (idx < 0 || idx >= lines.length) return null
    const v = match.varName
    const newName = `${v}2`
    // Sanity: the LATTER declaration line should declare the variable.
    const declRe = new RegExp(`\\b(?:const|let|var|function)\\s+${escapeRegex(v)}\\b`)
    if (!declRe.test(lines[idx])) return null

    // Walk lines from idx forward until end of file OR another declaration
    // of v appears (which would shadow the renamed range — we stop there).
    const stopRe = new RegExp(`\\b(?:const|let|var|function)\\s+${escapeRegex(v)}\\b`)
    const refRe = new RegExp(`\\b${escapeRegex(v)}\\b`, 'g')
    let renamedRefs = 0
    for (let i = idx; i < lines.length; i++) {
      if (i !== idx && stopRe.test(lines[i])) break
      const before = lines[i]
      const after = before.replace(refRe, newName)
      if (after !== before) {
        lines[i] = after
        renamedRefs++
      }
    }
    if (renamedRefs === 0) return null
    return {
      newContent: lines.join('\n'),
      diffSummary: `${match.filePath}:${match.lineNumber} — rename '${v}' → '${newName}' (${renamedRefs} line${renamedRefs === 1 ? '' : 's'})`,
    }
  },
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================
// Pattern 3 — TS2698: Spread types may only be created from object types
//
// Real fixture (commit c6fd353):
//   ./api/calendar/[action].ts:209:N - error TS2698: Spread types may only
//   be created from object types.
//
// Patch: at the error line, find a `...<ident>` and replace with
// `...(<ident> as unknown as Record<string, unknown>)`.
// ============================================================

const RE_TS2698_SPREAD = /error\s+TS2698:\s*Spread\s+types\s+may\s+only\s+be\s+created\s+from\s+object\s+types/

const tsSpreadPattern: Pattern = {
  id: 'ts_spread_widened_type',
  description: 'TS2698 spread: cast through unknown to Record<string, unknown>',
  canAutoPatch: true,
  match(buildLog) {
    const line = findErrorLine(buildLog, RE_TS2698_SPREAD)
    if (!line) return null
    const loc = extractLocation(line)
    if (!loc) return null
    return {
      patternId: 'ts_spread_widened_type',
      canAutoPatch: true,
      filePath: loc.filePath,
      lineNumber: loc.lineNumber,
      columnNumber: loc.columnNumber,
      errorCode: 'TS2698',
      errorMessage: line,
    }
  },
  applyPatch(fileContent, match) {
    if (!match.lineNumber) return null
    const lines = fileContent.split('\n')
    const idx = match.lineNumber - 1
    if (idx < 0 || idx >= lines.length) return null
    const original = lines[idx]
    // Find a spread expression on the column-anchored side. Prefer the
    // identifier closest to the column number; fall back to the rightmost
    // spread on the line.
    const spreadRe = /\.\.\.([A-Za-z_$][\w$]*)/g
    let m: RegExpExecArray | null
    let chosen: { idx: number; name: string } | null = null
    while ((m = spreadRe.exec(original)) !== null) {
      // Idempotency: skip if already cast.
      const after = original.slice(m.index + m[0].length, m.index + m[0].length + 30)
      if (/^\s*as\s+unknown\s+as\b/.test(after)) continue
      chosen = { idx: m.index, name: m[1] }
    }
    if (!chosen) return null
    const before = original.slice(0, chosen.idx)
    const middle = `...(${chosen.name} as unknown as Record<string, unknown>)`
    const after = original.slice(chosen.idx + 3 + chosen.name.length)
    lines[idx] = before + middle + after
    return {
      newContent: lines.join('\n'),
      diffSummary: `${match.filePath}:${match.lineNumber} — cast '...${chosen.name}' through unknown`,
    }
  },
}

// ============================================================
// Pattern 4 — Vercel function count exceeded (NO auto-patch)
//
// Vercel emits something like:
//   "No more than 12 Serverless Functions can be added to a Deployment
//    on the Hobby plan." or similar.
// Plus build-time message: "Functions: <N> > 12".
//
// Consolidation is a judgment call — escalate.
// ============================================================

const RE_FUNCTION_COUNT = /(?:no\s+more\s+than\s+\d+\s+Serverless\s+Functions|maximum\s+number\s+of\s+(?:allowed\s+)?functions|function\s+count\s+exceeds|exceeded\s+the\s+maximum\s+number\s+of\s+functions)/i

const functionCountPattern: Pattern = {
  id: 'vercel_function_count_exceeded',
  description: 'Vercel function-count overrun (escalate; consolidation is judgment)',
  canAutoPatch: false,
  match(buildLog) {
    if (!RE_FUNCTION_COUNT.test(buildLog)) return null
    return {
      patternId: 'vercel_function_count_exceeded',
      canAutoPatch: false,
      escalationDetail: 'Vercel function count exceeds plan limit. Consolidation is a judgment call — operator must merge api/ surfaces.',
    }
  },
}

// ============================================================
// Pattern 5 — Missing env var (NO auto-patch; escalate with name)
//
// Patterns:
//   "Missing required environment variable: FOO"
//   "process.env.FOO is undefined"
//   "Error: FOO is not defined" (Vercel runtime)
// ============================================================

const RE_MISSING_ENV_VARIANTS: Array<RegExp> = [
  /Missing\s+(?:required\s+)?(?:environment\s+variable|env(?:ironment)?\s+var)[:\s]+([A-Z][A-Z0-9_]+)/,
  /process\.env\.([A-Z][A-Z0-9_]+)\s+is\s+(?:not\s+defined|undefined)/,
  /([A-Z][A-Z0-9_]+)\s+(?:env\s+var\s+)?is\s+(?:not\s+(?:set|defined|configured)|missing)/,
]

const missingEnvPattern: Pattern = {
  id: 'missing_env_var',
  description: 'Missing env var on Vercel — escalate with var name (no creds in this layer)',
  canAutoPatch: false,
  match(buildLog) {
    for (const re of RE_MISSING_ENV_VARIANTS) {
      const m = re.exec(buildLog)
      if (m) {
        return {
          patternId: 'missing_env_var',
          canAutoPatch: false,
          envVarName: m[1],
          escalationDetail: `Missing env var ${m[1]}. Set it in Vercel project settings — this layer never sets credentials.`,
        }
      }
    }
    return null
  },
}

// ============================================================
// Pattern 6 — Failed migration (NO auto-patch; data risk)
//
// Patterns from `supabase db push`:
//   "ERROR: ... at line N"
//   "supabase db push failed"
//   "migration <NNN> failed"
//   SQLSTATE codes: 42P01, 42703, 23505, etc.
// ============================================================

const RE_FAILED_MIGRATION_VARIANTS: Array<RegExp> = [
  /supabase\s+db\s+push\s+(?:failed|errored)/i,
  /migration\s+\d+[_\w-]*\s+(?:failed|errored)/i,
  /ERROR:\s+.+(?:\sat\s+character\s+\d+|\sLINE\s+\d+:|;\s*SQLSTATE)/i,
  /SQLSTATE\s+(?:42P01|42703|23505|42883|2BP01)/,
]

const failedMigrationPattern: Pattern = {
  id: 'failed_migration',
  description: 'Migration push failed — escalate (data risk; never auto-patch)',
  canAutoPatch: false,
  match(buildLog) {
    for (const re of RE_FAILED_MIGRATION_VARIANTS) {
      const m = re.exec(buildLog)
      if (m) {
        return {
          patternId: 'failed_migration',
          canAutoPatch: false,
          errorMessage: m[0].slice(0, 200),
          escalationDetail: 'Migration push failed. Schema migrations are NEVER auto-patched (data risk).',
        }
      }
    }
    return null
  },
}

// ============================================================
// Public exports
// ============================================================

export const PATTERNS: Pattern[] = [
  // Order matters: more-specific patterns first. Function-count + missing
  // env should match BEFORE the generic TS error patterns so a build that
  // also has a TS error doesn't get auto-patched while the real blocker
  // is the function count.
  functionCountPattern,
  missingEnvPattern,
  failedMigrationPattern,
  tsCoercionPattern,
  tsRedeclarePattern,
  tsSpreadPattern,
]

export function matchAll(buildLog: string): PatternMatch[] {
  const out: PatternMatch[] = []
  for (const p of PATTERNS) {
    const m = p.match(buildLog)
    if (m) out.push(m)
  }
  return out
}

export function findPattern(id: PatternId): Pattern | undefined {
  return PATTERNS.find(p => p.id === id)
}

export function applyPatchFor(
  match: PatternMatch,
  fileContent: string,
): PatchResult | null {
  const p = findPattern(match.patternId)
  if (!p || !p.canAutoPatch || !p.applyPatch) return null
  return p.applyPatch(fileContent, match)
}
