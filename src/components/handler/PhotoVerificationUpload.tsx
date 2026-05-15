import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Video, Mic, Upload, Loader2, Check, X, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type MediaKind = 'photo' | 'video' | 'audio' | 'any';

interface PhotoVerificationUploadProps {
  taskType?:
    | 'outfit' | 'mirror_check' | 'pose' | 'makeup' | 'nails' | 'general'
    | 'progress_photo' | 'gina_text' | 'wardrobe' | 'public_dare'
    | 'cum_worship' | 'voice_evidence' | 'video_evidence';
  /**
   * What kind of media this submission expects. Drives the file-picker
   * accept attribute, the OS capture mode, and whether analyze-photo
   * runs. 'any' lets the user pick. Defaults to 'photo' for backward
   * compatibility with existing call sites.
   */
  mediaKind?: MediaKind;
  /**
   * Optional directive linkage. When the upload originates from a
   * specific Mommy-issued task (e.g. a wardrobe prescription, a
   * public dare with verification_kind='photo'), pass the kind + row
   * id so the verification photo can be linked back to it and
   * analyze-photo can route through a directive-aware path.
   */
  directiveKind?: 'wardrobe_prescription' | 'public_dare';
  directiveId?: string;
  /**
   * When the upload is the photo half of an inline reply to an outreach
   * card, pass the outreach id so the saved verification_photos row gets
   * source_outreach_id stamped on it and the outreach reply API can
   * link both halves.
   */
  sourceOutreachId?: string;
  onComplete?: (photoId?: string, photoPath?: string) => void;
}

function acceptForKind(kind: MediaKind): string {
  switch (kind) {
    case 'video': return 'video/*';
    case 'audio': return 'audio/*';
    case 'photo': return 'image/*';
    case 'any':   return 'image/*,video/*,audio/*';
  }
}

function captureForKind(kind: MediaKind): 'user' | 'environment' | undefined {
  switch (kind) {
    case 'video': return 'user';        // selfie cam for "record yourself saying X"
    case 'photo': return 'environment'; // rear cam for outfit/mirror
    case 'audio': return undefined;     // OS recorder sheet
    case 'any':   return undefined;
  }
}

function mediaTypeFromFile(file: File): 'photo' | 'video' | 'audio' {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'photo';
}

function labelForKind(kind: MediaKind): string {
  switch (kind) {
    case 'video': return 'Record video';
    case 'audio': return 'Record audio';
    case 'photo': return 'Submit photo';
    case 'any':   return 'Submit media';
  }
}

function iconForKind(kind: MediaKind) {
  switch (kind) {
    case 'video': return Video;
    case 'audio': return Mic;
    default:      return Camera;
  }
}

export function PhotoVerificationUpload({
  taskType = 'general',
  mediaKind = 'photo',
  directiveKind,
  directiveId,
  sourceOutreachId,
  onComplete,
}: PhotoVerificationUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  // Cleanup any open media tracks on unmount.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!user?.id) return;
    setUploading(true);
    setError(null);
    setAnalysis(null);

    try {
      const fileExt = (file.name.split('.').pop() || extFromMime(file.type)) || 'bin';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('verification-photos')
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (uploadError) throw uploadError;

      const photoPath = uploadData.path;
      const mt = mediaTypeFromFile(file);

      const { data: photoRow, error: insertError } = await supabase
        .from('verification_photos')
        .insert({
          user_id: user.id,
          task_type: taskType,
          photo_url: photoPath,
          media_type: mt,
          caption: caption || null,
          prescription_id: directiveKind === 'wardrobe_prescription' ? (directiveId ?? null) : null,
          source_outreach_id: sourceOutreachId ?? null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setUploading(false);

      // Vision analysis only makes sense for images. Video + audio go
      // through the verification_photos row and Mama scores them later
      // (or transcription/vision pipelines pick them up async).
      if (mt === 'photo') {
        setAnalyzing(true);
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
      } else {
        // For video/audio, surface a confirmation line without LLM grading.
        setAnalysis(mt === 'video'
          ? "Mama's got the video, sweet thing. She'll watch it soon."
          : "Mama's got the recording. She'll listen when she's ready.");
      }

      onComplete?.(photoRow.id as string | undefined, photoPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setUploading(false);
      setAnalyzing(false);
    }
  }, [user?.id, taskType, caption, directiveKind, directiveId, sourceOutreachId, onComplete]);

  // MediaRecorder path — only used for audio kind. Video uses OS capture
  // (input file picker with capture="user") which is the most reliable
  // mobile camera path; audio recording in-browser is well-supported
  // and avoids the OS file-picker UX feeling wrong for short recordings.
  const startAudioRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedDuration(Math.round((Date.now() - startedAtRef.current) / 1000));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      startedAtRef.current = Date.now();
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      setError((err as Error).message || 'microphone access denied');
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const submitRecorded = useCallback(async () => {
    if (!recordedBlob) return;
    const ext = recordedBlob.type.includes('webm') ? 'webm'
              : recordedBlob.type.includes('mp4') ? 'm4a'
              : 'webm';
    const file = new File([recordedBlob], `recording-${Date.now()}.${ext}`, { type: recordedBlob.type });
    await handleFileSelect(file);
    setRecordedBlob(null);
  }, [recordedBlob, handleFileSelect]);

  const Icon = iconForKind(mediaKind);
  const labelKind = mediaKind === 'audio' ? 'Audio'
                  : mediaKind === 'video' ? 'Video'
                  : mediaKind === 'any' ? 'Media'
                  : 'Photo';

  return (
    <div className="border border-purple-500/30 bg-purple-900/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-purple-300 text-sm font-medium">
        <Icon className="w-4 h-4" />
        {labelKind} Verification ({taskType})
      </div>

      {!analysis && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptForKind(mediaKind)}
            capture={captureForKind(mediaKind)}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelect(file);
            }}
          />
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Optional caption..."
            className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white"
          />

          {/* Audio kind: in-browser MediaRecorder. Other kinds: OS picker. */}
          {mediaKind === 'audio' ? (
            <div className="space-y-2">
              {!recordedBlob && !recording && (
                <button
                  onClick={() => void startAudioRecording()}
                  disabled={uploading || analyzing}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Mic className="w-4 h-4" /> Start recording
                </button>
              )}
              {recording && (
                <button
                  onClick={stopAudioRecording}
                  className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" /> Stop ({Math.round((Date.now() - startedAtRef.current) / 1000)}s)
                </button>
              )}
              {recordedBlob && !recording && (
                <div className="space-y-2">
                  <div className="text-xs text-purple-300/80">
                    Recorded {recordedDuration}s. Listen back, then send.
                  </div>
                  <audio controls src={URL.createObjectURL(recordedBlob)} className="w-full" />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRecordedBlob(null); setRecordedDuration(0); }}
                      disabled={uploading || analyzing}
                      className="flex-1 py-2.5 rounded-lg bg-[#141414] hover:bg-gray-800 text-gray-300 text-sm disabled:opacity-50"
                    >
                      Re-record
                    </button>
                    <button
                      onClick={() => void submitRecorded()}
                      disabled={uploading || analyzing}
                      className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>) : <>Send to Mama</>}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || analyzing || recording}
                className="w-full py-2 rounded-lg bg-transparent border border-purple-500/30 hover:bg-purple-900/30 text-purple-300 text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                ...or pick an existing audio file
              </button>
            </div>
          ) : (
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
                <><Upload className="w-4 h-4" /> {labelForKind(mediaKind)}</>
              )}
            </button>
          )}
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
            {mediaKind === 'photo' || mediaKind === 'any'
              ? 'Handler analysis complete'
              : 'Submitted'}
          </div>
          <div className="text-sm text-protocol-text bg-black/30 rounded-lg p-3 whitespace-pre-wrap">
            {analysis}
          </div>
        </div>
      )}
    </div>
  );
}

function extFromMime(mime: string): string {
  if (mime.startsWith('image/jpeg')) return 'jpg';
  if (mime.startsWith('image/png')) return 'png';
  if (mime.startsWith('image/webp')) return 'webp';
  if (mime.startsWith('image/heic')) return 'heic';
  if (mime.startsWith('video/mp4')) return 'mp4';
  if (mime.startsWith('video/quicktime')) return 'mov';
  if (mime.startsWith('video/webm')) return 'webm';
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.startsWith('audio/mpeg')) return 'mp3';
  if (mime.startsWith('audio/wav')) return 'wav';
  return 'bin';
}
