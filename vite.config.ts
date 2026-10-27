import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildManifest } from './scripts/lib/manifest.mjs';

/**
 * Plugin « données du musée » :
 * - sert /config.json (à la racine du projet) et /musee-manifest.json en dev ;
 * - les copie dans dist/ au build ;
 * - recharge la page quand config.json ou une photo change.
 * config.json reste modifiable dans dist/ sans recompiler.
 */
function museeData(): Plugin {
  const root = process.cwd();
  const configPath = resolve(root, 'config.json');
  const photosDir = resolve(root, 'public', 'photos');

  return {
    name: 'notre-musee-donnees',
    configureServer(server) {
      server.watcher.add([configPath, photosDir]);
      let timer: ReturnType<typeof setTimeout> | undefined;
      server.watcher.on('all', (_event, file) => {
        const f = resolve(file);
        if (f === configPath || f.startsWith(photosDir)) {
          clearTimeout(timer);
          timer = setTimeout(() => server.ws.send({ type: 'full-reload' }), 400);
        }
      });
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        try {
          if (url === '/config.json') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(readFileSync(configPath));
            return;
          }
          if (url === '/musee-manifest.json') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(await buildManifest(root)));
            return;
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
          return;
        }
        next();
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'config.json', source: readFileSync(configPath, 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'musee-manifest.json', source: JSON.stringify(await buildManifest(root)) });
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le dossier dist/ fonctionne aussi bien à la racine d'un
  // domaine (Netlify, Vercel) que dans un sous-dossier (GitHub Pages).
  base: './',
  server: { host: true },
  plugins: [museeData()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
