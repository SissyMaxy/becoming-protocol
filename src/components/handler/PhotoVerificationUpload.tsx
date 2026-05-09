import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PhotoVerificationUploadProps {
  taskType?: 'outfit' | 'mirror_check' | 'pose' | 'makeup' | 'nails' | 'general' | 'progress_photo' | 'gina_text' | 'wardrobe' | 'public_dare';
  /**
   * Optional directive linkage. When the upload originates from a
   * specific Mommy-issued task (e.g. a wardrobe prescription, a
   * public dare with verification_kind='photo'), pass the kind + row
   * id so the verification photo can be linked back to it and
   * analyze-photo can route through a directive-aware path.
   */
  directiveKind?: 'wardrobe_prescription' | 'public_dare';
  directiveId?: string;
  onComplete?: (photoId?: string) => void;
}

export function PhotoVerificationUpload({ taskType = 'general', directiveKind, directiveId, onComplete }: PhotoVerificationUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    setError(null);
    setAnalysis(null);

    try {
      // Upload to Supabase storage. Bucket is private (migration 260) —
      // store the object path; render sites sign on demand.
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verification-photos')
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const photoPath = uploadData.path;

      // Insert verification_photos row (photo_url now holds the storage path,
      // signed on render). When this upload is linked to a wardrobe
      // prescription, persist the prescription_id on the photo row so the
      // fulfillment hook can find both halves.
      const { data: photoRow, error: insertError } = await supabase
        .from('verification_photos')
        .insert({
          user_id: user.id,
          task_type: taskType,
          photo_url: photoPath,
          caption: caption || null,
          prescription_id: directiveKind === 'wardrobe_prescription' ? (directiveId ?? null) : null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setUploading(false);
      setAnalyzing(true);

      // Call vision analysis endpoint. Send the path; the endpoint
      // downloads via service-role from the private bucket.
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch('/api/handler/analyze-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          photoId: photoRow.id,
          photoUrl: photoPath,
          taskType,
          caption,
          directiveKind,
          directiveId,
        }),
      });

      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`);
      const result = await res.json();
      setAnalysis(result.analysis);
      setAnalyzing(false);
      onComplete?.(photoRow.id as string | undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setUploading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div className="border border-purple-500/30 bg-purple-900/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-purple-300 text-sm font-medium">
        <Camera className="w-4 h-4" />
        Photo Verification ({taskType})
      </div>

      {!analysis && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption..."
            className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || analyzing}
            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
            ) : analyzing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Handler analyzing...</>
            ) : (
              <><Upload className="w-4 h-4" /> Submit photo</>
            )}
          </button>
        </>
      )}

      {error && (
        <div className="text-red-400 text-sm flex items-start gap-2">
          <X className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {analysis && (
        <div className="space-y-2">
          <div className="text-green-400 text-sm flex items-center gap-2">
            <Check className="w-4 h-4" />
            Handler analysis complete
          </div>
          <div className="text-sm text-protocol-text bg-black/30 rounded-lg p-3 whitespace-pre-wrap">
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
}
