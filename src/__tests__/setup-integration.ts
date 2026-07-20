// Integration test setup - uses a dedicated, disposable Supabase environment.
// Run with: npm run test:integration

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TEST_USER_ID = process.env.INTEGRATION_TEST_USER_ID || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TEST_USER_ID) {
  throw new Error('Dedicated integration Supabase URL, service key, and test user are required.');
}
if (SUPABASE_URL.includes('atevwvexapiykchvqvhm')) {
  throw new Error('Refusing to use the production Supabase project for integration tests.');
}

export const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
export const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Kept for compatibility with older tests; this is never inferred from data.
export async function getRealUserId(): Promise<string> {
  return TEST_USER_ID;
}
