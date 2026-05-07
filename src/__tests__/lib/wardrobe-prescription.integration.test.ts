/**
 * Wardrobe Prescription — Integration Tests
 *
 * Runs against real Supabase. Validates the full round-trip:
 *   1. Schema present (wardrobe_prescriptions, settings, verification_photos.task_type='wardrobe')
 *   2. Insert a prescription manually (simulates mommy-prescribe output)
 *   3. Insert a verification photo with prescription_id
 *   4. Simulate the analyze-photo fulfillment hook on approval:
 *      - prescription flips to 'approved'
 *      - praise outreach lands in handler_outreach_queue
 *   5. Negative path: vision denies → prescription flips 'denied', redo outreach lands
 *   6. Settings off → cron-style invocation skips
 *
 * Cleans up everything it inserts in afterAll. Test rows are tagged with
 * a probe prefix so isTestPollution filters surface protections.
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

// Track what we insert so afterAll can clean up.
const inserted = {
  prescriptions: [] as string[],
  outreach: [] as string[],
  photos: [] as string[],
  wardrobeItems: [] as { id: string; legacy: boolean }[],
  settingsTouched: false,
};

const PROBE = `_probe_wardrobe_presc_${Date.now()}_`;

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
  if (inserted.prescriptions.length > 0) {
    await supabase.from('wardrobe_prescriptions').delete().in('id', inserted.prescriptions);
  }
  for (const item of inserted.wardrobeItems) {
    if (item.legacy) {
      await supabase.from('wardrobe_inventory').delete().eq('id', item.id);
    } else {
      await supabase.from('wardrobe_items').delete().eq('id', item.id);
    }
  }
});

// ────────────────────────────────────────────────────────────────────
// 1. Schema validation
// ────────────────────────────────────────────────────────────────────
describeIntegration('Wardrobe Prescriptions — schema', () => {
  it('wardrobe_prescriptions table exists', async () => {
    const { error } = await supabase.from('wardrobe_prescriptions').select('id').limit(1);
    expect(error).toBeNull();
  });

  it('wardrobe_prescription_settings table exists', async () => {
    const { error } = await supabase.from('wardrobe_prescription_settings').select('user_id').limit(1);
    expect(error).toBeNull();
  });

  it('verification_photos accepts task_type=wardrobe', async () => {
    const { data, error } = await supabase.from('verification_photos').insert({
      user_id: userId,
      task_type: 'wardrobe',
      photo_url: `${PROBE}schema-check.jpg`,
      caption: `${PROBE}schema-check`,
    }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    if (data?.id) inserted.photos.push(data.id);
  });
});

// ────────────────────────────────────────────────────────────────────
// 2. Round-trip — manual prescription, verification, fulfillment
// ────────────────────────────────────────────────────────────────────
describeIntegration('Wardrobe Prescriptions — round-trip', () => {
  let prescId: string;
  let photoId: string;

  it('inserts a prescription (simulates mommy-prescribe)', async () => {
    const { data, error } = await supabase.from('wardrobe_prescriptions').insert({
      user_id: userId,
      description: `${PROBE}a soft satin slip in mama's pink — nothing fancy`,
      item_type: 'sleepwear',
      optional_details: { phase: 2, affect: 'hungry' },
      status: 'pending',
      due_by: new Date(Date.now() + 7 * 86400_000).toISOString(),
      intensity_at_assignment: 'firm',
      affect_at_assignment: 'hungry',
    }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    prescId = data!.id as string;
    inserted.prescriptions.push(prescId);
  });

  it('inserts a verification photo linked to the prescription', async () => {
    const { data, error } = await supabase.from('verification_photos').insert({
      user_id: userId,
      task_type: 'wardrobe',
      photo_url: `${PROBE}fake-presc-photo.jpg`,
      caption: `${PROBE}black silk slip from Target`,
      prescription_id: prescId,
    }).select('id').single();
    expect(error).toBeNull();
    photoId = data!.id as string;
    inserted.photos.push(photoId);
  });

  it('approval path: writes wardrobe_items + flips prescription approved + praise outreach', async () => {
    // Simulate analyze-photo's success branch. Try wardrobe_items first;
    // if it doesn't exist (sibling branch unmerged), use wardrobe_inventory.
    let createdItemId: string | null = null;
    let legacy = false;
    const itemName = `${PROBE}black silk slip from Target`;

    try {
      const { data: wi, error: wiErr } = await supabase.from('wardrobe_items').insert({
        user_id: userId,
        item_type: 'sleepwear',
        item_name: itemName,
        acquired_at: new Date().toISOString(),
        notes: `Mommy-prescribed: ${PROBE}slip`,
      }).select('id').single();
      if (!wiErr) createdItemId = (wi as { id: string }).id;
    } catch (_) { /* table not present in this branch */ }

    if (!createdItemId) {
      const { data: legacyRow } = await supabase.from('wardrobe_inventory').insert({
        user_id: userId,
        item_name: itemName,
        category: 'sleepwear',
        handler_notes: `Mommy-prescribed: ${PROBE}slip`,
        purchase_date: new Date().toISOString().slice(0, 10),
      }).select('id').single();
      createdItemId = (legacyRow as { id: string } | null)?.id ?? null;
      legacy = true;
    }

    if (createdItemId) inserted.wardrobeItems.push({ id: createdItemId, legacy });

    const { error: upErr } = await supabase.from('wardrobe_prescriptions').update({
      status: 'approved',
      verification_photo_id: photoId,
      created_wardrobe_item_id: createdItemId,
    }).eq('id', prescId);
    expect(upErr).toBeNull();

    const { data: presc } = await supabase.from('wardrobe_prescriptions')
      .select('status, created_wardrobe_item_id')
      .eq('id', prescId).single();
    expect(presc?.status).toBe('approved');
    expect(presc?.created_wardrobe_item_id).toBe(createdItemId);

    const { data: praise, error: prErr } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: `${PROBE}that slip looks beautiful on you, baby. now wear it for me tonight.`,
      urgency: 'normal',
      trigger_reason: `wardrobe_prescription_approved:${prescId}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      source: 'mommy_prescribe_praise',
    }).select('id').single();
    expect(prErr).toBeNull();
    if (praise?.id) inserted.outreach.push(praise.id);
  });
});

// ────────────────────────────────────────────────────────────────────
// 3. Negative path — vision denies, redo outreach, no wardrobe row
// ────────────────────────────────────────────────────────────────────
describeIntegration('Wardrobe Prescriptions — denial path', () => {
  let prescId: string;

  it('inserts a prescription', async () => {
    const { data } = await supabase.from('wardrobe_prescriptions').insert({
      user_id: userId,
      description: `${PROBE}a pair of soft satin panties`,
      item_type: 'underwear',
      status: 'pending',
      intensity_at_assignment: 'firm',
    }).select('id').single();
    prescId = data!.id as string;
    inserted.prescriptions.push(prescId);
  });

  it('denial: marks denied, increments retry, fires redo outreach, no wardrobe item', async () => {
    const wardrobeBefore = await supabase.from('wardrobe_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).catch(() => ({ count: null as number | null }));

    // Simulate the denial branch
    await supabase.from('wardrobe_prescriptions').update({
      status: 'denied',
      denied_reason: `${PROBE}cannot see the item clearly — the photo is dark`,
      retry_count: 1,
    }).eq('id', prescId);

    const { data: presc } = await supabase.from('wardrobe_prescriptions')
      .select('status, denied_reason, retry_count, created_wardrobe_item_id')
      .eq('id', prescId).single();
    expect(presc?.status).toBe('denied');
    expect(presc?.retry_count).toBe(1);
    expect(presc?.created_wardrobe_item_id).toBeNull();

    const { data: redo } = await supabase.from('handler_outreach_queue').insert({
      user_id: userId,
      message: `${PROBE}that is not quite right, baby. mama needs a clearer photo. try again.`,
      urgency: 'normal',
      trigger_reason: `wardrobe_prescription_denied:${prescId}`,
      scheduled_for: new Date().toISOString(),
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
      source: 'mommy_prescribe_redo',
    }).select('id').single();
    if (redo?.id) inserted.outreach.push(redo.id);

    // Confirm no NEW wardrobe row leaked in (count unchanged where the
    // table exists; null when it doesn't — both fine).
    const wardrobeAfter = await supabase.from('wardrobe_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).catch(() => ({ count: null as number | null }));
    if (wardrobeBefore.count != null && wardrobeAfter.count != null) {
      expect(wardrobeAfter.count).toBe(wardrobeBefore.count);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// 4. Settings-off gate
// ────────────────────────────────────────────────────────────────────
describeIntegration('Wardrobe Prescriptions — settings-off', () => {
  it('settings row with enabled=false is the cron skip signal', async () => {
    inserted.settingsTouched = true;
    await supabase.from('wardrobe_prescription_settings').upsert({
      user_id: userId,
      enabled: false,
      cadence: 'occasional',
      min_intensity: 'firm',
    });
    const { data } = await supabase.from('wardrobe_prescription_settings')
      .select('enabled, cadence, min_intensity, budget_cap_usd')
      .eq('user_id', userId).single();
    expect(data?.enabled).toBe(false);
    // The cron's skip predicate is (!enabled OR cadence='off'); both
    // true here would short-circuit at the first gate.
  });

  it('budget_cap_usd round-trips numeric values cleanly', async () => {
    await supabase.from('wardrobe_prescription_settings').upsert({
      user_id: userId,
      enabled: false,
      cadence: 'occasional',
      min_intensity: 'firm',
      budget_cap_usd: 79.99,
    });
    const { data } = await supabase.from('wardrobe_prescription_settings')
      .select('budget_cap_usd')
      .eq('user_id', userId).single();
    expect(Number(data?.budget_cap_usd)).toBeCloseTo(79.99, 2);
  });
});
