/**
 * useCalendar — client-side hook for Google Calendar integration.
 * Mirrors useWhoop's shape: connection status, settings update, disconnect.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface CalendarStatus {
  connected: boolean;
  external_calendar_name?: string | null;
  neutral_calendar_titles?: boolean;
  morning_ritual_local_time?: string;
  morning_ritual_duration_min?: number;
  evening_reflection_local_time?: string;
  evening_reflection_duration_min?: number;
  events_enabled?: boolean;
  busy_aware_delivery?: boolean;
}

export interface CalendarSettingsPatch {
  events_enabled?: boolean;
  neutral_calendar_titles?: boolean;
  busy_aware_delivery?: boolean;
  morning_ritual_local_time?: string;
  morning_ritual_duration_min?: number;
  evening_reflection_local_time?: string;
  evening_reflection_duration_min?: number;
}

export interface UseCalendarReturn {
  status: CalendarStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  updateSettings: (patch: CalendarSettingsPatch) => Promise<void>;
  reload: () => Promise<void>;
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('not authenticated');
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export function useCalendar(): UseCalendarReturn {
  const { user } = useAuth();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setStatus(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await authedFetch('/api/calendar/status', { method: 'GET' });
      if (!res.ok) {
        setStatus({ connected: false });
        return;
      }
      const data = (await res.json()) as CalendarStatus;
      setStatus(data);
    } catch (err) {
      console.warn('[useCalendar] status failed:', (err as Error).message);
      setStatus({ connected: false });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  // Pick up the OAuth return-trip query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('gcal') === 'connected') {
      reload();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('gcal') === 'error') {
      console.warn('[useCalendar] OAuth error:', params.get('reason'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [reload]);

  const connect = useCallback(() => {
    if (!user?.id) return;
    window.location.href = `/api/calendar/auth?user_id=${user.id}`;
  }, [user?.id]);

  const disconnect = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      await authedFetch('/api/calendar/revoke', { method: 'POST' });
      setStatus({ connected: false });
    } finally {
      setIsSaving(false);
    }
  }, [user?.id]);

  const updateSettings = useCallback(
    async (patch: CalendarSettingsPatch) => {
      if (!user?.id) return;
      setIsSaving(true);
      try {
        const res = await authedFetch('/api/calendar/settings', {
          method: 'POST',
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          await reload();
        } else {
          const body = await res.json().catch(() => ({}));
          console.warn('[useCalendar] settings save failed:', body);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [user?.id, reload],
  );

  return { status, isLoading, isSaving, connect, disconnect, updateSettings, reload };
}
