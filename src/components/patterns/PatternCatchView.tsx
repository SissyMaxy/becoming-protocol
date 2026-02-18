/**
 * Pattern Catch View
 *
 * Main view for tracking and dissolving masculine patterns.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Eye, Plus, AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  MasculinePattern,
  PatternStats,
  PATTERN_STATUS_LABELS,
} from '../../types/patterns';
import { getPatterns, getPatternStats } from '../../lib/patterns';
import { PatternCard } from './PatternCard';
import { AddPatternModal } from './AddPatternModal';
import { LogCatchModal } from './LogCatchModal';
import { PatternDetailModal } from './PatternDetailModal';

interface PatternCatchViewProps {
  onBack: () => void;
}

type ViewTab = 'active' | 'improving' | 'resolved';

export function PatternCatchView({ onBack }: PatternCatchViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [patterns, setPatterns] = useState<MasculinePattern[]>([]);
  const [stats, setStats] = useState<PatternStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>('active');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logPatternId, setLogPatternId] = useState<string | undefined>(undefined);
  const [selectedPattern, setSelectedPattern] = useState<MasculinePattern | null>(null);

  // Load patterns
  const loadPatterns = async () => {
    if (!user) return;
    setIsLoading(true);
    const [patternsData, statsData] = await Promise.all([
      getPatterns(user.id),
      getPatternStats(user.id),
    ]);
    setPatterns(patternsData);
    setStats(statsData);
    setIsLoading(false);
  };

  useEffect(() => {
    loadPatterns();
  }, [user]);

  // Filter patterns by status
  const getPatternsByTab = (tab: ViewTab): MasculinePattern[] => {
    switch (tab) {
      case 'active':
        return patterns.filter(p => p.status === 'active' || p.status === 'recurring');
      case 'improving':
        return patterns.filter(p => p.status === 'improving');
      case 'resolved':
        return patterns.filter(p => p.status === 'resolved');
    }
  };

  const handleLogCatch = (patternId?: string) => {
    setLogPatternId(patternId);
    setShowLogModal(true);
  };

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode; count: number }[] = [
    {
      id: 'active',
      label: 'Active',
      icon: <AlertCircle className="w-4 h-4" />,
      count: patterns.filter(p => p.status === 'active' || p.status === 'recurring').length,
    },
    {
      id: 'improving',
      label: 'Improving',
      icon: <TrendingUp className="w-4 h-4" />,
      count: patterns.filter(p => p.status === 'improving').length,
    },
    {
      id: 'resolved',
      label: 'Resolved',
      icon: <CheckCircle className="w-4 h-4" />,
      count: patterns.filter(p => p.status === 'resolved').length,
    },
  ];

  const currentPatterns = getPatternsByTab(activeTab);

  return (
    <div
      className={`min-h-screen ${
        isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 ${
          isBambiMode
            ? 'bg-pink-50/90 backdrop-blur-sm border-b border-pink-200'
            : 'bg-protocol-bg/90 backdrop-blur-sm border-b border-protocol-border'
        }`}
      >
        <button
          onClick={onBack}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <ArrowLeft
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          />
        </button>
        <div className="flex-1">
          <h1
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Pattern Dissolution
          </h1>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Track masculine patterns dissolving
          </p>
        </div>
        <Eye
          className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-red-400'}`}
        />
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="px-4 py-3">
          <div
            className={`grid grid-cols-4 gap-2 p-3 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface'
            }`}
          >
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-red-400'
                }`}
              >
                {stats.totalPatterns}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Patterns
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-amber-400'
                }`}
              >
                {stats.catchesToday}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Today
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-green-400'
                }`}
              >
                {stats.correctionRate}%
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Corrected
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                {stats.avgAutomaticity}%
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Auto
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pb-2">
        <div
          className={`flex gap-1 p-1 rounded-lg ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? isBambiMode
                    ? 'bg-white text-pink-600 shadow-sm'
                    : 'bg-protocol-bg text-protocol-text shadow-sm'
                  : isBambiMode
                  ? 'text-pink-400'
                  : 'text-protocol-text-muted'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`text-[10px] px-1.5 rounded-full ${
                    activeTab === tab.id
                      ? isBambiMode
                        ? 'bg-pink-100 text-pink-600'
                        : 'bg-protocol-surface text-protocol-text'
                      : isBambiMode
                      ? 'bg-pink-200/50 text-pink-500'
                      : 'bg-protocol-border text-protocol-text-muted'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-24">
        {/* Add Pattern Button */}
        <button
          onClick={() => setShowAddModal(true)}
          className={`w-full p-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 mb-4 transition-colors ${
            isBambiMode
              ? 'border-pink-300 text-pink-500 hover:bg-pink-50'
              : 'border-protocol-border text-protocol-text-muted hover:bg-protocol-surface'
          }`}
        >
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">Add Pattern</span>
        </button>

        {isLoading ? (
          <div className="text-center py-8">
            <div
              className={`text-sm ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              Loading patterns...
            </div>
          </div>
        ) : currentPatterns.length === 0 ? (
          <div className="text-center py-8">
            <Eye
              className={`w-10 h-10 mx-auto mb-2 ${
                isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
              }`}
            />
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              No {PATTERN_STATUS_LABELS[activeTab === 'active' ? 'active' : activeTab].toLowerCase()} patterns
            </p>
            {activeTab === 'active' && (
              <p
                className={`text-xs mt-1 ${
                  isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                }`}
              >
                Add a masculine pattern to start tracking
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {currentPatterns.map((pattern) => (
              <PatternCard
                key={pattern.id}
                pattern={pattern}
                onTap={() => setSelectedPattern(pattern)}
                onLogCatch={() => handleLogCatch(pattern.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB for quick logging */}
      {patterns.length > 0 && (
        <button
          onClick={() => handleLogCatch()}
          className={`fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          <AlertCircle className="w-6 h-6" />
        </button>
      )}

      {/* Add Pattern Modal */}
      {showAddModal && (
        <AddPatternModal
          onSubmit={loadPatterns}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Log Catch Modal */}
      {showLogModal && (
        <LogCatchModal
          patterns={patterns}
          initialPatternId={logPatternId}
          onSubmit={loadPatterns}
          onClose={() => {
            setShowLogModal(false);
            setLogPatternId(undefined);
          }}
        />
      )}

      {/* Pattern Detail Modal */}
      {selectedPattern && (
        <PatternDetailModal
          pattern={selectedPattern}
          onUpdate={loadPatterns}
          onLogCatch={() => {
            setSelectedPattern(null);
            handleLogCatch(selectedPattern.id);
          }}
          onClose={() => setSelectedPattern(null)}
        />
      )}
    </div>
  );
}
