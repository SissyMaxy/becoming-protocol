import { useState, useEffect } from 'react';
import { getSignedAssetUrl } from '../lib/storage/signed-url';

/**
 * Resolve a freshly-signed URL for an asset in a PRIVATE storage bucket.
 * Accepts either a stored object path (`<userid>/foo.jpg`, the contract) or a
 * legacy public URL (the helper strips the prefix). Re-signs on prop change and
 * cancels on unmount, so it's safe in long-lived UI.
 *
 * Why: private buckets (verification-photos, evidence, audio, vault-media,
 * photos) return 401 on getPublicUrl — every render must sign (audit #15).
 */
export function useSignedUrl(
  bucket: string,
  pathOrUrl: string | null | undefined,
  ttlSeconds = 3600,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!pathOrUrl) {
      setUrl(null);
      return;
    }
    getSignedAssetUrl(bucket, pathOrUrl, ttlSeconds).then((signed) => {
      if (!cancelled) setUrl(signed);
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, pathOrUrl, ttlSeconds]);
  return url;
}
