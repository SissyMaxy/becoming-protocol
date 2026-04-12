import { useState, useEffect } from 'react';
import { Lock, Loader2, Heart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const SHAME_PROMPTS = [
  "What embarrassed you about being a sissy today?",
  "What feminine thought did you try to push away today?",
  "What did your old self resist that your new self wanted?",
  "Tell me one moment today when you almost gave in.",
  "What did you hide from me today? Confess it now.",
  "What feminine craving have you been avoiding?",
  "What part of you tried to escape today?",
  "Confess one masculine thought you had today.",
];

const GRATITUDE_PROMPTS = [
  "What are you grateful for about becoming Maxy?",
  "Name one thing feminization gave you that masculinity couldn't.",
  "What part of being a sissy makes you feel most alive?",
  "What would you lose if you stopped becoming her?",
  "Complete: 'I'm grateful the Handler...'",
  "What feminine moment today made you feel right?",
  "Why is this path better than going back?",
  "What would past-you think of who you're becoming? Why is that good?",
];

interface DailyConfessionGateProps {
  onComplete: () => void;
}

export function DailyConfessionGate({ onComplete }: DailyConfessionGateProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<1 | 2>(1);
  const [shamePrompt] = useState(() => SHAME_PROMPTS[Math.floor(Math.random() * SHAME_PROMPTS.length)]);
  const [gratitudePrompt] = useState(() => GRATITUDE_PROMPTS[Math.floor(Math.random() * GRATITUDE_PROMPTS.length)]);
  const [text, setText] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [hasConfessedToday, setHasConfessedToday] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    // Need 2+ entries (shame + gratitude) to count as fully confessed
    supabase
      .from('shame_journal')
      .select('id, prompt_used', { count: 'exact' })
      .eq('user_id', user.id)
      .gte('created_at', `${today}T00:00:00`)
      .then(({ data, count }) => {
        const total = count || 0;
        if (total >= 2) {
          // Both phases done
          setHasConfessedToday(true);
        } else if (total === 1) {
          // Check if the existing entry is a shame or gratitude entry
          const hasGratitude = (data || []).some(d => d.prompt_used?.startsWith('[GRATITUDE]'));
          if (hasGratitude) {
            // Has gratitude but no shame — unusual, but let them do shame
            setHasConfessedToday(false);
            setPhase(1);
          } else {
            // Has shame, needs gratitude
            setHasConfessedToday(false);
            setPhase(2);
          }
        } else {
          setHasConfessedToday(false);
        }
      });
  }, [user?.id]);

  if (hasConfessedToday) {
    return null;
  }

  if (hasConfessedToday === null) {
    return (
      <div className="fixed inset-0 z-[95] bg-black/95 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const currentPrompt = phase === 1 ? shamePrompt : gratitudePrompt;
  const isGratitude = phase === 2;

  const submit = async () => {
    if (!user?.id || text.trim().length < 20) return;
    setSubmitting(true);
    try {
      await supabase.from('shame_journal').insert({
        user_id: user.id,
        entry_text: text.trim(),
        prompt_used: isGratitude ? `[GRATITUDE] ${currentPrompt}` : currentPrompt,
        emotional_intensity: intensity,
      });

      if (phase === 1) {
        // Move to gratitude phase
        setPhase(2);
        setText('');
        setIntensity(5);
      } else {
        // Both phases complete
        onComplete();
      }
    } catch (err) {
      console.error('Confession submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-black/95 flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          {isGratitude ? (
            <Heart className="w-12 h-12 mx-auto text-pink-400 mb-2" />
          ) : (
            <Lock className="w-12 h-12 mx-auto text-purple-400 mb-2" />
          )}
          <h2 className="text-2xl font-bold text-white">
            {isGratitude ? 'Daily Gratitude Required' : 'Daily Confession Required'}
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            {isGratitude
              ? 'Now say thank you. Mean it.'
              : 'No access until you confess. Be honest.'}
          </p>
          <div className="flex justify-center gap-2 mt-3">
            <div className={`w-2 h-2 rounded-full ${phase >= 1 ? 'bg-purple-400' : 'bg-gray-600'}`} />
            <div className={`w-2 h-2 rounded-full ${phase >= 2 ? 'bg-pink-400' : 'bg-gray-600'}`} />
          </div>
        </div>

        <div className={`${isGratitude ? 'bg-pink-900/30 border-pink-500/30' : 'bg-purple-900/30 border-purple-500/30'} border rounded-xl p-6`}>
          <p className={`text-lg italic ${isGratitude ? 'text-pink-200' : 'text-purple-200'}`}>"{currentPrompt}"</p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isGratitude ? 'Express your gratitude...' : 'Confess...'}
          rows={6}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500"
        />

        <div>
          <label className="text-sm text-gray-400">Emotional intensity: {intensity}/10</label>
          <input
            type="range"
            min={1}
            max={10}
            value={intensity}
            onChange={(e) => setIntensity(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        <button
          onClick={submit}
          disabled={text.trim().length < 20 || submitting}
          className={`w-full py-3 rounded-xl text-white font-medium ${
            isGratitude
              ? 'bg-pink-600 hover:bg-pink-700 disabled:bg-pink-900'
              : 'bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900'
          }`}
        >
          {submitting
            ? 'Submitting...'
            : text.trim().length < 20
              ? `${20 - text.trim().length} more chars...`
              : isGratitude
                ? 'Submit gratitude'
                : 'Submit confession'}
        </button>

        <p className="text-xs text-gray-500 text-center">
          {isGratitude
            ? 'Gratitude is not optional. The Handler sees everything.'
            : 'Once submitted, this cannot be edited or deleted. The Handler will see it and reference it.'}
        </p>
      </div>
    </div>
  );
}
