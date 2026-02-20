/**
 * Measurement History — sparkline trends for body measurements.
 * Shows hips, waist, and hip-to-waist ratio over time.
 */

import { useState } from 'react';
import { TrendingUp, Plus, Check } from 'lucide-react';
import { saveMeasurement } from '../../lib/exercise';
import { useAuth } from '../../context/AuthContext';
import type { BodyMeasurement } from '../../types/exercise';

interface MeasurementHistoryProps {
  history: BodyMeasurement[];
  latest: BodyMeasurement | null;
  onRefresh: () => Promise<void>;
}

export function MeasurementHistory({ history, latest, onRefresh }: MeasurementHistoryProps) {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hips, setHips] = useState('');
  const [waist, setWaist] = useState('');
  const [thighL, setThighL] = useState('');
  const [thighR, setThighR] = useState('');
  const [shoulders, setShoulders] = useState('');
  const [weight, setWeight] = useState('');

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    await saveMeasurement(user.id, {
      hipsInches: hips ? parseFloat(hips) : null,
      waistInches: waist ? parseFloat(waist) : null,
      thighLeftInches: thighL ? parseFloat(thighL) : null,
      thighRightInches: thighR ? parseFloat(thighR) : null,
      shouldersInches: shoulders ? parseFloat(shoulders) : null,
      weightLbs: weight ? parseFloat(weight) : null,
      notes: null,
    });
    setSaving(false);
    setShowForm(false);
    setHips(''); setWaist(''); setThighL(''); setThighR(''); setShoulders(''); setWeight('');
    await onRefresh();
  };

  // Days since last measurement
  const daysSinceLast = latest
    ? Math.floor((Date.now() - new Date(latest.measuredAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-white/80">Measurements</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-1 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Sparklines */}
      {history.length >= 2 && (
        <div className="space-y-2 mb-3">
          <Sparkline
            label="Hips"
            values={history.map(h => h.hipsInches).filter((v): v is number => v !== null)}
            suffix='"'
            color="text-pink-400"
          />
          <Sparkline
            label="Waist"
            values={history.map(h => h.waistInches).filter((v): v is number => v !== null)}
            suffix='"'
            color="text-blue-400"
          />
          <Sparkline
            label="H/W Ratio"
            values={history.map(h => h.hipWaistRatio).filter((v): v is number => v !== null)}
            suffix=""
            color="text-purple-400"
          />
        </div>
      )}

      {/* Latest values */}
      {latest && (
        <div className="flex gap-4 text-xs text-white/50 mb-2">
          {latest.hipsInches && <span>Hips: <span className="text-white/70">{latest.hipsInches}"</span></span>}
          {latest.waistInches && <span>Waist: <span className="text-white/70">{latest.waistInches}"</span></span>}
          {latest.hipWaistRatio && <span>Ratio: <span className="text-purple-400">{latest.hipWaistRatio}</span></span>}
        </div>
      )}

      {/* Measurement prompt */}
      {daysSinceLast !== null && daysSinceLast > 14 && (
        <p className="text-xs text-yellow-400/70 mb-2">
          {daysSinceLast} days since last measurement — time to check in
        </p>
      )}

      {history.length === 0 && !showForm && (
        <p className="text-xs text-white/30 text-center py-2">
          No measurements yet. Tap + to add your first.
        </p>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <MeasureInput label="Hips" value={hips} onChange={setHips} placeholder='e.g. 38.5' />
            <MeasureInput label="Waist" value={waist} onChange={setWaist} placeholder='e.g. 32' />
            <MeasureInput label="Thigh L" value={thighL} onChange={setThighL} placeholder='e.g. 22' />
            <MeasureInput label="Thigh R" value={thighR} onChange={setThighR} placeholder='e.g. 22' />
            <MeasureInput label="Shoulders" value={shoulders} onChange={setShoulders} placeholder='e.g. 44' />
            <MeasureInput label="Weight" value={weight} onChange={setWeight} placeholder='lbs' />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || (!hips && !waist)}
            className="w-full py-2 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 disabled:opacity-30 flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Save Measurements
          </button>
        </div>
      )}
    </div>
  );
}

function MeasureInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-white/40 block mb-0.5">{label}</label>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs"
      />
    </div>
  );
}

function Sparkline({
  label,
  values,
  suffix,
  color,
}: {
  label: string;
  values: number[];
  suffix: string;
  color: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const latest = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = latest > prev ? '+' : latest < prev ? '' : '';
  const diff = (latest - prev).toFixed(1);

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 60;
    const y = 16 - ((v - min) / range) * 14;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/40 w-12">{label}</span>
      <svg width="60" height="18" className="flex-shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={color}
        />
      </svg>
      <span className={`text-[10px] ${color}`}>
        {latest}{suffix}
      </span>
      {trend && (
        <span className={`text-[9px] ${parseFloat(diff) > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend}{diff}
        </span>
      )}
    </div>
  );
}
