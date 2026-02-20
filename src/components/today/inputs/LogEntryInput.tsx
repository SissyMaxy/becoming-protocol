/**
 * LogEntryInput — Dynamic form renderer for log_entry completion type.
 * Reads capture_fields from task definition and renders each field inline.
 * All required fields must be filled before submit enables.
 */

import { useState, useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type { CompletionData, CaptureFieldDef } from '../../../types/task-bank';

interface LogEntryInputProps {
  captureFields: CaptureFieldDef[];
  intensity: number;
  isCompleting: boolean;
  onComplete: (data: CompletionData) => void;
  getGradient: (intensity: number, bambi: boolean) => string;
}

/** Pretty-print a field key as a label: arousal_before → Arousal Before */
function keyToLabel(key: string): string {
  return key
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Today's date as YYYY-MM-DD */
function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Resolve default value for a field */
function resolveDefault(field: CaptureFieldDef): string | number | boolean {
  if (field.default === 'today' || (field.type === 'date' && field.default === undefined)) {
    return todayStr();
  }
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case 'date': return todayStr();
    case 'select': return '';
    case 'toggle': return false;
    case 'slider': return field.min ?? 1;
    case 'number': return field.min ?? 0;
    case 'text': return '';
  }
}

export function LogEntryInput({
  captureFields,
  intensity,
  isCompleting,
  onComplete,
  getGradient,
}: LogEntryInputProps) {
  const { isBambiMode } = useBambiMode();

  // Initialize form values from defaults
  const initialValues = useMemo(() => {
    const vals: Record<string, string | number | boolean> = {};
    for (const field of captureFields) {
      vals[field.key] = resolveDefault(field);
    }
    return vals;
  }, [captureFields]);

  const [values, setValues] = useState<Record<string, string | number | boolean>>(initialValues);

  const setValue = (key: string, val: string | number | boolean) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  // Validation: all required fields must have a truthy value
  const isValid = useMemo(() => {
    for (const field of captureFields) {
      if (field.optional) continue;
      const v = values[field.key];
      // toggle is always valid (false is a valid answer)
      if (field.type === 'toggle') continue;
      // slider/number with a numeric value are always valid
      if (field.type === 'slider' || field.type === 'number') continue;
      // select/text/date must be non-empty string
      if (v === '' || v === undefined || v === null) return false;
    }
    return true;
  }, [captureFields, values]);

  const handleSubmit = () => {
    if (!isValid) return;
    onComplete({
      completion_type: 'log_entry',
      fields: { ...values },
    });
  };

  const labelClass = `text-xs font-medium mb-1 ${
    isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
  }`;
  const inputBase = `w-full rounded-lg px-3 py-2 text-sm transition-colors outline-none ${
    isBambiMode
      ? 'bg-pink-50 border border-pink-200 text-pink-900 focus:border-pink-400'
      : 'bg-protocol-bg border border-protocol-border text-protocol-text focus:border-protocol-accent'
  }`;

  return (
    <div className="flex-1 space-y-3">
      {captureFields.map(field => {
        const label = field.label || keyToLabel(field.key);
        const value = values[field.key];

        switch (field.type) {
          // ——— Date picker ———
          case 'date':
            return (
              <div key={field.key}>
                <label className={labelClass}>{label}</label>
                <input
                  type="date"
                  value={value as string}
                  onChange={e => setValue(field.key, e.target.value)}
                  className={inputBase}
                />
              </div>
            );

          // ——— Select dropdown ———
          case 'select':
            return (
              <div key={field.key}>
                <label className={labelClass}>{label}</label>
                <select
                  value={value as string}
                  onChange={e => setValue(field.key, e.target.value)}
                  className={inputBase}
                >
                  <option value="">Select...</option>
                  {(field.options || []).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            );

          // ——— Toggle switch ———
          case 'toggle':
            return (
              <div key={field.key} className="flex items-center justify-between">
                <span className={labelClass}>{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!value}
                  onClick={() => setValue(field.key, !value)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    value
                      ? isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                      : isBambiMode ? 'bg-pink-200' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      value ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );

          // ——— Slider / range ———
          case 'slider': {
            const min = field.min ?? 1;
            const max = field.max ?? 10;
            const step = field.step ?? 1;
            const numVal = value as number;
            const pct = ((numVal - min) / (max - min)) * 100;
            return (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelClass}>{label}</label>
                  <span className={`text-sm font-bold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    {numVal}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={numVal}
                  onChange={e => setValue(field.key, Number(e.target.value))}
                  className={`w-full h-2 rounded-full appearance-none cursor-pointer ${
                    isBambiMode ? 'accent-pink-500' : 'accent-emerald-500'
                  }`}
                  style={{
                    background: `linear-gradient(to right, ${
                      isBambiMode ? '#ec4899' : '#10b981'
                    } ${pct}%, ${
                      isBambiMode ? '#fce7f3' : '#1a1a2e'
                    } ${pct}%)`,
                  }}
                />
                <div className="flex justify-between px-1 mt-0.5">
                  <span className={`text-[10px] ${
                    isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                  }`}>{min}</span>
                  <span className={`text-[10px] ${
                    isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                  }`}>{max}</span>
                </div>
              </div>
            );
          }

          // ——— Number input ———
          case 'number':
            return (
              <div key={field.key}>
                <label className={labelClass}>{label}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={value as number}
                  onChange={e => setValue(field.key, Number(e.target.value))}
                  className={inputBase}
                />
              </div>
            );

          // ——— Text input ———
          case 'text':
            return (
              <div key={field.key}>
                <label className={labelClass}>
                  {label}
                  {field.optional && (
                    <span className={`ml-1 text-[10px] ${
                      isBambiMode ? 'text-pink-300' : 'text-gray-500'
                    }`}>(optional)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={value as string}
                  onChange={e => setValue(field.key, e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}...`}
                  className={inputBase}
                />
              </div>
            );

          default:
            return null;
        }
      })}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isCompleting || !isValid}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all active:scale-[0.98] ${
          isValid
            ? `bg-gradient-to-r ${getGradient(intensity, isBambiMode)} hover:opacity-90`
            : 'bg-gray-400 cursor-not-allowed'
        }`}
      >
        {isCompleting ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Check className="w-5 h-5" />
            <span>Log Entry</span>
          </span>
        )}
      </button>
    </div>
  );
}
