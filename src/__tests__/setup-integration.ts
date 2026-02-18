// Integration test setup — uses REAL Supabase connection
// No mocking. Tests run against the live database.
//
// Usage: test files use the `integration` tag in their filename:
//   e.g., content-engine.integration.test.ts
//
// Run with: npx vitest run --config vitest.integration.config.ts

import { createClient } from '@supabase/supabase-js';

// Load env vars (Vite doesn't inject them in test context)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://atevwvexapiykchvqvhm.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Integration tests require VITE_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env'
  );
}

// Service role client for integration tests — bypasses RLS
export const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Anon client — subject to RLS (tests user-facing queries)
export const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Get the real user ID from the database
export async function getRealUserId(): Promise<string> {
  const { data } = await serviceClient
    .from('user_progress')
    .select('user_id')
    .limit(1)
    .single();

  if (!data?.user_id) {
    throw new Error('No user found in database. Run the app first to create a user.');
  }
  return data.user_id;
}
