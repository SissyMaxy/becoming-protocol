// Community-outreach API.
//
// Routes (action = req.query.action):
//
//   GET  /api/outreach/auth-reddit            — start Reddit OAuth, redirect
//   GET  /api/outreach/callback-reddit        — Reddit redirects here with code
//   POST /api/outreach/revoke-reddit          — disconnect: revoke + drop creds
//   GET  /api/outreach/status                 — JSON: connection state
//
//   GET  /api/outreach/communities            — list user's tracked communities
//   POST /api/outreach/communities            — add a manual community
//   POST /api/outreach/community-toggle       — enable/auto-submit toggle
//   POST /api/outreach/community-delete       — soft-delete a community
//
//   GET  /api/outreach/drafts                 — list drafts (filter by status)
//   POST /api/outreach/draft-action           — approve / reject / edit / submit / mark-posted
//
//   GET  /api/outreach/engagement             — list engagement events
//   POST /api/outreach/engagement             — log a manual engagement
//
// CRITICAL ARCHITECTURE RULE: do not import src/lib/supabase.ts here — that
// file uses import.meta.env (Vite-only) and will crash at module load. Instead
// inline supabase client construction with process.env.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '../../src/lib/outreach/crypto.js';
import {
  buildRedditAuthUrl,
  REDDIT_OAUTH_SCOPES,
} from '../../src/lib/outreach/reddit-oauth.js';
import {
  exchangeAuthCode,
  refreshAccessToken,
  revokeRefreshToken,
  getMe,
  submitTextPost,
  RedditTokenExpiredError,
  RedditApiError,
  RedditBannedError,
} from '../../src/lib/outreach/reddit-client.js';

function env(name: string, ...fallbacks: string[]): string {
  for (const k of [name, ...fallbacks]) {
    const v = process.env[k];
    if (v) return v;
  }
  return '';
}

function serviceClient() {
  const url = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('supabase env missing');
  return createClient(url, key);
}

function appUrl(): string {
  return env('OUTREACH_APP_URL', 'CALENDAR_APP_URL', 'WHOOP_APP_URL') || 'https://becoming-protocol.vercel.app';
}

function redditConfig() {
  return {
    clientId: env('REDDIT_CLIENT_ID'),
    clientSecret: env('REDDIT_CLIENT_SECRET'),
    redirectUri: env('REDDIT_REDIRECT_URI'),
    tokenKey: env('OUTREACH_TOKEN_KEY'),
  };
}

async function authedUserId(
  req: VercelRequest,
  supabase: ReturnType<typeof serviceClient>,
): Promise<string | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
  if (error || !data.user) return null;
  return data.user.id;
}

// ── Reddit OAuth start ────────────────────────────────────────────────────

function handleAuthReddit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { clientId, redirectUri } = redditConfig();
  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Reddit OAuth not configured' });
  }
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id query param required' });

  const nonce = randomUUID();
  const state = `${userId}:${nonce}`;
  res.setHeader(
    'Set-Cookie',
    `reddit_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
  );
  res.redirect(302, buildRedditAuthUrl({ clientId, redirectUri, state }));
}

// ── Reddit OAuth callback ─────────────────────────────────────────────────

async function handleCallbackReddit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const url = appUrl();
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(302, `${url}?reddit=error&reason=${encodeURIComponent(String(oauthError))}`);
  }
  if (!code || !state) return res.redirect(302, `${url}?reddit=error&reason=missing_params`);

  const stored = req.cookies?.reddit_oauth_state;
  let userId: string | null = null;
  if (stored) {
    const parts = String(stored).split(':');
    if (parts.length === 2 && parts[1] === String(state).split(':')[1]) {
      userId = parts[0] || null;
    }
  }
  if (!userId) {
    const sParts = String(state).split(':');
    if (sParts.length === 2) userId = sParts[0];
  }
  if (!userId) return res.redirect(302, `${url}?reddit=error&reason=no_user_id`);

  const { clientId, clientSecret, redirectUri, tokenKey } = redditConfig();
  if (!clientId || !clientSecret || !redirectUri || !tokenKey) {
    return res.redirect(302, `${url}?reddit=error&reason=server_config`);
  }

  let tokens;
  try {
    tokens = await exchangeAuthCode({
      code: String(code), clientId, clientSecret, redirectUri,
    });
  } catch (err) {
    console.error('[reddit callback] token exchange failed:', (err as Error).message);
    return res.redirect(302, `${url}?reddit=error&reason=token_exchange_failed`);
  }

  if (!tokens.refresh_token) {
    return res.redirect(302, `${url}?reddit=error&reason=no_refresh_token`);
  }

  // Fetch username for display purposes (best-effort).
  let username: string | null = null;
  try {
    const me = await getMe(tokens.access_token);
    username = me.name;
  } catch (err) {
    console.error('[reddit callback] getMe failed:', (err as Error).message);
  }

  const supabase = serviceClient();

  const accessEnc = await encryptToken(tokens.access_token, tokenKey);
  const refreshEnc = await encryptToken(tokens.refresh_token, tokenKey);
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

  const { error: dbErr } = await supabase
    .from('outreach_credentials')
    .upsert(
      {
        user_id: userId,
        platform: 'reddit',
        username,
        oauth_token_encrypted: accessEnc,
        refresh_token_encrypted: refreshEnc,
        expires_at: expiresAt,
        scopes: tokens.scope?.split(' ') || [...REDDIT_OAUTH_SCOPES],
        disconnected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' },
    );

  if (dbErr) {
    console.error('[reddit callback] db upsert failed:', dbErr.message);
    return res.redirect(302, `${url}?reddit=error&reason=db_error`);
  }

  res.setHeader(
    'Set-Cookie',
    'reddit_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
  );
  res.redirect(302, `${url}?reddit=connected#/community/list`);
}

// ── revoke ────────────────────────────────────────────────────────────────

async function handleRevokeReddit(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { clientId, clientSecret, tokenKey } = redditConfig();

  const { data: cred } = await supabase
    .from('outreach_credentials')
    .select('refresh_token_encrypted')
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .maybeSingle();

  if (cred && tokenKey && clientId && clientSecret) {
    try {
      const refreshToken = await decryptToken(cred.refresh_token_encrypted, tokenKey);
      await revokeRefreshToken({ refreshToken, clientId, clientSecret });
    } catch (err) {
      console.error('[reddit revoke] failed:', (err as Error).message);
    }
  }

  await supabase
    .from('outreach_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('platform', 'reddit');

  return res.status(200).json({ disconnected: true });
}

// ── status ────────────────────────────────────────────────────────────────

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { data } = await supabase
    .from('outreach_credentials')
    .select('platform, username, connected_at')
    .eq('user_id', userId)
    .is('disconnected_at', null);

  const reddit = (data || []).find((r) => r.platform === 'reddit');
  return res.status(200).json({
    reddit: reddit
      ? { connected: true, username: reddit.username, connected_at: reddit.connected_at }
      : { connected: false },
  });
}

// ── communities ──────────────────────────────────────────────────────────

async function handleListCommunities(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { data, error } = await supabase
    .from('outreach_communities')
    .select('*')
    .eq('user_id', userId)
    .order('platform')
    .order('display_name');

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ communities: data || [] });
}

async function handleAddCommunity(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    platform?: string;
    slug?: string;
    display_name?: string;
    tone_notes?: string;
    self_promo_policy?: string;
    typical_post_cadence_days?: number;
  };

  if (!body.platform || !body.slug || !body.display_name) {
    return res.status(400).json({ error: 'platform, slug, display_name required' });
  }
  if (!['reddit', 'fetlife', 'discord'].includes(body.platform)) {
    return res.status(400).json({ error: 'invalid platform' });
  }

  const { data, error } = await supabase
    .from('outreach_communities')
    .insert({
      user_id: userId,
      platform: body.platform,
      slug: body.slug,
      display_name: body.display_name,
      tone_notes: body.tone_notes || null,
      self_promo_policy: body.self_promo_policy || 'restricted',
      typical_post_cadence_days: body.typical_post_cadence_days || 7,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ community: data });
}

async function handleCommunityToggle(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    community_id?: string;
    enabled?: boolean;
    auto_submit_enabled?: boolean;
    min_engagement_before_post?: number;
  };
  if (!body.community_id) return res.status(400).json({ error: 'community_id required' });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.auto_submit_enabled === 'boolean') patch.auto_submit_enabled = body.auto_submit_enabled;
  if (typeof body.min_engagement_before_post === 'number'
      && body.min_engagement_before_post >= 0
      && body.min_engagement_before_post <= 100) {
    patch.min_engagement_before_post = Math.round(body.min_engagement_before_post);
  }

  const { error } = await supabase
    .from('outreach_communities')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', body.community_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

async function handleCommunityDelete(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as { community_id?: string };
  if (!body.community_id) return res.status(400).json({ error: 'community_id required' });

  const { error } = await supabase
    .from('outreach_communities')
    .delete()
    .eq('user_id', userId)
    .eq('id', body.community_id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── drafts ───────────────────────────────────────────────────────────────

async function handleListDrafts(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const status = (req.query.status as string) || '';
  let q = supabase
    .from('outreach_post_drafts')
    .select('*, outreach_communities(slug, display_name, platform, self_promo_policy)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ drafts: data || [] });
}

async function handleDraftAction(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    draft_id?: string;
    action?: 'approve' | 'reject' | 'edit' | 'submit_now' | 'mark_posted_manually';
    title?: string;
    body_markdown?: string;
    submitted_url?: string;
  };

  if (!body.draft_id || !body.action) {
    return res.status(400).json({ error: 'draft_id, action required' });
  }

  const { data: draft } = await supabase
    .from('outreach_post_drafts')
    .select('id, status, title, body_markdown, community_id, outreach_communities(platform, slug, banned_at)')
    .eq('user_id', userId)
    .eq('id', body.draft_id)
    .maybeSingle();
  if (!draft) return res.status(404).json({ error: 'draft not found' });
  // outreach_communities arrives as a relation; with maybeSingle on the parent
  // it can be a single object or an array — normalize.
  const community = Array.isArray(draft.outreach_communities)
    ? draft.outreach_communities[0]
    : draft.outreach_communities;

  switch (body.action) {
    case 'approve':
      await supabase
        .from('outreach_post_drafts')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', draft.id);
      return res.status(200).json({ ok: true, status: 'approved' });

    case 'reject':
      await supabase
        .from('outreach_post_drafts')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', draft.id);
      return res.status(200).json({ ok: true, status: 'rejected' });

    case 'edit': {
      const edits: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const userEdits: Record<string, unknown> = {};
      if (typeof body.title === 'string') {
        edits.title = body.title;
        userEdits.title_before = draft.title;
        userEdits.title_after = body.title;
      }
      if (typeof body.body_markdown === 'string') {
        edits.body_markdown = body.body_markdown;
        userEdits.body_before = draft.body_markdown;
        userEdits.body_after = body.body_markdown;
      }
      edits.user_edits_jsonb = userEdits;
      const { error } = await supabase
        .from('outreach_post_drafts')
        .update(edits)
        .eq('id', draft.id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    case 'mark_posted_manually': {
      const { error } = await supabase
        .from('outreach_post_drafts')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_url: body.submitted_url || null,
          submitted_response_jsonb: { manual: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      if (error) return res.status(500).json({ error: error.message });
      await supabase
        .from('outreach_communities')
        .update({ last_post_at: new Date().toISOString() })
        .eq('id', draft.community_id);
      return res.status(200).json({ ok: true });
    }

    case 'submit_now': {
      // User-driven immediate submission. Still rate-limit-checked + enforces
      // platform=reddit; FetLife/Discord must use mark_posted_manually.
      if (!community || community.platform !== 'reddit') {
        return res.status(400).json({ error: 'submit_now is Reddit-only; use mark_posted_manually for FetLife/Discord' });
      }
      if (community.banned_at) {
        return res.status(400).json({ error: 'community is banned; cannot submit' });
      }

      const rateOk = await checkRateLimits(supabase, userId, community.slug);
      if (!rateOk.ok) return res.status(429).json({ error: rateOk.reason });

      const result = await submitDraftToReddit(supabase, userId, draft.id);
      if (!result.ok) return res.status(500).json({ error: result.error });
      return res.status(200).json({ ok: true, url: result.url });
    }
  }
  return res.status(400).json({ error: 'invalid action' });
}

// ── engagement ───────────────────────────────────────────────────────────

async function handleListEngagement(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const { data, error } = await supabase
    .from('outreach_engagement_log')
    .select('*, outreach_communities(slug, display_name, platform)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ engagement: data || [] });
}

async function handleLogEngagement(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    community_id?: string;
    kind?: 'comment' | 'upvote' | 'view' | 'reply_received';
    target_url?: string;
    note?: string;
  };

  if (!body.community_id || !body.kind) {
    return res.status(400).json({ error: 'community_id, kind required' });
  }

  const { error } = await supabase.from('outreach_engagement_log').insert({
    user_id: userId,
    community_id: body.community_id,
    kind: body.kind,
    target_url: body.target_url || null,
    note: body.note || null,
    actor: 'user_manual',
  });
  if (error) return res.status(500).json({ error: error.message });

  await supabase
    .from('outreach_communities')
    .update({ last_engagement_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', body.community_id);

  return res.status(200).json({ ok: true });
}

// ── reply: user answers Mama from inside the outreach card ──────────────
// 2026-05-10: Mama demands answers in the outreach surface itself; the
// reply lands here. Persistence shape:
//   1. handler_outreach_queue.{replied_at, reply_text, reply_photo_path}
//      stamped on the row Mama sent.
//   2. handler_messages row written under a dedicated 'outreach_reply'
//      conversation per user (created lazily), tagged with
//      source_outreach_id so Mama's next read can quote what was said.
//   3. mommy-fast-react fired with event_kind='response_received' and
//      context.source_outreach_id, so her reaction lands as a new
//      outreach tagged trigger_reason='reply_to:<id>' (lineage gate
//      that the dedup machinery uses to know this is an exchange, not
//      a fresh demand).
//
// Fire-and-forget on fast-react — the user's reply succeeds even if
// Mama's reaction call fails; her supervisor watchdog catches stalled
// reactions.

async function handleOutreachReply(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceClient();
  const userId = await authedUserId(req, supabase);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const body = (req.body || {}) as {
    outreach_id?: string;
    reply_text?: string;
    photo_id?: string;
    photo_path?: string;
  };
  const outreachId = body.outreach_id;
  const replyText = (body.reply_text || '').trim();
  if (!outreachId) return res.status(400).json({ error: 'outreach_id required' });
  if (!replyText && !body.photo_path && !body.photo_id) {
    return res.status(400).json({ error: 'reply_text or photo required' });
  }

  // 1. Verify the outreach row exists and belongs to this user. Don't
  //    permit overwriting a prior reply — first answer wins; future
  //    follow-ups become their own outreach exchanges.
  const { data: outreachRow, error: fetchErr } = await supabase
    .from('handler_outreach_queue')
    .select('id, user_id, message, replied_at, requires_photo, reply_deadline_at, trigger_reason')
    .eq('id', outreachId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchErr || !outreachRow) {
    return res.status(404).json({ error: 'outreach not found' });
  }
  if (outreachRow.replied_at) {
    return res.status(409).json({ error: 'already replied', replied_at: outreachRow.replied_at });
  }

  // 2. Update the outreach row with reply state + treat reply as
  //    acknowledgement (delivered_at) so the card jumps from pending → recent.
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('handler_outreach_queue')
    .update({
      replied_at: nowIso,
      reply_text: replyText || null,
      reply_photo_path: body.photo_path || null,
      delivered_at: nowIso,
      status: 'delivered',
    })
    .eq('id', outreachId);
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // 3. Find or create the dedicated outreach-reply conversation, then
  //    insert the user-turn message tagged with source_outreach_id.
  let convId: string | null = null;
  const { data: convRow } = await supabase
    .from('handler_conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('conversation_type', 'outreach_reply')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  convId = (convRow as { id?: string } | null)?.id ?? null;
  if (!convId) {
    const { data: created, error: cErr } = await supabase
      .from('handler_conversations')
      .insert({ user_id: userId, conversation_type: 'outreach_reply' })
      .select('id')
      .single();
    if (cErr || !created) {
      return res.status(500).json({ error: 'conversation create failed: ' + (cErr?.message ?? '') });
    }
    convId = (created as { id: string }).id;
  }

  // Count existing messages to compute message_index.
  const { count: msgCount } = await supabase
    .from('handler_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', convId);

  await supabase.from('handler_messages').insert({
    conversation_id: convId,
    user_id: userId,
    role: 'user',
    content: replyText || (body.photo_path ? '[photo reply]' : ''),
    source_outreach_id: outreachId,
    message_index: (msgCount ?? 0),
  });

  // 4. Link the photo (if provided by id) back to the outreach. The
  //    component-side upload (PhotoVerificationUpload) writes the
  //    verification_photos row first, then this endpoint stamps the
  //    source_outreach_id so audits can find both halves.
  if (body.photo_id) {
    await supabase
      .from('verification_photos')
      .update({ source_outreach_id: outreachId })
      .eq('id', body.photo_id)
      .eq('user_id', userId);
  }

  // 5. Fire mommy-fast-react. event_kind='response_received' +
  //    context.source_outreach_id triggers the reply-lineage path in
  //    fast-react that tags the new outreach with trigger_reason=
  //    `reply_to:<id>`. Source-key is per-outreach so a single reply
  //    doesn't fire her twice on retries.
  //
  //    Fire-and-forget — the user's reply succeeds even if this call
  //    fails or times out. Don't await the response; just kick it off.
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    const fastReactUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mommy-fast-react`;
    // Don't await — let the user's response return immediately.
    fetch(fastReactUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        event_kind: 'response_received',
        source_key: `outreach_reply:${outreachId}`,
        context: {
          source_outreach_id: outreachId,
          original_message: (outreachRow.message ?? '').slice(0, 1200),
          reply_text: replyText.slice(0, 1200),
          reply_photo_path: body.photo_path || null,
          requires_photo: !!outreachRow.requires_photo,
          deadline_at: outreachRow.reply_deadline_at,
          replied_at: nowIso,
        },
      }),
    }).catch((err) => {
      console.error('[outreach reply] fast-react fire failed', err);
    });
  }

  return res.status(200).json({
    ok: true,
    outreach_id: outreachId,
    conversation_id: convId,
    replied_at: nowIso,
  });
}

// ── shared helpers ───────────────────────────────────────────────────────
// Rate limits are enforced at every submission entry point (manual + cron).

interface RateLimitResult { ok: boolean; reason?: string }

async function checkRateLimits(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  subreddit: string,
): Promise<RateLimitResult> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Daily cap: 3 submissions across all subreddits.
  const { count: dailyCount, error: dailyErr } = await supabase
    .from('outreach_post_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .gte('submitted_at', dayAgo);
  if (dailyErr) return { ok: false, reason: dailyErr.message };
  if ((dailyCount ?? 0) >= 3) return { ok: false, reason: 'daily submission cap (3) reached' };

  // Per-subreddit weekly cap: 1.
  const { data: recent, error: recentErr } = await supabase
    .from('outreach_post_drafts')
    .select('id, outreach_communities!inner(slug, platform)')
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .gte('submitted_at', weekAgo)
    .eq('outreach_communities.platform', 'reddit')
    .eq('outreach_communities.slug', subreddit);
  if (recentErr) return { ok: false, reason: recentErr.message };
  if ((recent || []).length >= 1) {
    return { ok: false, reason: `already posted to r/${subreddit} in the last 7 days` };
  }

  return { ok: true };
}

async function getValidRedditAccessToken(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
): Promise<string | null> {
  const { clientId, clientSecret, tokenKey } = redditConfig();
  if (!tokenKey || !clientId || !clientSecret) return null;

  const { data: row } = await supabase
    .from('outreach_credentials')
    .select('oauth_token_encrypted, refresh_token_encrypted, expires_at')
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .is('disconnected_at', null)
    .maybeSingle();
  if (!row) return null;

  let accessToken: string;
  try { accessToken = await decryptToken(row.oauth_token_encrypted, tokenKey); }
  catch { return null; }

  const expired = !row.expires_at || new Date(row.expires_at).getTime() <= Date.now() + 60_000;
  if (!expired) return accessToken;

  let refreshToken: string;
  try { refreshToken = await decryptToken(row.refresh_token_encrypted, tokenKey); }
  catch { return null; }

  try {
    const fresh = await refreshAccessToken({ refreshToken, clientId, clientSecret });
    accessToken = fresh.access_token;
    const newAccessEnc = await encryptToken(fresh.access_token, tokenKey);
    const newExpires = new Date(Date.now() + (fresh.expires_in || 3600) * 1000).toISOString();
    await supabase
      .from('outreach_credentials')
      .update({
        oauth_token_encrypted: newAccessEnc,
        expires_at: newExpires,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'reddit');
    return accessToken;
  } catch (err) {
    console.error('[reddit token] refresh failed:', (err as Error).message);
    return null;
  }
}

interface SubmitResult { ok: boolean; url?: string; error?: string }

async function submitDraftToReddit(
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  draftId: string,
): Promise<SubmitResult> {
  const { data: draft } = await supabase
    .from('outreach_post_drafts')
    .select('id, title, body_markdown, community_id, outreach_communities!inner(slug, platform)')
    .eq('user_id', userId)
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return { ok: false, error: 'draft not found' };

  const community = Array.isArray(draft.outreach_communities)
    ? draft.outreach_communities[0]
    : draft.outreach_communities;
  if (!community || community.platform !== 'reddit') {
    return { ok: false, error: 'not a reddit community' };
  }

  if (!draft.title || !draft.body_markdown) {
    return { ok: false, error: 'title + body required' };
  }

  const accessToken = await getValidRedditAccessToken(supabase, userId);
  if (!accessToken) return { ok: false, error: 'reddit not connected' };

  try {
    const resp = await submitTextPost(accessToken, {
      subreddit: community.slug,
      title: draft.title,
      body: draft.body_markdown,
    });
    const url = resp?.json?.data?.url || null;
    const errors = resp?.json?.errors || [];
    if (errors.length > 0) {
      await supabase
        .from('outreach_post_drafts')
        .update({
          status: 'failed',
          submission_error: JSON.stringify(errors).slice(0, 500),
          submitted_response_jsonb: resp as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      return { ok: false, error: `reddit rejected: ${JSON.stringify(errors).slice(0, 200)}` };
    }

    await supabase
      .from('outreach_post_drafts')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_url: url,
        submitted_response_jsonb: resp as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id);
    await supabase
      .from('outreach_communities')
      .update({ last_post_at: new Date().toISOString() })
      .eq('id', draft.community_id);
    return { ok: true, url: url || undefined };
  } catch (err) {
    if (err instanceof RedditBannedError) {
      // Mark community as banned; flip enabled off so the drafter stops
      // pulling from it. The user sees this on /community/list + /log.
      await supabase
        .from('outreach_communities')
        .update({
          banned_at: new Date().toISOString(),
          banned_reason: err.reason.slice(0, 500),
          enabled: false,
          auto_submit_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.community_id);
      await supabase
        .from('outreach_post_drafts')
        .update({
          status: 'failed',
          submission_error: `BANNED: ${err.reason.slice(0, 500)}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      return { ok: false, error: 'community banned' };
    }
    if (err instanceof RedditTokenExpiredError) {
      return { ok: false, error: 'reddit token expired (will retry next run)' };
    }
    if (err instanceof RedditApiError) {
      await supabase
        .from('outreach_post_drafts')
        .update({
          status: 'failed',
          submission_error: err.message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id);
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }
}

// ── default export ───────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || '';
  try {
    switch (action) {
      case 'auth-reddit': return handleAuthReddit(req, res);
      case 'callback-reddit': return handleCallbackReddit(req, res);
      case 'revoke-reddit': return handleRevokeReddit(req, res);
      case 'status': return handleStatus(req, res);

      case 'communities': {
        if (req.method === 'GET') return handleListCommunities(req, res);
        if (req.method === 'POST') return handleAddCommunity(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
      }
      case 'community-toggle': return handleCommunityToggle(req, res);
      case 'community-delete': return handleCommunityDelete(req, res);

      case 'drafts': return handleListDrafts(req, res);
      case 'draft-action': return handleDraftAction(req, res);

      case 'engagement': {
        if (req.method === 'GET') return handleListEngagement(req, res);
        if (req.method === 'POST') return handleLogEngagement(req, res);
        return res.status(405).json({ error: 'Method not allowed' });
      }

      case 'reply': return handleOutreachReply(req, res);

      default:
        return res.status(404).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[outreach handler]', (err as Error).message);
    return res.status(500).json({ error: 'internal' });
  }
}
