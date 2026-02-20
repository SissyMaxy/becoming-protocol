/**
 * OpacitySelector — Settings component for choosing visibility level.
 * Radio-style selection with ratchet friction for downgrades.
 */

import { useState } from 'react';
import { Eye, EyeOff, Star, Loader2 } from 'lucide-react';
import { useOpacity, type OpacityLevel } from '../../context/OpacityContext';
import { useBambiMode } from '../../context/BambiModeContext';

const LEVELS: {
  level: OpacityLevel;
  label: string;
  description: string;
  detail: string;
}[] = [
  {
    level: 0,
    label: 'Builder Mode',
    description: 'Everything visible. Full control.',
    detail: 'For development and debugging.',
  },
  {
    level: 1,
    label: 'Curated View',
    description: 'Tasks, briefing, vault. Management sections available if you look for them.',
    detail: 'Good balance of control and simplicity.',
  },
  {
    level: 2,
    label: "Handler's Preferred",
    description: 'Tasks, briefing, journal. The Handler manages everything else.',
    detail: 'Less to think about. More trust.',
  },
  {
    level: 3,
    label: 'Blind Trust',
    description: "Just today's instructions and an evening summary. Total surrender.",
    detail: 'The purest experience.',
  },
];

function buildDowngradeMessage(from: number, to: number, days: number): string {
  if (days > 30) {
    return `You've been at Level ${from} for ${days} days. Everything has been running well without you seeing the details. Are you sure you want to look behind the wall? The Handler recommends staying here.`;
  }
  if (days > 7) {
    return `You've been at Level ${from} for ${days} days. Going back to Level ${to} means seeing the operational details again. Most people find that adds cognitive load without improving outcomes.`;
  }
  return `Switch to Level ${to}? You'll see more of the system's inner workings.`;
}

export function OpacitySelector() {
  const { level, setLevel, daysAtCurrentLevel } = useOpacity();
  const { isBambiMode } = useBambiMode();
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    targetLevel: OpacityLevel;
    message: string;
  } | null>(null);

  const recommendedLevel: OpacityLevel = 2; // Handler's Preferred

  const handleSelect = async (newLevel: OpacityLevel) => {
    if (newLevel === level || isSaving) return;

    // Going UP (more opacity) — frictionless
    if (newLevel > level) {
      setIsSaving(true);
      await setLevel(newLevel);
      setIsSaving(false);
      return;
    }

    // Going DOWN (more visibility) — show confirmation
    setConfirmDialog({
      targetLevel: newLevel,
      message: buildDowngradeMessage(level, newLevel, daysAtCurrentLevel),
    });
  };

  const confirmDowngrade = async () => {
    if (!confirmDialog) return;
    setIsSaving(true);
    await setLevel(confirmDialog.targetLevel);
    setConfirmDialog(null);
    setIsSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Eye className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
        <h3 className={`text-base font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          How much do you want to see?
        </h3>
      </div>

      <div className="space-y-2">
        {LEVELS.map(({ level: lvl, label, description, detail }) => {
          const isSelected = level === lvl;
          const isRecommended = lvl === recommendedLevel;

          return (
            <button
              key={lvl}
              onClick={() => handleSelect(lvl)}
              disabled={isSaving}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                isSelected
                  ? isBambiMode
                    ? 'border-pink-400 bg-pink-100/80'
                    : 'border-protocol-accent bg-protocol-accent/10'
                  : isBambiMode
                  ? 'border-pink-200 bg-pink-50 hover:border-pink-300'
                  : 'border-protocol-border bg-protocol-surface hover:border-protocol-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? isBambiMode
                      ? 'border-pink-500 bg-pink-500'
                      : 'border-protocol-accent bg-protocol-accent'
                    : isBambiMode
                    ? 'border-pink-300'
                    : 'border-protocol-border'
                }`}>
                  {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${
                      isSelected
                        ? isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        : isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                    }`}>
                      Level {lvl} — {label}
                    </span>
                    {isRecommended && (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        isBambiMode
                          ? 'bg-pink-200 text-pink-600'
                          : 'bg-protocol-accent/20 text-protocol-accent'
                      }`}>
                        <Star className="w-2.5 h-2.5" /> recommended
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-0.5 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    {description}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted/70'
                  }`}>
                    {detail}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Current level info */}
      <p className={`text-xs text-center ${
        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
      }`}>
        Current: Level {level} ({daysAtCurrentLevel} day{daysAtCurrentLevel !== 1 ? 's' : ''})
      </p>

      {/* Downgrade confirmation dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className={`max-w-sm w-full rounded-2xl p-6 space-y-4 ${
            isBambiMode ? 'bg-white' : 'bg-protocol-surface'
          }`}>
            <div className="flex items-center gap-2">
              <EyeOff className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`} />
              <h4 className={`font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                See more?
              </h4>
            </div>
            <p className={`text-sm leading-relaxed ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
              {confirmDialog.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}
              >
                Stay where I am
              </button>
              <button
                onClick={confirmDowngrade}
                disabled={isSaving}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-protocol-surface-light text-protocol-text-muted'
                }`}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Show me the machinery'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
