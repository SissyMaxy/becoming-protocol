// /community/queue — pending review drafts.
//
// One card per draft. Each shows: community name, platform, tone notes,
// the AI-generated title + body in editable textareas, and four actions:
//   - Approve  (sets status='approved'; auto_submit cron picks it up if enabled)
//   - Edit     (saves the user's edits in user_edits_jsonb, stays pending_review)
//   - Reject   (status='rejected')
//   - Submit now (Reddit only — bypasses cron, fires submit immediately)
//   - Mark posted manually (FetLife/Discord — user already pasted it elsewhere)

import { useState } from 'react';
import { Loader2, Check, X, Edit3, Send, ExternalLink } from 'lucide-react';
import { useOutreach, type OutreachDraft } from '../../hooks/useOutreach';

export function CommunityQueue({ onBack }: { onBack: () => void }) {
  const { drafts, isLoading, isSaving, draftAction } = useOutreach();

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text"
      >
        &larr; Back
      </button>
      <h1 className="text-2xl font-semibold text-protocol-text mb-1">Outreach queue</h1>
      <p className="text-sm text-protocol-text-muted mb-6">
        Drafts waiting on your review. Approved drafts auto-submit only for
        communities where you've turned auto-submit on.
      </p>

      {drafts.length === 0 ? (
        <div className="text-sm text-protocol-text-muted bg-protocol-surface border border-protocol-border rounded-xl p-6 text-center">
          Nothing pending. The drafter runs daily and only generates posts when you have
          fresh journal entries or recent state changes — write some context and check back tomorrow.
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} disabled={isSaving} onAction={draftAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraftCard(props: {
  draft: OutreachDraft;
  disabled: boolean;
  onAction: ReturnType<typeof useOutreach>['draftAction'];
}) {
  const { draft, disabled, onAction } = props;
  const [title, setTitle] = useState(draft.title || '');
  const [body, setBody] = useState(draft.body_markdown);
  const [edited, setEdited] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [showManualPosted, setShowManualPosted] = useState(false);

  const community = draft.outreach_communities;
  const isReddit = community?.platform === 'reddit';

  return (
    <div className="bg-protocol-surface border border-protocol-border rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-protocol-text">
            {community?.display_name || 'Unknown community'}
          </p>
          <p className="text-xs text-protocol-text-muted capitalize">
            {community?.platform || '—'} · self-promo: {community?.self_promo_policy?.replace(/_/g, ' ')}
          </p>
        </div>
        <span className="text-xs text-protocol-text-muted">{draft.kind}</span>
      </div>

      <input
        type="text"
        value={title}
        disabled={disabled}
        onChange={(e) => { setTitle(e.target.value); setEdited(true); }}
        className="w-full px-3 py-2 rounded-lg bg-protocol-bg border border-protocol-border text-sm font-medium text-protocol-text"
        placeholder="Title"
      />

      <textarea
        value={body}
        disabled={disabled}
        rows={Math.min(20, Math.max(6, body.split('\n').length + 1))}
        onChange={(e) => { setBody(e.target.value); setEdited(true); }}
        className="w-full px-3 py-2 rounded-lg bg-protocol-bg border border-protocol-border text-sm text-protocol-text font-mono"
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onAction({ draft_id: draft.id, action: 'approve' })}
          disabled={disabled || edited}
          title={edited ? 'Save your edits first' : 'Approve for submission'}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-900/30 text-green-300 hover:bg-green-900/50 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Check className="w-4 h-4" /> Approve
        </button>

        <button
          onClick={async () => {
            await onAction({
              draft_id: draft.id, action: 'edit',
              title, body_markdown: body,
            });
            setEdited(false);
          }}
          disabled={disabled || !edited}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-protocol-accent/20 text-protocol-accent hover:bg-protocol-accent/30 disabled:opacity-50 flex items-center gap-1.5"
        >
          <Edit3 className="w-4 h-4" /> Save edits
        </button>

        <button
          onClick={() => onAction({ draft_id: draft.id, action: 'reject' })}
          disabled={disabled}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-900/20 text-red-400 hover:bg-red-900/30 disabled:opacity-50 flex items-center gap-1.5"
        >
          <X className="w-4 h-4" /> Reject
        </button>

        {isReddit && (
          <button
            onClick={() => onAction({ draft_id: draft.id, action: 'submit_now' })}
            disabled={disabled || edited}
            title={edited ? 'Save your edits first' : 'Submit to Reddit immediately'}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 disabled:opacity-50 flex items-center gap-1.5 ml-auto"
          >
            <Send className="w-4 h-4" /> Submit now
          </button>
        )}

        {!isReddit && (
          <button
            onClick={() => setShowManualPosted((v) => !v)}
            disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-900/30 text-blue-300 hover:bg-blue-900/50 disabled:opacity-50 flex items-center gap-1.5 ml-auto"
          >
            <ExternalLink className="w-4 h-4" /> Mark posted manually
          </button>
        )}
      </div>

      {showManualPosted && (
        <div className="flex gap-2 pt-2 border-t border-protocol-border">
          <input
            type="text"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="URL of the posted thread (optional)"
            className="flex-1 px-3 py-1.5 rounded-lg bg-protocol-bg border border-protocol-border text-sm text-protocol-text"
          />
          <button
            onClick={async () => {
              await onAction({
                draft_id: draft.id,
                action: 'mark_posted_manually',
                submitted_url: manualUrl || undefined,
              });
              setShowManualPosted(false);
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
          >
            Mark posted
          </button>
        </div>
      )}
    </div>
  );
}
