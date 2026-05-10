/**
 * Pattern library unit tests.
 *
 * Fixture log excerpts come from the actual Vercel build failures the
 * gate would have caught (commits c6fd353 and 26b07b6 — see git log).
 * If you're tempted to soften an assertion: don't. The whole point of
 * the deterministic library is that it gets these exact log shapes
 * right.
 */
import { describe, it, expect } from 'vitest';
import {
  matchAll,
  applyPatchFor,
  PATTERNS,
  findPattern,
} from '../../../supabase/functions/deploy-fixer/patterns';
import {
  pathIsAllowed,
  refuseReason,
  FORBIDDEN_PATH_PATTERNS,
} from '../../../supabase/functions/deploy-fixer/forbidden-paths';

// Real log fixtures from recent prod failures
const LOG_TS2322_NULL_UNDEF = `
Failed to compile.

./api/handler/chat.ts:4142:13 - error TS2322: Type 'string | null' is not assignable to type 'string | undefined'.

4142             audioUrl: await signAudioPath(existingAudio.audio_storage_url),
                 ~~~~~~~~

  src/types.ts:1018:3
    1018   audioUrl?: string;
           ~~~~~~~~
    The expected type comes from property 'audioUrl' which is declared here on type 'ConditioningSession'.
`.trim();

const LOG_TS2451_REDECLARE = `
./api/handler/chat.ts:2219:11 - error TS2451: Cannot redeclare block-scoped variable 'mommyOverlay'.

2219     const mommyOverlay = process.env.DOMMY_MOMMY_OVERLAY === 'true';
             ~~~~~~~~~~~~

  ./api/handler/chat.ts:1804:11
    1804     const mommyOverlay = process.env.DOMMY_MOMMY_OVERLAY === 'true';
                 ~~~~~~~~~~~~
    'mommyOverlay' was also declared here.
`.trim();

const LOG_TS2698_SPREAD = `
./api/calendar/[action].ts:209:10 - error TS2698: Spread types may only be created from object types.

209     return { ...data, ok: true };
                  ~~~~~~~
`.trim();

const LOG_FUNCTION_COUNT = `
[15:21:38.491] No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan.
[15:21:38.491] Try upgrading to Pro: https://vercel.com/pricing
`.trim();

const LOG_MISSING_ENV = `
[16:03:11] Error: Missing required environment variable: ANTHROPIC_API_KEY
    at runHandlerChat (/var/task/api/handler/chat.js:42:11)
`.trim();

const LOG_FAILED_MIGRATION = `
Applying migration 314_deploy_fixer_attempts.sql...
ERROR: relation "deploy_health_log" does not exist at character 287; SQLSTATE 42P01
supabase db push failed
`.trim();

const LOG_NO_MATCH = `
[15:00:01.000] Build complete: 18.4s
[15:00:02.123] Deploy complete: https://example.vercel.app
`.trim();

// ============================================================
// Pattern: ts_coercion_null_undefined
// ============================================================

describe('pattern: ts_coercion_null_undefined', () => {
  it('matches the TS2322 null→undefined fixture and extracts file/line', () => {
    const matches = matchAll(LOG_TS2322_NULL_UNDEF);
    const m = matches.find(x => x.patternId === 'ts_coercion_null_undefined');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(true);
    expect(m!.errorCode).toBe('TS2322');
    expect(m!.filePath).toBe('api/handler/chat.ts');
    expect(m!.lineNumber).toBe(4142);
    expect(m!.columnNumber).toBe(13);
  });

  it('applies a patch that wraps the call site with `?? undefined`', () => {
    const matches = matchAll(LOG_TS2322_NULL_UNDEF);
    const m = matches.find(x => x.patternId === 'ts_coercion_null_undefined')!;
    // 4142 lines of throwaway content + the real one at 4142
    const fileLines: string[] = [];
    for (let i = 1; i < 4142; i++) fileLines.push('// filler');
    fileLines.push('            audioUrl: await signAudioPath(existingAudio.audio_storage_url),');
    fileLines.push('// after');
    const file = fileLines.join('\n');

    const patch = applyPatchFor(m, file);
    expect(patch).not.toBeNull();
    const newLine = patch!.newContent.split('\n')[4141];
    expect(newLine).toContain('?? undefined');
    expect(newLine).toMatch(/audioUrl: \(await signAudioPath\(existingAudio\.audio_storage_url\)\) \?\? undefined,/);
  });

  it('is idempotent — second pass on already-patched content returns null', () => {
    const matches = matchAll(LOG_TS2322_NULL_UNDEF);
    const m = matches.find(x => x.patternId === 'ts_coercion_null_undefined')!;
    const fileLines: string[] = [];
    for (let i = 1; i < 4142; i++) fileLines.push('// filler');
    // Already patched
    fileLines.push('            audioUrl: (await signAudioPath(existingAudio.audio_storage_url)) ?? undefined,');
    const file = fileLines.join('\n');
    const patch = applyPatchFor(m, file);
    expect(patch).toBeNull();
  });
});

// ============================================================
// Pattern: ts_variable_redeclare
// ============================================================

describe('pattern: ts_variable_redeclare', () => {
  it('matches TS2451 and extracts the variable name', () => {
    const matches = matchAll(LOG_TS2451_REDECLARE);
    const m = matches.find(x => x.patternId === 'ts_variable_redeclare');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(true);
    expect(m!.varName).toBe('mommyOverlay');
    expect(m!.filePath).toBe('api/handler/chat.ts');
    expect(m!.lineNumber).toBe(2219);
  });

  it('renames the latter declaration and all subsequent uses to <name>2', () => {
    const matches = matchAll(LOG_TS2451_REDECLARE);
    const m = matches.find(x => x.patternId === 'ts_variable_redeclare')!;
    // Construct a small file where line 2219 is the second declaration and
    // there are 2 subsequent uses.
    const fileLines: string[] = [];
    for (let i = 1; i < 2219; i++) fileLines.push('// filler');
    fileLines.push("    const mommyOverlay = process.env.DOMMY_MOMMY_OVERLAY === 'true';");
    fileLines.push('    if (mommyOverlay) {');
    fileLines.push('      doSomething(mommyOverlay);');
    fileLines.push('    }');
    const file = fileLines.join('\n');

    const patch = applyPatchFor(m, file);
    expect(patch).not.toBeNull();
    const newLines = patch!.newContent.split('\n');
    expect(newLines[2218]).toContain('mommyOverlay2');
    expect(newLines[2218]).not.toMatch(/\bmommyOverlay\b(?!2)/);
    expect(newLines[2219]).toContain('if (mommyOverlay2)');
    expect(newLines[2220]).toContain('doSomething(mommyOverlay2)');
  });
});

// ============================================================
// Pattern: ts_spread_widened_type
// ============================================================

describe('pattern: ts_spread_widened_type', () => {
  it('matches TS2698 and extracts file/line', () => {
    const matches = matchAll(LOG_TS2698_SPREAD);
    const m = matches.find(x => x.patternId === 'ts_spread_widened_type');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(true);
    expect(m!.filePath).toBe('api/calendar/[action].ts');
    expect(m!.lineNumber).toBe(209);
  });

  it('casts the spread expression through unknown', () => {
    const matches = matchAll(LOG_TS2698_SPREAD);
    const m = matches.find(x => x.patternId === 'ts_spread_widened_type')!;
    const fileLines: string[] = [];
    for (let i = 1; i < 209; i++) fileLines.push('// filler');
    fileLines.push('    return { ...data, ok: true };');
    const file = fileLines.join('\n');

    const patch = applyPatchFor(m, file);
    expect(patch).not.toBeNull();
    const newLine = patch!.newContent.split('\n')[208];
    expect(newLine).toContain('...(data as unknown as Record<string, unknown>)');
  });

  it('is idempotent on already-cast spread', () => {
    const matches = matchAll(LOG_TS2698_SPREAD);
    const m = matches.find(x => x.patternId === 'ts_spread_widened_type')!;
    const fileLines: string[] = [];
    for (let i = 1; i < 209; i++) fileLines.push('// filler');
    fileLines.push('    return { ...(data as unknown as Record<string, unknown>), ok: true };');
    const file = fileLines.join('\n');
    const patch = applyPatchFor(m, file);
    expect(patch).toBeNull();
  });
});

// ============================================================
// Pattern: vercel_function_count_exceeded (escalate, no patch)
// ============================================================

describe('pattern: vercel_function_count_exceeded', () => {
  it('matches the Hobby-plan function-count message', () => {
    const matches = matchAll(LOG_FUNCTION_COUNT);
    const m = matches.find(x => x.patternId === 'vercel_function_count_exceeded');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(false);
    expect(m!.escalationDetail).toMatch(/consolidation/i);
  });

  it('cannot apply a patch (canAutoPatch=false)', () => {
    const matches = matchAll(LOG_FUNCTION_COUNT);
    const m = matches.find(x => x.patternId === 'vercel_function_count_exceeded')!;
    expect(applyPatchFor(m, 'whatever')).toBeNull();
  });
});

// ============================================================
// Pattern: missing_env_var (escalate with var name)
// ============================================================

describe('pattern: missing_env_var', () => {
  it('extracts the env var name from the error and escalates', () => {
    const matches = matchAll(LOG_MISSING_ENV);
    const m = matches.find(x => x.patternId === 'missing_env_var');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(false);
    expect(m!.envVarName).toBe('ANTHROPIC_API_KEY');
    expect(m!.escalationDetail).toMatch(/ANTHROPIC_API_KEY/);
  });
});

// ============================================================
// Pattern: failed_migration (escalate; never auto-patch)
// ============================================================

describe('pattern: failed_migration', () => {
  it('matches supabase db push failure logs', () => {
    const matches = matchAll(LOG_FAILED_MIGRATION);
    const m = matches.find(x => x.patternId === 'failed_migration');
    expect(m).toBeDefined();
    expect(m!.canAutoPatch).toBe(false);
    expect(m!.escalationDetail).toMatch(/never auto-patched/i);
  });
});

// ============================================================
// Negative: no match
// ============================================================

describe('matchAll() with no recognizable failure', () => {
  it('returns an empty list', () => {
    expect(matchAll(LOG_NO_MATCH)).toEqual([]);
  });

  it('returns empty for a build log with only generic noise', () => {
    expect(matchAll('[10:00] Build started')).toEqual([]);
    expect(matchAll('')).toEqual([]);
  });
});

// ============================================================
// Forbidden paths
// ============================================================

describe('forbidden-paths', () => {
  it('refuses scripts/handler-regression', () => {
    expect(pathIsAllowed('scripts/handler-regression/preflight.mjs')).toBe(false);
    expect(refuseReason('scripts/handler-regression/preflight.mjs')).toContain('handler-regression');
  });

  it('refuses api/auth/', () => {
    expect(pathIsAllowed('api/auth/login.ts')).toBe(false);
  });

  it('refuses payment / stripe / billing surfaces', () => {
    expect(pathIsAllowed('api/payments/charge.ts')).toBe(false);
    expect(pathIsAllowed('src/lib/stripe-helper.ts')).toBe(false);
    expect(pathIsAllowed('api/billing/invoice.ts')).toBe(false);
  });

  it('refuses .github/workflows/ — even the api-typecheck file', () => {
    expect(pathIsAllowed('.github/workflows/api-typecheck.yml')).toBe(false);
    expect(pathIsAllowed('.github/workflows/preflight.yml')).toBe(false);
  });

  it('refuses supabase/migrations/ (data risk)', () => {
    expect(pathIsAllowed('supabase/migrations/314_deploy_fixer_attempts.sql')).toBe(false);
  });

  it('allows benign code paths', () => {
    expect(pathIsAllowed('api/handler/chat.ts')).toBe(true);
    expect(pathIsAllowed('src/components/today-redesign/DeployFixerStatusCard.tsx')).toBe(true);
    expect(pathIsAllowed('supabase/functions/deploy-fixer/index.ts')).toBe(true);
  });

  it('mirrors the parent FORBIDDEN_PATH_PATTERNS exposed by mommy-builder', () => {
    // Drift detection: if you add a forbidden path here, add it to
    // scripts/mommy/builder.ts:FORBIDDEN_PATH_PATTERNS too. Both shippers
    // must respect the same authority boundary.
    const sources = FORBIDDEN_PATH_PATTERNS.map(p => p.source);
    expect(sources).toContain('^scripts\\/handler-regression\\/');
    expect(sources).toContain('^api\\/auth\\/');
    expect(sources).toContain('payment');
    expect(sources).toContain('stripe');
    expect(sources).toContain('\\.github\\/workflows\\/');
  });
});

// ============================================================
// PATTERNS export shape
// ============================================================

describe('PATTERNS array', () => {
  it('contains all six expected patterns in priority order', () => {
    const ids = PATTERNS.map(p => p.id);
    // Function count + missing env + failed migration come BEFORE TS
    // patterns. If TS error and function count both appear in the same
    // log, we want the function count to win because it's the real
    // blocker (TS error is downstream).
    expect(ids[0]).toBe('vercel_function_count_exceeded');
    expect(ids[1]).toBe('missing_env_var');
    expect(ids[2]).toBe('failed_migration');
    expect(ids).toContain('ts_coercion_null_undefined');
    expect(ids).toContain('ts_variable_redeclare');
    expect(ids).toContain('ts_spread_widened_type');
    expect(ids.length).toBe(6);
  });

  it('every pattern with canAutoPatch=true has an applyPatch function', () => {
    for (const p of PATTERNS) {
      if (p.canAutoPatch) expect(typeof p.applyPatch).toBe('function');
      else expect(p.applyPatch).toBeUndefined();
    }
  });

  it('findPattern returns the pattern by id', () => {
    expect(findPattern('ts_coercion_null_undefined')?.id).toBe('ts_coercion_null_undefined');
    expect(findPattern('vercel_function_count_exceeded')?.canAutoPatch).toBe(false);
  });
});
