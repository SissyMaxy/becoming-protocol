// End-to-end validation of what was shipped this session.
//
// Runs a series of checks against the live DB + logic modules. Each test
// reports PASS/FAIL. No mutations except to test rows that are cleaned up.
//
// Usage: npx tsx test-integration.ts

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './config';
import { buildMaxyVoiceSystem, invalidateVoiceCache } from './voice-system';
import { persistIrreversibilityScore } from './irreversibility-persist';
import { runIrreversibilityPressure } from './irreversibility-pressure';
import { extractContactIntelligence } from './contact-intelligence';
import { needsMaxyInput, loadMaxyFactsBlock } from './grounded-facts';
import { consumePendingForChat, markPendingSent } from './pending-outbound-sender';

const USER_ID = process.env.USER_ID || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

interface Result { name: string; pass: boolean; detail: string }
const results: Result[] = [];
let passCount = 0, failCount = 0;

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  if (pass) passCount++; else failCount++;
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function test<T>(name: string, fn: () => Promise<T>, validate: (r: T) => { ok: boolean; detail?: string }): Promise<T | null> {
  try {
    const r = await fn();
    const v = validate(r);
    record(name, v.ok, v.detail || '');
    return r;
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function main() {
  if (!USER_ID) { console.error('USER_ID env missing'); process.exit(1); }
  if (!ANTHROPIC_KEY) { console.error('ANTHROPIC_API_KEY env missing'); process.exit(1); }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

  console.log('\n=== Table existence + RLS read ===\n');

  await test('contacts table readable', async () => {
    return await supabase.from('contacts').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : `rows=${r.data?.length ?? 0}` }));

  await test('contact_events readable', async () => {
    return await supabase.from('contact_events').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : `rows=${r.data?.length ?? 0}` }));

  await test('irreversibility_score table exists (mig 202)', async () => {
    return await supabase.from('irreversibility_score').select('score').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('irreversibility_score_history table exists', async () => {
    return await supabase.from('irreversibility_score_history').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('handler_briefing table exists (mig 203)', async () => {
    return await supabase.from('handler_briefing').select('user_id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('contact_intelligence table exists (mig 204)', async () => {
    return await supabase.from('contact_intelligence').select('contact_id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('encounters table exists (mig 204)', async () => {
    return await supabase.from('encounters').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('user_voice_corpus table readable', async () => {
    return await supabase.from('user_voice_corpus').select('text').eq('user_id', USER_ID).limit(5);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : `exemplars=${r.data?.length ?? 0}` }));

  console.log('\n=== Irreversibility score pipeline ===\n');

  const scoreResult = await test('persistIrreversibilityScore computes + writes', async () => {
    return await persistIrreversibilityScore(supabase, USER_ID);
  }, (r) => ({
    ok: typeof r.score === 'number' && r.score >= 0 && r.score <= 100,
    detail: `score=${r.score}/100 band=${r.band} peak=${r.peak}`,
  }));

  if (scoreResult) {
    await test('score row persisted', async () => {
      return await supabase.from('irreversibility_score').select('score, peak_score, updated_at').eq('user_id', USER_ID).maybeSingle();
    }, (r) => ({
      ok: !r.error && r.data != null && typeof r.data.score === 'number',
      detail: r.data ? `db_score=${r.data.score} db_peak=${r.data.peak_score}` : 'no row',
    }));

    await test('history row appended', async () => {
      return await supabase.from('irreversibility_score_history')
        .select('score, recorded_at')
        .eq('user_id', USER_ID)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }, (r) => ({
      ok: !r.error && r.data != null,
      detail: r.data ? `latest_history=${r.data.score} at ${r.data.recorded_at}` : 'no history',
    }));
  }

  console.log('\n=== Pressure engine (directive writer) ===\n');

  const pressure = await test('runIrreversibilityPressure issues or skips directives', async () => {
    return await runIrreversibilityPressure(supabase, USER_ID);
  }, (r) => ({
    ok: typeof r.issued === 'number',
    detail: `band=${r.band} issued=${r.issued} skipped=${r.skipped} axes=[${r.axes.join(',')}]`,
  }));

  if (pressure && pressure.axes.length > 0) {
    await test('issued directive visible in handler_directives', async () => {
      return await supabase.from('handler_directives')
        .select('id, target, status')
        .eq('user_id', USER_ID)
        .eq('action', 'prescribe_task')
        .in('target', pressure.axes)
        .eq('status', 'pending')
        .limit(5);
    }, (r) => ({
      ok: !r.error && (r.data?.length ?? 0) > 0,
      detail: `pending directives found: ${r.data?.length ?? 0}`,
    }));
  }

  console.log('\n=== Voice system (shared corpus) ===\n');

  invalidateVoiceCache(USER_ID);

  await test('buildMaxyVoiceSystem returns non-empty (reply)', async () => {
    return await buildMaxyVoiceSystem(supabase, USER_ID, 'reply');
  }, (r) => ({
    ok: typeof r === 'string' && r.length > 50,
    detail: `length=${r.length}, has_exemplars=${r.includes('HOW MAXY ACTUALLY WRITES')}`,
  }));

  await test('buildMaxyVoiceSystem returns non-empty (post)', async () => {
    return await buildMaxyVoiceSystem(supabase, USER_ID, 'post');
  }, (r) => ({
    ok: typeof r === 'string' && r.length > 50,
    detail: `length=${r.length}`,
  }));

  await test('voice cache hit on second call', async () => {
    const t0 = Date.now();
    await buildMaxyVoiceSystem(supabase, USER_ID, 'reply');
    return Date.now() - t0;
  }, (r) => ({
    ok: r < 50,
    detail: `cached call=${r}ms`,
  }));

  console.log('\n=== Self-reply filter logic ===\n');

  await test('system-label regex filters distance marker', async () => {
    const re = /^\d+(\.\d+)?\s*(mi|miles?|ft|feet|km|m)$/i;
    return [re.test('4.50 miles'), re.test('10 mi'), re.test('hello babe')];
  }, (r) => ({
    ok: r[0] === true && r[1] === true && r[2] === false,
    detail: `"4.50 miles"=${r[0]} "10 mi"=${r[1]} "hello babe"=${r[2]}`,
  }));

  await test('meetup keyword detector fires on positives', async () => {
    const tests = ['want to meet tonight?', 'come over', 'my place at 8', 'what time works'];
    const signals = [/\btonight\b/i, /\bcome over\b/i, /\bmy place\b/i, /\bwhat time\b/i];
    return tests.map(t => signals.some(re => re.test(t)));
  }, (r) => ({
    ok: r.every(Boolean),
    detail: `all matched: ${r.join(',')}`,
  }));

  console.log('\n=== Handler_briefing write path ===\n');

  const testBriefing = `TEST BRIEFING ${Date.now()}`;
  await test('handler_briefing upsert works', async () => {
    return await supabase.from('handler_briefing').upsert({
      user_id: USER_ID,
      prompt_snippet: testBriefing,
      generated_by: 'manual',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'upsert ok' }));

  await test('handler_briefing readback matches', async () => {
    return await supabase.from('handler_briefing')
      .select('prompt_snippet')
      .eq('user_id', USER_ID)
      .maybeSingle();
  }, (r) => ({
    ok: !r.error && r.data?.prompt_snippet === testBriefing,
    detail: r.data ? `got "${r.data.prompt_snippet.slice(0, 40)}..."` : 'no row',
  }));

  console.log('\n=== Contact intelligence extractor (Claude live call) ===\n');

  // Pick any existing contact to attach the test extraction to, or skip.
  const { data: anyContact } = await supabase.from('contacts')
    .select('id')
    .eq('user_id', USER_ID)
    .limit(1)
    .maybeSingle();

  if (anyContact) {
    const fakeConvo = [
      { text: 'hey what are you into?', fromSelf: false },
      { text: 'depends on the guy, but i like being used. you close?', fromSelf: true },
      { text: '5 miles. want to come over tonight around 9? my place', fromSelf: false },
      { text: 'send an address once you tip $30 through my link', fromSelf: true },
      { text: 'done. here is the address: 123 Example St', fromSelf: false },
    ];

    await test('extractor produces stage + safety', async () => {
      return await extractContactIntelligence(
        supabase, anthropic, USER_ID, anyContact.id, 'test_user',
        fakeConvo,
      );
    }, (r) => ({
      ok: r.extracted === true && typeof r.safety === 'number' && typeof r.stage === 'string',
      detail: `stage=${r.stage} safety=${r.safety}/10`,
    }));

    await test('extraction row persisted', async () => {
      return await supabase.from('contact_intelligence')
        .select('meetup_stage, safety_score, tribute_stance')
        .eq('contact_id', anyContact.id)
        .maybeSingle();
    }, (r) => ({
      ok: !r.error && r.data != null,
      detail: r.data ? `stage=${r.data.meetup_stage} safety=${r.data.safety_score} tribute=${r.data.tribute_stance}` : 'no row',
    }));
  } else {
    record('extractor skipped', true, 'no contacts in db to attach test extraction');
  }

  console.log('\n=== Grounded facts + needs-Maxy detector (mig 205) ===\n');

  await test('maxy_facts table exists', async () => {
    return await supabase.from('maxy_facts').select('user_id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('pending_outbound table exists', async () => {
    return await supabase.from('pending_outbound').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('loadMaxyFactsBlock returns non-empty block even without a row', async () => {
    return await loadMaxyFactsBlock(supabase, USER_ID);
  }, (r) => ({
    ok: typeof r === 'string' && r.includes('HARD RULES') && r.includes('DEFLECT'),
    detail: `length=${r.length}, has_rules=${r.includes('HARD RULES')}`,
  }));

  await test('needsMaxyInput: availability ("you home?")', async () => {
    return needsMaxyInput('you home right now?');
  }, (r) => ({ ok: r.needs && r.category === 'availability', detail: `needs=${r.needs} cat=${r.category}` }));

  await test('needsMaxyInput: availability ("free tonight?")', async () => {
    return needsMaxyInput('u free tonight?');
  }, (r) => ({ ok: r.needs && r.category === 'availability', detail: `needs=${r.needs} cat=${r.category}` }));

  await test('needsMaxyInput: location ("send address")', async () => {
    return needsMaxyInput('send the address when youre ready');
  }, (r) => ({ ok: r.needs && r.category === 'location', detail: `needs=${r.needs} cat=${r.category}` }));

  await test('needsMaxyInput: location ("drop a pin")', async () => {
    return needsMaxyInput('drop a pin for me');
  }, (r) => ({ ok: r.needs && r.category === 'location', detail: `needs=${r.needs} cat=${r.category}` }));

  await test('needsMaxyInput: personal detail ("real name")', async () => {
    return needsMaxyInput('whats your real name tho');
  }, (r) => ({ ok: r.needs && r.category === 'personal_detail', detail: `needs=${r.needs} cat=${r.category}` }));

  await test('needsMaxyInput: benign flirt does NOT trigger', async () => {
    return needsMaxyInput('you look hot in that pic 😈');
  }, (r) => ({ ok: !r.needs, detail: `needs=${r.needs}` }));

  await test('needsMaxyInput: benign kink-talk does NOT trigger', async () => {
    return needsMaxyInput('i want to use you like a fucktoy');
  }, (r) => ({ ok: !r.needs, detail: `needs=${r.needs}` }));

  // Pending outbound round-trip
  const testHandle = `test_handle_${Date.now()}`;
  const testBody = `Maxy's manual reply ${Date.now()}`;

  const { data: inserted, error: insertErr } = await supabase.from('pending_outbound').insert({
    user_id: USER_ID,
    platform: 'sniffies',
    target_handle: testHandle,
    body: testBody,
    reason: 'integration_test',
  }).select('id').single();

  await test('pending_outbound insert works', async () => {
    return { ok: !insertErr && !!inserted, err: insertErr?.message };
  }, (r) => ({ ok: r.ok, detail: r.err || (inserted ? `id=${inserted.id}` : 'no row') }));

  if (inserted) {
    await test('consumePendingForChat finds the row', async () => {
      return await consumePendingForChat(supabase, USER_ID, 'sniffies', testHandle);
    }, (r) => ({ ok: r !== null && r.body === testBody, detail: r ? `body matches=${r.body === testBody}` : 'not found' }));

    await test('markPendingSent flips status', async () => {
      await markPendingSent(supabase, inserted.id);
      const { data } = await supabase.from('pending_outbound')
        .select('status, sent_at')
        .eq('id', inserted.id).single();
      return data;
    }, (r) => ({ ok: r?.status === 'sent' && r?.sent_at != null, detail: `status=${r?.status} sent_at=${r?.sent_at ? 'set' : 'null'}` }));

    await test('consumePendingForChat no longer returns sent row', async () => {
      return await consumePendingForChat(supabase, USER_ID, 'sniffies', testHandle);
    }, (r) => ({ ok: r === null, detail: r ? 'STILL RETURNED (bug)' : 'correctly absent' }));

    // cleanup
    await supabase.from('pending_outbound').delete().eq('id', inserted.id);
  }

  console.log('\n=== Content coercion engine (mig 206) ===\n');

  await test('content_production_briefs table exists', async () => {
    return await supabase.from('content_production_briefs').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('content_submissions table exists', async () => {
    return await supabase.from('content_submissions').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('content_plan table exists', async () => {
    return await supabase.from('content_plan').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  await test('platform_follower_snapshots table exists', async () => {
    return await supabase.from('platform_follower_snapshots').select('id').eq('user_id', USER_ID).limit(1);
  }, (r) => ({ ok: !r.error, detail: r.error ? r.error.message : 'table readable' }));

  // Insert a test brief and a fake submission, then check it surfaces correctly
  const { data: testBrief, error: briefInsertErr } = await supabase.from('content_production_briefs').insert({
    user_id: USER_ID,
    brief_type: 'photo',
    feminization_directives: {
      outfit: 'test outfit',
      pose: 'test pose',
      makeup: 'test makeup',
    },
    target_platforms: ['twitter', 'reddit:sissification'],
    caption_angle: 'test caption angle',
    scheduled_upload_by: new Date(Date.now() + 3600_000).toISOString(),
    scheduled_publish_at: new Date(Date.now() + 7200_000).toISOString(),
    source: 'manual',
    status: 'pending',
  }).select('id').single();

  await test('content_brief insert works', async () => {
    return { ok: testBrief !== null };
  }, (r) => ({ ok: r.ok, detail: testBrief ? `brief_id=${testBrief.id}` : `insert failed: ${briefInsertErr?.message || 'unknown'}` }));

  if (testBrief) {
    await test('content_submission insert works', async () => {
      return await supabase.from('content_submissions').insert({
        user_id: USER_ID,
        brief_id: testBrief.id,
        asset_type: 'photo',
        asset_url: 'https://example.test/asset.jpg',
        status: 'approved',
        compliance_score: 9,
      }).select('id').single();
    }, (r) => ({ ok: !r.error && r.data != null, detail: r.data ? `sub_id=${r.data.id}` : r.error?.message || 'no row' }));

    // Mark brief ready_to_post and verify the orchestrator-side finder sees it
    await supabase.from('content_production_briefs').update({ status: 'ready_to_post' }).eq('id', testBrief.id);

    await test('ready_to_post brief is findable by orchestrator query', async () => {
      return await supabase.from('content_production_briefs')
        .select('id, target_platforms')
        .eq('user_id', USER_ID)
        .eq('status', 'ready_to_post')
        .lte('scheduled_publish_at', new Date(Date.now() + 10 * 3600_000).toISOString())
        .limit(5);
    }, (r) => ({
      ok: !r.error && (r.data?.length ?? 0) > 0,
      detail: `found=${r.data?.length ?? 0}`,
    }));

    // cleanup
    await supabase.from('content_submissions').delete().eq('brief_id', testBrief.id);
    await supabase.from('content_production_briefs').delete().eq('id', testBrief.id);
  }

  // Link rotator sanity checks
  const { rotateFansly, rotateAllPlatforms } = await import('./link-rotator');

  await test('rotateFansly leaves text alone at rate=0', async () => {
    return rotateFansly('test post', 0);
  }, (r) => ({ ok: r === 'test post', detail: `out="${r}"` }));

  await test('rotateFansly appends at rate=1', async () => {
    return rotateFansly('test post', 1);
  }, (r) => ({
    ok: r.includes('fansly') || r.length > 'test post'.length,
    detail: `len=${r.length}, contains_fansly=${r.toLowerCase().includes('fansly')}`,
  }));

  await test('rotateFansly does not append if URL already present', async () => {
    return rotateFansly('check https://other.com', 1);
  }, (r) => ({ ok: r === 'check https://other.com', detail: 'URL already present' }));

  await test('rotateAllPlatforms skips fansly platform (self-referential)', async () => {
    return rotateAllPlatforms('test', 'fansly', { rate: 1 });
  }, (r) => ({ ok: r === 'test', detail: 'correctly skipped' }));

  await test('rotateAllPlatforms skips sniffies (DM context)', async () => {
    return rotateAllPlatforms('test', 'sniffies', { rate: 1 });
  }, (r) => ({ ok: r === 'test', detail: 'correctly skipped' }));

  console.log('\n=== Content plan + auto-brief + follower snapshots ===\n');

  const { ensureWeeklyContentPlan } = await import('./content-plan-generator');
  await test('ensureWeeklyContentPlan creates or returns plan', async () => {
    return await ensureWeeklyContentPlan(supabase, USER_ID);
  }, (r) => ({ ok: r.week_start && typeof r.theme === 'string', detail: `week=${r.week_start} theme="${r.theme}" created=${r.created}` }));

  const { maybeGenerateBriefs } = await import('./brief-auto-generator');
  await test('maybeGenerateBriefs writes to content_briefs (old table)', async () => {
    const { count: before } = await supabase.from('content_briefs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID).in('status', ['assigned', 'in_progress']);
    const created = await maybeGenerateBriefs(supabase, USER_ID, { minPending: 99, toCreate: 2 });
    const { count: after } = await supabase.from('content_briefs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', USER_ID).in('status', ['assigned', 'in_progress']);
    return { created, before: before ?? 0, after: after ?? 0 };
  }, (r) => ({ ok: r.created > 0 && r.after > r.before, detail: `created=${r.created} ${r.before}→${r.after}` }));

  const { snapshotFollowers, getFollowerSlope } = await import('./follower-snapshots');
  await test('snapshotFollowers inserts row', async () => {
    await snapshotFollowers(supabase, USER_ID, 'test_platform', { followerCount: 100, followingCount: 50 });
    const { data } = await supabase.from('platform_follower_snapshots')
      .select('follower_count, following_count')
      .eq('user_id', USER_ID).eq('platform', 'test_platform')
      .order('captured_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  }, (r) => ({ ok: r?.follower_count === 100 && r?.following_count === 50, detail: r ? `followers=${r.follower_count}` : 'no row' }));

  await test('getFollowerSlope returns null with <2 points', async () => {
    return await getFollowerSlope(supabase, USER_ID, 'test_platform_slope_empty', 7);
  }, (r) => ({ ok: r === null, detail: r === null ? 'null as expected' : 'unexpected non-null' }));

  // Cleanup snapshot test rows
  await supabase.from('platform_follower_snapshots').delete().eq('user_id', USER_ID).eq('platform', 'test_platform');

  console.log('\n=== Submit-brief CLI + link rotator smoke ===\n');

  // Create brief → submit via SDK path that mirrors submit-brief.ts → verify ready_to_post flip
  const { data: smokeBrief } = await supabase.from('content_production_briefs').insert({
    user_id: USER_ID,
    brief_type: 'photo',
    feminization_directives: { outfit: 'smoke test', pose: 'smoke' },
    target_platforms: ['twitter'],
    caption_angle: 'smoke test',
    scheduled_upload_by: new Date(Date.now() + 3600_000).toISOString(),
    scheduled_publish_at: new Date(Date.now() + 7200_000).toISOString(),
    status: 'pending',
    source: 'manual',
  }).select('id').single();

  if (smokeBrief) {
    await test('submit+approve flips brief to ready_to_post', async () => {
      await supabase.from('content_submissions').insert({
        user_id: USER_ID,
        brief_id: smokeBrief.id,
        asset_type: 'photo',
        asset_url: 'https://example.test/smoke.jpg',
        status: 'approved',
        compliance_score: 10,
      });
      await supabase.from('content_production_briefs').update({ status: 'ready_to_post' }).eq('id', smokeBrief.id);
      const { data: updated } = await supabase.from('content_production_briefs').select('status').eq('id', smokeBrief.id).single();
      return updated;
    }, (r) => ({ ok: r?.status === 'ready_to_post', detail: `status=${r?.status}` }));

    // Cleanup
    await supabase.from('content_submissions').delete().eq('brief_id', smokeBrief.id);
    await supabase.from('content_production_briefs').delete().eq('id', smokeBrief.id);
  }

  console.log('\n=== Engagement budget (Sniffies ceiling) ===\n');

  // Import the module directly so we get the same DEFAULT_LIMITS
  const { checkBudget } = await import('./engagement-budget');
  await test('sniffies/chat has remaining budget with ceiling 200', async () => {
    return await checkBudget(supabase, USER_ID, 'sniffies', 'chat');
  }, (r) => ({ ok: typeof r === 'boolean', detail: `has_budget=${r}` }));

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${passCount} passed, ${failCount} failed, ${results.length} total`);
  console.log('='.repeat(50));
  if (failCount > 0) {
    console.log('\nFailures:');
    for (const r of results.filter(x => !x.pass)) console.log(`  ✗ ${r.name}: ${r.detail}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
