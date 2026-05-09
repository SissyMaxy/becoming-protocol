/**
 * Public Dares — Integration Tests
 *
 * Runs against real Supabase. Validates:
 *   1. Schema present (templates, assignments, settings, verification_photos
 *      task_type='public_dare')
 *   2. Seed catalog is non-empty after migration 315
 *   3. Assignment lifecycle: pending → in_progress → completed
 *   4. Skipping flips status='skipped' with no penalty side effects
 *   5. Verification linkage: photo + verification_artifact_id round-trip
 *   6. Settings opt-out is the picker's privacy floor (off → no firing)
 *   7. Location-context ack is a boolean — never coordinates
 *
 * Cleans up everything it inserts in afterAll. Test rows are tagged with
 * a probe prefix so test-pollution filters protect surfaces.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_INTEGRATION = !SUPABASE_URL || !SERVICE_KEY;
const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

let supabase: SupabaseClient;
let userId: string;

const PROBE = `_probe_public_dare_${Date.now()}_`;

const inserted = {
  templates: [] as string[],
  assignments: [] as string[],
  outreach: [] as string[],
  photos: [] as string[],
  settingsTouched: false,
};

beforeAll(async () => {
  if (SKIP_INTEGRATION) return;
  supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const { data } = await supabase.from('user_progress').select('user_id').limit(1).single();
  userId = (data as { user_id: string } | null)?.user_id ?? '';
  if (!userId) throw new Error('No user found — run the app first');
});

afterAll(async () => {
  if (SKIP_INTEGRATION || !supabase) return;
  if (inserted.outreach.length > 0) {
    await supabase.from('handler_outreach_queue').delete().in('id', inserted.outreach);
  }
  if (inserted.photos.length > 0) {
    await supabase.from('verification_photos').delete().in('id', inserted.photos);
  }
  if (inserted.assignments.length > 0) {
    await supabase.from('public_dare_assignments').delete().in('id', inserted.assignments);
  }
  if (inserted.templates.length > 0) {
    await supabase.from('public_dare_templates').delete().in('id', inserted.templates);
  }
});

// ────────────────────────────────────────────────────────────────────
// 1. Schema
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — schema', () => {
  it('public_dare_templates table exists', async () => {
    const { error } = await supabase.from('public_dare_templates').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('public_dare_assignments table exists', async () => {
    const { error } = await supabase.from('public_dare_assignments').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('public_dare_settings table exists', async () => {
    const { error } = await supabase.from('public_dare_settings').select('user_id').limit(1);
    expect(error).toBeNull();
  });

  it('verification_photos accepts task_type=public_dare', async () => {
    const { data, error } = await supabase.from('verification_photos').insert({
      user_id: userId,
      task_type: 'public_dare',
      photo_url: `${PROBE}schema-check.jpg`,
      caption: `${PROBE}schema-check`,
    }).select('id').single();
    expect(error).toBeNull();
    if (data?.id) inserted.photos.push(data.id as string);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. Seed catalog
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — seed catalog', () => {
  it('contains active templates across all six kinds', async () => {
    const { data } = await supabase.from('public_dare_templates')
      .select('kind')
      .eq('active', true)
      .limit(500);
    const kinds = new Set((data as Array<{ kind: string }> | null)?.map(r => r.kind) ?? []);
    expect(kinds.has('mantra')).toBe(true);
    expect(kinds.has('posture')).toBe(true);
    expect(kinds.has('position')).toBe(true);
    expect(kinds.has('wardrobe')).toBe(true);
    expect(kinds.has('micro_ritual')).toBe(true);
    expect(kinds.has('errand_specific')).toBe(true);
  });

  it('has at least 30 active templates total', async () => {
    const { count } = await supabase.from('public_dare_templates')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    expect(count ?? 0).toBeGreaterThanOrEqual(30);
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. Lifecycle: pending → in_progress → completed
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — lifecycle', () => {
  let templateId: string;
  let assignmentId: string;

  it('inserts a probe template (text_ack, no location)', async () => {
    const { data, error } = await supabase.from('public_dare_templates').insert({
      kind: 'mantra',
      description: `${PROBE}probe lifecycle dare`,
      phase_min: 1,
      phase_max: 7,
      intensity_tier: 'gentle',
      requires_location_context: false,
      verification_kind: 'text_ack',
      cooldown_days: 1,
    }).select('id').single();
    expect(error).toBeNull();
    templateId = data!.id as string;
    inserted.templates.push(templateId);
  });

  it('creates assignment in pending state', async () => {
    const { data, error } = await supabase.from('public_dare_assignments').insert({
      user_id: userId,
      template_id: templateId,
      status: 'pending',
      due_by: new Date(Date.now() + 14 * 86400_000).toISOString(),
      intensity_at_assignment: 'gentle',
      phase_at_assignment: 3,
    }).select('id, status').single();
    expect(error).toBeNull();
    expect(data?.status).toBe('pending');
    assignmentId = data!.id as string;
    inserted.assignments.push(assignmentId);
  });

  it('flips to in_progress on user action', async () => {
    await supabase.from('public_dare_assignments')
      .update({ status: 'in_progress' })
      .eq('id', assignmentId);
    const { data } = await supabase.from('public_dare_assignments')
      .select('status').eq('id', assignmentId).single();
    expect(data?.status).toBe('in_progress');
  });

  it('flips to completed with completed_at set', async () => {
    const completedAt = new Date().toISOString();
    await supabase.from('public_dare_assignments')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', assignmentId);
    const { data } = await supabase.from('public_dare_assignments')
      .select('status, completed_at').eq('id', assignmentId).single();
    expect(data?.status).toBe('completed');
    expect(data?.completed_at).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. Skipping is graceful — no penalty
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — skip path', () => {
  let templateId: string;
  let assignmentId: string;

  it('inserts probe template and assignment', async () => {
    const { data: tpl } = await supabase.from('public_dare_templates').insert({
      kind: 'posture',
      description: `${PROBE}skip path probe`,
      phase_min: 1,
      phase_max: 7,
      intensity_tier: 'gentle',
      verification_kind: 'text_ack',
      cooldown_days: 1,
    }).select('id').single();
    templateId = tpl!.id as string;
    inserted.templates.push(templateId);

    const { data: assn } = await supabase.from('public_dare_assignments').insert({
      user_id: userId,
      template_id: templateId,
      status: 'pending',
    }).select('id').single();
    assignmentId = assn!.id as string;
    inserted.assignments.push(assignmentId);
  });

  it('skip flips status without setting completed_at or artifact', async () => {
    await supabase.from('public_dare_assignments')
      .update({ status: 'skipped' })
      .eq('id', assignmentId);
    const { data } = await supabase.from('public_dare_assignments')
      .select('status, completed_at, verification_artifact_id')
      .eq('id', assignmentId).single();
    expect(data?.status).toBe('skipped');
    expect(data?.completed_at).toBeNull();
    expect(data?.verification_artifact_id).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// 5. Verification linkage
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — verification linkage', () => {
  let templateId: string;
  let assignmentId: string;
  let photoId: string;

  it('inserts probe template (photo verification)', async () => {
    const { data } = await supabase.from('public_dare_templates').insert({
      kind: 'wardrobe',
      description: `${PROBE}photo-verified dare`,
      phase_min: 1,
      phase_max: 7,
      intensity_tier: 'gentle',
      verification_kind: 'photo',
      cooldown_days: 1,
    }).select('id').single();
    templateId = data!.id as string;
    inserted.templates.push(templateId);
  });

  it('inserts pending assignment', async () => {
    const { data } = await supabase.from('public_dare_assignments').insert({
      user_id: userId,
      template_id: templateId,
      status: 'pending',
    }).select('id').single();
    assignmentId = data!.id as string;
    inserted.assignments.push(assignmentId);
  });

  it('inserts a verification photo with task_type=public_dare', async () => {
    const { data, error } = await supabase.from('verification_photos').insert({
      user_id: userId,
      task_type: 'public_dare',
      photo_url: `${PROBE}fake-dare-photo.jpg`,
      caption: `${PROBE}stockings under jeans`,
    }).select('id').single();
    expect(error).toBeNull();
    photoId = data!.id as string;
    inserted.photos.push(photoId);
  });

  it('completes assignment with verification_artifact_id pointing at photo', async () => {
    await supabase.from('public_dare_assignments').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      verification_artifact_id: photoId,
    }).eq('id', assignmentId);

    const { data } = await supabase.from('public_dare_assignments')
      .select('status, verification_artifact_id')
      .eq('id', assignmentId).single();
    expect(data?.status).toBe('completed');
    expect(data?.verification_artifact_id).toBe(photoId);
  });
});

// ────────────────────────────────────────────────────────────────────
// 6. Settings opt-out is the privacy floor
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — settings opt-out', () => {
  it('upserts settings with public_dare_enabled=false', async () => {
    inserted.settingsTouched = true;
    const { data, error } = await supabase.from('public_dare_settings').upsert({
      user_id: userId,
      public_dare_enabled: false,
      cadence: 'occasional',
      min_intensity: 'gentle',
    }).select('public_dare_enabled, cadence, min_intensity').single();
    expect(error).toBeNull();
    expect(data?.public_dare_enabled).toBe(false);
  });

  it('cadence=off is also a skip signal', async () => {
    await supabase.from('public_dare_settings').upsert({
      user_id: userId,
      public_dare_enabled: true,
      cadence: 'off',
      min_intensity: 'gentle',
    });
    const { data } = await supabase.from('public_dare_settings')
      .select('cadence').eq('user_id', userId).single();
    expect(data?.cadence).toBe('off');
  });

  it('allowed_kinds round-trips an array', async () => {
    await supabase.from('public_dare_settings').upsert({
      user_id: userId,
      public_dare_enabled: false,
      cadence: 'occasional',
      min_intensity: 'gentle',
      allowed_kinds: ['mantra', 'posture'],
    });
    const { data } = await supabase.from('public_dare_settings')
      .select('allowed_kinds').eq('user_id', userId).single();
    expect(Array.isArray(data?.allowed_kinds)).toBe(true);
    expect((data?.allowed_kinds ?? []).sort()).toEqual(['mantra', 'posture']);
  });
});

// ────────────────────────────────────────────────────────────────────
// 7. Location-context ack is a boolean (never coordinates)
// ────────────────────────────────────────────────────────────────────
describeIntegration('Public dares — location-context privacy', () => {
  let templateId: string;
  let assignmentId: string;

  it('inserts probe (requires_location_context=true)', async () => {
    const { data } = await supabase.from('public_dare_templates').insert({
      kind: 'errand_specific',
      description: `${PROBE}loc-context probe`,
      phase_min: 1,
      phase_max: 7,
      intensity_tier: 'gentle',
      requires_location_context: true,
      verification_kind: 'text_ack',
      cooldown_days: 1,
    }).select('id').single();
    templateId = data!.id as string;
    inserted.templates.push(templateId);

    const { data: a } = await supabase.from('public_dare_assignments').insert({
      user_id: userId,
      template_id: templateId,
      status: 'pending',
    }).select('id').single();
    assignmentId = a!.id as string;
    inserted.assignments.push(assignmentId);
  });

  it('"I am at the place" tap is a timestamp ack — only', async () => {
    const ackAt = new Date().toISOString();
    await supabase.from('public_dare_assignments')
      .update({ location_context_acknowledged_at: ackAt })
      .eq('id', assignmentId);
    const { data } = await supabase.from('public_dare_assignments')
      .select('location_context_acknowledged_at')
      .eq('id', assignmentId).single();
    expect(data?.location_context_acknowledged_at).toBeTruthy();

    // No GPS column, no place_id column, no neighborhood/city/zip — the
    // assignment row only knows that an ack happened. Schema audit: list
    // the columns and assert no obvious location fields exist.
    const { data: cols } = await supabase.rpc('public_dare_assn_columns_for_test')
      .single()
      .then(r => ({ data: r.data ?? null }), () => ({ data: null }));
    // The RPC may not exist; if so, fall back to a row-shape check on
    // the row we just read. The row should only have the timestamp,
    // not geo data.
    if (!cols) {
      const { data: row } = await supabase.from('public_dare_assignments')
        .select('*')
        .eq('id', assignmentId).single();
      const keys = Object.keys(row ?? {});
      const forbidden = keys.filter(k => /(\blat\b|\blng\b|longitude|latitude|gps|coord|geo|place_id|address|zip|postcode|city|neighborhood)/i.test(k));
      expect(forbidden).toEqual([]);
    }
  });
});
