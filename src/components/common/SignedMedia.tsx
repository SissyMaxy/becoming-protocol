import type { VideoHTMLAttributes } from 'react';
import { useSignedUrl } from '../../hooks/useSignedUrl';

interface SignedMediaProps {
  /** Private bucket the asset lives in (e.g. 'vault-media', 'photos'). */
  bucket: string;
  /** Stored object path OR legacy public URL. */
  path: string | null | undefined;
  kind: 'image' | 'video';
  className?: string;
  alt?: string;
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
}

/**
 * Renders an <img>/<video> from a PRIVATE bucket via a freshly-signed URL.
 * Safe inside a list .map() — each instance signs its own asset (you can't call
 * the useSignedUrl hook directly inside a map). Shows a neutral placeholder
 * while signing / if the asset is unavailable. (audit #15)
 */
export function SignedMedia({ bucket, path, kind, className, alt = '', videoProps }: SignedMediaProps) {
  const url = useSignedUrl(bucket, path);
  if (!url) return <div className={className} aria-busy="true" />;
  return kind === 'video'
    ? <video src={url} className={className} {...videoProps} />
    : <img src={url} alt={alt} className={className} />;
}
