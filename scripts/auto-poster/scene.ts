/**
 * Scene CLI — manage active scenes on contacts.
 *
 * Commands:
 *   npm run scene list                       # list all scene templates
 *   npm run scene active                     # list all contacts with active scenes
 *   npm run scene start <contact_id> <name>  # start a scene on a contact
 *   npm run scene advance <contact_id>       # move to next beat
 *   npm run scene end <contact_id>           # clear scene from contact
 *   npm run scene show <contact_id>          # show current beat for contact
 */

import 'dotenv/config';
import { supabase } from './config';
import { getActiveScene, advanceScene, startScene, endScene } from './scenes';

const USER_ID = process.env.USER_ID || '';

async function cmdList() {
  const { data } = await supabase
    .from('scene_templates')
    .select('name, flavor, description, beats')
    .order('name');
  if (!data || data.length === 0) { console.log('(no templates)'); return; }
  for (const t of data) {
    const beatCount = Array.isArray(t.beats) ? t.beats.length : 0;
    console.log(`  ${t.name} — ${t.flavor} (${beatCount} beats)`);
    if (t.description) console.log(`    ${t.description}`);
  }
}

async function cmdActive() {
  const { data } = await supabase
    .from('contacts')
    .select('id, display_name, tier, active_scene_template_id, scene_beat_index, scene_started_at, scene_templates(name)')
    .eq('user_id', USER_ID)
    .not('active_scene_template_id', 'is', null);
  if (!data || data.length === 0) { console.log('(no active scenes)'); return; }
  for (const c of data as Array<{ id: string; display_name?: string; tier?: string; scene_beat_index: number; scene_started_at: string; scene_templates?: { name: string } | null }>) {
    const when = c.scene_started_at ? new Date(c.scene_started_at).toLocaleString() : '-';
    console.log(`  ${c.id.slice(0, 8)} ${(c.display_name || '-').padEnd(24)} [${c.tier || 'stranger'}] · ${c.scene_templates?.name || '?'} beat ${c.scene_beat_index} · started ${when}`);
  }
}

async function cmdStart(contactId: string, templateName: string) {
  const ok = await startScene(supabase, contactId, templateName);
  if (!ok) { console.error('Start failed — check template name'); return; }
  const scene = await getActiveScene(supabase, contactId);
  console.log(`Started "${templateName}" on ${contactId.slice(0, 8)}`);
  if (scene?.currentBeat) {
    console.log(`Beat 1/${scene.totalBeats} (${scene.currentBeat.label}): ${scene.currentBeat.guidance}`);
  }
}

async function cmdAdvance(contactId: string) {
  const next = await advanceScene(supabase, contactId);
  if (!next) {
    console.log(`Scene ended on ${contactId.slice(0, 8)} (past last beat)`);
    return;
  }
  const scene = await getActiveScene(supabase, contactId);
  console.log(`Advanced ${contactId.slice(0, 8)} to beat ${(scene?.beatIndex ?? 0) + 1}/${scene?.totalBeats ?? '?'}`);
  console.log(`(${next.label}): ${next.guidance}`);
}

async function cmdEnd(contactId: string) {
  await endScene(supabase, contactId);
  console.log(`Cleared scene from ${contactId.slice(0, 8)}`);
}

async function cmdShow(contactId: string) {
  const scene = await getActiveScene(supabase, contactId);
  if (!scene) { console.log('(no active scene)'); return; }
  console.log(`Template: ${scene.templateName}`);
  console.log(`Beat ${scene.beatIndex + 1}/${scene.totalBeats}: ${scene.currentBeat?.label}`);
  console.log(`Guidance: ${scene.currentBeat?.guidance}`);
  if (scene.startedAt) console.log(`Started: ${new Date(scene.startedAt).toLocaleString()}`);
}

async function main() {
  if (!USER_ID) { console.error('Missing USER_ID'); process.exit(1); }
  const [cmd, arg1, arg2] = process.argv.slice(2);

  switch (cmd) {
    case 'list': await cmdList(); break;
    case 'active': await cmdActive(); break;
    case 'start':
      if (!arg1 || !arg2) { console.error('Usage: npm run scene start <contact_id> <template_name>'); process.exit(1); }
      await cmdStart(arg1, arg2); break;
    case 'advance':
      if (!arg1) { console.error('Usage: npm run scene advance <contact_id>'); process.exit(1); }
      await cmdAdvance(arg1); break;
    case 'end':
      if (!arg1) { console.error('Usage: npm run scene end <contact_id>'); process.exit(1); }
      await cmdEnd(arg1); break;
    case 'show':
      if (!arg1) { console.error('Usage: npm run scene show <contact_id>'); process.exit(1); }
      await cmdShow(arg1); break;
    default:
      console.log('Commands: list | active | start | advance | end | show');
      console.log('Examples:');
      console.log('  npm run scene list');
      console.log('  npm run scene active');
      console.log('  npm run scene start <contact_id> first_contact_mommy');
      console.log('  npm run scene advance <contact_id>');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
