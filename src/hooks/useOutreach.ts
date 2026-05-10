// useOutreach — client hook for the community-outreach engine.
//
// Mirrors useCalendar's shape: status (Reddit connected?), connect / disconnect,
// communities + drafts + engagement + the actions to mutate them.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface RedditStatus {
  connected: boolean;
  username?: string;
  connected_at?: string;
}

export interface OutreachCommunity {
  id: string;
  platform: 'reddit' | 'fetlife' | 'discord';
  slug: string;
  display_name: string;
  member_count: number | null;
  posting_rules_summary: string | null;
  self_promo_policy: 'banned' | 'restricted' | 'allowed_with_engagement' | 'freely_allowed';
  tone_notes: string | null;
  typical_post_cadence_days: number;
  last_researched_at: string | null;
  last_post_at: string | null;
  last_engagement_at: string | null;
  enabled: boolean;
  auto_submit_enabled: boolean;
  min_engagement_before_post: number;
  banned_at: string | null;
  banned_reason: string | null;
}

export interface OutreachDraft {
  id: string;
  community_id: string;
  kind: 'journal' | 'discussion' | 'question' | 'project_share';
  title: string | null;
  body_markdown: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'submitted' | 'failed';
  user_edits_jsonb: Record<string, unknown> | null;
  submitted_at: string | null;
  submitted_url: string | null;
  submission_error: string | null;
  generation_context: Record<string, unknown> | null;
  created_at: string;
  outreach_communities?: {
    slug: string;
    display_name: string;
    platform: string;
    self_promo_policy: string;
  };
}

export interface OutreachEngagement {
  id: string;
  community_id: string;
  draft_id: string | null;
  kind: 'comment' | 'upvote' | 'view' | 'reply_received';
  target_url: string | null;
  note: string | null;
  actor: 'mommy' | 'user_manual';
  created_at: string;
  outreach_communities?: { slug: string; display_name: string; platform: string };
}

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

export function useOutreach() {
  const { user } = useAuth();
  const [reddit, setReddit] = useState<RedditStatus>({ connected: false });
  const [communities, setCommunities] = useState<OutreachCommunity[]>([]);
  const [drafts, setDrafts] = useState<OutreachDraft[]>([]);
  const [engagement, setEngagement] = useState<OutreachEngagement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    try {
      const [statusRes, commRes, draftRes, engRes] = await Promise.all([
        authedFetch('/api/outreach/status'),
        authedFetch('/api/outreach/communities'),
        authedFetch('/api/outreach/drafts?status=pending_review'),
        authedFetch('/api/outreach/engagement'),
      ]);
      if (statusRes.ok) {
        const j = await statusRes.json();
        setReddit(j.reddit || { connected: false });
      }
      if (commRes.ok) {
        const j = await commRes.json();
        setCommunities(j.communities || []);
      }
      if (draftRes.ok) {
        const j = await draftRes.json();
        setDrafts(j.drafts || []);
      }
      if (engRes.ok) {
        const j = await engRes.json();
        setEngagement(j.engagement || []);
      }
    } catch (err) {
      console.warn('[useOutreach] reload failed:', (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  // Pick up the OAuth return-trip query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reddit') === 'connected') {
      reload();
      // Preserve any hash (e.g. #/community/list) so the user lands where
      // they started. Just strip the ?reddit= query param.
      const hash = window.location.hash;
      window.history.replaceState({}, '', window.location.pathname + hash);
    } else if (params.get('reddit') === 'error') {
      console.warn('[useOutreach] reddit OAuth error:', params.get('reason'));
      const hash = window.location.hash;
      window.history.replaceState({}, '', window.location.pathname + hash);
    }
  }, [reload]);

  const connectReddit = useCallback(() => {
    if (!user?.id) return;
    window.location.href = `/api/outreach/auth-reddit?user_id=${user.id}`;
  }, [user?.id]);

  const disconnectReddit = useCallback(async () => {
    if (!user?.id) return;
    setIsSaving(true);
    try {
      await authedFetch('/api/outreach/revoke-reddit', { method: 'POST' });
      setReddit({ connected: false });
    } finally {
      setIsSaving(false);
    }
  }, [user?.id]);

  const addCommunity = useCallback(async (params: {
    platform: 'reddit' | 'fetlife' | 'discord';
    slug: string;
    display_name: string;
    tone_notes?: string;
  }) => {
    setIsSaving(true);
    try {
      const res = await authedFetch('/api/outreach/communities', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (res.ok) await reload();
      return res.ok;
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const toggleCommunity = useCallback(async (params: {
    community_id: string;
    enabled?: boolean;
    auto_submit_enabled?: boolean;
    min_engagement_before_post?: number;
  }) => {
    setIsSaving(true);
    try {
      const res = await authedFetch('/api/outreach/community-toggle', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (res.ok) await reload();
      return res.ok;
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const deleteCommunity = useCallback(async (community_id: string) => {
    setIsSaving(true);
    try {
      const res = await authedFetch('/api/outreach/community-delete', {
        method: 'POST',
        body: JSON.stringify({ community_id }),
      });
      if (res.ok) await reload();
      return res.ok;
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const draftAction = useCallback(async (params: {
    draft_id: string;
    action: 'approve' | 'reject' | 'edit' | 'submit_now' | 'mark_posted_manually';
    title?: string;
    body_markdown?: string;
    submitted_url?: string;
  }) => {
    setIsSaving(true);
    try {
      const res = await authedFetch('/api/outreach/draft-action', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (res.ok) await reload();
      return res.ok;
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  const logEngagement = useCallback(async (params: {
    community_id: string;
    kind: 'comment' | 'upvote' | 'view' | 'reply_received';
    target_url?: string;
    note?: string;
  }) => {
    setIsSaving(true);
    try {
      const res = await authedFetch('/api/outreach/engagement', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (res.ok) await reload();
      return res.ok;
    } finally {
      setIsSaving(false);
    }
  }, [reload]);

  return {
    reddit,
    communities,
    drafts,
    engagement,
    isLoading,
    isSaving,
    reload,
    connectReddit,
    disconnectReddit,
    addCommunity,
    toggleCommunity,
    deleteCommunity,
    draftAction,
    logEngagement,
  };
}
