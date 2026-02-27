/**
 * ContentCapture — Camera/file capture → tag → save to vault.
 * Target: capture → tag → save in 15 seconds.
 */

import { useState, useRef } from 'react';
import {
  Camera, Video, Mic, FileText, Upload, X, Check,
  ChevronLeft, Loader2, Eye, EyeOff, Tag,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { uploadCaptureMedia, getMediaTypeFromFile } from '../../lib/content/auto-capture';
import { addToVault } from '../../lib/content-pipeline/vault';
import type { Platform } from '../../types/content-pipeline';

interface ContentCaptureProps {
  onBack: () => void;
  taskContext?: {
    taskId: string;
    domain?: string;
    captureType?: string;
    capturePrompt?: string;
  };
}

type CaptureMode = 'photo' | 'video' | 'voice' | 'screenshot' | 'file';

const CAPTURE_MODES: { mode: CaptureMode; icon: typeof Camera; label: string }[] = [
  { mode: 'photo', icon: Camera, label: 'Photo' },
  { mode: 'video', icon: Video, label: 'Video' },
  { mode: 'voice', icon: Mic, label: 'Voice' },
  { mode: 'screenshot', icon: FileText, label: 'Screenshot' },
  { mode: 'file', icon: Upload, label: 'File' },
];

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'twitter', label: 'Twitter' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'onlyfans', label: 'OnlyFans' },
  { id: 'fansly', label: 'Fansly' },
];

const TIERS = ['free', 'paid', 'ppv', 'exclusive'] as const;

export function ContentCapture({ onBack, taskContext }: ContentCaptureProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'capture' | 'tag' | 'saving' | 'done'>('capture');
  const [selectedMode, setSelectedMode] = useState<CaptureMode>(
    (taskContext?.captureType as CaptureMode) || 'photo'
  );
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Tagging state
  const [tier, setTier] = useState('free');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [explicitness, setExplicitness] = useState(0);
  const [faceVisible, setFaceVisible] = useState(false);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStep('tag');
  };

  const handleCapture = () => {
    if (!fileRef.current) return;

    const accept = selectedMode === 'photo' || selectedMode === 'screenshot'
      ? 'image/*'
      : selectedMode === 'video'
        ? 'video/*'
        : selectedMode === 'voice'
          ? 'audio/*'
          : '*/*';

    fileRef.current.accept = accept;

    if (selectedMode === 'photo') {
      fileRef.current.capture = 'environment';
    } else {
      fileRef.current.removeAttribute('capture');
    }

    fileRef.current.click();
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  const handleSave = async () => {
    if (!file || !user) return;
    setIsSaving(true);
    setStep('saving');

    const mediaUrl = await uploadCaptureMedia(user.id, file);
    if (!mediaUrl) {
      setIsSaving(false);
      setStep('tag');
      return;
    }

    const mediaType = getMediaTypeFromFile(file);
    await addToVault(user.id, {
      media_url: mediaUrl,
      media_type: mediaType,
      source_type: taskContext ? 'task' : 'spontaneous',
      source_task_id: taskContext?.taskId,
      capture_context: taskContext?.capturePrompt || caption,
      tags: [...tags, tier],
      caption_draft: caption || undefined,
      face_visible: faceVisible,
      auto_captured: !!taskContext,
      domain: taskContext?.domain,
      platforms: selectedPlatforms,
      file_size_bytes: file.size,
    });

    setIsSaving(false);
    setStep('done');
  };

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const accent = isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white';
  const accentHover = isBambiMode ? 'hover:bg-pink-600' : 'hover:bg-protocol-accent-soft';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={onBack} className={muted}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className={`text-lg font-bold ${text}`}>Content Capture</h1>
      </div>

      <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />

      {/* Step: Capture */}
      {step === 'capture' && (
        <div className="px-4 space-y-4">
          {taskContext && (
            <div className={`p-3 rounded-lg border ${card} ${muted} text-sm`}>
              {taskContext.capturePrompt || 'Capture content for this task'}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {CAPTURE_MODES.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${
                  selectedMode === mode
                    ? isBambiMode
                      ? 'border-pink-400 bg-pink-50'
                      : 'border-protocol-accent bg-protocol-accent/10'
                    : `${card}`
                }`}
              >
                <Icon className={`w-6 h-6 ${selectedMode === mode
                  ? isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                  : muted
                }`} />
                <span className={`text-xs font-medium ${text}`}>{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleCapture}
            className={`w-full py-4 rounded-xl font-bold text-lg ${accent} ${accentHover} transition-colors`}
          >
            {selectedMode === 'photo' ? 'Open Camera' : `Select ${selectedMode}`}
          </button>
        </div>
      )}

      {/* Step: Tag */}
      {step === 'tag' && previewUrl && (
        <div className="px-4 space-y-4">
          {/* Preview */}
          <div className="relative rounded-xl overflow-hidden border border-gray-200 max-h-48">
            {file?.type.startsWith('video/') ? (
              <video src={previewUrl} className="w-full max-h-48 object-cover" />
            ) : file?.type.startsWith('audio/') ? (
              <div className={`flex items-center justify-center h-24 ${card}`}>
                <Mic className={`w-8 h-8 ${muted}`} />
              </div>
            ) : (
              <img src={previewUrl} alt="" className="w-full max-h-48 object-cover" />
            )}
            <button
              onClick={() => { setFile(null); setPreviewUrl(null); setStep('capture'); }}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tier */}
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Content Tier</label>
            <div className="flex gap-2">
              {TIERS.map(t => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    tier === t
                      ? isBambiMode ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
                      : `${card} ${muted}`
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Platforms</label>
            <div className="flex gap-2 flex-wrap">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedPlatforms.includes(p.id)
                      ? isBambiMode ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-blue-900/20 border-blue-600 text-blue-400'
                      : `${card} ${muted}`
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Explicitness + Face */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={`text-xs font-medium ${muted} mb-1 block`}>
                Explicitness: {explicitness}
              </label>
              <input
                type="range"
                min={0}
                max={5}
                value={explicitness}
                onChange={e => setExplicitness(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <button
              onClick={() => setFaceVisible(!faceVisible)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium ${
                faceVisible
                  ? isBambiMode ? 'bg-red-100 border-red-300 text-red-700' : 'bg-red-900/20 border-red-600 text-red-400'
                  : `${card} ${muted}`
              }`}
            >
              {faceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Face
            </button>
          </div>

          {/* Caption */}
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Caption</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Handler will generate if left blank..."
              rows={2}
              className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
            />
          </div>

          {/* Tags */}
          <div>
            <label className={`text-xs font-medium ${muted} mb-1 block`}>Tags</label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag..."
                className={`flex-1 px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
              />
              <button onClick={addTag} className={`p-2 rounded-lg ${accent}`}>
                <Tag className="w-4 h-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(t => (
                  <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${
                    isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-protocol-border text-protocol-text-muted'
                  }`}>
                    {t}
                    <button onClick={() => setTags(prev => prev.filter(x => x !== t))} className="ml-1">
                      <X className="w-3 h-3 inline" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full py-3 rounded-xl font-bold ${accent} ${accentHover} transition-colors disabled:opacity-50`}
          >
            Save to Vault
          </button>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className={`w-8 h-8 animate-spin ${muted}`} />
          <p className={`text-sm ${muted}`}>Uploading & classifying...</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isBambiMode ? 'bg-green-100' : 'bg-emerald-900/20'
          }`}>
            <Check className={`w-8 h-8 ${
              isBambiMode ? 'text-green-600' : 'text-emerald-400'
            }`} />
          </div>
          <p className={`text-sm font-medium ${text}`}>Saved to vault</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setFile(null); setPreviewUrl(null); setStep('capture'); setTags([]); setCaption(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${card} border ${text}`}
            >
              Capture Another
            </button>
            <button
              onClick={onBack}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${accent}`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
