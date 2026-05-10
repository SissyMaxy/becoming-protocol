// Reddit API client (uses fetch, runs in Node 20 + Deno).
//
// Rate limit context: Reddit caps OAuth clients at ~600 req / 10min. We're
// nowhere near that (a daily research pass on ~20 subreddits + occasional
// submits = single digits per hour). The submit endpoint additionally has
// per-subreddit anti-spam: posting the same content twice within minutes
// returns "ALREADY_SUB"; we treat any non-success response as a hard error.

import {
  REDDIT_OAUTH_TOKEN_URL,
  REDDIT_OAUTH_REVOKE_URL,
  REDDIT_API_BASE,
} from './reddit-oauth';

export class RedditTokenExpiredError extends Error {
  constructor() { super('reddit token expired'); this.name = 'RedditTokenExpiredError'; }
}

export class RedditApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`reddit api ${status}: ${body.slice(0, 200)}`);
    this.name = 'RedditApiError';
    this.status = status;
    this.body = body;
  }
}

export class RedditBannedError extends Error {
  constructor(public reason: string) {
    super(`reddit banned: ${reason}`);
    this.name = 'RedditBannedError';
  }
}

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

function basicAuth(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  // btoa is available in both Node 20 (globalThis) and Deno.
  return `Basic ${btoa(raw)}`;
}

function userAgent(extra?: string): string {
  // Reddit requires a descriptive User-Agent; "anonymous" UAs get rate-limited
  // far more aggressively. Pull a per-deploy override if present.
  // (We're in src/lib here; this file is consumed by Vercel's Node runtime.
  // The Deno edge functions use the mirror in supabase/functions/_shared/outreach.ts.)
  const fromEnv = (typeof process !== 'undefined' && process.env?.REDDIT_USER_AGENT) || '';
  const base = fromEnv || 'web:becoming-protocol-outreach:v1.0 (by /u/becoming-protocol)';
  return extra ? `${base} ${extra}` : base;
}

export async function exchangeAuthCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const resp = await fetch(REDDIT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(params.clientId, params.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!resp.ok) throw new RedditApiError(resp.status, await resp.text());
  return resp.json();
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenExchangeResult> {
  const resp = await fetch(REDDIT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(params.clientId, params.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
    }),
  });
  if (!resp.ok) throw new RedditApiError(resp.status, await resp.text());
  return resp.json();
}

export async function revokeRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await fetch(REDDIT_OAUTH_REVOKE_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(params.clientId, params.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(),
    },
    body: new URLSearchParams({
      token: params.refreshToken,
      token_type_hint: 'refresh_token',
    }),
  }).catch(() => {});
}

async function call<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${REDDIT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': userAgent(),
      ...(init.headers || {}),
    },
  });
  if (resp.status === 401) throw new RedditTokenExpiredError();
  if (resp.status === 403) {
    const body = await resp.text();
    if (/banned|forbidden/i.test(body)) throw new RedditBannedError(body.slice(0, 200));
    throw new RedditApiError(403, body);
  }
  if (!resp.ok) throw new RedditApiError(resp.status, await resp.text());
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export interface RedditMe {
  name: string;
  id: string;
}

export async function getMe(accessToken: string): Promise<RedditMe> {
  return call<RedditMe>(accessToken, '/api/v1/me');
}

export interface SubredditAbout {
  data: {
    display_name: string;
    title: string;
    public_description: string;
    description: string;
    subscribers: number;
    over18: boolean;
    submission_type: string; // any | link | self
    subreddit_type: string;
  };
}

export async function getSubredditAbout(
  accessToken: string,
  slug: string,
): Promise<SubredditAbout['data']> {
  const resp = await call<SubredditAbout>(accessToken, `/r/${encodeURIComponent(slug)}/about`);
  return resp.data;
}

export interface SubredditRules {
  rules: Array<{
    short_name: string;
    description: string;
    kind?: string;
  }>;
}

export async function getSubredditRules(
  accessToken: string,
  slug: string,
): Promise<SubredditRules> {
  return call<SubredditRules>(accessToken, `/r/${encodeURIComponent(slug)}/about/rules`);
}

export interface SubmittedPost {
  json?: {
    data?: {
      url?: string;
      name?: string;
      id?: string;
    };
    errors?: Array<unknown>;
  };
}

export async function submitTextPost(
  accessToken: string,
  params: {
    subreddit: string;
    title: string;
    body: string;
    sendReplies?: boolean;
  },
): Promise<SubmittedPost> {
  const form = new URLSearchParams({
    api_type: 'json',
    kind: 'self',
    sr: params.subreddit,
    title: params.title,
    text: params.body,
    sendreplies: params.sendReplies === false ? 'false' : 'true',
    resubmit: 'true',
  });
  return call<SubmittedPost>(accessToken, '/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}
