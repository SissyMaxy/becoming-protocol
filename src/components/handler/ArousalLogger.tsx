/**
 * ArousalLogger — real-time 1-5 arousal slider.
 * Writes to user_state.current_arousal. Handler reads this in every
 * turn and uses it to drive HRT conditioning pairing, hookup funnel
 * pressure, and vulnerability-window outreach.
 */

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const LABELS = ['cold', 'neutral', 'warming', 'horny', 'peak', 'edging'];

export function ArousalLogger() {
  const { user } = useAuth();
  const [value, setValue] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('user_state')
      .select('current_arousal')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.current_arousal != null) {
          setValue(data.current_arousal as number);
          setLastSaved(data.current_arousal as number);
        }
      });
  }, [user?.id]);

  const save = async (val: number) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase
        .from('user_state')
        .update({ current_arousal: val, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'arousal_logged_by_user',
        value: { arousal: val, label: LABELS[val] || 'unknown' },
        reasoning: `User reported arousal ${val}/5`,
      });
      setLastSaved(val);
    } finally {
      setSaving(false);
    }
  };

  const color = value >= 4 ? 'text-red-400' : value >= 3 ? 'text-orange-400' : value >= 2 ? 'text-amber-400' : 'text-gray-400';

  return (
    <div className="bg-gray-900/60 border border-orange-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Flame className={`w-3 h-3 ${color}`} />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Arousal</span>
        <span className={`font-medium ${color}`}>{value}/5 — {LABELS[value]}</span>
        {saving && <span className="text-gray-500 text-[10px]">saving...</span>}
      </div>
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            onClick={() => { setValue(v); save(v); }}
            className={`flex-1 py-1.5 rounded text-[10px] transition-colors ${
              value === v
                ? v >= 4
                  ? 'bg-red-500/30 text-red-300 border border-red-500/60'
                  : v >= 3
                  ? 'bg-orange-500/30 text-orange-300 border border-orange-500/60'
                  : v >= 2
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                  : 'bg-gray-800 text-gray-300 border border-gray-700'
                : 'bg-gray-950 text-gray-500 hover:bg-gray-800'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {lastSaved !== null && lastSaved >= 3 && (
        <p className="text-[10px] text-orange-400 mt-1">
          Handler conditioning pairing active — every device command is now paired with HRT imagery.
        </p>
      )}
    </div>
  );
}
