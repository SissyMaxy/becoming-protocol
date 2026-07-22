/**
 * FirstsView — the streak-of-firsts (WS6).
 *
 * A replay of the real firsts she has crossed on the turn-out arc: each
 * consolidated rung (turnout_rung_completions) and each debriefed scene, each
 * shown with HER OWN debrief words quoted verbatim. True-quote-only — no
 * fabricated event, no implanted memory: the view only ever renders facts she
 * consolidated and text she wrote. Lives behind a VIEW_REGISTRY route, not home.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Flag } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface Props {
  onBack: () => void;
}

interface FirstItem {
  key: string;
  title: string;
  when: string;
  quote: string | null;
}

export function FirstsView({ onBack }: Props) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [items, setItems] = useState<FirstItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [completionsRes, debriefsRes] = await Promise.all([
        supabase
          .from('turnout_rung_completions')
          .select('rung_code, irreversible_fact, consolidated_at, debrief_ref')
          .eq('user_id', user.id)
          .order('consolidated_at', { ascending: true }),
        supabase
          .from('turnout_rung_debriefs')
          .select('id, note')
          .eq('user_id', user.id),
      ]);
      const debriefNote = new Map<string, string>();
      for (const d of (debriefsRes.data || []) as Array<{ id: string; note: string | null }>) {
        if (d.note) debriefNote.set(d.id, d.note);
      }
      const list: FirstItem[] = ((completionsRes.data || []) as Array<{ rung_code: string; irreversible_fact: string; consolidated_at: string; debrief_ref: string | null }>)
        .map((c) => ({
          key: `rung:${c.rung_code}`,
          title: c.irreversible_fact,
          when: c.consolidated_at,
          quote: c.debrief_ref ? debriefNote.get(c.debrief_ref) ?? null : null,
        }));
      if (!cancelled) {
        setItems(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return ''; }
  };

  return (
    <div className="pb-20">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onBack} className={`p-1.5 rounded-lg ${isBambiMode ? 'hover:bg-pink-100 text-pink-500' : 'hover:bg-protocol-surface text-protocol-accent'}`}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Flag className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>Your firsts</h1>
        </div>
      </div>

      <div className="px-4 space-y-3">
        {loading && (
          <p className={`text-sm ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>Loading…</p>
        )}
        {!loading && items.length === 0 && (
          <p className={`text-sm ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
            No firsts crossed yet. Every one you cross lands here — in your own words.
          </p>
        )}
        {items.map((it) => (
          <div key={it.key} className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
            <div className="flex items-center justify-between">
              <p className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{it.title}</p>
              <span className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>{fmt(it.when)}</span>
            </div>
            {it.quote && (
              <blockquote className={`mt-2 pl-3 border-l-2 text-sm italic ${isBambiMode ? 'border-pink-300 text-pink-800' : 'border-protocol-border text-protocol-text-muted'}`}>
                “{it.quote}”
              </blockquote>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
