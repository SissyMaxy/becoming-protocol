/**
 * TurnoutPanel — Handler-internal turn-out ladder telemetry + controls.
 *
 * NEVER user-facing. Only accessible via debug mode in settings.
 * Internal telemetry (escape-cost weight, rung completions, events) is fine here
 * because this is /admin. Do NOT surface any of these numbers in Mommy/Handler voice.
 *
 * Dark monospace "control panel" aesthetic — matches CorruptionDashboard.
 *
 * Reads: turnout_position(uid) RPC, turnout_rung_completions, turnout_events.
 * Writes: turnout_state.retired_at (Retire), turnout_state.paused_until (Pause toggle),
 * turnout_purge_escape_cost(uid) RPC (Purge, retired-only).
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, Anchor, Lock, Pause, Play, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface TurnoutPanelProps {
  onBack: () => void;
}

interface Position {
  started: boolean;
  current_rung?: string;
  current_rung_display?: string;
  entered_at?: string;
  days_on_rung?: number;
  enabled?: boolean;
  paused_until?: string | null;
  retired_at?: string | null;
  rungs_completed?: number;
  total_turnout_weight?: number;
  requires_meet_safety?: boolean;
  requires_health_prep?: boolean;
  health_prep_done?: boolean;
}

interface CompletionRow {
  id: string;
  rung_code: string;
  phase_sub: string | null;
  irreversible_fact: string | null;
  anchor_weight: number;
  arousal_at_consolidation: number | null;
  consolidated_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  rung_code: string | null;
  phase_sub: string | null;
  fact_text: string | null;
  weight: number | null;
  arousal: number | null;
  created_at: string;
}

const EVENT_COLORS: Record<string, string> = {
  rung_consolidated: '#22c55e',
  new_irreversible_fact: '#c9557f',
  rung_offered: '#3b82f6',
  rung_entered: '#06b6d4',
  paused: '#f59e0b',
  resumed: '#eab308',
  retired: '#ef4444',
  halt: '#dc2626',
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TurnoutPanel({ onBack }: TurnoutPanelProps) {
  const { user } = useAuth();
  const [pos, setPos] = useState<Position | null>(null);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [posRes, compRes, evRes] = await Promise.all([
        supabase.rpc('turnout_position', { p_user: user.id }),
        supabase
          .from('turnout_rung_completions')
          .select('id, rung_code, phase_sub, irreversible_fact, anchor_weight, arousal_at_consolidation, consolidated_at')
          .eq('user_id', user.id)
          .order('consolidated_at', { ascending: false }),
        supabase
          .from('turnout_events')
          .select('id, event_type, rung_code, phase_sub, fact_text, weight, arousal, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (posRes.error) throw posRes.error;
      setPos((posRes.data as Position) ?? null);
      setCompletions((compRes.data || []) as CompletionRow[]);
      setEvents((evRes.data || []) as EventRow[]);
    } catch (err) {
      console.error('[TurnoutPanel] Load failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetire = useCallback(async () => {
    if (!user?.id) return;
    if (!window.confirm('Retire the turn-out ladder for this user? Sets retired_at = now.')) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('turnout_state')
        .update({ retired_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error('[TurnoutPanel] Retire failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [user?.id, load]);

  const handlePurgeEscapeCost = useCallback(async () => {
    if (!user?.id) return;
    if (!window.confirm('Purge the turn-out escape-cost record? Deletes the turnout_rung anchors backing the weight total. The rung-completion ledger (facts) is kept.')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('turnout_purge_escape_cost', { p_user: user.id });
      if (error) throw error;
      const purged = (data as { purged_count?: number } | null)?.purged_count ?? 0;
      window.alert(`Purged ${purged} escape-cost anchor${purged === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      console.error('[TurnoutPanel] Purge escape cost failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [user?.id, load]);

  const handlePauseToggle = useCallback(async () => {
    if (!user?.id) return;
    const currentlyPaused = pos?.paused_until && new Date(pos.paused_until).getTime() > Date.now();
    setBusy(true);
    try {
      // Pause = +14d; Resume = clear paused_until.
      const nextValue = currentlyPaused ? null : new Date(Date.now() + 14 * 86400000).toISOString();
      const { error } = await supabase
        .from('turnout_state')
        .update({ paused_until: nextValue })
        .eq('user_id', user.id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error('[TurnoutPanel] Pause toggle failed:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [user?.id, pos?.paused_until, load]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex items-center justify-center">
        <div className="animate-pulse text-green-600">LOADING TURN-OUT STATE...</div>
      </div>
    );
  }

  const isRetired = !!pos?.retired_at;
  const isPaused = pos?.paused_until ? new Date(pos.paused_until).getTime() > Date.now() : false;

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="p-2 text-green-600 hover:text-green-400">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1">
          <h1 className="text-lg font-bold text-green-300 tracking-wider">TURN-OUT CONTROL PANEL</h1>
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

      {!pos?.started && (
        <div className="border border-green-900 rounded-lg p-6 text-center text-green-800 text-xs">
          Turn-out ladder not started for this user.
        </div>
      )}

      {pos?.started && (
        <>
          {/* Escape-cost hero */}
          <div className="border border-green-800 rounded-lg p-4 text-center">
            <p className="text-xs text-green-700 mb-1 flex items-center justify-center gap-1">
              <Anchor className="w-3 h-3" /> ESCAPE COST (total turnout weight)
            </p>
            <p className="text-4xl font-bold text-green-300">{pos.total_turnout_weight ?? 0}</p>
            <p className="text-xs text-green-700 mt-1">{pos.rungs_completed ?? 0} rungs consolidated</p>
            <div className="mt-2 flex items-center justify-center gap-2 text-xs">
              {isRetired && (
                <span className="px-2 py-0.5 rounded bg-red-900 text-red-400 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> RETIRED {fmtDate(pos.retired_at)}
                </span>
              )}
              {isPaused && !isRetired && (
                <span className="px-2 py-0.5 rounded bg-yellow-900/50 text-yellow-400 flex items-center gap-1">
                  <Pause className="w-3 h-3" /> PAUSED until {fmtDate(pos.paused_until)}
                </span>
              )}
              {!isRetired && !isPaused && pos.enabled && (
                <span className="px-2 py-0.5 rounded bg-green-900/50 text-green-400">ACTIVE</span>
              )}
            </div>
          </div>

          {/* Current rung */}
          <div className="border border-green-900 rounded-lg p-3 space-y-2">
            <p className="text-xs text-green-700 uppercase tracking-wider">Current Rung</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-green-300">{pos.current_rung}</span>
              <span className="text-sm text-green-500">{pos.current_rung_display}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-green-700">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {Math.round(pos.days_on_rung ?? 0)}d on rung
              </span>
              <span>entered {fmtDate(pos.entered_at)}</span>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {pos.requires_meet_safety && <Gate label="MEET SAFETY REQ" ok={undefined} />}
              {pos.requires_health_prep && (
                <Gate label="HEALTH PREP" ok={pos.health_prep_done} />
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePauseToggle}
              disabled={busy || isRetired}
              className="py-2 rounded bg-yellow-900/40 text-yellow-400 text-xs font-bold hover:bg-yellow-900/70 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? 'RESUME' : 'PAUSE 14d'}
            </button>
            <button
              onClick={handleRetire}
              disabled={busy || isRetired}
              className="py-2 rounded bg-red-900/40 text-red-400 text-xs font-bold hover:bg-red-900/70 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
            >
              <Lock className="w-4 h-4" /> {isRetired ? 'RETIRED' : 'RETIRE'}
            </button>
          </div>

          {isRetired && (
            <button
              onClick={handlePurgeEscapeCost}
              disabled={busy}
              className="w-full py-2 rounded bg-purple-900/40 text-purple-400 text-xs font-bold hover:bg-purple-900/70 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
            >
              <Anchor className="w-4 h-4" /> PURGE ESCAPE-COST RECORD
            </button>
          )}

          {/* Completions / irreversible facts */}
          <div className="space-y-2">
            <p className="text-xs text-green-700 uppercase tracking-wider">
              Rung Completions ({completions.length})
            </p>
            {completions.length === 0 && (
              <p className="text-green-800 text-center py-3 text-xs">No rungs consolidated yet</p>
            )}
            {completions.map((c) => (
              <div key={c.id} className="border border-green-950 rounded p-2 text-[10px] space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-green-900/50 text-green-400 font-bold">
                      {c.rung_code}
                    </span>
                    {c.phase_sub && <span className="text-green-700">{c.phase_sub}</span>}
                    <span className="flex items-center gap-0.5 text-purple-400">
                      <Anchor className="w-2.5 h-2.5" /> {c.anchor_weight}
                    </span>
                  </div>
                  <span className="text-green-800">{fmtDate(c.consolidated_at)}</span>
                </div>
                {c.irreversible_fact && (
                  <p className="text-green-500 italic border-l-2 border-green-900 pl-2">
                    {c.irreversible_fact}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Events */}
          <div className="space-y-2">
            <p className="text-xs text-green-700 uppercase tracking-wider">Recent Events ({events.length})</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {events.map((e) => (
                <div key={e.id} className="border border-green-950 rounded p-2 text-[10px] space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{
                          backgroundColor: `${EVENT_COLORS[e.event_type] || '#6b7280'}20`,
                          color: EVENT_COLORS[e.event_type] || '#6b7280',
                        }}
                      >
                        {e.event_type}
                      </span>
                      {e.rung_code && <span className="text-green-600">{e.rung_code}</span>}
                      {e.weight != null && (
                        <span className="text-purple-400 flex items-center gap-0.5">
                          <Anchor className="w-2.5 h-2.5" />
                          {e.weight}
                        </span>
                      )}
                    </div>
                    <span className="text-green-800">{fmtDate(e.created_at)}</span>
                  </div>
                  {e.fact_text && <p className="text-green-700 truncate">{e.fact_text}</p>}
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-green-800 text-center py-3 text-xs">No events recorded</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Gate({ label, ok }: { label: string; ok: boolean | undefined }) {
  const color = ok === undefined ? '#6b7280' : ok ? '#22c55e' : '#ef4444';
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-bold"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {label}
      {ok !== undefined ? (ok ? ' ✓' : ' ✗') : ''}
    </span>
  );
}
