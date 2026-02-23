/**
 * Measurement History — sparkline trends for body measurements
 * with delta arrows, hip-to-waist chart, and monthly check-in form.
 */

import { useState, useMemo } from 'react';
import { TrendingUp, Plus } from 'lucide-react';
import type { BodyMeasurement } from '../../types/exercise';
import { computeDeltas } from '../../types/measurement';
import { shouldPromptMeasurement } from '../../types/measurement';
import { HipWaistChart } from '../body/HipWaistChart';
import { MeasurementForm } from '../body/MeasurementForm';

interface MeasurementHistoryProps {
  history: BodyMeasurement[];
  latest: BodyMeasurement | null;
  onRefresh: () => Promise<void>;
}

export function MeasurementHistory({ history, latest, onRefresh }: MeasurementHistoryProps) {
  const [showForm, setShowForm] = useState(false);

  const shouldPrompt = shouldPromptMeasurement(latest);

  // Compute deltas between latest and second-latest
  const latestDeltas = useMemo(() => {
    if (history.length < 2) return [];
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    const currentRecord: Record<string, number | null> = {
      hipsInches: current.hipsInches,
      waistInches: current.waistInches,
      thighLeftInches: current.thighLeftInches,
      thighRightInches: current.thighRightInches,
      shouldersInches: current.shouldersInches,
      weightLbs: current.weightLbs,
    };
    return computeDeltas(currentRecord, previous);
  }, [history]);

  const getDelta = (field: string) => latestDeltas.find((d) => d.field === field);

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
            delta={getDelta('hipsInches')}
          />
          <Sparkline
            label="Waist"
            values={history.map(h => h.waistInches).filter((v): v is number => v !== null)}
            suffix='"'
            color="text-blue-400"
            delta={getDelta('waistInches')}
          />
          <Sparkline
            label="H/W Ratio"
            values={history.map(h => h.hipWaistRatio).filter((v): v is number => v !== null)}
            suffix=""
            color="text-purple-400"
          />
        </div>
      )}

      {/* Hip-to-waist chart */}
      <HipWaistChart history={history} />

      {/* Latest values with delta arrows */}
      {latest && (
        <div className="flex gap-4 text-xs text-white/50 mb-2 mt-2">
          {latest.hipsInches && (
            <span>
              Hips: <span className="text-white/70">{latest.hipsInches}"</span>
              {getDelta('hipsInches') && (
                <DeltaArrow delta={getDelta('hipsInches')!} />
              )}
            </span>
          )}
          {latest.waistInches && (
            <span>
              Waist: <span className="text-white/70">{latest.waistInches}"</span>
              {getDelta('waistInches') && (
                <DeltaArrow delta={getDelta('waistInches')!} />
              )}
            </span>
          )}
          {latest.hipWaistRatio && <span>Ratio: <span className="text-purple-400">{latest.hipWaistRatio}</span></span>}
        </div>
      )}

      {/* Monthly check-in prompt */}
      {shouldPrompt && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mt-2 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/20 transition-colors"
        >
          Monthly check-in due — tap to measure
        </button>
      )}

      {history.length === 0 && !showForm && !shouldPrompt && (
        <p className="text-xs text-white/30 text-center py-2">
          No measurements yet. Tap + to add your first.
        </p>
      )}

      {/* Measurement form */}
      {showForm && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <MeasurementForm
            previous={latest}
            onSaved={onRefresh}
            onClose={() => setShowForm(false)}
          />
        </div>
      )}
    </div>
  );
}

function DeltaArrow({ delta }: { delta: { delta: number; isGood: boolean; direction: string } }) {
  if (delta.direction === 'same') return null;
  const arrow = delta.direction === 'up' ? '\u2191' : '\u2193';
  const color = delta.isGood ? 'text-green-400' : 'text-amber-400';
  return (
    <span className={`ml-0.5 text-[9px] ${color}`}>
      {arrow}{Math.abs(delta.delta).toFixed(1)}
    </span>
  );
}

function Sparkline({
  label,
  values,
  suffix,
  color,
  delta,
}: {
  label: string;
  values: number[];
  suffix: string;
  color: string;
  delta?: { delta: number; isGood: boolean; direction: string };
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
      {delta ? (
        <DeltaArrow delta={delta} />
      ) : trend ? (
        <span className={`text-[9px] ${parseFloat(diff) > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend}{diff}
        </span>
      ) : null}
    </div>
  );
}
