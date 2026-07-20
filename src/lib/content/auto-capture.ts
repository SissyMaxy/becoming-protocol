/**
 * Auto-Capture Engine
 *
 * Checks task capture flags and triggers vault item creation.
 * Tasks with capture_flag=true prompt the user for content after completion.
 */

import { supabase } from '../supabase';
import { addToVault } from '../content-pipeline/vault';

// ── Check task capture flag ──────────────────────────────

export interface CaptureContext {
  taskId: string;
  captureType: string;
  capturePrompt: string;
  domain?: string;
}

export async function getTaskCaptureContext(taskId: string): Promise<CaptureContext | null> {
  const { data, error } = await supabase
    .from('task_bank')
    .select('id, capture_flag, capture_type, capture_prompt, domain')
    .eq('id', taskId)
    .single();

  if (error || !data || !data.capture_flag) return null;

  return {
    taskId: data.id,
    captureType: data.capture_type || 'photo',
    capturePrompt: data.capture_prompt || 'Capture content for this task',
    domain: data.domain || undefined,
  };
}

// ── Create vault item from capture ───────────────────────

export async function createCaptureVaultItem(
  userId: string,
  mediaUrl: string,
  context: CaptureContext & {
    mediaType: 'image' | 'video' | 'audio';
    fileSizeBytes?: number;
    durationSeconds?: number;
  }
): Promise<string | null> {
  // Evidence→content flywheel (Phase 5): a faceless workout / physical-practice /
  // body proof is progress-photo content. Tag it so the shoot/multiplication route
  // picks it up, and stamp it faceless (Art. II item 4). Non-audio only.
  const isEvidence = /\b(body|exercise|workout|physical|physical_practice)\b/i.test(context.domain ?? '')
    && context.mediaType !== 'audio';
  const tags = ['auto-capture', context.captureType];
  if (isEvidence) tags.push('progress_photo');
  return addToVault(userId, {
    media_url: mediaUrl,
    media_type: context.mediaType,
    source_type: 'task',
    source_task_id: context.taskId,
    capture_context: context.capturePrompt,
    auto_captured: true,
    ...(isEvidence ? { face_visible: false } : {}),
    domain: context.domain,
    tags,
    file_size_bytes: context.fileSizeBytes,
    duration_seconds: context.durationSeconds,
  });
}

// ── Upload capture to storage ────────────────────────────

export async function uploadCaptureMedia(
  userId: string,
  file: File
): Promise<string | null> {
  const date = new Date().toISOString().split('T')[0];
  const ext = file.name.split('.').pop() || 'jpg';
  const uuid = crypto.randomUUID();
  const path = `${userId}/${date}/${uuid}.${ext}`;

  const { error } = await supabase.storage
    .from('vault-media')
    .upload(path, file);

  if (error) {
    console.error('[auto-capture] upload error:', error);
    return null;
  }

  // vault-media is private (audit #15) — return the object PATH, not a public
  // URL (which 401s). The caller stores it and readers sign on render.
  return path;
}

// ── Determine media type from file ───────────────────────

export function getMediaTypeFromFile(file: File): 'image' | 'video' | 'audio' {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}
