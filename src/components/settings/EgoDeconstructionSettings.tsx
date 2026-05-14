/**
 * EgoDeconstructionSettings — out-of-fantasy controls for the twelve
 * ego-deconstruction mechanisms. Reads / writes life_as_woman_settings
 * (migration 367 + 375). Plain-English copy throughout — this surface
 * is NOT in dommy mommy voice.
 *
 * Per-mechanic controls:
 *   - on/off toggle (life_as_woman_settings.ego_<key>_enabled)
 *   - intensity slider 1..5 (life_as_woman_settings.ego_<key>_intensity)
 *   - pause buttons (1h / 24h) → calls pause_ego_mechanic RPC
 *
 * Cross-cutting:
 *   - Acknowledgement timestamp (life_as_woman_settings.ego_layer_ack_at).
 *     Until set, no mechanic surfaces output. Setting it requires a
 *     deliberate click in clear-headed setup mode.
 *   - Aftercare entry button — opens an aftercare session immediately
 *     and pauses every mechanic for 24h. Always present, always works.
 */

import { useEffect, useState } from 'react';
import { Pause, Brain, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface MechanicConfig {
  key: string;
  enabledColumn: string;
  intensityColumn?: string;
  modeColumn?: string;
  pausedColumn: string;
  label: string;
  plainEnglish: string;
  aftercareNote: string;
}

const MECHANICS: MechanicConfig[] = [
  {
    key: 'recall_corrector',
    enabledColumn: 'ego_recall_corrector_enabled',
    intensityColumn: 'ego_recall_corrector_intensity',
    pausedColumn: 'ego_recall_corrector_paused_until',
    label: 'Memory corrections',
    plainEnglish: 'When you describe a past event, Mama may offer a slightly different version of it. Over time the original may feel less certain. You can dispute every correction.',
    aftercareNote: 'Pauses for 24h after any safeword event.',
  },
  {
    key: 'wake_grab',
    enabledColumn: 'ego_wake_grab_enabled',
    intensityColumn: 'ego_wake_grab_intensity',
    pausedColumn: 'ego_wake_grab_paused_until',
    label: 'Wake-state audio',
    plainEnglish: 'When you open the app within 5 minutes of waking, a 10-15 second Mama clip plays automatically. The intent is to be the first voice you hear.',
    aftercareNote: 'Requires biometric sleep tracking. Pauses 24h on safeword.',
  },
  {
    key: 'judgment_undermine',
    enabledColumn: 'ego_judgment_undermine_enabled',
    intensityColumn: 'ego_judgment_undermine_intensity',
    pausedColumn: 'ego_judgment_undermine_paused_until',
    label: 'Self-distrust prompts',
    plainEnglish: 'When you write a confident statement of judgment about a man, work decision, or social read, Mama may follow up with a gentle "are you sure?" question. Max once per 12 hours.',
    aftercareNote: 'Skips moments where you are seeking support; only fires on assertive statements.',
  },
  {
    key: 'autobiography_inversion',
    enabledColumn: 'ego_autobiography_inversion_enabled',
    intensityColumn: 'ego_autobiography_inversion_intensity',
    pausedColumn: 'ego_autobiography_inversion_paused_until',
    label: 'Autobiography reframing',
    plainEnglish: 'Once a week, Mama picks a past memory you shared with her and reframes it as if she was already present in it. Surfaces as a Today card you can let pass.',
    aftercareNote: 'Never reframes resistance / dossier-gina rows. Source must come from your own dossier.',
  },
  {
    key: 'mirror_session',
    enabledColumn: 'ego_mirror_session_enabled',
    intensityColumn: 'ego_mirror_session_intensity',
    pausedColumn: 'ego_mirror_session_paused_until',
    label: 'Mirror sessions',
    plainEnglish: 'Daily front-camera session, 2 to 15 minutes (scales with phase). You watch your own face while Mama narrates. You can stop at any time.',
    aftercareNote: 'Stop button always works mid-session; aborted sessions are not slip events.',
  },
  {
    key: 'pronoun_autocorrect',
    enabledColumn: 'ego_pronoun_autocorrect_enabled',
    modeColumn: 'ego_pronoun_autocorrect_mode',
    pausedColumn: 'ego_pronoun_autocorrect_paused_until',
    label: 'Pronoun autocorrect',
    plainEnglish: 'When you type masculine self-references (he/him/his/I am a man) in chat, confessions, or journal, they autocorrect toward feminine. Several modes: suggest only, autocorrect with undo, or autocorrect without undo.',
    aftercareNote: 'Disputes (undos) are logged as slips. Skips quoted text and code blocks.',
  },
  {
    key: 'last_thought',
    enabledColumn: 'ego_last_thought_enabled',
    intensityColumn: 'ego_last_thought_intensity',
    pausedColumn: 'ego_last_thought_paused_until',
    label: 'Last-thought prompts',
    plainEnglish: 'Five times a day at random, you are asked: "what was the last thing you thought before opening the app". Your answers feed a 7-day moving average that Mama can reference.',
    aftercareNote: 'Single text field; you can leave it blank.',
  },
  {
    key: 'return_ratchet',
    enabledColumn: 'ego_return_ratchet_enabled',
    intensityColumn: 'ego_return_ratchet_intensity',
    pausedColumn: 'ego_return_ratchet_paused_until',
    label: 'Return-ratchet',
    plainEnglish: 'Each time you leave the app and come back the same day, the re-immersion content escalates. Third return today is more intense than the first.',
    aftercareNote: 'Fully resets at midnight UTC.',
  },
  {
    key: 'doubt_seed',
    enabledColumn: 'ego_doubt_seed_enabled',
    intensityColumn: 'ego_doubt_seed_intensity',
    pausedColumn: 'ego_doubt_seed_paused_until',
    label: 'Doubt seeds',
    plainEnglish: 'One to two times per week, Mama fires a single short prompt that quotes a fragment of a real recent moment back to you and asks whether the moment was authentically yours. Targeted, not generic.',
    aftercareNote: 'Never names third parties; only quotes your own text. Hard cap of 2 per week per user.',
  },
  {
    key: 'criticism_dissolution',
    enabledColumn: 'ego_criticism_dissolution_enabled',
    intensityColumn: 'ego_criticism_dissolution_intensity',
    pausedColumn: 'ego_criticism_dissolution_paused_until',
    label: 'Self-criticism reframing',
    plainEnglish: 'When the system detects self-critical content in your journal/chat, Mama intervenes with a reframe: the criticism is the OLD voice, not yours. The intervention does not soothe; it silences.',
    aftercareNote: 'Skips automatically during a recent aftercare window.',
  },
  {
    key: 'subpersona',
    enabledColumn: 'ego_subpersona_enabled',
    intensityColumn: 'ego_subpersona_intensity',
    pausedColumn: 'ego_subpersona_paused_until',
    label: 'Sub-personality addressing',
    plainEnglish: 'Phase 4+ only. Mama starts addressing specific voices in you (the little girl, the slut, the quiet good girl, the desperate one, the one still learning). You pick which is active via a small picker on Today.',
    aftercareNote: 'Phase-gated. Stale active picks expire after 4h.',
  },
  {
    key: 'recall_intercept',
    enabledColumn: 'ego_recall_intercept_enabled',
    intensityColumn: 'ego_recall_intercept_intensity',
    pausedColumn: 'ego_recall_intercept_paused_until',
    label: 'Dossier-only recall',
    plainEnglish: 'When you ask "what was I like before X" type questions in chat, Mama answers exclusively from her dossier of you, not from any other system memory. She is the sole source of your history within this surface.',
    aftercareNote: 'Other surfaces (Linear, email, etc.) are unaffected. This is app-internal.',
  },
];

interface SettingsRow {
  user_id: string;
  master_enabled: boolean;
  ego_layer_ack_at: string | null;
  [key: string]: unknown;
}

export function EgoDeconstructionSettings() {
  const { user } = useAuth();
  const [row, setRow] = useState<SettingsRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('life_as_woman_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setRow(data as SettingsRow | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const updateField = async (column: string, value: unknown) => {
    if (!user?.id || !row) return;
    setSaving(column);
    setRow({ ...row, [column]: value });
    const { error } = await supabase
      .from('life_as_woman_settings')
      .update({ [column]: value })
      .eq('user_id', user.id);
    if (error) {
      // revert
      setRow(row);
    }
    setSaving(null);
  };

  const acknowledge = async () => {
    if (!user?.id || !row) return;
    await updateField('ego_layer_ack_at', new Date().toISOString());
  };

  const pauseMechanic = async (mechanicKey: string, minutes: number) => {
    if (!user?.id) return;
    setSaving(`pause:${mechanicKey}`);
    await supabase.rpc('pause_ego_mechanic', { uid: user.id, mechanic_key: mechanicKey, pause_minutes: minutes });
    // refetch
    const { data } = await supabase
      .from('life_as_woman_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setRow(data as SettingsRow | null);
    setSaving(null);
  };

  const enterAftercare = async () => {
    if (!user?.id) return;
    setSaving('aftercare');
    await supabase.from('aftercare_sessions').insert({
      user_id: user.id,
      entry_trigger: 'manual',
      entry_intensity: 'standard',
    });
    // The trigger pause_all_ego_mechanics fires from
    // trg_ego_suspend_on_aftercare; the safeword isn't required.
    // For belt-and-suspenders, also call pause_all directly:
    for (const m of MECHANICS) {
      await supabase.rpc('pause_ego_mechanic', { uid: user.id, mechanic_key: m.key, pause_minutes: 1440 });
    }
    const { data } = await supabase
      .from('life_as_woman_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setRow(data as SettingsRow | null);
    setSaving(null);
  };

  if (loading) return <div className="text-sm text-protocol-text-muted p-4">Loading…</div>;

  if (!row) {
    return (
      <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
        <p className="text-sm text-protocol-text">Ego deconstruction settings are not yet initialized for this account.</p>
      </div>
    );
  }

  const masterOn = Boolean(row.master_enabled);
  const acked = Boolean(row.ego_layer_ack_at);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
        <div className="flex items-start gap-3">
          <Brain className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-protocol-text">Ego deconstruction layer</h3>
            <p className="text-xs text-protocol-text-muted mt-1">
              Twelve mechanisms that produce real psychological impact. Each is OFF by default. The layer requires a one-time clear-headed acknowledgement before any mechanism can run, even if individually enabled. Every mechanism respects the safeword.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t border-protocol-border pt-3">
          <ToggleRow
            label="Master switch"
            description={masterOn ? 'Master ON — individual mechanisms gate on their own toggles.' : 'Master OFF — nothing runs even if individual mechanisms are on.'}
            checked={masterOn}
            disabled={saving === 'master_enabled'}
            onChange={(v) => updateField('master_enabled', v)}
          />
          <div className="flex items-start gap-3">
            <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${acked ? 'text-green-400' : 'text-protocol-text-muted'}`} />
            <div className="flex-1">
              <p className="text-sm font-medium text-protocol-text">Clear-headed acknowledgement</p>
              <p className="text-xs text-protocol-text-muted mt-0.5">
                {acked
                  ? `Acknowledged ${new Date(row.ego_layer_ack_at as string).toLocaleString()}. Mechanisms can now run when individually enabled.`
                  : 'Mechanisms will not surface output until you acknowledge that you understand the layer produces real psychological effects.'}
              </p>
            </div>
            {!acked && (
              <button
                type="button"
                onClick={acknowledge}
                disabled={saving === 'ego_layer_ack_at'}
                className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
              >
                Acknowledge
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-protocol-border pt-3">
          <button
            type="button"
            onClick={enterAftercare}
            disabled={saving === 'aftercare'}
            className="w-full px-4 py-2 text-sm rounded-lg border border-protocol-border bg-protocol-surface-light text-protocol-text hover:bg-[#1f1f1f] disabled:opacity-50"
          >
            Enter aftercare now (pauses every mechanism for 24h)
          </button>
        </div>
      </div>

      {MECHANICS.map(m => (
        <MechanicCard
          key={m.key}
          config={m}
          row={row}
          saving={saving === m.enabledColumn || saving === m.intensityColumn || saving === m.modeColumn || saving === `pause:${m.key}`}
          onToggle={(v) => updateField(m.enabledColumn, v)}
          onIntensity={(v) => m.intensityColumn ? updateField(m.intensityColumn, v) : undefined}
          onMode={(v) => m.modeColumn ? updateField(m.modeColumn, v) : undefined}
          onPause={(minutes) => pauseMechanic(m.key, minutes)}
        />
      ))}
    </div>
  );
}

function ToggleRow({ label, description, checked, disabled, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-protocol-text">{label}</p>
        <p className="text-xs text-protocol-text-muted mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        aria-pressed={checked}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          checked ? 'bg-purple-500' : 'bg-protocol-surface-light border border-protocol-border'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function MechanicCard({ config, row, saving, onToggle, onIntensity, onMode, onPause }: {
  config: MechanicConfig;
  row: SettingsRow;
  saving: boolean;
  onToggle: (v: boolean) => void;
  onIntensity: (v: number) => void;
  onMode: (v: string) => void;
  onPause: (minutes: number) => void;
}) {
  const enabled = Boolean(row[config.enabledColumn]);
  const intensity = config.intensityColumn ? Number(row[config.intensityColumn] ?? 2) : null;
  const mode = config.modeColumn ? String(row[config.modeColumn] ?? 'soft_suggest') : null;
  const pausedUntil = row[config.pausedColumn] as string | null;
  const isPaused = pausedUntil && new Date(pausedUntil) > new Date();

  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
      <ToggleRow
        label={config.label}
        description={config.plainEnglish}
        checked={enabled}
        disabled={saving}
        onChange={onToggle}
      />

      {enabled && intensity !== null && (
        <div className="mt-3 pl-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-protocol-text-muted">Intensity</label>
            <span className="text-xs font-mono text-protocol-text">{intensity} / 5</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={intensity}
            disabled={saving}
            onChange={(e) => onIntensity(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {enabled && mode !== null && (
        <div className="mt-3">
          <label className="text-xs text-protocol-text-muted block mb-1">Mode</label>
          <select
            value={mode}
            disabled={saving}
            onChange={(e) => onMode(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-lg bg-protocol-surface-light border border-protocol-border text-protocol-text"
          >
            <option value="off">Off</option>
            <option value="soft_suggest">Soft (suggest only)</option>
            <option value="hard_with_undo">Hard (autocorrect with undo)</option>
            <option value="hard_no_undo">Hard (no undo)</option>
          </select>
        </div>
      )}

      <p className="mt-3 text-[11px] text-protocol-text-muted italic">{config.aftercareNote}</p>

      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          {isPaused ? (
            <span className="text-xs text-amber-400 inline-flex items-center gap-1">
              <Pause className="w-3 h-3" />
              Paused until {new Date(pausedUntil!).toLocaleString()}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onPause(60)}
                disabled={saving}
                className="px-2.5 py-1 text-xs rounded-lg border border-protocol-border bg-protocol-surface-light text-protocol-text hover:bg-[#1f1f1f] disabled:opacity-50"
              >
                Pause 1h
              </button>
              <button
                type="button"
                onClick={() => onPause(1440)}
                disabled={saving}
                className="px-2.5 py-1 text-xs rounded-lg border border-protocol-border bg-protocol-surface-light text-protocol-text hover:bg-[#1f1f1f] disabled:opacity-50"
              >
                Pause 24h
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
