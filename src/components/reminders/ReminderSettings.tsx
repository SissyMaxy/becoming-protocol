/**
 * Reminder Settings Component
 *
 * Configure feminization reminders: timing, frequency, types.
 */

import { useState } from 'react';
import { Bell, BellOff, Clock, Zap, Volume2, Move, Sparkles, User, Check } from 'lucide-react';
import type { ReminderSettings as Settings, ReminderType } from '../../types/reminders';
import { getReminderTypeLabel, getReminderTypeColor } from '../../types/reminders';

interface ReminderSettingsProps {
  settings: Settings;
  onUpdate: (settings: Partial<Settings>) => Promise<void>;
  notificationPermission: NotificationPermission | 'unsupported';
  onRequestPermission: () => Promise<boolean>;
  onTestReminder?: () => void;
}

function getTypeIcon(type: ReminderType) {
  switch (type) {
    case 'posture': return <User className="w-5 h-5" />;
    case 'voice': return <Volume2 className="w-5 h-5" />;
    case 'movement': return <Move className="w-5 h-5" />;
    case 'identity': return <Sparkles className="w-5 h-5" />;
  }
}

export function ReminderSettingsPanel({
  settings,
  onUpdate,
  notificationPermission,
  onRequestPermission,
  onTestReminder,
}: ReminderSettingsProps) {
  const [saving, setSaving] = useState(false);

  const handleToggle = async (key: keyof Settings, value: boolean) => {
    setSaving(true);
    await onUpdate({ [key]: value });
    setSaving(false);
  };

  const handleTypeToggle = async (type: ReminderType) => {
    const newTypes = settings.enabledTypes.includes(type)
      ? settings.enabledTypes.filter(t => t !== type)
      : [...settings.enabledTypes, type];

    setSaving(true);
    await onUpdate({ enabledTypes: newTypes });
    setSaving(false);
  };

  const handleFrequencyChange = async (value: number) => {
    setSaving(true);
    await onUpdate({ frequencyPerDay: value });
    setSaving(false);
  };

  const handleHoursChange = async (start: number, end: number) => {
    setSaving(true);
    await onUpdate({ activeHoursStart: start, activeHoursEnd: end });
    setSaving(false);
  };

  const allTypes: ReminderType[] = ['posture', 'voice', 'movement', 'identity'];

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings.enabled ? (
              <Bell className="w-6 h-6 text-protocol-accent" />
            ) : (
              <BellOff className="w-6 h-6 text-protocol-text-muted" />
            )}
            <div>
              <h3 className="font-medium text-protocol-text">
                Reminders
              </h3>
              <p className="text-sm text-protocol-text-muted">
                {settings.enabled
                  ? `${settings.frequencyPerDay}x daily during active hours`
                  : 'Disabled'}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleToggle('enabled', !settings.enabled)}
            disabled={saving}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              settings.enabled ? 'bg-protocol-accent' : 'bg-protocol-border'
            }`}
          >
            <div
              className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                settings.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* Notification permission */}
          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <div className="card p-4 border-amber-500/30 bg-amber-900/10">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-300 mb-1">
                    Enable Notifications
                  </h4>
                  <p className="text-sm text-amber-400/70 mb-3">
                    Get reminded even when the app isn't open
                  </p>
                  <button
                    onClick={onRequestPermission}
                    className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Allow Notifications
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reminder types */}
          <div className="card p-4">
            <h4 className="font-medium text-protocol-text mb-4">
              Reminder Types
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {allTypes.map(type => {
                const isEnabled = settings.enabledTypes.includes(type);
                const color = getReminderTypeColor(type);

                return (
                  <button
                    key={type}
                    onClick={() => handleTypeToggle(type)}
                    disabled={saving}
                    className={`p-3 rounded-xl border-2 transition-all ${
                      isEnabled
                        ? 'border-opacity-50'
                        : 'border-protocol-border opacity-50'
                    }`}
                    style={{
                      borderColor: isEnabled ? color : undefined,
                      backgroundColor: isEnabled ? `${color}10` : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="p-1.5 rounded-lg"
                        style={{
                          backgroundColor: `${color}20`,
                          color: isEnabled ? color : '#666',
                        }}
                      >
                        {getTypeIcon(type)}
                      </div>
                      <span
                        className="font-medium text-sm"
                        style={{ color: isEnabled ? color : '#888' }}
                      >
                        {getReminderTypeLabel(type)}
                      </span>
                      {isEnabled && (
                        <Check className="w-4 h-4 ml-auto" style={{ color }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Frequency */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-protocol-accent" />
              <h4 className="font-medium text-protocol-text">
                Frequency
              </h4>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={2}
                max={10}
                value={settings.frequencyPerDay}
                onChange={e => handleFrequencyChange(Number(e.target.value))}
                className="flex-1 accent-protocol-accent"
              />
              <span className="text-lg font-semibold text-protocol-text w-16 text-center">
                {settings.frequencyPerDay}x
              </span>
            </div>
            <p className="text-xs text-protocol-text-muted mt-2">
              Reminders per day during active hours
            </p>
          </div>

          {/* Active hours */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-protocol-accent" />
              <h4 className="font-medium text-protocol-text">
                Active Hours
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-protocol-text-muted block mb-1">
                  Start
                </label>
                <select
                  value={settings.activeHoursStart}
                  onChange={e => handleHoursChange(Number(e.target.value), settings.activeHoursEnd)}
                  className="w-full p-2 rounded-lg bg-protocol-bg border border-protocol-border text-protocol-text"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-protocol-text-muted mt-5">to</span>
              <div className="flex-1">
                <label className="text-xs text-protocol-text-muted block mb-1">
                  End
                </label>
                <select
                  value={settings.activeHoursEnd}
                  onChange={e => handleHoursChange(settings.activeHoursStart, Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-protocol-bg border border-protocol-border text-protocol-text"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-protocol-text-muted mt-2">
              No reminders outside these hours
            </p>
          </div>

          {/* Test button */}
          {onTestReminder && (
            <button
              onClick={onTestReminder}
              className="w-full py-3 rounded-xl bg-protocol-surface border border-protocol-border text-protocol-text font-medium hover:bg-protocol-border/30 transition-colors"
            >
              Test Reminder Now
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Compact settings toggle for quick access
 */
interface ReminderQuickToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function ReminderQuickToggle({ enabled, onToggle }: ReminderQuickToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`p-2 rounded-lg transition-colors ${
        enabled
          ? 'bg-protocol-accent/20 text-protocol-accent'
          : 'bg-protocol-surface text-protocol-text-muted'
      }`}
    >
      {enabled ? (
        <Bell className="w-5 h-5" />
      ) : (
        <BellOff className="w-5 h-5" />
      )}
    </button>
  );
}
