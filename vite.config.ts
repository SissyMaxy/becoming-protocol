// vite.config.ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/supabase.ts'],
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    // Source maps enabled temporarily for #310 debugging
    sourcemap: true,
    // Optimize chunk size
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // Vendor chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react', 'framer-motion'],

          // Feature chunks - lazy loaded
          'feature-handler': [
            './src/components/handler-dashboard/HandlerDashboard.tsx',
          ],
          'feature-ceremonies': [
            './src/components/ceremonies/CeremonyPerformanceModal.tsx',
          ],
          'feature-investments': [
            './src/lib/investments.ts',
            './src/lib/wishlist.ts',
          ],
        },
      },
    },
    // Minification options
    minify: 'terser',
    terserOptions: {
      keep_fnames: true,
      compress: {
        drop_debugger: true,
      },
    },
  },
  // Dependency optimization
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js'],
    exclude: [],
  },
})