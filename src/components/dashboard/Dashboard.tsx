/**
 * Unified Dashboard
 *
 * Phase G1: 8 sections combining identity state, domain progress,
 * pipeline summary, streaks, evidence, investments, milestones, commitments.
 */

import { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  loadDashboardData,
  getStreakCalendarData,
  type DashboardData,
  type DomainLevel,
  type CalendarDay,
} from '../../lib/dashboard-analytics';
import { getGinaConversionState, type GinaConversionState } from '../../lib/gina-pipeline';
import { IdentityOdometer } from './IdentityOdometer';
import { StreakCalendar } from './StreakCalendar';
import { EvidenceGallery } from './EvidenceGallery';
import { MilestoneTimeline } from './MilestoneTimeline';

// ── Pipeline channel labels ──
const PIPELINE_CHANNELS = [
  'Language', 'Touch', 'Clothing', 'Service', 'Social',
  'Bedroom', 'Finance', 'Identity', 'Ritual', 'Authority',
] as const;

// ── Sub-components ──

function DomainProgressSection({ domains, isBambiMode }: { domains: DomainLevel[]; isBambiMode: boolean }) {
  if (domains.length === 0) {
    return (
      <p className={`text-sm text-center py-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
        No domain progress yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {domains.map(d => {
        const pct = Math.min(d.currentLevel * 10, 100);
        return (
          <div key={d.domain}>
            <div className="flex justify-between text-xs mb-1">
              <span className={isBambiMode ? 'text-pink-700' : 'text-gray-300'}>
                {d.domain.replace(/_/g, ' ')}
              </span>
              <span className={isBambiMode ? 'text-pink-500' : 'text-gray-500'}>
                Lv {d.currentLevel}
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isBambiMode ? 'bg-pink-100' : 'bg-white/10'}`}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isBambiMode ? '#ec4899' : '#a855f7',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PipelineSummarySection({ gina, isBambiMode }: { gina: GinaConversionState | null; isBambiMode: boolean }) {
  if (!gina) {
    return (
      <p className={`text-sm text-center py-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
        Pipeline not initialized
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
          Stance: {gina.currentStance}
        </span>
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
          Pressure: {gina.escalationPressure}%
        </span>
      </div>
      {PIPELINE_CHANNELS.map(ch => {
        const key = ch.toLowerCase();
        const dp = gina.domainProgress?.[key];
        const level = dp?.level || 0;
        const locked = dp?.locked ?? true;
        const pct = Math.min(level * 10, 100);
        return (
          <div key={ch} className="flex items-center gap-2">
            <span className={`text-[10px] w-16 text-right ${
              locked
                ? isBambiMode ? 'text-pink-300' : 'text-gray-600'
                : isBambiMode ? 'text-pink-600' : 'text-gray-300'
            }`}>
              {ch}
            </span>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isBambiMode ? 'bg-pink-100' : 'bg-white/10'}`}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: locked
                    ? isBambiMode ? '#f9a8d4' : '#4a4a6a'
                    : isBambiMode ? '#ec4899' : '#a855f7',
                }}
              />
            </div>
            <span className={`text-[10px] w-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              {level}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CommitmentStatusSection({ commitments, isBambiMode }: {
  commitments: DashboardData['commitments'];
  isBambiMode: boolean;
}) {
  const segments = [
    { label: 'Honored', value: commitments.honored, color: '#22c55e' },
    { label: 'Pending', value: commitments.pending, color: '#f59e0b' },
    { label: 'Broken', value: commitments.broken, color: '#ef4444' },
  ];

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        {segments.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className={`text-center text-xs ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
        Honor Rate: {commitments.honorRate}%
      </div>
      {/* Mini bar */}
      {commitments.total > 0 && (
        <div className={`h-2 rounded-full overflow-hidden mt-2 flex ${isBambiMode ? 'bg-pink-100' : 'bg-white/10'}`}>
          {segments.map(s => (
            s.value > 0 && (
              <div
                key={s.label}
                className="h-full"
                style={{
                  width: `${(s.value / commitments.total) * 100}%`,
                  backgroundColor: s.color,
                }}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ──

function Section({ title, icon, children, isBambiMode }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isBambiMode: boolean;
}) {
  return (
    <div className={`rounded-lg p-4 ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <h3 className={`text-sm font-medium mb-3 flex items-center gap-1.5 ${
        isBambiMode ? 'text-pink-800' : 'text-protocol-text'
      }`}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Main Dashboard ──

export function Dashboard() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [data, setData] = useState<DashboardData | null>(null);
  const [gina, setGina] = useState<GinaConversionState | null>(null);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [dashData, ginaState, calData] = await Promise.all([
        loadDashboardData(user.id),
        getGinaConversionState(user.id),
        getStreakCalendarData(user.id),
      ]);
      setData(dashData);
      setGina(ginaState);
      setCalendar(calData);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className={`w-6 h-6 animate-spin ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
          Dashboard
        </h2>
        <button
          onClick={load}
          className={`p-2 rounded-lg ${isBambiMode ? 'text-pink-500 hover:bg-pink-50' : 'text-gray-400 hover:bg-white/5'}`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 1. Identity Odometer */}
      <IdentityOdometer state={data.odometer} />

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`rounded-lg p-3 text-center ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}>
            {data.streak.currentStreak}
          </div>
          <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Day Streak</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}>
            {data.sessions.totalSessions}
          </div>
          <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Sessions</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <div className={`text-xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}>
            {data.sessions.totalEdges}
          </div>
          <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>Total Edges</div>
        </div>
      </div>

      {/* 2. Domain Progress */}
      <Section
        title={`Domain Progress (${data.domains.length})`}
        icon={<TrendingUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-green-400'}`} />}
        isBambiMode={isBambiMode}
      >
        <DomainProgressSection domains={data.domains} isBambiMode={isBambiMode} />
      </Section>

      {/* 3. Gina Pipeline Summary */}
      <Section
        title="Pipeline Summary"
        icon={<TrendingUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />}
        isBambiMode={isBambiMode}
      >
        <PipelineSummarySection gina={gina} isBambiMode={isBambiMode} />
      </Section>

      {/* 4. Streak Calendar */}
      <StreakCalendar data={calendar} />

      {/* 5. Evidence Gallery */}
      <EvidenceGallery evidence={data.evidence} compact />

      {/* 6. Investment Total */}
      <Section
        title="Investments"
        icon={<DollarSign className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-green-400'}`} />}
        isBambiMode={isBambiMode}
      >
        <div className="text-center">
          <div className={`text-3xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-green-400'}`}>
            ${data.investments.totalAmount.toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
            {data.investments.totalItems} items across {Object.keys(data.investments.categoryBreakdown).length} categories
          </div>
          {Object.keys(data.investments.categoryBreakdown).length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {Object.entries(data.investments.categoryBreakdown).map(([cat, amount]) => (
                <span
                  key={cat}
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {cat}: ${amount.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* 7. Milestone Timeline */}
      <MilestoneTimeline milestones={data.milestones} compact />

      {/* 8. Commitment Status */}
      <Section
        title={`Commitments (${data.commitments.total})`}
        icon={<Shield className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-blue-400'}`} />}
        isBambiMode={isBambiMode}
      >
        <CommitmentStatusSection commitments={data.commitments} isBambiMode={isBambiMode} />
      </Section>
    </div>
  );
}
