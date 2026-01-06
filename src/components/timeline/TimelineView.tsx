/**
 * Timeline View Component
 *
 * Main view for voice and photo timeline.
 * Shows comparisons, history, and progress.
 */

import { useState } from 'react';
import {
  ChevronLeft,
  Mic,
  Camera,
  Play,
  Pause,
  Calendar,
  TrendingUp,
  Plus,
  Loader2,
  Volume2,
  Image as ImageIcon,
  Images
} from 'lucide-react';
import { useTimeline } from '../../hooks/useTimeline';
import { VoiceRecorder } from './VoiceRecorder';
import { PhotoCapture } from './PhotoCapture';
import { PhotoGallery } from './PhotoGallery';
import type { PhotoCategory, VoiceEntry } from '../../types/timeline';
import {
  getCategoryLabel,
  getCategoryIcon,
  formatDuration,
  DEFAULT_PHRASE,
  getAllCategories,
} from '../../types/timeline';

interface TimelineViewProps {
  onBack: () => void;
  userName?: string;
}

type ViewMode = 'overview' | 'voice-record' | 'photo-capture' | 'voice-history' | 'photo-history' | 'gallery';

export function TimelineView({ onBack, userName }: TimelineViewProps) {
  const {
    voiceEntries,
    photoEntries,
    voiceComparison,
    photoComparison,
    settings,
    loading,
    uploading,
    currentWeek,
    currentDay,
    addVoiceEntry,
    addPhotoEntry,
  } = useTimeline();

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedPhotoCategory, setSelectedPhotoCategory] = useState<PhotoCategory>('face');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Get phrase with name substituted
  const phrase = (settings.defaultPhrase || DEFAULT_PHRASE).replace('{name}', userName || 'Maxy');

  const handleVoiceSave = async (blob: Blob, rating?: number, notes?: string) => {
    const entry = await addVoiceEntry(blob, phrase, rating, notes);
    if (entry) {
      setViewMode('overview');
    }
  };

  const handlePhotoSave = async (blob: Blob, rating?: number, notes?: string) => {
    const entry = await addPhotoEntry(blob, selectedPhotoCategory, rating, notes);
    if (entry) {
      setViewMode('overview');
    }
  };

  const playVoice = (entry: VoiceEntry) => {
    if (audioElement) {
      audioElement.pause();
    }

    if (playingVoiceId === entry.id) {
      setPlayingVoiceId(null);
      return;
    }

    const audio = new Audio(entry.audioUrl);
    audio.onended = () => setPlayingVoiceId(null);
    audio.play();
    setAudioElement(audio);
    setPlayingVoiceId(entry.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-protocol-accent animate-spin" />
      </div>
    );
  }

  // Recording views
  if (viewMode === 'voice-record') {
    return (
      <div className="min-h-screen p-4">
        <VoiceRecorder
          phrase={phrase}
          onSave={handleVoiceSave}
          onCancel={() => setViewMode('overview')}
          saving={uploading}
        />
      </div>
    );
  }

  if (viewMode === 'photo-capture') {
    return (
      <div className="min-h-screen p-4">
        <PhotoCapture
          category={selectedPhotoCategory}
          onSave={handlePhotoSave}
          onCancel={() => setViewMode('overview')}
          saving={uploading}
        />
      </div>
    );
  }

  if (viewMode === 'gallery') {
    return (
      <PhotoGallery
        photos={photoEntries}
        onBack={() => setViewMode('overview')}
      />
    );
  }

  // Get comparison data
  const faceComparison = photoComparison('face');
  const hasVoiceComparison = voiceComparison?.first && voiceComparison?.latest &&
    voiceComparison.first.id !== voiceComparison.latest.id;
  const hasPhotoComparison = faceComparison.first && faceComparison.latest &&
    faceComparison.first.id !== faceComparison.latest.id;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 p-4 border-b bg-protocol-bg border-protocol-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-protocol-surface text-protocol-text"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-protocol-text">
              Transformation Timeline
            </h1>
            <p className="text-sm text-protocol-text-muted">
              Week {currentWeek} • Day {currentDay}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Quick Add Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setViewMode('voice-record')}
            className="p-4 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-600/10 border border-pink-500/30 flex items-center gap-3 hover:from-pink-500/30 transition-all"
          >
            <div className="p-2 rounded-lg bg-pink-500/20">
              <Mic className="w-5 h-5 text-pink-400" />
            </div>
            <div className="text-left">
              <p className="font-medium text-protocol-text">Record Voice</p>
              <p className="text-xs text-protocol-text-muted">
                {voiceEntries.length} recordings
              </p>
            </div>
          </button>

          <button
            onClick={() => {
              setSelectedPhotoCategory('face');
              setViewMode('photo-capture');
            }}
            className="p-4 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 border border-purple-500/30 flex items-center gap-3 hover:from-purple-500/30 transition-all"
          >
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Camera className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-left">
              <p className="font-medium text-protocol-text">Take Photo</p>
              <p className="text-xs text-protocol-text-muted">
                {photoEntries.length} photos
              </p>
            </div>
          </button>
        </div>

        {/* Gallery Button */}
        {photoEntries.length > 0 && (
          <button
            onClick={() => setViewMode('gallery')}
            className="w-full p-4 rounded-xl bg-protocol-surface border border-protocol-border hover:border-protocol-accent/30 flex items-center gap-3 transition-all"
          >
            <div className="p-2 rounded-lg bg-protocol-surface-light">
              <Images className="w-5 h-5 text-protocol-accent" />
            </div>
            <div className="text-left flex-1">
              <p className="font-medium text-protocol-text">Photo Gallery</p>
              <p className="text-xs text-protocol-text-muted">
                Browse all {photoEntries.length} photos with filters
              </p>
            </div>
            <ChevronLeft className="w-5 h-5 text-protocol-text-muted rotate-180" />
          </button>
        )}

        {/* Voice Comparison */}
        {hasVoiceComparison && voiceComparison && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Volume2 className="w-5 h-5 text-pink-400" />
              <h3 className="font-semibold text-protocol-text">Voice Progress</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* First recording */}
              <div className="p-3 rounded-lg bg-protocol-surface/50">
                <p className="text-xs text-protocol-text-muted mb-2">Week 1</p>
                <button
                  onClick={() => playVoice(voiceComparison.first!)}
                  className="w-full py-3 rounded-lg bg-pink-500/20 flex items-center justify-center gap-2 hover:bg-pink-500/30 transition-colors"
                >
                  {playingVoiceId === voiceComparison.first!.id ? (
                    <Pause className="w-5 h-5 text-pink-400" />
                  ) : (
                    <Play className="w-5 h-5 text-pink-400" />
                  )}
                  <span className="text-sm text-pink-300">
                    {formatDuration(voiceComparison.first!.audioDuration)}
                  </span>
                </button>
              </div>

              {/* Latest recording */}
              <div className="p-3 rounded-lg bg-protocol-surface/50">
                <p className="text-xs text-protocol-text-muted mb-2">Week {currentWeek}</p>
                <button
                  onClick={() => playVoice(voiceComparison.latest!)}
                  className="w-full py-3 rounded-lg bg-pink-500/20 flex items-center justify-center gap-2 hover:bg-pink-500/30 transition-colors"
                >
                  {playingVoiceId === voiceComparison.latest!.id ? (
                    <Pause className="w-5 h-5 text-pink-400" />
                  ) : (
                    <Play className="w-5 h-5 text-pink-400" />
                  )}
                  <span className="text-sm text-pink-300">
                    {formatDuration(voiceComparison.latest!.audioDuration)}
                  </span>
                </button>
              </div>
            </div>

            <p className="text-xs text-protocol-text-muted text-center mt-3">
              {voiceEntries.length} recordings over {currentWeek} weeks
            </p>
          </div>
        )}

        {/* Photo Comparison */}
        {hasPhotoComparison && faceComparison && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-protocol-text">Visual Progress</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* First photo */}
              <div>
                <p className="text-xs text-protocol-text-muted mb-2 text-center">Week 1</p>
                <div className="aspect-square rounded-lg overflow-hidden bg-protocol-surface">
                  <img
                    src={faceComparison.first!.imageUrl}
                    alt="First"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Latest photo */}
              <div>
                <p className="text-xs text-protocol-text-muted mb-2 text-center">Week {currentWeek}</p>
                <div className="aspect-square rounded-lg overflow-hidden bg-protocol-surface">
                  <img
                    src={faceComparison.latest!.imageUrl}
                    alt="Latest"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-protocol-text-muted text-center mt-3">
              {photoEntries.length} photos over {currentWeek} weeks
            </p>
          </div>
        )}

        {/* Empty state */}
        {voiceEntries.length === 0 && photoEntries.length === 0 && (
          <div className="card p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-protocol-accent" />
            </div>
            <h3 className="text-lg font-semibold text-protocol-text mb-2">
              Start Your Timeline
            </h3>
            <p className="text-protocol-text-muted text-sm mb-6">
              Record your first voice sample and take your first photo.
              Watch yourself transform over time.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setViewMode('voice-record')}
                className="px-4 py-2 rounded-lg bg-pink-500/20 text-pink-300 font-medium hover:bg-pink-500/30 transition-colors"
              >
                Record Voice
              </button>
              <button
                onClick={() => {
                  setSelectedPhotoCategory('face');
                  setViewMode('photo-capture');
                }}
                className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 font-medium hover:bg-purple-500/30 transition-colors"
              >
                Take Photo
              </button>
            </div>
          </div>
        )}

        {/* Photo Categories */}
        <div className="card p-4">
          <h3 className="font-semibold text-protocol-text mb-3">Photo Categories</h3>

          {/* Standard Categories */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {getAllCategories().standard.map(cat => {
              const count = photoEntries.filter(p => p.category === cat).length;
              const comparison = photoComparison(cat);
              const latestPhoto = comparison.latest;

              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedPhotoCategory(cat);
                    setViewMode('photo-capture');
                  }}
                  className="p-3 rounded-lg bg-protocol-surface/50 hover:bg-protocol-surface flex items-center gap-3 transition-colors"
                >
                  {latestPhoto ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden">
                      <img
                        src={latestPhoto.imageUrl}
                        alt={getCategoryLabel(cat)}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-protocol-border flex items-center justify-center text-xl">
                      {getCategoryIcon(cat)}
                    </div>
                  )}
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-protocol-text">
                      {getCategoryLabel(cat)}
                    </p>
                    <p className="text-xs text-protocol-text-muted">
                      {count} {count === 1 ? 'photo' : 'photos'}
                    </p>
                  </div>
                  <Plus className="w-4 h-4 text-protocol-text-muted" />
                </button>
              );
            })}
          </div>

          {/* Intimate Categories */}
          <div className="pt-3 border-t border-protocol-border">
            <p className="text-xs text-protocol-text-muted mb-2 flex items-center gap-1">
              <span>Intimate Categories</span>
              <span className="text-pink-400">- Private</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {getAllCategories().intimate.map(cat => {
                const count = photoEntries.filter(p => p.category === cat).length;
                const comparison = photoComparison(cat);
                const latestPhoto = comparison.latest;

                return (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedPhotoCategory(cat);
                      setViewMode('photo-capture');
                    }}
                    className="p-2 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/20 flex flex-col items-center gap-1 transition-colors"
                  >
                    {latestPhoto ? (
                      <div className="w-8 h-8 rounded-lg overflow-hidden">
                        <img
                          src={latestPhoto.imageUrl}
                          alt={getCategoryLabel(cat)}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <span className="text-xl">{getCategoryIcon(cat)}</span>
                    )}
                    <span className="text-xs text-protocol-text">{getCategoryLabel(cat)}</span>
                    {count > 0 && (
                      <span className="text-xs text-pink-400">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent Voice Recordings */}
        {voiceEntries.length > 0 && (
          <div className="card p-4">
            <h3 className="font-semibold text-protocol-text mb-3">Recent Recordings</h3>
            <div className="space-y-2">
              {voiceEntries.slice(0, 5).map(entry => (
                <button
                  key={entry.id}
                  onClick={() => playVoice(entry)}
                  className="w-full p-3 rounded-lg bg-protocol-surface/50 hover:bg-protocol-surface flex items-center gap-3 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-pink-500/20">
                    {playingVoiceId === entry.id ? (
                      <Pause className="w-4 h-4 text-pink-400" />
                    ) : (
                      <Play className="w-4 h-4 text-pink-400" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm text-protocol-text">
                      Week {entry.weekNumber} Recording
                    </p>
                    <p className="text-xs text-protocol-text-muted">
                      {formatDuration(entry.audioDuration)}
                      {entry.rating && ` • ${entry.rating}/5`}
                    </p>
                  </div>
                  <span className="text-xs text-protocol-text-muted">
                    {new Date(entry.recordedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Reminder */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-protocol-border">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-5 h-5 text-protocol-accent" />
            <span className="text-sm font-medium text-protocol-text">Weekly Progress</span>
          </div>
          <p className="text-sm text-protocol-text-muted">
            Record weekly for best comparison. Consistency reveals transformation.
          </p>
        </div>
      </div>
    </div>
  );
}
