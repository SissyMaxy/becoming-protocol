/**
 * Content Pipeline — Vault
 *
 * CRUD for vault items, AI classification, auto-approval checks.
 * The Handler classifies; David swipes.
 */

import { supabase } from '../supabase';
import { invokeWithAuth } from '../handler-ai';
import type {
  VaultItem,
  ApprovalStatus,
  ContentType,
  VaultStats,
} from '../../types/content-pipeline';

// ── Add to vault ────────────────────────────────────────

export async function addToVault(
  userId: string,
  item: {
    media_url: string;
    media_type: 'image' | 'video' | 'audio';
    thumbnail_url?: string;
    description?: string;
    source_type: string;
    source_task_id?: string;
    capture_context?: string;
    tags?: string[];
    caption_draft?: string;
    face_visible?: boolean;
    auto_captured?: boolean;
    domain?: string;
    platforms?: string[];
    file_size_bytes?: number;
    duration_seconds?: number;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('content_vault')
    .insert({
      user_id: userId,
      ...item,
      approval_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('[vault] addToVault error:', error);
    return null;
  }

  // Attempt auto-classification in background
  classifyVaultItem(userId, data.id).catch(err =>
    console.warn('[vault] Background classification failed:', err)
  );

  return data.id;
}

// ── AI classification ───────────────────────────────────

export async function classifyVaultItem(userId: string, vaultId: string): Promise<boolean> {
  const { data: item, error: fetchErr } = await supabase
    .from('content_vault')
    .select('*')
    .eq('id', vaultId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !item) return false;

  const { data: aiResult } = await invokeWithAuth('handler-ai', {
    action: 'classify_content',
    content: {
      media_type: item.media_type,
      description: item.description || '',
      source_type: item.source_type,
      capture_context: item.capture_context || '',
    },
  });

  if (!aiResult || typeof aiResult !== 'object') return false;

  const classification = aiResult as Record<string, unknown>;
  const { error: updateErr } = await supabase
    .from('content_vault')
    .update({
      quality_rating: classification.quality_rating || 3,
      content_type: classification.content_type || 'lifestyle',
      explicitness_level: classification.explicitness_level || 0,
      identification_risk: classification.identification_risk || 'none',
      platform_suitability: classification.platform_suitability || {},
      handler_notes: classification.handler_notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vaultId)
    .eq('user_id', userId);

  if (updateErr) {
    console.error('[vault] classifyVaultItem update error:', updateErr);
    return false;
  }

  // Check auto-approval after classification
  const { data: classified } = await supabase
    .from('content_vault')
    .select('*')
    .eq('id', vaultId)
    .single();

  if (classified) {
    await checkAutoApproval(userId, classified as VaultItem);
  }

  return true;
}

// ── Auto-approval check ─────────────────────────────────

export async function checkAutoApproval(userId: string, item: VaultItem): Promise<boolean> {
  if (item.approval_status !== 'pending') return false;

  const { data: permissions } = await supabase
    .from('content_permissions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!permissions || permissions.length === 0) return false;

  for (const perm of permissions) {
    let matches = false;

    switch (perm.rule_type) {
      case 'full_autonomy':
        matches = true;
        break;
      case 'explicitness_max':
        matches = item.explicitness_level <= parseInt(perm.rule_value, 10);
        break;
      case 'content_type':
        matches = item.content_type === perm.rule_value;
        break;
      case 'platform':
        // Platform rules check suitability
        matches = !!(item.platform_suitability as Record<string, boolean>)?.[perm.rule_value];
        break;
      case 'source':
        matches = item.source_type === perm.rule_value;
        break;
    }

    if (matches) {
      await supabase
        .from('content_vault')
        .update({
          approval_status: 'auto_approved' as ApprovalStatus,
          approved_at: new Date().toISOString(),
          auto_approval_rule: `${perm.rule_type}:${perm.rule_value}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('user_id', userId);

      return true;
    }
  }

  return false;
}

// ── Get pending items (for VaultSwipe) ──────────────────

export async function getPendingVaultItems(userId: string): Promise<VaultItem[]> {
  const { data, error } = await supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[vault] getPendingVaultItems error:', error);
    return [];
  }

  return (data || []) as VaultItem[];
}

// ── Approve / Reject ────────────────────────────────────

export async function approveVaultItem(userId: string, vaultId: string): Promise<boolean> {
  const { error } = await supabase
    .from('content_vault')
    .update({
      approval_status: 'approved' as ApprovalStatus,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', vaultId)
    .eq('user_id', userId);

  if (error) {
    console.error('[vault] approveVaultItem error:', error);
    return false;
  }

  return true;
}

export async function rejectVaultItem(userId: string, vaultId: string): Promise<boolean> {
  const { error } = await supabase
    .from('content_vault')
    .update({
      approval_status: 'rejected' as ApprovalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', vaultId)
    .eq('user_id', userId);

  if (error) {
    console.error('[vault] rejectVaultItem error:', error);
    return false;
  }

  return true;
}

// ── Browse vault items (filtered) ────────────────────────

export async function browseVaultItems(
  userId: string,
  filters?: {
    status?: string;
    content_type?: string;
    platform?: string;
    domain?: string;
    face_visible?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<VaultItem[]> {
  let query = supabase
    .from('content_vault')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('approval_status', filters.status);
  if (filters?.content_type) query = query.eq('content_type', filters.content_type);
  if (filters?.domain) query = query.eq('domain', filters.domain);
  if (filters?.face_visible !== undefined) query = query.eq('face_visible', filters.face_visible);
  if (filters?.platform) query = query.contains('platforms', [filters.platform]);

  query = query.range(
    filters?.offset || 0,
    (filters?.offset || 0) + (filters?.limit || 50) - 1
  );

  const { data, error } = await query;
  if (error) {
    console.error('[vault] browseVaultItems error:', error);
    return [];
  }
  return (data || []) as VaultItem[];
}

// ── Vault stats ─────────────────────────────────────────

export async function getVaultStats(userId: string): Promise<VaultStats> {
  const { data, error } = await supabase
    .from('content_vault')
    .select('approval_status, content_type')
    .eq('user_id', userId);

  if (error || !data) {
    return { total: 0, pending: 0, approved: 0, distributed: 0, rejected: 0, auto_approved: 0, by_content_type: {} };
  }

  const stats: VaultStats = {
    total: data.length,
    pending: 0,
    approved: 0,
    distributed: 0,
    rejected: 0,
    auto_approved: 0,
    by_content_type: {},
  };

  for (const row of data) {
    const status = row.approval_status as ApprovalStatus | null;
    if (status === 'pending') stats.pending++;
    else if (status === 'approved') stats.approved++;
    else if (status === 'distributed') stats.distributed++;
    else if (status === 'rejected') stats.rejected++;
    else if (status === 'auto_approved') stats.auto_approved++;

    const ct = row.content_type as ContentType | null;
    if (ct) {
      stats.by_content_type[ct] = (stats.by_content_type[ct] || 0) + 1;
    }
  }

  return stats;
}
