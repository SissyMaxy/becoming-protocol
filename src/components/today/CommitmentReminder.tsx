/**
 * CommitmentReminder Component
 * Shows active (unhonored) commitments extracted during arousal sessions
 */

import { useState, useEffect } from 'react';
import { AlertCircle, Check, X, Clock, Flame, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useBambiMode } from '../../context/BambiModeContext';

interface Commitment {
  id: string;
  commitmentText: string;
  extractedDuring: string;
  arousalLevel: number;
  denialDay: number;
  createdAt: string;
}

interface CommitmentReminderProps {
  onHonor?: (commitmentId: string) => void;
  onDismiss?: (commitmentId: string) => void;
  onQuickStart?: (commitmentId: string, commitmentText: string) => void;
  maxDisplay?: number;
}

export function CommitmentReminder({
  onHonor,
  onDismiss,
  onQuickStart,
  maxDisplay = 3,
}: CommitmentReminderProps) {
  const { isBambiMode } = useBambiMode();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [honoringId, setHonoringId] = useState<string | null>(null);

  // Fetch unhonored commitments
  useEffect(() => {
    async function fetchCommitments() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try v2 commitments table first
        const { data, error } = await supabase
          .from('commitments_v2')
          .select('*')
          .eq('user_id', user.id)
          .eq('honored', false)
          .eq('broken', false)
          .order('created_at', { ascending: false })
          .limit(maxDisplay);

        if (error) {
          console.error('Error fetching commitments:', error);
          return;
        }

        setCommitments((data || []).map(row => ({
          id: row.id,
          commitmentText: row.commitment_text,
          extractedDuring: row.extracted_during,
          arousalLevel: row.arousal_level,
          denialDay: row.denial_day,
          createdAt: row.created_at,
        })));
      } catch (err) {
        console.error('Error in fetchCommitments:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCommitments();
  }, [maxDisplay]);

  // Honor a commitment
  const handleHonor = async (commitmentId: string) => {
    setHonoringId(commitmentId);
    try {
      const { error } = await supabase
        .from('commitments_v2')
        .update({
          honored: true,
          honored_at: new Date().toISOString(),
        })
        .eq('id', commitmentId);

      if (error) throw error;

      // Remove from local state
      setCommitments(prev => prev.filter(c => c.id !== commitmentId));
      onHonor?.(commitmentId);
    } catch (err) {
      console.error('Error honoring commitment:', err);
    } finally {
      setHonoringId(null);
    }
  };

  // Dismiss (break) a commitment
  const handleDismiss = async (commitmentId: string) => {
    try {
      const { error } = await supabase
        .from('commitments_v2')
        .update({
          broken: true,
          broken_reason: 'Dismissed from Today View',
        })
        .eq('id', commitmentId);

      if (error) throw error;

      // Remove from local state
      setCommitments(prev => prev.filter(c => c.id !== commitmentId));
      onDismiss?.(commitmentId);
    } catch (err) {
      console.error('Error dismissing commitment:', err);
    }
  };

  // Format time ago
  const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  // Get arousal indicator
  const getArousalIndicator = (level: number) => {
    if (level >= 4) return { text: 'Peak arousal', color: 'rose' };
    if (level >= 3) return { text: 'High arousal', color: 'orange' };
    return { text: 'Aroused', color: 'amber' };
  };

  if (isLoading || commitments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <AlertCircle className={`w-4 h-4 ${
          isBambiMode ? 'text-amber-500' : 'text-amber-400'
        }`} />
        <span className={`text-xs uppercase tracking-wider font-semibold ${
          isBambiMode ? 'text-amber-600' : 'text-amber-400'
        }`}>
          Commitments to Honor
        </span>
        <span className={`text-xs ${
          isBambiMode ? 'text-amber-500' : 'text-amber-500/70'
        }`}>
          ({commitments.length})
        </span>
      </div>

      {/* Commitment cards */}
      {commitments.map(commitment => {
        const arousal = getArousalIndicator(commitment.arousalLevel);

        return (
          <div
            key={commitment.id}
            className={`p-4 rounded-xl ${
              isBambiMode
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-amber-900/20 border border-amber-700/30'
            }`}
          >
            {/* Commitment text */}
            <p className={`font-medium mb-2 ${
              isBambiMode ? 'text-amber-800' : 'text-amber-200'
            }`}>
              "{commitment.commitmentText}"
            </p>

            {/* Context framing: when, where, state (gap #24) */}
            <div className={`text-xs mb-2 ${
              isBambiMode ? 'text-amber-600' : 'text-amber-400/80'
            }`}>
              Made on {new Date(commitment.createdAt).toLocaleDateString()} during {commitment.extractedDuring?.replace(/_/g, ' ') || 'a session'}
              {commitment.arousalLevel > 0 && ` · Arousal level ${commitment.arousalLevel}/5`}
              {commitment.denialDay > 0 && ` · Denial day ${commitment.denialDay}`}
            </div>

            {/* Meta info */}
            <div className="flex items-center gap-3 mb-3">
              <div className={`flex items-center gap-1 text-xs ${
                arousal.color === 'rose'
                  ? isBambiMode ? 'text-rose-600' : 'text-rose-400'
                  : arousal.color === 'orange'
                    ? isBambiMode ? 'text-orange-600' : 'text-orange-400'
                    : isBambiMode ? 'text-amber-600' : 'text-amber-400'
              }`}>
                <Flame className="w-3 h-3" />
                {arousal.text}
              </div>
              <div className={`flex items-center gap-1 text-xs ${
                isBambiMode ? 'text-amber-500' : 'text-amber-500/70'
              }`}>
                <Clock className="w-3 h-3" />
                {formatTimeAgo(commitment.createdAt)}
              </div>
            </div>

            {/* Actions with Quick Start (gap #25) */}
            <div className="flex gap-2">
              {onQuickStart && (
                <button
                  onClick={() => onQuickStart(commitment.id, commitment.commitmentText)}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                    isBambiMode
                      ? 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                      : 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-400'
                  }`}
                >
                  <Play className="w-4 h-4" />
                  2 min start
                </button>
              )}
              <button
                onClick={() => handleHonor(commitment.id)}
                disabled={honoringId === commitment.id}
                className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                    : 'bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400'
                } ${honoringId === commitment.id ? 'opacity-50' : ''}`}
              >
                <Check className="w-4 h-4" />
                Honored
              </button>
              <button
                onClick={() => handleDismiss(commitment.id)}
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1 text-sm transition-colors ${
                  isBambiMode
                    ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Handler message about commitments */}
      <p className={`text-xs px-1 italic ${
        isBambiMode ? 'text-amber-500' : 'text-amber-500/70'
      }`}>
        Aroused you made these commitments. Honor them.
      </p>
    </div>
  );
}
