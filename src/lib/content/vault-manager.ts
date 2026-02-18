// ============================================
// Vault Manager
// Storage, classification, retrieval, veto tracking
// ============================================

import { supabase } from '../supabase';
import type {
  VaultItem,
  DbVaultItem,
  VaultTier,
  SourceType,
  MediaType,
  SubmissionClassification,
  ConsequenceState,
  DbConsequenceState,
} from '../../types/vault';
import {
  mapDbToVaultItem as mapVault,
  mapDbToConsequenceState as mapConsequence,
} from '../../types/vault';
import {
  generateVaultFilename,
  getExtensionFromMime,
} from './privacy-filter';

// ============================================
// Vault Classification
// ============================================

/**
 * Classify content into a vault tier based on source, context, and arousal.
 * Handler can reclassify later — this is the initial automatic classification.
 */
export function classifyContent(input: {
  sourceType: SourceType;
  mediaType: MediaType;
  captureContext?: string;
  arousalLevel: number;
  description?: string;
}): SubmissionClassification {
  const { sourceType, mediaType, arousalLevel, captureContext } = input;

  let vaultTier: VaultTier = 'public_ready';
  let vulnerabilityScore = 3;
  let plannedUsage = 'General vault content';
  let anonymityVerified = false;

  // Cam recordings and highlights
  if (sourceType === 'cam') {
    vaultTier = 'cam_recording';
    vulnerabilityScore = 6;
    plannedUsage = 'Cam session archive — Handler extracts highlights';
    return { vaultTier, vulnerabilityScore, plannedUsage, anonymityVerified };
  }

  // High arousal captures are more vulnerable
  if (arousalLevel >= 7) {
    vaultTier = 'private';
    vulnerabilityScore = Math.min(10, arousalLevel);
    plannedUsage = 'High-arousal capture — Handler strategic reserve';
  }

  // Session captures
  if (sourceType === 'session') {
    vaultTier = arousalLevel >= 5 ? 'restricted' : 'private';
    vulnerabilityScore = Math.min(10, arousalLevel + 2);
    plannedUsage = 'Edge session evidence — consequence reserve or milestone content';
  }

  // Context-based classification
  const ctx = (captureContext || '').toLowerCase();
  if (ctx.includes('voice') || ctx.includes('skincare') || ctx.includes('milestone')) {
    vaultTier = 'public_ready';
    vulnerabilityScore = Math.min(vulnerabilityScore, 3);
    plannedUsage = 'Routine progress content — scheduled for public posting';
  }
  if (ctx.includes('body') || ctx.includes('measurement') || ctx.includes('intimate')) {
    vaultTier = 'private';
    vulnerabilityScore = Math.max(vulnerabilityScore, 5);
    plannedUsage = 'Body/intimate content — tiered access or consequence material';
  }
  if (ctx.includes('denial') || ctx.includes('edge') || ctx.includes('goon')) {
    vaultTier = 'restricted';
    vulnerabilityScore = Math.max(vulnerabilityScore, 7);
    plannedUsage = 'High-vulnerability content — maximum Handler leverage';
  }

  // Video is generally more vulnerable than images
  if (mediaType === 'video' && vaultTier === 'public_ready') {
    vaultTier = 'private';
    vulnerabilityScore = Math.max(vulnerabilityScore, 4);
  }

  return {
    vaultTier,
    vulnerabilityScore,
    plannedUsage,
    anonymityVerified,
  };
}

/**
 * Generate a Handler note for the submission review screen.
 * Tells David what the Handler plans to do with this content.
 */
export function generateHandlerNote(classification: SubmissionClassification): string {
  const { vaultTier, vulnerabilityScore, plannedUsage } = classification;

  const tierLabels: Record<VaultTier, string> = {
    public_ready: 'public content queue',
    private: 'private vault',
    restricted: 'restricted vault (maximum leverage)',
    cam_recording: 'cam archive',
    cam_highlight: 'cam highlights reel',
  };

  const tierLabel = tierLabels[vaultTier];

  if (vaultTier === 'public_ready') {
    return `This goes in the ${tierLabel}. I'll post it when it serves the narrative. Vulnerability: ${vulnerabilityScore}/10.`;
  }

  if (vaultTier === 'restricted') {
    return `This goes in the ${tierLabel}. Vulnerability: ${vulnerabilityScore}/10. This is consequence material. I decide when and if it sees the light of day.`;
  }

  if (vaultTier === 'cam_recording') {
    return `Full session archived. I'll extract the highlights worth posting.`;
  }

  return `This goes in the ${tierLabel}. Vulnerability: ${vulnerabilityScore}/10. ${plannedUsage}`;
}

// ============================================
// Vault Storage
// ============================================

/**
 * Upload media to Supabase storage and create vault record.
 */
export async function submitToVault(
  userId: string,
  blob: Blob,
  mimeType: string,
  classification: SubmissionClassification,
  metadata: {
    sourceType: SourceType;
    sourceTaskId?: string;
    sourceSessionId?: string;
    sourceCamSessionId?: string;
    captureContext?: string;
    arousalLevel: number;
    submissionState?: string;
    description?: string;
    privacyScanResult: Record<string, unknown>;
    exifStripped: boolean;
  }
): Promise<VaultItem> {
  const ext = getExtensionFromMime(mimeType);
  const filename = generateVaultFilename(mimeType.split('/')[0], ext);
  const storagePath = `${userId}/${filename}`;

  // Upload to Supabase storage
  const { error: uploadError } = await supabase.storage
    .from('vault-media')
    .upload(storagePath, blob, {
      contentType: mimeType,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Failed to upload media: ${uploadError.message}`);
  }

  // Get public URL (within RLS scope — only the user can access)
  const { data: urlData } = supabase.storage
    .from('vault-media')
    .getPublicUrl(storagePath);

  const mediaUrl = urlData.publicUrl;
  const mediaType = mimeType.startsWith('image/') ? 'image'
    : mimeType.startsWith('video/') ? 'video'
    : 'audio';

  // Create vault record
  const { data, error } = await supabase
    .from('content_vault')
    .insert({
      user_id: userId,
      media_url: mediaUrl,
      media_type: mediaType,
      source_type: metadata.sourceType,
      source_task_id: metadata.sourceTaskId,
      source_session_id: metadata.sourceSessionId,
      source_cam_session_id: metadata.sourceCamSessionId,
      capture_context: metadata.captureContext,
      arousal_level_at_capture: metadata.arousalLevel,
      submission_state: metadata.submissionState,
      vault_tier: classification.vaultTier,
      vulnerability_score: classification.vulnerabilityScore,
      exposure_phase_minimum: classification.exposurePhaseMinimum,
      handler_classification_reason: classification.plannedUsage,
      anonymity_verified: classification.anonymityVerified,
      privacy_scan_result: metadata.privacyScanResult,
      exif_stripped: metadata.exifStripped,
      description: metadata.description,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create vault record: ${error.message}`);
  }

  // Update consequence state — record submission
  await recordSubmission(userId);

  return mapVault(data as DbVaultItem);
}

// ============================================
// Veto Tracking
// ============================================

/**
 * Log a veto decision. Handler uses this for avoidance detection.
 */
export async function logVeto(
  userId: string,
  data: {
    sourceType: SourceType;
    sourceTaskId?: string;
    sourceSessionId?: string;
    captureContext?: string;
    arousalLevelAtCapture?: number;
    mediaType?: string;
    reason?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from('veto_log')
    .insert({
      user_id: userId,
      source_type: data.sourceType,
      source_task_id: data.sourceTaskId,
      source_session_id: data.sourceSessionId,
      capture_context: data.captureContext,
      arousal_level_at_capture: data.arousalLevelAtCapture,
      media_type: data.mediaType,
      reason: data.reason,
    });

  if (error) {
    console.error('Failed to log veto:', error);
  }

  // Update consequence state — record veto
  await recordVeto(userId);
}

/**
 * Get veto stats for the current week (avoidance detection).
 */
export async function getWeeklyVetoStats(userId: string): Promise<{
  vetoCount: number;
  submissionCount: number;
  vetoRate: number;
  isAvoidancePattern: boolean;
}> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [vetoResult, submissionResult] = await Promise.all([
    supabase
      .from('veto_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekAgo.toISOString()),
    supabase
      .from('content_vault')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('submitted_at', weekAgo.toISOString()),
  ]);

  const vetoCount = vetoResult.count || 0;
  const submissionCount = submissionResult.count || 0;
  const total = vetoCount + submissionCount;
  const vetoRate = total > 0 ? vetoCount / total : 0;

  return {
    vetoCount,
    submissionCount,
    vetoRate,
    isAvoidancePattern: vetoRate > 0.5 && total >= 4,
  };
}

// ============================================
// Consequence State
// ============================================

/**
 * Record a submission (resets consequence timer toward compliance).
 */
async function recordSubmission(userId: string): Promise<void> {
  await supabase
    .from('consequence_state')
    .upsert({
      user_id: userId,
      last_compliance_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  // Increment submission count — RPC may not exist yet (Phase 3)
  try {
    await supabase.rpc('increment_submission_count', { p_user_id: userId });
  } catch { /* Phase 3 */ }
}

/**
 * Record a veto (feeds into avoidance detection).
 */
async function recordVeto(userId: string): Promise<void> {
  // RPC may not exist yet (Phase 3)
  try {
    await supabase.rpc('increment_veto_count', { p_user_id: userId });
  } catch { /* Phase 3 */ }
}

/**
 * Get current consequence state.
 */
export async function getConsequenceState(userId: string): Promise<ConsequenceState | null> {
  const { data, error } = await supabase
    .from('consequence_state')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return mapConsequence(data as DbConsequenceState);
}

// ============================================
// Vault Queries
// ============================================

/**
 * Get all vault items for a user, ordered by most recent.
 */
export async function getVaultItems(
  userId: string,
  options?: {
    tier?: VaultTier;
    limit?: number;
    offset?: number;
  }
): Promise<VaultItem[]> {
  let query = supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.tier) {
    query = query.eq('vault_tier', options.tier);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options?.limit || 20) - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load vault items: ${error.message}`);

  return (data || []).map(d => mapVault(d as DbVaultItem));
}

/**
 * Get vault stats for dashboard.
 */
export async function getVaultStats(userId: string): Promise<{
  totalItems: number;
  byTier: Record<VaultTier, number>;
  unusedCount: number;
  avgVulnerability: number;
}> {
  const { data, error } = await supabase
    .from('content_vault')
    .select('vault_tier, vulnerability_score, times_used')
    .eq('user_id', userId);

  if (error) throw new Error(`Failed to load vault stats: ${error.message}`);

  const items = data || [];
  const byTier: Record<VaultTier, number> = {
    public_ready: 0,
    private: 0,
    restricted: 0,
    cam_recording: 0,
    cam_highlight: 0,
  };

  let totalVuln = 0;
  let vulnCount = 0;
  let unusedCount = 0;

  for (const item of items) {
    const tier = item.vault_tier as VaultTier;
    if (tier in byTier) byTier[tier]++;
    if (item.vulnerability_score) {
      totalVuln += item.vulnerability_score;
      vulnCount++;
    }
    if (item.times_used === 0) unusedCount++;
  }

  return {
    totalItems: items.length,
    byTier,
    unusedCount,
    avgVulnerability: vulnCount > 0 ? Math.round(totalVuln / vulnCount * 10) / 10 : 0,
  };
}
