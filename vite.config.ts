import { defineConfig } from 'vite';

// Carromba is a static site. No backend, no env, nothing to configure at runtime.
// The build target is a plain folder of files that can sit on any CDN.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssMinify: true,
    sourcemap: false,
    // The game is one tightly-coupled bundle. Splitting it would only add
    // request round-trips for a payload that is already tiny.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
});
