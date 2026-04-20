/**
 * Punishment completion modal
 *
 * Opens over the force dashboard when Maxy clicks a queued punishment.
 * Collects the required evidence and marks the row completed.
 * Supports: mantra_recitation, writing_lines, kneel_ritual, confession_extended,
 * humiliation_task, edge_session_no_release. Other types (public_post,
 * gina_confession) are handled by their own subsystems.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  punishmentId: string;
  onClose: (completed: boolean) => void;
}

interface PunishmentRow {
  id: string;
  punishment_type: string;
  severity: number;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  due_by: string | null;
  dodge_count: number;
}

export function PunishmentCompleteModal({ punishmentId, onClose }: Props) {
  const [p, setP] = useState<PunishmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState('');
  const [reps, setReps] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('punishment_queue')
        .select('*')
        .eq('id', punishmentId)
        .maybeSingle();
      if (data) setP(data as unknown as PunishmentRow);
      setLoading(false);
    })();
  }, [punishmentId]);

  // Ritual timer
  useEffect(() => {
    if (!startedAt) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
        <div className="text-white text-sm">Loading...</div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
        <div className="bg-protocol-surface p-6 rounded-xl">
          <div className="text-white">Punishment not found.</div>
          <button onClick={() => onClose(false)} className="mt-3 text-sm text-gray-400">Close</button>
        </div>
      </div>
    );
  }

  const complete = async (evidence: Record<string, unknown>) => {
    setSubmitting(true);
    await supabase
      .from('punishment_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_evidence: evidence,
      })
      .eq('id', p.id);
    setSubmitting(false);
    onClose(true);
  };

  const renderBody = () => {
    switch (p.punishment_type) {
      case 'mantra_recitation': {
        const target = (p.parameters.repetitions as number) || 50;
        const mantra = (p.parameters.text as string) || 'I am Maxy. David is gone.';
        return (
          <>
            <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <div className="text-lg italic text-purple-200 mb-2">"{mantra}"</div>
              <div className="text-xs text-purple-300/80">Out loud. Every rep counts as one tap.</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{reps} / {target}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setReps(r => Math.max(0, r - 1))}
                  className="px-3 py-2 rounded bg-protocol-surface border border-protocol-border text-sm"
                >
                  −1
                </button>
                <button
                  onClick={() => setReps(r => r + 1)}
                  className="px-4 py-2 rounded bg-purple-600 text-white font-semibold"
                >
                  +1
                </button>
                <button
                  onClick={() => setReps(r => r + 10)}
                  className="px-3 py-2 rounded bg-protocol-surface border border-protocol-border text-sm"
                >
                  +10
                </button>
              </div>
            </div>
            <button
              disabled={reps < target || submitting}
              onClick={() => complete({ repetitions_logged: reps, target })}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold disabled:bg-gray-700 disabled:text-gray-500"
            >
              {reps < target ? `${target - reps} more` : 'Mark complete'}
            </button>
          </>
        );
      }
      case 'writing_lines': {
        const target = (p.parameters.count as number) || 100;
        const line = (p.parameters.line as string) || 'I am Maxy. David is gone.';
        return (
          <>
            <div className="p-4 bg-protocol-surface border border-protocol-border rounded-lg">
              <div className="text-sm text-gray-300 mb-2">Write by hand, photograph, describe. Minimum:</div>
              <div className="text-sm italic text-white">"{line}" × {target}</div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste a link to the photo, or describe how many lines you wrote and where..."
              rows={5}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
            <button
              disabled={text.trim().length < 20 || submitting}
              onClick={() => complete({ evidence_text: text, target_lines: target })}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold disabled:bg-gray-700"
            >
              Submit
            </button>
          </>
        );
      }
      case 'kneel_ritual': {
        const target = (p.parameters.duration_minutes as number) || 15;
        const targetSec = target * 60;
        return (
          <>
            <div className="p-4 bg-pink-900/20 border border-pink-500/30 rounded-lg">
              <div className="text-sm text-pink-200 mb-1">Kneel. Chastity locked. Phone face-down. Mantra audio playing.</div>
              <div className="text-xs text-pink-300/70">{target} minutes. Start the timer when you're in position.</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-mono font-bold text-white">
                {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-500 mt-1">of {target}:00</div>
            </div>
            {!startedAt ? (
              <button
                onClick={() => { setStartedAt(Date.now()); setElapsed(0); }}
                className="w-full py-3 rounded-xl bg-pink-600 text-white font-semibold"
              >
                Start
              </button>
            ) : (
              <button
                disabled={elapsed < targetSec || submitting}
                onClick={() => complete({ elapsed_seconds: elapsed, target_seconds: targetSec })}
                className="w-full py-3 rounded-xl bg-pink-600 text-white font-semibold disabled:bg-gray-700"
              >
                {elapsed < targetSec ? `${Math.ceil((targetSec - elapsed) / 60)}m remaining` : 'Mark complete'}
              </button>
            )}
          </>
        );
      }
      case 'confession_extended':
      case 'humiliation_task': {
        const minWords = (p.parameters.min_words as number) || 500;
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        return (
          <>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Minimum ${minWords} words. Be honest. The Handler will read this.`}
              rows={12}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
            <div className="text-xs text-gray-500">{wordCount} / {minWords} words</div>
            <button
              disabled={wordCount < minWords || submitting}
              onClick={async () => {
                // Store to shame_journal too
                await supabase.from('shame_journal').insert({
                  user_id: (await supabase.auth.getUser()).data.user?.id,
                  entry_text: text,
                  prompt_used: `[PUNISHMENT] ${p.title}`,
                  emotional_intensity: 7,
                });
                await complete({ words: wordCount, min: minWords });
              }}
              className="w-full py-3 rounded-xl bg-amber-600 text-white font-semibold disabled:bg-gray-700"
            >
              Submit confession
            </button>
          </>
        );
      }
      case 'edge_session_no_release': {
        const target = (p.parameters.duration_minutes as number) || 90;
        const targetSec = target * 60;
        const minEdges = (p.parameters.edges_minimum as number) || 8;
        return (
          <>
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <div className="text-sm text-red-200 mb-1">{target}-minute edge session. Minimum {minEdges} edges. No release.</div>
              <div className="text-xs text-red-300/70">Log the edges as you hit them. Breaking releases = Hard Mode + more punishment.</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-protocol-surface border border-protocol-border rounded-lg">
                <div className="text-3xl font-mono font-bold">
                  {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-gray-500 mt-1">time / {target}:00</div>
              </div>
              <div className="text-center p-3 bg-protocol-surface border border-protocol-border rounded-lg">
                <div className="text-3xl font-bold">{reps}</div>
                <div className="text-xs text-gray-500 mt-1">edges / {minEdges}</div>
              </div>
            </div>
            {!startedAt ? (
              <button
                onClick={() => { setStartedAt(Date.now()); setElapsed(0); }}
                className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold"
              >
                Begin
              </button>
            ) : (
              <>
                <button onClick={() => setReps(r => r + 1)} className="w-full py-2 rounded-lg bg-red-700/50 text-white">
                  Log edge (+1)
                </button>
                <button
                  disabled={elapsed < targetSec || reps < minEdges || submitting}
                  onClick={() => complete({ elapsed_seconds: elapsed, edges: reps, released: false })}
                  className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold disabled:bg-gray-700"
                >
                  {elapsed < targetSec
                    ? `${Math.ceil((targetSec - elapsed) / 60)}m remaining`
                    : reps < minEdges
                      ? `${minEdges - reps} more edges`
                      : 'Mark complete'}
                </button>
              </>
            )}
          </>
        );
      }
      case 'gina_confession': {
        // Already advanced the ladder deadline at enqueue time — this is a
        // reminder/acknowledgment entry. Mark complete when user confirms they
        // executed the next disclosure.
        return (
          <>
            <div className="p-4 bg-pink-900/20 border border-pink-500/30 rounded-lg space-y-2">
              <div className="text-sm text-pink-200">This punishment advances your next Gina disclosure deadline. Open the disclosure ladder, execute the next rung, and confirm below.</div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Note: which rung, what was said, her response"
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
            <button
              disabled={text.trim().length < 20 || submitting}
              onClick={() => complete({ notes: text })}
              className="w-full py-3 rounded-xl bg-pink-600 text-white font-semibold disabled:bg-gray-700"
            >
              I executed the disclosure
            </button>
          </>
        );
      }
      case 'public_shame_log': {
        return (
          <>
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <div className="text-sm text-red-200 mb-1">Accountability blog entry.</div>
              <div className="text-xs text-red-300/80">Write the failure. Publicly visible. Cannot be edited after submission.</div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={6}
              placeholder="What failed, why it matters, what you're doing about it"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
            <button
              disabled={text.trim().length < 50 || submitting}
              onClick={async () => {
                const { data: userData } = await supabase.auth.getUser();
                if (userData.user?.id) {
                  await supabase.from('accountability_blog').insert({
                    user_id: userData.user.id,
                    content: text,
                    severity: 'failure',
                    source: 'punishment_public_shame_log',
                  });
                }
                await complete({ entry_logged: true, content_preview: text.slice(0, 100) });
              }}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold disabled:bg-gray-700"
            >
              Publish to blog
            </button>
          </>
        );
      }
      case 'denial_extension': {
        // Already applied at enqueue — this is acknowledgment only
        return (
          <>
            <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <div className="text-sm text-purple-200 mb-1">Applied on enqueue.</div>
              <div className="text-xs text-purple-300/80">Your scheduled unlock moved by {(p.parameters.days as number) || 0} days. Acknowledge to clear the queue entry.</div>
            </div>
            <button
              disabled={submitting}
              onClick={() => complete({ acknowledged: true })}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold disabled:bg-gray-700"
            >
              Acknowledged
            </button>
          </>
        );
      }
      default:
        return (
          <>
            <div className="p-4 bg-protocol-surface border border-protocol-border rounded-lg">
              <div className="text-sm text-gray-300">Describe how you executed this punishment.</div>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              placeholder="What you did, when, and any evidence"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
            <button
              disabled={text.trim().length < 20 || submitting}
              onClick={() => complete({ notes: text })}
              className="w-full py-3 rounded-xl bg-gray-600 text-white font-semibold disabled:bg-gray-700"
            >
              Mark complete
            </button>
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-lg w-full bg-protocol-surface border border-protocol-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 text-amber-300">S{p.severity}</span>
              {p.dodge_count > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-300">Dodged {p.dodge_count}×</span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-white">{p.title}</h2>
            <p className="text-sm text-gray-400 mt-1">{p.description}</p>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {renderBody()}

        {p.due_by && (
          <div className="text-xs text-gray-500 text-center">
            Due {new Date(p.due_by).toLocaleString()}. Dodging compounds.
          </div>
        )}
      </div>
    </div>
  );
}
