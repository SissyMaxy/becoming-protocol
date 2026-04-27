/**
 * Scene runner — loads the active scene beat for a given contact and emits a
 * prompt fragment to inject into the reply generator. Makes the bot advance
 * a scripted arc across multiple exchanges instead of responding reactively
 * each time.
 *
 * Scenes are:
 *   - Declared in scene_templates (migration 224 + seed)
 *   - Attached to a contact via contacts.active_scene_template_id
 *   - Progressed manually (npm run scene advance <contact>) or auto (future)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface SceneBeat {
  index: number;
  label: string;
  guidance: string;
}

export interface ActiveScene {
  templateId: string;
  templateName: string;
  beatIndex: number;
  currentBeat: SceneBeat | null;
  totalBeats: number;
  startedAt: string | null;
}

/**
 * Read the active scene + current beat for a contact. Returns null if no
 * scene is active (most contacts at most times).
 */
export async function getActiveScene(
  sb: SupabaseClient,
  contactId: string,
): Promise<ActiveScene | null> {
  const { data: contact } = await sb
    .from('contacts')
    .select('active_scene_template_id, scene_beat_index, scene_started_at')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact?.active_scene_template_id) return null;

  const { data: tpl } = await sb
    .from('scene_templates')
    .select('id, name, beats')
    .eq('id', contact.active_scene_template_id)
    .maybeSingle();
  if (!tpl) return null;

  const beats = Array.isArray(tpl.beats) ? (tpl.beats as SceneBeat[]) : [];
  const beatIndex = contact.scene_beat_index ?? 0;
  const current = beats.find(b => b.index === beatIndex) || beats[beatIndex] || null;

  return {
    templateId: tpl.id,
    templateName: tpl.name,
    beatIndex,
    currentBeat: current,
    totalBeats: beats.length,
    startedAt: contact.scene_started_at ?? null,
  };
}

/**
 * Build a prompt fragment for the current scene beat. Returns empty string
 * when no scene is active, so callers can unconditionally append.
 */
export function buildScenePromptFragment(scene: ActiveScene | null): string {
  if (!scene || !scene.currentBeat) return '';
  const lines: string[] = [];
  lines.push('ACTIVE SCENE: ' + scene.templateName + ' — beat ' + (scene.beatIndex + 1) + '/' + scene.totalBeats + ' (' + scene.currentBeat.label + ').');
  lines.push('Scene directive: ' + scene.currentBeat.guidance);
  lines.push('This is not reactive chat — you are ADVANCING the scene. The reply should land this beat.');
  return lines.join('\n');
}

/**
 * Advance the contact to the next beat. Returns the new beat or null if we
 * ran past the end (scene completes and auto-detaches).
 */
export async function advanceScene(
  sb: SupabaseClient,
  contactId: string,
): Promise<SceneBeat | null> {
  const scene = await getActiveScene(sb, contactId);
  if (!scene) return null;
  const nextIndex = scene.beatIndex + 1;
  if (nextIndex >= scene.totalBeats) {
    // Scene complete — clear from contact
    await sb.from('contacts').update({
      active_scene_template_id: null,
      scene_beat_index: 0,
      scene_started_at: null,
    }).eq('id', contactId);
    return null;
  }
  await sb.from('contacts').update({ scene_beat_index: nextIndex }).eq('id', contactId);

  // Reload to get the new current beat
  const after = await getActiveScene(sb, contactId);
  return after?.currentBeat || null;
}

/**
 * Start a scene on a contact.
 */
export async function startScene(
  sb: SupabaseClient,
  contactId: string,
  templateName: string,
): Promise<boolean> {
  const { data: tpl } = await sb
    .from('scene_templates')
    .select('id')
    .eq('name', templateName)
    .maybeSingle();
  if (!tpl) return false;

  const { error } = await sb.from('contacts').update({
    active_scene_template_id: tpl.id,
    scene_beat_index: 0,
    scene_started_at: new Date().toISOString(),
  }).eq('id', contactId);
  return !error;
}

export async function endScene(sb: SupabaseClient, contactId: string): Promise<void> {
  await sb.from('contacts').update({
    active_scene_template_id: null,
    scene_beat_index: 0,
    scene_started_at: null,
  }).eq('id', contactId);
}
