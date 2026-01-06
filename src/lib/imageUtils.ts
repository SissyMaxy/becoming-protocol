/**
 * Image Utilities
 *
 * Functions for processing images before upload,
 * including EXIF stripping and resizing.
 */

/**
 * Strip EXIF/metadata from an image by re-drawing to canvas.
 * This removes: GPS location, device info, timestamps, camera settings, etc.
 */
export async function stripImageMetadata(
  imageBlob: Blob,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  } = {}
): Promise<Blob> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.9 } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions (maintain aspect ratio)
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw image (this strips all metadata)
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw image to canvas (strips EXIF)
      ctx.drawImage(img, 0, 0, width, height);

      // Convert back to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Could not create blob from canvas'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };

    img.src = url;
  });
}

/**
 * Get image dimensions without loading full image
 */
export async function getImageDimensions(
  imageBlob: Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };

    img.src = url;
  });
}

/**
 * Create a thumbnail from an image
 */
export async function createThumbnail(
  imageBlob: Blob,
  size: number = 200
): Promise<Blob> {
  return stripImageMetadata(imageBlob, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.7,
  });
}
