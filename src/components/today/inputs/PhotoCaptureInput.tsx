/**
 * PhotoCaptureInput — Camera/upload for selfies, evidence, outfit captures.
 * EXIF-stripped before upload. Creates evidence row on completion.
 */

import { useState, useRef } from 'react';
import { Camera, Upload, Check, Loader2, X } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import { stripImageMetadata } from '../../../lib/imageUtils';
import { uploadEvidence } from '../../../lib/evidence';
import { supabase } from '../../../lib/supabase';
import type { CompletionData } from '../../../types/task-bank';

interface PhotoCaptureInputProps {
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
  taskDomain?: string;
  taskId?: string;
}

export function PhotoCaptureInput({
  intensity,
  isCompleting,
  onComplete,
  getGradient,
  taskDomain,
  taskId,
}: PhotoCaptureInputProps) {
  const { isBambiMode } = useBambiMode();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setNote('');
  };

  const handleComplete = async () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);

    try {
      // Strip EXIF metadata
      const stripped = await stripImageMetadata(selectedFile);
      const cleanFile = new File([stripped], 'capture.jpg', { type: 'image/jpeg' });

      // Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      // Upload to evidence storage
      const evidence = await uploadEvidence(user.id, cleanFile, 'photo', {
        date: today,
        domain: taskDomain,
        taskId,
        notes: note || undefined,
      });

      if (!evidence) {
        console.error('[PhotoCapture] Upload failed');
        setIsUploading(false);
        return;
      }

      onComplete({
        completion_type: 'photo',
        photo_storage_path: evidence.fileName,
        photo_url: evidence.fileUrl,
        photo_note: note || undefined,
      });
    } catch (err) {
      console.error('[PhotoCapture] Error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const busy = isCompleting || isUploading;

  return (
    <div className="flex-1 space-y-3">
      {/* Preview */}
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Capture preview"
            className="w-full rounded-xl object-cover max-h-48"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Capture buttons */
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed transition-colors ${
              isBambiMode
                ? 'border-pink-300 text-pink-500 hover:bg-pink-50'
                : 'border-protocol-border text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            <Camera className="w-5 h-5" />
            <span className="text-sm font-medium">Camera</span>
          </button>
          <button
            onClick={() => uploadInputRef.current?.click()}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed transition-colors ${
              isBambiMode
                ? 'border-pink-300 text-pink-500 hover:bg-pink-50'
                : 'border-protocol-border text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            <Upload className="w-5 h-5" />
            <span className="text-sm font-medium">Upload</span>
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = '';
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelected(file);
          e.target.value = '';
        }}
      />

      {/* Optional note */}
      {previewUrl && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          className={`w-full rounded-lg px-3 py-2 text-sm transition-colors outline-none ${
            isBambiMode
              ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-300 focus:border-pink-400'
              : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
          }`}
        />
      )}

      {/* Submit */}
      <button
        onClick={handleComplete}
        disabled={busy || !selectedFile}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] ${
          !selectedFile ? 'opacity-50 cursor-not-allowed' : ''
        } bg-gradient-to-r ${
          getGradient(intensity, isBambiMode)
        } hover:opacity-90`}
      >
        {busy ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>{selectedFile ? 'Submit Photo' : 'Take or Upload Photo'}</span>
          </span>
        )}
      </button>
    </div>
  );
}
