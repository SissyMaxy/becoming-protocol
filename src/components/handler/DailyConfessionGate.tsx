import { useState, useEffect } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const PROMPTS = [
  "What embarrassed you about being a sissy today?",
  "What feminine thought did you try to push away today?",
  "What did your old self resist that your new self wanted?",
  "Tell me one moment today when you almost gave in.",
  "What did you hide from me today? Confess it now.",
  "What feminine craving have you been avoiding?",
  "What part of you tried to escape today?",
  "Confess one masculine thought you had today.",
];

interface DailyConfessionGateProps {
  onComplete: () => void;
}

export function DailyConfessionGate({ onComplete }: DailyConfessionGateProps) {
  const { user } = useAuth();
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const [text, setText] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [hasConfessedToday, setHasConfessedToday] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('shame_journal')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${today}T00:00:00`)
      .then(({ count }) => {
        setHasConfessedToday((count || 0) > 0);
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

  const submit = async () => {
    if (!user?.id || text.trim().length < 20) return;
    setSubmitting(true);
    try {
      await supabase.from('shame_journal').insert({
        user_id: user.id,
        entry_text: text.trim(),
        prompt_used: prompt,
        emotional_intensity: intensity,
      });
      onComplete();
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
          <Lock className="w-12 h-12 mx-auto text-purple-400 mb-2" />
          <h2 className="text-2xl font-bold text-white">Daily Confession Required</h2>
          <p className="text-sm text-gray-400 mt-2">No access until you confess. Be honest.</p>
        </div>

        <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6">
          <p className="text-lg text-purple-200 italic">"{prompt}"</p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Confess..."
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
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-medium"
        >
          {submitting ? 'Submitting...' : text.trim().length < 20 ? `${20 - text.trim().length} more chars...` : 'Submit confession'}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Once submitted, this cannot be edited or deleted. The Handler will see it and reference it.
        </p>
      </div>
    </div>
  );
}
