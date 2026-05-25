import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest, slowest-changing deps into stable vendor
        // chunks so an app-code change doesn't bust their browser cache.
        // Route-level code-splitting (React.lazy in App.tsx) handles the
        // rest of the bundle size. rolldown-vite types `manualChunks` as a
        // function only (no object form), so we match on module path.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id,
            )
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
});