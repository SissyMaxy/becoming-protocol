/**
 * Seed Logger
 *
 * Form for logging seed attempts — the core data entry point for
 * tracking Gina's responses to feminization seeds across channels.
 */

import { useState, useCallback } from 'react';
import {
  ChevronLeft,
  Save,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  type GinaChannel,
} from '../../lib/gina/ladder-engine';
import {
  type SeedResponse,
  type SeedLogResult,
  logSeed,
} from '../../lib/gina/seed-manager';

interface SeedLoggerProps {
  onBack: () => void;
  onSaved: () => void;
  preselectedChannel?: GinaChannel;
}

const CHANNEL_OPTIONS: { value: GinaChannel; label: string; icon: string }[] = [
  { value: 'scent', label: 'Scent', icon: '🌸' },
  { value: 'touch', label: 'Touch', icon: '✋' },
  { value: 'domestic', label: 'Domestic', icon: '🏠' },
  { value: 'intimacy', label: 'Intimacy', icon: '💜' },
  { value: 'visual', label: 'Visual', icon: '👗' },
  { value: 'social', label: 'Social', icon: '👥' },
  { value: 'bedroom', label: 'Bedroom', icon: '🛏️' },
  { value: 'pronoun', label: 'Pronoun', icon: '💬' },
  { value: 'financial', label: 'Financial', icon: '💳' },
  { value: 'body_change_touch', label: 'Body Change', icon: '✨' },
];

const RESPONSE_OPTIONS: { value: SeedResponse; label: string; color: string; description: string }[] = [
  { value: 'positive', label: 'Positive', color: 'bg-green-500', description: 'Accepted, engaged, reciprocated' },
  { value: 'neutral', label: 'Neutral', color: 'bg-gray-500', description: 'No strong reaction either way' },
  { value: 'negative', label: 'Negative', color: 'bg-red-500', description: 'Rejected, resisted, uncomfortable' },
  { value: 'callout', label: 'Callout', color: 'bg-orange-500', description: 'Directly questioned or confronted' },
  { value: 'no_reaction', label: 'No Reaction', color: 'bg-gray-400', description: 'Didn\'t seem to notice' },
];

const MOOD_OPTIONS = [
  'Happy', 'Relaxed', 'Neutral', 'Tired', 'Stressed', 'Playful', 'Distracted', 'Irritable',
];

const TIMING_OPTIONS = [
  'Morning', 'Afternoon', 'Evening', 'Late Night', 'During Activity', 'Before Bed',
];

const SETTING_OPTIONS = [
  'Home - Private', 'Home - Shared Space', 'Out Together', 'Public', 'With Friends', 'With Family',
];

export function SeedLogger({ onBack, onSaved, preselectedChannel }: SeedLoggerProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [channel, setChannel] = useState<GinaChannel | ''>(preselectedChannel || '');
  const [seedDescription, setSeedDescription] = useState('');
  const [ginaResponse, setGinaResponse] = useState<SeedResponse | ''>('');
  const [ginaExactWords, setGinaExactWords] = useState('');
  const [contextNotes, setContextNotes] = useState('');
  const [herMood, setHerMood] = useState('');
  const [timing, setTiming] = useState('');
  const [setting, setSetting] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<SeedLogResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = channel && seedDescription.trim() && ginaResponse;

  const handleSubmit = useCallback(async () => {
    if (!user || !channel || !ginaResponse || !seedDescription.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const logResult = await logSeed(user.id, {
        channel,
        seedDescription: seedDescription.trim(),
        ginaResponse,
        ginaExactWords: ginaExactWords.trim() || undefined,
        contextNotes: contextNotes.trim() || undefined,
        herMood: herMood || undefined,
        timing: timing || undefined,
        setting: setting || undefined,
      });

      setResult(logResult);
    } catch (err) {
      console.error('Failed to log seed:', err);
      setError('Failed to save seed log');
    } finally {
      setIsSaving(false);
    }
  }, [user, channel, seedDescription, ginaResponse, ginaExactWords, contextNotes, herMood, timing, setting]);

  // Result screen
  if (result) {
    return (
      <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
          isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
        }`}>
          <button onClick={onSaved} className="p-1">
            <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
          </button>
          <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
            Seed Logged
          </h1>
        </div>

        <div className="p-4 space-y-4">
          <div className={`rounded-lg p-4 text-center ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <CheckCircle className={`w-12 h-12 mx-auto mb-3 ${
              result.recoveryTriggered
                ? isBambiMode ? 'text-orange-500' : 'text-orange-400'
                : isBambiMode ? 'text-green-500' : 'text-green-400'
            }`} />
            <p className={`text-lg font-medium mb-1 ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
              {result.recoveryTriggered ? 'Seed Logged — Recovery Triggered' : 'Seed Logged Successfully'}
            </p>
          </div>

          {/* Result details */}
          <div className={`rounded-lg p-4 space-y-2 ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            {result.recoveryTriggered && (
              <div className={`flex items-center gap-2 ${isBambiMode ? 'text-orange-600' : 'text-orange-400'}`}>
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">
                  Recovery: {result.recoveryType?.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {result.cooldownSet && result.cooldownUntil && (
              <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
                Cooldown set until {result.cooldownUntil.toLocaleDateString()}
              </p>
            )}
            <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
              Consecutive failures: {result.newConsecutiveFailures}
            </p>
            {result.rungAdvancementPossible && (
              <p className={`text-sm font-medium ${isBambiMode ? 'text-green-600' : 'text-green-400'}`}>
                Rung advancement may be possible!
              </p>
            )}
          </div>

          <button
            onClick={onSaved}
            className={`w-full py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
      }`}>
        <button onClick={onBack} className="p-1">
          <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
        </button>
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
          Log Seed
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className={`p-3 rounded-lg text-sm ${isBambiMode ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-300'}`}>
            {error}
          </div>
        )}

        {/* Channel Selection */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Channel *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {CHANNEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setChannel(opt.value)}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                  channel === opt.value
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-purple-600 text-white'
                    : isBambiMode
                      ? 'bg-white border border-pink-200 text-pink-700 hover:bg-pink-50'
                      : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Seed Description */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            What did you do? *
          </label>
          <textarea
            value={seedDescription}
            onChange={e => setSeedDescription(e.target.value)}
            placeholder="Describe the seed attempt..."
            rows={3}
            className={`w-full p-3 rounded-lg text-sm resize-none ${
              isBambiMode
                ? 'bg-white border border-pink-200 text-pink-800 placeholder-pink-300'
                : 'bg-white/5 border border-white/10 text-white placeholder-gray-500'
            }`}
          />
        </div>

        {/* Gina's Response */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Gina's Response *
          </label>
          <div className="space-y-2">
            {RESPONSE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setGinaResponse(opt.value)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                  ginaResponse === opt.value
                    ? isBambiMode
                      ? 'bg-pink-500 text-white'
                      : 'bg-purple-600 text-white'
                    : isBambiMode
                      ? 'bg-white border border-pink-200 text-pink-700 hover:bg-pink-50'
                      : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${opt.color}`} />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className={`text-xs ${
                    ginaResponse === opt.value ? 'opacity-80' : isBambiMode ? 'text-pink-400' : 'text-gray-500'
                  }`}>
                    {opt.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Gina's Exact Words */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Gina's Exact Words (optional)
          </label>
          <textarea
            value={ginaExactWords}
            onChange={e => setGinaExactWords(e.target.value)}
            placeholder="What exactly did she say?"
            rows={2}
            className={`w-full p-3 rounded-lg text-sm resize-none ${
              isBambiMode
                ? 'bg-white border border-pink-200 text-pink-800 placeholder-pink-300'
                : 'bg-white/5 border border-white/10 text-white placeholder-gray-500'
            }`}
          />
        </div>

        {/* Context Notes */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Context Notes (optional)
          </label>
          <textarea
            value={contextNotes}
            onChange={e => setContextNotes(e.target.value)}
            placeholder="Any additional context..."
            rows={2}
            className={`w-full p-3 rounded-lg text-sm resize-none ${
              isBambiMode
                ? 'bg-white border border-pink-200 text-pink-800 placeholder-pink-300'
                : 'bg-white/5 border border-white/10 text-white placeholder-gray-500'
            }`}
          />
        </div>

        {/* Her Mood */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Her Mood (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map(mood => (
              <button
                key={mood}
                onClick={() => setHerMood(herMood === mood ? '' : mood)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  herMood === mood
                    ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                    : isBambiMode ? 'bg-white border border-pink-200 text-pink-600' : 'bg-white/5 border border-white/10 text-gray-400'
                }`}
              >
                {mood}
              </button>
            ))}
          </div>
        </div>

        {/* Timing */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Timing (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {TIMING_OPTIONS.map(t => (
              <button
                key={t}
                onClick={() => setTiming(timing === t ? '' : t)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  timing === t
                    ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                    : isBambiMode ? 'bg-white border border-pink-200 text-pink-600' : 'bg-white/5 border border-white/10 text-gray-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Setting */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isBambiMode ? 'text-pink-800' : 'text-gray-300'}`}>
            Setting (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {SETTING_OPTIONS.map(s => (
              <button
                key={s}
                onClick={() => setSetting(setting === s ? '' : s)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  setting === s
                    ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                    : isBambiMode ? 'bg-white border border-pink-200 text-pink-600' : 'bg-white/5 border border-white/10 text-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 ${
            canSubmit && !isSaving
              ? isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-purple-600 text-white hover:bg-purple-700'
              : isBambiMode
                ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                : 'bg-white/10 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isSaving ? 'Saving...' : 'Log Seed'}
        </button>
      </div>
    </div>
  );
}
