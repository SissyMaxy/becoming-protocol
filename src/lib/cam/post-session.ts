/**
 * Cam Post-Session Pipeline
 *
 * After a cam session ends:
 * 1. Extract highlights → content vault items
 * 2. Log session revenue → revenue_log
 * 3. Generate Handler note → AI debrief
 * 4. Create summary distribution → platform posts
 *
 * David's involvement: zero. Handler handles everything.
 */

import { supabase } from '../supabase';
import { addToVault } from '../content-pipeline/vault';
import { logRevenue } from '../content-pipeline/revenue';
import { invokeWithAuth } from '../handler-ai';
import type { CamSessionSummary, SessionHighlight } from '../../types/cam';
import { mapDbToCamSession, buildCamSessionSummary } from '../../types/cam';
import { getSessionTips, getSessionTipTotal } from './tips';
import { getSessionPrompts } from './handler-control';

// ============================================
// HIGHLIGHT EXTRACTION → VAULT
// ============================================

/**
 * Extract session highlights into content vault items.
 * Each highlight becomes a vault entry ready for Handler classification.
 */
export async function extractHighlightsToVault(
  userId: string,
  sessionId: string
): Promise<number> {
  // Get session with highlights
  const { data: row } = await supabase
    .from('cam_sessions')
    .select('highlights, recording_url, live_started_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!row) return 0;

  const highlights = (row.highlights || []) as SessionHighlight[];
  if (highlights.length === 0) return 0;

  let created = 0;

  for (const highlight of highlights) {
    if (highlight.extractedToVault) continue;

    // Create vault item for each highlight
    const vaultId = await addToVault(userId, {
      media_url: row.recording_url || `cam-highlight://${sessionId}/${highlight.timestampSeconds}`,
      media_type: 'video',
      description: highlight.description,
      source_type: 'cam',
      capture_context: `cam_session:${sessionId} ts:${highlight.timestampSeconds}s dur:${highlight.durationSeconds}s type:${highlight.type}`,
    });

    if (vaultId) {
      // Update vault tier to cam_highlight
      await supabase
        .from('content_vault')
        .update({
          vault_tier: 'cam_highlight',
          source_cam_session_id: sessionId,
        })
        .eq('id', vaultId);

      created++;
    }
  }

  // Update session with extraction count
  if (created > 0) {
    await supabase
      .from('cam_sessions')
      .update({ vault_items_created: created })
      .eq('id', sessionId);
  }

  return created;
}

// ============================================
// REVENUE LOGGING
// ============================================

/**
 * Log total cam session revenue to the revenue_log table.
 */
export async function logSessionRevenue(
  userId: string,
  sessionId: string
): Promise<number> {
  const tipTotal = await getSessionTipTotal(sessionId);

  if (tipTotal.totalTokens === 0) return 0;

  // Convert tokens to cents (approximate: 1 token ≈ $0.05)
  const amountCents = tipTotal.totalUsd
    ? Math.round(tipTotal.totalUsd * 100)
    : Math.round(tipTotal.totalTokens * 5);

  await logRevenue(userId, {
    source: 'cam_tip',
    platform: 'cam_session',
    amount_cents: amountCents,
    session_id: sessionId,
    notes: `${tipTotal.tipCount} tips, ${tipTotal.totalTokens} tokens`,
  });

  return amountCents;
}

// ============================================
// HANDLER NOTE GENERATION
// ============================================

/**
 * Generate an AI Handler debrief note for the session.
 * Falls back to template if AI unavailable.
 */
export async function generateHandlerNote(
  _userId: string,
  summary: CamSessionSummary
): Promise<string> {
  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'cam_debrief',
      systemPrompt: `You are the Handler. Generate a 2-3 sentence post-cam-session debrief note. Be direct, specific, data-dense. Reference actual numbers from the session. Note what was good content, what to improve. Voice like a bossy big sister reviewing the tape.`,
      userPrompt: `Session stats:
Duration: ${summary.durationMinutes}min
Edges: ${summary.edgeCount}
Tips: ${summary.totalTokens} tokens ($${summary.totalUsd?.toFixed(2) || '0'})
Tip count: ${summary.tipCount}
Highlights: ${summary.highlightCount}
Peak viewers: ${summary.peakViewers}
Handler prompts: ${summary.handlerPromptCount} sent, ${Math.round(summary.promptAcknowledgeRate * 100)}% acknowledged
Top tipper: ${summary.topTipper?.username || 'none'} (${summary.topTipper?.totalTokens || 0} tokens)
Tip goals: ${summary.tipGoalsReached}/${summary.tipGoalsTotal} reached

Generate 2-3 sentence Handler debrief.`,
    });

    if (!error && data) {
      const result = data as { text?: string; result?: string };
      return result.text || result.result || buildTemplateNote(summary);
    }
  } catch (err) {
    console.warn('[post-session] AI note generation failed:', err);
  }

  return buildTemplateNote(summary);
}

function buildTemplateNote(summary: CamSessionSummary): string {
  const parts: string[] = [];

  if (summary.durationMinutes >= 30) {
    parts.push(`${summary.durationMinutes} minutes. Good stamina.`);
  } else {
    parts.push(`${summary.durationMinutes} minutes — short, but every session counts.`);
  }

  if (summary.edgeCount > 5) {
    parts.push(`${summary.edgeCount} edges held. Discipline showing.`);
  }

  if (summary.totalTokens > 0) {
    parts.push(`$${(summary.totalUsd || summary.totalTokens * 0.05).toFixed(0)} earned.`);
  }

  if (summary.highlightCount > 0) {
    parts.push(`${summary.highlightCount} highlight${summary.highlightCount !== 1 ? 's' : ''} marked for clip extraction.`);
  }

  if (summary.promptAcknowledgeRate < 0.7) {
    parts.push('Pay more attention to Handler prompts next time.');
  }

  return parts.join(' ');
}

// ============================================
// FULL POST-SESSION PIPELINE
// ============================================

/**
 * Run the complete post-session pipeline.
 * Called after endSession in useCamSession.
 */
export async function runPostSessionPipeline(
  userId: string,
  sessionId: string
): Promise<{
  vaultItemsCreated: number;
  revenueCents: number;
  handlerNote: string;
}> {
  // Load the session
  const { data: row } = await supabase
    .from('cam_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (!row) {
    return { vaultItemsCreated: 0, revenueCents: 0, handlerNote: 'Session not found.' };
  }

  const session = mapDbToCamSession(row);
  const tips = await getSessionTips(sessionId);
  const prompts = await getSessionPrompts(sessionId);
  const summary = buildCamSessionSummary(session, tips, prompts);

  // Run all pipeline steps in parallel
  const [vaultResult, revenueResult, noteResult] = await Promise.allSettled([
    extractHighlightsToVault(userId, sessionId),
    logSessionRevenue(userId, sessionId),
    generateHandlerNote(userId, summary),
  ]);

  const vaultItemsCreated = vaultResult.status === 'fulfilled' ? vaultResult.value : 0;
  const revenueCents = revenueResult.status === 'fulfilled' ? revenueResult.value : 0;
  const handlerNote = noteResult.status === 'fulfilled' ? noteResult.value : 'Pipeline complete.';

  return { vaultItemsCreated, revenueCents, handlerNote };
}
