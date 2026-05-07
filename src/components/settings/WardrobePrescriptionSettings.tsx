/**
 * WardrobePrescriptionSettings — toggle, cadence, budget cap, and a
 * compact history view of prior prescriptions.
 *
 * Only meaningful when persona = 'dommy_mommy'. Renders a quiet
 * notice when the user is on a different persona, since Mommy is
 * the only generator wired to fire wardrobe prescriptions today.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shirt, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

type Cadence = 'occasional' | 'weekly' | 'off';

interface Settings {
  enabled: boolean;
  cadence: Cadence;
  budget_cap_usd: number | null;
  min_intensity: 'gentle' | 'moderate' | 'firm' | 'relentless';
}

interface HistoryRow {
  id: string;
  description: string;
  item_type: string;
  status: string;
  assigned_at: string;
  due_by: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  cadence: 'occasional',
  budget_cap_usd: null,
  min_intensity: 'firm',
};

const STATUS_FILTERS = ['all', 'pending', 'verifying', 'approved', 'denied', 'expired', 'cancelled'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

export function WardrobePrescriptionSettings() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [budgetText, setBudgetText] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('wardrobe_prescription_settings')
      .select('enabled, cadence, budget_cap_usd, min_intensity')
      .eq('user_id', user.id)
      .maybeSingle();
    const row = data as Settings | null;
    if (row) {
      setSettings(row);
      setBudgetText(row.budget_cap_usd != null ? String(row.budget_cap_usd) : '');
    }
  }, [user?.id]);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    let q = supabase.from('wardrobe_prescriptions')
      .select('id, description, item_type, status, assigned_at, due_by')
      .eq('user_id', user.id);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data } = await q.order('assigned_at', { ascending: false }).limit(50);
    setHistory((data as HistoryRow[] | null) ?? []);
    setHistoryLoading(false);
  }, [user?.id, filter]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const persistSettings = useCallback(async (next: Settings) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase.from('wardrobe_prescription_settings')
        .upsert({
          user_id: user.id,
          enabled: next.enabled,
          cadence: next.cadence,
          budget_cap_usd: next.budget_cap_usd,
          min_intensity: next.min_intensity,
          updated_at: new Date().toISOString(),
        });
      setSettings(next);
    } finally {
      setSaving(false);
    }
  }, [user?.id]);

  const updateBudget = useCallback(async () => {
    const trimmed = budgetText.trim();
    let parsed: number | null = null;
    if (trimmed.length > 0) {
      const n = Number(trimmed.replace(/[$,]/g, ''));
      if (Number.isFinite(n) && n > 0) parsed = Math.round(n * 100) / 100;
    }
    if (parsed === settings.budget_cap_usd) return;
    await persistSettings({ ...settings, budget_cap_usd: parsed });
  }, [budgetText, settings, persistSettings]);

  const cadences: { id: Cadence; label: string; desc: string }[] = useMemo(() => [
    { id: 'occasional', label: 'Occasional', desc: 'Mama picks her moments' },
    { id: 'weekly', label: 'Weekly', desc: 'One per week, regular cadence' },
    { id: 'off', label: 'Paused', desc: 'No prescriptions until you re-enable' },
  ], []);

  const intensities: Settings['min_intensity'][] = ['gentle', 'moderate', 'firm', 'relentless'];

  return (
    <div>
      <h2 className="text-sm font-medium mb-3 text-protocol-text-muted">
        Wardrobe Prescriptions
      </h2>
      <div className="rounded-xl border p-4 bg-protocol-surface border-protocol-border space-y-5">
        <div className="flex items-center gap-2">
          <Shirt className="w-4 h-4 text-protocol-text-muted" />
          <span className="text-sm font-medium text-protocol-text">
            {mommy ? "Let Mama prescribe wardrobe items" : "Wardrobe acquisition prescriptions"}
            {saving && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
          </span>
        </div>

        {!mommy && (
          <p className="text-xs text-protocol-text-muted/80 leading-relaxed">
            This feature is wired to the Dommy Mommy persona. Switch personas to use it; settings persist either way.
          </p>
        )}

        {/* Toggle */}
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm text-protocol-text">Enabled</p>
            <p className="text-xs text-protocol-text-muted/80 mt-0.5">
              When on, Mama will occasionally assign you a wardrobe acquisition. You buy it; she checks the photo.
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={e => persistSettings({ ...settings, enabled: e.target.checked })}
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
                disabled={!settings.enabled && c.id !== 'off'}
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
            Minimum intensity to fire
          </p>
          <p className="text-xs text-protocol-text-muted/80 mb-2">
            Mama only prescribes when your protocol difficulty is at this level or higher.
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

        {/* Budget */}
        <div>
          <p className="text-sm text-protocol-text mb-2">Budget cap</p>
          <p className="text-xs text-protocol-text-muted/80 mb-2">
            Plain-language hint to Mama — leave blank for no cap. She won't suggest items above this.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={budgetText}
              onChange={e => setBudgetText(e.target.value)}
              onBlur={updateBudget}
              placeholder="e.g. 80"
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-protocol-surface-light border border-protocol-border text-protocol-text"
            />
            <button
              onClick={updateBudget}
              className="px-4 py-2 rounded-lg text-xs font-medium border border-protocol-border bg-protocol-surface-light hover:border-protocol-accent/40 text-protocol-text"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* History */}
      <h2 className="text-sm font-medium mb-3 mt-6 text-protocol-text-muted">
        Prescription history
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
              {s}
            </button>
          ))}
        </div>

        {historyLoading ? (
          <p className="text-xs text-protocol-text-muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-protocol-text-muted">
            No prescriptions {filter !== 'all' ? `with status ${filter}` : 'yet'}.
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
                    {h.item_type.replace(/_/g, ' ')} · {h.status}
                  </span>
                  <span className="text-[10.5px] text-protocol-text-muted/70">
                    {new Date(h.assigned_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-protocol-text leading-snug">
                  {h.description.length > 200 ? h.description.slice(0, 200) + '…' : h.description}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
