// ============================================
// Revenue Dashboard
// Monthly targets, earnings tracking, growth health
// ============================================

import { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Target,
  Loader2,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { RevenueAnalytics, RevenueIntelligence } from '../../types/cam';
import {
  getRevenueIntelligence,
  getMonthlyAnalytics,
  getActiveMilestones,
  assessGrowthHealth,
} from '../../lib/content/revenue-engine';
import type { GrowthAssessment } from '../../lib/content/revenue-engine';

export function RevenueDashboard() {
  const { user } = useAuth();

  const [intelligence, setIntelligence] = useState<RevenueIntelligence | null>(null);
  const [monthlyData, setMonthlyData] = useState<RevenueAnalytics[]>([]);
  const [milestones, setMilestones] = useState<Array<{
    id: string; title: string; targetCents: number; currentCents: number; percentFunded: number; status: string;
  }>>([]);
  const [growthHealth, setGrowthHealth] = useState<GrowthAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [intel, monthly, miles] = await Promise.all([
          getRevenueIntelligence(user!.id),
          getMonthlyAnalytics(user!.id, 6),
          getActiveMilestones(user!.id),
        ]);
        setIntelligence(intel);
        setMonthlyData(monthly);
        setMilestones(miles);
        setGrowthHealth(assessGrowthHealth(intel));
      } catch (err) {
        console.error('Failed to load revenue data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  if (!intelligence) return null;

  const monthlyProgress = intelligence.monthlyTarget > 0
    ? Math.min((intelligence.currentMonthly / intelligence.monthlyTarget) * 100, 100)
    : 0;

  const isOnTrack = intelligence.projectedMonthly >= intelligence.monthlyTarget;

  return (
    <div className="space-y-4">
      {/* Monthly Target Card */}
      <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-protocol-text">Monthly Revenue</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isOnTrack
              ? 'bg-green-500/20 text-green-400'
              : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {isOnTrack ? 'On Track' : 'Behind Target'}
          </span>
        </div>

        {/* Big number */}
        <div className="text-center mb-3">
          <p className="text-3xl font-mono font-bold text-protocol-text">
            ${(intelligence.currentMonthly / 100).toLocaleString()}
          </p>
          <p className="text-xs text-protocol-text-muted mt-1">
            of ${(intelligence.monthlyTarget / 100).toLocaleString()} target
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2.5 bg-protocol-surface-light rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isOnTrack ? 'bg-green-400' : 'bg-yellow-400'
              }`}
              style={{ width: `${monthlyProgress}%` }}
            />
          </div>
        </div>

        {/* Projections */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {isOnTrack ? (
              <TrendingUp className="w-3 h-3 text-green-400" />
            ) : (
              <TrendingDown className="w-3 h-3 text-yellow-400" />
            )}
            <span className="text-xs text-protocol-text-muted">
              Projected: ${(intelligence.projectedMonthly / 100).toLocaleString()}
            </span>
          </div>
          {intelligence.monthsToTarget !== null && intelligence.monthsToTarget > 0 && (
            <span className="text-xs text-protocol-text-muted">
              ~{intelligence.monthsToTarget}mo to target
            </span>
          )}
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-protocol-text-muted" />
          <span className="text-sm font-semibold text-protocol-text">Revenue Channels</span>
        </div>
        <div className="space-y-2">
          <ChannelBar
            label="Subscriptions"
            amount={monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].subscriptionCents : 0}
            total={intelligence.currentMonthly}
            color="bg-blue-400"
          />
          <ChannelBar
            label="Tips"
            amount={monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].tipCents : 0}
            total={intelligence.currentMonthly}
            color="bg-green-400"
          />
          <ChannelBar
            label="Cam"
            amount={monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].camCents : 0}
            total={intelligence.currentMonthly}
            color="bg-purple-400"
          />
          <ChannelBar
            label="PPV"
            amount={monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].ppvCents : 0}
            total={intelligence.currentMonthly}
            color="bg-pink-400"
          />
          <ChannelBar
            label="Donations"
            amount={monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].donationCents : 0}
            total={intelligence.currentMonthly}
            color="bg-yellow-400"
          />
        </div>
      </div>

      {/* Funding Milestones */}
      {milestones.length > 0 && (
        <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-sm font-semibold text-protocol-text">Funding Milestones</span>
          </div>
          <div className="space-y-3">
            {milestones.map(m => (
              <div key={m.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-protocol-text">{m.title}</span>
                  <span className="text-xs text-protocol-text-muted">
                    {Math.round(m.percentFunded * 100)}%
                  </span>
                </div>
                <div className="h-1.5 bg-protocol-surface-light rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      m.status === 'funded' ? 'bg-green-400' : 'bg-blue-400'
                    }`}
                    style={{ width: `${Math.min(m.percentFunded * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[10px] text-protocol-text-muted">
                    ${(m.currentCents / 100).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-protocol-text-muted">
                    ${(m.targetCents / 100).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growth Health */}
      {growthHealth && !growthHealth.healthy && (
        <div className="p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">Growth Alert</span>
          </div>
          <ul className="space-y-1">
            {growthHealth.actions.map((action, i) => (
              <li key={i} className="text-xs text-protocol-text-muted flex items-start gap-1.5">
                <span className="text-yellow-400 mt-0.5">•</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      )}

      {growthHealth && growthHealth.healthy && (
        <div className="p-3 rounded-xl border border-green-500/20 bg-green-500/5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-green-400">Growth is healthy. Keep going.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function ChannelBar({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs text-protocol-text-muted">{label}</span>
        <span className="text-xs text-protocol-text">
          ${(amount / 100).toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 bg-protocol-surface-light rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
