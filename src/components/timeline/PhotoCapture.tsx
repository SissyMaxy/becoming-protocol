/**
 * Photo Capture Component
 *
 * Take or upload photos for tracking visual transformation.
 * Supports camera capture and file upload.
 */

import { useState, useRef } from 'react';
import { Camera, Upload, X, Check, Star, RotateCcw, Shield, Loader2 } from 'lucide-react';
import type { PhotoCategory } from '../../types/timeline';
import { getCategoryLabel, getCategoryIcon, PHOTO_GUIDANCE } from '../../types/timeline';
import { stripImageMetadata } from '../../lib/imageUtils';

interface PhotoCaptureProps {
  category: PhotoCategory;
  onSave: (imageBlob: Blob, rating?: number, notes?: string) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

export function PhotoCapture({ category, onSave, onCancel, saving }: PhotoCaptureProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strippingMetadata, setStrippingMetadata] = useState(false);
  const [metadataStripped, setMetadataStripped] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const guidance = PHOTO_GUIDANCE[category];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    setError(null);
    setStrippingMetadata(true);

    try {
      // Strip EXIF/metadata for privacy
      const strippedBlob = await stripImageMetadata(file);
      setImageBlob(strippedBlob);
      setImageUrl(URL.createObjectURL(strippedBlob));
      setMetadataStripped(true);
    } catch (err) {
      console.error('Error stripping metadata:', err);
      // Fall back to original if stripping fails
      setImageBlob(file);
      setImageUrl(URL.createObjectURL(file));
      setMetadataStripped(false);
    } finally {
      setStrippingMetadata(false);
    }
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 720, height: 720 },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
    } catch (err) {
      console.error('Camera error:', err);
      setError('Could not access camera. Please allow camera access or upload a photo.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally for selfie mode
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    // Convert to blob (canvas export already strips all metadata)
    canvas.toBlob((blob) => {
      if (blob) {
        setImageBlob(blob);
        setImageUrl(URL.createObjectURL(blob));
        setMetadataStripped(true);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const resetPhoto = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageBlob(null);
    setRating(null);
    setNotes('');
    setError(null);
    setMetadataStripped(false);
  };

  const handleSave = async () => {
    if (!imageBlob) return;
    await onSave(imageBlob, rating ?? undefined, notes || undefined);
  };

  return (
    <div className="card p-6">
      {/* Hidden elements */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileSelect}
        className="hidden"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getCategoryIcon(category)}</span>
          <h3 className="text-lg font-semibold text-protocol-text">
            {getCategoryLabel(category)} Photo
          </h3>
        </div>
        <button
          onClick={() => {
            stopCamera();
            onCancel();
          }}
          className="p-2 rounded-lg hover:bg-protocol-surface text-protocol-text-muted"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Guidance */}
      <div className="p-3 rounded-lg bg-protocol-surface/50 mb-6">
        <p className="text-sm text-protocol-text-muted">
          {guidance}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Camera view */}
      {showCamera && !imageUrl && (
        <div className="relative mb-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-square object-cover rounded-xl"
            style={{ transform: 'scaleX(-1)' }}
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
            <button
              onClick={stopCamera}
              className="p-3 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/50 shadow-lg hover:scale-105 transition-transform"
            />
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {strippingMetadata && (
        <div className="flex items-center justify-center gap-3 p-8 rounded-xl bg-protocol-surface/50 mb-4">
          <Loader2 className="w-6 h-6 text-protocol-accent animate-spin" />
          <span className="text-protocol-text-muted">Stripping metadata...</span>
        </div>
      )}

      {/* Captured/uploaded image */}
      {imageUrl && (
        <div className="relative mb-4">
          <img
            src={imageUrl}
            alt="Captured"
            className="w-full aspect-square object-cover rounded-xl"
          />
          <button
            onClick={resetPhoto}
            className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          {/* Privacy indicator */}
          {metadataStripped && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-900/80 text-green-300 text-xs">
              <Shield className="w-3 h-3" />
              <span>Metadata stripped</span>
            </div>
          )}
        </div>
      )}

      {/* Capture buttons (when no image) */}
      {!showCamera && !imageUrl && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={startCamera}
            className="p-6 rounded-xl border-2 border-dashed border-protocol-border hover:border-protocol-accent flex flex-col items-center gap-3 transition-colors"
          >
            <Camera className="w-8 h-8 text-protocol-text-muted" />
            <span className="text-sm text-protocol-text-muted">Take Photo</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-6 rounded-xl border-2 border-dashed border-protocol-border hover:border-protocol-accent flex flex-col items-center gap-3 transition-colors"
          >
            <Upload className="w-8 h-8 text-protocol-text-muted" />
            <span className="text-sm text-protocol-text-muted">Upload</span>
          </button>
        </div>
      )}

      {/* Rating and notes (after capture) */}
      {imageUrl && (
        <div className="space-y-4 pt-4 border-t border-protocol-border">
          {/* Rating */}
          <div>
            <p className="text-sm text-protocol-text-muted mb-2">
              How do you feel about this?
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className={`p-2 rounded-lg transition-all ${
                    rating === value ? 'scale-110' : 'hover:scale-105'
                  }`}
                >
                  <Star
                    className="w-8 h-8"
                    fill={rating && value <= rating ? '#a855f7' : 'transparent'}
                    color={rating && value <= rating ? '#a855f7' : '#666'}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm text-protocol-text-muted block mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What do you notice? What's changed?"
              rows={2}
              className="w-full p-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted resize-none"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Save Photo
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
