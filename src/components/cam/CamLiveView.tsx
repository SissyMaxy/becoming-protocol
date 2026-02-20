/**
 * CamLiveView — Active session dashboard
 * Shows elapsed time, tip totals, handler prompts, edge counter,
 * quick-actions (record edge, mark highlight, end session)
 */

import { useState } from 'react';
import {
  DollarSign,
  Zap,
  AlertTriangle,
  Star,
  Square,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Check,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  CamSession,
  HandlerPrompt,
  TipGoal,
  HighlightType,
} from '../../types/cam';
import type { CamAnnouncement } from '../../lib/cam/announcements';
import { TipMenu } from './TipMenu';

interface CamLiveViewProps {
  session: CamSession;
  elapsedSeconds: number;
  tipTotal: { totalTokens: number; totalUsd: number; tipCount: number };
  edgeCount: number;
  tipGoals: TipGoal[];
  unacknowledgedPrompts: HandlerPrompt[];
  latestPrompt: HandlerPrompt | null;
  announcements: CamAnnouncement[];
  fakeGoalResponse?: { label: string; response: string } | null;

  // Actions
  onRecordTip: (data: {
    tipperUsername?: string;
    tipperPlatform?: string;
    tokenAmount: number;
    tipAmountUsd?: number;
  }) => Promise<unknown>;
  onAckPrompt: (promptId: string) => Promise<void>;
  onRecordEdge: () => Promise<void>;
  onMarkHighlight: (type: HighlightType, description: string) => Promise<void>;
  onEndSession: () => Promise<void>;
  onDismissAnnouncement: (index: number) => void;
  onDismissFakeGoal?: () => void;
  isEnding: boolean;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CamLiveView({
  session,
  elapsedSeconds,
  tipTotal,
  edgeCount,
  tipGoals,
  unacknowledgedPrompts,
  latestPrompt,
  announcements,
  fakeGoalResponse,
  onRecordTip,
  onAckPrompt,
  onRecordEdge,
  onMarkHighlight,
  onEndSession,
  onDismissAnnouncement,
  onDismissFakeGoal,
  isEnding,
}: CamLiveViewProps) {
  const { isBambiMode } = useBambiMode();
  const [showTipMenu, setShowTipMenu] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  const pastMinimum = elapsedMinutes >= session.minimumDurationMinutes;

  return (
    <div className="space-y-4">
      {/* Live indicator + timer */}
      <div className={`rounded-2xl p-5 ${
        isBambiMode
          ? 'bg-gradient-to-r from-pink-500 to-red-500'
          : 'bg-gradient-to-r from-red-600 to-orange-600'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
            <span className="text-white font-bold text-lg">LIVE</span>
          </div>
          <div className="text-white text-right">
            <span className="text-3xl font-mono font-bold">{formatTime(elapsedSeconds)}</span>
            <p className="text-white/70 text-xs">
              Min: {session.minimumDurationMinutes}m
              {pastMinimum && ' ✓'}
            </p>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-white/80" />
            <span className="text-white font-semibold">{tipTotal.totalTokens}</span>
            <span className="text-white/60 text-xs">tokens</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-white/80" />
            <span className="text-white font-semibold">{tipTotal.tipCount}</span>
            <span className="text-white/60 text-xs">tips</span>
          </div>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-white/80" />
            <span className="text-white font-semibold">{edgeCount}</span>
            <span className="text-white/60 text-xs">edges</span>
          </div>
        </div>
      </div>

      {/* Handler Prompt (invisible to viewers — visible only on this device) */}
      {latestPrompt && !latestPrompt.acknowledged && (
        <div className={`rounded-2xl p-4 border-2 animate-pulse ${
          isBambiMode
            ? 'bg-fuchsia-50 border-fuchsia-400'
            : 'bg-purple-900/30 border-purple-500'
        }`}>
          <div className="flex items-start gap-3">
            <MessageCircle className={`w-5 h-5 mt-0.5 ${
              isBambiMode ? 'text-fuchsia-500' : 'text-purple-400'
            }`} />
            <div className="flex-1">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                isBambiMode ? 'text-fuchsia-500' : 'text-purple-400'
              }`}>
                Handler
              </p>
              <p className={`text-sm font-medium ${
                isBambiMode ? 'text-fuchsia-800' : 'text-protocol-text'
              }`}>
                {latestPrompt.promptText}
              </p>
            </div>
            <button
              onClick={() => onAckPrompt(latestPrompt.id)}
              className={`p-2 rounded-lg transition-colors ${
                isBambiMode
                  ? 'bg-fuchsia-200 hover:bg-fuchsia-300 text-fuchsia-700'
                  : 'bg-purple-800 hover:bg-purple-700 text-purple-300'
              }`}
            >
              <Check className="w-4 h-4" />
            </button>
          </div>
          {unacknowledgedPrompts.length > 1 && (
            <p className={`text-[10px] mt-2 ${
              isBambiMode ? 'text-fuchsia-400' : 'text-purple-500'
            }`}>
              +{unacknowledgedPrompts.length - 1} more prompt{unacknowledgedPrompts.length > 2 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Tip Goals Progress */}
      {tipGoals.length > 0 && (
        <div className={`rounded-2xl p-4 ${
          isBambiMode
            ? 'bg-white border border-pink-200'
            : 'bg-protocol-surface border border-protocol-border'
        }`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            Tip Goals
          </h3>
          <div className="space-y-2">
            {tipGoals.map((goal, i) => {
              const pct = Math.min(1, tipTotal.totalTokens / goal.targetTokens);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>
                      {goal.reached ? '✓ ' : ''}{goal.label}
                    </span>
                    <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                      {tipTotal.totalTokens}/{goal.targetTokens}
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${
                    isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
                  }`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        goal.reached
                          ? isBambiMode ? 'bg-green-400' : 'bg-emerald-500'
                          : isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                      }`}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fake Goal Denial Response */}
      {fakeGoalResponse && (
        <div className={`rounded-2xl p-4 border-2 animate-pulse ${
          isBambiMode
            ? 'bg-red-50 border-red-400'
            : 'bg-red-900/30 border-red-500'
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 mt-0.5 ${
              isBambiMode ? 'text-red-500' : 'text-red-400'
            }`} />
            <div className="flex-1">
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                isBambiMode ? 'text-red-500' : 'text-red-400'
              }`}>
                Goal Reached: {fakeGoalResponse.label}
              </p>
              <p className={`text-sm font-medium ${
                isBambiMode ? 'text-red-800' : 'text-protocol-text'
              }`}>
                {fakeGoalResponse.response}
              </p>
            </div>
            {onDismissFakeGoal && (
              <button
                onClick={onDismissFakeGoal}
                className={`p-2 rounded-lg transition-colors ${
                  isBambiMode
                    ? 'bg-red-200 hover:bg-red-300 text-red-700'
                    : 'bg-red-800 hover:bg-red-700 text-red-300'
                }`}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={onRecordEdge}
          className={`p-4 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 ${
            isBambiMode
              ? 'bg-amber-50 border border-amber-200 text-amber-700'
              : 'bg-amber-900/20 border border-amber-600/30 text-amber-400'
          }`}
        >
          <AlertTriangle className="w-6 h-6" />
          <span className="text-xs font-medium">Edge</span>
        </button>

        <button
          onClick={() => onMarkHighlight('custom', 'Manual highlight')}
          className={`p-4 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 ${
            isBambiMode
              ? 'bg-yellow-50 border border-yellow-200 text-yellow-700'
              : 'bg-yellow-900/20 border border-yellow-600/30 text-yellow-400'
          }`}
        >
          <Star className="w-6 h-6" />
          <span className="text-xs font-medium">Highlight</span>
        </button>

        <button
          onClick={() => setShowTipMenu(!showTipMenu)}
          className={`p-4 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 ${
            isBambiMode
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-green-900/20 border border-green-600/30 text-green-400'
          }`}
        >
          <DollarSign className="w-6 h-6" />
          <span className="text-xs font-medium flex items-center gap-0.5">
            Tip {showTipMenu ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </span>
        </button>
      </div>

      {/* Tip Menu (expandable) */}
      {showTipMenu && (
        <TipMenu onRecordTip={onRecordTip} isRecording />
      )}

      {/* Announcements */}
      {announcements.map((ann, i) => (
        <div
          key={i}
          className={`rounded-xl p-3 flex items-center justify-between ${
            ann.urgency === 'high'
              ? isBambiMode ? 'bg-red-50 border border-red-200' : 'bg-red-900/20 border border-red-600/30'
              : isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-bg border border-protocol-border'
          }`}
        >
          <div>
            <p className={`text-sm font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>{ann.title}</p>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>{ann.body}</p>
          </div>
          <button
            onClick={() => onDismissAnnouncement(i)}
            className="p-1 opacity-50 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}

      {/* End Session */}
      <div className="pt-2">
        {showEndConfirm ? (
          <div className={`rounded-2xl p-4 text-center ${
            isBambiMode ? 'bg-gray-50 border border-gray-200' : 'bg-gray-800/50 border border-gray-600'
          }`}>
            <p className={`font-semibold mb-2 ${
              isBambiMode ? 'text-gray-700' : 'text-protocol-text'
            }`}>
              End session?
            </p>
            {!pastMinimum && (
              <p className={`text-xs mb-3 ${
                isBambiMode ? 'text-red-500' : 'text-red-400'
              }`}>
                You haven't reached the minimum {session.minimumDurationMinutes} minutes yet.
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowEndConfirm(false)}
                className={`px-5 py-2 rounded-xl font-medium ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}
              >
                Keep Going
              </button>
              <button
                onClick={onEndSession}
                disabled={isEnding}
                className={`px-5 py-2 rounded-xl ${
                  isBambiMode
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isEnding ? <Loader2 className="w-5 h-5 animate-spin" /> : 'End'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowEndConfirm(true)}
            className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              isBambiMode
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
            }`}
          >
            <Square className="w-4 h-4" />
            <span className="text-sm">End Session</span>
          </button>
        )}
      </div>
    </div>
  );
}
