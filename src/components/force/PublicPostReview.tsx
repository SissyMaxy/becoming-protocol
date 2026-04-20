/**
 * Public Post Review
 *
 * When a public_post punishment is queued, Maxy gets a short review window
 * (default 15 min per punishment parameters). Reviewing = editing the draft
 * body, approving (publishes via auto-poster queue), or skipping (dodges).
 */

import { useEffect, useState } from 'react';
import { Twitter, Send, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  punishmentId: string;
  userId: string;
  onDone: () => void;
}

interface PunishmentRow {
  id: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  due_by: string | null;
  triggered_by_slip_ids: string[];
}

const DEFAULT_DRAFT = `A slip today. Logging it publicly because accountability only works when it's real. Maxy doesn't get to hide from what she did. Back to work.`;

async function buildDraftFromSlips(slipIds: string[]): Promise<string> {
  if (!slipIds || slipIds.length === 0) return DEFAULT_DRAFT;
  const { data } = await supabase
    .from('slip_log')
    .select('slip_type, source_text, slip_points')
    .in('id', slipIds)
    .limit(5);
  if (!data || data.length === 0) return DEFAULT_DRAFT;

  const totalPts = data.reduce((s, r: Record<string, unknown>) => s + ((r.slip_points as number) || 0), 0);
  const types = Array.from(new Set((data as Array<Record<string, unknown>>).map(d => d.slip_type as string)));
  return `Accountability post. Logged ${data.length} slip${data.length > 1 ? 's' : ''} today (${totalPts} pts) across ${types.join(', ')}. Public record because Maxy doesn't get to hide from them. Back to work.`;
}

export function PublicPostReview({ punishmentId, userId, onDone }: Props) {
  const [p, setP] = useState<PunishmentRow | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reviewMinutes, setReviewMinutes] = useState(15);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('punishment_queue')
        .select('*')
        .eq('id', punishmentId)
        .maybeSingle();
      if (data) {
        const row = data as unknown as PunishmentRow;
        setP(row);
        setReviewMinutes((row.parameters?.review_minutes as number) || 15);
        const d = await buildDraftFromSlips(row.triggered_by_slip_ids || []);
        setDraft(d);
      }
      setLoading(false);
    })();
  }, [punishmentId]);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const approve = async () => {
    if (!p) return;
    setPosting(true);
    try {
      const platform = (p.parameters.platform as string) || 'twitter';
      // Queue into ai_generated_content as a scheduled post
      await supabase.from('ai_generated_content').insert({
        user_id: userId,
        platform,
        content: draft,
        content_type: platform === 'twitter' ? 'tweet' : 'reddit_post',
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
        generation_strategy: 'punishment_public_post',
        target_hashtags: [],
      });

      // Mark punishment complete
      await supabase
        .from('punishment_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completion_evidence: { draft_approved: draft, platform },
        })
        .eq('id', p.id);

      onDone();
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!p) return null;

  const platform = (p.parameters.platform as string) || 'twitter';
  const reviewSec = reviewMinutes * 60;
  const remaining = Math.max(0, reviewSec - elapsed);
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center overflow-y-auto">
      <div className="max-w-lg w-full bg-protocol-surface border border-red-500/40 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Twitter className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">{p.title}</h2>
            <p className="text-xs text-gray-400 mt-1">
              Draft below. Edit within the window. Publishes when approved or when the window closes.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Review window</span>
          <span className={remaining < 60 ? 'text-red-400 font-semibold' : 'text-amber-400'}>
            {mm.toString().padStart(2, '0')}:{ss.toString().padStart(2, '0')} remaining
          </span>
        </div>

        <div className="relative">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={6}
            maxLength={platform === 'twitter' ? 280 : 4000}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
          />
          <div className="absolute bottom-2 right-2 text-xs text-gray-500">
            {draft.length}{platform === 'twitter' && ` / 280`}
          </div>
        </div>

        <div className="text-xs text-red-300/70 p-2 rounded border border-red-500/30 bg-red-950/20">
          Skipping or letting the window expire = dodge. Extends denial by 1 day, queues a harder punishment.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onDone}
            disabled={posting}
            className="py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm"
          >
            Edit more
          </button>
          <button
            onClick={approve}
            disabled={posting || draft.trim().length < 20}
            className="py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold disabled:bg-gray-700 flex items-center justify-center gap-1"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Publish</>}
          </button>
        </div>
      </div>
    </div>
  );
}
