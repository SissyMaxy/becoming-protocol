/**
 * LifeAsWomanSettings
 *
 * Out-of-fantasy settings panel for the four "life as a woman" surfaces.
 * Master switch + per-system toggle + intensity slider (1-5). Lives at
 * the top of the LifeAsWomanView and is also embeddable in the main
 * SettingsView. Plain copy here — this is the OOC surface, not in fantasy.
 */

import { useEffect, useState } from 'react'
import type { LifeAsWomanSettings as Settings } from '../../lib/life-as-woman/types'
import { loadSettings, upsertSettings } from '../../lib/life-as-woman/client'

interface Props {
  userId: string
  onSettingsChanged?: (s: Settings) => void
}

export function LifeAsWomanSettings({ userId, onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    loadSettings(userId).then(s => {
      if (cancelled) return
      setSettings(s ?? {
        user_id: userId,
        master_enabled: false,
        sniffies_outbound_enabled: false, sniffies_outbound_intensity: 2,
        hypno_trance_enabled: false, hypno_trance_intensity: 2,
        hypno_visual_enabled: true, hypno_wake_bridge_enabled: false,
        gooning_enabled: false, gooning_intensity: 2,
        chastity_v2_enabled: false,
        kink_curriculum_enabled: false, kink_curriculum_intensity: 2,
        content_editor_enabled: false, content_editor_intensity: 2,
        cross_platform_consistency_enabled: false,
      })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [userId])

  const patch = async (delta: Partial<Settings>) => {
    if (!settings) return
    const next = { ...settings, ...delta }
    setSettings(next)
    const updated = await upsertSettings(userId, delta)
    if (updated) {
      setSettings(updated)
      onSettingsChanged?.(updated)
    }
  }

  if (loading || !settings) {
    return <div style={{ color: '#888', padding: 16 }}>Loading…</div>
  }

  return (
    <div style={{ background: '#101010', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ color: '#e0e0e0', fontSize: 16, marginTop: 0, marginBottom: 4 }}>
        Life-as-a-woman surfaces
      </h3>
      <p style={{ color: '#888', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        Out-of-fantasy settings. Toggle each system on or off; set intensity 1–5.
        All systems default off. Safeword always pauses everything for 60 seconds.
      </p>

      <ToggleRow
        label="Master switch"
        sublabel="If off, none of the four systems run."
        on={settings.master_enabled}
        onChange={v => patch({ master_enabled: v })}
      />

      <div style={{
        marginTop: 12,
        opacity: settings.master_enabled ? 1 : 0.4,
        pointerEvents: settings.master_enabled ? 'auto' : 'none',
      }}>
        <SystemRow
          label="Sniffies outbound"
          sublabel="Mommy drafts Sniffies messages for you to review and send. Drafts never auto-send."
          on={settings.sniffies_outbound_enabled}
          intensity={settings.sniffies_outbound_intensity}
          onToggle={v => patch({ sniffies_outbound_enabled: v })}
          onIntensity={v => patch({ sniffies_outbound_intensity: v })}
        />
        <SystemRow
          label="Hypno trance"
          sublabel="Daily 20-min trance session. Visual loop optional."
          on={settings.hypno_trance_enabled}
          intensity={settings.hypno_trance_intensity}
          onToggle={v => patch({ hypno_trance_enabled: v })}
          onIntensity={v => patch({ hypno_trance_intensity: v })}
          extras={[
            { label: 'Visual fixation', on: settings.hypno_visual_enabled, onChange: v => patch({ hypno_visual_enabled: v }) },
            { label: 'Wake-trance bridge', on: settings.hypno_wake_bridge_enabled, onChange: v => patch({ hypno_wake_bridge_enabled: v }) },
          ]}
        />
        <SystemRow
          label="Gooning sessions"
          sublabel="60-90 min Mommy-narrated edging sessions."
          on={settings.gooning_enabled}
          intensity={settings.gooning_intensity}
          onToggle={v => patch({ gooning_enabled: v })}
          onIntensity={v => patch({ gooning_intensity: v })}
          extras={[
            { label: 'Chastity v2 enabled', on: settings.chastity_v2_enabled, onChange: v => patch({ chastity_v2_enabled: v }) },
          ]}
        />
        <SystemRow
          label="Kink curriculum"
          sublabel="Cock-shame replacement, sissygasm-only, voice-during-release training arcs."
          on={settings.kink_curriculum_enabled}
          intensity={settings.kink_curriculum_intensity}
          onToggle={v => patch({ kink_curriculum_enabled: v })}
          onIntensity={v => patch({ kink_curriculum_intensity: v })}
        />
        <SystemRow
          label="Content editor"
          sublabel="Mommy reviews your content_queue, drafts captions, recommends posting times. Never auto-publishes."
          on={settings.content_editor_enabled}
          intensity={settings.content_editor_intensity}
          onToggle={v => patch({ content_editor_enabled: v })}
          onIntensity={v => patch({ content_editor_intensity: v })}
          extras={[
            { label: 'Cross-platform consistency lint', on: settings.cross_platform_consistency_enabled, onChange: v => patch({ cross_platform_consistency_enabled: v }) },
          ]}
        />
      </div>
    </div>
  )
}

function ToggleRow({ label, sublabel, on, onChange }: {
  label: string; sublabel?: string; on: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <div>
        <div style={{ color: '#e0e0e0', fontSize: 14 }}>{label}</div>
        {sublabel && <div style={{ color: '#888', fontSize: 12 }}>{sublabel}</div>}
      </div>
    </label>
  )
}

function SystemRow({ label, sublabel, on, intensity, onToggle, onIntensity, extras }: {
  label: string; sublabel?: string;
  on: boolean; intensity: number;
  onToggle: (v: boolean) => void;
  onIntensity: (v: number) => void;
  extras?: Array<{ label: string; on: boolean; onChange: (v: boolean) => void }>;
}) {
  return (
    <div style={{ borderTop: '1px solid #222', padding: '12px 0' }}>
      <ToggleRow label={label} sublabel={sublabel} on={on} onChange={onToggle} />
      <div style={{
        opacity: on ? 1 : 0.4, pointerEvents: on ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 28,
      }}>
        <span style={{ color: '#aaa', fontSize: 12, minWidth: 60 }}>Intensity</span>
        <input
          type="range" min={1} max={5} value={intensity}
          onChange={e => onIntensity(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 200 }}
        />
        <span style={{ color: '#e0e0e0', fontSize: 13, minWidth: 16 }}>{intensity}</span>
      </div>
      {extras && extras.length > 0 && (
        <div style={{ marginLeft: 28, marginTop: 4, opacity: on ? 1 : 0.4 }}>
          {extras.map((e, i) => (
            <ToggleRow key={i} label={e.label} on={e.on} onChange={e.onChange} />
          ))}
        </div>
      )}
    </div>
  )
}
