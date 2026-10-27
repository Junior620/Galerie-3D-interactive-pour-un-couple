import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : le dossier dist/ fonctionne aussi bien à la racine d'un
  // domaine (Netlify, Vercel) que dans un sous-dossier (GitHub Pages).
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
