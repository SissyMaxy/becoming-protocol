/**
 * Commitment Card
 * Displays an individual commitment with status and actions
 */

import { memo } from 'react';
import { Link2, Link, Lock, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { UserCommitment, BindingLevel } from '../../types/commitments';
import { BINDING_LEVEL_INFO } from '../../types/commitments';

interface CommitmentCardProps {
  commitment: UserCommitment;
  onFulfill?: () => void;
  onBreak?: () => void;
}

const BINDING_ICONS: Record<BindingLevel, React.ElementType> = {
  soft: Link2,
  hard: Link,
  permanent: Lock,
};

const BINDING_COLORS: Record<BindingLevel, { bg: string; text: string; bambi: string }> = {
  soft: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    bambi: 'bg-blue-100 text-blue-600',
  },
  hard: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    bambi: 'bg-orange-100 text-orange-600',
  },
  permanent: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    bambi: 'bg-red-100 text-red-600',
  },
};

// Memoized to prevent unnecessary re-renders
export const CommitmentCard = memo(function CommitmentCard({ commitment, onFulfill, onBreak }: CommitmentCardProps) {
  const { isBambiMode } = useBambiMode();
  const bindingInfo = BINDING_LEVEL_INFO[commitment.bindingLevel];
  const bindingColor = BINDING_COLORS[commitment.bindingLevel];
  const Icon = BINDING_ICONS[commitment.bindingLevel];

  const madeDate = new Date(commitment.madeAt);
  const daysSince = Math.floor((Date.now() - madeDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header with binding level */}
      <div className={`px-4 py-3 flex items-center justify-between ${
        isBambiMode ? 'bg-pink-100/50' : 'bg-protocol-surface-light'
      }`}>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${
          isBambiMode ? bindingColor.bambi : `${bindingColor.bg} ${bindingColor.text}`
        }`}>
          <Icon className="w-3 h-3" />
          <span>{bindingInfo.label} Commitment</span>
        </div>

        {/* Status badge */}
        {commitment.status === 'fulfilled' && (
          <div className="flex items-center gap-1 text-green-500">
            <CheckCircle className="w-4 h-4" />
            <span className="text-xs font-medium">Fulfilled</span>
          </div>
        )}
        {commitment.status === 'broken' && (
          <div className="flex items-center gap-1 text-red-500">
            <XCircle className="w-4 h-4" />
            <span className="text-xs font-medium">Broken</span>
          </div>
        )}
        {commitment.status === 'active' && (
          <div className={`flex items-center gap-1 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}>
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Active</span>
          </div>
        )}
      </div>

      {/* Commitment text */}
      <div className="p-4">
        <p className={`text-sm font-medium leading-relaxed ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          "{commitment.commitmentText}"
        </p>

        {/* Context info */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${
            isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-surface-light text-protocol-text-muted'
          }`}>
            Made {daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}
          </span>

          {commitment.arousalState && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-surface-light text-protocol-text-muted'
            }`}>
              State: {commitment.arousalState.replace('_', ' ')}
            </span>
          )}

          {commitment.denialDay !== undefined && commitment.denialDay > 0 && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-surface-light text-protocol-text-muted'
            }`}>
              Day {commitment.denialDay}
            </span>
          )}
        </div>

        {/* Actions for active commitments */}
        {commitment.status === 'active' && (
          <div className="mt-4 flex gap-2">
            {onFulfill && (
              <button
                onClick={onFulfill}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                }`}
              >
                Mark Fulfilled
              </button>
            )}

            {onBreak && bindingInfo.canBreak && (
              <button
                onClick={onBreak}
                className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  isBambiMode
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                }`}
              >
                Break
              </button>
            )}
          </div>
        )}

        {/* Break consequence warning */}
        {commitment.status === 'active' && !bindingInfo.canBreak && (
          <div className={`mt-4 p-3 rounded-lg text-xs ${
            isBambiMode ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400'
          }`}>
            <Lock className="w-3 h-3 inline mr-1" />
            {bindingInfo.breakConsequence}
          </div>
        )}

        {/* Completion info */}
        {commitment.status === 'fulfilled' && commitment.fulfilledAt && (
          <div className={`mt-3 text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            Fulfilled on {new Date(commitment.fulfilledAt).toLocaleDateString()}
          </div>
        )}

        {commitment.status === 'broken' && commitment.brokenAt && (
          <div className="mt-3 text-xs text-red-400">
            Broken on {new Date(commitment.brokenAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
});

// Display name for React DevTools
CommitmentCard.displayName = 'CommitmentCard';
