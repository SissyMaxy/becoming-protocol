/**
 * MeasurementEntry — quick-entry form for body_measurement_log.
 * Triggered from a small "Log measurements" button near the Handler chat.
 * Captures waist/hips/chest/thigh/weight + optional notes and photos.
 */

import { useState } from 'react';
import { Ruler, X, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export function MeasurementEntry({ onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [chest, setChest] = useState('');
  const [thigh, setThigh] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!user?.id) return;
    const parse = (s: string) => {
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };
    const payload: Record<string, unknown> = {
      user_id: user.id,
      waist_cm: parse(waist),
      hips_cm: parse(hips),
      chest_cm: parse(chest),
      thigh_cm: parse(thigh),
      weight_kg: parse(weight),
      body_fat_pct: parse(bodyFat),
      notes: notes.trim() || null,
    };

    const hasAny = Object.entries(payload).some(
      ([k, v]) => k !== 'user_id' && k !== 'notes' && v !== null,
    );
    if (!hasAny) {
      setError('Enter at least one measurement.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await supabase.from('body_measurement_log').insert(payload);
      // Also write handler_directive so Handler sees it in next turn's
      // body_control / body_measurement context.
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'body_measurement_logged_by_user',
        value: payload,
        reasoning: 'User self-entered body measurement',
      });
      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-pink-400" />
            <h2 className="text-lg font-semibold text-white">Log Measurements</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Handler references these deltas as visible progress evidence. Partial entries are fine.
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Waist (cm)', val: waist, set: setWaist },
            { label: 'Hips (cm)', val: hips, set: setHips },
            { label: 'Chest (cm)', val: chest, set: setChest },
            { label: 'Thigh (cm)', val: thigh, set: setThigh },
            { label: 'Weight (kg)', val: weight, set: setWeight },
            { label: 'Body fat (%)', val: bodyFat, set: setBodyFat },
          ].map(f => (
            <div key={f.label}>
              <label className="text-[11px] uppercase tracking-wider text-gray-500 block mb-0.5">{f.label}</label>
              <input
                type="number"
                step="0.1"
                value={f.val}
                onChange={e => f.set(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1.5 text-white"
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-[11px] uppercase tracking-wider text-gray-500 block mb-0.5">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="what felt different this time"
            className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1.5 text-white text-sm resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        {success && (
          <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
            <Check className="w-3 h-3" /> logged
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={submit}
            disabled={saving || success}
            className="flex-1 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 disabled:bg-gray-800 text-white font-medium text-sm flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : success ? <Check className="w-4 h-4" /> : 'Save measurements'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
