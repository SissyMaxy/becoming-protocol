import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadStealthSettings, saveStealthSettings } from '../lib/stealth/settings';
import { DEFAULT_STEALTH_SETTINGS, StealthSettings } from '../lib/stealth/types';

const ICON_LS_KEY = 'bp-stealth-icon';
const PRIVACY_SAFE_SETTINGS: StealthSettings = {
  ...DEFAULT_STEALTH_SETTINGS,
  sanitized_fitness_mode: true,
  neutral_notifications: true,
};

export function useStealthSettings() {
  const { user } = useAuth();
  // Do not reveal sensitive navigation while the persisted preference is
  // unknown. A successful load can explicitly turn sanitized mode off.
  const [settings, setSettings] = useState<StealthSettings>(PRIVACY_SAFE_SETTINGS);
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
      .catch((error) => {
        console.warn('[stealth] using privacy-safe settings after load failure:', error);
        if (!cancelled) setSettings(PRIVACY_SAFE_SETTINGS);
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
