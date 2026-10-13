import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Site-wide glass layer for every page except the homepage:
//   site/js/glass.js  (no React; framer-motion's animate/inView only)
// Committed like home-hero.js. After `npm run build`, bump glass.js?v= in
// the pages + generator templates.
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  logLevel: 'warn',
  build: {
    outDir: fileURLToPath(new URL('../site/js', import.meta.url)),
    emptyOutDir: false, // site/js also holds main.js + home-hero.js: never wipe it
    target: 'es2019',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/glass.js', import.meta.url)),
      name: 'DanGMGlass',
      formats: ['iife'],
      fileName: () => 'glass.js',
    },
  },
});
