// ============================================
// Fan Poll View
// Displays active polls, results, voting UI
// ============================================

import { useState, useEffect } from 'react';
import {
  BarChart3,
  Clock,
  Users,
  CheckCircle2,
  Loader2,
  Vote,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { FanPoll } from '../../types/cam';
import {
  getActivePolls,
  closePoll,
  getFanInfluenceStats,
} from '../../lib/content/fan-engine';

interface FanPollViewProps {
  compact?: boolean;
}

export function FanPollView({ compact = false }: FanPollViewProps) {
  const { user } = useAuth();

  const [polls, setPolls] = useState<FanPoll[]>([]);
  const [stats, setStats] = useState<{
    totalPolls: number;
    totalVotes: number;
    avgParticipation: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [activePolls, influenceStats] = await Promise.all([
          getActivePolls(user!.id),
          getFanInfluenceStats(user!.id),
        ]);
        setPolls(activePolls);
        setStats({
          totalPolls: influenceStats.totalPolls,
          totalVotes: influenceStats.totalVotes,
          avgParticipation: influenceStats.avgParticipation,
        });
      } catch (err) {
        console.error('Failed to load fan polls:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [user]);

  if (isLoading) {
    return compact ? null : (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  if (polls.length === 0 && compact) return null;

  return (
    <div className="space-y-4">
      {/* Stats header */}
      {!compact && stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Vote className="w-3.5 h-3.5" />} label="Active Polls" value={polls.length} />
          <StatCard icon={<Users className="w-3.5 h-3.5" />} label="Total Votes" value={stats.totalVotes} />
          <StatCard icon={<BarChart3 className="w-3.5 h-3.5" />} label="Avg Turnout" value={stats.avgParticipation} />
        </div>
      )}

      {/* Active polls */}
      {polls.length === 0 ? (
        <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface text-center">
          <p className="text-sm text-protocol-text-muted">No active polls</p>
        </div>
      ) : (
        polls.map(poll => (
          <PollCard
            key={poll.id}
            poll={poll}
            onClose={async () => {
              const closed = await closePoll(poll.id);
              if (closed) {
                setPolls(prev => prev.filter(p => p.id !== poll.id));
              }
            }}
          />
        ))
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl border border-protocol-border bg-protocol-surface text-center">
      <div className="flex justify-center text-protocol-text-muted mb-1">{icon}</div>
      <p className="text-lg font-mono text-protocol-text">{value}</p>
      <p className="text-[10px] text-protocol-text-muted">{label}</p>
    </div>
  );
}

function PollCard({ poll, onClose }: { poll: FanPoll; onClose: () => void }) {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);
  const totalWeighted = poll.options.reduce((sum, opt) => sum + opt.weightedVoteCount, 0);
  const isExpired = new Date(poll.votingClosesAt) < new Date();

  const timeLeft = getTimeLeft(poll.votingClosesAt);

  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface overflow-hidden">
      <div className="p-4">
        {/* Question */}
        <p className="text-sm font-medium text-protocol-text mb-3">
          {poll.question}
        </p>

        {/* Options with bars */}
        <div className="space-y-2">
          {poll.options.map(option => {
            const percentage = totalWeighted > 0
              ? (option.weightedVoteCount / totalWeighted) * 100
              : 0;
            const isLeading = totalWeighted > 0 &&
              option.weightedVoteCount === Math.max(...poll.options.map(o => o.weightedVoteCount));

            return (
              <div key={option.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs ${isLeading ? 'text-protocol-text font-medium' : 'text-protocol-text-muted'}`}>
                    {option.label}
                  </span>
                  <span className="text-[10px] text-protocol-text-muted">
                    {option.voteCount} vote{option.voteCount !== 1 ? 's' : ''} ({Math.round(percentage)}%)
                  </span>
                </div>
                <div className="h-1.5 bg-protocol-surface-light rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isLeading ? 'bg-purple-400' : 'bg-protocol-text-muted/30'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-protocol-border">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-protocol-text-muted">
              {totalVotes} total vote{totalVotes !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-protocol-text-muted" />
              <span className={`text-[10px] ${isExpired ? 'text-red-400' : 'text-protocol-text-muted'}`}>
                {isExpired ? 'Expired' : timeLeft}
              </span>
            </div>
          </div>
          {isExpired && (
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-[10px] font-medium hover:bg-purple-500/30 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              Close Poll
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeLeft(closesAt: string): string {
  const diff = new Date(closesAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours > 24) return `${Math.floor(hours / 24)}d left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}
