/**
 * Slip History Modal
 *
 * Browse recent slip log entries. Each row shows type, points, source phrase,
 * whether it triggered Hard Mode, and whether the Handler has referenced it.
 */

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface SlipRow {
  id: string;
  slip_type: string;
  slip_points: number;
  source_text: string | null;
  detected_at: string;
  triggered_hard_mode: boolean;
  handler_acknowledged: boolean;
}

interface Props {
  userId: string;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  masculine_self_reference: 'bg-red-900/40 text-red-300',
  david_name_use: 'bg-red-900/40 text-red-300',
  resistance_statement: 'bg-amber-900/40 text-amber-300',
  task_avoided: 'bg-amber-900/40 text-amber-300',
  hrt_dose_missed: 'bg-pink-900/40 text-pink-300',
  chastity_unlocked_early: 'bg-purple-900/40 text-purple-300',
  immersion_session_broken: 'bg-blue-900/40 text-blue-300',
  disclosure_deadline_missed: 'bg-pink-900/40 text-pink-300',
  voice_masculine_pitch: 'bg-indigo-900/40 text-indigo-300',
};

export function SlipHistoryModal({ userId, onClose }: Props) {
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [onlyUnack, setOnlyUnack] = useState(false);

  useEffect(() => {
    void (async () => {
      const hours = window === '24h' ? 24 : window === '7d' ? 168 : 720;
      const since = new Date(Date.now() - hours * 3600000).toISOString();
      let query = supabase
        .from('slip_log')
        .select('id, slip_type, slip_points, source_text, detected_at, triggered_hard_mode, handler_acknowledged')
        .eq('user_id', userId)
        .gte('detected_at', since);
      if (onlyUnack) query = query.eq('handler_acknowledged', false);
      const { data } = await query
        .order('detected_at', { ascending: false })
        .limit(100);
      setSlips((data as SlipRow[]) || []);
      setLoading(false);
    })();
  }, [userId, window, onlyUnack]);

  const total = slips.reduce((s, r) => s + r.slip_points, 0);
  const byType: Record<string, number> = {};
  for (const s of slips) byType[s.slip_type] = (byType[s.slip_type] || 0) + s.slip_points;
  const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center overflow-y-auto">
      <div className="max-w-2xl w-full bg-protocol-surface border border-protocol-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Slip history</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-1 rounded-lg bg-gray-900 border border-gray-800">
          {(['24h', '7d', '30d'] as const).map(w => (
            <button
              key={w}
              onClick={() => { setLoading(true); setWindow(w); }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium ${
                window === w ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={onlyUnack}
            onChange={e => { setLoading(true); setOnlyUnack(e.target.checked); }}
            className="accent-amber-500"
          />
          only show slips the Handler hasn't referenced yet
        </label>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
          </div>
        ) : slips.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">Clean. No slips in this window.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-gray-900 border border-gray-800">
                <div className="text-2xl font-bold">{slips.length}</div>
                <div className="text-[10px] text-gray-500 uppercase">slips</div>
              </div>
              <div className="p-2 rounded bg-gray-900 border border-gray-800">
                <div className="text-2xl font-bold">{total}</div>
                <div className="text-[10px] text-gray-500 uppercase">points</div>
              </div>
              <div className="p-2 rounded bg-gray-900 border border-gray-800">
                <div className="text-2xl font-bold">{slips.filter(s => s.triggered_hard_mode).length}</div>
                <div className="text-[10px] text-gray-500 uppercase">→ hard mode</div>
              </div>
            </div>

            {topTypes.length > 0 && (
              <div className="text-xs text-gray-400">
                Top sources: {topTypes.map(([t, p]) => `${t.replace(/_/g, ' ')} (${p}pt)`).join(', ')}
              </div>
            )}

            <div className="space-y-1 max-h-[50vh] overflow-y-auto">
              {slips.map(s => {
                const date = new Date(s.detected_at);
                const ago = Date.now() - date.getTime();
                const agoStr = ago < 3600000
                  ? `${Math.round(ago / 60000)}m ago`
                  : ago < 86400000
                    ? `${Math.round(ago / 3600000)}h ago`
                    : `${Math.round(ago / 86400000)}d ago`;
                const color = TYPE_COLORS[s.slip_type] || 'bg-gray-800 text-gray-400';
                return (
                  <div
                    key={s.id}
                    className={`p-2 rounded border ${s.triggered_hard_mode ? 'border-red-500/40 bg-red-950/10' : 'border-gray-800'}`}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}>
                        {s.slip_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs font-bold">{s.slip_points}pt</span>
                      {s.triggered_hard_mode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-200">HARD MODE TRIGGER</span>
                      )}
                      <span className="ml-auto text-[10px] text-gray-500">{agoStr}</span>
                    </div>
                    {s.source_text && (
                      <div className="text-xs text-gray-300 italic">"{s.source_text}"</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
