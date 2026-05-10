// /community/list — communities Mommy considers for outreach.
//
// Two toggles per community:
//   - enabled              (Mommy may DRAFT for this community)
//   - auto_submit_enabled  (approved drafts auto-submit; Reddit only)
//
// Plus the engagement threshold a user must hit before auto-submit unlocks
// for that community. Free-tier "add manual community" form for FetLife
// groups + extra subreddits the seed list missed.

import { useState } from 'react';
import { Loader2, Plus, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useOutreach, type OutreachCommunity } from '../../hooks/useOutreach';

export function CommunityList({ onBack }: { onBack: () => void }) {
  const {
    reddit, communities, isLoading, isSaving,
    connectReddit, disconnectReddit,
    addCommunity, toggleCommunity, deleteCommunity,
  } = useOutreach();

  const [showAddForm, setShowAddForm] = useState(false);

  if (isLoading) {
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

      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold text-protocol-text">Communities</h1>
      </div>
      <p className="text-sm text-protocol-text-muted mb-6">
        Mommy considers these communities when generating posts. Auto-submit is OFF
        for every community by default — approved drafts only post automatically when you've turned it on.
      </p>

      {/* Reddit connection */}
      <div className="bg-protocol-surface border border-protocol-border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-protocol-text">Reddit</p>
            <p className="text-xs text-protocol-text-muted">
              {reddit.connected ? `Connected as u/${reddit.username || '—'}` : 'Not connected'}
            </p>
          </div>
          {reddit.connected ? (
            <button
              onClick={disconnectReddit}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-sm bg-red-900/20 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={connectReddit}
              className="px-3 py-1.5 rounded-lg text-sm bg-protocol-accent text-white hover:bg-protocol-accent-bright"
            >
              Connect
            </button>
          )}
        </div>
        {!reddit.connected && (
          <p className="text-xs text-protocol-text-muted mt-2">
            Without Reddit OAuth, drafts can still be generated for communities you add manually,
            but you'll have to copy/paste them yourself.
          </p>
        )}
      </div>

      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-sm bg-protocol-surface border border-protocol-border text-protocol-text hover:bg-protocol-bg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add community
        </button>
      </div>

      {showAddForm && (
        <AddCommunityForm
          disabled={isSaving}
          onSubmit={async (params) => {
            const ok = await addCommunity(params);
            if (ok) setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="space-y-3">
        {communities.length === 0 && (
          <div className="text-sm text-protocol-text-muted bg-protocol-surface border border-protocol-border rounded-xl p-6 text-center">
            No communities yet. Connect Reddit and the research cron will seed defaults,
            or add one manually.
          </div>
        )}
        {communities.map((c) => (
          <CommunityRow
            key={c.id}
            community={c}
            disabled={isSaving}
            onToggle={toggleCommunity}
            onDelete={deleteCommunity}
          />
        ))}
      </div>
    </div>
  );
}

function CommunityRow(props: {
  community: OutreachCommunity;
  disabled: boolean;
  onToggle: ReturnType<typeof useOutreach>['toggleCommunity'];
  onDelete: ReturnType<typeof useOutreach>['deleteCommunity'];
}) {
  const { community, disabled, onToggle, onDelete } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isReddit = community.platform === 'reddit';
  const isBanned = !!community.banned_at;

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${
      isBanned ? 'bg-red-900/10 border-red-900/30' : 'bg-protocol-surface border-protocol-border'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-protocol-text">{community.display_name}</p>
            <span className="text-xs text-protocol-text-muted capitalize">{community.platform}</span>
            {isBanned && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Banned
              </span>
            )}
          </div>
          {community.member_count != null && (
            <p className="text-xs text-protocol-text-muted">
              {community.member_count.toLocaleString()} members
            </p>
          )}
          {community.tone_notes && (
            <p className="text-xs text-protocol-text-muted mt-1 italic">{community.tone_notes}</p>
          )}
          <p className="text-xs text-protocol-text-muted mt-1">
            Self-promo: {community.self_promo_policy.replace(/_/g, ' ')} ·
            {' '}cadence: every {community.typical_post_cadence_days} days
            {community.last_researched_at && (
              <> · researched {new Date(community.last_researched_at).toLocaleDateString()}</>
            )}
          </p>
          {isBanned && community.banned_reason && (
            <p className="text-xs text-red-400 mt-1">{community.banned_reason.slice(0, 200)}</p>
          )}
        </div>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={disabled}
            className="text-protocol-text-muted hover:text-red-400 disabled:opacity-50"
            aria-label="Delete community"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={async () => {
                await onDelete(community.id);
                setConfirmDelete(false);
              }}
              disabled={disabled}
              className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={disabled}
              className="text-xs px-2 py-1 rounded bg-protocol-bg text-protocol-text-muted"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!isBanned && (
        <div className="space-y-2 pt-2 border-t border-protocol-border">
          <ToggleRow
            label="Enabled"
            description="Mommy may draft posts for this community."
            checked={community.enabled}
            disabled={disabled}
            onToggle={(v) => onToggle({ community_id: community.id, enabled: v })}
          />
          <ToggleRow
            label="Auto-submit"
            description={
              isReddit
                ? `Approved drafts post automatically. Requires ${community.min_engagement_before_post} comments/upvotes logged here first.`
                : 'Auto-submit is Reddit-only. Drafts for this platform are always copy-paste.'
            }
            checked={community.auto_submit_enabled}
            disabled={disabled || !isReddit || !community.enabled}
            onToggle={(v) => onToggle({ community_id: community.id, auto_submit_enabled: v })}
          />
          {isReddit && community.auto_submit_enabled && (
            <div className="flex items-center gap-2 pl-6">
              <label className="text-xs text-protocol-text-muted">
                Engagement before first auto-post:
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={community.min_engagement_before_post}
                disabled={disabled}
                onChange={(e) =>
                  onToggle({
                    community_id: community.id,
                    min_engagement_before_post: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-16 px-2 py-1 text-xs rounded bg-protocol-bg border border-protocol-border text-protocol-text"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onToggle(e.target.checked)}
        className="mt-1"
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-protocol-text">{props.label}</p>
        <p className="text-xs text-protocol-text-muted">{props.description}</p>
      </div>
    </label>
  );
}

function AddCommunityForm(props: {
  disabled: boolean;
  onSubmit: (params: {
    platform: 'reddit' | 'fetlife' | 'discord';
    slug: string;
    display_name: string;
    tone_notes?: string;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [platform, setPlatform] = useState<'reddit' | 'fetlife' | 'discord'>('fetlife');
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [toneNotes, setToneNotes] = useState('');

  return (
    <div className="bg-protocol-surface border border-protocol-border rounded-xl p-4 mb-3 space-y-3">
      <div className="flex gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as 'reddit' | 'fetlife' | 'discord')}
          disabled={props.disabled}
          className="px-2 py-1 rounded bg-protocol-bg border border-protocol-border text-sm text-protocol-text"
        >
          <option value="fetlife">FetLife</option>
          <option value="reddit">Reddit</option>
          <option value="discord">Discord</option>
        </select>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={platform === 'reddit' ? 'subreddit (no r/)' : 'group slug'}
          className="flex-1 px-2 py-1 rounded bg-protocol-bg border border-protocol-border text-sm text-protocol-text"
        />
      </div>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="Display name"
        className="w-full px-2 py-1 rounded bg-protocol-bg border border-protocol-border text-sm text-protocol-text"
      />
      <textarea
        value={toneNotes}
        onChange={(e) => setToneNotes(e.target.value)}
        placeholder="Tone notes (optional) — e.g. 'long-form journals', 'no kink'"
        rows={2}
        className="w-full px-2 py-1 rounded bg-protocol-bg border border-protocol-border text-sm text-protocol-text"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={props.onCancel}
          disabled={props.disabled}
          className="px-3 py-1.5 rounded-lg text-sm text-protocol-text-muted hover:text-protocol-text"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (slug && displayName) {
              props.onSubmit({ platform, slug, display_name: displayName, tone_notes: toneNotes });
            }
          }}
          disabled={props.disabled || !slug || !displayName}
          className="px-3 py-1.5 rounded-lg text-sm bg-protocol-accent text-white hover:bg-protocol-accent-bright disabled:opacity-50 flex items-center gap-1.5"
        >
          {props.disabled ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>
    </div>
  );
}
