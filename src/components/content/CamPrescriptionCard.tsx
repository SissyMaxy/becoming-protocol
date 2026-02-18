// ============================================
// Cam Prescription Card
// Shows Handler-prescribed cam session details
// ============================================

import {
  Video,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  Calendar,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CamSession } from '../../types/cam';

interface CamPrescriptionCardProps {
  session: CamSession;
  onAccept?: () => void;
  onSkip?: () => void;
}

export function CamPrescriptionCard({ session, onAccept, onSkip }: CamPrescriptionCardProps) {
  const { isBambiMode } = useBambiMode();

  const scheduledDate = session.scheduledAt
    ? new Date(session.scheduledAt)
    : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isBambiMode
        ? 'bg-pink-50 border-pink-200'
        : 'bg-red-500/5 border-red-500/20'
    }`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Video className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`} />
            <span className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-red-400'}`}>
              Cam Session Prescribed
            </span>
          </div>
          {session.handlerPrescribed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              Handler
            </span>
          )}
        </div>

        {/* Key details */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {scheduledDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-protocol-text-muted" />
              <span className="text-xs text-protocol-text">
                {scheduledDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-protocol-text-muted" />
            <span className="text-xs text-protocol-text">
              {session.minimumDurationMinutes}m min
            </span>
          </div>
          {session.targetTipGoalCents && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-protocol-text-muted" />
              <span className="text-xs text-protocol-text">
                ${(session.targetTipGoalCents / 100).toFixed(0)} goal
              </span>
            </div>
          )}
        </div>

        {/* Narrative framing */}
        {session.narrativeFraming && (
          <p className="text-xs text-protocol-text-muted italic mb-3">
            "{session.narrativeFraming}"
          </p>
        )}

        {/* Required activities */}
        {session.requiredActivities && session.requiredActivities.length > 0 && (
          <div className="mb-3">
            <span className="text-[10px] font-medium text-protocol-text-muted uppercase tracking-wide">Required</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {session.requiredActivities.map((activity, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-300 border border-red-500/20"
                >
                  {activity.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Outfit directive */}
        {session.outfitDirective && (
          <div className="p-2 rounded-lg bg-pink-500/10 mb-3">
            <p className="text-xs text-pink-300">
              Outfit: {session.outfitDirective}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {onAccept && (
            <button
              onClick={onAccept}
              className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-green-500/30 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Accept
            </button>
          )}
          {onSkip && (
            <button
              onClick={onSkip}
              className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-500/20 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              Skip (Consequence)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
