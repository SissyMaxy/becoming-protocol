/**
 * Decree CLI — review + manage Handler-issued decrees.
 *
 *   npm run decree              # list open decrees
 *   npm run decree all          # all decrees (any status)
 *   npm run decree show <id>    # show one decree's full body
 *   npm run decree generate     # force-generate a new decree
 *   npm run decree miss-sweep   # mark overdue as missed (dry runs nightly anyway)
 *   npm run decree fulfill <id> # mark fulfilled (admin override)
 *   npm run decree compliance   # show compliance band + counters
 */

import 'dotenv/config';
import { supabase } from './config';
import { generateDecree, sweepOverdue, fulfillDecree, runDecreeCycle } from './handler-decree';

const USER_ID = process.env.USER_ID || '';

async function cmdList(includeAll = false) {
  let q = supabase.from('handler_decrees')
    .select('id, edict, proof_type, deadline, status, consequence, payload, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!includeAll) q = q.eq('status', 'open');
  const { data } = await q;
  if (!data || data.length === 0) { console.log('(no decrees)'); return; }
  for (const d of data) {
    const due = new Date(d.deadline);
    const ageMs = Date.now() - new Date(d.created_at).getTime();
    const ageH = Math.floor(ageMs / 3600_000);
    const dueH = Math.floor((due.getTime() - Date.now()) / 3600_000);
    const flag = d.status === 'open' && dueH < 0 ? ' OVERDUE' : '';
    console.log(`${d.id.slice(0, 8)}  [${d.status}${flag}]  ${(d.payload as any)?.decree_type || '?'}  due in ${dueH}h  age ${ageH}h`);
    console.log(`           ${(d.edict || '').slice(0, 200)}`);
  }
}

async function cmdShow(idPrefix: string) {
  const { data } = await supabase.from('handler_decrees')
    .select('*').eq('user_id', USER_ID).ilike('id', `${idPrefix}%`).maybeSingle();
  if (!data) { console.log('(not found)'); return; }
  console.log(JSON.stringify(data, null, 2));
}

async function cmdCompliance() {
  const { data } = await supabase.from('handler_compliance').select('*').eq('user_id', USER_ID).maybeSingle();
  if (!data) { console.log('(no compliance row yet — first decree will create one)'); return; }
  console.log(`Compliance band: ${data.compliance_band.toUpperCase()}`);
  console.log(`Total issued:    ${data.total_issued}`);
  console.log(`Completed:       ${data.total_completed} (${data.total_on_time} on-time, ${data.total_late} late)`);
  console.log(`Missed:          ${data.total_missed}`);
  console.log(`Current streak:  ${data.current_streak_days}d  (longest ${data.longest_streak_days}d)`);
  console.log(`Last completion: ${data.last_completion_at || '-'}`);
  console.log(`Last miss:       ${data.last_miss_at || '-'}`);
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const [cmd, arg1] = process.argv.slice(2);
  switch (cmd) {
    case undefined: case 'list': await cmdList(false); break;
    case 'all': await cmdList(true); break;
    case 'show':
      if (!arg1) { console.error('Usage: decree show <id>'); process.exit(1); }
      await cmdShow(arg1); break;
    case 'generate':
      const id = await generateDecree({ force: true });
      console.log(id ? `Issued ${id}` : 'Generation failed'); break;
    case 'miss-sweep':
      const r = await sweepOverdue();
      console.log(`Missed ${r.missed}`); break;
    case 'fulfill':
      if (!arg1) { console.error('Usage: decree fulfill <id>'); process.exit(1); }
      const ok = await fulfillDecree(arg1, { source: 'cli_admin' });
      console.log(ok ? 'Fulfilled' : 'Failed'); break;
    case 'cycle':
      const c = await runDecreeCycle();
      console.log(JSON.stringify(c)); break;
    case 'compliance': await cmdCompliance(); break;
    default:
      console.log('Commands: list | all | show <id> | generate | miss-sweep | fulfill <id> | cycle | compliance');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
