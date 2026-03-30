/**
 * ConditioningLibrary — Dashboard listing all Handler-generated conditioning scripts.
 *
 * Queries content_curriculum where creator='handler' and media_type='custom_handler'.
 * Items with audio_storage_url are playable inline via ConditioningPlayer.
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Loader2, FileText, AudioLines, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ConditioningPlayer } from './ConditioningPlayer';
import type { DbContentCurriculum } from '../../types/conditioning';

interface ConditioningLibraryProps {
  onBack: () => void;
}

export function ConditioningLibrary({ onBack }: ConditioningLibraryProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [items, setItems] = useState<DbContentCurriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<DbContentCurriculum | null>(null);

  // Fetch handler-generated conditioning scripts
  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('content_curriculum')
        .select('*')
        .eq('user_id', user.id)
        .eq('creator', 'handler')
        .eq('media_type', 'custom_handler')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setItems(data as DbContentCurriculum[]);
      }
      setLoading(false);
    };

    load();
  }, [user?.id]);

  const handlePlay = useCallback((item: DbContentCurriculum) => {
    setActiveItem(item);
  }, []);

  const handleComplete = useCallback(() => {
    setActiveItem(null);
  }, []);

  const handleClosePlayer = useCallback(() => {
    setActiveItem(null);
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '--';
    if (minutes < 1) return '<1m';
    return `${Math.round(minutes)}m`;
  };

  const getCategoryLabel = (cat: string) => cat.replace(/_/g, ' ');

  const getPhaseLabel = (phase: number | null) => {
    if (phase === null || phase === undefined) return null;
    return `Phase ${phase}`;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className={`p-2 rounded-xl transition-colors ${
            isBambiMode
              ? 'hover:bg-pink-100 text-pink-600'
              : 'hover:bg-gray-800 text-gray-400'
          }`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-white'
            }`}
          >
            Conditioning Library
          </h2>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-gray-500'
            }`}
          >
            {items.length} script{items.length !== 1 ? 's' : ''} generated
          </p>
        </div>
      </div>

      {/* Active player */}
      {activeItem && activeItem.audio_storage_url && (
        <ConditioningPlayer
          audioUrl={activeItem.audio_storage_url}
          title={activeItem.title}
          duration={(activeItem.duration_minutes ?? 5) * 60}
          onComplete={handleComplete}
          onClose={handleClosePlayer}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className={`w-6 h-6 animate-spin ${
              isBambiMode ? 'text-pink-400' : 'text-purple-400'
            }`}
          />
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div
          className={`rounded-2xl border p-8 text-center ${
            isBambiMode
              ? 'bg-pink-50 border-pink-200'
              : 'bg-gray-900 border-gray-800'
          }`}
        >
          <FileText
            className={`w-8 h-8 mx-auto mb-3 ${
              isBambiMode ? 'text-pink-300' : 'text-gray-600'
            }`}
          />
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-gray-500'
            }`}
          >
            No conditioning scripts generated yet. Sessions initiated through Handler
            conversation will appear here.
          </p>
        </div>
      )}

      {/* Script list */}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => {
            const hasAudio = !!item.audio_storage_url;
            const isActive = activeItem?.id === item.id;
            const phaseLabel = getPhaseLabel(item.conditioning_phase);

            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-all ${
                  isActive
                    ? isBambiMode
                      ? 'bg-pink-950/60 border-pink-600/40'
                      : 'bg-purple-950/40 border-purple-600/30'
                    : isBambiMode
                      ? 'bg-pink-50/80 border-pink-200 hover:border-pink-300'
                      : 'bg-gray-900/80 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Play button or status icon */}
                  <button
                    onClick={() => hasAudio && handlePlay(item)}
                    disabled={!hasAudio}
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      hasAudio
                        ? isBambiMode
                          ? 'bg-pink-600 hover:bg-pink-500 text-white'
                          : 'bg-purple-600 hover:bg-purple-500 text-white'
                        : isBambiMode
                          ? 'bg-pink-200 text-pink-400'
                          : 'bg-gray-800 text-gray-600'
                    }`}
                  >
                    {hasAudio ? (
                      <Play className="w-4 h-4 ml-0.5" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isBambiMode ? 'text-pink-700' : 'text-gray-200'
                      }`}
                    >
                      {item.title}
                    </p>

                    {/* Badges row */}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {phaseLabel && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            isBambiMode
                              ? 'bg-pink-200 text-pink-600'
                              : 'bg-purple-800/50 text-purple-300'
                          }`}
                        >
                          {phaseLabel}
                        </span>
                      )}
                      {item.conditioning_target && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            isBambiMode
                              ? 'bg-pink-100 text-pink-500'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {getCategoryLabel(item.conditioning_target)}
                        </span>
                      )}
                      {!hasAudio && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            isBambiMode
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-amber-900/30 text-amber-400'
                          }`}
                        >
                          {item.script_text ? (
                            <>
                              <FileText className="w-2.5 h-2.5" />
                              Script only
                            </>
                          ) : (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Generating audio...
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {item.duration_minutes && (
                        <span
                          className={`text-[10px] flex items-center gap-1 ${
                            isBambiMode ? 'text-pink-400' : 'text-gray-500'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(item.duration_minutes)}
                        </span>
                      )}
                      {hasAudio && (
                        <span
                          className={`text-[10px] flex items-center gap-1 ${
                            isBambiMode ? 'text-pink-400' : 'text-gray-500'
                          }`}
                        >
                          <AudioLines className="w-2.5 h-2.5" />
                          Audio ready
                        </span>
                      )}
                      <span
                        className={`text-[10px] ml-auto ${
                          isBambiMode ? 'text-pink-300' : 'text-gray-600'
                        }`}
                      >
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
