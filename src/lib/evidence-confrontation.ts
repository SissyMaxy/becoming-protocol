/**
 * Evidence Confrontation Engine
 * Monthly prescribed confrontation — forces her to see how far she's come.
 * The before/after is undeniable. The reflection becomes evidence too (recursive ratchet).
 * Pure Supabase CRUD. No React.
 */

import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface ConfrontationData {
  earliestPhoto: { date: string; url: string; domain?: string } | null;
  latestPhoto: { date: string; url: string; domain?: string } | null;
  earliestJournal: { date: string; excerpt: string } | null;
  latestJournal: { date: string; excerpt: string } | null;
  totalEvidenceCount: number;
  photosCount: number;
  journalsCount: number;
  voiceCount: number;
  domainsActive: string[];
  firstEvidenceDate: string | null;
  totalDaysDocumented: number;
  lastConfrontationAt: string | null;
  daysSinceLastConfrontation: number | null;
}

// ============================================
// CORE
// ============================================

export async function buildConfrontation(userId: string): Promise<ConfrontationData> {
  const [earliest, latest, counts, journals, lastConfrontation] = await Promise.allSettled([
    // Earliest photo evidence
    supabase
      .from('evidence')
      .select('date, file_url, domain')
      .eq('user_id', userId)
      .eq('type', 'photo')
      .order('date', { ascending: true })
      .limit(1)
      .single(),
    // Latest photo evidence
    supabase
      .from('evidence')
      .select('date, file_url, domain')
      .eq('user_id', userId)
      .eq('type', 'photo')
      .order('date', { ascending: false })
      .limit(1)
      .single(),
    // Count by type
    supabase
      .from('evidence')
      .select('type, domain')
      .eq('user_id', userId),
    // Journal entries (earliest + latest)
    supabase
      .from('journal_entries')
      .select('date, content')
      .eq('user_id', userId)
      .order('date', { ascending: true }),
    // Last confrontation (stored as a completed task or journal tag)
    supabase
      .from('task_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .ilike('capture_data->>confrontation', 'true')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single(),
  ]);

  // Parse earliest/latest photos
  const earliestData = earliest.status === 'fulfilled' && earliest.value.data;
  const latestData = latest.status === 'fulfilled' && latest.value.data;

  const earliestPhoto = earliestData
    ? { date: earliestData.date, url: earliestData.file_url, domain: earliestData.domain }
    : null;
  const latestPhoto = latestData
    ? { date: latestData.date, url: latestData.file_url, domain: latestData.domain }
    : null;

  // Count evidence by type
  const evidenceRows = counts.status === 'fulfilled' ? (counts.value.data || []) : [];
  const photosCount = evidenceRows.filter((r: { type: string }) => r.type === 'photo').length;
  const voiceCount = evidenceRows.filter((r: { type: string }) => r.type === 'voice').length;
  const domainsActive = [...new Set(evidenceRows.map((r: { domain?: string }) => r.domain).filter(Boolean))] as string[];

  // Journal entries
  const journalRows = journals.status === 'fulfilled' ? (journals.value.data || []) : [];
  const earliestJournal = journalRows.length > 0
    ? { date: journalRows[0].date, excerpt: (journalRows[0].content || '').slice(0, 150) }
    : null;
  const latestJournal = journalRows.length > 1
    ? { date: journalRows[journalRows.length - 1].date, excerpt: (journalRows[journalRows.length - 1].content || '').slice(0, 150) }
    : null;

  // First evidence date and total days
  const firstEvidenceDate = earliestPhoto?.date || earliestJournal?.date || null;
  const totalDaysDocumented = firstEvidenceDate
    ? Math.floor((Date.now() - new Date(firstEvidenceDate).getTime()) / 86400000)
    : 0;

  // Last confrontation
  const lastConfData = lastConfrontation.status === 'fulfilled' ? lastConfrontation.value.data : null;
  const lastConfrontationAt = lastConfData?.completed_at || null;
  const daysSinceLastConfrontation = lastConfrontationAt
    ? Math.floor((Date.now() - new Date(lastConfrontationAt).getTime()) / 86400000)
    : null;

  return {
    earliestPhoto,
    latestPhoto,
    earliestJournal,
    latestJournal,
    totalEvidenceCount: evidenceRows.length,
    photosCount,
    journalsCount: journalRows.length,
    voiceCount,
    domainsActive,
    firstEvidenceDate,
    totalDaysDocumented,
    lastConfrontationAt,
    daysSinceLastConfrontation,
  };
}

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

export async function buildConfrontationContext(userId: string): Promise<string> {
  try {
    const data = await buildConfrontation(userId);
    if (data.totalEvidenceCount === 0) return '';

    const parts: string[] = [];
    parts.push('EVIDENCE CONFRONTATION:');
    parts.push(`  Last confrontation: ${data.lastConfrontationAt ? new Date(data.lastConfrontationAt).toLocaleDateString() : 'never'}`);

    if (data.daysSinceLastConfrontation !== null) {
      parts.push(`  Days since last: ${data.daysSinceLastConfrontation}`);
    }

    if (data.daysSinceLastConfrontation === null || data.daysSinceLastConfrontation > 30) {
      parts.push('  STATUS: OVERDUE. Prescribe evidence confrontation this week. Non-negotiable.');
    }

    parts.push(`  Total evidence: ${data.photosCount} photos, ${data.journalsCount} journals, ${data.voiceCount} voice`);
    if (data.firstEvidenceDate) {
      parts.push(`  First evidence: ${data.firstEvidenceDate}`);
      parts.push(`  Days of documented transformation: ${data.totalDaysDocumented}`);
    }
    parts.push(`  Domains: ${data.domainsActive.join(', ') || 'none'}`);

    return parts.join('\n');
  } catch {
    return '';
  }
}
