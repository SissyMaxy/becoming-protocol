// Reddit OAuth scope/URL constants and URL builder.
//
// Scopes:
//   identity   — read /api/v1/me to capture username at connect time
//   read       — fetch subreddit metadata (rules, sidebar) for outreach-research
//   submit     — POST /api/submit (post creation)
//
// We deliberately do NOT request `vote` or `edit` — Mommy never auto-votes,
// and edits are user-driven (they happen via the Reddit UI).

export const REDDIT_OAUTH_SCOPES = ['identity', 'read', 'submit'] as const;

export const REDDIT_OAUTH_AUTH_URL = 'https://www.reddit.com/api/v1/authorize';
export const REDDIT_OAUTH_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
export const REDDIT_OAUTH_REVOKE_URL = 'https://www.reddit.com/api/v1/revoke_token';
export const REDDIT_API_BASE = 'https://oauth.reddit.com';

export function buildRedditAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const qp = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    state: params.state,
    redirect_uri: params.redirectUri,
    duration: 'permanent', // issue refresh_token
    scope: REDDIT_OAUTH_SCOPES.join(' '),
  });
  return `${REDDIT_OAUTH_AUTH_URL}?${qp.toString()}`;
}
