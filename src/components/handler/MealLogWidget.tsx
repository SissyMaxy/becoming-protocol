/**
 * MealLogWidget — quick-entry meal form for diet_log with running protein
 * total vs. target. Critical during Zepbound: without hitting daily protein
 * the weight loss becomes lean mass (glutes, hips) instead of fat.
 */

import { useEffect, useState } from 'react';
import { Utensils, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const PROTEIN_TARGET_G = 150;

interface Props {
  onLogged?: () => void;
}

interface DayMeal {
  protein_g: number | null;
  feminization_aligned: boolean | null;
}

export function MealLogWidget({ onLogged }: Props) {
  const { user } = useAuth();
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [foods, setFoods] = useState('');
  const [protein, setProtein] = useState('');
  const [calories, setCalories] = useState('');
  const [phytoFlag, setPhytoFlag] = useState(false);
  const [alignedFlag, setAlignedFlag] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [todayTotal, setTodayTotal] = useState<{ protein: number; count: number; aligned: number }>({ protein: 0, count: 0, aligned: 0 });

  const loadToday = async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('diet_log')
      .select('protein_g, feminization_aligned')
      .eq('user_id', user.id)
      .gte('logged_at', `${today}T00:00:00Z`);
    const rows = (data || []) as DayMeal[];
    const protein = rows.reduce((s, r) => s + (r.protein_g || 0), 0);
    const aligned = rows.filter(r => r.feminization_aligned === true).length;
    setTodayTotal({ protein, count: rows.length, aligned });
  };

  useEffect(() => {
    loadToday();
  }, [user?.id]);

  const submit = async () => {
    if (!user?.id) return;
    if (!foods.trim() && !protein) return;
    setSubmitting(true);
    try {
      const payload = {
        user_id: user.id,
        meal_type: mealType,
        foods: foods.trim() || null,
        protein_g: protein ? parseFloat(protein) : null,
        calories: calories ? parseInt(calories, 10) : null,
        feminization_aligned: alignedFlag,
        contains_phytoestrogens: phytoFlag,
        logged_at: new Date().toISOString(),
      };
      await supabase.from('diet_log').insert(payload);
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'meal_logged_by_user',
        value: payload,
        reasoning: 'User logged meal via panel widget',
      });
      setSaved(true);
      setFoods('');
      setProtein('');
      setCalories('');
      setPhytoFlag(false);
      await loadToday();
      onLogged?.();
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSubmitting(false);
    }
  };

  const pct = Math.min(100, Math.round((todayTotal.protein / PROTEIN_TARGET_G) * 100));
  const onTrack = todayTotal.protein >= PROTEIN_TARGET_G * 0.75;

  return (
    <div className="bg-gray-900/60 border border-emerald-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Utensils className="w-3 h-3 text-emerald-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Meal Log</span>
        <span className={onTrack ? 'text-emerald-400' : 'text-amber-400'}>
          {todayTotal.protein.toFixed(0)}g / {PROTEIN_TARGET_G}g protein
        </span>
        <span className="text-gray-500 text-[10px]">· {todayTotal.count} meals today · {todayTotal.aligned} aligned</span>
      </div>
      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${onTrack ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1 mb-2">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMealType(m)}
            className={`flex-1 px-1 py-1 rounded text-[10px] uppercase ${
              mealType === m ? 'bg-emerald-500/25 text-emerald-300' : 'bg-gray-950 text-gray-500 hover:bg-gray-800'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={foods}
        onChange={e => setFoods(e.target.value)}
        placeholder="foods eaten (e.g. grilled chicken + broccoli + rice)"
        className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-xs mb-1"
      />
      <div className="grid grid-cols-2 gap-1 mb-2">
        <input
          value={protein}
          onChange={e => setProtein(e.target.value)}
          placeholder="protein g"
          type="number"
          step="1"
          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-xs"
        />
        <input
          value={calories}
          onChange={e => setCalories(e.target.value)}
          placeholder="calories"
          type="number"
          step="10"
          className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white text-xs"
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-400 mb-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={alignedFlag} onChange={e => setAlignedFlag(e.target.checked)} />
          feminization-aligned
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={phytoFlag} onChange={e => setPhytoFlag(e.target.checked)} />
          phytoestrogens (soy/flax/sesame)
        </label>
      </div>
      <button
        onClick={submit}
        disabled={submitting || (!foods.trim() && !protein)}
        className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-800 text-white text-xs flex items-center justify-center gap-1"
      >
        {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <><Check className="w-3 h-3" /> logged</> : 'Log meal'}
      </button>
    </div>
  );
}
