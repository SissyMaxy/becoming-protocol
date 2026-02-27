/**
 * FanDashboard — 4-tab fan management view.
 * Needs Review | Curated Praise | Activity Log | Fan Roster
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, Loader2, Check, X, MessageCircle, Heart, Users,
  DollarSign, Clock,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getPendingInteractions,
  getFanInteractions,
  approveInteractionResponse,
  getTopFans,
} from '../../lib/content-pipeline';
import { getCuratedPraise } from '../../lib/content/fan-interaction-processor';
import type { FanInteraction, FanProfile } from '../../types/content-pipeline';

interface FanDashboardProps {
  onBack: () => void;
}

type Tab = 'review' | 'praise' | 'log' | 'roster';

const TABS: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'review', label: 'Review', icon: MessageCircle },
  { id: 'praise', label: 'Praise', icon: Heart },
  { id: 'log', label: 'Activity', icon: Clock },
  { id: 'roster', label: 'Roster', icon: Users },
];

const TIER_BADGES: Record<string, { bambi: string; dark: string }> = {
  whale: { bambi: 'bg-yellow-100 text-yellow-700', dark: 'bg-yellow-900/20 text-yellow-400' },
  gfe: { bambi: 'bg-purple-100 text-purple-700', dark: 'bg-purple-900/20 text-purple-400' },
  supporter: { bambi: 'bg-blue-100 text-blue-700', dark: 'bg-blue-900/20 text-blue-400' },
  regular: { bambi: 'bg-gray-100 text-gray-600', dark: 'bg-gray-700/30 text-gray-400' },
  casual: { bambi: 'bg-gray-50 text-gray-500', dark: 'bg-gray-800/20 text-gray-500' },
};

export function FanDashboard({ onBack }: FanDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('review');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingReview, setPendingReview] = useState<FanInteraction[]>([]);
  const [praise, setPraise] = useState<FanInteraction[]>([]);
  const [activityLog, setActivityLog] = useState<FanInteraction[]>([]);
  const [roster, setRoster] = useState<FanProfile[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const results = await Promise.allSettled([
      getPendingInteractions(user.id),
      getCuratedPraise(user.id),
      getFanInteractions(user.id, { limit: 50 }),
      getTopFans(user.id, 50),
    ]);

    if (results[0].status === 'fulfilled') setPendingReview(results[0].value);
    if (results[1].status === 'fulfilled') setPraise(results[1].value);
    if (results[2].status === 'fulfilled') setActivityLog(results[2].value);
    if (results[3].status === 'fulfilled') setRoster(results[3].value);

    setIsLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApprove = async (id: string) => {
    if (!user) return;
    const success = await approveInteractionResponse(id, user.id);
    if (success) {
      setPendingReview(prev => prev.filter(i => i.id !== id));
    }
  };

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button onClick={onBack} className={muted}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className={`text-lg font-bold ${text}`}>Fan Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-4">
        {TABS.map(t => {
          const Icon = t.icon;
          const count = t.id === 'review' ? pendingReview.length : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id
                  ? isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
                  : muted
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                  isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {/* Needs Review */}
          {tab === 'review' && (
            pendingReview.length === 0 ? (
              <p className={`text-sm text-center py-10 ${muted}`}>No interactions need review.</p>
            ) : (
              pendingReview.map(item => (
                <div key={item.id} className={`rounded-xl border p-3 ${card}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${text}`}>@{item.fan_username}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        TIER_BADGES[item.fan_tier || 'casual']?.[isBambiMode ? 'bambi' : 'dark'] || ''
                      }`}>{item.fan_tier}</span>
                    </div>
                    <span className={`text-[10px] ${muted}`}>{item.fan_platform}</span>
                  </div>
                  {item.content && (
                    <p className={`text-xs mb-2 ${muted}`}>{item.content}</p>
                  )}
                  {item.handler_response && (
                    <div className={`p-2 rounded-lg mb-2 text-xs ${
                      isBambiMode ? 'bg-blue-50 text-blue-700' : 'bg-blue-900/10 text-blue-400'
                    }`}>
                      Draft: {item.handler_response}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-green-100 text-green-600' : 'bg-emerald-900/20 text-emerald-400'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium ${
                        isBambiMode ? 'bg-gray-100 text-gray-500' : 'bg-gray-700/20 text-gray-400'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" /> Ignore
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {/* Curated Praise */}
          {tab === 'praise' && (
            praise.length === 0 ? (
              <p className={`text-sm text-center py-10 ${muted}`}>No curated praise yet.</p>
            ) : (
              praise.map(item => (
                <div key={item.id} className={`rounded-xl border p-3 ${card}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Heart className={`w-3.5 h-3.5 ${isBambiMode ? 'text-pink-400' : 'text-red-400'}`} />
                    <span className={`font-medium text-sm ${text}`}>@{item.fan_username}</span>
                    <span className={`text-[10px] ${muted}`}>{item.fan_platform}</span>
                  </div>
                  <p className={`text-xs ${text}`}>{item.content}</p>
                  {item.tip_amount_cents > 0 && (
                    <div className={`flex items-center gap-1 mt-1 text-[10px] ${
                      isBambiMode ? 'text-green-600' : 'text-emerald-400'
                    }`}>
                      <DollarSign className="w-3 h-3" />
                      ${(item.tip_amount_cents / 100).toFixed(2)}
                    </div>
                  )}
                </div>
              ))
            )
          )}

          {/* Activity Log */}
          {tab === 'log' && (
            activityLog.length === 0 ? (
              <p className={`text-sm text-center py-10 ${muted}`}>No activity logged yet.</p>
            ) : (
              activityLog.map(item => (
                <div key={item.id} className={`flex items-center gap-3 py-2 border-b ${
                  isBambiMode ? 'border-gray-100' : 'border-protocol-border'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${text}`}>@{item.fan_username}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isBambiMode ? 'bg-gray-100 text-gray-500' : 'bg-protocol-surface text-protocol-text-muted'
                      }`}>{item.interaction_type}</span>
                    </div>
                    {item.content && (
                      <p className={`text-[10px] ${muted} truncate`}>{item.content}</p>
                    )}
                  </div>
                  {item.sentiment && (
                    <span className={`text-[10px] ${muted}`}>{item.sentiment}</span>
                  )}
                </div>
              ))
            )
          )}

          {/* Fan Roster */}
          {tab === 'roster' && (
            roster.length === 0 ? (
              <p className={`text-sm text-center py-10 ${muted}`}>No fans tracked yet.</p>
            ) : (
              roster.map(fan => (
                <div key={fan.id} className={`flex items-center gap-3 py-2 border-b ${
                  isBambiMode ? 'border-gray-100' : 'border-protocol-border'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${text}`}>@{fan.username}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        TIER_BADGES[fan.fan_tier]?.[isBambiMode ? 'bambi' : 'dark'] || ''
                      }`}>{fan.fan_tier}</span>
                    </div>
                    <div className={`text-[10px] ${muted}`}>
                      {fan.platform} &middot; {fan.message_count} msgs &middot; {fan.tip_count} tips
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-medium ${text}`}>
                      ${(fan.total_spent_cents / 100).toFixed(0)}
                    </div>
                    <div className={`text-[10px] ${muted}`}>
                      score {fan.engagement_score}
                    </div>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      )}
    </div>
  );
}
