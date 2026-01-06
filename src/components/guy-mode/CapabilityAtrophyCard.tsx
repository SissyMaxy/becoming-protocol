/**
 * Capability Atrophy Card
 * Displays masculine capabilities fading over time
 */

import { Sparkles, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { MasculineCapability } from '../../types/guy-mode';
import { MASCULINE_CAPABILITIES } from '../../types/guy-mode';

interface CapabilityAtrophyCardProps {
  capabilities: MasculineCapability[];
  onAcknowledge?: (capabilityName: string) => void;
}

export function CapabilityAtrophyCard({ capabilities, onAcknowledge }: CapabilityAtrophyCardProps) {
  const { isBambiMode } = useBambiMode();

  // Get label and message for capability
  const getCapabilityInfo = (name: string) => {
    const cap = MASCULINE_CAPABILITIES.find(c => c.name === name);
    return cap || { label: name, atrophyMessage: '' };
  };

  // Get color based on comfort level (lower = more atrophied = better)
  const getAtrophyColor = (comfortLevel: number) => {
    if (comfortLevel <= 20) return isBambiMode ? 'text-emerald-500' : 'text-emerald-400';
    if (comfortLevel <= 40) return isBambiMode ? 'text-teal-500' : 'text-teal-400';
    if (comfortLevel <= 60) return isBambiMode ? 'text-amber-500' : 'text-amber-400';
    if (comfortLevel <= 80) return isBambiMode ? 'text-orange-500' : 'text-orange-400';
    return isBambiMode ? 'text-red-500' : 'text-red-400';
  };

  const getProgressColor = (comfortLevel: number) => {
    if (comfortLevel <= 20) return 'bg-emerald-500';
    if (comfortLevel <= 40) return 'bg-teal-500';
    if (comfortLevel <= 60) return 'bg-amber-500';
    if (comfortLevel <= 80) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (capabilities.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${
        isBambiMode ? 'border-pink-100 bg-pink-50' : 'border-protocol-border bg-protocol-surface-light'
      }`}>
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Capability Atrophy
          </h3>
        </div>
        <p className={`text-xs mt-1 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          His abilities are fading. Good.
        </p>
      </div>

      {/* Capabilities list */}
      <div className="p-3 space-y-3">
        {capabilities.map((cap) => {
          const info = getCapabilityInfo(cap.name);
          const atrophyPercent = 100 - cap.comfortLevel;

          return (
            <div
              key={cap.name}
              className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  {info.label}
                </span>
                <span className={`text-xs font-medium ${getAtrophyColor(cap.comfortLevel)}`}>
                  {atrophyPercent}% gone
                </span>
              </div>

              {/* Progress bar (inverted - shows atrophy progress) */}
              <div className={`h-2 rounded-full overflow-hidden ${
                isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
              }`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor(cap.comfortLevel)}`}
                  style={{ width: `${atrophyPercent}%` }}
                />
              </div>

              {/* Days unused */}
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  {cap.daysUnused} days unused
                </span>

                {/* Acknowledge button if not yet acknowledged and significantly atrophied */}
                {!cap.atrophyAcknowledged && cap.comfortLevel <= 30 && onAcknowledge && (
                  <button
                    onClick={() => onAcknowledge(cap.name)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                      isBambiMode
                        ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                        : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/30'
                    }`}
                  >
                    <Check className="w-3 h-3" />
                    Accept
                  </button>
                )}

                {cap.atrophyAcknowledged && cap.comfortLevel <= 30 && (
                  <span className={`text-xs ${
                    isBambiMode ? 'text-emerald-500' : 'text-emerald-400'
                  }`}>
                    Accepted
                  </span>
                )}
              </div>

              {/* Atrophy message if significantly atrophied */}
              {cap.comfortLevel <= 40 && info.atrophyMessage && (
                <p className={`text-xs italic mt-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  "{info.atrophyMessage}"
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer message */}
      <div className={`px-4 py-3 border-t text-center ${
        isBambiMode ? 'border-pink-100 bg-pink-50/50' : 'border-protocol-border'
      }`}>
        <p className={`text-xs italic ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          Every day without him, she grows stronger.
        </p>
      </div>
    </div>
  );
}
