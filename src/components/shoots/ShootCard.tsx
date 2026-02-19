/**
 * ShootCard — Prescribed content shoot card for Today View
 * Shows prescription details, denial context, shot list, and poll status.
 * States: prescribed → in_progress → captured → ready_to_post → posted → skipped
 */

import { useState } from 'react';
import {
  Camera, Lock, Clock, ChevronDown, ChevronUp,
  Play, SkipForward, CheckCircle2, AlertTriangle,
  Image as ImageIcon, Loader2, BarChart3,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ShootPrescription, ShootStatus, AudiencePoll, ShotListEntry } from '../../types/industry';

// Denial badge color by day
function getDenialBadgeColor(day: number): string {
  if (day <= 2) return '#4A90D9';   // cool blue
  if (day <= 4) return '#D4A843';   // warm amber
  if (day <= 6) return '#D94A6B';   // hot pink
  return '#8B4AD9';                  // deep purple
}

function getDenialBadgeClasses(day: number, isBambiMode: boolean): string {
  if (day <= 2) return isBambiMode ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400';
  if (day <= 4) return isBambiMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/30 text-amber-400';
  if (day <= 6) return isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-pink-900/30 text-pink-400';
  return isBambiMode ? 'bg-purple-100 text-purple-700' : 'bg-purple-900/30 text-purple-400';
}

function getStatusConfig(status: ShootStatus): { label: string; icon: typeof Camera; color: string } {
  switch (status) {
    case 'prescribed': return { label: 'Prescribed', icon: Camera, color: 'text-purple-400' };
    case 'in_progress': return { label: 'Shooting', icon: Play, color: 'text-blue-400' };
    case 'captured': return { label: 'Captured', icon: ImageIcon, color: 'text-amber-400' };
    case 'ready_to_post': return { label: 'Ready to Post', icon: CheckCircle2, color: 'text-green-400' };
    case 'posted': return { label: 'Posted', icon: CheckCircle2, color: 'text-emerald-400' };
    case 'skipped': return { label: 'Skipped', icon: SkipForward, color: 'text-gray-400' };
  }
}

interface ShootCardProps {
  prescription: ShootPrescription;
  activePoll?: AudiencePoll | null;
  onStartShoot: () => void;
  onSkip: () => void;
  isLoading?: boolean;
}

export function ShootCard({
  prescription,
  activePoll,
  onStartShoot,
  onSkip,
  isLoading,
}: ShootCardProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(true);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const denialDay = prescription.denialDay ?? 0;
  const statusConfig = getStatusConfig(prescription.status);
  const StatusIcon = statusConfig.icon;
  const isActionable = prescription.status === 'prescribed' || prescription.status === 'in_progress';
  const isDone = prescription.status === 'posted' || prescription.status === 'skipped';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      isDone
        ? isBambiMode ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-protocol-surface/50 border-protocol-border/50 opacity-60'
        : isBambiMode ? 'bg-white border-pink-200 shadow-sm' : 'bg-protocol-surface border-protocol-border'
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Camera className={`w-5 h-5 flex-shrink-0 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <div className="min-w-0 text-left">
            <p className={`text-sm font-semibold truncate ${
              isBambiMode ? 'text-gray-800' : 'text-protocol-text'
            }`}>
              {prescription.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusIcon className={`w-3 h-3 ${statusConfig.color}`} />
              <span className={`text-[10px] ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              {prescription.estimatedMinutes && (
                <span className={`text-[10px] flex items-center gap-0.5 ${
                  isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
                }`}>
                  <Clock className="w-2.5 h-2.5" />
                  ~{prescription.estimatedMinutes} min
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Denial Day Badge */}
          {denialDay > 0 && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getDenialBadgeClasses(denialDay, isBambiMode)}`}
              style={{ borderLeft: `3px solid ${getDenialBadgeColor(denialDay)}` }}
            >
              <Lock className="w-2.5 h-2.5 inline mr-0.5" style={{ marginTop: -1 }} />
              Day {denialDay}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className={`px-4 pb-4 space-y-3 ${
          isBambiMode ? 'border-t border-gray-100' : 'border-t border-protocol-border'
        }`}>
          {/* Outfit + Setup + Mood */}
          <div className="pt-3 space-y-1.5">
            <DetailRow label="Outfit" value={prescription.outfit} isBambiMode={isBambiMode} />
            {prescription.setup && (
              <DetailRow label="Setup" value={prescription.setup} isBambiMode={isBambiMode} />
            )}
            {prescription.mood && (
              <DetailRow label="Mood" value={`"${prescription.mood}"`} isBambiMode={isBambiMode} italic />
            )}
          </div>

          {/* Shot List */}
          {prescription.shotList.length > 0 && (
            <div className={`rounded-lg p-3 ${
              isBambiMode ? 'bg-gray-50 border border-gray-100' : 'bg-protocol-bg border border-protocol-border'
            }`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}>
                {prescription.shotList.length} shots — tap each for reference
              </p>
              <div className="space-y-1.5">
                {prescription.shotList.map((shot: ShotListEntry, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`text-[11px] font-mono w-5 text-center ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
                    }`}>
                      {i + 1}
                    </span>
                    <span className={`text-xs flex-1 ${
                      isBambiMode ? 'text-gray-600' : 'text-protocol-text-secondary'
                    }`}>
                      {shot.ref}
                    </span>
                    {shot.count && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isBambiMode ? 'bg-gray-200 text-gray-500' : 'bg-protocol-border text-protocol-text-muted'
                      }`}>
                        x{shot.count}
                      </span>
                    )}
                    {shot.durationSeconds && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isBambiMode ? 'bg-gray-200 text-gray-500' : 'bg-protocol-border text-protocol-text-muted'
                      }`}>
                        {shot.durationSeconds}s
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Handler Note */}
          {prescription.handlerNote && (
            <div className={`rounded-lg p-3 text-xs italic ${
              isBambiMode
                ? 'bg-purple-50 text-purple-700 border border-purple-100'
                : 'bg-purple-900/20 text-purple-300 border border-purple-800/30'
            }`}>
              <span className="font-semibold not-italic">Handler:</span> {prescription.handlerNote}
            </div>
          )}

          {/* Active Poll Inline */}
          {activePoll && activePoll.status === 'active' && (
            <PollInline poll={activePoll} isBambiMode={isBambiMode} />
          )}

          {/* Action Buttons */}
          {isActionable && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onStartShoot}
                disabled={isLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                  isBambiMode
                    ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
                    : 'bg-protocol-accent hover:bg-purple-500 disabled:bg-gray-600'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {prescription.status === 'in_progress' ? 'Continue Shoot' : 'Start Shoot'}
              </button>

              {!showSkipConfirm ? (
                <button
                  onClick={() => setShowSkipConfirm(true)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs transition-colors ${
                    isBambiMode
                      ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
                  }`}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  Skip
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { onSkip(); setShowSkipConfirm(false); }}
                    disabled={isLoading}
                    className={`flex items-center gap-1 py-2 px-2.5 rounded-lg text-xs font-medium ${
                      isBambiMode
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowSkipConfirm(false)}
                    className={`py-2 px-2 rounded-lg text-xs ${
                      isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Detail row helper
function DetailRow({
  label,
  value,
  isBambiMode,
  italic,
}: {
  label: string;
  value: string;
  isBambiMode: boolean;
  italic?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className={`text-[10px] uppercase tracking-wider font-semibold w-12 flex-shrink-0 pt-0.5 ${
        isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
      }`}>
        {label}
      </span>
      <span className={`text-xs ${italic ? 'italic' : ''} ${
        isBambiMode ? 'text-gray-700' : 'text-protocol-text'
      }`}>
        {value}
      </span>
    </div>
  );
}

// Poll inline display
function PollInline({ poll, isBambiMode }: { poll: AudiencePoll; isBambiMode: boolean }) {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes, 0);

  return (
    <div className={`rounded-lg p-3 ${
      isBambiMode
        ? 'bg-blue-50 border border-blue-100'
        : 'bg-blue-900/20 border border-blue-800/30'
    }`}>
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className={`w-3.5 h-3.5 ${
          isBambiMode ? 'text-blue-500' : 'text-blue-400'
        }`} />
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${
          isBambiMode ? 'text-blue-500' : 'text-blue-400'
        }`}>
          Poll Running
        </span>
        <span className={`text-[10px] ml-auto ${
          isBambiMode ? 'text-blue-400' : 'text-blue-500'
        }`}>
          {totalVotes} votes
        </span>
      </div>
      <p className={`text-xs font-medium mb-2 ${
        isBambiMode ? 'text-gray-700' : 'text-protocol-text'
      }`}>
        {poll.question}
      </p>
      <div className="space-y-1">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          return (
            <div key={opt.id} className="flex items-center gap-2">
              <div className={`flex-1 h-5 rounded overflow-hidden ${
                isBambiMode ? 'bg-blue-100' : 'bg-blue-900/30'
              }`}>
                <div
                  className={`h-full rounded ${
                    isBambiMode ? 'bg-blue-300' : 'bg-blue-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[10px] w-8 text-right ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}>
                {pct}%
              </span>
              <span className={`text-[10px] w-24 truncate ${
                isBambiMode ? 'text-gray-600' : 'text-protocol-text-secondary'
              }`}>
                {opt.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
