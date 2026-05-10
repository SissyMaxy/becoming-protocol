// Wish-classifier + builder telemetry card.
//
// Read-only operator view per the wish-classifier brief: "no per-wish
// approval flow because the user has authorized full autonomy". Surfaces:
//   - wishes classified today (eligible vs needs_review)
//   - last builder ship (commit + branch)
//   - builder failure count last 24h
//
// Embedded in LiveControlsTab.

import { useEffect, useState } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { DataCard, Stat } from '../shared/DataCard'

interface BuilderTelemetry {
  classifiedToday: number
  eligibleToday: number
  needsReviewToday: number
  cappedToday: number
  skippedDedupToday: number
  lastShip: { wish_title: string; shipped_at: string; shipped_in_commit: string | null; branch_name: string | null } | null
  builderFailures24h: number
  lastClassifierRunAt: string | null
}

const startOfTodayISO = (): string => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

const last24hISO = (): string => new Date(Date.now() - 86_400_000).toISOString()

export function BuilderTelemetryCard() {
  const [t, setT] = useState<BuilderTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const todayStart = startOfTodayISO()
        const yesterday = last24hISO()

        const [
          decisionsToday,
          shippedRecent,
          builderFailures,
          lastClassifierRun,
        ] = await Promise.all([
          supabase
            .from('wish_classifier_decisions')
            .select('decision, created_at')
            .gte('created_at', todayStart),
          supabase
            .from('mommy_code_wishes')
            .select('wish_title, shipped_at, shipped_in_commit')
            .eq('status', 'shipped')
            .order('shipped_at', { ascending: false })
            .limit(1),
          supabase
            .from('mommy_builder_run')
            .select('id', { count: 'exact', head: true })
            .like('status', 'failed%')
            .gte('started_at', yesterday),
          supabase
            .from('wish_classifier_runs')
            .select('run_started_at')
            .order('run_started_at', { ascending: false })
            .limit(1),
        ])

        if (cancelled) return

        const decisions = (decisionsToday.data as Array<{ decision: string }> | null) ?? []
        const counts = decisions.reduce<Record<string, number>>((acc, d) => {
          acc[d.decision] = (acc[d.decision] ?? 0) + 1
          return acc
        }, {})

        const lastShipRow = (shippedRecent.data as Array<{ wish_title: string; shipped_at: string; shipped_in_commit: string | null }> | null)?.[0] ?? null
        let branchName: string | null = null
        if (lastShipRow?.shipped_in_commit) {
          const { data: br } = await supabase
            .from('mommy_builder_run')
            .select('branch_name')
            .eq('commit_sha', lastShipRow.shipped_in_commit)
            .limit(1)
          branchName = (br as Array<{ branch_name: string | null }> | null)?.[0]?.branch_name ?? null
        }

        setT({
          classifiedToday: decisions.length,
          eligibleToday: counts.eligible ?? 0,
          needsReviewToday: counts.needs_review ?? 0,
          cappedToday: counts.skipped_cap ?? 0,
          skippedDedupToday: counts.skipped_dedup ?? 0,
          lastShip: lastShipRow ? { ...lastShipRow, branch_name: branchName } : null,
          builderFailures24h: builderFailures.count ?? 0,
          lastClassifierRunAt: (lastClassifierRun.data as Array<{ run_started_at: string }> | null)?.[0]?.run_started_at ?? null,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'load failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <DataCard
      title="Builder Telemetry"
      subtitle="wish-classifier → mommy-builder pipeline (read-only)"
      icon={Bot}
      iconColor="#a78bfa"
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          loading telemetry…
        </div>
      )}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
      {t && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Classified" value={t.classifiedToday} subtext="today" />
            <Stat label="Eligible" value={t.eligibleToday} subtext="today" />
            <Stat label="Review" value={t.needsReviewToday} subtext="today" />
            <Stat label="Failures" value={t.builderFailures24h} subtext="24h" />
          </div>
          {(t.skippedDedupToday > 0 || t.cappedToday > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Skipped dedup" value={t.skippedDedupToday} subtext="today" />
              <Stat label="Cap rolled" value={t.cappedToday} subtext="today" />
            </div>
          )}
          <div className="border-t border-protocol-border pt-3 space-y-1">
            <p className="text-xs text-protocol-text-muted">Last classifier run</p>
            <p className="text-sm text-protocol-text">
              {t.lastClassifierRunAt
                ? new Date(t.lastClassifierRunAt).toLocaleString()
                : 'never'}
            </p>
          </div>
          <div className="border-t border-protocol-border pt-3 space-y-1">
            <p className="text-xs text-protocol-text-muted">Last builder ship</p>
            {t.lastShip ? (
              <>
                <p className="text-sm text-protocol-text truncate">{t.lastShip.wish_title}</p>
                <p className="text-[11px] text-protocol-text-muted">
                  {new Date(t.lastShip.shipped_at).toLocaleString()}
                  {t.lastShip.shipped_in_commit && ` · ${t.lastShip.shipped_in_commit.slice(0, 8)}`}
                  {t.lastShip.branch_name && ` · ${t.lastShip.branch_name}`}
                </p>
              </>
            ) : (
              <p className="text-sm text-protocol-text-muted">no ships yet</p>
            )}
          </div>
        </div>
      )}
    </DataCard>
  )
}
