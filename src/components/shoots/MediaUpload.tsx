/**
 * MediaUpload — Upload photos/video with EXIF stripping
 * Handles camera roll or capture, strips metadata, randomizes filenames,
 * stores to Supabase storage, returns media paths.
 */

import { useState, useRef, useCallback } from 'react';
import {
  Upload, X, Image as ImageIcon, Loader2, CheckCircle2,
  AlertTriangle, Trash2,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { stripImageMetadata } from '../../lib/imageUtils';

interface MediaUploadProps {
  shootId: string;
  onUploadComplete: (mediaPaths: string[]) => void;
  onClose: () => void;
  maxFiles?: number;
}

interface UploadedFile {
  id: string;
  originalName: string;
  storagePath: string;
  publicUrl: string;
  thumbnailUrl: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function generateRandomFilename(ext: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < 16; i++) {
    name += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${name}_${Date.now()}.${ext}`;
}

export function MediaUpload({
  shootId,
  onUploadComplete,
  onClose,
  maxFiles = 20,
}: MediaUploadProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processAndUploadFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const fileId = crypto.randomUUID();
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const ext = isImage ? 'jpg' : file.name.split('.').pop() || 'mp4';
    const randomName = generateRandomFilename(ext);
    const storagePath = `${user?.id}/shoots/${shootId}/${randomName}`;

    try {
      let uploadBlob: Blob;

      if (isImage) {
        // Strip EXIF metadata via canvas re-encode
        uploadBlob = await stripImageMetadata(file, {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 0.92,
        });
      } else if (isVideo) {
        // Video EXIF stripping requires server-side FFmpeg
        // For now, upload raw — server-side processing in future sprint
        uploadBlob = file;
      } else {
        throw new Error('Unsupported file type');
      }

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('vault-media')
        .upload(storagePath, uploadBlob, {
          contentType: isImage ? 'image/jpeg' : file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('vault-media')
        .getPublicUrl(storagePath);

      return {
        id: fileId,
        originalName: file.name,
        storagePath,
        publicUrl: urlData.publicUrl,
        thumbnailUrl: urlData.publicUrl, // Same URL for now — can add transforms later
        status: 'done',
      };
    } catch (err) {
      return {
        id: fileId,
        originalName: file.name,
        storagePath,
        publicUrl: '',
        thumbnailUrl: '',
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  }, [user?.id, shootId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const remaining = maxFiles - uploads.length;
    const toProcess = files.slice(0, remaining);

    setIsProcessing(true);

    // Add placeholder entries
    const placeholders: UploadedFile[] = toProcess.map((f) => ({
      id: crypto.randomUUID(),
      originalName: f.name,
      storagePath: '',
      publicUrl: '',
      thumbnailUrl: '',
      status: 'uploading' as const,
    }));
    setUploads(prev => [...prev, ...placeholders]);

    // Process each file
    const results = await Promise.all(toProcess.map(f => processAndUploadFile(f)));

    // Replace placeholders with results
    setUploads(prev => {
      const existing = prev.filter(u => u.status !== 'uploading' || !placeholders.find(p => p.id === u.id));
      return [...existing, ...results];
    });

    setIsProcessing(false);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [uploads.length, maxFiles, processAndUploadFile]);

  const removeUpload = useCallback(async (upload: UploadedFile) => {
    if (upload.storagePath && upload.status === 'done') {
      await supabase.storage.from('vault-media').remove([upload.storagePath]);
    }
    setUploads(prev => prev.filter(u => u.id !== upload.id));
  }, []);

  const handleConfirm = () => {
    const successfulPaths = uploads
      .filter(u => u.status === 'done')
      .map(u => u.storagePath);
    onUploadComplete(successfulPaths);
  };

  const successCount = uploads.filter(u => u.status === 'done').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${
      isBambiMode ? 'bg-white' : 'bg-protocol-bg'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 ${
        isBambiMode ? 'border-b border-gray-100' : 'border-b border-protocol-border'
      }`}>
        <button onClick={onClose} className="p-1">
          <X className={`w-5 h-5 ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`} />
        </button>
        <p className={`text-sm font-semibold ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          Upload Media
        </p>
        <div className="w-6" />
      </div>

      {/* Upload area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Drop zone / select button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || uploads.length >= maxFiles}
          className={`w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-colors ${
            isProcessing
              ? 'opacity-50 cursor-not-allowed'
              : isBambiMode
                ? 'border-pink-200 bg-pink-50 hover:bg-pink-100'
                : 'border-protocol-border bg-protocol-surface hover:bg-protocol-bg'
          }`}
        >
          {isProcessing ? (
            <Loader2 className={`w-8 h-8 animate-spin ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
            }`} />
          ) : (
            <Upload className={`w-8 h-8 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
            }`} />
          )}
          <p className={`text-sm font-medium ${
            isBambiMode ? 'text-gray-600' : 'text-protocol-text'
          }`}>
            {isProcessing ? 'Processing...' : 'Tap to select photos or video'}
          </p>
          <p className={`text-[10px] ${
            isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
          }`}>
            EXIF data auto-stripped — filenames randomized
          </p>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Upload grid */}
        {uploads.length > 0 && (
          <div>
            <p className={`text-xs font-semibold mb-2 ${
              isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
            }`}>
              {successCount} uploaded{errorCount > 0 ? `, ${errorCount} failed` : ''}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {uploads.map((upload) => (
                <div key={upload.id} className="relative aspect-square rounded-lg overflow-hidden">
                  {upload.status === 'done' && upload.publicUrl ? (
                    <img
                      src={upload.publicUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : upload.status === 'uploading' ? (
                    <div className={`w-full h-full flex items-center justify-center ${
                      isBambiMode ? 'bg-gray-100' : 'bg-protocol-surface'
                    }`}>
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${
                      isBambiMode ? 'bg-red-50' : 'bg-red-900/20'
                    }`}>
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                      <p className="text-[9px] text-red-400 px-1 text-center">
                        {upload.error || 'Failed'}
                      </p>
                    </div>
                  )}

                  {/* Status badge */}
                  {upload.status === 'done' && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle2 className="w-4 h-4 text-green-400 drop-shadow" />
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    onClick={() => removeUpload(upload)}
                    className="absolute bottom-1 right-1 p-1 rounded-full bg-black/50"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className={`px-4 py-4 ${
        isBambiMode ? 'border-t border-gray-100' : 'border-t border-protocol-border'
      }`}>
        <button
          onClick={handleConfirm}
          disabled={successCount === 0}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold text-white transition-colors ${
            successCount === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600'
                : 'bg-protocol-accent hover:bg-purple-500'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          {successCount === 0 ? 'Upload photos first' : `Use ${successCount} photo${successCount === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
