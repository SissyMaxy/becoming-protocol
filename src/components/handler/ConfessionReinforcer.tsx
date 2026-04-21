/**
 * ConfessionReinforcer — surfaces a random key admission and asks "still
 * true?". Tapping yes increments the reinforcement on that confession +
 * writes a handler_directive audit. Every confirmation deepens the record.
 */

import { useEffect, useState } from 'react';
import { Quote, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Confession {
  id: string;
  response: string;
  sentiment: string | null;
  created_at: string;
}

export function ConfessionReinforcer() {
  const { user } = useAuth();
  const [confession, setConfession] = useState<Confession | null>(null);
  const [loading, setLoading] = useState(true);
  const [acted, setActed] = useState<'confirmed' | 'skipped' | null>(null);

  const pick = async () => {
    if (!user?.id) return;
    setLoading(true);
    setActed(null);
    try {
      const { data } = await supabase
        .from('confessions')
        .select('id, response, sentiment, created_at')
        .eq('user_id', user.id)
        .eq('is_key_admission', true)
        .order('created_at', { ascending: false })
        .limit(20);
      const rows = (data || []) as Confession[];
      if (rows.length === 0) {
        setConfession(null);
      } else {
        setConfession(rows[Math.floor(Math.random() * rows.length)]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { pick(); }, [user?.id]);

  const confirm = async () => {
    if (!user?.id || !confession) return;
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'confession_reinforced',
      target: confession.id,
      value: { response: confession.response.slice(0, 200), sentiment: confession.sentiment },
      reasoning: 'User confirmed confession still true via reinforcer widget',
    });
    // Also insert a new confession row with same content marking the reinforcement
    await supabase.from('confessions').insert({
      user_id: user.id,
      prompt: 'reinforcement_tap',
      response: confession.response,
      sentiment: confession.sentiment,
      is_key_admission: true,
      source: 'confession_reinforcer',
    });
    setActed('confirmed');
    setTimeout(() => pick(), 1200);
  };

  const skip = async () => {
    if (!user?.id || !confession) return;
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'confession_skipped',
      target: confession.id,
      value: { response: confession.response.slice(0, 200) },
      reasoning: 'User skipped confession prompt — possible resistance signal',
    });
    setActed('skipped');
    setTimeout(() => pick(), 800);
  };

  if (loading) {
    return (
      <div className="bg-gray-900/60 border border-fuchsia-500/20 rounded-lg p-3 text-[11px] text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> loading...
      </div>
    );
  }

  if (!confession) return null;

  return (
    <div className="bg-gray-900/60 border border-fuchsia-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Quote className="w-3 h-3 text-fuchsia-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Still True?</span>
        <button
          onClick={pick}
          className="ml-auto p-1 rounded hover:bg-gray-800 text-gray-500"
          title="pick different"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="text-gray-300 text-[12px] italic mb-3 bg-gray-950/60 rounded p-2">
        "{confession.response.slice(0, 280)}"
        {confession.response.length > 280 && '...'}
      </div>
      {acted === 'confirmed' ? (
        <p className="text-[11px] text-fuchsia-300 text-center">reinforced.</p>
      ) : acted === 'skipped' ? (
        <p className="text-[11px] text-gray-500 text-center">skipped — logged as resistance signal.</p>
      ) : (
        <div className="flex gap-1">
          <button
            onClick={confirm}
            className="flex-1 py-1.5 rounded bg-fuchsia-500/25 hover:bg-fuchsia-500/40 text-fuchsia-300 text-[11px] font-medium"
          >
            still true
          </button>
          <button
            onClick={skip}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[11px]"
          >
            skip
          </button>
        </div>
      )}
    </div>
  );
}
