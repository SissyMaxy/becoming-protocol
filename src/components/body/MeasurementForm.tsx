/**
 * MeasurementForm — monthly body measurement input with real-time deltas,
 * hip-to-waist ratio auto-calculation, and photo capture slots.
 */

import { useState, useMemo } from 'react';
import { Check, Camera, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { saveMeasurement } from '../../lib/measurements';
import { saveMeasurementPhoto } from '../../lib/measurements';
import { computeDeltas } from '../../types/measurement';
import { emitBodyEvent } from '../../lib/body-events';
import type { BodyMeasurement } from '../../types/exercise';
import type { MeasurementDelta } from '../../types/measurement';

interface MeasurementFormProps {
  previous: BodyMeasurement | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  suffix: string;
}

const FIELDS: FieldDef[] = [
  { key: 'hipsInches', label: 'Hips', placeholder: 'e.g. 38.5', suffix: '"' },
  { key: 'waistInches', label: 'Waist', placeholder: 'e.g. 32', suffix: '"' },
  { key: 'thighLeftInches', label: 'Thigh L', placeholder: 'e.g. 22', suffix: '"' },
  { key: 'thighRightInches', label: 'Thigh R', placeholder: 'e.g. 22', suffix: '"' },
  { key: 'shouldersInches', label: 'Shoulders', placeholder: 'e.g. 44', suffix: '"' },
  { key: 'weightLbs', label: 'Weight', placeholder: 'lbs', suffix: 'lb' },
];

type PhotoSlot = { file: File; preview: string } | null;

export function MeasurementForm({ previous, onSaved, onClose }: MeasurementFormProps) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<{ front: PhotoSlot; side: PhotoSlot; back: PhotoSlot }>({
    front: null,
    side: null,
    back: null,
  });

  const numericValues = useMemo(() => {
    const result: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const v = values[f.key];
      result[f.key] = v ? parseFloat(v) : null;
    }
    return result;
  }, [values]);

  // Real-time deltas
  const deltas: MeasurementDelta[] = useMemo(() => {
    if (!previous) return [];
    return computeDeltas(numericValues, previous);
  }, [numericValues, previous]);

  // Auto-compute hip-to-waist ratio
  const hipWaistRatio = useMemo(() => {
    const h = numericValues.hipsInches;
    const w = numericValues.waistInches;
    if (h && w && w > 0) return Math.round((w / h) * 100) / 100;
    return null;
  }, [numericValues]);

  const handleChange = (key: string, val: string) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handlePhoto = (slot: 'front' | 'side' | 'back', file: File) => {
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [slot]: { file, preview } }));
  };

  const removePhoto = (slot: 'front' | 'side' | 'back') => {
    if (photos[slot]?.preview) URL.revokeObjectURL(photos[slot]!.preview);
    setPhotos((prev) => ({ ...prev, [slot]: null }));
  };

  const hasAnyValue = Object.values(values).some((v) => v && v.trim() !== '');

  const handleSave = async () => {
    if (!user?.id || !hasAnyValue) return;
    setSaving(true);

    const measurement = await saveMeasurement(user.id, {
      hipsInches: numericValues.hipsInches ?? null,
      waistInches: numericValues.waistInches ?? null,
      thighLeftInches: numericValues.thighLeftInches ?? null,
      thighRightInches: numericValues.thighRightInches ?? null,
      shouldersInches: numericValues.shouldersInches ?? null,
      weightLbs: numericValues.weightLbs ?? null,
      notes: null,
    });

    // Save photos if measurement was created
    if (measurement) {
      const photoSlots: Array<{ slot: 'front' | 'side' | 'back'; data: PhotoSlot }> = [
        { slot: 'front', data: photos.front },
        { slot: 'side', data: photos.side },
        { slot: 'back', data: photos.back },
      ];

      for (const { slot, data } of photoSlots) {
        if (data?.file) {
          // Upload to Supabase Storage
          const ext = data.file.name.split('.').pop() || 'jpg';
          const path = `measurements/${user.id}/${measurement.id}_${slot}.${ext}`;
          const { supabase } = await import('../../lib/supabase');
          const { error } = await supabase.storage
            .from('photos')
            .upload(path, data.file);

          if (!error) {
            const { data: urlData } = supabase.storage
              .from('photos')
              .getPublicUrl(path);
            await saveMeasurementPhoto(user.id, measurement.id, urlData.publicUrl, slot);
          }
        }
      }

      // Emit body event
      emitBodyEvent(user.id, { type: 'measurement_logged', measurementId: measurement.id });
    }

    setSaving(false);
    await onSaved();
    onClose();
  };

  const getDeltaForField = (key: string): MeasurementDelta | undefined => {
    return deltas.find((d) => d.field === key);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white/80">Monthly Check-in</p>
        <button onClick={onClose} className="p-1 text-white/40 hover:text-white/60">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Input fields */}
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => {
          const delta = getDeltaForField(f.key);
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between mb-0.5">
                <label className="text-[10px] text-white/40">{f.label}</label>
                {delta && (
                  <span
                    className={`text-[9px] font-medium ${
                      delta.isGood ? 'text-green-400' : 'text-amber-400'
                    }`}
                  >
                    {delta.direction === 'up' ? '+' : ''}
                    {delta.delta.toFixed(1)}{f.suffix}
                  </span>
                )}
              </div>
              <input
                type="number"
                step="0.1"
                value={values[f.key] || ''}
                onChange={(e) => handleChange(f.key, e.target.value)}
                placeholder={previous?.[f.key as keyof BodyMeasurement] != null
                  ? `prev: ${previous[f.key as keyof BodyMeasurement]}`
                  : f.placeholder
                }
                className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white text-xs placeholder:text-white/20"
              />
            </div>
          );
        })}
      </div>

      {/* Hip-to-waist ratio display */}
      {hipWaistRatio !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <span className="text-xs text-white/50">H/W Ratio:</span>
          <span className={`text-sm font-bold ${
            hipWaistRatio >= 0.7 && hipWaistRatio <= 0.8 ? 'text-green-400' : 'text-purple-400'
          }`}>
            {hipWaistRatio.toFixed(2)}
          </span>
          {hipWaistRatio >= 0.7 && hipWaistRatio <= 0.8 && (
            <span className="text-[10px] text-green-400/70">in target range</span>
          )}
        </div>
      )}

      {/* Photo capture */}
      <div>
        <p className="text-[10px] text-white/40 mb-2">Progress Photos (optional)</p>
        <div className="flex gap-2">
          {(['front', 'side', 'back'] as const).map((slot) => (
            <div key={slot} className="flex-1">
              {photos[slot] ? (
                <div className="relative rounded-lg overflow-hidden aspect-[3/4] bg-white/5">
                  <img
                    src={photos[slot]!.preview}
                    alt={slot}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removePhoto(slot)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white/70 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="absolute bottom-1 left-1 text-[9px] text-white/60 bg-black/40 px-1 rounded">
                    {slot}
                  </span>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 aspect-[3/4] bg-white/5 cursor-pointer hover:border-white/20 transition-colors">
                  <Camera className="w-4 h-4 text-white/20 mb-1" />
                  <span className="text-[9px] text-white/30 capitalize">{slot}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhoto(slot, file);
                    }}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !hasAnyValue}
        className="w-full py-2.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 disabled:opacity-30 flex items-center justify-center gap-1.5 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
        {saving ? 'Saving...' : 'Save Measurements'}
      </button>
    </div>
  );
}
