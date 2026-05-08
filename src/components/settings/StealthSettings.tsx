// Stealth / discretion settings.
//
// Lives in its own component file so concurrent feature branches that
// touch persona settings don't merge-conflict here.

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, Eye, EyeOff, Loader2, Lock, ShieldOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { useStealthSettings } from '../../hooks/useStealthSettings';
import { ICON_VARIANT_LABELS, StealthIconVariant } from '../../lib/stealth/types';
import { isValidPinFormat } from '../../lib/stealth/crypto';
import { setPin as setStoredPin, clearPin, isPinSet, attemptPin } from '../../lib/stealth/pin';
import { NEUTRAL_BODY, NEUTRAL_TITLE } from '../../lib/stealth/notifications';

type Saving = 'idle' | 'icon' | 'neutral' | 'panic' | 'pin' | 'pin_clear';

export function StealthSettings() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const { settings, loading, update } = useStealthSettings();
  const [saving, setSaving] = useState<Saving>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pinExists, setPinExists] = useState<boolean | null>(null);
  const [pinForm, setPinForm] = useState<{ current: string; next: string; confirm: string }>({
    current: '',
    next: '',
    confirm: '',
  });
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    isPinSet(user.id).then(setPinExists);
  }, [user, saving]);

  const surfaceClass = useMemo(() =>
    isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border',
    [isBambiMode],
  );
  const headingClass = isBambiMode ? 'text-pink-700' : 'text-gray-300';
  const mutedClass = isBambiMode ? 'text-pink-500' : 'text-gray-500';
  const valueClass = isBambiMode ? 'text-pink-800' : 'text-gray-200';

  async function handleIconChange(next: StealthIconVariant) {
    setSaving('icon');
    setFeedback(null);
    try {
      await update({ icon_variant: next });
      setFeedback('Icon updated. Re-install or refresh the home-screen tile to see the new icon.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving('idle');
    }
  }

  async function handleToggle(key: 'neutral_notifications' | 'panic_close_enabled', flag: Saving) {
    setSaving(flag);
    setFeedback(null);
    try {
      await update({ [key]: !settings[key] });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setSaving('idle');
    }
  }

  async function handlePinSubmit() {
    if (!user) return;
    setPinError(null);
    if (!isValidPinFormat(pinForm.next)) {
      setPinError('PIN must be 4–6 digits.');
      return;
    }
    if (pinForm.next !== pinForm.confirm) {
      setPinError('PINs do not match.');
      return;
    }
    setSaving('pin');
    try {
      const result = await setStoredPin(
        user.id,
        pinForm.next,
        pinExists ? pinForm.current : undefined,
      );
      if (!result.ok) {
        setPinError(result.error ?? 'Could not save PIN.');
        return;
      }
      if (!settings.pin_lock_enabled) {
        await update({ pin_lock_enabled: true });
      }
      setPinForm({ current: '', next: '', confirm: '' });
      setFeedback('PIN saved. Lock will engage on next app open.');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Could not save PIN.');
    } finally {
      setSaving('idle');
    }
  }

  async function handlePinDisable() {
    if (!user) return;
    setSaving('pin_clear');
    try {
      // Verify the current PIN before deleting it; otherwise an attacker
      // with brief access could disable the lock without the secret.
      if (pinExists) {
        if (!isValidPinFormat(pinForm.current)) {
          setPinError('Enter your current PIN to disable lock.');
          return;
        }
        const verify = await attemptPin(user.id, pinForm.current);
        if (!verify.ok) {
          setPinError('Current PIN is incorrect.');
          return;
        }
      }
      await clearPin(user.id);
      await update({ pin_lock_enabled: false });
      setPinForm({ current: '', next: '', confirm: '' });
      setFeedback('PIN cleared. Lock disabled.');
    } finally {
      setSaving('idle');
    }
  }

  function sendTestNotification() {
    if (!('Notification' in window)) {
      setFeedback('Browser does not support notifications.');
      return;
    }
    if (Notification.permission !== 'granted') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') showLocal();
      });
      return;
    }
    showLocal();
  }

  function showLocal() {
    const title = settings.neutral_notifications ? NEUTRAL_TITLE : 'BP';
    const body = settings.neutral_notifications ? NEUTRAL_BODY : 'Test message preview';
    try {
      new Notification(title, { body });
    } catch {
      // ignore — some browsers require service worker for showNotification
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className={`rounded-lg p-4 border ${surfaceClass}`}>
        <div className="flex items-start gap-3">
          <ShieldOff className={`w-5 h-5 mt-0.5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
          <div className="text-xs leading-relaxed">
            <div className={`text-sm font-medium mb-1 ${valueClass}`}>Stealth & discretion</div>
            <div className={mutedClass}>
              Settings on this page change how the app appears on your device — not what's inside it.
              The protocol's safety features (safeword, aftercare, frame-reveal) stay reachable
              regardless of stealth.
            </div>
          </div>
        </div>
      </div>

      {/* Icon variant */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>
          <Eye className="w-4 h-4 inline mr-1.5" />
          Home-screen disguise
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {(['default', 'calculator', 'notes'] as StealthIconVariant[]).map((v) => {
            const active = settings.icon_variant === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => handleIconChange(v)}
                disabled={saving !== 'idle'}
                className={`p-3 rounded-xl border text-center transition-all ${
                  active
                    ? isBambiMode
                      ? 'border-pink-400 bg-pink-50 ring-2 ring-pink-300'
                      : 'border-purple-400 bg-purple-500/10 ring-2 ring-purple-500/30'
                    : surfaceClass
                }`}
              >
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5">
                  <img
                    src={v === 'default' ? '/icons/icon-192.png' : `/icons/${v}-192.png`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className={`text-xs font-medium ${valueClass}`}>{ICON_VARIANT_LABELS[v].name}</div>
                <div className={`text-[10px] mt-0.5 ${mutedClass}`}>{ICON_VARIANT_LABELS[v].description}</div>
                {active && (
                  <div className="text-[10px] mt-1.5 text-purple-400 font-medium">Active</div>
                )}
              </button>
            );
          })}
        </div>
        <p className={`text-[11px] mt-2 ${mutedClass}`}>
          Web app: refresh the home-screen tile or re-install the PWA to see the new icon. Native iOS/Android use the
          system alternate-icon API — not yet implemented.
        </p>
      </section>

      {/* Neutral notifications */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>
          <Bell className="w-4 h-4 inline mr-1.5" />
          Notification previews
        </h3>
        <ToggleRow
          label="Hide preview content"
          description={`Lock-screen banners show "${NEUTRAL_TITLE}" / "${NEUTRAL_BODY}" instead of the real text. Content loads after you open the app.`}
          checked={settings.neutral_notifications}
          isBambiMode={isBambiMode}
          disabled={saving !== 'idle'}
          onToggle={() => handleToggle('neutral_notifications', 'neutral')}
        />
        <button
          type="button"
          onClick={sendTestNotification}
          className={`mt-3 px-3 py-1.5 rounded-md text-xs border ${surfaceClass} ${valueClass}`}
        >
          Send test notification
        </button>
      </section>

      {/* Panic close */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>
          <EyeOff className="w-4 h-4 inline mr-1.5" />
          Panic close
        </h3>
        <ToggleRow
          label="Triple-tap top-right to hide"
          description="Triple-tap the upper-right corner within 600ms to drop instantly to a neutral screen. Coming back doesn't restore the previous view."
          checked={settings.panic_close_enabled}
          isBambiMode={isBambiMode}
          disabled={saving !== 'idle'}
          onToggle={() => handleToggle('panic_close_enabled', 'panic')}
        />
      </section>

      {/* PIN lock */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${headingClass}`}>
          <Lock className="w-4 h-4 inline mr-1.5" />
          PIN lock
        </h3>
        <div className={`rounded-lg border p-4 space-y-3 ${surfaceClass}`}>
          <div className={`text-xs ${mutedClass}`}>
            Require a 4–6 digit PIN on app open or after 60s in the background.
            5 wrong tries = 1 minute lockout. 10 = 1 hour. Forgot-PIN sends a recovery email through your existing sign-in.
          </div>

          {pinExists ? (
            <div className="space-y-2">
              <div className={`text-xs font-medium ${valueClass}`}>PIN currently set</div>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Current PIN"
                value={pinForm.current}
                onChange={(e) => setPinForm((f) => ({ ...f, current: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
              <input
                type="password"
                inputMode="numeric"
                placeholder="New PIN (4–6 digits)"
                value={pinForm.next}
                onChange={(e) => setPinForm((f) => ({ ...f, next: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
              <input
                type="password"
                inputMode="numeric"
                placeholder="Confirm new PIN"
                value={pinForm.confirm}
                onChange={(e) => setPinForm((f) => ({ ...f, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePinSubmit}
                  disabled={saving !== 'idle'}
                  className="flex-1 py-2 rounded-md bg-purple-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'pin' ? 'Saving...' : 'Update PIN'}
                </button>
                <button
                  type="button"
                  onClick={handlePinDisable}
                  disabled={saving !== 'idle'}
                  className={`flex-1 py-2 rounded-md text-sm font-medium border ${surfaceClass} ${valueClass}`}
                >
                  {saving === 'pin_clear' ? 'Clearing...' : 'Disable lock'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                inputMode="numeric"
                placeholder="Choose a PIN (4–6 digits)"
                value={pinForm.next}
                onChange={(e) => setPinForm((f) => ({ ...f, next: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
              <input
                type="password"
                inputMode="numeric"
                placeholder="Confirm PIN"
                value={pinForm.confirm}
                onChange={(e) => setPinForm((f) => ({ ...f, confirm: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                className={`w-full px-3 py-2 rounded-md text-sm border ${surfaceClass} ${valueClass}`}
              />
              <button
                type="button"
                onClick={handlePinSubmit}
                disabled={saving !== 'idle'}
                className="w-full py-2 rounded-md bg-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving === 'pin' ? 'Saving...' : 'Set PIN & enable lock'}
              </button>
            </div>
          )}

          {pinError && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pinError}
            </div>
          )}
        </div>
      </section>

      {feedback && (
        <div className={`text-xs ${isBambiMode ? 'text-emerald-700' : 'text-emerald-300'}`}>{feedback}</div>
      )}
    </div>
  );
}

function ToggleRow({
  label, description, checked, isBambiMode, disabled, onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  isBambiMode: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`w-full p-4 rounded-lg border flex items-start gap-3 text-left transition-all ${
        isBambiMode ? 'bg-white border-pink-200 hover:border-pink-300' : 'bg-protocol-surface border-protocol-border hover:border-purple-500/30'
      } disabled:opacity-60`}
    >
      <div className="flex-1">
        <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>{label}</div>
        <div className={`text-xs mt-0.5 ${isBambiMode ? 'text-pink-500' : 'text-gray-500'}`}>{description}</div>
      </div>
      <div
        className={`mt-1 w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${
          checked ? (isBambiMode ? 'bg-pink-500' : 'bg-purple-500') : (isBambiMode ? 'bg-pink-200' : 'bg-gray-700')
        }`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
    </button>
  );
}
