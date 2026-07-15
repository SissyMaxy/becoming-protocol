/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config } from 'dotenv';

// Load only explicitly named integration variables from .env. Never fall back
// to the application's production Supabase values.
config();

const integrationUrl = process.env.INTEGRATION_SUPABASE_URL || '';
const integrationServiceKey = process.env.INTEGRATION_SUPABASE_SERVICE_ROLE_KEY || '';
const integrationAnonKey = process.env.INTEGRATION_SUPABASE_ANON_KEY || '';
const integrationUserId = process.env.INTEGRATION_TEST_USER_ID || '';

if (!integrationUrl || !integrationServiceKey || !integrationUserId) {
  throw new Error(
    'Integration tests require INTEGRATION_SUPABASE_URL, '
    + 'INTEGRATION_SUPABASE_SERVICE_ROLE_KEY, and INTEGRATION_TEST_USER_ID.',
  );
}
if (integrationUrl.includes('atevwvexapiykchvqvhm')) {
  throw new Error('Refusing to run integration tests against the production Supabase project.');
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Not jsdom — no browser needed for DB queries
    include: ['src/**/*.integration.test.{ts,tsx}'],
    testTimeout: 30000, // 30s — network calls can be slow
    // NO setupFiles — integration tests manage their own supabase client
    env: {
      VITE_SUPABASE_URL: integrationUrl,
      SUPABASE_URL: integrationUrl,
      VITE_SUPABASE_ANON_KEY: integrationAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: integrationServiceKey,
      INTEGRATION_TEST_USER_ID: integrationUserId,
    },
  },
});
