/**
 * Protocol Analytics — "Is the protocol working?"
 *
 * Three sections answering:
 * 1. Is David showing up?
 * 2. Is the protocol changing behavior?
 * 3. Is he being transformed?
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Calendar,
  CheckCircle2,
  Target,
  Shield,
  ChevronDown,
  ChevronUp,
  Activity,
  Heart,
  Lock,
  Zap,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  loadProtocolAnalytics,
  type ProtocolAnalyticsData,
} from '../../lib/protocol-analytics';

interface ProtocolAnalyticsProps {
  onBack: () => void;
}

// ── Trend arrow helper ──
function TrendArrow({ current, previous, suffix }: { current: number | null; previous: number | null; suffix?: string }) {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  const pct = previous !== 0 ? Math.round((diff / previous) * 100) : 0;

  if (Math.abs(diff) < 0.3 && !suffix) {
    return <span className="text-gray-500 text-xs flex items-center gap-0.5"><Minus className="w-3 h-3" /> stable</span>;
  }

  const isUp = diff > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {suffix ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)} ${suffix}` : `${pct > 0 ? '+' : ''}${pct}%`}
    </span>
  );
}

// ── Metric card ──
function Metric({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-pink-400" />}
        <span className="text-gray-400 text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-100">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

// ── Section wrapper ──
function Section({ title, emoji, children, defaultOpen = true }: { title: string; emoji: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <h2 className="text-lg font-semibold text-gray-100">
          <span className="mr-2">{emoji}</span>{title}
        </h2>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

// ── Domain bar ──
function DomainBar({ domain, count, maxCount }: { domain: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-28 text-right truncate capitalize">{domain.replace(/_/g, ' ')}</span>
      <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${count === 0 ? 'bg-red-500/50' : 'bg-gradient-to-r from-pink-500 to-purple-500'}`}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className={`text-xs w-8 text-right ${count === 0 ? 'text-red-400' : 'text-gray-400'}`}>{count}</span>
    </div>
  );
}

// ── Stage label ──
function StageLabel({ label, stage }: { label: string; stage: string | null }) {
  if (!stage) return null;
  return (
    <div className="flex items-center justify-between bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-pink-300 font-medium capitalize">{stage.replace(/_/g, ' ')}</span>
    </div>
  );
}

// ── Main component ──
export function ProtocolAnalytics({ onBack }: ProtocolAnalyticsProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [data, setData] = useState<ProtocolAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    loadProtocolAnalytics(user.id)
      .then(setData)
      .catch(err => {
        console.error('Failed to load protocol analytics:', err);
        setError('Failed to load analytics data');
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin mb-3" />
        <p className="text-gray-400 text-sm">Loading protocol analytics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 p-6">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 mb-6">
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <p className="text-red-400 text-center mt-20">{error || 'No data available'}</p>
      </div>
    );
  }

  const { activity, behavior, transformation } = data;

  // Domain bar max
  const domainCounts = Object.values(behavior.domainTaskCounts);
  const maxDomainCount = domainCounts.length > 0 ? Math.max(...domainCounts) : 1;

  // All domains (include zeros)
  const allDomains = [
    'voice', 'movement', 'skincare', 'style', 'makeup', 'social',
    'body_language', 'inner_narrative', 'arousal', 'chastity', 'conditioning', 'identity',
  ];
  const domainEntries = allDomains
    .map(d => ({ domain: d, count: behavior.domainTaskCounts[d] || 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className={`min-h-screen pb-20 ${isBambiMode ? 'bg-pink-50' : 'bg-gradient-to-b from-gray-900 to-gray-950'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-gray-900/95 border-gray-800 backdrop-blur-sm'
      }`}>
        <button onClick={onBack} className={isBambiMode ? 'text-pink-600' : 'text-gray-400'}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className={`text-lg font-bold ${isBambiMode ? 'text-pink-800' : 'text-gray-100'}`}>
          Protocol Analytics
        </h1>
      </div>

      <div className="px-4 pt-4">

        {/* ===== SECTION 1: SHOWING UP ===== */}
        <Section title="Is David showing up?" emoji="📅">
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Current Streak"
              value={`${activity.streak.currentStreak}d`}
              icon={Flame}
              sub={<span className="text-gray-500 text-xs">Best: {activity.streak.longestStreak}d</span>}
            />
            <Metric
              label="Active Days (7d)"
              value={`${activity.activeDays7}/7`}
              icon={Calendar}
              sub={<span className="text-gray-500 text-xs">14d: {activity.activeDays14} · 30d: {activity.activeDays30}</span>}
            />
            <Metric
              label="Tasks This Week"
              value={activity.tasksThisWeek}
              icon={CheckCircle2}
              sub={<TrendArrow current={activity.tasksThisWeek} previous={activity.tasksLastWeek} />}
            />
            <Metric
              label="Task Completion"
              value={`${activity.taskCompletionRate}%`}
              icon={Target}
              sub={<span className="text-gray-500 text-xs">of assigned tasks (14d)</span>}
            />
          </div>

          {/* Gate compliance */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-pink-400" />
                Gate Compliance (7d)
              </span>
              <span className={`font-bold ${activity.gateComplianceRate >= 80 ? 'text-green-400' : activity.gateComplianceRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                {activity.gateComplianceRate}%
              </span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  activity.gateComplianceRate >= 80 ? 'bg-green-500' : activity.gateComplianceRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${activity.gateComplianceRate}%` }}
              />
            </div>
            <span className="text-gray-500 text-xs mt-1 block">{activity.gateCompletionsLast7} of ~{activity.gateExpectedLast7} elements</span>
          </div>
        </Section>

        {/* ===== SECTION 2: BEHAVIORAL CHANGE ===== */}
        <Section title="Is the protocol changing behavior?" emoji="📊">
          {/* Domain coverage */}
          <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Domain Coverage (30d)</h3>
            <div className="space-y-2">
              {domainEntries.map(d => (
                <DomainBar key={d.domain} domain={d.domain} count={d.count} maxCount={maxDomainCount} />
              ))}
            </div>
          </div>

          {/* Domain levels */}
          {behavior.domains.length > 0 && (
            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-sm font-medium text-gray-300 mb-3">Domain Levels</h3>
              <div className="space-y-2">
                {behavior.domains.map(d => (
                  <div key={d.domain} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-28 text-right truncate capitalize">{d.domain.replace(/_/g, ' ')}</span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500"
                        style={{ width: `${Math.min(d.currentLevel * 10, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-right">Lv{d.currentLevel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mood & alignment trends */}
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Mood (30d avg)"
              value={behavior.moodAvg30 !== null ? behavior.moodAvg30.toFixed(1) : '—'}
              icon={Heart}
              sub={<TrendArrow current={behavior.moodAvg30} previous={behavior.moodAvgPrior30} suffix="pts" />}
            />
            <Metric
              label="Fem. Alignment"
              value={behavior.femAlignAvg30 !== null ? behavior.femAlignAvg30.toFixed(1) : '—'}
              icon={Activity}
              sub={<TrendArrow current={behavior.femAlignAvg30} previous={behavior.femAlignAvgPrior30} suffix="pts" />}
            />
          </div>

          {/* Goals */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Goals</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-green-400 font-bold text-lg">{behavior.goalsGraduated}</span>
                <span className="text-gray-500 text-xs block">graduated</span>
              </div>
              <div>
                <span className="text-pink-400 font-bold text-lg">{behavior.goalsActive}</span>
                <span className="text-gray-500 text-xs block">active</span>
              </div>
              <div>
                <span className="text-gray-500 font-bold text-lg">{behavior.goalsAbandoned}</span>
                <span className="text-gray-500 text-xs block">abandoned</span>
              </div>
              <div>
                <span className="text-purple-400 font-bold text-lg">{behavior.goalAvgConsecutiveDays}</span>
                <span className="text-gray-500 text-xs block">avg streak</span>
              </div>
            </div>
          </div>

          {/* Commitments */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-sm">Commitment Honor Rate</span>
              <span className={`font-bold text-lg ${
                behavior.commitments.honorRate >= 70 ? 'text-green-400' : behavior.commitments.honorRate >= 40 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {behavior.commitments.honorRate}%
              </span>
            </div>
            <span className="text-gray-500 text-xs">
              {behavior.commitments.honored} honored · {behavior.commitments.pending} pending · {behavior.commitments.broken} broken
            </span>
          </div>
        </Section>

        {/* ===== SECTION 3: TRANSFORMATION ===== */}
        <Section title="Is he being transformed?" emoji="🦋">
          {/* Feminine state */}
          <div className="grid grid-cols-3 gap-3">
            <Metric
              label="Fem State (7d)"
              value={transformation.femStateAvg7 !== null ? transformation.femStateAvg7.toFixed(1) : '—'}
            />
            <Metric
              label="Fem State (14d)"
              value={transformation.femStateAvg14 !== null ? transformation.femStateAvg14.toFixed(1) : '—'}
            />
            <Metric
              label="Fem State (30d)"
              value={transformation.femStateAvg30 !== null ? transformation.femStateAvg30.toFixed(1) : '—'}
            />
          </div>

          {/* Pronouns */}
          {transformation.pronounRatio !== null && (
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Feminine Pronoun Ratio</span>
                <div className="flex items-center gap-2">
                  <span className="text-pink-300 font-bold">{transformation.pronounRatio}%</span>
                  {transformation.pronounTrend && (
                    <span className={`text-xs ${transformation.pronounTrend === 'up' ? 'text-green-400' : transformation.pronounTrend === 'down' ? 'text-red-400' : 'text-gray-500'}`}>
                      {transformation.pronounTrend === 'up' ? '↑' : transformation.pronounTrend === 'down' ? '↓' : '→'}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-3 bg-gray-700 rounded-full overflow-hidden flex">
                <div className="h-full bg-pink-500 rounded-l-full" style={{ width: `${transformation.pronounRatio}%` }} />
                <div className="h-full bg-blue-500/50 rounded-r-full flex-1" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-pink-400 text-[10px]">feminine</span>
                <span className="text-blue-400 text-[10px]">masculine</span>
              </div>
            </div>
          )}

          {/* Patterns */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Masculine Pattern Resolution</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-green-400 font-bold text-lg">{transformation.patternsResolved}</span>
                <span className="text-gray-500 text-xs block">resolved</span>
              </div>
              <div>
                <span className="text-yellow-400 font-bold text-lg">{transformation.patternsImproving}</span>
                <span className="text-gray-500 text-xs block">improving</span>
              </div>
              <div>
                <span className="text-red-400 font-bold text-lg">{transformation.patternsActive}</span>
                <span className="text-gray-500 text-xs block">active</span>
              </div>
            </div>
          </div>

          {/* Conditioning */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Conditioning</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-green-400 font-bold text-lg">{transformation.conditioningEstablished}</span>
                <span className="text-gray-500 text-xs block">established</span>
              </div>
              <div>
                <span className="text-pink-400 font-bold text-lg">{transformation.conditioningInProgress}</span>
                <span className="text-gray-500 text-xs block">in progress</span>
              </div>
              {transformation.avgAutomaticity !== null && (
                <div>
                  <span className="text-purple-400 font-bold text-lg">{transformation.avgAutomaticity}%</span>
                  <span className="text-gray-500 text-xs block">automaticity</span>
                </div>
              )}
            </div>
          </div>

          {/* Stage progression */}
          <StageLabel label="Service Stage" stage={transformation.serviceStage} />
          <StageLabel label="Gina Emergence" stage={transformation.ginaStage} />

          {/* Denial & sessions */}
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Denial Day"
              value={transformation.denialCurrentDay}
              icon={Lock}
              sub={<span className="text-gray-500 text-xs">Lifetime: {transformation.denialTotalDays}d</span>}
            />
            <Metric
              label="Escalations (30d)"
              value={transformation.escalationEventsLast30}
              icon={Zap}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Total Sessions"
              value={transformation.sessions.totalSessions}
              icon={Users}
              sub={<span className="text-gray-500 text-xs">{transformation.sessions.totalMinutes} min total</span>}
            />
            <Metric
              label="Total Edges"
              value={transformation.sessions.totalEdges}
              sub={<span className="text-gray-500 text-xs">avg {transformation.sessions.averageDuration} min/session</span>}
            />
          </div>
        </Section>

      </div>
    </div>
  );
}

export default ProtocolAnalytics;
