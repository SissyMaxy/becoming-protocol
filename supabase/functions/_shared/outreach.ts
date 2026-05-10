// Outreach helpers for Deno edge functions.
//
// Mirror of src/lib/outreach/{crypto,reddit-client,reddit-oauth}.ts. Keep in
// sync — same convention as supabase/functions/_shared/calendar.ts.
//
// Centralizing here so outreach-research, outreach-draft-generator, and
// outreach-submit don't each reimplement the OAuth dance + token decryption.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ────────────────────────────────────────────────────────────────────────────
// AES-256-GCM token crypto (mirror of src/lib/outreach/crypto.ts)
// ────────────────────────────────────────────────────────────────────────────

const IV_BYTES = 12;
const KEY_BYTES = 32;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(keyB64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`OUTREACH_TOKEN_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length})`);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plaintext: string, keyB64: string): Promise<string> {
  if (!plaintext) throw new Error('encryptToken: empty plaintext');
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptToken(blobB64: string, keyB64: string): Promise<string> {
  if (!blobB64) throw new Error('decryptToken: empty blob');
  const key = await importKey(keyB64);
  const blob = b64ToBytes(blobB64);
  if (blob.length < IV_BYTES + 16) throw new Error('decryptToken: blob too short');
  const iv = blob.slice(0, IV_BYTES);
  const ct = blob.slice(IV_BYTES);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  return new TextDecoder().decode(pt);
}

// ────────────────────────────────────────────────────────────────────────────
// Reddit API client (mirror of src/lib/outreach/reddit-client.ts)
// ────────────────────────────────────────────────────────────────────────────

const REDDIT_OAUTH_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_API_BASE = 'https://oauth.reddit.com';

export class RedditTokenExpiredError extends Error {
  constructor() { super('reddit token expired'); this.name = 'RedditTokenExpiredError'; }
}

export class RedditApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`reddit api ${status}: ${body.slice(0, 200)}`);
    this.name = 'RedditApiError';
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
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function userAgent(): string {
  return denoEnv('REDDIT_USER_AGENT') || 'web:becoming-protocol-outreach:v1.0 (by /u/becoming-protocol)';
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

export interface SubredditAboutData {
  display_name: string;
  title: string;
  public_description: string;
  description: string;
  subscribers: number;
  over18: boolean;
  submission_type: string;
  subreddit_type: string;
}

export async function getSubredditAbout(
  accessToken: string,
  slug: string,
): Promise<SubredditAboutData> {
  const resp = await call<{ data: SubredditAboutData }>(accessToken, `/r/${encodeURIComponent(slug)}/about`);
  return resp.data;
}

export interface SubredditRulesResponse {
  rules: Array<{ short_name: string; description: string; kind?: string }>;
}

export async function getSubredditRules(
  accessToken: string,
  slug: string,
): Promise<SubredditRulesResponse> {
  return call<SubredditRulesResponse>(accessToken, `/r/${encodeURIComponent(slug)}/about/rules`);
}

export interface SubmittedPostResponse {
  json?: {
    data?: { url?: string; name?: string; id?: string };
    errors?: Array<unknown>;
  };
}

export async function submitTextPost(
  accessToken: string,
  params: { subreddit: string; title: string; body: string; sendReplies?: boolean },
): Promise<SubmittedPostResponse> {
  const form = new URLSearchParams({
    api_type: 'json',
    kind: 'self',
    sr: params.subreddit,
    title: params.title,
    text: params.body,
    sendreplies: params.sendReplies === false ? 'false' : 'true',
    resubmit: 'true',
  });
  return call<SubmittedPostResponse>(accessToken, '/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Service client + token-refresh helper
// ────────────────────────────────────────────────────────────────────────────

export function denoEnv(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Deno as any).env.get(name) ?? '';
}

export function denoServiceClient(): SupabaseClient {
  return createClient(denoEnv('SUPABASE_URL'), denoEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export interface ActiveRedditCreds {
  user_id: string;
  username: string | null;
  accessToken: string;
}

export async function getActiveRedditCreds(
  supabase: SupabaseClient,
): Promise<ActiveRedditCreds[]> {
  const tokenKey = denoEnv('OUTREACH_TOKEN_KEY');
  const clientId = denoEnv('REDDIT_CLIENT_ID');
  const clientSecret = denoEnv('REDDIT_CLIENT_SECRET');
  if (!tokenKey || !clientId || !clientSecret) {
    console.warn('[outreach] missing OUTREACH_TOKEN_KEY/REDDIT_CLIENT_ID/SECRET');
    return [];
  }

  const { data: rows, error } = await supabase
    .from('outreach_credentials')
    .select('user_id, username, oauth_token_encrypted, refresh_token_encrypted, expires_at')
    .eq('platform', 'reddit')
    .is('disconnected_at', null);

  if (error) {
    console.error('[outreach] fetch creds error:', error.message);
    return [];
  }

  const out: ActiveRedditCreds[] = [];
  for (const row of rows || []) {
    let accessToken: string;
    try { accessToken = await decryptToken(row.oauth_token_encrypted, tokenKey); }
    catch (err) {
      console.error('[outreach] decrypt access failed for', row.user_id, (err as Error).message);
      continue;
    }

    const expired = !row.expires_at || new Date(row.expires_at).getTime() <= Date.now() + 60_000;
    if (expired) {
      let refreshToken: string;
      try { refreshToken = await decryptToken(row.refresh_token_encrypted, tokenKey); }
      catch (err) {
        console.error('[outreach] decrypt refresh failed for', row.user_id, (err as Error).message);
        continue;
      }
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
          .eq('user_id', row.user_id)
          .eq('platform', 'reddit');
      } catch (err) {
        console.error('[outreach] refresh failed for', row.user_id, (err as Error).message);
        continue;
      }
    }

    out.push({ user_id: row.user_id, username: row.username, accessToken });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Rate-limit guard (mirrors api/outreach/[action].ts checkRateLimits)
// ────────────────────────────────────────────────────────────────────────────

export interface RateLimitResult { ok: boolean; reason?: string }

export async function checkRateLimits(
  supabase: SupabaseClient,
  userId: string,
  subreddit: string,
): Promise<RateLimitResult> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: dailyCount } = await supabase
    .from('outreach_post_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .gte('submitted_at', dayAgo);
  if ((dailyCount ?? 0) >= 3) return { ok: false, reason: 'daily submission cap (3) reached' };

  const { data: recent } = await supabase
    .from('outreach_post_drafts')
    .select('id, outreach_communities!inner(slug, platform)')
    .eq('user_id', userId)
    .eq('status', 'submitted')
    .gte('submitted_at', weekAgo)
    .eq('outreach_communities.platform', 'reddit')
    .eq('outreach_communities.slug', subreddit);
  if ((recent || []).length >= 1) {
    return { ok: false, reason: `already posted to r/${subreddit} in the last 7 days` };
  }

  return { ok: true };
}
