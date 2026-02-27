/**
 * PostingQueue — Timeline view of upcoming distributions.
 * Grouped by day. Copy caption, open platform, mark posted.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Calendar, CheckCircle2, Loader2,
  SkipForward,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getUpcomingDistributions,
  markManuallyPosted,
  batchMarkPosted,
  skipDistribution,
} from '../../lib/content-pipeline';
import { PostPackCard } from './PostPackCard';
import type { Distribution } from '../../types/content-pipeline';

interface PostingQueueProps {
  onBack: () => void;
}

function groupByDay(items: Distribution[]): Record<string, Distribution[]> {
  const groups: Record<string, Distribution[]> = {};
  for (const item of items) {
    const day = item.scheduled_at
      ? new Date(item.scheduled_at).toISOString().split('T')[0]
      : 'unscheduled';
    if (!groups[day]) groups[day] = [];
    groups[day].push(item);
  }
  return groups;
}

function formatDayLabel(dateStr: string): string {
  if (dateStr === 'unscheduled') return 'Unscheduled';
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

  if (dateStr === todayStr) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PostingQueue({ onBack }: PostingQueueProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getUpcomingDistributions(user.id);
    setDistributions(data);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleMarkPosted = async (id: string): Promise<boolean> => {
    const success = await markManuallyPosted(id);
    if (success) {
      setDistributions(prev => prev.filter(d => d.id !== id));
    }
    return success;
  };

  const handleSkip = async (id: string) => {
    const success = await skipDistribution(id);
    if (success) {
      setDistributions(prev => prev.filter(d => d.id !== id));
    }
  };

  const handleBatchPost = async (dayItems: Distribution[]) => {
    const ids = dayItems.map(d => d.id);
    const count = await batchMarkPosted(ids);
    if (count > 0) {
      setDistributions(prev => prev.filter(d => !ids.includes(d.id)));
    }
  };

  const grouped = groupByDay(distributions);
  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text}`}>Posting Queue</h1>
        </div>
        <div className={`flex items-center gap-1 ${muted} text-xs`}>
          <Calendar className="w-3.5 h-3.5" />
          {distributions.length} pending
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : distributions.length === 0 ? (
        <div className={`text-center py-20 ${muted}`}>
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Queue is empty. Generate a calendar first.</p>
        </div>
      ) : (
        <div className="px-4 space-y-6">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              {/* Day header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-bold ${text}`}>{formatDayLabel(day)}</h2>
                {items.length > 1 && (
                  <button
                    onClick={() => handleBatchPost(items)}
                    className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg ${
                      isBambiMode
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-protocol-accent/20 text-protocol-accent'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Mark all posted
                  </button>
                )}
              </div>

              {/* Distribution cards */}
              <div className="space-y-3">
                {items.map(dist => (
                  <div key={dist.id} className="relative">
                    <PostPackCard
                      distribution={dist}
                      onMarkPosted={handleMarkPosted}
                    />
                    {/* Skip button overlay */}
                    <button
                      onClick={() => handleSkip(dist.id)}
                      className={`absolute top-3 right-3 p-1 rounded-full ${
                        isBambiMode ? 'bg-gray-100 text-gray-400' : 'bg-protocol-bg text-protocol-text-muted'
                      }`}
                      title="Skip"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
