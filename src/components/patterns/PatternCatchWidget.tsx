/**
 * Pattern Catch Widget
 *
 * Quick logging widget for catching and correcting masculine patterns.
 * Supports notifications, quick entry, and streak tracking.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle, Check, X, Plus, ChevronDown, ChevronUp,
  Zap, CheckCircle, Loader2, RefreshCw
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getPatterns,
  logPatternCatch,
  getPatternStats,
} from '../../lib/patterns';
import type { MasculinePattern, PatternCategory, PatternStats } from '../../types/patterns';

interface PatternCatchWidgetProps {
  compact?: boolean;
  onCatchLogged?: () => void;
}

const CATEGORY_CONFIG: Record<PatternCategory, { label: string; color: string; icon: string }> = {
  language: { label: 'Language', color: 'blue', icon: 'MessageSquare' },
  posture: { label: 'Posture', color: 'purple', icon: 'Move' },
  behavior: { label: 'Behavior', color: 'pink', icon: 'Hand' },
  thought: { label: 'Thoughts', color: 'indigo', icon: 'Brain' },
  appearance: { label: 'Appearance', color: 'green', icon: 'Eye' },
};

export function PatternCatchWidget({ compact = false, onCatchLogged }: PatternCatchWidgetProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [patterns, setPatterns] = useState<MasculinePattern[]>([]);
  const [stats, setStats] = useState<PatternStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [isCorrected, setIsCorrected] = useState<boolean | null>(null);
  const [quickContext, setQuickContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentCatch, setRecentCatch] = useState<{ pattern: string; corrected: boolean } | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const [patternsData, statsData] = await Promise.all([
        getPatterns(user.id),
        getPatternStats(user.id),
      ]);

      // Filter to active patterns
      const activePatterns = patternsData.filter(p => p.status === 'active' || p.status === 'recurring');
      setPatterns(activePatterns);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load patterns:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleQuickCatch = async (patternId: string, corrected: boolean) => {
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      await logPatternCatch(patternId, user.id, {
        correctionApplied: true,
        correctionSuccess: corrected,
        context: quickContext || undefined,
      });

      const pattern = patterns.find(p => p.id === patternId);
      setRecentCatch({
        pattern: pattern?.patternName || 'Pattern',
        corrected,
      });

      // Clear after 3 seconds
      setTimeout(() => setRecentCatch(null), 3000);

      // Reload stats
      const newStats = await getPatternStats(user.id);
      setStats(newStats);

      // Reset form
      setSelectedPattern(null);
      setIsCorrected(null);
      setQuickContext('');

      onCatchLogged?.();
    } catch (error) {
      console.error('Failed to log catch:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`p-4 rounded-xl flex items-center justify-center gap-2 ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <Loader2 className={`w-4 h-4 animate-spin ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
          Loading patterns...
        </span>
      </div>
    );
  }

  // Compact mode - just stats and quick button
  if (compact) {
    return (
      <div className={`p-3 rounded-xl ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <span className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Pattern Catch
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {stats?.catchesToday || 0}
              </p>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>today</p>
            </div>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={`p-2 rounded-lg transition-colors ${
                isBambiMode
                  ? 'bg-pink-200 text-pink-700 hover:bg-pink-300'
                  : 'bg-protocol-accent/20 text-protocol-accent hover:bg-protocol-accent/30'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick catch dropdown */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-pink-200">
            <QuickCatchForm
              patterns={patterns}
              selectedPattern={selectedPattern}
              setSelectedPattern={setSelectedPattern}
              isCorrected={isCorrected}
              setIsCorrected={setIsCorrected}
              quickContext={quickContext}
              setQuickContext={setQuickContext}
              isSubmitting={isSubmitting}
              onSubmit={handleQuickCatch}
              isBambiMode={isBambiMode}
            />
          </div>
        )}

        {/* Recent catch feedback */}
        {recentCatch && (
          <div className={`mt-2 p-2 rounded-lg text-xs text-center ${
            recentCatch.corrected
              ? isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
              : isBambiMode ? 'bg-orange-100 text-orange-700' : 'bg-orange-900/30 text-orange-400'
          }`}>
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Caught "{recentCatch.pattern}" - {recentCatch.corrected ? 'Corrected!' : 'Logged for awareness'}
          </div>
        )}
      </div>
    );
  }

  // Full widget
  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className={`p-4 ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-accent/10'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`} />
            <h3 className={`font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              Pattern Catch
            </h3>
          </div>
          <button
            onClick={loadData}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-200 text-pink-500' : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            <StatBox label="Today" value={stats.catchesToday} isBambiMode={isBambiMode} />
            <StatBox label="Active" value={stats.activePatterns} isBambiMode={isBambiMode} />
            <StatBox label="Rate" value={`${stats.correctionRate}%`} isBambiMode={isBambiMode} />
            <StatBox label="Auto" value={`${stats.avgAutomaticity}%`} isBambiMode={isBambiMode} />
          </div>
        )}
      </div>

      {/* Quick catch form */}
      <div className="p-4">
        <p className={`text-xs font-semibold mb-3 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          Quick Catch
        </p>

        <QuickCatchForm
          patterns={patterns}
          selectedPattern={selectedPattern}
          setSelectedPattern={setSelectedPattern}
          isCorrected={isCorrected}
          setIsCorrected={setIsCorrected}
          quickContext={quickContext}
          setQuickContext={setQuickContext}
          isSubmitting={isSubmitting}
          onSubmit={handleQuickCatch}
          isBambiMode={isBambiMode}
        />

        {/* Recent catch feedback */}
        {recentCatch && (
          <div className={`mt-3 p-3 rounded-lg text-sm text-center ${
            recentCatch.corrected
              ? isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
              : isBambiMode ? 'bg-orange-100 text-orange-700' : 'bg-orange-900/30 text-orange-400'
          }`}>
            <CheckCircle className="w-4 h-4 inline mr-2" />
            Caught "{recentCatch.pattern}" - {recentCatch.corrected ? 'Corrected!' : 'Logged for awareness'}
          </div>
        )}
      </div>

      {/* Recent patterns */}
      {patterns.length > 0 && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`w-full flex items-center justify-between py-2 text-xs font-medium ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            <span>Your Active Patterns ({patterns.length})</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="space-y-2">
              {patterns.slice(0, 5).map(pattern => (
                <div
                  key={pattern.id}
                  className={`p-3 rounded-lg ${
                    isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}>
                        {pattern.patternName}
                      </p>
                      <p className={`text-xs ${
                        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                      }`}>
                        {CATEGORY_CONFIG[pattern.category]?.label || pattern.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${
                        isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                      }`}>
                        {pattern.timesCaught}x
                      </span>
                      <button
                        onClick={() => {
                          setSelectedPattern(pattern.id);
                          setIsCorrected(null);
                        }}
                        className={`p-1.5 rounded transition-colors ${
                          selectedPattern === pattern.id
                            ? isBambiMode ? 'bg-pink-300 text-pink-700' : 'bg-protocol-accent text-white'
                            : isBambiMode ? 'hover:bg-pink-200 text-pink-500' : 'hover:bg-protocol-border text-protocol-text-muted'
                        }`}
                      >
                        <AlertCircle className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {pattern.feminineReplacement && (
                    <p className={`text-xs mt-1 italic ${
                      isBambiMode ? 'text-green-600' : 'text-green-400'
                    }`}>
                      Replace with: {pattern.feminineReplacement}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function QuickCatchForm({
  patterns,
  selectedPattern,
  setSelectedPattern,
  isCorrected,
  setIsCorrected,
  quickContext,
  setQuickContext,
  isSubmitting,
  onSubmit,
  isBambiMode,
}: {
  patterns: MasculinePattern[];
  selectedPattern: string | null;
  setSelectedPattern: (id: string | null) => void;
  isCorrected: boolean | null;
  setIsCorrected: (corrected: boolean | null) => void;
  quickContext: string;
  setQuickContext: (context: string) => void;
  isSubmitting: boolean;
  onSubmit: (patternId: string, corrected: boolean) => void;
  isBambiMode: boolean;
}) {
  if (patterns.length === 0) {
    return (
      <p className={`text-sm text-center py-4 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        No active patterns. Add patterns to start tracking.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Pattern selector */}
      <select
        value={selectedPattern || ''}
        onChange={(e) => setSelectedPattern(e.target.value || null)}
        className={`w-full p-2 rounded-lg text-sm ${
          isBambiMode
            ? 'bg-white border border-pink-200 text-pink-700 focus:border-pink-400'
            : 'bg-protocol-bg border border-protocol-border text-protocol-text focus:border-protocol-accent'
        }`}
      >
        <option value="">Select pattern caught...</option>
        {patterns.map(pattern => (
          <option key={pattern.id} value={pattern.id}>
            {pattern.patternName}
          </option>
        ))}
      </select>

      {/* Correction buttons */}
      {selectedPattern && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => setIsCorrected(true)}
              className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-1 text-sm font-medium transition-colors ${
                isCorrected === true
                  ? isBambiMode ? 'bg-green-500 text-white' : 'bg-green-500 text-white'
                  : isBambiMode ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
              }`}
            >
              <Check className="w-4 h-4" />
              Corrected
            </button>
            <button
              onClick={() => setIsCorrected(false)}
              className={`flex-1 p-2 rounded-lg flex items-center justify-center gap-1 text-sm font-medium transition-colors ${
                isCorrected === false
                  ? isBambiMode ? 'bg-orange-500 text-white' : 'bg-orange-500 text-white'
                  : isBambiMode ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50'
              }`}
            >
              <X className="w-4 h-4" />
              Slipped
            </button>
          </div>

          {/* Optional context */}
          <input
            type="text"
            value={quickContext}
            onChange={(e) => setQuickContext(e.target.value)}
            placeholder="Context (optional)"
            className={`w-full p-2 rounded-lg text-sm ${
              isBambiMode
                ? 'bg-white border border-pink-200 text-pink-700 placeholder-pink-300 focus:border-pink-400'
                : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder-protocol-text-muted focus:border-protocol-accent'
            }`}
          />

          {/* Submit */}
          {isCorrected !== null && (
            <button
              onClick={() => onSubmit(selectedPattern, isCorrected)}
              disabled={isSubmitting}
              className={`w-full p-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-500 hover:bg-pink-600 text-white disabled:bg-pink-300'
                  : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white disabled:bg-protocol-accent/50'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Logging...
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Log Catch
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string | number;
  isBambiMode: boolean;
}) {
  return (
    <div className={`p-2 rounded-lg text-center ${
      isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
    }`}>
      <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </p>
      <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
        {label}
      </p>
    </div>
  );
}

// ============================================
// NOTIFICATION COMPONENT
// ============================================

interface PatternNotificationProps {
  pattern: MasculinePattern;
  onCatch: (corrected: boolean) => void;
  onDismiss: () => void;
}

export function PatternNotification({ pattern, onCatch, onDismiss }: PatternNotificationProps) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className={`fixed bottom-4 left-4 right-4 max-w-md mx-auto p-4 rounded-xl shadow-lg z-50 ${
      isBambiMode
        ? 'bg-pink-100 border-2 border-pink-300'
        : 'bg-protocol-surface border-2 border-protocol-accent'
    }`}>
      <div className="flex items-start gap-3">
        <AlertCircle className={`w-6 h-6 flex-shrink-0 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <div className="flex-1">
          <p className={`font-semibold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
            Pattern Detected!
          </p>
          <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            {pattern.patternName}
          </p>
          {pattern.feminineReplacement && (
            <p className={`text-xs mt-2 italic ${
              isBambiMode ? 'text-green-600' : 'text-green-400'
            }`}>
              Try: {pattern.feminineReplacement}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onCatch(true)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            isBambiMode
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          Corrected
        </button>
        <button
          onClick={() => onCatch(false)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${
            isBambiMode
              ? 'bg-orange-500 text-white hover:bg-orange-600'
              : 'bg-orange-500 text-white hover:bg-orange-600'
          }`}
        >
          Slipped
        </button>
        <button
          onClick={onDismiss}
          className={`px-3 py-2 rounded-lg text-sm ${
            isBambiMode
              ? 'bg-pink-200 text-pink-700 hover:bg-pink-300'
              : 'bg-protocol-bg text-protocol-text-muted hover:bg-protocol-border'
          }`}
        >
          Later
        </button>
      </div>
    </div>
  );
}
