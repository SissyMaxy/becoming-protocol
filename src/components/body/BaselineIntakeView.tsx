import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  MessageSquare,
  RotateCcw,
  Ruler,
  Save,
  Scale,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type UnitSystem = 'imperial' | 'metric';

type MeasurementKey =
  | 'weight'
  | 'waist'
  | 'hips'
  | 'chest'
  | 'underbust'
  | 'shoulders'
  | 'thigh'
  | 'neck';

interface MeasurementField {
  key: MeasurementKey;
  label: string;
  hint: string;
  required?: boolean;
  kind: 'weight' | 'length';
}

const MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: 'weight', label: 'Weight', hint: 'Same scale, light clothing', required: true, kind: 'weight' },
  { key: 'waist', label: 'Waist', hint: 'Narrowest point, relaxed', required: true, kind: 'length' },
  { key: 'hips', label: 'Hips', hint: 'Widest point around seat', required: true, kind: 'length' },
  { key: 'chest', label: 'Chest', hint: 'Fullest point, tape level', required: true, kind: 'length' },
  { key: 'underbust', label: 'Underbust', hint: 'Ribcage directly under chest', kind: 'length' },
  { key: 'shoulders', label: 'Shoulders', hint: 'Across widest shoulder line', kind: 'length' },
  { key: 'thigh', label: 'Thigh', hint: 'Widest point on one thigh', kind: 'length' },
  { key: 'neck', label: 'Neck', hint: 'Middle of neck, not tight', kind: 'length' },
];

const PHOTO_CHECKS = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
  { key: 'lighting', label: 'Consistent lighting' },
] as const;

type PhotoCheckKey = typeof PHOTO_CHECKS[number]['key'];

const PARTNER_NUDGES = [
  { key: 'schedule', label: 'Help choose workout windows' },
  { key: 'walks', label: 'Suggest walks or cardio' },
  { key: 'strength', label: 'Suggest strength days' },
  { key: 'recovery', label: 'Call out recovery and sleep' },
] as const;

const WORKOUT_PREFERENCES = [
  { key: 'upper', label: 'Upper body' },
  { key: 'lower', label: 'Lower body' },
  { key: 'core', label: 'Core' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'outdoor', label: 'Outdoor activity' },
] as const;

type PartnerNudgeKey = typeof PARTNER_NUDGES[number]['key'];
type WorkoutPreferenceKey = typeof WORKOUT_PREFERENCES[number]['key'];
type PartnerCheckIn = 'after_workouts' | 'twice_weekly' | 'weekly';
type PartnerTone = 'encouraging' | 'direct' | 'playful';

function localInputDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localInputTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function parsePositive(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function roundMetric(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

function toKg(value: number | null, unitSystem: UnitSystem): number | null {
  if (value == null) return null;
  return roundMetric(unitSystem === 'imperial' ? value * 0.45359237 : value);
}

function toCm(value: number | null, unitSystem: UnitSystem): number | null {
  if (value == null) return null;
  return roundMetric(unitSystem === 'imperial' ? value * 2.54 : value);
}

function emptyMeasurements(): Record<MeasurementKey, string> {
  return {
    weight: '',
    waist: '',
    hips: '',
    chest: '',
    underbust: '',
    shoulders: '',
    thigh: '',
    neck: '',
  };
}

function emptyPhotoChecks(): Record<PhotoCheckKey, boolean> {
  return {
    front: false,
    side: false,
    back: false,
    lighting: false,
  };
}

function emptyPartnerNudges(): Record<PartnerNudgeKey, boolean> {
  return {
    schedule: true,
    walks: true,
    strength: false,
    recovery: true,
  };
}

function emptyWorkoutPreferences(): Record<WorkoutPreferenceKey, boolean> {
  return {
    upper: false,
    lower: true,
    core: true,
    cardio: true,
    mobility: true,
    outdoor: false,
  };
}

export function BaselineIntakeView({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [measuredDate, setMeasuredDate] = useState(localInputDate);
  const [measuredTime, setMeasuredTime] = useState(localInputTime);
  const [helperName, setHelperName] = useState('');
  const [measurements, setMeasurements] = useState<Record<MeasurementKey, string>>(emptyMeasurements);
  const [photoChecks, setPhotoChecks] = useState<Record<PhotoCheckKey, boolean>>(emptyPhotoChecks);
  const [partnerInputEnabled, setPartnerInputEnabled] = useState(true);
  const [partnerCheckIn, setPartnerCheckIn] = useState<PartnerCheckIn>('twice_weekly');
  const [partnerTone, setPartnerTone] = useState<PartnerTone>('encouraging');
  const [partnerNudges, setPartnerNudges] = useState<Record<PartnerNudgeKey, boolean>>(emptyPartnerNudges);
  const [workoutPreferences, setWorkoutPreferences] = useState<Record<WorkoutPreferenceKey, boolean>>(emptyWorkoutPreferences);
  const [partnerNote, setPartnerNote] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const requiredComplete = useMemo(() => (
    MEASUREMENT_FIELDS
      .filter((field) => field.required)
      .filter((field) => parsePositive(measurements[field.key]) != null).length
  ), [measurements]);

  const lengthUnit = unitSystem === 'imperial' ? 'in' : 'cm';
  const weightUnit = unitSystem === 'imperial' ? 'lb' : 'kg';
  const requiredTotal = MEASUREMENT_FIELDS.filter((field) => field.required).length;

  function updateMeasurement(key: MeasurementKey, value: string) {
    setMeasurements((current) => ({
      ...current,
      [key]: value.replace(/[^\d.]/g, ''),
    }));
  }

  function togglePhotoCheck(key: PhotoCheckKey) {
    setPhotoChecks((current) => ({ ...current, [key]: !current[key] }));
  }

  function togglePartnerNudge(key: PartnerNudgeKey) {
    setPartnerNudges((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleWorkoutPreference(key: WorkoutPreferenceKey) {
    setWorkoutPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  function resetForm() {
    setMeasurements(emptyMeasurements());
    setPhotoChecks(emptyPhotoChecks());
    setPartnerInputEnabled(true);
    setPartnerCheckIn('twice_weekly');
    setPartnerTone('encouraging');
    setPartnerNudges(emptyPartnerNudges());
    setWorkoutPreferences(emptyWorkoutPreferences());
    setPartnerNote('');
    setHelperName('');
    setNotes('');
    setMeasuredDate(localInputDate());
    setMeasuredTime(localInputTime());
    setSaveError(null);
    setSavedId(null);
  }

  async function saveBaseline() {
    if (!user?.id) {
      setSaveError('Sign in before saving the baseline.');
      return;
    }

    const missing = MEASUREMENT_FIELDS
      .filter((field) => field.required)
      .filter((field) => parsePositive(measurements[field.key]) == null);

    if (missing.length > 0) {
      setSaveError(`Add the required fields first: ${missing.map((field) => field.label).join(', ')}.`);
      return;
    }

    const measuredAt = new Date(`${measuredDate}T${measuredTime || '12:00'}`);
    if (Number.isNaN(measuredAt.getTime())) {
      setSaveError('Choose a valid measurement date and time.');
      return;
    }

    const read = (key: MeasurementKey) => parsePositive(measurements[key]);
    const completedPhotos = PHOTO_CHECKS
      .filter((check) => photoChecks[check.key])
      .map((check) => check.label.toLowerCase());
    const selectedNudges = PARTNER_NUDGES
      .filter((option) => partnerNudges[option.key])
      .map((option) => option.label.toLowerCase());
    const selectedWorkoutPreferences = WORKOUT_PREFERENCES
      .filter((option) => workoutPreferences[option.key])
      .map((option) => option.label.toLowerCase());

    const intakeNotes = [
      'Baseline intake', // voice-gate: ok — clinical decoy copy; the fitness disguise must not read in Mommy's voice
      helperName.trim() ? `helper=${helperName.trim()}` : null,
      `units=${unitSystem}`,
      completedPhotos.length > 0 ? `photos=${completedPhotos.join(', ')}` : 'photos=not recorded',
      partnerInputEnabled ? 'partner_exercise_input=enabled' : 'partner_exercise_input=off',
      partnerInputEnabled ? `partner_check_in=${partnerCheckIn}` : null,
      partnerInputEnabled ? `partner_tone=${partnerTone}` : null,
      partnerInputEnabled && selectedNudges.length > 0 ? `partner_nudges=${selectedNudges.join(', ')}` : null,
      partnerInputEnabled && selectedWorkoutPreferences.length > 0 ? `partner_workout_votes=${selectedWorkoutPreferences.join(', ')}` : null,
      partnerInputEnabled && partnerNote.trim() ? `partner_note=${partnerNote.trim()}` : null,
      notes.trim() || null,
    ].filter(Boolean).join(' | ');

    setSaving(true);
    setSaveError(null);

    const payload = {
      user_id: user.id,
      measured_at: measuredAt.toISOString(),
      weight_kg: toKg(read('weight'), unitSystem),
      waist_cm: toCm(read('waist'), unitSystem),
      hips_cm: toCm(read('hips'), unitSystem),
      chest_cm: toCm(read('chest'), unitSystem),
      underbust_cm: toCm(read('underbust'), unitSystem),
      shoulders_cm: toCm(read('shoulders'), unitSystem),
      thigh_cm: toCm(read('thigh'), unitSystem),
      neck_cm: toCm(read('neck'), unitSystem),
      source: 'card',
      notes: intakeNotes,
    };

    const { data, error } = await supabase
      .from('body_metrics')
      .insert(payload)
      .select('id')
      .single();

    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }

    setSavedId((data as { id?: string } | null)?.id ?? 'saved');
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'baseline-intake' } })); // voice-gate: ok — internal event name, never user-facing
  }

  if (savedId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-8">
          <div className="rounded-lg border border-emerald-500/30 bg-slate-900 p-6 shadow-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-white">Baseline saved</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The intake is now part of the body metrics history. Future check-ins can compare against this starting point.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                Done
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
              >
                <RotateCcw className="h-4 w-4" />
                Add another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <button
          type="button"
          onClick={onClose}
          className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Close intake
        </button>

        <header className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-300">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Aesthetic baseline</p>
              <h1 className="text-2xl font-semibold tracking-normal text-white">Baseline Intake</h1>
            </div>
          </div>
          <p className="text-sm leading-6 text-slate-300">
            Capture the starting measurements with a helper, a soft tape, and consistent lighting.
          </p>
        </header>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Date</span>
              <input
                type="date"
                value={measuredDate}
                onChange={(event) => setMeasuredDate(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Time</span>
              <input
                type="time"
                value={measuredTime}
                onChange={(event) => setMeasuredTime(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Helper</span>
              <input
                type="text"
                value={helperName}
                onChange={(event) => setHelperName(event.target.value)}
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              />
            </label>
          </div>

          <div className="mt-4 flex rounded-md border border-slate-700 bg-slate-950 p-1">
            {(['imperial', 'metric'] as UnitSystem[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setUnitSystem(option)}
                className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${
                  unitSystem === option
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {option === 'imperial' ? 'US units' : 'Metric'}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-emerald-300" />
              <h2 className="text-base font-semibold text-white">Measurements</h2>
            </div>
            <span className="rounded bg-slate-950 px-2 py-1 text-xs font-semibold text-slate-300">
              {requiredComplete}/{requiredTotal} required
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MEASUREMENT_FIELDS.map((field) => (
              <label key={field.key} className="block rounded-md border border-slate-800 bg-slate-950 p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-100">
                    {field.label}
                    {field.required && <span className="text-emerald-300"> *</span>}
                  </span>
                  <span className="text-xs text-slate-500">
                    {field.kind === 'weight' ? weightUnit : lengthUnit}
                  </span>
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={measurements[field.key]}
                  onChange={(event) => updateMeasurement(field.key, event.target.value)}
                  placeholder={field.kind === 'weight' ? `0 ${weightUnit}` : `0 ${lengthUnit}`}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-base font-semibold text-white outline-none focus:border-emerald-400"
                />
                <span className="mt-2 block text-xs leading-5 text-slate-400">{field.hint}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-300" />
            <h2 className="text-base font-semibold text-white">Baseline Photos</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PHOTO_CHECKS.map((check) => (
              <button
                key={check.key}
                type="button"
                onClick={() => togglePhotoCheck(check.key)}
                className={`rounded-md border px-3 py-3 text-sm font-semibold transition ${
                  photoChecks[check.key]
                    ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                }`}
              >
                {check.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-300" />
              <div>
                <h2 className="text-base font-semibold text-white">Partner Exercise Input</h2>
                <p className="mt-1 text-sm leading-5 text-slate-400">
                  Optional guidance that can shape workout timing, check-ins, and exercise focus.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPartnerInputEnabled((current) => !current)}
              className={`flex h-7 w-12 flex-shrink-0 items-center rounded-full p-1 transition ${
                partnerInputEnabled ? 'bg-emerald-400' : 'bg-slate-700'
              }`}
              aria-label="Toggle partner exercise input"
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition ${
                  partnerInputEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {partnerInputEnabled && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <CalendarCheck className="h-4 w-4 text-emerald-300" />
                  Check-in cadence
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    ['after_workouts', 'After workouts'],
                    ['twice_weekly', 'Twice weekly'],
                    ['weekly', 'Weekly'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPartnerCheckIn(value)}
                      className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                        partnerCheckIn === value
                          ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <MessageSquare className="h-4 w-4 text-emerald-300" />
                  Encouragement style
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    ['encouraging', 'Encouraging'],
                    ['direct', 'Direct'],
                    ['playful', 'Playful'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPartnerTone(value)}
                      className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                        partnerTone === value
                          ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-200">Helpful nudges</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PARTNER_NUDGES.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => togglePartnerNudge(option.key)}
                      className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                        partnerNudges[option.key]
                          ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-slate-200">Workout focus votes</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {WORKOUT_PREFERENCES.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => toggleWorkoutPreference(option.key)}
                      className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                        workoutPreferences[option.key]
                          ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200'
                          : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Partner note</span>
                <textarea
                  value={partnerNote}
                  onChange={(event) => setPartnerNote(event.target.value)}
                  rows={2}
                  placeholder="Optional: what would make it easier for them to exercise consistently?"
                  className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </label>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Optional context: time of day, clothing, tape position, or anything that affects repeatability."
              className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            />
          </label>
        </section>

        {saveError && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-950/50 px-4 py-3 text-sm text-red-100">
            {saveError}
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 mt-5 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <button
            type="button"
            onClick={saveBaseline}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving baseline...' : 'Save baseline'}
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm leading-6 text-slate-300">
          <Scale className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" />
          <p>
            Use the same tape tension and posture each time. Leave optional fields blank if they were not measured.
          </p>
        </div>
      </div>
    </div>
  );
}
