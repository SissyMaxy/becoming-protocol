// Inbox Folder Watcher
//
// Drop a photo/video into scripts/auto-poster/inbox/ and it auto-matches to
// the oldest pending photo brief, creates a submission (auto-approved), flips
// the brief to ready_to_post, and moves the file to inbox/processed/.
//
// No CLI, no URLs, no commands. Just drag and drop.
//
// Supported: .jpg, .jpeg, .png, .gif, .webp, .mp4, .mov, .webm
// Files are moved (not copied) to inbox/processed/ after submission so the
// same file doesn't re-trigger.

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

const INBOX_DIR = path.join(__dirname, 'inbox');
const PROCESSED_DIR = path.join(INBOX_DIR, 'processed');
const SUPPORTED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm']);

function ensureDirs(): void {
  if (!fs.existsSync(INBOX_DIR)) fs.mkdirSync(INBOX_DIR, { recursive: true });
  if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function isImageOrVideo(ext: string): 'photo' | 'video' {
  return ['.mp4', '.mov', '.webm'].includes(ext) ? 'video' : 'photo';
}

async function findOldestPendingPhotoBrief(
  sb: SupabaseClient,
  userId: string,
): Promise<{ id: string; brief_type: string } | null> {
  const { data } = await sb
    .from('content_production_briefs')
    .select('id, brief_type')
    .eq('user_id', userId)
    .in('status', ['pending', 'awaiting_upload'])
    .in('brief_type', ['photo', 'photo_set', 'video'])
    .order('scheduled_upload_by', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Scan inbox/ for new files. For each: match to oldest pending photo brief,
 * create submission, flip brief status, move file to processed/.
 *
 * Returns number of files processed.
 */
export async function processInbox(
  sb: SupabaseClient,
  userId: string,
): Promise<number> {
  ensureDirs();

  let files: string[];
  try {
    files = fs.readdirSync(INBOX_DIR)
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return SUPPORTED_EXTS.has(ext) && !fs.statSync(path.join(INBOX_DIR, f)).isDirectory();
      })
      .sort((a, b) => {
        // Oldest first by mtime
        const aStat = fs.statSync(path.join(INBOX_DIR, a));
        const bStat = fs.statSync(path.join(INBOX_DIR, b));
        return aStat.mtimeMs - bStat.mtimeMs;
      });
  } catch {
    return 0;
  }

  if (files.length === 0) return 0;

  let processed = 0;
  for (const file of files) {
    const brief = await findOldestPendingPhotoBrief(sb, userId);
    if (!brief) {
      console.log(`[inbox] No pending photo briefs left — ${files.length - processed} file(s) waiting`);
      break;
    }

    const filePath = path.join(INBOX_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const assetType = isImageOrVideo(ext);

    // Use local file path as asset_url. Platform engines that need a URL
    // will need an upload step — for now the path serves as the reference.
    // This is consistent with how the existing poster handles local media.
    const assetUrl = filePath;

    const { error } = await sb.from('content_submissions').insert({
      user_id: userId,
      brief_id: brief.id,
      asset_type: assetType,
      asset_url: assetUrl,
      status: 'approved',
      compliance_score: 10,
      handler_notes: `auto-submitted from inbox: ${file}`,
    });

    if (error) {
      console.error(`[inbox] Submission failed for ${file}:`, error.message);
      continue;
    }

    await sb.from('content_production_briefs')
      .update({ status: 'ready_to_post' })
      .eq('id', brief.id);

    // Move to processed/
    const destPath = path.join(PROCESSED_DIR, `${Date.now()}_${file}`);
    try {
      fs.renameSync(filePath, destPath);
    } catch {
      // If rename fails (cross-device), copy+delete
      try {
        fs.copyFileSync(filePath, destPath);
        fs.unlinkSync(filePath);
      } catch {}
    }

    console.log(`[inbox] ✓ ${file} → brief ${brief.id.slice(0, 8)} [${brief.brief_type}] → ready_to_post`);
    processed++;
  }

  return processed;
}
