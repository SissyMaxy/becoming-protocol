/**
 * Gina Interaction Logger
 *
 * Log interactions with Gina for Handler to learn from.
 * Captures what she said, did, her mood, and the context.
 */

import { useState } from 'react';
import {
  X,
  MessageCircle,
  Heart,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { logGinaInteraction, type GinaStance, type GinaMotivator } from '../../lib/gina-pipeline';

interface GinaInteractionLoggerProps {
  onClose: () => void;
  onLogged: () => void;
  prefillMissionId?: string;
}

type InteractionType =
  | 'mission_attempt'
  | 'seed_planted'
  | 'spontaneous_positive'
  | 'spontaneous_negative'
  | 'milestone'
  | 'directive_compliance'
  | 'gina_initiated'
  | 'observation';

const INTERACTION_TYPES: { value: InteractionType; label: string; icon: typeof MessageCircle }[] = [
  { value: 'spontaneous_positive', label: 'She did something positive', icon: ThumbsUp },
  { value: 'spontaneous_negative', label: 'She pushed back', icon: ThumbsDown },
  { value: 'gina_initiated', label: 'She initiated something', icon: Sparkles },
  { value: 'observation', label: 'I observed something', icon: MessageCircle },
  { value: 'milestone', label: 'A milestone happened', icon: Heart },
  { value: 'seed_planted', label: 'I planted a seed', icon: MessageCircle },
];

const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy', emoji: '😊' },
  { value: 'relaxed', label: 'Relaxed', emoji: '😌' },
  { value: 'playful', label: 'Playful', emoji: '😏' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'tired', label: 'Tired', emoji: '😴' },
  { value: 'distracted', label: 'Distracted', emoji: '🤔' },
  { value: 'annoyed', label: 'Annoyed', emoji: '😒' },
  { value: 'affectionate', label: 'Affectionate', emoji: '🥰' },
];

const CONTEXT_OPTIONS = [
  'Morning routine',
  'During intimacy',
  'After intimacy',
  'Casual conversation',
  'While she was distracted',
  'During planning',
  'In bed',
  'In public',
  'While watching TV',
  'Other',
];

export function GinaInteractionLogger({ onClose, onLogged, prefillMissionId }: GinaInteractionLoggerProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [type, setType] = useState<InteractionType>('observation');
  const [description, setDescription] = useState('');
  const [ginaSaid, setGinaSaid] = useState('');
  const [ginaDid, setGinaDid] = useState('');
  const [yourResponse, setYourResponse] = useState('');
  const [context, setContext] = useState('');
  const [herMood, setHerMood] = useState('');
  const [significance, setSignificance] = useState(3);
  const [indicatesMotivator, setIndicatesMotivator] = useState<GinaMotivator | ''>('');
  const [indicatesStance, setIndicatesStance] = useState<GinaStance | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !description) return;

    setIsSubmitting(true);
    try {
      await logGinaInteraction(user.id, {
        interactionType: type,
        description,
        ginaSaid: ginaSaid || undefined,
        ginaDid: ginaDid || undefined,
        yourResponse: yourResponse || undefined,
        context: context || undefined,
        herMood: herMood || undefined,
        significance,
        indicatesMotivator: indicatesMotivator || undefined,
        indicatesStance: indicatesStance || undefined,
        missionId: prefillMissionId,
      });
      onLogged();
    } catch (err) {
      console.error('Failed to log interaction:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div className={`sticky top-0 p-4 border-b flex items-center justify-between ${
          isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border'
        }`}>
          <h2 className={`text-lg font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Log Gina Interaction
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Interaction Type */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              What happened?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {INTERACTION_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setType(value)}
                  className={`p-3 rounded-xl text-left text-sm flex items-center gap-2 transition-all ${
                    type === value
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-pink-50 text-pink-700 hover:bg-pink-100'
                        : 'bg-protocol-bg text-protocol-text hover:bg-protocol-surface-light'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Describe what happened *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the interaction..."
              rows={3}
              className={`w-full p-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
            />
          </div>

          {/* What she said */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              What did she say? (quote if possible)
            </label>
            <textarea
              value={ginaSaid}
              onChange={(e) => setGinaSaid(e.target.value)}
              placeholder='"Her exact words..."'
              rows={2}
              className={`w-full p-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
            />
          </div>

          {/* What she did */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              What did she do?
            </label>
            <textarea
              value={ginaDid}
              onChange={(e) => setGinaDid(e.target.value)}
              placeholder="Her actions or body language..."
              rows={2}
              className={`w-full p-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
            />
          </div>

          {/* Your response */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              How did you respond?
            </label>
            <textarea
              value={yourResponse}
              onChange={(e) => setYourResponse(e.target.value)}
              placeholder="What you said or did..."
              rows={2}
              className={`w-full p-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
            />
          </div>

          {/* Context */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Context
            </label>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setContext(opt)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    context === opt
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-pink-50 text-pink-700'
                        : 'bg-protocol-bg text-protocol-text-muted'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Her Mood */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Her mood
            </label>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => setHerMood(value)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    herMood === value
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-pink-50 text-pink-700'
                        : 'bg-protocol-bg text-protocol-text-muted'
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Significance */}
          <div>
            <label className={`text-sm font-medium block mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              How significant was this? (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setSignificance(n)}
                  className={`w-10 h-10 rounded-full text-sm font-medium transition-all ${
                    significance === n
                      ? isBambiMode
                        ? 'bg-pink-500 text-white'
                        : 'bg-protocol-accent text-white'
                      : isBambiMode
                        ? 'bg-pink-50 text-pink-700'
                        : 'bg-protocol-bg text-protocol-text-muted'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-protocol-text-muted mt-1">
              {significance === 1 && 'Minor observation'}
              {significance === 2 && 'Somewhat notable'}
              {significance === 3 && 'Notable interaction'}
              {significance === 4 && 'Significant development'}
              {significance === 5 && 'Major breakthrough'}
            </p>
          </div>

          {/* Analysis hints */}
          <div className={`p-3 rounded-xl ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}>
            <p className={`text-xs font-medium mb-2 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              What might this indicate? (optional)
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-protocol-text-muted">Indicates stance:</label>
                <select
                  value={indicatesStance}
                  onChange={(e) => setIndicatesStance(e.target.value as GinaStance | '')}
                  className={`w-full mt-1 p-2 rounded-lg text-sm ${
                    isBambiMode
                      ? 'bg-white border border-pink-200 text-pink-900'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text'
                  }`}
                >
                  <option value="">Not sure</option>
                  <option value="unaware">Unaware</option>
                  <option value="suspicious">Suspicious</option>
                  <option value="tolerating">Tolerating</option>
                  <option value="curious">Curious</option>
                  <option value="participating">Participating</option>
                  <option value="enjoying">Enjoying</option>
                  <option value="encouraging">Encouraging</option>
                  <option value="directing">Directing</option>
                  <option value="invested">Invested</option>
                  <option value="dependent">Dependent</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-protocol-text-muted">Indicates motivator:</label>
                <select
                  value={indicatesMotivator}
                  onChange={(e) => setIndicatesMotivator(e.target.value as GinaMotivator | '')}
                  className={`w-full mt-1 p-2 rounded-lg text-sm ${
                    isBambiMode
                      ? 'bg-white border border-pink-200 text-pink-900'
                      : 'bg-protocol-surface border border-protocol-border text-protocol-text'
                  }`}
                >
                  <option value="">Not sure</option>
                  <option value="control">Control</option>
                  <option value="intimacy">Intimacy</option>
                  <option value="service">Service</option>
                  <option value="power">Power</option>
                  <option value="structure">Structure</option>
                  <option value="organization">Organization</option>
                  <option value="validation">Validation</option>
                  <option value="comfort">Comfort</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!description || isSubmitting}
            className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 ${
              !description || isSubmitting
                ? 'bg-gray-500/50 text-gray-400 cursor-not-allowed'
                : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-bright'
            }`}
          >
            <Send className="w-5 h-5" />
            {isSubmitting ? 'Logging...' : 'Log Interaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
