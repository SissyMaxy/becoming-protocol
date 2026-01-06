import { StepNav } from '../OnboardingFlow';
import { UserProfile } from '../types';
import { Clock, Sun, Moon, Briefcase, Calendar } from 'lucide-react';

interface ScheduleStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}

const WEEKDAYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' }
];

export function ScheduleStep({ profile, onUpdate, onNext, onBack }: ScheduleStepProps) {
  const morningAvailable = profile.morningAvailable ?? true;
  const eveningAvailable = profile.eveningAvailable ?? true;
  const workFromHome = profile.workFromHome ?? false;
  const busyDays = profile.busyDays || [];

  const toggleBusyDay = (day: string) => {
    const updated = busyDays.includes(day)
      ? busyDays.filter(d => d !== day)
      : [...busyDays, day];
    onUpdate({ busyDays: updated });
  };

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-protocol-accent/20">
          <Clock className="w-5 h-5 text-protocol-accent" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Your Schedule
        </h2>
      </div>
      <p className="text-protocol-text-muted mb-6">
        When can you practice? This helps me suggest tasks at the right times.
      </p>

      <div className="space-y-6">
        {/* Time of day preferences */}
        <div>
          <label className="block text-sm font-medium text-protocol-text mb-3">
            Best times for practice
          </label>
          <div className="space-y-2">
            <button
              onClick={() => onUpdate({ morningAvailable: !morningAvailable })}
              className={`w-full p-4 rounded-lg flex items-center gap-4 transition-all ${
                morningAvailable
                  ? 'bg-amber-500/20 border-2 border-amber-400'
                  : 'bg-protocol-surface border border-protocol-border hover:border-amber-400/50'
              }`}
            >
              <div className={`p-2 rounded-lg ${morningAvailable ? 'bg-amber-500/20' : 'bg-protocol-surface-light'}`}>
                <Sun className={`w-5 h-5 ${morningAvailable ? 'text-amber-400' : 'text-protocol-text-muted'}`} />
              </div>
              <div className="text-left">
                <div className="font-medium text-protocol-text">Morning</div>
                <div className="text-sm text-protocol-text-muted">Before noon</div>
              </div>
              <div className="ml-auto">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  morningAvailable ? 'border-amber-400 bg-amber-400' : 'border-protocol-border'
                }`}>
                  {morningAvailable && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </div>
            </button>

            <button
              onClick={() => onUpdate({ eveningAvailable: !eveningAvailable })}
              className={`w-full p-4 rounded-lg flex items-center gap-4 transition-all ${
                eveningAvailable
                  ? 'bg-indigo-500/20 border-2 border-indigo-400'
                  : 'bg-protocol-surface border border-protocol-border hover:border-indigo-400/50'
              }`}
            >
              <div className={`p-2 rounded-lg ${eveningAvailable ? 'bg-indigo-500/20' : 'bg-protocol-surface-light'}`}>
                <Moon className={`w-5 h-5 ${eveningAvailable ? 'text-indigo-400' : 'text-protocol-text-muted'}`} />
              </div>
              <div className="text-left">
                <div className="font-medium text-protocol-text">Evening</div>
                <div className="text-sm text-protocol-text-muted">After 5pm</div>
              </div>
              <div className="ml-auto">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  eveningAvailable ? 'border-indigo-400 bg-indigo-400' : 'border-protocol-border'
                }`}>
                  {eveningAvailable && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Work from home */}
        <div>
          <button
            onClick={() => onUpdate({ workFromHome: !workFromHome })}
            className={`w-full p-4 rounded-lg flex items-center gap-4 transition-all ${
              workFromHome
                ? 'bg-protocol-accent/20 border-2 border-protocol-accent'
                : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent/50'
            }`}
          >
            <div className={`p-2 rounded-lg ${workFromHome ? 'bg-protocol-accent/20' : 'bg-protocol-surface-light'}`}>
              <Briefcase className={`w-5 h-5 ${workFromHome ? 'text-protocol-accent' : 'text-protocol-text-muted'}`} />
            </div>
            <div className="text-left">
              <div className="font-medium text-protocol-text">Work from home</div>
              <div className="text-sm text-protocol-text-muted">I have privacy during the day</div>
            </div>
            <div className="ml-auto">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                workFromHome ? 'border-protocol-accent bg-protocol-accent' : 'border-protocol-border'
              }`}>
                {workFromHome && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
          </button>
          <p className="text-xs text-protocol-text-muted mt-2">
            This affects what daytime tasks I might suggest
          </p>
        </div>

        {/* Busy days */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-protocol-accent" />
            <label className="text-sm font-medium text-protocol-text">
              Which days are usually busy?
            </label>
          </div>
          <p className="text-xs text-protocol-text-muted mb-3">
            I'll be gentler with prescriptions on these days
          </p>
          <div className="flex gap-2">
            {WEEKDAYS.map(day => (
              <button
                key={day.key}
                onClick={() => toggleBusyDay(day.key)}
                className={`flex-1 py-3 rounded-lg text-xs font-medium transition-all ${
                  busyDays.includes(day.key)
                    ? 'bg-protocol-danger/20 border-2 border-protocol-danger text-protocol-danger'
                    : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="card p-4 bg-protocol-surface-light">
          <p className="text-sm text-protocol-text-muted">
            {morningAvailable && eveningAvailable && 'You can practice morning and evening. '}
            {morningAvailable && !eveningAvailable && 'You prefer morning practice. '}
            {!morningAvailable && eveningAvailable && 'You prefer evening practice. '}
            {!morningAvailable && !eveningAvailable && 'Limited availability noted. '}
            {workFromHome && 'Working from home gives you daytime flexibility. '}
            {busyDays.length > 0 && `Lighter loads on ${busyDays.length} day${busyDays.length > 1 ? 's' : ''}.`}
          </p>
        </div>
      </div>

      <StepNav onNext={onNext} onBack={onBack} />
    </div>
  );
}
