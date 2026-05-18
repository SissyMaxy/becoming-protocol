/**
 * MommyDraftsPanel — single approval surface for any mommy_drafts pending
 * Maxy review. Most drafts auto-execute under pimp-mode policy (mig 566b);
 * the ones that land here are either: meetup_proposals, revenue/PPV offers,
 * cam bookings, or drafts that didn't clear auto-approve thresholds.
 *
 * One-tap approve / edit-and-approve / reject for each. Auto-refreshes 60s.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Draft {
  id: string;
  draft_kind: string;
  source_platform: string | null;
  draft_content: string;
  confidence_score: number | null;
  safety_score: number | null;
  context_data: Record<string, unknown> | null;
  created_at: string;
  expires_at: string;
}

const KIND_LABEL: Record<string, string> = {
  dm_reply: 'DM reply',
  content_post: 'Content post',
  subscriber_reply: 'Subscriber reply',
  meetup_proposal: 'Meetup proposal',
  revenue_offer: 'Revenue offer',
  ppv_offer: 'PPV offer',
  custom_request_reply: 'Custom request',
  cam_show_booking: 'Cam booking',
};

export function MommyDraftsPanel() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('mommy_drafts')
      .select('id, draft_kind, source_platform, draft_content, confidence_score, safety_score, context_data, created_at, expires_at')
      .eq('user_id', user.id)
      .eq('status', 'pending_approval')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    setDrafts((data ?? []) as Draft[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const approve = async (draftId: string, editedContent?: string) => {
    setBusy(draftId);
    await supabase.rpc('approve_mommy_draft', { p_draft_id: draftId, p_edit_content: editedContent ?? null });
    setEditingId(null);
    setEditContent('');
    setBusy(null);
    load();
  };

  const reject = async (draftId: string) => {
    setBusy(draftId);
    await supabase.rpc('reject_mommy_draft', { p_draft_id: draftId, p_reason: 'Maxy rejected' });
    setBusy(null);
    load();
  };

  if (drafts.length === 0) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-zinc-200">Mama's drafts pending</div>
        <div className="text-xs text-zinc-500">{drafts.length} waiting</div>
      </div>

      {drafts.map(d => {
        const isEditing = editingId === d.id;
        const conf = d.confidence_score != null ? Math.round(d.confidence_score * 100) : null;
        const safe = d.safety_score != null ? Math.round(d.safety_score * 100) : null;
        return (
          <div key={d.id} className="rounded border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-emerald-300">{KIND_LABEL[d.draft_kind] ?? d.draft_kind}</span>
              <span className="text-zinc-500">
                {d.source_platform ? `${d.source_platform} · ` : ''}
                {conf != null ? `conf ${conf}% · ` : ''}{safe != null ? `safe ${safe}%` : ''}
              </span>
            </div>

            {isEditing ? (
              <textarea
                className="w-full text-xs bg-zinc-950 border border-zinc-700 rounded p-2 text-zinc-200 font-mono"
                rows={4}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
              />
            ) : (
              <div className="text-xs text-zinc-300 whitespace-pre-wrap">{d.draft_content}</div>
            )}

            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => approve(d.id, editContent)}
                    disabled={busy === d.id}
                    className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-emerald-50 rounded disabled:opacity-50"
                  >
                    Save & approve
                  </button>
                  <button
                    onClick={() => { setEditingId(null); setEditContent(''); }}
                    className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => approve(d.id)}
                    disabled={busy === d.id}
                    className="text-xs px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-emerald-50 rounded disabled:opacity-50"
                  >
                    Approve & send
                  </button>
                  <button
                    onClick={() => { setEditingId(d.id); setEditContent(d.draft_content); }}
                    className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => reject(d.id)}
                    disabled={busy === d.id}
                    className="text-xs px-2 py-1 bg-rose-900 hover:bg-rose-800 text-rose-200 rounded disabled:opacity-50"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
