import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// ============================================
// REQUEST DEDUPLICATION
// ============================================
// On page load, 40+ hooks/components fire simultaneously and make identical
// GET requests (same URL, same auth token). This collapses them into one
// network request per unique URL, sharing the response across all callers.

const _fetch = globalThis.fetch.bind(globalThis);
const inflight = new Map<string, Promise<Response>>();

function deduplicatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();

  // Only dedup read requests — mutations must always execute
  if (method !== 'GET' && method !== 'HEAD') {
    return _fetch(input, init);
  }

  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  const existing = inflight.get(url);
  if (existing) {
    // Return a clone so each consumer can read the body independently
    return existing.then(res => res.clone());
  }

  const promise = _fetch(input, init);
  inflight.set(url, promise);

  // Remove entry shortly after response settles — any concurrent callers
  // that arrive within this window share the same response
  promise.finally(() => {
    setTimeout(() => inflight.delete(url), 200);
  });

  // First caller also gets a clone (keeps original in map for sharing)
  return promise.then(res => res.clone());
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: deduplicatingFetch,
  },
});

// ============================================
// AUTH CACHING
// ============================================
// supabase.auth.getUser() always makes a network request to verify the token.
// With 80+ callers across the codebase, this means 80+ identical requests on
// page load. Cache the result for 5 seconds to collapse them into ~1 request.
// The cache is invalidated on any auth state change (login, logout, token refresh).

type GetUserResult = ReturnType<typeof supabase.auth.getUser>;
let userCache: { promise: GetUserResult; timestamp: number } | null = null;
const USER_CACHE_TTL = 5000;

const originalGetUser = supabase.auth.getUser.bind(supabase.auth);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(supabase.auth as any).getUser = (jwt?: string): GetUserResult => {
  // Don't cache if a specific JWT is passed (explicit token verification)
  if (jwt) return originalGetUser(jwt);

  const now = Date.now();
  if (userCache && (now - userCache.timestamp) < USER_CACHE_TTL) {
    return userCache.promise;
  }

  const promise = originalGetUser();
  userCache = { promise, timestamp: now };
  return promise;
};

// Invalidate cache on any auth state change
supabase.auth.onAuthStateChange(() => {
  userCache = null;
});

// Expose for console debugging
if (typeof window !== 'undefined') {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}

// Database types
export interface DbDailyEntry {
  id: string;
  user_id: string;
  date: string;
  intensity: string;
  tasks: object;
  journal: object | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserProgress {
  id: string;
  user_id: string;
  overall_streak: number;
  longest_streak: number;
  total_days: number;
  domain_progress: object;
  phase: object;
  last_active_date: string | null;
  updated_at: string;
}
