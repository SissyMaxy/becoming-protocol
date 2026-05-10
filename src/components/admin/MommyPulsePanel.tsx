/**
 * MommyPulsePanel — green/yellow/red status panel for the autonomous loop.
 *
 * Shipped 2026-05-10. Reads from /api/admin/mommy-pulse which rolls up
 * mommy_supervisor_log entries from the last 24h. Refreshes every 60s.
 */

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Activity, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface MetricStatus {
  metric: string
  label: string
  group: string
  severity: 'ok' | 'warn' | 'fail' | 'unknown'
  observed: number | null
  threshold: number | null
  notes: string | null
  last_run_at: string | null
  last_action: string | null
}

interface RecentAction {
  run_at: string
  metric: string
  action: string
  target: string | null
  severity: string
  notes: string | null
}

interface QueueSnapshot {
  queued_auto_ship_eligible?: number
  queued_total?: number
  shipped_24h?: number
  last_build?: { started_at?: string; status?: string; wish_id?: string } | null
  _error?: string
}

interface PulseData {
  timestamp: string
  header_severity: 'ok' | 'warn' | 'fail' | 'unknown'
  rolling_counts_24h: { ok: number; warn: number; fail: number; total: number }
  status_by_metric: MetricStatus[]
  recent_actions: RecentAction[]
  queue_snapshot: QueueSnapshot
}

const SEV_DOT: Record<string, string> = {
  ok:      'bg-emerald-500',
  warn:    'bg-amber-400',
  fail:    'bg-red-500',
  unknown: 'bg-zinc-600',
}
const SEV_TEXT: Record<string, string> = {
  ok:      'text-emerald-400',
  warn:    'text-amber-300',
  fail:    'text-red-400',
  unknown: 'text-zinc-400',
}

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86400_000) return `${Math.round(ms / 3600_000)}h ago`
  return `${Math.round(ms / 86400_000)}d ago`
}

export function MommyPulsePanel() {
  const [data, setData] = useState<PulseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setError('not authenticated')
        setLoading(false)
        return
      }
      const res = await fetch('/api/admin/mommy-pulse', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as PulseData
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => { void load() }, 60_000)
    return () => clearInterval(id)
  }, [load])

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 flex items-center gap-2 text-zinc-400 font-mono text-xs">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading mommy pulse…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 font-mono text-xs text-red-300">
        Pulse unavailable: {error ?? 'no data'}
      </div>
    )
  }

  const { header_severity, rolling_counts_24h, status_by_metric, recent_actions, queue_snapshot } = data
  const buildMetrics = status_by_metric.filter(m => m.group === 'build')
  const outreachMetrics = status_by_metric.filter(m => m.group === 'outreach')

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-300 font-semibold">MOMMY PULSE</span>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${SEV_DOT[header_severity]}`} title={header_severity} />
          <span className={`${SEV_TEXT[header_severity]} uppercase`}>{header_severity}</span>
        </div>
        <button
          onClick={() => { void load() }}
          className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
          {relTime(data.timestamp)}
        </button>
      </div>

      {/* Live queue snapshot */}
      <div className="grid grid-cols-3 gap-2 text-zinc-300">
        <div className="bg-zinc-900/60 rounded px-2 py-1.5">
          <div className="text-[10px] text-zinc-500 uppercase">Eligible queue</div>
          <div className="text-base text-zinc-100">{queue_snapshot.queued_auto_ship_eligible ?? '—'}</div>
        </div>
        <div className="bg-zinc-900/60 rounded px-2 py-1.5">
          <div className="text-[10px] text-zinc-500 uppercase">Shipped 24h</div>
          <div className="text-base text-zinc-100">{queue_snapshot.shipped_24h ?? '—'}</div>
        </div>
        <div className="bg-zinc-900/60 rounded px-2 py-1.5">
          <div className="text-[10px] text-zinc-500 uppercase">Last build</div>
          <div className="text-xs text-zinc-200 truncate">
            {queue_snapshot.last_build?.started_at
              ? `${relTime(queue_snapshot.last_build.started_at)} · ${queue_snapshot.last_build.status}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Build group */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase mb-1.5">Build loop</div>
        <div className="space-y-1">
          {buildMetrics.map(m => (
            <MetricRow key={m.metric} m={m} />
          ))}
        </div>
      </div>

      {/* Outreach group */}
      <div>
        <div className="text-[10px] text-zinc-500 uppercase mb-1.5">Outreach loop</div>
        <div className="space-y-1">
          {outreachMetrics.map(m => (
            <MetricRow key={m.metric} m={m} />
          ))}
        </div>
      </div>

      {/* Recent actions */}
      {recent_actions.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-500 uppercase mb-1.5">
            Recent supervisor actions ({rolling_counts_24h.fail} fail / {rolling_counts_24h.warn} warn / {rolling_counts_24h.ok} ok in 24h)
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {recent_actions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-zinc-400 leading-tight">
                <span className={`inline-block w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${SEV_DOT[a.severity] ?? SEV_DOT.unknown}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-300">{a.action}</span>
                  <span className="text-zinc-600"> · {a.metric} · {relTime(a.run_at)}</span>
                  {a.notes && <div className="text-zinc-500 truncate">{a.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricRow({ m }: { m: MetricStatus }) {
  return (
    <div className="flex items-center gap-2 text-zinc-300">
      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${SEV_DOT[m.severity]}`} title={m.severity} />
      <span className="flex-1 truncate">{m.label}</span>
      <span className="text-zinc-500 text-[11px]">
        {m.observed !== null ? m.observed : '—'}
        {m.threshold !== null && <span className="text-zinc-700"> / {m.threshold}</span>}
      </span>
      <span className="text-zinc-600 text-[11px] w-16 text-right">{relTime(m.last_run_at)}</span>
    </div>
  )
}
