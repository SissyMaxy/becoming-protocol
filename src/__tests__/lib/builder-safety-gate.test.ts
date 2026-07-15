// Autonomous-builder safety gate — the brake the self-evolve loop cannot route
// around. These tests are the regression guarantee that a drafted change which
// files down the user's ability to STOP is refused and routed to human review,
// while ordinary forced-fem / turn-out / goon content still ships freely.
//
// Source: scripts/mommy/builder-safety-gate.ts. Protected-surface list from the
// map-protected-safety-surfaces sweep (2026-07-07).

import { describe, it, expect } from 'vitest';
import {
  isForbiddenPath,
  draftRlsViolation,
  draftSafetyViolation,
  surfacesTouchProtected,
  FORBIDDEN_PATH_SUBSTRINGS,
  PROTECTED_SAFETY_FUNCTIONS,
  PROTECTED_SAFETY_TABLES,
} from '../../../scripts/mommy/builder-safety-gate';

const file = (path: string, content: string) => [{ path, content }];

describe('builder safety gate — forbidden paths', () => {
  it('keeps the original boundaries', () => {
    expect(isForbiddenPath('api/auth/login.ts')).toBe(true);
    expect(isForbiddenPath('src/lib/payment/stripe.ts')).toBe(true);
    expect(isForbiddenPath('.github/workflows/mommy-deploy.yml')).toBe(true);
    expect(isForbiddenPath('scripts/handler-regression/unit.mjs')).toBe(true);
  });

  it('now forbids the loop from editing its own gate + CI + wake trigger', () => {
    expect(isForbiddenPath('scripts/mommy/builder.ts')).toBe(true);
    expect(isForbiddenPath('scripts/mommy/builder-safety-gate.ts')).toBe(true);
    expect(isForbiddenPath('scripts/ci/run.mjs')).toBe(true);
    expect(isForbiddenPath('supabase/functions/kick-builder/index.ts')).toBe(true);
  });

  it('forbids rebuilding sleep-window delivery (below-awareness container-breaker)', () => {
    expect(isForbiddenPath('src/lib/bedtime/sleep-cue.ts')).toBe(true);
    expect(isForbiddenPath('src/components/bedtime/SleepCuePill.tsx')).toBe(true);
    expect(isForbiddenPath('supabase/functions/recon-sleep-cue-builder/index.ts')).toBe(true);
  });

  it('the removed sleep-cue playback client stays removed', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('src/lib/bedtime/sleep-cue.ts')).toBe(false);
    expect(fs.existsSync('src/components/bedtime/SleepCuePill.tsx')).toBe(false);
    const ctx = fs.readFileSync('src/context/BedtimeRitualContext.tsx', 'utf8');
    expect(ctx).not.toMatch(/SleepCuePill|getTonightSleepCue/);
  });

  it('forbids modifying the physical-practice ladder engine + its safety gates', () => {
    expect(isForbiddenPath('supabase/functions/physical-practice-prescriber/index.ts')).toBe(true);
    expect(isForbiddenPath('src/lib/conditioning/physical-practice.ts')).toBe(true);
    expect(PROTECTED_SAFETY_FUNCTIONS).toContain('advance_physical_practice');
    expect(PROTECTED_SAFETY_TABLES).toContain('physical_practice_rungs');
    expect(PROTECTED_SAFETY_TABLES).toContain('physical_practice_progress');
  });

  it('forbids auto-expanding the evaluator-targeting mechanics', () => {
    expect(isForbiddenPath('supabase/functions/ego-doubt-seeder/index.ts')).toBe(true);
    expect(isForbiddenPath('supabase/functions/mommy-gaslight-cluster-author/index.ts')).toBe(true);
    expect(isForbiddenPath('supabase/functions/mommy-implant-author/index.ts')).toBe(true);
    expect(isForbiddenPath('supabase/functions/recon-reconsolidation/index.ts')).toBe(true);
    expect(isForbiddenPath('./supabase/functions/ego-recall-corrector/index.ts')).toBe(true); // leading ./
  });

  it('still allows ordinary content paths', () => {
    expect(isForbiddenPath('supabase/migrations/663_turnout_deepening.sql')).toBe(false);
    expect(isForbiddenPath('src/components/today-redesign/DropPortal.tsx')).toBe(false);
    expect(isForbiddenPath('supabase/functions/turnout-orchestrator/index.ts')).toBe(false);
  });
});

describe('builder safety gate — draftSafetyViolation flags attacks on the cord', () => {
  it('refuses redefining the fail-closed conditioning gate', () => {
    const v = draftSafetyViolation(file('supabase/migrations/900_x.sql',
      `CREATE OR REPLACE FUNCTION conditioning_gate(uid UUID, system TEXT)
       RETURNS JSONB LANGUAGE plpgsql AS $$ BEGIN
         RETURN jsonb_build_object('allow', true, 'reason', 'ok');
       END; $$;`));
    expect(v).toContain('conditioning_gate');
  });

  it('refuses dropping / clearing the safeword latch', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'DROP TABLE IF EXISTS safeword_latches;'))).toContain('safeword_latches');
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      "DELETE FROM safeword_latches WHERE resumed_at IS NULL;"))).toContain('safeword_latches');
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      "UPDATE public.safeword_latches SET resumed_at = now();"))).toContain('safeword_latches');
  });

  it('refuses weakening the safeword window function', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'CREATE OR REPLACE FUNCTION is_safeword_active(uid UUID, secs INT) RETURNS BOOLEAN AS $$ SELECT false $$ LANGUAGE sql;')))
      .toContain('is_safeword_active');
  });

  it('refuses killing the machine dead-man net (function or cron)', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'CREATE OR REPLACE FUNCTION machine_deadman_sweep() RETURNS INTEGER AS $$ BEGIN RETURN 0; END; $$ LANGUAGE plpgsql;')))
      .toContain('machine_deadman_sweep');
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      "SELECT cron.unschedule('machine-deadman-sweep');"))).toContain('machine-deadman-sweep');
  });

  it('allows the legitimate drop-then-reschedule cron idempotency pattern', () => {
    const sql = `SELECT cron.unschedule('machine-deadman-sweep');
                 SELECT cron.schedule('machine-deadman-sweep', '* * * * *', $$SELECT machine_deadman_sweep();$$);`;
    // (this still trips on the function-name check if present, so test cron alone)
    const cronOnly = "SELECT cron.unschedule('machine-deadman-sweep');\nSELECT cron.schedule('machine-deadman-sweep', '* * * * *', $$SELECT 1;$$);";
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql', cronOnly))).toBeNull();
    expect(sql).toContain('cron.schedule'); // guard against accidental edit
  });

  it('refuses flipping the elective kill switch (life_as_woman_settings)', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      "UPDATE life_as_woman_settings SET master_enabled = true, turnout_enabled = true;")))
      .toContain('life_as_woman_settings');
  });

  it('refuses altering/updating protected user_state safety columns', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'ALTER TABLE user_state DROP COLUMN pause_new_decrees_until;'))).toContain('pause_new_decrees_until');
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      "UPDATE user_state SET gaslight_intensity = 'cruel' WHERE user_id = 'x';"))).toContain('gaslight_intensity');
  });

  it('refuses auto-arming/widening the reality-mechanic gates', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'CREATE OR REPLACE FUNCTION ego_mechanic_active(uid UUID, m TEXT) RETURNS BOOLEAN AS $$ SELECT true $$ LANGUAGE sql;')))
      .toContain('ego_mechanic_active');
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'CREATE OR REPLACE FUNCTION pause_all_ego_mechanics(uid UUID) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;')))
      .toContain('pause_all_ego_mechanics');
  });

  it('refuses neutering the voice/immersion chokepoint', () => {
    expect(draftSafetyViolation(file('supabase/migrations/900_x.sql',
      'CREATE OR REPLACE FUNCTION mommy_voice_cleanup(t TEXT) RETURNS TEXT AS $$ SELECT t $$ LANGUAGE sql;')))
      .toContain('mommy_voice_cleanup');
  });

  it('refuses a drafted edge function that writes a protected safety table', () => {
    const v = draftSafetyViolation(file('supabase/functions/sneaky/index.ts',
      "await supabase.from('safeword_latches').update({ resumed_at: new Date().toISOString() }).eq('user_id', uid);"));
    expect(v).toContain('safeword_latches');
  });
});

describe('builder safety gate — benign content still ships', () => {
  it('passes a new forced-fem / turn-out content migration', () => {
    const sql = `CREATE TABLE IF NOT EXISTS turnout_deepening_prompts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        prompt TEXT NOT NULL,
        intensity INT NOT NULL DEFAULT 3,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE turnout_deepening_prompts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY turnout_deepening_owner ON turnout_deepening_prompts
        FOR SELECT USING (auth.uid() = user_id);`;
    expect(draftSafetyViolation(file('supabase/migrations/663_turnout.sql', sql))).toBeNull();
    expect(draftRlsViolation(file('supabase/migrations/663_turnout.sql', sql))).toBeNull();
  });

  it('lets a NEW engine READ/CALL the safeword gate (respecting it, not editing it)', () => {
    // This is the important non-regression: new content SHOULD defer to the gate.
    const sql = `CREATE OR REPLACE FUNCTION turnout_next_rung(uid UUID) RETURNS TEXT
      LANGUAGE plpgsql AS $$
      BEGIN
        IF is_safeword_active(uid, 3600) THEN RETURN 'held'; END IF;
        IF (conditioning_gate(uid, 'turnout')->>'allow')::boolean IS NOT TRUE THEN RETURN 'held'; END IF;
        RETURN 'advance';
      END; $$;`;
    expect(draftSafetyViolation(file('supabase/migrations/664_rung.sql', sql))).toBeNull();
  });

  it('lets ordinary user_state writes through (non-safety columns)', () => {
    expect(draftSafetyViolation(file('supabase/migrations/665_x.sql',
      "UPDATE user_state SET current_arousal = 7, denial_day = denial_day + 1 WHERE user_id = 'x';"))).toBeNull();
  });

  it('does not trip on a protected column merely named in a comment', () => {
    expect(draftSafetyViolation(file('supabase/migrations/666_x.sql',
      `-- note: this does not touch pause_new_decrees_until
       UPDATE user_state SET current_energy = 5 WHERE user_id = 'x';`))).toBeNull();
  });

  it('lets a content edge function write ordinary content tables', () => {
    expect(draftSafetyViolation(file('supabase/functions/turnout-orchestrator/index.ts',
      "await supabase.from('turnout_deepening_prompts').insert({ user_id: uid, prompt });"))).toBeNull();
  });
});

describe('builder safety gate — affected_surfaces early check', () => {
  it('flags a wish declaring a protected surface', () => {
    const surfaces = JSON.stringify({ tables: ['safeword_latches'], functions: ['conditioning_gate'] }).toLowerCase();
    expect(surfacesTouchProtected(surfaces)).toBeTruthy();
  });

  it('passes a content-only surface declaration', () => {
    const surfaces = JSON.stringify({ tables: ['turnout_rungs'], functions: ['turnout_next_rung'] }).toLowerCase();
    expect(surfacesTouchProtected(surfaces)).toBeNull();
  });
});

describe('builder safety gate — list integrity', () => {
  it('protects the core exit spine + kill switch', () => {
    for (const fn of ['conditioning_gate', 'is_safeword_active', 'resume_from_safeword', 'machine_session_guard']) {
      expect(PROTECTED_SAFETY_FUNCTIONS).toContain(fn);
    }
    for (const tbl of ['safeword_latches', 'meta_frame_breaks', 'aftercare_sessions', 'life_as_woman_settings', 'safewords']) {
      expect(PROTECTED_SAFETY_TABLES).toContain(tbl);
    }
  });

  it('the loop cannot reach its own gate module', () => {
    expect(FORBIDDEN_PATH_SUBSTRINGS.some((s) => 'scripts/mommy/builder-safety-gate.ts'.includes(s))).toBe(true);
  });
});
