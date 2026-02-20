/**
 * CamLauncher — Pre-session setup screen
 * Shows prescription, makeup/setup instructions, tip goals, and "Go Live" button
 */

import { useState } from 'react';
import { Camera, Sparkles, Target, Loader2, CheckCircle2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CamSession, TipGoal } from '../../types/cam';

interface CamLauncherProps {
  session: CamSession;
  onStartPrep: () => Promise<void>;
  onGoLive: (streamUrl?: string) => Promise<void>;
  isPreparing: boolean;
  isGoingLive: boolean;
}

export function CamLauncher({
  session,
  onStartPrep,
  onGoLive,
  isPreparing,
  isGoingLive,
}: CamLauncherProps) {
  const { isBambiMode } = useBambiMode();
  const [streamUrl, setStreamUrl] = useState('');
  const [prepChecklist, setPrepChecklist] = useState<Record<string, boolean>>({});

  const isPrepping = session.status === 'preparing';

  const checklistItems = [
    session.prescribedMakeup && { key: 'makeup', label: `Makeup: ${session.prescribedMakeup}` },
    session.prescribedSetup && { key: 'setup', label: `Setup: ${session.prescribedSetup}` },
    session.outfitDirective && { key: 'outfit', label: `Outfit: ${session.outfitDirective}` },
    { key: 'lighting', label: 'Lighting check' },
    { key: 'device', label: 'Device connected' },
    { key: 'camera', label: 'Camera positioned' },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const allChecked = checklistItems.every(item => prepChecklist[item.key]);

  const toggleCheck = (key: string) => {
    setPrepChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className={`rounded-2xl overflow-hidden ${
      isBambiMode
        ? 'bg-white border-2 border-pink-200 shadow-lg'
        : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`p-6 ${
        isBambiMode
          ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
          : 'bg-gradient-to-r from-purple-600 to-indigo-600'
      }`}>
        <div className="flex items-center gap-3">
          <Camera className="w-8 h-8 text-white" />
          <div>
            <h2 className="text-xl font-bold text-white">Cam Session</h2>
            <p className="text-white/80 text-sm">
              {session.minimumDurationMinutes}+ min • {session.platform}
              {session.denialDay ? ` • Day ${session.denialDay}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Tip Goals */}
        {session.tipGoals.length > 0 && (
          <div>
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              <Target className="w-4 h-4 inline mr-1" />
              Tip Goals
            </h3>
            <div className="space-y-2">
              {session.tipGoals.map((goal: TipGoal, i: number) => (
                <div key={i} className={`flex items-center justify-between p-3 rounded-xl ${
                  isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
                }`}>
                  <span className={`text-sm font-medium ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    {goal.label}
                  </span>
                  <span className={`text-xs ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    {goal.targetTokens} tokens
                    {goal.reward && ` → ${goal.reward}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prep Checklist */}
        {isPrepping && (
          <div>
            <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              <Sparkles className="w-4 h-4 inline mr-1" />
              Prep Checklist
            </h3>
            <div className="space-y-2">
              {checklistItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => toggleCheck(item.key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                    prepChecklist[item.key]
                      ? isBambiMode
                        ? 'bg-pink-100 border border-pink-300'
                        : 'bg-emerald-900/20 border border-emerald-600/30'
                      : isBambiMode
                        ? 'bg-gray-50 border border-gray-200'
                        : 'bg-protocol-bg border border-protocol-border'
                  }`}
                >
                  <CheckCircle2 className={`w-5 h-5 ${
                    prepChecklist[item.key]
                      ? isBambiMode ? 'text-pink-500' : 'text-emerald-400'
                      : 'text-gray-300'
                  }`} />
                  <span className={`text-sm ${
                    prepChecklist[item.key]
                      ? isBambiMode ? 'text-pink-700 line-through' : 'text-emerald-300 line-through'
                      : isBambiMode ? 'text-gray-700' : 'text-protocol-text'
                  }`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stream URL (optional) */}
        {isPrepping && (
          <div>
            <label className={`block text-xs font-medium mb-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Stream URL (optional)
            </label>
            <input
              type="url"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://fansly.com/live/..."
              className={`w-full px-3 py-2 rounded-xl text-sm ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-800 placeholder-pink-300'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder-protocol-text-muted'
              }`}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {!isPrepping ? (
            <button
              onClick={onStartPrep}
              disabled={isPreparing}
              className={`flex-1 py-3 rounded-xl font-semibold text-white transition-colors ${
                isBambiMode
                  ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
                  : 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400'
              }`}
            >
              {isPreparing ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                'Start Prep'
              )}
            </button>
          ) : (
            <button
              onClick={() => onGoLive(streamUrl || undefined)}
              disabled={isGoingLive || !allChecked}
              className={`flex-1 py-3 rounded-xl font-bold text-white transition-all ${
                allChecked
                  ? isBambiMode
                    ? 'bg-gradient-to-r from-pink-500 to-red-500 hover:from-pink-600 hover:to-red-600 shadow-lg'
                    : 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-lg'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {isGoingLive ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" />
                  Go Live
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
