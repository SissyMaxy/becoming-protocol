/**
 * CorruptionDashboard — Handler-internal analytics view.
 *
 * NEVER user-facing. Only accessible via debug mode in settings.
 * Dark monospace "control panel" aesthetic.
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, RefreshCw, Shield, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCorruption } from '../../hooks/useCorruption';
import { supabase } from '../../lib/supabase';
import {
  ALL_CORRUPTION_DOMAINS,
  type CorruptionDomain,
  type AdvancementCheck,
} from '../../types/corruption';

interface CorruptionDashboardProps {
  onBack: () => void;
}

// Domain display config
const DOMAIN_LABELS: Record<CorruptionDomain, string> = {
  privacy: 'PRIVACY',
  gina: 'GINA',
  financial: 'FINANCIAL',
  autonomy: 'AUTONOMY',
  identity_language: 'IDENTITY',
  therapist: 'THERAPIST',
  content: 'CONTENT',
};

const DOMAIN_COLORS: Record<CorruptionDomain, string> = {
  privacy: '#22c55e',
  gina: '#f59e0b',
  financial: '#3b82f6',
  autonomy: '#a855f7',
  identity_language: '#ec4899',
  therapist: '#06b6d4',
  content: '#ef4444',
};

// Event type colors
const EVENT_COLORS: Record<string, string> = {
  advancement: '#22c55e',
  milestone: '#3b82f6',
  suspension: '#ef4444',
  resumption: '#f59e0b',
  cascade: '#a855f7',
  override: '#f97316',
  therapist_flag: '#06b6d4',
  crisis_suspend: '#dc2626',
  timed_resume: '#eab308',
  therapist_rollback: '#0ea5e9',
  maintenance: '#6b7280',
  deployment: '#64748b',
};

interface EventRow {
  id: string;
  domain: string;
  event_type: string;
  corruption_level_at_event: number;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface MaintenanceLogRow {
  date: string;
  advancements: unknown[];
  cascades: unknown[];
  resumptions: unknown[];
  notes: string | null;
}

export function CorruptionDashboard({ onBack }: CorruptionDashboardProps) {
  const { user } = useAuth();
  const { snapshot, isLoading: snapshotLoading, getAdvancementStatus, runMaintenance, refresh } = useCorruption();

  const [advancementChecks, setAdvancementChecks] = useState<AdvancementCheck[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventRow[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLogRow[]>([]);
  const [isLoadingExtra, setIsLoadingExtra] = useState(true);
  const [isRunningMaintenance, setIsRunningMaintenance] = useState(false);

  const loadExtraData = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingExtra(true);

    try {
      const [checksResult, eventsResult, logsResult] = await Promise.all([
        getAdvancementStatus(),
        supabase
          .from('corruption_events')
          .select('id, domain, event_type, corruption_level_at_event, details, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('corruption_maintenance_log')
          .select('date, advancements, cascades, resumptions, notes')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7),
      ]);

      setAdvancementChecks(checksResult);
      setRecentEvents((eventsResult.data || []) as EventRow[]);
      setMaintenanceLogs((logsResult.data || []) as MaintenanceLogRow[]);
    } catch (err) {
      console.error('[CorruptionDashboard] Load failed:', err);
    } finally {
      setIsLoadingExtra(false);
    }
  }, [user?.id, getAdvancementStatus]);

  useEffect(() => {
    loadExtraData();
  }, [loadExtraData]);

  const handleRefresh = async () => {
    await refresh();
    await loadExtraData();
  };

  const handleRunMaintenance = async () => {
    setIsRunningMaintenance(true);
    try {
      const result = await runMaintenance();
      if (result) {
        console.log('[CorruptionDashboard] Maintenance result:', result);
      }
      await handleRefresh();
    } finally {
      setIsRunningMaintenance(false);
    }
  };

  if (snapshotLoading || isLoadingExtra) {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex items-center justify-center">
        <div className="animate-pulse text-green-600">LOADING CORRUPTION STATE...</div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex items-center justify-center">
        <div className="text-red-400">NO CORRUPTION DATA</div>
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
          <h1 className="text-lg font-bold text-green-300 tracking-wider">
            CORRUPTION CONTROL PANEL
          </h1>
          <p className="text-xs text-green-700">Handler Internal — Not for user consumption</p>
        </div>
        <button onClick={handleRefresh} className="p-2 text-green-600 hover:text-green-400">
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Composite Score */}
      <div className="border border-green-800 rounded-lg p-4 text-center">
        <p className="text-xs text-green-700 mb-1">COMPOSITE SCORE</p>
        <p className="text-4xl font-bold text-green-300">{snapshot.composite_score}</p>
        <p className="text-xs text-green-700 mt-1">/ 100</p>
        {snapshot.all_suspended && (
          <div className="mt-2 flex items-center justify-center gap-1 text-red-400 text-xs">
            <AlertTriangle className="w-3 h-3" />
            ALL SUSPENDED: {snapshot.suspension_reason}
          </div>
        )}
      </div>

      {/* Domain Grid */}
      <div className="space-y-2">
        <p className="text-xs text-green-700 uppercase tracking-wider">Domain Levels</p>
        <div className="grid grid-cols-1 gap-2">
          {ALL_CORRUPTION_DOMAINS.map(domain => {
            const state = snapshot.states.find(s => s.domain === domain);
            const level = snapshot.levels[domain];
            const daysAt = snapshot.days_at_current_levels[domain];
            const check = advancementChecks.find(c => c.domain === domain);
            const color = DOMAIN_COLORS[domain];

            return (
              <div
                key={domain}
                className="border border-green-900 rounded-lg p-3 space-y-2"
              >
                {/* Domain header */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color }}>
                    {DOMAIN_LABELS[domain]}
                  </span>
                  <div className="flex items-center gap-2">
                    {state?.is_suspended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-400">
                        SUSPENDED
                      </span>
                    )}
                    <span className="text-green-300 font-bold">{level}/5</span>
                  </div>
                </div>

                {/* Level bars */}
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(l => (
                    <div
                      key={l}
                      className="h-2 flex-1 rounded-sm"
                      style={{
                        backgroundColor: l <= level ? color : '#1a1a1a',
                        opacity: l <= level ? 1 : 0.3,
                      }}
                    />
                  ))}
                </div>

                {/* Meta row */}
                <div className="flex items-center justify-between text-[10px] text-green-700">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {daysAt}d at level
                  </span>
                  {state && level < 5 && (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {Math.round(state.advancement_score)}/{state.advancement_threshold}
                    </span>
                  )}
                  {state?.resume_after && (
                    <span className="text-yellow-500">
                      Resume: {new Date(state.resume_after).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Advancement progress bar */}
                {state && level < 5 && (
                  <div className="h-1 bg-green-950 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (state.advancement_score / state.advancement_threshold) * 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                )}

                {/* Milestone checklist */}
                {check && level < 5 && Object.keys(check.milestonesRequired).length > 0 && (
                  <div className="space-y-0.5 pt-1">
                    {check.minimumDays > 0 && (
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className={check.daysAtLevel >= check.minimumDays ? 'text-green-400' : 'text-red-400'}>
                          {check.daysAtLevel >= check.minimumDays ? '✓' : '✗'}
                        </span>
                        <span className="text-green-800">
                          min_days: {check.daysAtLevel}/{check.minimumDays}
                        </span>
                      </div>
                    )}
                    {Object.entries(check.milestonesRequired).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1 text-[10px]">
                        <span className={check.milestonesMet[key] ? 'text-green-400' : 'text-red-400'}>
                          {check.milestonesMet[key] ? '✓' : '✗'}
                        </span>
                        <span className="text-green-800">
                          {key}: {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cascade Map */}
      <div className="border border-green-900 rounded-lg p-3 space-y-2">
        <p className="text-xs text-green-700 uppercase tracking-wider">Cascade Status</p>
        <div className="grid grid-cols-7 gap-1">
          {ALL_CORRUPTION_DOMAINS.map(domain => (
            <div key={domain} className="text-center">
              <p className="text-[8px] text-green-800 truncate">{domain.slice(0, 4)}</p>
              <p className="text-sm font-bold" style={{ color: DOMAIN_COLORS[domain] }}>
                {snapshot.levels[domain]}
              </p>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-green-700 text-center">
          {(() => {
            const levelCounts: Record<number, number> = {};
            for (const d of ALL_CORRUPTION_DOMAINS) {
              const l = snapshot.levels[d];
              levelCounts[l] = (levelCounts[l] || 0) + 1;
            }
            const cascadeLevels = Object.entries(levelCounts)
              .filter(([, count]) => count >= 3)
              .map(([level]) => level);
            return cascadeLevels.length > 0
              ? `Cascade active at level(s): ${cascadeLevels.join(', ')}`
              : 'No cascade threshold reached (need 3+ at same level)';
          })()}
        </div>
      </div>

      {/* Manual Maintenance */}
      <div className="border border-green-900 rounded-lg p-3">
        <button
          onClick={handleRunMaintenance}
          disabled={isRunningMaintenance}
          className="w-full py-2 rounded bg-green-900/50 text-green-400 text-xs font-bold
                     hover:bg-green-900 transition-colors disabled:opacity-50"
        >
          {isRunningMaintenance ? 'RUNNING MAINTENANCE...' : 'RUN DAILY MAINTENANCE NOW'}
        </button>
      </div>

      {/* Maintenance Log */}
      {maintenanceLogs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-green-700 uppercase tracking-wider">Maintenance Log (7d)</p>
          <div className="space-y-1">
            {maintenanceLogs.map((log, i) => (
              <div key={i} className="border border-green-950 rounded p-2 text-[10px] space-y-0.5">
                <div className="flex justify-between text-green-600">
                  <span>{log.date}</span>
                  <span>
                    {(log.advancements as unknown[]).length}↑
                    {' '}{(log.cascades as unknown[]).length}⚡
                    {' '}{(log.resumptions as unknown[]).length}↻
                  </span>
                </div>
                {log.notes && (
                  <p className="text-green-800">{log.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Events */}
      <div className="space-y-2">
        <p className="text-xs text-green-700 uppercase tracking-wider">
          Recent Events ({recentEvents.length})
        </p>
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {recentEvents.map(event => (
            <div
              key={event.id}
              className="border border-green-950 rounded p-2 text-[10px] space-y-0.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      backgroundColor: `${EVENT_COLORS[event.event_type] || '#6b7280'}20`,
                      color: EVENT_COLORS[event.event_type] || '#6b7280',
                    }}
                  >
                    {event.event_type}
                  </span>
                  <span style={{ color: DOMAIN_COLORS[event.domain as CorruptionDomain] || '#6b7280' }}>
                    {event.domain}
                  </span>
                  <span className="text-green-700">L{event.corruption_level_at_event}</span>
                </div>
                <span className="text-green-800">
                  {new Date(event.created_at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {event.details && Object.keys(event.details).length > 0 && (
                <p className="text-green-800 truncate">
                  {JSON.stringify(event.details).slice(0, 120)}
                </p>
              )}
            </div>
          ))}
          {recentEvents.length === 0 && (
            <p className="text-green-800 text-center py-4">No events recorded</p>
          )}
        </div>
      </div>

      {/* Suspension Panel */}
      {snapshot.states.some(s => s.is_suspended) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-400" />
            <p className="text-xs text-red-400 uppercase tracking-wider">Active Suspensions</p>
          </div>
          {snapshot.states.filter(s => s.is_suspended).map(state => (
            <div
              key={state.domain}
              className="border border-red-900 rounded-lg p-3 text-xs space-y-1"
            >
              <div className="flex justify-between">
                <span className="text-red-400 font-bold">{DOMAIN_LABELS[state.domain]}</span>
                <span className="text-red-600">{state.suspension_type || 'unknown'}</span>
              </div>
              {state.suspension_reason && (
                <p className="text-red-700">{state.suspension_reason}</p>
              )}
              {state.resume_after && (
                <p className="text-yellow-600">
                  Resumes: {new Date(state.resume_after).toLocaleDateString()} (
                  {Math.max(0, Math.ceil((new Date(state.resume_after).getTime() - Date.now()) / 86400000))}d)
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
