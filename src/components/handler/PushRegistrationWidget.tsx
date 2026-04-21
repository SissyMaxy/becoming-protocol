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

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setError('Permission denied. Enable in browser settings.');
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setError('This browser does not support push notifications.');
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        setError('In-tab notifications enabled. Background push requires server VAPID key.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const p256dh = arrayBufferToBase64(sub.getKey('p256dh'));
      const auth = arrayBufferToBase64(sub.getKey('auth'));

      await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh,
        auth,
        device_label: null,
        user_agent: navigator.userAgent.slice(0, 200),
        active: true,
        last_used_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });

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
