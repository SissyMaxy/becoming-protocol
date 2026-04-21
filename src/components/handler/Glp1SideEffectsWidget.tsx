/**
 * Glp1SideEffectsWidget — logs Zepbound side-effect state. Four 1-5 scales
 * (nausea, appetite, energy, sleep) + free notes. Writes to
 * glp1_side_effects table; Handler reads these to calibrate titration
 * pressure and dose-day tasks.
 */

import { useEffect, useState } from 'react';
import { Pill, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface LastEntry {
  logged_at: string;
  nausea_level: number | null;
  appetite_level: number | null;
  energy_level: number | null;
  sleep_quality: number | null;
}

export function Glp1SideEffectsWidget() {
  const { user } = useAuth();
  const [onGlp1, setOnGlp1] = useState<boolean | null>(null);
  const [last, setLast] = useState<LastEntry | null>(null);
  const [nausea, setNausea] = useState(0);
  const [appetite, setAppetite] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [notes, setNotes] = useState('');
  const [foodAversion, setFoodAversion] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: reg } = await supabase
        .from('medication_regimen')
        .select('id')
        .eq('user_id', user.id)
        .eq('medication_category', 'glp1')
        .eq('active', true)
        .maybeSingle();
      setOnGlp1(!!reg);
      const { data: l } = await supabase
        .from('glp1_side_effects')
        .select('logged_at, nausea_level, appetite_level, energy_level, sleep_quality')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (l) setLast(l as LastEntry);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase.from('glp1_side_effects').insert({
        user_id: user.id,
        nausea_level: nausea || null,
        appetite_level: appetite || null,
        energy_level: energy || null,
        sleep_quality: sleep || null,
        food_aversion: foodAversion.trim() || null,
        notes: notes.trim() || null,
      });
      setLast({ logged_at: new Date().toISOString(), nausea_level: nausea, appetite_level: appetite, energy_level: energy, sleep_quality: sleep });
      setOpen(false);
      setNausea(0); setAppetite(0); setEnergy(0); setSleep(0); setNotes(''); setFoodAversion('');
    } finally {
      setSaving(false);
    }
  };

  if (onGlp1 === null) return null;
  if (!onGlp1) return null;

  const hoursSinceLast = last?.logged_at
    ? Math.round((Date.now() - new Date(last.logged_at).getTime()) / 3600000)
    : null;

  const Scale = ({ label, value, setValue }: { label: string; value: number; setValue: (v: number) => void }) => (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-16">{label}</span>
      {[1, 2, 3, 4, 5].map(v => (
        <button
          key={v}
          onClick={() => setValue(v)}
          className={`flex-1 py-1 rounded text-[10px] ${
            value === v ? 'bg-teal-500/30 text-teal-300 border border-teal-500/60' : 'bg-gray-900 text-gray-500 hover:bg-gray-800'
          }`}
        >{v}</button>
      ))}
    </div>
  );

  return (
    <div className="bg-gray-900/60 border border-teal-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Pill className="w-3 h-3 text-teal-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Zepbound Side Effects</span>
        {hoursSinceLast != null && (
          <span className="text-[10px] text-gray-500">last {hoursSinceLast < 24 ? `${hoursSinceLast}h` : `${Math.round(hoursSinceLast / 24)}d`} ago</span>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="ml-auto text-[10px] text-teal-400 hover:text-teal-300"
        >
          {open ? 'cancel' : 'log'}
        </button>
      </div>
      {open && (
        <div className="space-y-2 mt-2">
          <Scale label="nausea" value={nausea} setValue={setNausea} />
          <Scale label="appetite" value={appetite} setValue={setAppetite} />
          <Scale label="energy" value={energy} setValue={setEnergy} />
          <Scale label="sleep" value={sleep} setValue={setSleep} />
          <input
            value={foodAversion}
            onChange={e => setFoodAversion(e.target.value)}
            placeholder="foods that turn you off..."
            className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600"
          />
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="other notes — injection-site reaction, constipation, hiccups..."
            className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 resize-none"
          />
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-1.5 rounded bg-teal-500/25 hover:bg-teal-500/40 text-teal-300 text-[11px] font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            save entry
          </button>
        </div>
      )}
      {!open && last && (
        <div className="text-[10px] text-gray-500">
          last: nausea {last.nausea_level ?? '-'}/5 · appetite {last.appetite_level ?? '-'}/5 · energy {last.energy_level ?? '-'}/5 · sleep {last.sleep_quality ?? '-'}/5
        </div>
      )}
    </div>
  );
}
