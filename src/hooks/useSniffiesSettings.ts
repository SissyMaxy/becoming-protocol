import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadSniffiesSettings, saveSniffiesSettings } from '../lib/sniffies/settings';
import { DEFAULT_SNIFFIES_SETTINGS, SniffiesSettings } from '../lib/sniffies/types';

export function useSniffiesSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SniffiesSettings>(DEFAULT_SNIFFIES_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setSettings(DEFAULT_SNIFFIES_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadSniffiesSettings(user.id)
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = useCallback(
    async (patch: Partial<SniffiesSettings>) => {
      if (!user) throw new Error('not authenticated');
      const next = await saveSniffiesSettings(user.id, patch);
      setSettings(next);
      return next;
    },
    [user],
  );

  return { settings, loading, update };
}
