/**
 * CommitmentDashboard
 *
 * Implements v2 Part 6.2: Commitment Tracking
 * Displays arousal-extracted commitments with context and honor/dismiss actions
 */

import { useState, useMemo } from 'react';
import {
  Heart,
  Check,
  X,
  AlertTriangle,
  Clock,
  Flame,
  ChevronDown,
  ChevronUp,
  Award,
  Ban,
} from 'lucide-react';
import { useCommitments, type Commitment } from '../../hooks/useRatchetSystem';

interface CommitmentDashboardProps {
  showPendingOnly?: boolean;
  maxItems?: number;
  compact?: boolean;
  className?: string;
}

const EXTRACTION_LABELS: Record<Commitment['extractedDuring'], { label: string; icon: typeof Flame; color: string }> = {
  edge_session: { label: 'Edge Session', icon: Flame, color: 'text-red-400' },
  goon_session: { label: 'Goon Session', icon: Flame, color: 'text-purple-400' },
  hypno: { label: 'Hypno Session', icon: Heart, color: 'text-pink-400' },
  post_arousal: { label: 'Post-Arousal', icon: Clock, color: 'text-amber-400' },
  vulnerability_window: { label: 'Vulnerability Window', icon: AlertTriangle, color: 'text-cyan-400' },
};

export function CommitmentDashboard({
  showPendingOnly = false,
  maxItems,
  compact = false,
  className = '',
}: CommitmentDashboardProps) {
  const {
    commitments,
    pendingCommitments,
    honoredCommitments,
    brokenCommitments,
    isLoading,
    honorCommitment,
    breakCommitment,
  } = useCommitments();

  const [filter, setFilter] = useState<'all' | 'pending' | 'honored' | 'broken'>(
    showPendingOnly ? 'pending' : 'all'
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBreakModal, setShowBreakModal] = useState<string | null>(null);

  const displayCommitments = useMemo(() => {
    let result: Commitment[];
    switch (filter) {
      case 'pending':
        result = pendingCommitments;
        break;
      case 'honored':
        result = honoredCommitments;
        break;
      case 'broken':
        result = brokenCommitments;
        break;
      default:
        result = commitments;
    }
    if (maxItems) {
      result = result.slice(0, maxItems);
    }
    return result;
  }, [filter, commitments, pendingCommitments, honoredCommitments, brokenCommitments, maxItems]);

  // Stats
  const stats = useMemo(() => ({
    total: commitments.length,
    pending: pendingCommitments.length,
    honored: honoredCommitments.length,
    broken: brokenCommitments.length,
    honorRate: commitments.length > 0
      ? Math.round((honoredCommitments.length / (honoredCommitments.length + brokenCommitments.length || 1)) * 100)
      : 0,
  }), [commitments, pendingCommitments, honoredCommitments, brokenCommitments]);

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-20 bg-protocol-surface rounded-xl mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-protocol-surface rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between p-4 bg-protocol-surface rounded-xl border border-protocol-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Heart className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-protocol-text font-semibold">{stats.pending} Pending</p>
              <p className="text-protocol-text-muted text-xs">
                {stats.honored} honored • {stats.honorRate}% rate
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-protocol-text text-2xl font-bold">{stats.total}</p>
            <p className="text-protocol-text-muted text-xs">total</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Stats Header */}
      <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 rounded-xl p-6 mb-4 border border-amber-500/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-amber-400/80 text-sm font-medium">Arousal Commitments</p>
            <p className="text-white text-2xl font-bold mt-1">
              {stats.total} Made • {stats.pending} Pending
            </p>
          </div>
          <div className="text-right">
            <p className="text-amber-400 text-3xl font-bold">{stats.honorRate}%</p>
            <p className="text-amber-400/60 text-xs">Honor Rate</p>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatBox
            icon={<Clock className="w-4 h-4" />}
            label="Pending"
            value={stats.pending}
            color="text-amber-400"
          />
          <StatBox
            icon={<Check className="w-4 h-4" />}
            label="Honored"
            value={stats.honored}
            color="text-green-400"
          />
          <StatBox
            icon={<X className="w-4 h-4" />}
            label="Broken"
            value={stats.broken}
            color="text-red-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['all', 'pending', 'honored', 'broken'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-protocol-accent text-white'
                : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-text'
            }`}
          >
            {f === 'all' && 'All'}
            {f === 'pending' && `Pending (${stats.pending})`}
            {f === 'honored' && `Honored (${stats.honored})`}
            {f === 'broken' && `Broken (${stats.broken})`}
          </button>
        ))}
      </div>

      {/* Commitments List */}
      {displayCommitments.length === 0 ? (
        <div className="text-center py-8">
          <Heart className="w-12 h-12 text-protocol-text-muted mx-auto mb-3" />
          <p className="text-protocol-text-muted">
            {filter === 'pending' && 'No pending commitments'}
            {filter === 'honored' && 'No honored commitments yet'}
            {filter === 'broken' && 'No broken commitments'}
            {filter === 'all' && 'No commitments made yet'}
          </p>
          <p className="text-protocol-text-muted text-sm mt-1">
            Commitments are extracted during high-arousal moments
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayCommitments.map((commitment) => (
            <CommitmentCard
              key={commitment.id}
              commitment={commitment}
              expanded={expandedId === commitment.id}
              onToggle={() => setExpandedId(expandedId === commitment.id ? null : commitment.id)}
              onHonor={() => honorCommitment(commitment.id)}
              onBreak={() => setShowBreakModal(commitment.id)}
            />
          ))}
        </div>
      )}

      {/* Break Modal */}
      {showBreakModal && (
        <BreakCommitmentModal
          onConfirm={(reason) => {
            breakCommitment(showBreakModal, reason);
            setShowBreakModal(null);
          }}
          onClose={() => setShowBreakModal(null)}
        />
      )}
    </div>
  );
}

// Stat box component
function StatBox({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white/5 rounded-lg p-3 text-center">
      <div className={`flex items-center justify-center gap-1 mb-1 ${color}`}>
        {icon}
        <span className="text-lg font-bold">{value}</span>
      </div>
      <p className="text-white/60 text-xs">{label}</p>
    </div>
  );
}

// Commitment card component
function CommitmentCard({
  commitment,
  expanded,
  onToggle,
  onHonor,
  onBreak,
}: {
  commitment: Commitment;
  expanded: boolean;
  onToggle: () => void;
  onHonor: () => void;
  onBreak: () => void;
}) {
  const extractionConfig = EXTRACTION_LABELS[commitment.extractedDuring];
  const Icon = extractionConfig.icon;
  const createdDate = new Date(commitment.createdAt);

  const getStatusBadge = () => {
    if (commitment.honored) {
      return (
        <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium flex items-center gap-1">
          <Check className="w-3 h-3" />
          Honored
        </span>
      );
    }
    if (commitment.broken) {
      return (
        <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-medium flex items-center gap-1">
          <X className="w-3 h-3" />
          Broken
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  };

  return (
    <div className={`bg-protocol-surface border rounded-xl overflow-hidden transition-colors ${
      commitment.honored
        ? 'border-green-500/30'
        : commitment.broken
        ? 'border-red-500/30'
        : 'border-amber-500/30'
    }`}>
      {/* Main content */}
      <button
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-protocol-bg ${extractionConfig.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-protocol-text font-medium mb-1 line-clamp-2">
              "{commitment.commitmentText}"
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {getStatusBadge()}
              <span className={`text-xs ${extractionConfig.color}`}>
                {extractionConfig.label}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-protocol-text-muted" />
            ) : (
              <ChevronDown className="w-5 h-5 text-protocol-text-muted" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Context */}
          <div className="p-3 bg-protocol-bg rounded-lg grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-protocol-text-muted text-xs mb-1">Arousal Level</p>
              <p className="text-protocol-text font-semibold flex items-center justify-center gap-1">
                <Flame className="w-4 h-4 text-red-400" />
                {commitment.arousalLevel}/5
              </p>
            </div>
            <div>
              <p className="text-protocol-text-muted text-xs mb-1">Denial Day</p>
              <p className="text-protocol-text font-semibold">Day {commitment.denialDay}</p>
            </div>
            <div>
              <p className="text-protocol-text-muted text-xs mb-1">Made On</p>
              <p className="text-protocol-text font-semibold text-sm">
                {createdDate.toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Warning text */}
          <div className="flex items-start gap-2 text-xs text-protocol-text-muted">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p>
              This commitment was made during a high-arousal state. Horny brain decides, sober brain lives with it.
            </p>
          </div>

          {/* Broken reason */}
          {commitment.broken && commitment.brokenReason && (
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <p className="text-red-400 text-sm">
                <strong>Reason:</strong> {commitment.brokenReason}
              </p>
            </div>
          )}

          {/* Actions (only for pending) */}
          {!commitment.honored && !commitment.broken && (
            <div className="flex gap-2">
              <button
                onClick={onHonor}
                className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium
                         flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
              >
                <Award className="w-4 h-4" />
                Honor Commitment
              </button>
              <button
                onClick={onBreak}
                className="py-2 px-4 bg-protocol-bg text-red-400 rounded-lg text-sm font-medium
                         flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
              >
                <Ban className="w-4 h-4" />
                Break
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Break commitment modal
function BreakCommitmentModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-sm bg-protocol-surface border border-protocol-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-protocol-border">
          <h3 className="text-protocol-text font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Break Commitment?
          </h3>
        </div>
        <div className="p-4">
          <p className="text-protocol-text-muted text-sm mb-4">
            Breaking a commitment made during arousal is significant. You're accountable to your horny self.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you breaking this commitment?"
            rows={3}
            className="w-full px-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                     text-protocol-text placeholder-protocol-text-muted resize-none mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-protocol-bg text-protocol-text rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason || 'No reason given')}
              className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium"
            >
              Break It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommitmentDashboard;
