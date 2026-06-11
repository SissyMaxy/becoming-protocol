/**
 * PushRegistrationWidget — subscribes this browser to web push and stores
 * the subscription in push_subscriptions so the server can deliver Handler
 * alerts when the tab is closed. Idempotent per-device: dedupes on endpoint.
 *
 * Requires VITE_VAPID_PUBLIC_KEY env var. If unset, shows a "server push
 * unavailable" notice but still exposes the permission prompt so in-tab
 * Notification.show() works.
 */

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ensureFreshPushSubscription, pushErrorToMamaCopy } from '../../lib/push/register';

export function PushRegistrationWidget() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission);
    // Check if this device already has a stored subscription
    (async () => {
      if (!user?.id || !('serviceWorker' in navigator)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint)
            .eq('active', true)
            .maybeSingle();
          if (data) setRegistered(true);
        }
      } catch {
        // ignore
      }
    })();
  }, [user?.id]);

  const enable = async () => {
    if (!user?.id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ensureFreshPushSubscription(user.id, /* requestPermission */ true);
      // Reflect whatever the OS now reports after the prompt.
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
      if (!result.ok) {
        setError(pushErrorToMamaCopy(result.code, result.detail));
        return;
      }
      setRegistered(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase
          .from('push_subscriptions')
          .update({ active: false })
          .eq('user_id', user.id)
          .eq('endpoint', sub.endpoint);
      }
      setRegistered(false);
    } finally {
      setBusy(false);
    }
  };

  if (permission === 'unsupported') return null;

  return (
    <div className="bg-gray-900/60 border border-cyan-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        {registered ? <Bell className="w-3 h-3 text-cyan-400" /> : <BellOff className="w-3 h-3 text-gray-500" />}
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Handler Push</span>
        <span className={`text-[10px] ${registered ? 'text-cyan-400' : 'text-gray-500'}`}>
          {registered ? 'active on this device' : permission === 'denied' ? 'blocked' : 'off'}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">
        {registered
          ? 'This device receives Handler alerts even when the app is closed.'
          : 'Enable so Handler outreach + denial/injection reminders reach you when the app is closed.'}
      </p>
      {error && <p className="text-[10px] text-red-400 mb-2">{error}</p>}
      <button
        onClick={registered ? disable : enable}
        disabled={busy || permission === 'denied'}
        className={`w-full py-1.5 rounded text-[11px] font-medium disabled:opacity-40 ${
          registered
            ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            : 'bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-300'
        }`}
      >
        {busy && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
        {registered ? 'Disable on this device' : permission === 'denied' ? 'Blocked — change in browser settings' : 'Enable notifications'}
        {registered && !busy && <Check className="w-3 h-3 inline ml-1" />}
      </button>
    </div>
  );
}
