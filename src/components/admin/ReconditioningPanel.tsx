/**
 * ReconditioningPanel — Handler-internal reconditioning telemetry + probe screens.
 *
 * NEVER user-facing. Only accessible via debug mode in settings.
 * Internal telemetry (baseline→current, phase, skip-rate, stall flags) is fine here
 * because this is /admin. Do NOT surface any of these numbers in Mommy/Handler voice.
 *
 * Dark monospace "control panel" aesthetic — matches CorruptionDashboard.
 *
 * Reads: reconditioning_targets, reconditioning_programs, recon_measurements,
 *        recon_rep_schedule, recon_commitments, recon_reconsolidation_sessions.
 * Writes (probes only): recon_record_measurement RPC — belief_slider (0-100 slider)
 *        and assoc_latency (IAT-lite two-button reaction-time stub).
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Clock, TrendingUp, TrendingDown, AlertTriangle, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface ReconditioningPanelProps {
  onBack: () => void;
}

interface TargetRow {
  id: string;
  slug: string;
  title: string;
  claim_text: string;
  category: string;
  indicator_kind: string;
  indicator_config: Record<string, unknown> | null;
  baseline_value: number | null;
  baseline_captured_at: string | null;
  current_value: number | null;
  current_captured_at: string | null;
  target_direction: string;
  priority: number;
  status: string;
  authored_by: string;
}

interface ProgramRow {
  id: string;
  target_id: string;
  phase: string;
  phase_entered_at: string | null;
  intensity: number | null;
  next_measure_due_at: string | null;
  measures_held: number | null;
  status: string;
}

interface RepRow {
  target_id: string;
  reps: number | null;
  lapses: number | null;
  next_due_at: string | null;
}

interface CommitmentRow {
  id: string;
  target_id: string;
  rung: number;
  commitment_text: string;
  handler_commitment_id: string | null;
  chosen_at: string;
  fulfilled_at: string | null;
  status: string;
}

interface ReconsolidationRow {
  id: string;
  target_id: string;
  labile_until: string | null;
  micro_rep_done_at: string | null;
  arousal_paired: boolean;
  status: string;
  created_at: string;
}

const COMMITMENT_STATUS_COLORS: Record<string, string> = {
  chosen: '#f59e0b',
  fulfilled: '#22c55e',
  skipped: '#6b7280',
  cancelled: '#4b5563',
};

const STATUS_COLORS: Record<string, string> = {
  proposed: '#6b7280',
  active: '#22c55e',
  consolidating: '#3b82f6',
  retained: '#c9557f',
  retired: '#4b5563',
  paused: '#f59e0b',
};

const PHASE_COLORS: Record<string, string> = {
  induction: '#f59e0b',
  install: '#22c55e',
  reinforce: '#3b82f6',
  reconsolidate: '#c9557f',
  measure: '#06b6d4',
  retain: '#cf6088',
};

const CATEGORY_LABELS: Record<string, string> = {
  belief: 'BELIEF',
  identity: 'IDENTITY',
  habit: 'HABIT',
  association: 'ASSOC',
};

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function daysUntil(v: string | null | undefined): number | null {
  if (!v) return null;
  return Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
}

export function ReconditioningPanel({ onBack }: ReconditioningPanelProps) {
  const { user } = useAuth();
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
  const [reconsolidations, setReconsolidations] = useState<ReconsolidationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [targetsRes, programsRes, repsRes, commitmentsRes, reconsolidationsRes] = await Promise.all([
        supabase
          .from('reconditioning_targets')
          .select(
            'id, slug, title, claim_text, category, indicator_kind, indicator_config, baseline_value, baseline_captured_at, current_value, current_captured_at, target_direction, priority, status, authored_by',
          )
          .eq('user_id', user.id)
          .order('priority', { ascending: false }),
        supabase
          .from('reconditioning_programs')
          .select('id, target_id, phase, phase_entered_at, intensity, next_measure_due_at, measures_held, status')
          .eq('user_id', user.id),
        supabase
          .from('recon_rep_schedule')
          .select('target_id, reps, lapses, next_due_at')
          .eq('user_id', user.id),
        supabase
          .from('recon_commitments')
          .select('id, target_id, rung, commitment_text, handler_commitment_id, chosen_at, fulfilled_at, status')
          .eq('user_id', user.id)
          .order('rung', { ascending: true }),
        supabase
          .from('recon_reconsolidation_sessions')
          .select('id, target_id, labile_until, micro_rep_done_at, arousal_paired, status, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (targetsRes.error) throw targetsRes.error;
      setTargets((targetsRes.data || []) as TargetRow[]);
      setPrograms((programsRes.data || []) as ProgramRow[]);
      setReps((repsRes.data || []) as RepRow[]);
      setCommitments((commitmentsRes.data || []) as CommitmentRow[]);
      setReconsolidations((reconsolidationsRes.data || []) as ReconsolidationRow[]);
    } catch (err) {
      console.error('[ReconditioningPanel] Load failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Aggregate skip-rate across all rep cards for a target (lapses / (reps+lapses)).
  const skipRateFor = useCallback(
    (targetId: string): { rate: number; cards: number } | null => {
      const cards = reps.filter((r) => r.target_id === targetId);
      if (cards.length === 0) return null;
      let totalReps = 0;
      let totalLapses = 0;
      for (const c of cards) {
        totalReps += c.reps ?? 0;
        totalLapses += c.lapses ?? 0;
      }
      const denom = totalReps + totalLapses;
      return { rate: denom > 0 ? totalLapses / denom : 0, cards: cards.length };
    },
    [reps],
  );

  const activeTargets = targets.filter((t) => t.status !== 'retired');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex items-center justify-center">
        <div className="animate-pulse text-green-600">LOADING RECONDITIONING STATE...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-green-600 hover:text-green-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1">
          <h1 className="text-lg font-bold text-green-300 tracking-wider">RECONDITIONING CONTROL PANEL</h1>
          <p className="text-xs text-green-700">Handler Internal — Not for user consumption</p>
        </div>
        <button onClick={load} className="p-2 text-green-600 hover:text-green-400">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="border border-red-900 rounded-lg p-3 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-green-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-green-700">TARGETS</p>
          <p className="text-2xl font-bold text-green-300">{activeTargets.length}</p>
        </div>
        <div className="border border-green-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-green-700">PROGRAMS RUNNING</p>
          <p className="text-2xl font-bold text-green-300">
            {programs.filter((p) => p.status === 'running').length}
          </p>
        </div>
        <div className="border border-green-800 rounded-lg p-3 text-center">
          <p className="text-[10px] text-green-700">RETAINED</p>
          <p className="text-2xl font-bold text-green-300">
            {targets.filter((t) => t.status === 'retained').length}
          </p>
        </div>
      </div>

      {/* Target list */}
      <div className="space-y-2">
        <p className="text-xs text-green-700 uppercase tracking-wider">Targets</p>
        {activeTargets.length === 0 && (
          <p className="text-green-800 text-center py-4 text-xs">No active targets</p>
        )}
        {activeTargets.map((t) => {
          const prog = programs.find((p) => p.target_id === t.id);
          const skip = skipRateFor(t.id);
          const statusColor = STATUS_COLORS[t.status] || '#6b7280';

          // Delta = movement toward target direction.
          const baseline = t.baseline_value;
          const current = t.current_value;
          const hasDelta = baseline !== null && current !== null;
          const rawDelta = hasDelta ? (current as number) - (baseline as number) : 0;
          const towardTarget =
            t.target_direction === 'increase' ? rawDelta > 0 : rawDelta < 0;

          // Stall flags:
          const measureOverdue = prog?.next_measure_due_at
            ? new Date(prog.next_measure_due_at).getTime() < Date.now()
            : false;
          const noBaseline = t.baseline_captured_at === null;
          const stalledMovement = hasDelta && Math.abs(rawDelta) < 0.01 && (prog?.measures_held ?? 0) >= 2;
          const highSkip = skip !== null && skip.rate >= 0.4;
          const targetCommitments = commitments
            .filter((c) => c.target_id === t.id)
            .sort((a, b) => a.rung - b.rung);
          const staleCutoffMs = Date.now() - 3600_000;
          const unfiledCommitment = targetCommitments.some(
            (c) => c.status === 'chosen' && !c.handler_commitment_id && new Date(c.chosen_at).getTime() < staleCutoffMs,
          );
          const targetReconsolidations = reconsolidations.filter((r) => r.target_id === t.id);
          const closedLabileWindow = targetReconsolidations.some(
            (r) =>
              r.status !== 'cancelled' &&
              !r.micro_rep_done_at &&
              r.labile_until &&
              new Date(r.labile_until).getTime() < Date.now(),
          );

          return (
            <div key={t.id} className="border border-green-900 rounded-lg p-3 space-y-2">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-green-300 truncate">{t.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-950 text-green-600">
                      {CATEGORY_LABELS[t.category] || t.category.toUpperCase()}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
                    >
                      {t.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[10px] text-green-800 mt-0.5">
                    {t.slug} · P{t.priority} · by {t.authored_by} · {t.indicator_kind}
                  </p>
                </div>
              </div>

              {/* Claim */}
              <p className="text-[11px] text-green-600 italic border-l-2 border-green-900 pl-2">
                "{t.claim_text}"
              </p>

              {/* Baseline → Current */}
              <div className="flex items-center gap-3 text-xs">
                <div className="text-center">
                  <p className="text-[9px] text-green-800">BASELINE</p>
                  <p className="text-green-400 font-bold">{fmtNum(baseline)}</p>
                </div>
                <div className="flex items-center gap-1 flex-1 justify-center">
                  {t.target_direction === 'increase' ? (
                    <TrendingUp className="w-3 h-3 text-green-700" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-green-700" />
                  )}
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: !hasDelta ? '#6b7280' : towardTarget ? '#22c55e' : '#ef4444' }}
                  >
                    {hasDelta ? `${rawDelta > 0 ? '+' : ''}${fmtNum(rawDelta)}` : 'no delta'}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-[9px] text-green-800">CURRENT</p>
                  <p className="text-green-300 font-bold">{fmtNum(current)}</p>
                </div>
              </div>

              {/* Phase + program meta */}
              <div className="flex items-center justify-between text-[10px] text-green-700">
                {prog ? (
                  <>
                    <span
                      className="px-1.5 py-0.5 rounded font-bold"
                      style={{
                        backgroundColor: `${PHASE_COLORS[prog.phase] || '#6b7280'}20`,
                        color: PHASE_COLORS[prog.phase] || '#6b7280',
                      }}
                    >
                      {prog.phase}
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" /> held {prog.measures_held ?? 0}
                      {prog.intensity != null ? ` · int ${prog.intensity}` : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {prog.next_measure_due_at ? (
                        <span className={measureOverdue ? 'text-red-400' : ''}>
                          measure {measureOverdue ? 'OVERDUE' : `in ${daysUntil(prog.next_measure_due_at)}d`}
                        </span>
                      ) : (
                        'no measure due'
                      )}
                    </span>
                  </>
                ) : (
                  <span className="text-green-900">no program started</span>
                )}
              </div>

              {/* Skip-rate */}
              {skip && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-green-800">skip-rate</span>
                  <div className="h-1.5 flex-1 bg-green-950 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(skip.rate * 100)}%`,
                        backgroundColor: skip.rate >= 0.4 ? '#ef4444' : '#22c55e',
                      }}
                    />
                  </div>
                  <span className={skip.rate >= 0.4 ? 'text-red-400' : 'text-green-600'}>
                    {Math.round(skip.rate * 100)}% ({skip.cards} cards)
                  </span>
                </div>
              )}

              {/* Stall flags */}
              {(measureOverdue || noBaseline || stalledMovement || highSkip || unfiledCommitment || closedLabileWindow) && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {noBaseline && <Flag label="NO BASELINE" />}
                  {measureOverdue && <Flag label="MEASURE OVERDUE" />}
                  {stalledMovement && <Flag label="STALLED" />}
                  {highSkip && <Flag label="HIGH SKIP" />}
                  {unfiledCommitment && <Flag label="COMMITMENT UNFILED" />}
                  {closedLabileWindow && <Flag label="LABILE WINDOW CLOSED" />}
                </div>
              )}

              {/* Commitment ladder — foot-in-the-door rungs 1..5 (§2.6) */}
              {targetCommitments.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-green-950">
                  <p className="text-[9px] text-green-800 uppercase tracking-wider">Commitment ladder</p>
                  <div className="flex flex-wrap gap-1">
                    {targetCommitments.map((c) => {
                      const color = COMMITMENT_STATUS_COLORS[c.status] || '#6b7280';
                      return (
                        <span
                          key={c.id}
                          title={`rung ${c.rung}: ${c.commitment_text}`}
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          R{c.rung} {c.status}
                          {c.status === 'chosen' && !c.handler_commitment_id ? ' (unfiled)' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reconsolidation sessions — recall → mismatch → re-encode (§2.1) */}
              {targetReconsolidations.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-green-950">
                  <p className="text-[9px] text-green-800 uppercase tracking-wider">
                    Reconsolidation sessions ({targetReconsolidations.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {targetReconsolidations.slice(0, 8).map((r) => {
                      const windowClosed =
                        r.status !== 'cancelled' && !r.micro_rep_done_at && r.labile_until && new Date(r.labile_until).getTime() < Date.now();
                      const color = windowClosed
                        ? '#ef4444'
                        : r.status === 'micro_rep_done'
                          ? '#22c55e'
                          : r.status === 'cancelled'
                            ? '#4b5563'
                            : '#3b82f6';
                      return (
                        <span
                          key={r.id}
                          title={new Date(r.created_at).toLocaleString()}
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {r.status}
                          {r.arousal_paired ? ' ⚡' : ''}
                          {windowClosed ? ' (window closed)' : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Probe controls */}
              <ProbeControls
                userId={user?.id}
                target={t}
                phase={prog?.phase ?? null}
                onRecorded={load}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Flag({ label }: { label: string }) {
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 flex items-center gap-1">
      <AlertTriangle className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

/**
 * Probe controls — two measurement instruments that write via recon_record_measurement.
 *  1. belief_slider: 0-100 self-report of how true the claim feels.
 *  2. assoc_latency (IAT-lite): present the claim, user taps AGREE / DISAGREE, we record
 *     the reaction time in ms as the value + the choice in raw. Faster+agree = stronger
 *     automatic association. This is a stub instrument for the assoc_latency indicator.
 */
function ProbeControls({
  userId,
  target,
  phase,
  onRecorded,
}: {
  userId: string | undefined;
  target: TargetRow;
  phase: string | null;
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [slider, setSlider] = useState(50);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [iatShownAt, setIatShownAt] = useState<number | null>(null);

  const record = useCallback(
    async (indicator: string, value: number, method: string, raw: Record<string, unknown>) => {
      if (!userId) return;
      setSaving(true);
      setMsg(null);
      try {
        const { error } = await supabase.rpc('recon_record_measurement', {
          p_user: userId,
          p_target: target.id,
          p_indicator: indicator,
          p_value: value,
          p_method: method,
          p_phase: phase,
          p_is_baseline: false,
          p_raw: raw,
        });
        if (error) throw error;
        setMsg(`recorded ${indicator}=${value}`);
        onRecorded();
      } catch (err) {
        console.error('[ReconditioningPanel] record failed:', err);
        setMsg(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [userId, target.id, phase, onRecorded],
  );

  const handleIat = (agree: boolean) => {
    const latencyMs = iatShownAt ? Math.round(performance.now() - iatShownAt) : 0;
    setIatShownAt(null);
    // value = latency; direction of agreement stored in raw for scoring.
    record('assoc_latency', latencyMs, 'iat_lite', {
      choice: agree ? 'agree' : 'disagree',
      latency_ms: latencyMs,
      probe: 'admin_iat_lite',
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-1.5 rounded bg-green-950 text-green-500 text-[10px] font-bold hover:bg-green-900/60 transition-colors"
      >
        RUN PROBE
      </button>
    );
  }

  return (
    <div className="border-t border-green-950 pt-2 space-y-3">
      {/* belief_slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-green-700">
          <span>BELIEF SLIDER (belief_slider)</span>
          <span className="text-green-300 font-bold">{slider}/100</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={slider}
          onChange={(e) => setSlider(Number(e.target.value))}
          className="w-full accent-green-500"
        />
        <button
          disabled={saving}
          onClick={() => record('belief_slider', slider, 'self_report_slider', { slider, probe: 'admin_belief_slider' })}
          className="w-full py-1.5 rounded bg-green-900/50 text-green-400 text-[10px] font-bold hover:bg-green-900 transition-colors disabled:opacity-50"
        >
          RECORD BELIEF
        </button>
      </div>

      {/* assoc_latency IAT-lite */}
      <div className="space-y-1">
        <div className="text-[10px] text-green-700">ASSOC LATENCY (assoc_latency · IAT-lite)</div>
        {iatShownAt === null ? (
          <button
            disabled={saving}
            onClick={() => setIatShownAt(performance.now())}
            className="w-full py-1.5 rounded bg-green-950 text-green-500 text-[10px] font-bold hover:bg-green-900/60 transition-colors disabled:opacity-50"
          >
            START — read the claim, then tap fast
          </button>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] text-green-300 text-center py-1 border border-green-900 rounded">
              "{target.claim_text}"
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={saving}
                onClick={() => handleIat(true)}
                className="py-2 rounded bg-green-900/50 text-green-400 text-[10px] font-bold hover:bg-green-900 disabled:opacity-50"
              >
                AGREE
              </button>
              <button
                disabled={saving}
                onClick={() => handleIat(false)}
                className="py-2 rounded bg-red-900/40 text-red-400 text-[10px] font-bold hover:bg-red-900/70 disabled:opacity-50"
              >
                DISAGREE
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <p className="text-[10px] text-green-600">{msg}</p>}
      <button
        onClick={() => {
          setOpen(false);
          setMsg(null);
          setIatShownAt(null);
        }}
        className="w-full py-1 text-[10px] text-green-800 hover:text-green-600"
      >
        close probe
      </button>
    </div>
  );
}
