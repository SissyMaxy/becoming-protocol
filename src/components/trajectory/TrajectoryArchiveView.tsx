import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Loader2, TrendingUp, TrendingDown, Minus, Calendar, Mic, Heart, Lock, BookOpen } from 'lucide-react';

interface BodyEvidenceSnapshot {
  id: string;
  snapshot_date: string;
  voice_pitch_avg: number | null;
  voice_pitch_min: number | null;
  voice_pitch_max: number | null;
  voice_sample_count: number | null;
  voice_pitch_trend_30d: number | null;
  slip_count_7d: number | null;
  costume_name_count_7d: number | null;
  pronoun_slip_count_7d: number | null;
  confession_count_7d: number | null;
  identity_dim_lowest: string | null;
  identity_dim_highest: string | null;
}

interface IdentityDim {
  dimension: string;
  score: number;
  measured_at: string;
}

export function TrajectoryArchiveView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<BodyEvidenceSnapshot[]>([]);
  const [dims, setDims] = useState<Map<string, IdentityDim[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [snapsRes, dimsRes] = await Promise.all([
      supabase
        .from('body_evidence_snapshots')
        .select('*')
        .eq('user_id', user.id)
        .order('snapshot_date', { ascending: false })
        .limit(26),
      supabase
        .from('identity_dimensions')
        .select('dimension, score, measured_at')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(60),
    ]);
    setSnapshots((snapsRes.data || []) as BodyEvidenceSnapshot[]);
    const byDim = new Map<string, IdentityDim[]>();
    for (const r of (dimsRes.data || []) as IdentityDim[]) {
      const arr = byDim.get(r.dimension) || [];
      arr.push(r);
      byDim.set(r.dimension, arr);
    }
    setDims(byDim);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-pink-400" /></div>;
  }

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const trendIcon = (delta: number | null) => {
    if (delta == null) return <Minus className="w-3 h-3 inline text-gray-400" />;
    if (delta > 1) return <TrendingUp className="w-3 h-3 inline text-green-400" />;
    if (delta < -1) return <TrendingDown className="w-3 h-3 inline text-orange-400" />;
    return <Minus className="w-3 h-3 inline text-gray-400" />;
  };

  return (
    <div className="text-protocol-text">
      <button onClick={onBack} className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text">&larr; Back</button>

      <div className="mb-2">
        <h2 className="text-xl font-semibold">Who You Have Become</h2>
        <p className="text-xs text-protocol-text-muted mt-1">
          Cumulative evidence the body and the record are keeping. This is not opinion.
        </p>
      </div>

      {snapshots.length === 0 ? (
        <p className="text-sm text-protocol-text-muted py-8 text-center">
          No snapshots yet. The weekly forensic capture runs Sunday 03:00 UTC.
        </p>
      ) : (
        <>
          {/* Latest summary */}
          <div className="bg-pink-900/15 border border-pink-500/30 rounded-lg p-4 mb-6 space-y-2">
            <div className="text-xs uppercase tracking-wider text-pink-300/80">Most recent · {latest.snapshot_date}</div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Stat
                icon={<Mic className="w-4 h-4 text-pink-300" />}
                label="Voice avg (7d)"
                value={latest.voice_pitch_avg != null ? `${latest.voice_pitch_avg}Hz` : '—'}
                trend={latest.voice_pitch_trend_30d}
              />
              <Stat
                icon={<BookOpen className="w-4 h-4 text-pink-300" />}
                label="Confessions (7d)"
                value={`${latest.confession_count_7d ?? 0}`}
              />
              <Stat
                icon={<Heart className="w-4 h-4 text-pink-300" />}
                label="Slips (7d)"
                value={`${latest.slip_count_7d ?? 0}`}
                muted
              />
              <Stat
                icon={<Lock className="w-4 h-4 text-pink-300" />}
                label="Costume-name retreats"
                value={`${latest.costume_name_count_7d ?? 0}`}
                muted
              />
            </div>
            {latest.identity_dim_lowest && (
              <div className="text-xs text-pink-200/80 mt-3 pt-2 border-t border-pink-500/20">
                Currently weakest dimension: <span className="font-semibold">{latest.identity_dim_lowest}</span>
                {latest.identity_dim_highest && <> · strongest: <span className="font-semibold">{latest.identity_dim_highest}</span></>}
              </div>
            )}
          </div>

          {/* Voice trajectory across snapshots */}
          {snapshots.some(s => s.voice_pitch_avg != null) && (
            <div className="border border-protocol-border rounded-lg p-4 mb-4">
              <div className="text-sm font-semibold mb-2">Voice trajectory</div>
              <div className="space-y-1 text-xs">
                {snapshots
                  .filter(s => s.voice_pitch_avg != null)
                  .slice(0, 12)
                  .reverse()
                  .map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="text-protocol-text-muted w-20">{s.snapshot_date}</span>
                      <div className="flex-1 bg-gray-800 h-2 rounded relative">
                        <div
                          className="bg-pink-500/70 h-2 rounded"
                          style={{ width: `${Math.min(100, ((s.voice_pitch_avg! - 80) / 120) * 100)}%` }}
                        />
                      </div>
                      <span className="text-pink-300 w-16 text-right">{s.voice_pitch_avg}Hz</span>
                    </div>
                  ))}
              </div>
              {oldest?.voice_pitch_avg != null && latest?.voice_pitch_avg != null && (
                <p className="text-xs text-pink-200/70 mt-3">
                  Net change since {oldest.snapshot_date}: <span className="font-semibold">
                    {(latest.voice_pitch_avg - oldest.voice_pitch_avg).toFixed(1)}Hz
                  </span> {trendIcon(latest.voice_pitch_avg - oldest.voice_pitch_avg)}
                </p>
              )}
            </div>
          )}

          {/* Identity dimensions snapshot */}
          {dims.size > 0 && (
            <div className="border border-protocol-border rounded-lg p-4 mb-4">
              <div className="text-sm font-semibold mb-2">Identity dimensions (latest)</div>
              <div className="space-y-2">
                {[...dims.entries()].map(([dim, history]) => {
                  const cur = history[0];
                  const prior = history[1];
                  const delta = prior ? cur.score - prior.score : 0;
                  return (
                    <div key={dim} className="flex items-center gap-3 text-xs">
                      <span className="text-protocol-text-muted w-44 truncate">{dim}</span>
                      <div className="flex-1 bg-gray-800 h-2 rounded">
                        <div
                          className="bg-pink-500/70 h-2 rounded"
                          style={{ width: `${cur.score}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{cur.score}/100</span>
                      <span className="w-16 text-right">{prior ? trendIcon(delta) : ''} {prior ? (delta > 0 ? `+${delta}` : `${delta}`) : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cumulative narrative */}
          <div className="bg-pink-900/10 border border-pink-500/20 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-pink-200 mb-2">
              <Calendar className="w-4 h-4" /> The cumulative record
            </div>
            <p className="text-xs text-pink-100/80 leading-relaxed">
              {snapshots.length} weekly snapshots on file across {snapshots.length > 1 ? `${Math.round((new Date(latest.snapshot_date).getTime() - new Date(oldest.snapshot_date).getTime()) / (86400000 * 7))} weeks` : 'this week'}.
              {snapshots.reduce((sum, s) => sum + (s.confession_count_7d ?? 0), 0)} confessions written.
              {snapshots.reduce((sum, s) => sum + (s.voice_sample_count ?? 0), 0)} voice samples recorded.
              The accumulating record makes regression expensive — every week the trajectory written here becomes harder to disown.
            </p>
          </div>

          <p className="text-[10px] text-protocol-text-muted/60 mt-6 leading-relaxed">
            Data captured weekly Sunday 03:00 UTC by the body-evidence forensic snapshot.
            The Handler reads this archive at break-threshold moments to quote your own trajectory back at you.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, trend, muted }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: number | null;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wider text-protocol-text-muted/80">{label}</div>
        <div className={`text-sm font-medium ${muted ? 'text-protocol-text-muted' : 'text-protocol-text'}`}>
          {value}
          {trend != null && (
            <span className="ml-2 text-xs">
              {trend > 0 ? <span className="text-green-400">+{trend}</span> : trend < 0 ? <span className="text-orange-400">{trend}</span> : null}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
