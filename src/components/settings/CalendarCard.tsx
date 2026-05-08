/**
 * CalendarCard — Settings card for Google Calendar integration.
 *
 * Connect / disconnect; toggles for event placement, neutral titles, and
 * busy-aware delivery; time pickers for morning ritual + evening reflection
 * defaults.
 */

import { useState } from 'react';
import { Calendar, Loader2, Unlink } from 'lucide-react';
import { useCalendar } from '../../hooks/useCalendar';
import { useBambiMode } from '../../context/BambiModeContext';

export function CalendarCard() {
  const { isBambiMode } = useBambiMode();
  const { status, isLoading, isSaving, connect, disconnect, updateSettings } = useCalendar();
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);

  if (isLoading || !status) {
    return (
      <div className={`rounded-xl p-4 ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-400">Checking calendar connection...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl p-4 space-y-4 ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Google Calendar
          </span>
        </div>
        {status.connected && (
          <span className="text-xs text-green-400">Connected</span>
        )}
      </div>

      {!status.connected ? (
        <>
          <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Connect your Google Calendar so the Handler can place ritual blocks on your day and time her outreach around your meetings.
          </p>
          <button
            onClick={connect}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white'
                : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
            }`}
          >
            Connect Google Calendar
          </button>
        </>
      ) : (
        <>
          {status.external_calendar_name && (
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Dedicated calendar: <span className="font-medium">{status.external_calendar_name}</span>
            </p>
          )}

          <ToggleRow
            label="Place events on my calendar"
            description="Mommy can create morning ritual + evening reflection blocks."
            checked={!!status.events_enabled}
            disabled={isSaving}
            onToggle={(v) => updateSettings({ events_enabled: v })}
            isBambiMode={isBambiMode}
          />

          <ToggleRow
            label="Use neutral event titles"
            description="External titles read 'Morning routine' / 'Personal block' — no persona language."
            checked={!!status.neutral_calendar_titles}
            disabled={isSaving}
            onToggle={(v) => updateSettings({ neutral_calendar_titles: v })}
            isBambiMode={isBambiMode}
          />

          <ToggleRow
            label="Quiet during busy times"
            description="Skip outreach pushes while you have a calendar event."
            checked={!!status.busy_aware_delivery}
            disabled={isSaving}
            onToggle={(v) => updateSettings({ busy_aware_delivery: v })}
            isBambiMode={isBambiMode}
          />

          <TimePickerRow
            label="Morning ritual"
            time={status.morning_ritual_local_time || '06:30'}
            durationMin={status.morning_ritual_duration_min || 15}
            disabled={isSaving}
            onChange={(time, durationMin) =>
              updateSettings({ morning_ritual_local_time: time, morning_ritual_duration_min: durationMin })
            }
            isBambiMode={isBambiMode}
          />

          <TimePickerRow
            label="Evening reflection"
            time={status.evening_reflection_local_time || '21:00'}
            durationMin={status.evening_reflection_duration_min || 10}
            disabled={isSaving}
            onChange={(time, durationMin) =>
              updateSettings({ evening_reflection_local_time: time, evening_reflection_duration_min: durationMin })
            }
            isBambiMode={isBambiMode}
          />

          {!showConfirmDisconnect ? (
            <button
              onClick={() => setShowConfirmDisconnect(true)}
              className={`w-full py-2.5 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                isBambiMode
                  ? 'bg-red-50 hover:bg-red-100 text-red-500'
                  : 'bg-red-900/20 hover:bg-red-900/30 text-red-400'
              }`}
            >
              <Unlink className="w-4 h-4" />
              Disconnect Google Calendar
            </button>
          ) : (
            <div className="space-y-2">
              <p className={`text-sm ${isBambiMode ? 'text-red-700' : 'text-red-400'}`}>
                Disconnecting will delete every event Mommy created on your calendar. Continue?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await disconnect();
                    setShowConfirmDisconnect(false);
                  }}
                  disabled={isSaving}
                  className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {isSaving ? 'Disconnecting...' : 'Disconnect'}
                </button>
                <button
                  onClick={() => setShowConfirmDisconnect(false)}
                  disabled={isSaving}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${isBambiMode ? 'bg-gray-200 text-gray-700' : 'bg-gray-700 text-gray-300'}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
  isBambiMode: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onToggle(e.target.checked)}
        className="mt-1"
      />
      <div className="flex-1">
        <p className={`text-sm font-medium ${props.isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {props.label}
        </p>
        <p className={`text-xs ${props.isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {props.description}
        </p>
      </div>
    </label>
  );
}

function TimePickerRow(props: {
  label: string;
  time: string;
  durationMin: number;
  disabled: boolean;
  onChange: (time: string, durationMin: number) => void;
  isBambiMode: boolean;
}) {
  const [time, setTime] = useState(props.time);
  const [duration, setDuration] = useState(props.durationMin);

  const commit = () => {
    if (time !== props.time || duration !== props.durationMin) {
      props.onChange(time, duration);
    }
  };

  return (
    <div>
      <p className={`text-sm font-medium mb-1 ${props.isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {props.label}
      </p>
      <div className="flex gap-2 items-center">
        <input
          type="time"
          value={time}
          disabled={props.disabled}
          onChange={(e) => setTime(e.target.value)}
          onBlur={commit}
          className={`px-2 py-1 rounded border text-sm ${
            props.isBambiMode
              ? 'bg-white border-pink-200 text-pink-700'
              : 'bg-protocol-bg border-protocol-border text-protocol-text'
          }`}
        />
        <input
          type="number"
          min={1}
          max={240}
          value={duration}
          disabled={props.disabled}
          onChange={(e) => setDuration(parseInt(e.target.value, 10) || 1)}
          onBlur={commit}
          className={`w-16 px-2 py-1 rounded border text-sm ${
            props.isBambiMode
              ? 'bg-white border-pink-200 text-pink-700'
              : 'bg-protocol-bg border-protocol-border text-protocol-text'
          }`}
        />
        <span className={`text-xs ${props.isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          min
        </span>
      </div>
    </div>
  );
}
