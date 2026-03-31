/**
 * Photo Timeline Evidence Engine (P10.6)
 *
 * Queries the content vault for photos and builds a transformation
 * narrative: earliest vs most recent, monthly trend, domain coverage.
 * Gives the Handler evidence-based ammunition for confrontation and
 * encouragement.
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface PhotoTimelineEntry {
  id: string;
  createdAt: string;
  tags?: string[];
  storageUrl?: string;
}

export interface TransformationEvidence {
  earliestDate: string;
  latestDate: string;
  totalPhotos: number;
  monthlyTrend: number[]; // photos per month, oldest to newest
  daysOfEvidence: number;
  domains: string[];       // unique tags/categories found
  photoUrl_earliest?: string;
  photoUrl_latest?: string;
}

// ============================================
// TIMELINE QUERIES
// ============================================

/**
 * Get the photo timeline: earliest and most recent photos from the vault.
 */
export async function getPhotoTimeline(
  userId: string,
): Promise<{ earliest: PhotoTimelineEntry | null; latest: PhotoTimelineEntry | null; total: number }> {
  try {
    // Get total count
    const { count } = await supabase
      .from('content_vault')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('file_type', 'photo');

    const total = count || 0;
    if (total === 0) return { earliest: null, latest: null, total: 0 };

    // Get earliest and latest in parallel
    const [earliestResult, latestResult] = await Promise.allSettled([
      supabase
        .from('content_vault')
        .select('id, created_at, tags, storage_url')
        .eq('user_id', userId)
        .eq('file_type', 'photo')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('content_vault')
        .select('id, created_at, tags, storage_url')
        .eq('user_id', userId)
        .eq('file_type', 'photo')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const earliestRow = earliestResult.status === 'fulfilled' ? earliestResult.value.data : null;
    const latestRow = latestResult.status === 'fulfilled' ? latestResult.value.data : null;

    const mapRow = (row: Record<string, unknown> | null): PhotoTimelineEntry | null => {
      if (!row) return null;
      return {
        id: row.id as string,
        createdAt: row.created_at as string,
        tags: Array.isArray(row.tags) ? row.tags as string[] : undefined,
        storageUrl: (row.storage_url as string) || undefined,
      };
    };

    return {
      earliest: mapRow(earliestRow),
      latest: mapRow(latestRow),
      total,
    };
  } catch (err) {
    console.error('[photo-timeline] getPhotoTimeline error:', err);
    return { earliest: null, latest: null, total: 0 };
  }
}

// ============================================
// TRANSFORMATION EVIDENCE
// ============================================

/**
 * Build full transformation evidence: timeline span, monthly trends,
 * domain coverage, and reference photos.
 */
export async function getTransformationEvidence(
  userId: string,
): Promise<TransformationEvidence | null> {
  try {
    // Get all photo dates and tags
    const { data: photos } = await supabase
      .from('content_vault')
      .select('id, created_at, tags, storage_url')
      .eq('user_id', userId)
      .eq('file_type', 'photo')
      .order('created_at', { ascending: true });

    if (!photos || photos.length === 0) return null;

    const earliest = photos[0];
    const latest = photos[photos.length - 1];

    const earliestDate = earliest.created_at as string;
    const latestDate = latest.created_at as string;

    // Days of evidence
    const daysOfEvidence = Math.max(
      1,
      Math.ceil(
        (new Date(latestDate).getTime() - new Date(earliestDate).getTime()) / 86400000,
      ),
    );

    // Monthly trend
    const monthBuckets: Record<string, number> = {};
    for (const photo of photos) {
      const month = (photo.created_at as string).slice(0, 7); // YYYY-MM
      monthBuckets[month] = (monthBuckets[month] || 0) + 1;
    }

    // Generate contiguous month keys from earliest to latest
    const startMonth = new Date(earliestDate);
    const endMonth = new Date(latestDate);
    const monthlyTrend: number[] = [];
    const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);

    while (cursor <= endMonth) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend.push(monthBuckets[key] || 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // Collect unique domains from tags
    const domainSet = new Set<string>();
    for (const photo of photos) {
      if (Array.isArray(photo.tags)) {
        for (const tag of photo.tags) {
          if (typeof tag === 'string') {
            domainSet.add(tag.toLowerCase());
          }
        }
      }
    }

    return {
      earliestDate,
      latestDate,
      totalPhotos: photos.length,
      monthlyTrend,
      daysOfEvidence,
      domains: Array.from(domainSet),
      photoUrl_earliest: (earliest.storage_url as string) || undefined,
      photoUrl_latest: (latest.storage_url as string) || undefined,
    };
  } catch (err) {
    console.error('[photo-timeline] getTransformationEvidence error:', err);
    return null;
  }
}

// ============================================
// HANDLER CONTEXT
// ============================================

/**
 * Build Handler context block with photo timeline evidence.
 */
export async function buildPhotoTimelineContext(userId: string): Promise<string> {
  try {
    const evidence = await getTransformationEvidence(userId);
    if (!evidence || evidence.totalPhotos === 0) return '';

    const parts: string[] = [];

    // Months of evidence
    const months = Math.max(1, Math.round(evidence.daysOfEvidence / 30));

    parts.push(
      `PHOTO TIMELINE: vault contains ${evidence.totalPhotos} photos over ${months} month${months !== 1 ? 's' : ''}`,
    );

    // Date range
    const earliestDisplay = new Date(evidence.earliestDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const latestDisplay = new Date(evidence.latestDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    parts.push(`  first photo: ${earliestDisplay} | most recent: ${latestDisplay}`);

    // Monthly trend
    if (evidence.monthlyTrend.length >= 2) {
      const trendStr = evidence.monthlyTrend.join(' \u2192 ');
      const firstMonth = evidence.monthlyTrend[0];
      const lastMonth = evidence.monthlyTrend[evidence.monthlyTrend.length - 1];
      const accelerating = lastMonth > firstMonth;
      parts.push(
        `  monthly trend: ${trendStr} (${accelerating ? 'accelerating' : 'stable'})`,
      );
    }

    // Domains
    if (evidence.domains.length > 0) {
      const domainDisplay = evidence.domains.slice(0, 8).join(', ');
      parts.push(`  domains: ${domainDisplay}`);
    }

    // Summary line
    if (evidence.totalPhotos >= 10) {
      parts.push('  the evidence is building');
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[photo-timeline] buildPhotoTimelineContext error:', err);
    return '';
  }
}
