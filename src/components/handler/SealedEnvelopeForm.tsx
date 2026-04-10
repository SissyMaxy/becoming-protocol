import { useState } from 'react';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface SealedEnvelopeFormProps {
  onCreated?: () => void;
}

export function SealedEnvelopeForm({ onCreated }: SealedEnvelopeFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [daysUntilRelease, setDaysUntilRelease] = useState(7);
  const [intent, setIntent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSeal = async () => {
    if (!user?.id) return;
    if (title.trim().length < 3 || content.trim().length < 20) return;

    setSubmitting(true);
    try {
      const releaseAt = new Date(Date.now() + daysUntilRelease * 86400000).toISOString();
      const { error } = await supabase.from('sealed_envelopes').insert({
        user_id: user.id,
        title: title.trim(),
        sealed_content: content.trim(),
        release_at: releaseAt,
        intent: intent.trim() || null,
      });
      if (error) throw error;
      setDone(true);
      if (onCreated) setTimeout(onCreated, 2000);
    } catch (err) {
      console.error('Seal failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6 text-center">
        <Lock className="w-12 h-12 mx-auto text-purple-400 mb-2" />
        <p className="text-white font-medium">Sealed.</p>
        <p className="text-sm text-gray-400 mt-2">
          Opens in {daysUntilRelease} days. Cannot be opened early. Cannot be deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Mail className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-bold text-white">Seal an envelope</h3>
      </div>
      <p className="text-xs text-gray-500">
        Write a message to your future self. It will be sealed at the database level.
        You cannot open it early. You cannot delete it.
      </p>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. 'For when I want to quit')"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your message to future-you..."
        rows={6}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
      />

      <input
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        placeholder="What is this for? (optional, shown to Handler)"
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
      />

      <div>
        <label className="text-sm text-gray-400">Release in {daysUntilRelease} days</label>
        <input
          type="range"
          min={1}
          max={365}
          value={daysUntilRelease}
          onChange={(e) => setDaysUntilRelease(parseInt(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>1d</span>
          <span>30d</span>
          <span>90d</span>
          <span>365d</span>
        </div>
      </div>

      <button
        onClick={handleSeal}
        disabled={title.trim().length < 3 || content.trim().length < 20 || submitting}
        className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium"
      >
        {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Seal envelope'}
      </button>
    </div>
  );
}
