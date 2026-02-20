/**
 * SleepContentSettings — Settings panel for sleep content configuration.
 *
 * Manages default mode, timer, delay, voice settings, Lovense subliminal,
 * and the affirmation content library.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Headphones,
  Volume2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  PlayCircle,
  Loader2,
} from 'lucide-react';
import { useSleepContent } from '../../hooks/useSleepContent';
import {
  isSpeechAvailable,
  getVoices,
  selectFeminineVoice,
  speakAffirmation,
} from '../../lib/speech-synthesis';
import type { SleepAudioMode, SleepCategory } from '../../types/sleep-content';

const MODE_OPTIONS: { value: SleepAudioMode; label: string; icon: typeof Eye }[] = [
  { value: 'text_only', label: 'Text Only', icon: Eye },
  { value: 'single_earbud', label: 'Single Earbud', icon: Headphones },
  { value: 'full_audio', label: 'Full Audio', icon: Volume2 },
];

const TIMER_PRESETS = [15, 30, 45, 60, 90];
const DELAY_PRESETS = [0, 5, 10, 15, 20, 30];

const CATEGORY_LABELS: Record<SleepCategory, string> = {
  identity: 'Identity',
  feminization: 'Feminization',
  surrender: 'Surrender',
  chastity: 'Chastity',
  sleep_induction: 'Sleep Induction',
  ambient: 'Ambient',
  custom: 'Custom',
};

export function SleepContentSettings() {
  const sleep = useSleepContent();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<SleepCategory>('custom');

  // Load voices
  useEffect(() => {
    if (isSpeechAvailable()) {
      getVoices().then(setVoices);
    }
  }, []);

  const testVoice = useCallback(async () => {
    if (!sleep.config || isTesting) return;
    setIsTesting(true);
    try {
      const voice = selectFeminineVoice(voices, sleep.config.voiceName);
      await speakAffirmation('She is here. She is real. She is becoming.', {
        pitch: sleep.config.voicePitch,
        rate: sleep.config.voiceRate,
        volume: 1,
      }, voice);
    } catch { /* ignore */ }
    setIsTesting(false);
  }, [sleep.config, voices, isTesting]);

  const handleAddContent = async () => {
    if (!newText.trim()) return;
    await sleep.addContent({
      category: newCategory,
      affirmationText: newText.trim(),
    });
    setNewText('');
    setShowAddForm(false);
  };

  if (sleep.isLoading || !sleep.config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-protocol-accent animate-spin" />
      </div>
    );
  }

  const config = sleep.config;

  return (
    <div className="space-y-6">
      {/* Default Mode */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-protocol-text mb-3">Default Audio Mode</h3>
        <div className="space-y-2">
          {MODE_OPTIONS.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => sleep.updateConfig({ defaultMode: opt.value })}
                className={`w-full p-3 rounded-lg border flex items-center gap-3 text-left transition-all ${
                  config.defaultMode === opt.value
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-protocol-text'
                    : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/20'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timer & Delay */}
      <div className="card p-4">
        <h3 className="text-sm font-medium text-protocol-text mb-3">Default Timer</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {TIMER_PRESETS.map(m => (
            <button
              key={m}
              onClick={() => sleep.updateConfig({ defaultTimerMinutes: m })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                config.defaultTimerMinutes === m
                  ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted'
              }`}
            >
              {m} min
            </button>
          ))}
        </div>

        <h3 className="text-sm font-medium text-protocol-text mb-3">Default Delay</h3>
        <div className="flex flex-wrap gap-2">
          {DELAY_PRESETS.map(m => (
            <button
              key={m}
              onClick={() => sleep.updateConfig({ defaultDelayMinutes: m })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                config.defaultDelayMinutes === m
                  ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted'
              }`}
            >
              {m === 0 ? 'None' : `${m} min`}
            </button>
          ))}
        </div>
      </div>

      {/* Voice Settings */}
      {isSpeechAvailable() && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-protocol-text mb-3">Voice Settings</h3>

          {/* Voice Picker */}
          {voices.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-protocol-text-muted mb-1 block">Voice</label>
              <select
                value={config.voiceName || ''}
                onChange={(e) => sleep.updateConfig({ voiceName: e.target.value || null })}
                className="w-full p-2 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text text-sm"
              >
                <option value="">Auto (feminine)</option>
                {voices.filter(v => v.lang.startsWith('en')).map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Pitch */}
          <div className="mb-3">
            <label className="text-xs text-protocol-text-muted mb-1 flex justify-between">
              <span>Pitch</span>
              <span>{config.voicePitch.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={config.voicePitch}
              onChange={(e) => sleep.updateConfig({ voicePitch: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          {/* Rate */}
          <div className="mb-4">
            <label className="text-xs text-protocol-text-muted mb-1 flex justify-between">
              <span>Speed</span>
              <span>{config.voiceRate.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0.3"
              max="1.5"
              step="0.05"
              value={config.voiceRate}
              onChange={(e) => sleep.updateConfig({ voiceRate: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          {/* Test button */}
          <button
            onClick={testVoice}
            disabled={isTesting}
            className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Test Voice
          </button>
        </div>
      )}

      {/* Lovense */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-protocol-text">Lovense Subliminal Pulse</h3>
          <button onClick={() => sleep.updateConfig({ lovenseSubliminalEnabled: !config.lovenseSubliminalEnabled })}>
            {config.lovenseSubliminalEnabled ? (
              <ToggleRight className="w-6 h-6 text-indigo-400" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-protocol-text-muted" />
            )}
          </button>
        </div>
        <p className="text-xs text-protocol-text-muted mb-3">
          Gentle vibration pulse during full_audio mode. Very low intensity — conditioning anchor, not arousal.
        </p>
        {config.lovenseSubliminalEnabled && (
          <div>
            <label className="text-xs text-protocol-text-muted mb-1 flex justify-between">
              <span>Max Intensity</span>
              <span>{config.lovenseMaxIntensity}/5</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={config.lovenseMaxIntensity}
              onChange={(e) => sleep.updateConfig({ lovenseMaxIntensity: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        )}
      </div>

      {/* Content Library */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-protocol-text">
            Affirmation Library ({sleep.content.length})
          </h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="mb-4 p-3 rounded-lg bg-protocol-surface border border-protocol-border">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Write an affirmation..."
              className="w-full p-2 rounded bg-protocol-bg border border-protocol-border text-protocol-text text-sm mb-2 resize-none"
              rows={2}
            />
            <div className="flex gap-2 items-center">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as SleepCategory)}
                className="flex-1 p-1.5 rounded bg-protocol-bg border border-protocol-border text-protocol-text text-xs"
              >
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleAddContent}
                disabled={!newText.trim()}
                className="px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-medium hover:bg-indigo-500/30 disabled:opacity-30"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Content list grouped by category */}
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {sleep.content.length === 0 ? (
            <p className="text-xs text-protocol-text-muted text-center py-4">No affirmations yet.</p>
          ) : (
            sleep.content.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-2 p-2 rounded-lg ${
                  item.enabled ? 'bg-protocol-surface' : 'bg-protocol-surface/50 opacity-50'
                }`}
              >
                <button
                  onClick={() => sleep.toggleContent(item.id, !item.enabled)}
                  className="mt-0.5 flex-shrink-0"
                >
                  {item.enabled ? (
                    <ToggleRight className="w-4 h-4 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-protocol-text-muted" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-protocol-text leading-relaxed">{item.affirmationText}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] text-protocol-text-muted">{CATEGORY_LABELS[item.category]}</span>
                    {item.corruptionLevelMin > 0 && (
                      <span className="text-[10px] text-indigo-400/60">L{item.corruptionLevelMin}+</span>
                    )}
                    {item.requiresPrivacy && (
                      <span className="text-[10px] text-red-400/60">Private</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => sleep.removeContent(item.id)}
                  className="mt-0.5 flex-shrink-0 p-1 rounded hover:bg-red-500/10 text-protocol-text-muted hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
