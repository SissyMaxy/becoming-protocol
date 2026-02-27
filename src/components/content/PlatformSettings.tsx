/**
 * PlatformSettings — Per-platform handle, active toggle, defaults.
 * No OAuth. Manual settings only.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Loader2, Save, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Platform } from '../../types/content-pipeline';

interface PlatformSettingsProps {
  onBack: () => void;
}

interface PlatformConfig {
  id: string;
  platform: Platform;
  handle: string;
  is_active: boolean;
  default_tier: string;
  default_subreddits: string;
}

const PLATFORM_DEFAULTS: Array<{ platform: Platform; label: string }> = [
  { platform: 'twitter', label: 'Twitter / X' },
  { platform: 'reddit', label: 'Reddit' },
  { platform: 'onlyfans', label: 'OnlyFans' },
  { platform: 'fansly', label: 'Fansly' },
];

const TIERS = ['free', 'paid', 'ppv', 'exclusive'] as const;

export function PlatformSettings({ onBack }: PlatformSettingsProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [configs, setConfigs] = useState<PlatformConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const { data } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('user_id', user.id);

    const existing = (data || []) as Array<Record<string, unknown>>;
    const configMap = new Map(existing.map(e => [e.platform as string, e]));

    const merged: PlatformConfig[] = PLATFORM_DEFAULTS.map(p => {
      const e = configMap.get(p.platform);
      return {
        id: (e?.id as string) || '',
        platform: p.platform,
        handle: (e?.handle as string) || (e?.username as string) || '',
        is_active: (e?.is_active as boolean) ?? false,
        default_tier: (e?.default_tier as string) || 'free',
        default_subreddits: (e?.default_subreddits as string) || '',
      };
    });

    setConfigs(merged);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateConfig = (platform: Platform, field: keyof PlatformConfig, value: unknown) => {
    setConfigs(prev => prev.map(c =>
      c.platform === platform ? { ...c, [field]: value } : c
    ));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    for (const config of configs) {
      if (config.id) {
        await supabase
          .from('platform_accounts')
          .update({
            handle: config.handle,
            username: config.handle,
            is_active: config.is_active,
            default_tier: config.default_tier,
            default_subreddits: config.default_subreddits,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
      } else if (config.handle) {
        await supabase
          .from('platform_accounts')
          .insert({
            user_id: user.id,
            platform: config.platform,
            handle: config.handle,
            username: config.handle,
            is_active: config.is_active,
            default_tier: config.default_tier,
            default_subreddits: config.default_subreddits,
          });
      }
    }

    setSaved(true);
    setIsSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';
  const accent = isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text}`}>Platform Settings</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg ${accent}`}
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved ? <Check className="w-3.5 h-3.5" />
            : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${muted}`} />
        </div>
      ) : (
        <div className="px-4 space-y-4">
          {configs.map(config => (
            <div key={config.platform} className={`rounded-xl border p-4 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold ${text}`}>
                  {PLATFORM_DEFAULTS.find(p => p.platform === config.platform)?.label}
                </h3>
                <button
                  onClick={() => updateConfig(config.platform, 'is_active', !config.is_active)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    config.is_active
                      ? isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
                      : isBambiMode ? 'bg-gray-200' : 'bg-gray-600'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    config.is_active ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Handle */}
              <div className="mb-3">
                <label className={`text-xs ${muted} mb-1 block`}>Handle / Username</label>
                <input
                  value={config.handle}
                  onChange={e => updateConfig(config.platform, 'handle', e.target.value)}
                  placeholder={`@your${config.platform}handle`}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
                />
              </div>

              {/* Default tier */}
              <div className="mb-3">
                <label className={`text-xs ${muted} mb-1 block`}>Default Tier</label>
                <div className="flex gap-2">
                  {TIERS.map(t => (
                    <button
                      key={t}
                      onClick={() => updateConfig(config.platform, 'default_tier', t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        config.default_tier === t
                          ? isBambiMode ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
                          : `border-transparent ${muted}`
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subreddits (Reddit only) */}
              {config.platform === 'reddit' && (
                <div>
                  <label className={`text-xs ${muted} mb-1 block`}>Default Subreddits</label>
                  <input
                    value={config.default_subreddits}
                    onChange={e => updateConfig(config.platform, 'default_subreddits', e.target.value)}
                    placeholder="r/sub1, r/sub2, r/sub3"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
