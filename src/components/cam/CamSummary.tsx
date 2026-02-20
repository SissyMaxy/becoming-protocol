/**
 * CamSummary — Post-session summary view
 * Shows session stats, tip breakdown, highlight count, prompt compliance
 */

import { Trophy, Clock, DollarSign, Zap, Star, MessageCircle, Target, User, FileText } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { CamSessionSummary } from '../../types/cam';

interface CamSummaryProps {
  summary: CamSessionSummary;
  onDismiss: () => void;
}

export function CamSummary({ summary, onDismiss }: CamSummaryProps) {
  const { isBambiMode } = useBambiMode();

  const stats = [
    {
      icon: Clock,
      label: 'Duration',
      value: `${summary.durationMinutes}m`,
    },
    {
      icon: DollarSign,
      label: 'Total Tokens',
      value: summary.totalTokens.toLocaleString(),
    },
    {
      icon: Zap,
      label: 'Tips',
      value: String(summary.tipCount),
    },
    {
      icon: Star,
      label: 'Highlights',
      value: String(summary.highlightCount),
    },
  ];

  const compliancePercent = Math.round(summary.promptAcknowledgeRate * 100);

  return (
    <div className={`rounded-2xl overflow-hidden ${
      isBambiMode
        ? 'bg-white border-2 border-pink-200 shadow-lg'
        : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`p-6 text-center ${
        isBambiMode
          ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500'
          : 'bg-gradient-to-r from-emerald-600 to-teal-600'
      }`}>
        <Trophy className="w-10 h-10 text-white mx-auto mb-2" />
        <h2 className="text-xl font-bold text-white">Session Complete</h2>
        <p className="text-white/80 text-sm mt-1">Good girl. Here's how you did.</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className={`p-4 rounded-xl text-center ${
                isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
              }`}
            >
              <Icon className={`w-5 h-5 mx-auto mb-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`} />
              <p className={`text-2xl font-bold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>{value}</p>
              <p className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Edge Count */}
        {summary.edgeCount > 0 && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            isBambiMode ? 'bg-amber-50 border border-amber-200' : 'bg-amber-900/20 border border-amber-600/30'
          }`}>
            <Zap className={`w-5 h-5 ${isBambiMode ? 'text-amber-500' : 'text-amber-400'}`} />
            <div>
              <p className={`font-semibold ${isBambiMode ? 'text-amber-700' : 'text-amber-300'}`}>
                {summary.edgeCount} edge{summary.edgeCount !== 1 ? 's' : ''} recorded
              </p>
              <p className={`text-xs ${isBambiMode ? 'text-amber-500' : 'text-amber-400/70'}`}>
                Still denied. Good.
              </p>
            </div>
          </div>
        )}

        {/* Handler Compliance */}
        {summary.handlerPromptCount > 0 && (
          <div className={`p-4 rounded-xl ${
            isBambiMode ? 'bg-fuchsia-50 border border-fuchsia-200' : 'bg-purple-900/20 border border-purple-600/30'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className={`w-4 h-4 ${isBambiMode ? 'text-fuchsia-500' : 'text-purple-400'}`} />
              <span className={`text-sm font-semibold ${isBambiMode ? 'text-fuchsia-700' : 'text-purple-300'}`}>
                Handler Compliance
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                isBambiMode ? 'bg-fuchsia-100' : 'bg-purple-900/50'
              }`}>
                <div
                  className={`h-full rounded-full ${
                    compliancePercent >= 80
                      ? isBambiMode ? 'bg-green-400' : 'bg-emerald-500'
                      : compliancePercent >= 50
                        ? isBambiMode ? 'bg-amber-400' : 'bg-amber-500'
                        : isBambiMode ? 'bg-red-400' : 'bg-red-500'
                  }`}
                  style={{ width: `${compliancePercent}%` }}
                />
              </div>
              <span className={`text-sm font-mono ${isBambiMode ? 'text-fuchsia-600' : 'text-purple-300'}`}>
                {compliancePercent}%
              </span>
            </div>
            <p className={`text-xs mt-1 ${isBambiMode ? 'text-fuchsia-400' : 'text-purple-500'}`}>
              {summary.handlerPromptCount} prompt{summary.handlerPromptCount !== 1 ? 's' : ''} received
            </p>
          </div>
        )}

        {/* Handler Note */}
        {summary.handlerNote && (
          <div className={`p-4 rounded-xl ${
            isBambiMode
              ? 'bg-purple-50 border border-purple-200'
              : 'bg-purple-900/20 border border-purple-600/30'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <FileText className={`w-4 h-4 ${isBambiMode ? 'text-purple-500' : 'text-purple-400'}`} />
              <span className={`text-xs font-semibold uppercase tracking-wider ${
                isBambiMode ? 'text-purple-500' : 'text-purple-400'
              }`}>
                Handler
              </span>
            </div>
            <p className={`text-sm italic ${
              isBambiMode ? 'text-purple-700' : 'text-purple-200'
            }`}>
              "{summary.handlerNote}"
            </p>
          </div>
        )}

        {/* Tip Goals */}
        {summary.tipGoalsTotal > 0 && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            isBambiMode ? 'bg-green-50 border border-green-200' : 'bg-emerald-900/20 border border-emerald-600/30'
          }`}>
            <Target className={`w-5 h-5 ${isBambiMode ? 'text-green-500' : 'text-emerald-400'}`} />
            <span className={`font-medium ${isBambiMode ? 'text-green-700' : 'text-emerald-300'}`}>
              {summary.tipGoalsReached}/{summary.tipGoalsTotal} tip goal{summary.tipGoalsTotal !== 1 ? 's' : ''} reached
            </span>
          </div>
        )}

        {/* Top Tipper */}
        {summary.topTipper && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}>
            <User className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
            <div>
              <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                Top Tipper: {summary.topTipper.username}
              </p>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                {summary.topTipper.totalTokens} tokens
              </p>
            </div>
          </div>
        )}

        {/* Vault Items */}
        {summary.vaultItemsCreated > 0 && (
          <p className={`text-center text-sm ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            {summary.vaultItemsCreated} item{summary.vaultItemsCreated !== 1 ? 's' : ''} added to vault
          </p>
        )}

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600'
              : 'bg-protocol-accent hover:bg-protocol-accent-soft'
          }`}
        >
          Done
        </button>
      </div>
    </div>
  );
}
