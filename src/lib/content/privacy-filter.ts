// ============================================
// Privacy Filter
// EXIF stripping, PII scanning, anonymity verification
// ============================================

import type { PrivacyScanResult, ExposurePhase } from '../../types/vault';

// PII patterns to scan for in captions/descriptions
const PII_PATTERNS: Array<{ pattern: RegExp; warning: string; blocked: boolean }> = [
  // Real names (common patterns)
  { pattern: /\b(david|gina)\b/i, warning: 'Possible real name detected', blocked: true },
  // Email addresses
  { pattern: /[\w.-]+@[\w.-]+\.\w{2,}/i, warning: 'Email address detected', blocked: true },
  // Phone numbers
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, warning: 'Phone number detected', blocked: true },
  // Street addresses
  { pattern: /\b\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|ct|court|way|pl|place)\b/i, warning: 'Street address detected', blocked: true },
  // Social security numbers
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, warning: 'SSN pattern detected', blocked: true },
  // Employer/workplace references
  { pattern: /\b(work|office|employer|company|job)\b/i, warning: 'Possible workplace reference', blocked: false },
  // Location specifics
  { pattern: /\b(my (city|town|neighborhood|apartment|house|home address))\b/i, warning: 'Location reference detected', blocked: false },
  // Partner references
  { pattern: /\b(my (wife|husband|partner|spouse|girlfriend|boyfriend))\b/i, warning: 'Partner reference — verify no identifying details', blocked: false },
];

/**
 * Scan caption/description text for PII
 */
export function scanCaption(text: string): PrivacyScanResult {
  const warnings: string[] = [];
  let blocked = false;

  for (const { pattern, warning, blocked: isBlocking } of PII_PATTERNS) {
    if (pattern.test(text)) {
      warnings.push(warning);
      if (isBlocking) blocked = true;
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
    blocked,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Scan media file for privacy concerns.
 * Client-side: checks EXIF data for GPS, device info, timestamps.
 * Uses canvas-based EXIF reading (no external dependencies).
 */
export async function scanMedia(file: File): Promise<PrivacyScanResult> {
  const warnings: string[] = [];
  let blocked = false;

  // Check file name for PII
  const fileName = file.name.toLowerCase();
  if (/\d{4}[-_]\d{2}[-_]\d{2}/.test(fileName)) {
    warnings.push('File name contains date pattern — may reveal timing');
  }
  if (/img_\d{4}|dcim|screenshot/i.test(fileName)) {
    warnings.push('Default camera file name — may be trackable');
  }

  // For images: check for EXIF GPS data
  if (file.type.startsWith('image/')) {
    try {
      const exifData = await readExifGps(file);
      if (exifData.hasGps) {
        warnings.push('GPS location data found in image — will be stripped');
        blocked = true; // Block until EXIF is stripped
      }
      if (exifData.hasDeviceInfo) {
        warnings.push('Device/camera model info found — will be stripped');
      }
    } catch {
      // If EXIF reading fails, warn but don't block
      warnings.push('Could not verify EXIF data — proceed with caution');
    }
  }

  // For video: check file size (very large = may contain embedded metadata)
  if (file.type.startsWith('video/') && file.size > 100 * 1024 * 1024) {
    warnings.push('Large video file — ensure no location/device metadata');
  }

  return {
    safe: warnings.length === 0,
    warnings,
    blocked,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * Strip EXIF metadata from image files.
 * Uses canvas redraw to remove all metadata while preserving image quality.
 * Returns a clean Blob URL.
 */
export async function stripExifFromImage(file: File): Promise<{ blob: Blob; url: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Redraw on canvas strips all EXIF data
      ctx.drawImage(img, 0, 0);

      // Convert to blob at high quality
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = file.type === 'image/png' ? undefined : 0.95;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create stripped blob'));
            return;
          }
          const url = URL.createObjectURL(blob);
          resolve({ blob, url });
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for EXIF stripping'));
    };

    img.src = objectUrl;
  });
}

/**
 * Strip metadata from any media file.
 * Images: canvas redraw. Video/audio: pass through (server-side FFmpeg needed).
 */
export async function stripMetadata(file: File): Promise<{ blob: Blob; url: string; stripped: boolean }> {
  if (file.type.startsWith('image/')) {
    const result = await stripExifFromImage(file);
    return { ...result, stripped: true };
  }

  // Video/audio: return original (server-side stripping needed for these)
  const url = URL.createObjectURL(file);
  return { blob: file, url, stripped: false };
}

/**
 * Check if content meets exposure phase requirements.
 * Content can only go public if the user has reached the required phase.
 */
export function checkExposurePhase(
  contentPhaseMinimum: ExposurePhase | undefined,
  currentPhase: ExposurePhase
): boolean {
  if (!contentPhaseMinimum) return true;

  const phaseOrder: ExposurePhase[] = ['pre_hrt', 'early_hrt', 'mid_hrt', 'post_coming_out'];
  const contentIdx = phaseOrder.indexOf(contentPhaseMinimum);
  const currentIdx = phaseOrder.indexOf(currentPhase);

  return currentIdx >= contentIdx;
}

/**
 * Run full privacy scan on a submission.
 * Combines caption scan + media scan.
 */
export async function runFullPrivacyScan(
  file: File,
  caption?: string
): Promise<PrivacyScanResult> {
  const results: PrivacyScanResult[] = [];

  // Scan media
  const mediaScan = await scanMedia(file);
  results.push(mediaScan);

  // Scan caption if provided
  if (caption) {
    const captionScan = scanCaption(caption);
    results.push(captionScan);
  }

  // Merge results
  const allWarnings = results.flatMap(r => r.warnings);
  const anyBlocked = results.some(r => r.blocked);

  return {
    safe: allWarnings.length === 0,
    warnings: [...new Set(allWarnings)], // Deduplicate
    blocked: anyBlocked,
    scannedAt: new Date().toISOString(),
  };
}

// ============================================
// Internal: EXIF GPS reader
// ============================================

interface ExifCheckResult {
  hasGps: boolean;
  hasDeviceInfo: boolean;
}

/**
 * Read EXIF data from JPEG/TIFF to check for GPS and device info.
 * Minimal parser — only checks for presence, doesn't extract values.
 */
async function readExifGps(file: File): Promise<ExifCheckResult> {
  const buffer = await file.slice(0, 65536).arrayBuffer(); // First 64KB
  const view = new DataView(buffer);

  const result: ExifCheckResult = { hasGps: false, hasDeviceInfo: false };

  // Check for JPEG SOI marker
  if (view.getUint16(0) !== 0xFFD8) return result;

  let offset = 2;
  while (offset < view.byteLength - 2) {
    const marker = view.getUint16(offset);

    // APP1 marker (EXIF)
    if (marker === 0xFFE1) {
      const length = view.getUint16(offset + 2);
      const exifStart = offset + 4;

      // Check for "Exif\0\0"
      if (
        view.getUint8(exifStart) === 0x45 &&     // E
        view.getUint8(exifStart + 1) === 0x78 &&  // x
        view.getUint8(exifStart + 2) === 0x69 &&  // i
        view.getUint8(exifStart + 3) === 0x66     // f
      ) {
        // Scan the EXIF block for GPS IFD tag (0x8825) and Make tag (0x010F)
        const exifBlock = new Uint8Array(buffer, exifStart, Math.min(length, view.byteLength - exifStart));
        const blockStr = Array.from(exifBlock)
          .map(b => String.fromCharCode(b))
          .join('');

        // GPS tag bytes: 0x88, 0x25 (big endian) or 0x25, 0x88 (little endian)
        if (blockStr.includes('\x88\x25') || blockStr.includes('\x25\x88')) {
          result.hasGps = true;
        }

        // Camera Make/Model tags
        if (blockStr.includes('\x01\x0F') || blockStr.includes('\x0F\x01') ||
            blockStr.includes('\x01\x10') || blockStr.includes('\x10\x01')) {
          result.hasDeviceInfo = true;
        }
      }

      offset += 2 + length;
    } else if ((marker & 0xFF00) === 0xFF00) {
      // Other marker — skip
      if (marker === 0xFFDA) break; // Start of scan data
      const length = view.getUint16(offset + 2);
      offset += 2 + length;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Generate a safe, anonymous filename for vault storage.
 */
export function generateVaultFilename(_mediaType: string, extension: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `vault_${timestamp}_${random}.${extension}`;
}

/**
 * Detect file extension from MIME type.
 */
export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
  };
  return map[mimeType] || 'bin';
}
