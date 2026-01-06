import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  uploadEvidence,
  getEvidenceByDate,
  deleteEvidence,
  Evidence,
  getEvidenceTypeFromMime
} from '../lib/evidence';
import { getTodayDate } from '../lib/protocol';
import {
  Camera,
  Mic,
  Square,
  X,
  Trash2,
  Image,
  Play,
  Pause,
  Upload,
  Loader2,
  CheckCircle
} from 'lucide-react';

interface EvidenceCaptureProps {
  domain?: string;
  taskId?: string;
  onClose?: () => void;
}

export function EvidenceCapture({ domain, taskId, onClose }: EvidenceCaptureProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<'photo' | 'voice' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    setError(null);

    try {
      const type = getEvidenceTypeFromMime(file.type);
      const result = await uploadEvidence(user.id, file, type, {
        date: getTodayDate(),
        domain,
        taskId
      });

      if (result) {
        setUploadSuccess(true);
        setTimeout(() => {
          setUploadSuccess(false);
          setMode(null);
          onClose?.();
        }, 1500);
      } else {
        setError('Failed to upload. Please try again.');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length > 0 && user) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const file = new File([audioBlob], `recording-${Date.now()}.webm`, {
            type: 'audio/webm'
          });

          setIsUploading(true);
          const result = await uploadEvidence(user.id, file, 'voice', {
            date: getTodayDate(),
            domain,
            taskId
          });

          if (result) {
            setUploadSuccess(true);
            setTimeout(() => {
              setUploadSuccess(false);
              setMode(null);
              onClose?.();
            }, 1500);
          } else {
            setError('Failed to save recording.');
          }
          setIsUploading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (err) {
      setError('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Success state
  if (uploadSuccess) {
    return (
      <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-success/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-protocol-success" />
          </div>
          <p className="text-protocol-text font-medium">Evidence saved!</p>
        </div>
      </div>
    );
  }

  // Recording mode
  if (mode === 'voice') {
    return (
      <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex flex-col items-center justify-center p-4">
        <button
          onClick={() => {
            if (isRecording) stopRecording();
            setMode(null);
          }}
          className="absolute top-4 right-4 p-2 rounded-lg bg-protocol-surface border border-protocol-border"
        >
          <X className="w-5 h-5 text-protocol-text" />
        </button>

        <div className="text-center">
          <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
            isRecording ? 'bg-protocol-danger/20 animate-pulse' : 'bg-protocol-surface'
          }`}>
            <Mic className={`w-10 h-10 ${isRecording ? 'text-protocol-danger' : 'text-protocol-text-muted'}`} />
          </div>

          <p className="text-3xl font-mono text-protocol-text mb-6">
            {formatTime(recordingTime)}
          </p>

          {error && (
            <p className="text-sm text-protocol-danger mb-4">{error}</p>
          )}

          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-protocol-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Saving...</span>
            </div>
          ) : isRecording ? (
            <button
              onClick={stopRecording}
              className="px-8 py-4 rounded-full bg-protocol-danger text-white font-medium flex items-center gap-2 mx-auto"
            >
              <Square className="w-5 h-5" />
              Stop Recording
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="px-8 py-4 rounded-full bg-protocol-accent text-white font-medium flex items-center gap-2 mx-auto"
            >
              <Mic className="w-5 h-5" />
              Start Recording
            </button>
          )}
        </div>
      </div>
    );
  }

  // Photo mode
  if (mode === 'photo') {
    return (
      <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex flex-col items-center justify-center p-4">
        <button
          onClick={() => setMode(null)}
          className="absolute top-4 right-4 p-2 rounded-lg bg-protocol-surface border border-protocol-border"
        >
          <X className="w-5 h-5 text-protocol-text" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-protocol-surface flex items-center justify-center">
            <Camera className="w-10 h-10 text-protocol-text-muted" />
          </div>

          {error && (
            <p className="text-sm text-protocol-danger mb-4">{error}</p>
          )}

          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-protocol-text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-8 py-4 rounded-lg bg-protocol-accent text-white font-medium flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                Take Photo
              </button>
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                  }
                }}
                className="w-full px-8 py-4 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text font-medium flex items-center justify-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Choose from Library
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mode selection
  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex flex-col items-center justify-center p-4">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-protocol-surface border border-protocol-border"
      >
        <X className="w-5 h-5 text-protocol-text" />
      </button>

      <h2 className="text-xl font-semibold text-protocol-text mb-2">Log Evidence</h2>
      <p className="text-sm text-protocol-text-muted mb-8">
        Capture your progress with photo or voice
      </p>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        <button
          onClick={() => setMode('photo')}
          className="p-6 rounded-lg bg-protocol-surface border border-protocol-border hover:border-protocol-accent transition-colors"
        >
          <Camera className="w-8 h-8 text-protocol-accent mx-auto mb-3" />
          <p className="text-protocol-text font-medium">Photo</p>
          <p className="text-xs text-protocol-text-muted mt-1">Take or upload</p>
        </button>

        <button
          onClick={() => setMode('voice')}
          className="p-6 rounded-lg bg-protocol-surface border border-protocol-border hover:border-protocol-accent transition-colors"
        >
          <Mic className="w-8 h-8 text-protocol-accent mx-auto mb-3" />
          <p className="text-protocol-text font-medium">Voice</p>
          <p className="text-xs text-protocol-text-muted mt-1">Record memo</p>
        </button>
      </div>
    </div>
  );
}

// Gallery component to view evidence
interface EvidenceGalleryProps {
  date?: string;
}

export function EvidenceGallery({ date }: EvidenceGalleryProps) {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (user) {
      loadEvidence();
    }
  }, [user, date]);

  const loadEvidence = async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getEvidenceByDate(user.id, date || getTodayDate());
    setEvidence(data);
    setIsLoading(false);
  };

  const handleDelete = async (evidenceId: string) => {
    if (!user) return;
    const success = await deleteEvidence(user.id, evidenceId);
    if (success) {
      setEvidence(prev => prev.filter(e => e.id !== evidenceId));
      setSelectedEvidence(null);
    }
  };

  const toggleAudio = (url: string) => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.src = url;
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="text-center py-8">
        <Image className="w-8 h-8 text-protocol-text-muted mx-auto mb-2" />
        <p className="text-sm text-protocol-text-muted">No evidence logged yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="hidden" />

      <div className="grid grid-cols-3 gap-2">
        {evidence.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedEvidence(item)}
            className="aspect-square rounded-lg overflow-hidden bg-protocol-surface border border-protocol-border relative"
          >
            {item.type === 'photo' ? (
              <img
                src={item.fileUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Mic className="w-6 h-6 text-protocol-text-muted" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Evidence detail modal */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-protocol-border">
            <p className="text-sm text-protocol-text-muted">
              {new Date(selectedEvidence.createdAt).toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDelete(selectedEvidence.id)}
                className="p-2 rounded-lg bg-protocol-danger/10 text-protocol-danger"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="p-2 rounded-lg bg-protocol-surface border border-protocol-border"
              >
                <X className="w-5 h-5 text-protocol-text" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            {selectedEvidence.type === 'photo' ? (
              <img
                src={selectedEvidence.fileUrl}
                alt=""
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-center">
                <button
                  onClick={() => toggleAudio(selectedEvidence.fileUrl)}
                  className="w-20 h-20 rounded-full bg-protocol-accent flex items-center justify-center mx-auto mb-4"
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 text-white" />
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>
                <p className="text-protocol-text-muted">Voice Recording</p>
              </div>
            )}
          </div>

          {selectedEvidence.notes && (
            <div className="p-4 border-t border-protocol-border">
              <p className="text-sm text-protocol-text">{selectedEvidence.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact button to add evidence (for use in task cards)
interface AddEvidenceButtonProps {
  domain?: string;
  taskId?: string;
}

export function AddEvidenceButton({ domain, taskId }: AddEvidenceButtonProps) {
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowCapture(true)}
        className="p-1.5 rounded-lg bg-protocol-surface-light hover:bg-protocol-accent/20 transition-colors"
        title="Log evidence"
      >
        <Camera className="w-4 h-4 text-protocol-text-muted" />
      </button>

      {showCapture && (
        <EvidenceCapture
          domain={domain}
          taskId={taskId}
          onClose={() => setShowCapture(false)}
        />
      )}
    </>
  );
}
