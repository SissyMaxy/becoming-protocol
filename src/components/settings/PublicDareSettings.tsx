/**
 * PublicDareSettings — opt-in toggle, cadence, intensity floor, kind
 * allow-list, and a compact history view of prior dares.
 *
 * The privacy floor is the toggle — defaults to OFF. The picker bails
 * when this row doesn't exist or `public_dare_enabled` is false.
 *
 * Mirrors WardrobePrescriptionSettings' shape so users see consistent
 * Mommy-feature settings UI across surfaces.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Footprints, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

type Cadence = 'occasional' | 'weekly' | 'off';
type Intensity = 'gentle' | 'moderate' | 'firm' | 'relentless';
type DareKind =
  | 'wardrobe' | 'mantra' | 'posture' | 'position'
  | 'micro_ritual' | 'errand_specific';

interface Settings {
  public_dare_enabled: boolean;
  cadence: Cadence;
  min_intensity: Intensity;
  allowed_kinds: DareKind[] | null;
}

const DEFAULT_SETTINGS: Settings = {
  public_dare_enabled: false,
  cadence: 'occasional',
  min_intensity: 'gentle',
  allowed_kinds: null,
};

const ALL_KINDS: { id: DareKind; label: string; desc: string }[] = [
  { id: 'wardrobe', label: 'Wardrobe', desc: 'Wear something specific' },
  { id: 'mantra', label: 'Mantra', desc: 'Silent / sub-vocal phrases' },
  { id: 'posture', label: 'Posture', desc: 'How you stand, sit, walk' },
  { id: 'position', label: 'Position', desc: 'Brief private kneels / postures' },
  { id: 'micro_ritual', label: 'Micro-ritual', desc: 'Small ceremonial gestures' },
  { id: 'errand_specific', label: 'Errand', desc: 'Tied to a specific outing' },
];

interface HistoryRow {
  id: string;
  status: string;
  assigned_at: string;
  due_by: string | null;
  template: { kind: string; description: string } | null;
}

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'completed', 'skipped', 'expired'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export function PublicDareSettings() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('public_dare_settings')
      .select('public_dare_enabled, cadence, min_intensity, allowed_kinds')
      .eq('user_id', user.id)
      .maybeSingle();
    const row = data as Settings | null;
    if (row) setSettings(row);
  }, [user?.id]);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    let q = supabase.from('public_dare_assignments')
      .select(`
        id, status, assigned_at, due_by,
        template:public_dare_templates!template_id ( kind, description )
      `)
      .eq('user_id', user.id);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q.order('assigned_at', { ascending: false }).limit(50);
    setHistory((data as unknown as HistoryRow[] | null) ?? []);
    setHistoryLoading(false);
  }, [user?.id, filter]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const persistSettings = useCallback(async (next: Settings) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase.from('public_dare_settings')
        .upsert({
          user_id: user.id,
          public_dare_enabled: next.public_dare_enabled,
          cadence: next.cadence,
          min_intensity: next.min_intensity,
          allowed_kinds: next.allowed_kinds && next.allowed_kinds.length > 0
            ? next.allowed_kinds
            : null,
          updated_at: new Date().toISOString(),
        });
      setSettings(next);
    } finally {
      setSaving(false);
    }
  }, [user?.id]);

  const toggleKind = useCallback((k: DareKind) => {
    const current = settings.allowed_kinds ?? [];
    const next = current.includes(k)
      ? current.filter(x => x !== k)
      : [...current, k];
    persistSettings({ ...settings, allowed_kinds: next.length === ALL_KINDS.length ? null : next });
  }, [settings, persistSettings]);

  const cadences: { id: Cadence; label: string; desc: string }[] = useMemo(() => [
    { id: 'occasional', label: 'Occasional', desc: 'Mama picks her moments' },
    { id: 'weekly', label: 'Weekly', desc: 'About one per week' },
    { id: 'off', label: 'Paused', desc: 'No dares until you re-enable' },
  ], []);

  const intensities: Intensity[] = ['gentle', 'moderate', 'firm', 'relentless'];

  const isKindAllowed = (k: DareKind) =>
    settings.allowed_kinds === null || settings.allowed_kinds.includes(k);

  return (
    <div>
      <h2 className="text-sm font-medium mb-3 text-protocol-text-muted">
        Public Dares
      </h2>
      <div className="rounded-xl border p-4 bg-protocol-surface border-protocol-border space-y-5">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-protocol-text-muted" />
          <span className="text-sm font-medium text-protocol-text">
            {mommy ? "Let Mama send you out into the world" : "Public dares"}
            {saving && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
          </span>
        </div>

        <p className="text-xs text-protocol-text-muted/80 leading-relaxed">
          Discreet micro-tasks you do during your normal day — wear something
          specific to a grocery run, mouth a mantra in a public mirror, kneel
          briefly in your parked car. Nothing visible to strangers, nothing
          that draws attention. Off by default.
        </p>

        {/* Toggle — the privacy floor */}
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm text-protocol-text">Enabled</p>
            <p className="text-xs text-protocol-text-muted/80 mt-0.5">
              When on, Mama may assign you a public dare on the cadence you
              choose. Skipping is always free — no penalty.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.public_dare_enabled}
            onChange={e => persistSettings({ ...settings, public_dare_enabled: e.target.checked })}
            className="w-5 h-5 accent-protocol-accent cursor-pointer"
          />
        </label>

        {/* Cadence */}
        <div>
          <p className="text-sm text-protocol-text mb-2">Cadence</p>
          <div className="grid grid-cols-3 gap-2">
            {cadences.map(c => (
              <button
                key={c.id}
                disabled={!settings.public_dare_enabled && c.id !== 'off'}
                onClick={() => persistSettings({ ...settings, cadence: c.id })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  settings.cadence === c.id
                    ? 'border-protocol-accent bg-protocol-accent/10'
                    : 'border-protocol-border bg-protocol-surface-light hover:border-protocol-accent/30'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <p className="text-xs font-medium text-protocol-text">{c.label}</p>
                <p className="text-[10.5px] mt-0.5 text-protocol-text-muted/70">{c.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Min intensity */}
        <div>
          <p className="text-sm text-protocol-text mb-2">
            Minimum intensity
          </p>
          <p className="text-xs text-protocol-text-muted/80 mb-2">
            Mama only assigns dares at this tier or higher (capped by your
            protocol difficulty). Phase 1 users never draw cruel-tier dares
            regardless of this floor.
          </p>
          <div className="flex gap-2 flex-wrap">
            {intensities.map(i => (
              <button
                key={i}
                onClick={() => persistSettings({ ...settings, min_intensity: i })}
                className={`px-3 py-1.5 rounded-lg border text-xs capitalize transition-all ${
                  settings.min_intensity === i
                    ? 'border-protocol-accent bg-protocol-accent/10 text-protocol-text'
                    : 'border-protocol-border bg-protocol-surface-light text-protocol-text-muted hover:border-protocol-accent/30'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Allowed kinds */}
        <div>
          <p className="text-sm text-protocol-text mb-2">Allowed kinds</p>
          <p className="text-xs text-protocol-text-muted/80 mb-2">
            Untick any kind you'd rather not receive. All kinds enabled by
            default.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_KINDS.map(k => (
              <label
                key={k.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                  isKindAllowed(k.id)
                    ? 'border-protocol-accent bg-protocol-accent/10'
                    : 'border-protocol-border bg-protocol-surface-light'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isKindAllowed(k.id)}
                  onChange={() => toggleKind(k.id)}
                  className="mt-0.5 w-4 h-4 accent-protocol-accent cursor-pointer"
                />
                <div>
                  <p className="text-xs font-medium text-protocol-text">{k.label}</p>
                  <p className="text-[10.5px] mt-0.5 text-protocol-text-muted/70">{k.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      <h2 className="text-sm font-medium mb-3 mt-6 text-protocol-text-muted">
        Dare history
      </h2>
      <div className="rounded-xl border p-4 bg-protocol-surface border-protocol-border">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] capitalize border transition-all ${
                filter === s
                  ? 'border-protocol-accent bg-protocol-accent/10 text-protocol-text'
                  : 'border-protocol-border bg-protocol-surface-light text-protocol-text-muted hover:border-protocol-accent/30'
              }`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {historyLoading ? (
          <p className="text-xs text-protocol-text-muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-protocol-text-muted">
            No dares {filter !== 'all' ? `with status ${filter.replace('_', ' ')}` : 'yet'}.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map(h => (
              <li
                key={h.id}
                className="rounded-lg border border-protocol-border bg-protocol-surface-light px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10.5px] uppercase tracking-wider text-protocol-text-muted">
                    {(h.template?.kind ?? 'unknown').replace('_', ' ')} · {h.status.replace('_', ' ')}
                  </span>
                  <span className="text-[10.5px] text-protocol-text-muted/70">
                    {new Date(h.assigned_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-protocol-text leading-snug">
                  {(h.template?.description ?? '').length > 200
                    ? h.template!.description.slice(0, 200) + '…'
                    : (h.template?.description ?? '')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
