import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Plus, Loader2, MessageCircle } from 'lucide-react';

const SIGNAL_CLASSES = [
  { value: 'acceptance', label: 'Acceptance — quiet, no comment, no resistance' },
  { value: 'warmth', label: 'Warmth — affectionate, encouraging energy' },
  { value: 'encouragement', label: 'Encouragement — explicit positive feedback' },
  { value: 'curiosity', label: 'Curiosity — asked a question or invited more' },
  { value: 'initiation', label: 'Initiation — she suggested or chose something' },
  { value: 'retreat', label: 'Retreat — changed subject, shut down' },
  { value: 'confusion', label: 'Confusion — asked for clarification, neutral' },
];

const CONTEXT_HINTS = [
  'cockwarming', 'nursing', 'after_dinner', 'lazy_morning',
  'bedtime', 'post_intimacy', 'shower', 'driving',
  'on_couch', 'kitchen', 'errands', 'other',
];

export function GinaVibeCaptureCard({ onSubmit }: { onSubmit?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [context, setContext] = useState('');
  const [herWords, setHerWords] = useState('');
  const [herAction, setHerAction] = useState('');
  const [signalClass, setSignalClass] = useState('warmth');
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!user?.id) return;
    if (!herWords.trim() && !herAction.trim()) {
      setError('Need at least her words or her action.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: insErr } = await supabase.from('gina_vibe_captures').insert({
        user_id: user.id,
        context: context.trim() || null,
        her_words: herWords.trim() || null,
        her_action: herAction.trim() || null,
        signal_class: signalClass,
      });
      if (insErr) throw insErr;
      setHerWords('');
      setHerAction('');
      setContext('');
      setOpen(false);
      onSubmit?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, context, herWords, herAction, signalClass, onSubmit]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-3 rounded-lg bg-pink-900/20 border border-pink-500/30 hover:bg-pink-900/30 transition-colors text-left flex items-center gap-2 text-pink-200"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm">Capture a Gina vibe — quote her, log her energy</span>
      </button>
    );
  }

  return (
    <div className="bg-pink-900/15 border border-pink-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-pink-200">Capture Gina vibe</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-pink-300/60 hover:text-pink-300">cancel</button>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={herWords}
          onChange={(e) => setHerWords(e.target.value)}
          placeholder="What she said — verbatim if possible"
          className="w-full bg-protocol-bg border border-protocol-border rounded px-3 py-2 text-sm text-white"
          autoFocus
        />
        <input
          type="text"
          value={herAction}
          onChange={(e) => setHerAction(e.target.value)}
          placeholder="What she did (optional — body language, gesture, response)"
          className="w-full bg-protocol-bg border border-protocol-border rounded px-3 py-2 text-sm text-white"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Context"
            list="vibe-context-hints"
            className="flex-1 bg-protocol-bg border border-protocol-border rounded px-3 py-2 text-sm text-white"
          />
          <datalist id="vibe-context-hints">
            {CONTEXT_HINTS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <select
          value={signalClass}
          onChange={(e) => setSignalClass(e.target.value)}
          className="w-full bg-protocol-bg border border-protocol-border rounded px-3 py-2 text-sm text-white"
        >
          {SIGNAL_CLASSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-900/30 border border-red-500/40 rounded p-2">{error}</div>
      )}

      <button
        onClick={submit}
        disabled={submitting || (!herWords.trim() && !herAction.trim())}
        className="w-full py-2 rounded bg-pink-600 hover:bg-pink-700 disabled:bg-pink-900/40 text-white text-sm font-medium flex items-center justify-center gap-2"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Capture</>}
      </button>

      <p className="text-[10px] text-pink-300/50 leading-relaxed">
        The Handler reads recent vibes before generating any next move. Verbatim quotes become re-citation ammunition.
        The cultivation engine reads signal_class to calibrate readiness on merge pipeline items.
      </p>
    </div>
  );
}
