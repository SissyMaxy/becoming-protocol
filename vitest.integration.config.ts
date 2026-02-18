/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { config } from 'dotenv';

// Load .env for integration tests
config();

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Not jsdom — no browser needed for DB queries
    include: ['src/**/*.integration.test.{ts,tsx}'],
    testTimeout: 30000, // 30s — network calls can be slow
    // NO setupFiles — integration tests manage their own supabase client
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
});
