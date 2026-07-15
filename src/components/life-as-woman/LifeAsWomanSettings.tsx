/**
 * LifeAsWomanSettings
 *
 * Out-of-fantasy Protocol Contract for the life-as-a-woman surfaces.
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
        protocol_contract_ack_at: null,
        cnc_approved: false,
        cnc_intensity: 0,
        cnc_hard_limits: '',
        cnc_scope: 'fantasy_conditioning_only',
        sniffies_outbound_enabled: false, sniffies_outbound_intensity: 2,
        hypno_trance_enabled: false, hypno_trance_intensity: 2,
        hypno_visual_enabled: true, hypno_wake_bridge_enabled: false,
        recondition_enabled: false, recondition_intensity: 2,
        recon_sleep_enabled: false,
        gooning_enabled: false, gooning_intensity: 2,
        turnout_fantasy_enabled: false, turnout_fantasy_intensity: 2,
        chastity_v2_enabled: false,
        kink_curriculum_enabled: false, kink_curriculum_intensity: 2,
        content_editor_enabled: false, content_editor_intensity: 2,
        cross_platform_consistency_enabled: false,
        recondition_enabled: false, recon_sleep_enabled: false,
        turnout_enabled: false,
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
    return <div style={{ color: 'var(--protocol-text-muted)', padding: 16 }}>Loading…</div>
  }

  const protocolActive = settings.master_enabled && !!settings.cnc_approved

  return (
    <div style={{ background: 'var(--protocol-surface)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ color: 'var(--protocol-text)', fontSize: 16, marginTop: 0, marginBottom: 4 }}>
        Protocol Contract
      </h3>
      <p style={{ color: 'var(--protocol-text-muted)', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        Out-of-fantasy settings. Toggle each system on or off; set intensity 1–5.
        Inside that contract, Mommy decides the order, timing, denial, reward, and proof.
      </p>

      <ToggleRow
        label="Master protocol switch"
        sublabel="If off, none of the intense systems run."
        on={settings.master_enabled}
        onChange={v => patch({ master_enabled: v })}
      />

      <ToggleRow
        label="Consensual control approved"
        sublabel="Mommy may be commanding inside the negotiated protocol. OOC safety stays yours."
        on={!!settings.cnc_approved}
        onChange={v => patch({
          cnc_approved: v,
          protocol_contract_ack_at: v ? new Date().toISOString() : null,
        })}
      />

      <label style={{ display: 'block', marginTop: 10 }}>
        <div style={{ color: 'var(--protocol-text)', fontSize: 13, marginBottom: 4 }}>Hard limits</div>
        <textarea
          value={settings.cnc_hard_limits ?? ''}
          onChange={e => patch({ cnc_hard_limits: e.target.value })}
          placeholder="Anything Mommy must not touch."
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--protocol-bg-deep)',
            border: '1px solid var(--protocol-border)',
            borderRadius: 8,
            color: 'var(--protocol-text)',
            padding: 10,
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
      </label>

      <div style={{
        marginTop: 10,
        padding: 10,
        borderRadius: 8,
        border: '1px solid var(--protocol-border)',
        color: 'rgb(var(--protocol-text-rgb) / 0.72)',
        fontSize: 12,
        lineHeight: 1.45,
      }}>
        Full stop suppresses hypno, gooning, reconditioning, device control, and turnout fantasy immediately.
        No sleep conditioning, manufactured memories, auto-sent hookup actions, or recordings as leverage.
      </div>

      <div style={{
        marginTop: 12,
        opacity: protocolActive ? 1 : 0.4,
        pointerEvents: protocolActive ? 'auto' : 'none',
      }}>
        <SystemRow
          label="Reconditioning conductor"
          sublabel="Mommy picks one active target and routes hypno, gooning, proof, and embodiment around it. Sleep cue playback stays disabled by boundary."
          on={!!settings.recondition_enabled}
          intensity={settings.recondition_intensity ?? 2}
          onToggle={v => patch({ recondition_enabled: v })}
          onIntensity={v => patch({ recondition_intensity: v })}
        />
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
          sublabel="Today's Trance: target-aware induction, payload, emergence, and one proof action."
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
          sublabel="Mommy-authored imprinting sessions with denial/reward and proof."
          on={settings.gooning_enabled}
          intensity={settings.gooning_intensity}
          onToggle={v => patch({ gooning_enabled: v })}
          onIntensity={v => patch({ gooning_intensity: v })}
          extras={[
            { label: 'Chastity v2 enabled', on: settings.chastity_v2_enabled, onChange: v => patch({ chastity_v2_enabled: v }) },
          ]}
        />
        <SystemRow
          label="Turnout fantasy conditioning"
          sublabel="Fantasy/desire sessions and private debriefs only. Real-person action requires clear-headed user initiation."
          on={!!settings.turnout_fantasy_enabled}
          intensity={settings.turnout_fantasy_intensity ?? 2}
          onToggle={v => patch({ turnout_fantasy_enabled: v })}
          onIntensity={v => patch({ turnout_fantasy_intensity: v })}
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
          sublabel="Mommy reviews content_queue, drafts captions, and assigns posting windows. Never auto-publishes."
          on={settings.content_editor_enabled}
          intensity={settings.content_editor_intensity}
          onToggle={v => patch({ content_editor_enabled: v })}
          onIntensity={v => patch({ content_editor_intensity: v })}
          extras={[
            { label: 'Cross-platform consistency lint', on: settings.cross_platform_consistency_enabled, onChange: v => patch({ cross_platform_consistency_enabled: v }) },
          ]}
        />
        <PlainSystemRow
          label="Reconditioning engine"
          sublabel="Mommy picks one measurable belief/habit target at a time and works it through trance, spaced retrieval, and reconsolidation sessions. Change is measured, never just asserted. No punishment for a missed rep."
          on={settings.recondition_enabled}
          onToggle={v => patch({ recondition_enabled: v })}
          extras={[
            { label: 'Sleep cue replay (hardest opt-in — plays back phrases already installed while awake, low-volume, during sleep; never introduces anything new)', on: settings.recon_sleep_enabled, onChange: v => patch({ recon_sleep_enabled: v }) },
          ]}
        />
        <PlainSystemRow
          label="Turn-out ladder"
          sublabel="Sequences the existing escalation systems (funnel, meet safety, revenue) one small step at a time instead of each firing on its own. Meet-safety and health-prep gates stay absolute and unaffected by this toggle."
          on={settings.turnout_enabled}
          onToggle={v => patch({ turnout_enabled: v })}
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
        <div style={{ color: 'var(--protocol-text)', fontSize: 14 }}>{label}</div>
        {sublabel && <div style={{ color: 'var(--protocol-text-muted)', fontSize: 12 }}>{sublabel}</div>}
      </div>
    </label>
  )
}

function PlainSystemRow({ label, sublabel, on, onToggle, extras }: {
  label: string; sublabel?: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  extras?: Array<{ label: string; on: boolean; onChange: (v: boolean) => void }>;
}) {
  return (
    <div style={{ borderTop: '1px solid #222', padding: '12px 0' }}>
      <ToggleRow label={label} sublabel={sublabel} on={on} onChange={onToggle} />
      {extras && extras.length > 0 && (
        <div style={{ marginLeft: 28, marginTop: 4, opacity: on ? 1 : 0.4, pointerEvents: on ? 'auto' : 'none' }}>
          {extras.map((e, i) => (
            <ToggleRow key={i} label={e.label} on={e.on} onChange={e.onChange} />
          ))}
        </div>
      )}
    </div>
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
    <div style={{ borderTop: '1px solid rgb(var(--protocol-border-rgb) / 0.6)', padding: '12px 0' }}>
      <ToggleRow label={label} sublabel={sublabel} on={on} onChange={onToggle} />
      <div style={{
        opacity: on ? 1 : 0.4, pointerEvents: on ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 28,
      }}>
        <span style={{ color: 'var(--protocol-text-muted)', fontSize: 12, minWidth: 60 }}>Intensity</span>
        <input
          type="range" min={1} max={5} value={intensity}
          onChange={e => onIntensity(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 200 }}
        />
        <span style={{ color: 'var(--protocol-text)', fontSize: 13, minWidth: 16 }}>{intensity}</span>
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
