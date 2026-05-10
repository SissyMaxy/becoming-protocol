// Identity → "Progress to next phase" panel.
//
// Reads the latest `phase_progress_snapshots` row + the current
// `feminine_self.transformation_phase` and renders a checklist of next-
// phase requirements. Reads phase metadata from `transformation_phase_defs`
// when present; falls back to DEFAULT_PHASE_DEFS otherwise. Also surfaces
// the auto-advance + congratulation toggles.
//
// Hides itself entirely when:
//   - there's no `feminine_self` row yet (identity branch unmerged or new user)
//   - no snapshot has been written yet (cron hasn't run)
//   - the user is at PHASE_TERMINAL
//
// Designed to drop into IdentitySettingsView on the unmerged identity branch
// without touching that file. Until that branch lands, the parent embed is
// the SettingsView "Identity" section added in this commit.

import { useEffect, useState } from 'react'
import { Check, Circle, Clock, Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  defaultPhaseDef,
  PHASE_TERMINAL,
  DEFAULT_MIN_DWELL_DAYS,
  type PhaseDef,
  type RequirementsState,
} from '../../lib/phase-advance/evaluator'

interface SnapshotRow {
  current_phase: number
  target_phase: number
  evaluated_at: string
  requirements_state: RequirementsState
  all_met: boolean
  failing_summary: string | null
}

interface FemSelfRow {
  transformation_phase: number | null
  feminine_name: string | null
  current_honorific: string | null
}

interface UserStateRow {
  auto_advance_phases: boolean | null
  phase_advance_congratulate: boolean | null
}

export function PhaseProgressPanel() {
  const { user } = useAuth()
  const userId = user?.id

  const [loading, setLoading] = useState(true)
  const [hasFemSelf, setHasFemSelf] = useState(false)
  const [femSelf, setFemSelf] = useState<FemSelfRow | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotRow | null>(null)
  const [phaseDef, setPhaseDef] = useState<PhaseDef | null>(null)
  const [settings, setSettings] = useState<UserStateRow>({
    auto_advance_phases: true,
    phase_advance_congratulate: true,
  })
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!userId) { setLoading(false); return }
      setLoading(true)

      // feminine_self may not exist yet (identity branch unmerged).
      try {
        const { data, error } = await supabase
          .from('feminine_self')
          .select('transformation_phase, feminine_name, current_honorific')
          .eq('user_id', userId)
          .maybeSingle()
        if (cancelled) return
        if (error) {
          // Table missing → graceful hide.
          setHasFemSelf(false); setLoading(false); return
        }
        setHasFemSelf(!!data)
        setFemSelf((data as FemSelfRow | null) ?? null)
      } catch {
        if (!cancelled) { setHasFemSelf(false); setLoading(false) }
        return
      }

      // Settings (defensive — toggles may be missing on a not-yet-migrated
      // env; default to ON).
      try {
        const { data } = await supabase
          .from('user_state')
          .select('auto_advance_phases, phase_advance_congratulate')
          .eq('user_id', userId)
          .maybeSingle()
        if (!cancelled && data) setSettings(data as UserStateRow)
      } catch { /* leave defaults */ }

      // Latest snapshot.
      try {
        const { data } = await supabase
          .from('phase_progress_snapshots')
          .select('current_phase, target_phase, evaluated_at, requirements_state, all_met, failing_summary')
          .eq('user_id', userId)
          .order('evaluated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cancelled) setSnapshot((data as SnapshotRow | null) ?? null)
      } catch { /* leave null */ }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  // Once femSelf + snapshot are settled, fetch the phase def for the target.
  useEffect(() => {
    let cancelled = false
    async function loadDef() {
      const target =
        snapshot?.target_phase
        ?? ((femSelf?.transformation_phase ?? 0) + 1)
      if (target < 1 || target > PHASE_TERMINAL) { setPhaseDef(null); return }
      try {
        const { data, error } = await supabase
          .from('transformation_phase_defs')
          .select('phase, name, arc, unlocks, primer_requirements, compliance_pct_required, min_dwell_days, wardrobe_required')
          .eq('phase', target)
          .maybeSingle()
        if (cancelled) return
        if (error || !data) {
          setPhaseDef(defaultPhaseDef(target))
        } else {
          setPhaseDef(data as PhaseDef)
        }
      } catch {
        if (!cancelled) setPhaseDef(defaultPhaseDef(target))
      }
    }
    loadDef()
    return () => { cancelled = true }
  }, [snapshot?.target_phase, femSelf?.transformation_phase])

  async function toggleSetting(key: 'auto_advance_phases' | 'phase_advance_congratulate', next: boolean) {
    if (!userId) return
    setSavingKey(key)
    const prev = settings[key]
    setSettings(s => ({ ...s, [key]: next }))
    try {
      const { error } = await supabase
        .from('user_state')
        .update({ [key]: next })
        .eq('user_id', userId)
      if (error) {
        setSettings(s => ({ ...s, [key]: prev }))
      }
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-protocol-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  if (!hasFemSelf || !femSelf) {
    return null
  }

  const currentPhase = Math.max(0, Math.min(PHASE_TERMINAL, Math.round(femSelf.transformation_phase ?? 0)))
  const isTerminal = currentPhase >= PHASE_TERMINAL

  return (
    <div className="space-y-6">
      <Header
        currentPhase={currentPhase}
        currentPhaseDef={defaultPhaseDef(currentPhase)}
        feminineName={femSelf.feminine_name}
      />

      {!isTerminal && phaseDef && (
        <RequirementsList
          targetPhase={phaseDef.phase}
          targetDef={phaseDef}
          snapshot={snapshot}
        />
      )}

      {!isTerminal && snapshot && phaseDef && (
        <ETALine snapshot={snapshot} targetDef={phaseDef} />
      )}

      <SettingsToggles
        settings={settings}
        savingKey={savingKey}
        onToggle={toggleSetting}
      />

      {!snapshot && !isTerminal && (
        <p className="text-sm text-protocol-text-muted">
          The advancement evaluator runs daily. Your first snapshot will appear within 24 hours.
        </p>
      )}
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────

function Header(props: {
  currentPhase: number
  currentPhaseDef: PhaseDef | null
  feminineName: string | null
}) {
  const { currentPhase, currentPhaseDef, feminineName } = props
  const phaseLabel = currentPhase === 0
    ? 'Pre-phase 1'
    : `Phase ${currentPhase}${currentPhaseDef?.name ? ` — ${currentPhaseDef.name}` : ''}`
  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
      <p className="text-xs text-protocol-text-muted uppercase tracking-wide">Current phase</p>
      <p className="mt-1 text-lg font-semibold text-protocol-text">{phaseLabel}</p>
      {currentPhaseDef?.arc && (
        <p className="mt-1 text-sm text-protocol-text-muted">{currentPhaseDef.arc}</p>
      )}
      {feminineName && (
        <p className="mt-2 text-sm text-protocol-text">She is <span className="font-medium">{feminineName}</span>.</p>
      )}
    </div>
  )
}

// ─── Requirements list ────────────────────────────────────────────────

function RequirementsList(props: {
  targetPhase: number
  targetDef: PhaseDef
  snapshot: SnapshotRow | null
}) {
  const { targetPhase, targetDef, snapshot } = props
  const reqs = snapshot?.requirements_state ?? {}

  // If there's no snapshot we still want to render the *shape* of the
  // requirements (with all "in progress" indicators) so the user sees
  // what's coming.
  const keys = Object.keys(reqs).length > 0
    ? Object.keys(reqs)
    : derivePlaceholderKeys(targetDef)

  const targetLabel = `Phase ${targetPhase}${targetDef.name ? ` — ${targetDef.name}` : ''}`

  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
      <p className="text-xs text-protocol-text-muted uppercase tracking-wide">Next: {targetLabel}</p>
      <ul className="mt-3 space-y-3">
        {keys.map(k => {
          const r = reqs[k]
          const met = r?.met ?? false
          const Icon = met ? Check : Circle
          return (
            <li key={k} className="flex items-start gap-3">
              <Icon className={`mt-0.5 w-4 h-4 ${met ? 'text-protocol-success' : 'text-protocol-text-muted'}`} />
              <div className="flex-1">
                <p className={`text-sm ${met ? 'text-protocol-success' : 'text-protocol-text'}`}>
                  {labelForKey(k, targetDef)}
                </p>
                {r && (
                  <p className="text-xs text-protocol-text-muted mt-0.5">
                    {fmtActualVsRequired(k, r)}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function derivePlaceholderKeys(def: PhaseDef): string[] {
  const keys: string[] = ['min_dwell_days']
  if (typeof def.compliance_pct_required === 'number') keys.push('compliance_pct')
  if (def.primer_requirements && def.primer_requirements.length > 0) keys.push('primers_completed')
  if (def.wardrobe_required) {
    for (const cat of Object.keys(def.wardrobe_required)) keys.push(`wardrobe_${cat}`)
  }
  return keys
}

function labelForKey(key: string, def: PhaseDef): string {
  if (key === 'min_dwell_days') return `${def.min_dwell_days ?? DEFAULT_MIN_DWELL_DAYS} days at current phase`
  if (key === 'compliance_pct') {
    const pct = Math.round((def.compliance_pct_required ?? 0) * 100)
    return `${pct}% completion rate over the last 14 days`
  }
  if (key === 'primers_completed') {
    const n = (def.primer_requirements ?? []).length
    return `${n} primer${n === 1 ? '' : 's'} completed`
  }
  if (key.startsWith('wardrobe_')) {
    const cat = key.slice('wardrobe_'.length)
    const need = def.wardrobe_required?.[cat] ?? 0
    return `${need} ${cat} item${need === 1 ? '' : 's'} in wardrobe`
  }
  return key
}

function fmtActualVsRequired(
  key: string,
  r: { actual: number | string[]; required: number | string[]; unit?: string },
): string {
  if (key === 'compliance_pct') {
    const a = typeof r.actual === 'number' ? Math.round(r.actual * 100) : 0
    const req = typeof r.required === 'number' ? Math.round(r.required * 100) : 0
    return `${a}% / ${req}%`
  }
  if (key === 'primers_completed') {
    const a = Array.isArray(r.actual) ? r.actual.length : 0
    const req = Array.isArray(r.required) ? r.required.length : 0
    return `${a} / ${req}`
  }
  if (key === 'min_dwell_days') {
    return `${typeof r.actual === 'number' ? r.actual : 0} / ${typeof r.required === 'number' ? r.required : 0} days`
  }
  if (key.startsWith('wardrobe_')) {
    return `${typeof r.actual === 'number' ? r.actual : 0} / ${typeof r.required === 'number' ? r.required : 0}`
  }
  return ''
}

// ─── ETA line ─────────────────────────────────────────────────────────
// Rough estimate: if compliance is the sole gate and trending up, calc when it
// crosses threshold. Otherwise show the most-recent failing requirement's gap.

function ETALine(props: { snapshot: SnapshotRow; targetDef: PhaseDef }) {
  const { snapshot, targetDef } = props
  if (snapshot.all_met) return null

  const dwell = snapshot.requirements_state.min_dwell_days
  if (dwell && !dwell.met && typeof dwell.required === 'number' && typeof dwell.actual === 'number') {
    const days = Math.max(0, dwell.required - dwell.actual)
    return (
      <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
        <Clock className="w-4 h-4" />
        <span>~{days} day{days === 1 ? '' : 's'} until min-dwell clears.</span>
      </div>
    )
  }

  const compliance = snapshot.requirements_state.compliance_pct
  if (compliance && !compliance.met
      && typeof compliance.required === 'number'
      && typeof compliance.actual === 'number') {
    const gap = Math.max(0, compliance.required - compliance.actual)
    const pct = Math.round(gap * 100)
    return (
      <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
        <Clock className="w-4 h-4" />
        <span>{pct} percentage point{pct === 1 ? '' : 's'} of completion away.</span>
      </div>
    )
  }

  return (
    <p className="text-sm text-protocol-text-muted">
      {snapshot.failing_summary || `Requirements for phase ${targetDef.phase} still pending.`}
    </p>
  )
}

// ─── Settings toggles ─────────────────────────────────────────────────

function SettingsToggles(props: {
  settings: UserStateRow
  savingKey: string | null
  onToggle: (key: 'auto_advance_phases' | 'phase_advance_congratulate', next: boolean) => void
}) {
  const { settings, savingKey, onToggle } = props
  const auto = settings.auto_advance_phases !== false
  const cong = settings.phase_advance_congratulate !== false
  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4 space-y-3">
      <p className="text-xs text-protocol-text-muted uppercase tracking-wide">Settings</p>
      <ToggleRow
        label="Auto-advance phases when ready"
        sub="Daily evaluator advances you automatically once requirements are met."
        checked={auto}
        saving={savingKey === 'auto_advance_phases'}
        onChange={next => onToggle('auto_advance_phases', next)}
      />
      <ToggleRow
        label="Send me congratulations when I advance"
        sub="A celebration outreach lands in Today on phase advance."
        checked={cong}
        saving={savingKey === 'phase_advance_congratulate'}
        onChange={next => onToggle('phase_advance_congratulate', next)}
        icon={<Sparkles className="w-4 h-4 text-protocol-accent" />}
      />
    </div>
  )
}

function ToggleRow(props: {
  label: string
  sub: string
  checked: boolean
  saving: boolean
  onChange: (next: boolean) => void
  icon?: React.ReactNode
}) {
  const { label, sub, checked, saving, onChange, icon } = props
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={saving}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-protocol-accent' : 'bg-protocol-surface-light'
        } ${saving ? 'opacity-60' : ''}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium text-protocol-text flex items-center gap-2">
          {icon} {label}
        </p>
        <p className="text-xs text-protocol-text-muted">{sub}</p>
      </div>
    </div>
  )
}
