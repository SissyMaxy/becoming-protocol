import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadStealthSettings, saveStealthSettings } from '../lib/stealth/settings';
import { DEFAULT_STEALTH_SETTINGS, StealthSettings } from '../lib/stealth/types';

const ICON_LS_KEY = 'bp-stealth-icon';

export function useStealthSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<StealthSettings>(DEFAULT_STEALTH_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setSettings(DEFAULT_STEALTH_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadStealthSettings(user.id)
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        try {
          if (s.icon_variant === 'default') localStorage.removeItem(ICON_LS_KEY);
          else localStorage.setItem(ICON_LS_KEY, s.icon_variant);
        } catch {
          // localStorage may be blocked — manifest will fall back to default
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(async (patch: Partial<StealthSettings>) => {
    if (!user) throw new Error('not authenticated');
    const next = await saveStealthSettings(user.id, patch);
    setSettings(next);
    try {
      if (next.icon_variant === 'default') localStorage.removeItem(ICON_LS_KEY);
      else localStorage.setItem(ICON_LS_KEY, next.icon_variant);
    } catch {
      // ignore
    }
    return next;
  }, [user]);

  return { settings, loading, update };
}
