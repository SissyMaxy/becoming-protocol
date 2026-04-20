/**
 * Regimen Onboard
 *
 * Handler-driven activation of an HRT / supplement / anti-androgen regimen.
 * Doesn't prescribe medically — records a regimen Maxy has decided to take
 * and schedules dose pings + adherence tracking.
 */

import { useState } from 'react';
import { Pill, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  onDone: () => void;
}

const PRESETS = [
  { name: 'Estradiol', category: 'estrogen', dose_amount: '2mg', dose_times_per_day: 2, hours: [8, 20] },
  { name: 'Estradiol (sublingual)', category: 'estrogen', dose_amount: '2mg', dose_times_per_day: 3, hours: [7, 13, 21] },
  { name: 'Spironolactone', category: 'spironolactone', dose_amount: '100mg', dose_times_per_day: 2, hours: [8, 20] },
  { name: 'Progesterone', category: 'progesterone', dose_amount: '100mg', dose_times_per_day: 1, hours: [22] },
  { name: 'Bicalutamide', category: 'anti_androgen', dose_amount: '50mg', dose_times_per_day: 1, hours: [8] },
];

export function RegimenOnboard({ userId, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('estrogen');
  const [doseAmount, setDoseAmount] = useState('');
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [hoursStr, setHoursStr] = useState('8');
  const [busy, setBusy] = useState(false);

  const loadPreset = (p: typeof PRESETS[number]) => {
    setName(p.name);
    setCategory(p.category);
    setDoseAmount(p.dose_amount);
    setTimesPerDay(p.dose_times_per_day);
    setHoursStr(p.hours.join(','));
  };

  const activate = async () => {
    if (!name || !doseAmount) return;
    setBusy(true);
    try {
      const hours = hoursStr
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n >= 0 && n <= 23);

      const { data: regimen } = await supabase
        .from('medication_regimen')
        .insert({
          user_id: userId,
          medication_name: name,
          medication_category: category,
          dose_amount: doseAmount,
          dose_times_per_day: timesPerDay,
          dose_schedule_hours: hours.length > 0 ? hours : [8],
          ratchet_stage: 'active',
          active: true,
        })
        .select('id')
        .single();

      if (regimen) {
        // Schedule 7 days of doses
        const doses: Array<{ user_id: string; regimen_id: string; scheduled_at: string }> = [];
        for (let d = 0; d < 7; d++) {
          const day = new Date();
          day.setDate(day.getDate() + d);
          for (const h of hours.length > 0 ? hours : [8]) {
            const scheduled = new Date(day);
            scheduled.setHours(h, 0, 0, 0);
            if (scheduled.getTime() < Date.now()) continue;
            doses.push({
              user_id: userId,
              regimen_id: (regimen as { id: string }).id,
              scheduled_at: scheduled.toISOString(),
            });
          }
        }
        if (doses.length > 0) {
          await supabase.from('dose_log').insert(doses);
        }
      }

      onDone();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-3 rounded-lg border border-dashed border-pink-500/40 bg-pink-950/10 text-pink-300 text-sm flex items-center justify-center gap-2 hover:bg-pink-950/20"
      >
        <Pill className="w-4 h-4" />
        Activate a regimen
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-pink-500/30 bg-pink-950/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-semibold text-white">Activate regimen</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <div className="text-xs text-gray-400 mb-1">Presets</div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => loadPreset(p)}
              className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 hover:border-pink-500/50"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Medication name (e.g. Estradiol)"
          className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
          >
            <option value="estrogen">Estrogen</option>
            <option value="progesterone">Progesterone</option>
            <option value="anti_androgen">Anti-androgen</option>
            <option value="spironolactone">Spironolactone</option>
            <option value="herbal_feminizing">Herbal feminizing</option>
            <option value="supplement">Supplement</option>
            <option value="other">Other</option>
          </select>
          <input
            value={doseAmount}
            onChange={e => setDoseAmount(e.target.value)}
            placeholder="Dose (e.g. 2mg)"
            className="bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 uppercase">Doses/day</label>
            <input
              type="number"
              min={1}
              max={6}
              value={timesPerDay}
              onChange={e => setTimesPerDay(Math.max(1, Math.min(6, parseInt(e.target.value) || 1)))}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase">Hours (comma)</label>
            <input
              value={hoursStr}
              onChange={e => setHoursStr(e.target.value)}
              placeholder="8,20"
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
            />
          </div>
        </div>
      </div>

      <div className="p-2 rounded bg-red-950/30 border border-red-500/30 text-xs text-red-300">
        Missed doses log a slip, queue a mantra punishment, and compound if dodged. Cease request requires 7-day cooldown + Gina disclosure.
      </div>

      <button
        onClick={activate}
        disabled={!name || !doseAmount || busy}
        className="w-full py-2 rounded-lg bg-pink-600 text-white font-semibold disabled:bg-gray-700"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
          <>
            <Plus className="w-4 h-4 inline mr-1" />
            Activate + schedule 7 days
          </>
        )}
      </button>
    </div>
  );
}
