import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Builds one self-contained, deferred script for the homepage only:
//   site/js/home-hero.js
// The output is committed, so the hourly GitHub Action / Pages deploy
// (which just copies site/ to pages-dist/) needs no Node build step.
// After `npm run build`, bump ?v= on the home-hero.js tag in site/index.html.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: fileURLToPath(new URL('../site/js', import.meta.url)),
    emptyOutDir: false, // site/js also holds main.js: never wipe it
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/main.jsx', import.meta.url)),
      name: 'DanGMHero',
      formats: ['iife'],
      fileName: () => 'home-hero.js',
    },
  },
});
