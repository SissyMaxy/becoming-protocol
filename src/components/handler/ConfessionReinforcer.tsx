/**
 * ConfessionReinforcer — surfaces a random key admission and asks "still
 * true?". Tapping yes records a reinforcement directive (no duplicate
 * confession row). Each admission has a 14-day cooldown after reinforcement
 * so the same questions don't keep cycling back at the user.
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

const COOLDOWN_DAYS = 14;

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
      // 1) Pull original key admissions (NOT reinforcement copies — those
      //    are tagged source='confession_reinforcer' and would just echo
      //    the original content).
      const { data } = await supabase
        .from('confessions')
        .select('id, response, sentiment, created_at')
        .eq('user_id', user.id)
        .eq('is_key_admission', true)
        .neq('source', 'confession_reinforcer')
        .order('created_at', { ascending: false })
        .limit(50);
      const candidates = (data || []) as Confession[];

      // 2) Find which admissions have been reinforced (or skipped) recently.
      //    Cooldown applies to BOTH outcomes — if she just answered, don't
      //    re-ask the same one within COOLDOWN_DAYS.
      const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString();
      const { data: recent } = await supabase
        .from('handler_directives')
        .select('target, created_at')
        .eq('user_id', user.id)
        .in('action', ['confession_reinforced', 'confession_skipped'])
        .gte('created_at', cutoff);
      const onCooldown = new Set(((recent || []) as Array<{ target: string }>).map(r => r.target));

      // 3) Filter out cooldown candidates. If everything is on cooldown
      //    (rare — only when she's answered everything in last 14d),
      //    fall through to least-recently-reinforced from the FULL list.
      const fresh = candidates.filter(c => !onCooldown.has(c.id));
      const pool = fresh.length > 0 ? fresh : candidates;

      if (pool.length === 0) {
        setConfession(null);
      } else {
        // Random pick from the cooled-down pool — fair rotation across
        // admissions she hasn't touched recently.
        setConfession(pool[Math.floor(Math.random() * pool.length)]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { pick(); }, [user?.id]);

  const confirm = async () => {
    if (!user?.id || !confession) return;
    // Audit only — DON'T insert a duplicate confessions row, that was the
    // bug that kept the same content cycling back. The directive is the
    // record of reinforcement; the original confession stays as-is.
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'confession_reinforced',
      target: confession.id,
      value: { response: confession.response.slice(0, 200), sentiment: confession.sentiment },
      reasoning: 'User confirmed admission still true via reinforcer widget',
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
      reasoning: 'User skipped reinforcer prompt — possible resistance signal',
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
        <p className="text-[11px] text-fuchsia-300 text-center">reinforced. won't be re-asked for {COOLDOWN_DAYS} days.</p>
      ) : acted === 'skipped' ? (
        <p className="text-[11px] text-gray-500 text-center">skipped — won't be re-asked for {COOLDOWN_DAYS} days.</p>
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
            no longer / skip
          </button>
        </div>
      )}
    </div>
  );
}
