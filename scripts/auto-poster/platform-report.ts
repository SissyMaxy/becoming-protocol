/**
 * Platform Report — the honest picture.
 *
 * Prints cross-platform activity, success/failure rates, revenue state, and
 * where inbound humans are actually reaching out. Every number here maps
 * directly to a SQL query you can verify in Supabase Studio.
 *
 * Run: npm run report
 */

import 'dotenv/config';
import { supabase } from './config';

async function section(label: string) {
  console.log(`\n═══ ${label} ═══`);
}

interface Row { [k: string]: unknown }
function table(rows: Row[]) {
  if (rows.length === 0) { console.log('  (no data)'); return; }
  const keys = Object.keys(rows[0]);
  const widths: Record<string, number> = {};
  for (const k of keys) {
    widths[k] = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
  }
  console.log('  ' + keys.map(k => k.padEnd(widths[k])).join('  '));
  console.log('  ' + keys.map(k => '─'.repeat(widths[k])).join('  '));
  for (const r of rows) {
    console.log('  ' + keys.map(k => String(r[k] ?? '').padEnd(widths[k])).join('  '));
  }
}

async function run() {
  console.log('='.repeat(70));
  console.log('AUTO-POSTER STATUS — ' + new Date().toISOString());
  console.log('='.repeat(70));

  // ── 1. ai_generated_content by platform and status ────────────────
  await section('1. CONTENT POSTED vs FAILED — last 7 days');
  console.log('  SQL: SELECT platform, content_type, status, count(*) FROM ai_generated_content');
  console.log('       WHERE created_at > NOW() - INTERVAL \'7 days\' GROUP BY 1,2,3');
  const { data: agc } = await supabase
    .from('ai_generated_content')
    .select('platform, content_type, status, created_at')
    .gte('created_at', new Date(Date.now() - 7 * 86400_000).toISOString())
    .limit(5000);
  const agcAgg: Record<string, { total: number }> = {};
  for (const r of agc || []) {
    const k = `${r.platform} / ${r.content_type} / ${r.status}`;
    agcAgg[k] = agcAgg[k] || { total: 0 };
    agcAgg[k].total++;
  }
  table(Object.entries(agcAgg).map(([k, v]) => ({ 'platform / content_type / status': k, count: v.total }))
    .sort((a, b) => (b.count as number) - (a.count as number)));

  // ── 2. DM activity per platform ─────────────────────────────────────
  await section('2. DM CONVERSATIONS — paid_conversations by platform');
  console.log('  SQL: SELECT platform, message_direction, count(*), max(created_at) FROM paid_conversations GROUP BY 1,2');
  const { data: dms } = await supabase
    .from('paid_conversations')
    .select('platform, message_direction, subscriber_id, created_at');
  const dmAgg: Record<string, { inbound: number; outbound: number; contacts: Set<string>; latest: string }> = {};
  for (const r of dms || []) {
    const p = r.platform || 'unknown';
    dmAgg[p] = dmAgg[p] || { inbound: 0, outbound: 0, contacts: new Set(), latest: '' };
    if (r.message_direction === 'inbound') dmAgg[p].inbound++;
    else if (r.message_direction === 'outbound') dmAgg[p].outbound++;
    if (r.subscriber_id) dmAgg[p].contacts.add(r.subscriber_id);
    if (r.created_at > dmAgg[p].latest) dmAgg[p].latest = r.created_at;
  }
  table(Object.entries(dmAgg).map(([p, v]) => ({
    platform: p,
    inbound: v.inbound,
    outbound: v.outbound,
    unique_contacts: v.contacts.size,
    latest: v.latest.slice(0, 16),
  })).sort((a, b) => (b.inbound as number) - (a.inbound as number)));

  // ── 3. Contact events per platform (actual interactions) ────────────
  await section('3. CONTACT EVENTS — who engaged, from contact_events');
  console.log('  SQL: SELECT platform, count(*), count(*) FILTER (WHERE occurred_at > NOW() - INTERVAL \'7 days\')');
  console.log('       FROM contact_events GROUP BY 1');
  const { data: ce } = await supabase
    .from('contact_events')
    .select('platform, occurred_at');
  const ceAgg: Record<string, { total: number; last7d: number; last24h: number; latest: string }> = {};
  const now = Date.now();
  for (const r of ce || []) {
    const p = r.platform || 'unknown';
    ceAgg[p] = ceAgg[p] || { total: 0, last7d: 0, last24h: 0, latest: '' };
    ceAgg[p].total++;
    const ageMs = now - new Date(r.occurred_at).getTime();
    if (ageMs < 7 * 86400_000) ceAgg[p].last7d++;
    if (ageMs < 86400_000) ceAgg[p].last24h++;
    if (r.occurred_at > ceAgg[p].latest) ceAgg[p].latest = r.occurred_at;
  }
  table(Object.entries(ceAgg).map(([p, v]) => ({
    platform: p,
    total_events: v.total,
    last_7d: v.last7d,
    last_24h: v.last24h,
    latest: v.latest.slice(0, 16),
  })).sort((a, b) => (b.last_7d as number) - (a.last_7d as number)));

  // ── 4. Revenue tables — should all be zero until pipeline wired ─────
  await section('4. REVENUE TABLES — row counts');
  console.log('  SQL: SELECT count(*) FROM <table>  (run for each)');
  const revTables = ['cam_tips', 'cam_revenue', 'maxy_revenue', 'revenue_events', 'revenue_log', 'revenue_tracking'];
  const revRows: Row[] = [];
  for (const t of revTables) {
    const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
    revRows.push({ table: t, rows: error ? `ERR: ${error.message.slice(0, 30)}` : (count ?? 0) });
  }
  table(revRows);

  // ── 5. Engagement backfill status ───────────────────────────────────
  await section('5. ENGAGEMENT BACKFILL — likes/comments captured on posts');
  console.log('  SQL: SELECT count(*), count(*) FILTER (WHERE engagement_likes > 0) FROM ai_generated_content');
  console.log('       WHERE status=\'posted\'');
  const { count: totalPosted } = await supabase
    .from('ai_generated_content')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted');
  const { count: withLikes } = await supabase
    .from('ai_generated_content')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
    .gt('engagement_likes', 0);
  const { count: withComments } = await supabase
    .from('ai_generated_content')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'posted')
    .gt('engagement_comments', 0);
  table([{
    total_posted_ever: totalPosted ?? 0,
    with_likes_tracked: withLikes ?? 0,
    with_comments_tracked: withComments ?? 0,
    backfill_rate: totalPosted ? `${Math.round(((withLikes || 0) / totalPosted) * 100)}%` : 'n/a',
  }]);

  // ── 6. Contact tier + LTV ───────────────────────────────────────────
  await section('6. CONTACT TIER + LIFETIME VALUE');
  console.log('  SQL: SELECT tier, count(*), sum(lifetime_value_cents) FROM contacts GROUP BY 1');
  const { data: contacts } = await supabase
    .from('contacts')
    .select('tier, lifetime_value_cents');
  const cAgg: Record<string, { count: number; ltv: number }> = {};
  for (const r of contacts || []) {
    const t = r.tier || 'unset';
    cAgg[t] = cAgg[t] || { count: 0, ltv: 0 };
    cAgg[t].count++;
    cAgg[t].ltv += r.lifetime_value_cents || 0;
  }
  table(Object.entries(cAgg).map(([t, v]) => ({
    tier: t,
    count: v.count,
    total_ltv_cents: v.ltv,
    total_ltv_usd: `$${(v.ltv / 100).toFixed(2)}`,
  })).sort((a, b) => (b.count as number) - (a.count as number)));

  // ── 7. Handler attention queue (if anything was queued) ─────────────
  await section('7. HANDLER ATTENTION QUEUE — unreviewed items');
  console.log('  SQL: SELECT kind, severity, count(*) FROM handler_attention WHERE reviewed_at IS NULL GROUP BY 1,2');
  const { data: att } = await supabase
    .from('handler_attention')
    .select('kind, severity')
    .is('reviewed_at', null);
  const attAgg: Record<string, number> = {};
  for (const r of att || []) {
    const k = `${r.kind} / ${r.severity}`;
    attAgg[k] = (attAgg[k] || 0) + 1;
  }
  if (Object.keys(attAgg).length === 0) {
    console.log('  (queue is empty)');
  } else {
    table(Object.entries(attAgg).map(([k, v]) => ({ kind_severity: k, count: v })));
  }

  console.log('\n' + '='.repeat(70));
  console.log('Run against Supabase Studio directly:');
  console.log('  https://supabase.com/dashboard/project/atevwvexapiykchvqvhm/sql');
  console.log('='.repeat(70));
}

run().catch(err => {
  console.error('[report] failed:', err);
  process.exit(1);
});
