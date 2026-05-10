// /community/log — submission + engagement history.
//
// Two columns / sections:
//   - Submitted posts (status='submitted' or 'failed') with link out to the
//     thread, plus any submission errors.
//   - Engagement events (manual logs of comments/upvotes/replies the user
//     made themselves — Mommy never auto-engages).

import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, AlertCircle, CheckCircle2, MessageSquare } from 'lucide-react';
import { useOutreach, type OutreachDraft } from '../../hooks/useOutreach';
import { supabase } from '../../lib/supabase';

type LogDraft = OutreachDraft;

async function authedFetch(path: string, init: RequestInit = {}) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('not authenticated');
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export function CommunityLog({ onBack }: { onBack: () => void }) {
  const { engagement, isLoading } = useOutreach();
  const [history, setHistory] = useState<LogDraft[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const submitted = await authedFetch('/api/outreach/drafts?status=submitted').then((r) => r.json()).catch(() => ({ drafts: [] }));
      const failed = await authedFetch('/api/outreach/drafts?status=failed').then((r) => r.json()).catch(() => ({ drafts: [] }));
      if (cancelled) return;
      const merged: LogDraft[] = [...(submitted.drafts || []), ...(failed.drafts || [])];
      merged.sort((a, b) => {
        const aT = a.submitted_at || a.created_at;
        const bT = b.submitted_at || b.created_at;
        return bT.localeCompare(aT);
      });
      setHistory(merged);
      setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoading || historyLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={onBack} className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text">
        &larr; Back
      </button>
      <h1 className="text-2xl font-semibold text-protocol-text mb-6">Outreach log</h1>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-protocol-text uppercase tracking-wider mb-3">
          Submissions
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-protocol-text-muted">No submissions yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((d) => (
              <div
                key={d.id}
                className={`border rounded-lg p-3 text-sm ${
                  d.status === 'failed'
                    ? 'bg-red-900/10 border-red-900/30'
                    : 'bg-protocol-surface border-protocol-border'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {d.status === 'failed'
                      ? <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      : <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-protocol-text truncate">
                        {d.title || '(no title)'}
                      </p>
                      <p className="text-xs text-protocol-text-muted">
                        {d.outreach_communities?.display_name || 'Unknown'} ·{' '}
                        {d.submitted_at
                          ? new Date(d.submitted_at).toLocaleString()
                          : new Date(d.created_at).toLocaleString()}
                      </p>
                      {d.submission_error && (
                        <p className="text-xs text-red-400 mt-1">{d.submission_error.slice(0, 300)}</p>
                      )}
                    </div>
                  </div>
                  {d.submitted_url && (
                    <a
                      href={d.submitted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-protocol-accent hover:text-protocol-accent-bright"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-protocol-text uppercase tracking-wider mb-3">
          Engagement
        </h2>
        <p className="text-xs text-protocol-text-muted mb-3">
          Comments, upvotes, and replies you've logged manually. Mommy never auto-engages —
          this is a record of the work you did.
        </p>
        {engagement.length === 0 ? (
          <p className="text-sm text-protocol-text-muted">Nothing logged yet.</p>
        ) : (
          <div className="space-y-2">
            {engagement.map((e) => (
              <div
                key={e.id}
                className="bg-protocol-surface border border-protocol-border rounded-lg p-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-protocol-text-muted flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-protocol-text">
                      <span className="capitalize">{e.kind.replace(/_/g, ' ')}</span>
                      {' on '}
                      <span className="text-protocol-text-muted">
                        {e.outreach_communities?.display_name || 'unknown'}
                      </span>
                    </p>
                    {e.note && <p className="text-xs text-protocol-text-muted mt-1">{e.note}</p>}
                    <p className="text-xs text-protocol-text-muted mt-1">
                      {new Date(e.created_at).toLocaleString()}
                    </p>
                  </div>
                  {e.target_url && (
                    <a
                      href={e.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-protocol-accent hover:text-protocol-accent-bright"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
