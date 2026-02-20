/**
 * Content Dashboard — Handler-only view.
 *
 * Dark monospace aesthetic. David doesn't navigate here.
 * Shows calendar, vault status, distribution performance,
 * revenue, active arc, fan intelligence, platform health.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, BarChart2, Users, DollarSign, TrendingUp,
  Loader2, Eye, Heart, MessageSquare, Clock,
} from 'lucide-react';
import { useContentPipeline } from '../../hooks/useContentPipeline';
import { getCalendar, getDistributionHistory, getTopFans, getFanCount } from '../../lib/content-pipeline';
import { useAuth } from '../../context/AuthContext';
import type {
  ContentCalendarDay,
  Distribution,
  FanProfile,
} from '../../types/content-pipeline';

interface ContentDashboardProps {
  onBack: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ContentDashboard({ onBack }: ContentDashboardProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const { vaultStats, todaySchedule, activeArc, revenueSummary, isLoading } = useContentPipeline();

  const [calendar, setCalendar] = useState<ContentCalendarDay[]>([]);
  const [recentDistributions, setRecentDistributions] = useState<Distribution[]>([]);
  const [topFans, setTopFans] = useState<FanProfile[]>([]);
  const [fanCount, setFanCount] = useState(0);

  const loadDashboardData = useCallback(async () => {
    if (!userId) return;

    const now = new Date();
    const start = now.toISOString().split('T')[0];
    const end = new Date(now.getTime() + 28 * 86400000).toISOString().split('T')[0];
    const histStart = new Date(now.getTime() - 30 * 86400000).toISOString();

    const [cal, dist, fans, count] = await Promise.allSettled([
      getCalendar(userId, start, end),
      getDistributionHistory(userId, histStart, now.toISOString()),
      getTopFans(userId, 10),
      getFanCount(userId),
    ]);

    if (cal.status === 'fulfilled') setCalendar(cal.value);
    if (dist.status === 'fulfilled') setRecentDistributions(dist.value);
    if (fans.status === 'fulfilled') setTopFans(fans.value);
    if (count.status === 'fulfilled') setFanCount(count.value);
  }, [userId]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-white/40 text-xs">
          &larr; back
        </button>
        <h1 className="text-green-400 text-sm font-bold tracking-wider">CONTENT DASHBOARD</h1>
        <div className="w-12" />
      </div>

      <div className="space-y-6">

        {/* Revenue Overview */}
        <section className="bg-zinc-950 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-green-400" />
            <h2 className="text-green-400 text-xs font-bold tracking-wider">REVENUE</h2>
          </div>
          {revenueSummary ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/40 text-xs">All time</p>
                <p className="text-white text-lg">{formatCents(revenueSummary.total_cents)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">This month</p>
                <p className="text-white text-lg">{formatCents(revenueSummary.this_month_cents)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Last 30d</p>
                <p className="text-white text-lg">{formatCents(revenueSummary.last_30d_cents)}</p>
              </div>
              <div>
                <p className="text-white/40 text-xs">Trend</p>
                <p className={`text-lg ${
                  revenueSummary.trend === 'up' ? 'text-green-400' :
                  revenueSummary.trend === 'down' ? 'text-red-400' :
                  'text-white/60'
                }`}>
                  <TrendingUp className="w-4 h-4 inline mr-1" />
                  {revenueSummary.trend}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-white/30 text-xs">No revenue data yet.</p>
          )}
          {revenueSummary && Object.keys(revenueSummary.by_platform).length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-white/40 text-xs mb-1">By platform:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(revenueSummary.by_platform).map(([platform, cents]) => (
                  <span key={platform} className="text-xs bg-white/5 text-white/60 px-2 py-0.5 rounded">
                    {platform}: {formatCents(cents)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Vault Status */}
        <section className="bg-zinc-950 border border-purple-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-purple-400" />
            <h2 className="text-purple-400 text-xs font-bold tracking-wider">VAULT STATUS</h2>
          </div>
          {vaultStats ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-yellow-400 text-lg">{vaultStats.pending}</p>
                <p className="text-white/40 text-xs">pending</p>
              </div>
              <div className="text-center">
                <p className="text-green-400 text-lg">{vaultStats.approved + vaultStats.auto_approved}</p>
                <p className="text-white/40 text-xs">approved</p>
              </div>
              <div className="text-center">
                <p className="text-blue-400 text-lg">{vaultStats.distributed}</p>
                <p className="text-white/40 text-xs">posted</p>
              </div>
            </div>
          ) : (
            <p className="text-white/30 text-xs">No vault data.</p>
          )}
        </section>

        {/* Today's Schedule */}
        <section className="bg-zinc-950 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-blue-400" />
            <h2 className="text-blue-400 text-xs font-bold tracking-wider">TODAY&apos;S SCHEDULE</h2>
          </div>
          {todaySchedule.length > 0 ? (
            <div className="space-y-2">
              {todaySchedule.map(dist => (
                <div key={dist.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      dist.post_status === 'posted' ? 'bg-green-500/20 text-green-400' :
                      dist.post_status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-white/5 text-white/40'
                    }`}>
                      {dist.post_status}
                    </span>
                    <span className="text-white/60 text-xs">{dist.platform}</span>
                  </div>
                  <span className="text-white/30 text-xs">
                    {dist.scheduled_at ? new Date(dist.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/30 text-xs">No posts scheduled today.</p>
          )}
        </section>

        {/* Active Arc */}
        {activeArc && (
          <section className="bg-zinc-950 border border-pink-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-pink-400" />
              <h2 className="text-pink-400 text-xs font-bold tracking-wider">ACTIVE ARC</h2>
            </div>
            <p className="text-white/80 text-sm mb-2">{activeArc.title}</p>
            <p className="text-white/40 text-xs mb-3">
              {activeArc.arc_type} | Beat {activeArc.current_beat}/{activeArc.beats.length}
            </p>
            <div className="space-y-1">
              {activeArc.beats.map((beat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    beat.status === 'completed' ? 'bg-green-400' :
                    beat.status === 'active' ? 'bg-blue-400 animate-pulse' :
                    beat.status === 'skipped' ? 'bg-white/20' :
                    'bg-white/10'
                  }`} />
                  <span className={`text-xs ${
                    beat.status === 'completed' ? 'text-white/60' :
                    beat.status === 'active' ? 'text-white/80' :
                    'text-white/30'
                  }`}>
                    W{beat.week}: {beat.beat}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Content Calendar (4-week grid) */}
        {calendar.length > 0 && (
          <section className="bg-zinc-950 border border-cyan-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h2 className="text-cyan-400 text-xs font-bold tracking-wider">CONTENT CALENDAR</h2>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendar.slice(0, 28).map(day => {
                const slotCount = day.slots?.length || 0;
                const filledCount = day.slots?.filter(
                  (s: { status: string }) => s.status !== 'open'
                ).length || 0;
                return (
                  <div
                    key={day.calendar_date}
                    className={`aspect-square rounded flex flex-col items-center justify-center text-xs ${
                      filledCount > 0 ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-white/5'
                    }`}
                  >
                    <span className="text-white/40">{new Date(day.calendar_date + 'T12:00:00').getDate()}</span>
                    {slotCount > 0 && (
                      <span className="text-cyan-400 text-[10px]">{filledCount}/{slotCount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Distribution Performance */}
        {recentDistributions.length > 0 && (
          <section className="bg-zinc-950 border border-orange-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <h2 className="text-orange-400 text-xs font-bold tracking-wider">RECENT PERFORMANCE</h2>
            </div>
            <div className="space-y-2">
              {recentDistributions.slice(0, 10).map(dist => (
                <div key={dist.id} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                  <div>
                    <span className="text-white/60 text-xs">{dist.platform}</span>
                    <span className="text-white/30 text-xs ml-2">
                      {dist.posted_at ? formatDate(dist.posted_at) : 'scheduled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-white/40 flex items-center gap-1">
                      <Eye className="w-3 h-3" />{dist.views}
                    </span>
                    <span className="text-pink-400/60 flex items-center gap-1">
                      <Heart className="w-3 h-3" />{dist.likes}
                    </span>
                    <span className="text-blue-400/60 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />{dist.comments}
                    </span>
                    {dist.tips_cents > 0 && (
                      <span className="text-green-400">
                        {formatCents(dist.tips_cents)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Fan Intelligence */}
        <section className="bg-zinc-950 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-yellow-400" />
            <h2 className="text-yellow-400 text-xs font-bold tracking-wider">FAN INTELLIGENCE</h2>
          </div>
          <p className="text-white/40 text-xs mb-2">{fanCount} total fans tracked</p>
          {topFans.length > 0 ? (
            <div className="space-y-1">
              {topFans.slice(0, 5).map(fan => (
                <div key={fan.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      fan.fan_tier === 'whale' ? 'bg-yellow-500/20 text-yellow-400' :
                      fan.fan_tier === 'supporter' ? 'bg-purple-500/20 text-purple-400' :
                      fan.fan_tier === 'regular' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-white/5 text-white/40'
                    }`}>
                      {fan.fan_tier}
                    </span>
                    <span className="text-white/60 text-xs">{fan.username}</span>
                    <span className="text-white/30 text-xs">{fan.platform}</span>
                  </div>
                  <span className="text-green-400/60 text-xs">
                    {formatCents(fan.total_spent_cents)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/30 text-xs">No fan data yet.</p>
          )}
        </section>

      </div>
    </div>
  );
}
