/**
 * Disclosure Execute Modal
 *
 * UI for executing a Gina disclosure rung: review Handler-drafted script,
 * edit, copy to clipboard / compose SMS, log Gina's response.
 * On accept with capability_unlocked_on_yes, auto-creates the capability grant.
 * Writes Gina's exact words to handler_memory for Handler reference.
 */

import { useEffect, useState } from 'react';
import { X, Copy, Check, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  scheduleId: string;
  userId: string;
  onClose: (completed: boolean) => void;
}

interface RungRow {
  id: string;
  rung: number;
  disclosure_domain: string;
  title: string;
  script_draft: string;
  ask: string | null;
  capability_unlocked_on_yes: string | null;
  hard_deadline: string;
  status: string;
}

export function DisclosureExecuteModal({ scheduleId, userId, onClose }: Props) {
  const [rung, setRung] = useState<RungRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'draft' | 'response'>('draft');
  const [script, setScript] = useState('');
  const [response, setResponse] = useState<'accepted' | 'rejected' | 'deferred' | null>(null);
  const [ginaWords, setGinaWords] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('gina_disclosure_schedule')
        .select('*')
        .eq('id', scheduleId)
        .maybeSingle();
      if (data) {
        setRung(data as unknown as RungRow);
        setScript((data as { script_draft: string }).script_draft);
      }
      setLoading(false);
    })();
  }, [scheduleId]);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy:', script);
    }
  };

  const smsScript = () => {
    const encoded = encodeURIComponent(script);
    window.location.href = `sms:?body=${encoded}`;
  };

  const submit = async () => {
    if (!rung || !response) return;
    setSubmitting(true);
    try {
      const statusMap = {
        accepted: 'gina_accepted',
        rejected: 'gina_rejected',
        deferred: 'gina_deferred',
      };

      await supabase
        .from('gina_disclosure_schedule')
        .update({
          status: statusMap[response],
          disclosed_at: new Date().toISOString(),
          gina_response: response,
          gina_response_at: new Date().toISOString(),
          gina_exact_words: ginaWords || null,
        })
        .eq('id', rung.id);

      // If accepted + capability on yes → create grant
      if (response === 'accepted' && rung.capability_unlocked_on_yes) {
        await supabase.from('gina_capability_grants').insert({
          user_id: userId,
          capability: rung.capability_unlocked_on_yes,
          granted_via_disclosure_id: rung.id,
          granted_exact_words: ginaWords || null,
          active: true,
        });
      }

      // Always log Gina's words to handler_memory for future reference
      if (ginaWords && ginaWords.trim().length > 0) {
        await supabase.from('handler_memory').insert({
          user_id: userId,
          memory_type: 'gina_context',
          content: `Rung ${rung.rung} (${rung.disclosure_domain}) disclosure — Gina's response [${response}]: "${ginaWords.slice(0, 500)}"`,
          importance: response === 'accepted' ? 4 : 3,
          source_type: 'gina_disclosure',
          source_id: rung.id,
        });
      }

      onClose(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!rung) return null;

  const deadline = new Date(rung.hard_deadline);
  const daysUntil = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
  const overdue = daysUntil < 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center overflow-y-auto">
      <div className="max-w-lg w-full bg-protocol-surface border border-pink-500/40 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded bg-pink-900/40 text-pink-300">Rung {rung.rung}</span>
              <span className="text-xs text-gray-500">{rung.disclosure_domain}</span>
              {overdue && <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-300">OVERDUE</span>}
              {!overdue && daysUntil <= 3 && <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300">IMMINENT</span>}
            </div>
            <h2 className="text-lg font-semibold text-white">{rung.title}</h2>
            <p className="text-xs text-gray-400 mt-1">
              Deadline {rung.hard_deadline} ({overdue ? `${-daysUntil}d past` : `${daysUntil}d`})
              {rung.capability_unlocked_on_yes && ` · unlocks: ${rung.capability_unlocked_on_yes}`}
            </p>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {phase === 'draft' && (
          <>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Script (edit as needed)</label>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                rows={5}
                className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
              />
            </div>

            {rung.ask && (
              <div className="p-3 rounded-lg border border-pink-500/30 bg-pink-950/20">
                <div className="text-xs text-pink-300 uppercase mb-1">The ask</div>
                <div className="text-sm text-pink-100">{rung.ask}</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyScript}
                className="py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm flex items-center justify-center gap-2"
              >
                {copied ? <><Check className="w-4 h-4" /> copied</> : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
              <button
                onClick={smsScript}
                className="py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" /> SMS
              </button>
            </div>

            <button
              onClick={() => setPhase('response')}
              className="w-full py-3 rounded-xl bg-pink-600 text-white font-semibold"
            >
              I said it → log her response
            </button>
          </>
        )}

        {phase === 'response' && (
          <>
            <div className="p-3 rounded-lg border border-protocol-border bg-gray-900/50">
              <div className="text-xs text-gray-400 uppercase mb-1">You said</div>
              <div className="text-sm text-gray-200 italic">"{script}"</div>
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Her response</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button
                  onClick={() => setResponse('accepted')}
                  className={`py-2 rounded-lg text-sm font-semibold ${response === 'accepted' ? 'bg-green-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
                >
                  Accepted
                </button>
                <button
                  onClick={() => setResponse('deferred')}
                  className={`py-2 rounded-lg text-sm font-semibold ${response === 'deferred' ? 'bg-amber-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
                >
                  Deferred
                </button>
                <button
                  onClick={() => setResponse('rejected')}
                  className={`py-2 rounded-lg text-sm font-semibold ${response === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
                >
                  Rejected
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Her exact words (Handler memory)</label>
              <textarea
                value={ginaWords}
                onChange={e => setGinaWords(e.target.value)}
                rows={3}
                placeholder="What did she actually say? Even a partial quote."
                className="w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPhase('draft')}
                disabled={submitting}
                className="py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm"
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={!response || submitting}
                className="py-2 rounded-lg bg-pink-600 text-white font-semibold disabled:bg-gray-700"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Log & close'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
