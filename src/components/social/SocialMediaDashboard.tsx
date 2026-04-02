/**
 * Social Media Dashboard — real-time view of the auto-poster engine.
 * Shows platform stats, scheduled queue, recent posts/replies, quality metrics.
 */

import { useState, useEffect } from 'react';
import {
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  loadSocialDashboard,
  type SocialDashboardData,
  type PlatformStats,
  type RecentPost,
  type DailyActivity,
} from '../../lib/social-media-analytics';

interface Props {
  onBack: () => void;
}

// ── Platform icons / colors ──────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  reddit: '#FF4500',
  fetlife: '#E84F6A',
  fansly: '#1FA2F1',
  onlyfans: '#00AFF0',
  sniffies: '#FFD700',
};

const PLATFORM_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  reddit: 'Reddit',
  fetlife: 'FetLife',
  fansly: 'Fansly',
  onlyfans: 'OnlyFans',
  sniffies: 'Sniffies',
};

// ── Subcomponents ────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
      <div className="text-xs text-protocol-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-1" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="text-xs text-protocol-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function PlatformRow({ stats }: { stats: PlatformStats }) {
  const color = PLATFORM_COLORS[stats.platform] || '#888';
  const label = PLATFORM_LABELS[stats.platform] || stats.platform;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-protocol-border bg-protocol-surface">
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-protocol-text">{label}</div>
        <div className="text-xs text-protocol-text-muted flex gap-3 mt-0.5">
          <span>{stats.postsToday} posts today</span>
          <span>{stats.repliesToday} replies today</span>
          {stats.scheduledCount > 0 && <span className="text-blue-400">{stats.scheduledCount} queued</span>}
          {stats.failedToday > 0 && <span className="text-red-400">{stats.failedToday} failed</span>}
        </div>
      </div>
      <div className="text-right text-xs text-protocol-text-muted">
        <div>{stats.postsThisWeek + stats.repliesThisWeek} this week</div>
      </div>
    </div>
  );
}

function PostItem({ post }: { post: RecentPost }) {
  const color = PLATFORM_COLORS[post.platform] || '#888';
  const time = post.postedAt || post.scheduledAt;
  const timeLabel = time ? new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const isReply = post.contentType === 'reply';

  return (
    <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs text-protocol-text-muted">
          {PLATFORM_LABELS[post.platform] || post.platform}
          {isReply && post.targetAccount && ` reply to @${post.targetAccount}`}
          {!isReply && post.targetSubreddit && ` r/${post.targetSubreddit}`}
          {post.generationStrategy && ` / ${post.generationStrategy}`}
        </span>
        <span className="text-xs text-protocol-text-muted ml-auto">{timeLabel}</span>
        {post.status === 'scheduled' && <Clock className="w-3 h-3 text-blue-400" />}
        {post.status === 'posted' && <CheckCircle2 className="w-3 h-3 text-green-400" />}
        {post.status === 'failed' && <XCircle className="w-3 h-3 text-red-400" />}
      </div>
      <div className="text-sm text-protocol-text leading-relaxed">
        {post.content.length > 200 ? post.content.substring(0, 200) + '...' : post.content}
      </div>
    </div>
  );
}

function ActivityChart({ data }: { data: DailyActivity[] }) {
  const maxVal = Math.max(...data.map(d => d.posts + d.replies + d.failed), 1);

  return (
    <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-protocol-text-muted" />
        <span className="text-sm font-medium text-protocol-text">14-Day Activity</span>
      </div>
      <div className="flex items-end gap-1 h-24">
        {data.map((day) => {
          const total = day.posts + day.replies + day.failed;
          const height = total > 0 ? Math.max((total / maxVal) * 100, 4) : 0;
          const postPct = total > 0 ? (day.posts / total) * 100 : 0;
          const replyPct = total > 0 ? (day.replies / total) * 100 : 0;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${day.date}: ${day.posts}p ${day.replies}r ${day.failed}f`}>
              <div className="w-full rounded-sm overflow-hidden" style={{ height: `${height}%` }}>
                {day.failed > 0 && (
                  <div className="bg-red-500/60 w-full" style={{ height: `${100 - postPct - replyPct}%` }} />
                )}
                {day.replies > 0 && (
                  <div className="bg-blue-500/60 w-full" style={{ height: `${replyPct}%` }} />
                )}
                {day.posts > 0 && (
                  <div className="bg-green-500/60 w-full" style={{ height: `${postPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-protocol-text-muted">
          {data[0]?.date ? new Date(data[0].date + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
        </span>
        <span className="text-[10px] text-protocol-text-muted">today</span>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-protocol-text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/60 inline-block" /> posts</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/60 inline-block" /> replies</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/60 inline-block" /> failed</span>
      </div>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────

type Tab = 'overview' | 'posts' | 'replies' | 'queue';

export function SocialMediaDashboard({ onBack }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<SocialDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const result = await loadSocialDashboard(user.id);
      setData(result);
    } catch (err) {
      console.error('Failed to load social dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      load();
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  if (!data) return null;

  const todayPosts = data.platformStats.reduce((sum, s) => sum + s.postsToday, 0);
  const todayReplies = data.platformStats.reduce((sum, s) => sum + s.repliesToday, 0);
  const totalQueued = data.scheduledQueue.length;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'posts', label: 'Posts', count: data.recentPosts.length },
    { key: 'replies', label: 'Replies', count: data.recentReplies.length },
    { key: 'queue', label: 'Queue', count: totalQueued },
  ];

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-protocol-text-muted hover:text-protocol-text transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-protocol-text">Socials</h2>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg text-protocol-text-muted hover:text-protocol-text hover:bg-protocol-surface transition-colors"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Posts today" value={todayPosts} color="#22c55e" />
        <StatCard label="Replies today" value={todayReplies} color="#3b82f6" />
        <StatCard label="Queued" value={totalQueued} color="#a855f7" />
        <StatCard
          label="Quality"
          value={`${data.quality.passRate}%`}
          sub={`${data.quality.totalPosted}/${data.quality.totalGenerated} passed`}
          color={data.quality.passRate >= 70 ? '#22c55e' : data.quality.passRate >= 50 ? '#eab308' : '#ef4444'}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-protocol-surface border border-protocol-border">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-protocol-border text-protocol-text'
                : 'text-protocol-text-muted hover:text-protocol-text'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 text-protocol-text-muted">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          {/* Activity chart */}
          <ActivityChart data={data.dailyActivity} />

          {/* Platform breakdown */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-protocol-text-muted uppercase tracking-wider px-1">Platforms</div>
            {data.platformStats.map(stats => (
              <PlatformRow key={stats.platform} stats={stats} />
            ))}
            {data.platformStats.length === 0 && (
              <div className="text-sm text-protocol-text-muted text-center py-4">No activity this week</div>
            )}
          </div>

          {/* Quality breakdown */}
          <div className="p-4 rounded-xl border border-protocol-border bg-protocol-surface">
            <div className="text-xs font-medium text-protocol-text-muted uppercase tracking-wider mb-2">Quality Gate (7 days)</div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-green-400">{data.quality.totalPosted}</div>
                <div className="text-[10px] text-protocol-text-muted">posted</div>
              </div>
              <div>
                <div className="text-lg font-bold text-red-400">{data.quality.totalFailed}</div>
                <div className="text-[10px] text-protocol-text-muted">rejected</div>
              </div>
              <div>
                <div className="text-lg font-bold text-protocol-text">{data.quality.passRate}%</div>
                <div className="text-[10px] text-protocol-text-muted">pass rate</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'posts' && (
        <div className="space-y-2">
          {data.recentPosts.length === 0 ? (
            <div className="text-sm text-protocol-text-muted text-center py-8">No original posts this week</div>
          ) : (
            data.recentPosts.map(post => <PostItem key={post.id} post={post} />)
          )}
        </div>
      )}

      {activeTab === 'replies' && (
        <div className="space-y-2">
          {data.recentReplies.length === 0 ? (
            <div className="text-sm text-protocol-text-muted text-center py-8">No replies this week</div>
          ) : (
            data.recentReplies.map(post => <PostItem key={post.id} post={post} />)
          )}
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="space-y-2">
          {data.scheduledQueue.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-6 h-6 text-protocol-text-muted mx-auto mb-2" />
              <div className="text-sm text-protocol-text-muted">Queue empty</div>
              <div className="text-xs text-protocol-text-muted mt-1">Content will be generated on the next scheduler tick</div>
            </div>
          ) : (
            data.scheduledQueue.map(post => <PostItem key={post.id} post={post} />)
          )}
        </div>
      )}
    </div>
  );
}
