/**
 * signed-url — single chokepoint for reading from private storage buckets.
 *
 * Replaces every `supabase.storage.from(bucket).getPublicUrl(path)` after
 * migration 260 flipped `verification-photos`, `evidence`, and `audio` to
 * private. Public URLs against those buckets now 401.
 *
 * Usage:
 *   const url = await getSignedAssetUrl('evidence', path);
 *   <img src={url ?? ''} />
 *
 * Input may be either an object path (`<userid>/foo.jpg`, the new contract)
 * or a legacy public URL stored in older rows (`https://…/object/public/
 * evidence/<userid>/foo.jpg`). The helper detects the URL form and strips
 * the prefix before signing — backfill migration 261 covers known columns,
 * this guard catches any rows it missed.
 *
 * TTL default is 1 hour — long enough for normal card render + interaction,
 * short enough that a leaked URL has a small blast radius. Render sites
 * that hold a URL in long-lived state should re-call on remount; for
 * surfaces that need longer-lived URLs (background sync, pre-cached audio),
 * pass an explicit ttlSeconds.
 */

import { supabase } from '../supabase';

export const SIGNED_URL_DEFAULT_TTL = 3600; // 1 hour

/**
 * If the input looks like a public storage URL, return just the object path.
 * Otherwise return the input unchanged.
 *
 * Public URL shape: <base>/storage/v1/object/public/<bucket>/<path>
 */
export function stripPublicUrlPrefix(bucket: string, value: string): string {
  // Match the standard Supabase storage public-URL prefix and any extra
  // leading slash, strip everything up to and including `/<bucket>/`.
  const re = new RegExp(`^https?://[^/]+/storage/v1/object/public/${bucket}/`);
  return value.replace(re, '');
}

/**
 * Sign a path inside a private bucket. Returns null if the path is empty,
 * the bucket rejects it, or the user lacks SELECT on the storage row.
 *
 * The function never throws — caller treats null as "asset unavailable".
 */
export async function getSignedAssetUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  ttlSeconds: number = SIGNED_URL_DEFAULT_TTL,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  const path = stripPublicUrlPrefix(bucket, pathOrUrl);
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Sign multiple paths in one call — uses Supabase's batch endpoint to avoid
 * N round trips. Returns a map of path → signed URL (null per entry on
 * failure). Pass the same ttl for all.
 */
export async function getSignedAssetUrls(
  bucket: string,
  pathsOrUrls: ReadonlyArray<string | null | undefined>,
  ttlSeconds: number = SIGNED_URL_DEFAULT_TTL,
): Promise<Array<string | null>> {
  if (pathsOrUrls.length === 0) return [];
  const paths = pathsOrUrls.map(p => (p ? stripPublicUrlPrefix(bucket, p) : ''));
  const nonEmpty = paths.filter(p => p.length > 0);
  if (nonEmpty.length === 0) return paths.map(() => null);

  const { data } = await supabase.storage.from(bucket).createSignedUrls(nonEmpty, ttlSeconds);
  const byPath = new Map<string, string | null>();
  if (Array.isArray(data)) {
    for (const row of data) {
      // createSignedUrls returns { path, signedUrl, error } per item
      byPath.set(row.path ?? '', row.signedUrl ?? null);
    }
  }
  return paths.map(p => (p ? byPath.get(p) ?? null : null));
}
