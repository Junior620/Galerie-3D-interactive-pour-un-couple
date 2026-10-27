import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildManifest, readConfigSafe, type Manifest } from './scripts/lib/manifest.mjs';

interface ConfigPartielle {
  titre?: string;
  sousTitre?: string;
  urlSite?: string;
  prenoms?: { lui?: string; elle?: string };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Adresse publique du site (sans « / » final) : champ « urlSite » de
 * config.json, sinon variables fournies par l'hébergeur au moment du build
 * (Vercel : VERCEL_PROJECT_PRODUCTION_URL, Netlify : URL), sinon vide.
 */
function siteUrl(config: ConfigPartielle | null): string {
  const env = process.env;
  const raw =
    (typeof config?.urlSite === 'string' && config.urlSite) ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    env.URL ||
    '';
  return raw.replace(/\/+$/, '');
}

/**
 * Plugin « aperçu de lien » : balises Open Graph et Twitter générées depuis
 * config.json, pour un bel aperçu sur WhatsApp, Telegram, Facebook, X…
 * L'image (public/og-image.jpg) se régénère avec « npm run og ».
 * Les réseaux exigent une adresse d'image absolue : renseignez « urlSite ».
 */
function openGraph(): Plugin {
  const root = process.cwd();
  return {
    name: 'notre-musee-open-graph',
    transformIndexHtml(html) {
      const config = readConfigSafe(resolve(root, 'config.json')) as ConfigPartielle | null;
      const titre = config?.titre?.trim() || 'Notre Musée';
      const { lui, elle } = config?.prenoms ?? {};
      const couple = lui && elle ? `${lui} & ${elle}` : '';
      const title = couple ? `${titre} — ${couple}` : titre;
      const sous = config?.sousTitre?.trim();
      const description = `${sous ? `${sous}. ` : ''}Un musée virtuel en 3D à visiter photo après photo, sur ordinateur et sur téléphone.`;
      const base = siteUrl(config);
      const hasImage = existsSync(resolve(root, 'public', 'og-image.jpg'));
      const image = hasImage ? (base ? `${base}/og-image.jpg` : './og-image.jpg') : '';

      const tags = [
        `<meta name="description" content="${esc(description)}" />`,
        base && `<link rel="canonical" href="${esc(base)}/" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:locale" content="fr_FR" />`,
        `<meta property="og:site_name" content="${esc(titre)}" />`,
        `<meta property="og:title" content="${esc(title)}" />`,
        `<meta property="og:description" content="${esc(description)}" />`,
        base && `<meta property="og:url" content="${esc(base)}/" />`,
        image && `<meta property="og:image" content="${esc(image)}" />`,
        image && `<meta property="og:image:type" content="image/jpeg" />`,
        image && `<meta property="og:image:width" content="1200" />`,
        image && `<meta property="og:image:height" content="630" />`,
        image && `<meta property="og:image:alt" content="${esc(`${title} : un musée virtuel en 3D`)}" />`,
        `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
        `<meta name="twitter:title" content="${esc(title)}" />`,
        `<meta name="twitter:description" content="${esc(description)}" />`,
        image && `<meta name="twitter:image" content="${esc(image)}" />`,
      ]
        .filter(Boolean)
        .join('\n    ');

      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/<meta name="description"[^>]*>\s*/, '')
        .replace('<!-- open-graph -->', tags);
    },
  };
}

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
  let outDir = resolve(root, 'dist');
  let manifest: Manifest | null = null;

  return {
    name: 'notre-musee-donnees',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
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
      manifest = await buildManifest(root);
      this.emitFile({ type: 'asset', fileName: 'config.json', source: readFileSync(configPath, 'utf8') });
      this.emitFile({ type: 'asset', fileName: 'musee-manifest.json', source: JSON.stringify(manifest) });
    },
    /**
     * Après le build : on retire de dist/ les originaux devenus inutiles (le
     * site n'utilise que les versions optimisées, sans données EXIF/GPS) et les
     * formats non affichables (HEIC…). public/ n'est jamais modifié.
     */
    closeBundle() {
      if (!manifest) return;
      let removed = 0;
      let bytes = 0;
      const drop = (rel: string) => {
        const f = resolve(outDir, rel);
        if (!f.startsWith(outDir) || !existsSync(f)) return;
        bytes += statSync(f).size;
        rmSync(f);
        removed++;
      };
      for (const [file, m] of Object.entries(manifest.photos)) {
        if ((m.type === 'image' && m.variantes.hd) || (m.type === 'video' && m.variantes.web)) drop(file);
      }
      const walk = (dir: string): string[] =>
        existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)])) : [];
      for (const f of walk(resolve(outDir, 'photos'))) {
        if (/\.(heic|heif|dng|avi|mkv|wmv|3gp|mts)$/i.test(f)) drop(f.slice(outDir.length + 1));
      }
      if (removed) console.log(`[musée] ${removed} original(aux) non déployé(s) (versions optimisées utilisées) : −${(bytes / 1048576).toFixed(1)} Mo`);
    },
  };
}

export default defineConfig({
  // Chemins relatifs : le dossier dist/ fonctionne aussi bien à la racine d'un
  // domaine (Netlify, Vercel) que dans un sous-dossier (GitHub Pages).
  base: './',
  server: { host: true },
  plugins: [museeData(), openGraph()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
