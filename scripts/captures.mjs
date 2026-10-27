#!/usr/bin/env node
/**
 * Captures d'écran automatiques + contrôle des erreurs console (Playwright).
 *
 *   npm run build && npm run captures              → scénario « defaut »
 *   npm run captures -- photo danse                → scénarios choisis
 *   npm run captures -- --url=http://localhost:5173 defaut
 *
 * Les images sont écrites dans captures/ (ignoré par git).
 * Code de sortie 1 si une erreur console ou une exception de page est détectée.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='))?.slice(6);
const names = args.filter((a) => !a.startsWith('--'));
const PORT = 4317;
const OUT = resolve('captures');
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  bureau: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  },
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Attend que l'application signale qu'elle est prête (ou un délai max). */
async function waitReady(page, timeout = 60000) {
  await page
    .waitForFunction(() => window.__musee?.ready === true || document.querySelector('canvas'), null, { timeout })
    .catch(() => {});
  await page.waitForFunction(() => !window.__musee || window.__musee.ready === true, null, { timeout }).catch(() => {});
}

/** Clique sur « Entrer dans le musée » si l'écran d'accueil est présent. */
async function enter(page) {
  const btn = page.locator('[data-action="entrer"]');
  if (await btn.count()) {
    await btn.first().click({ timeout: 10000 }).catch(() => {});
    await wait(4500);
  }
}

/** Appelle une commande de test exposée par l'application (window.__musee.cmd). */
async function cmd(page, name, ...params) {
  await page.evaluate(([n, p]) => window.__musee?.cmd?.(n, ...p), [name, params]);
}

/** Scénarios : chacun reçoit (page, nomViewport) et produit des captures. */
const SCENARIOS = {
  async defaut(page, vp) {
    await waitReady(page);
    await wait(2500);
    await shot(page, `accueil-${vp}`);
    await enter(page);
    await shot(page, `musee-${vp}`);
  },
  async marche(page, vp) {
    await waitReady(page);
    await enter(page);
    await shot(page, `depart-${vp}`);
    await cmd(page, 'marcher', 3);
    await wait(1200);
    await shot(page, `marche-${vp}`);
    await wait(3000);
    await cmd(page, 'portrait');
    await wait(1500);
    await shot(page, `portrait-${vp}`);
  },
  async plan(page, vp) {
    await waitReady(page);
    const res = await page.evaluate(() => window.__musee?.cmd?.('testCollisions'));
    console.log('  Test collisions / navigation :', JSON.stringify(res));
    await SCENARIOS.salles(page, vp);
  },
  async salles(page, vp) {
    await waitReady(page);
    await enter(page);
    for (let i = 0; i < 4; i++) {
      const ok = await page.evaluate((n) => window.__musee?.cmd?.('salle', n), i);
      if (ok === false) break;
      await wait(2500);
      await shot(page, `salle${i + 1}-${vp}`);
    }
  },
  async photo(page, vp) {
    await waitReady(page);
    await enter(page);
    await cmd(page, 'photo', 0);
    await wait(2500);
    await shot(page, `photo-${vp}`);
    await page.keyboard.press('ArrowRight');
    await wait(2200);
    await shot(page, `photo-suivante-${vp}`);
    await page.keyboard.press('Escape');
    await wait(2200);
  },
  async clic(page, vp) {
    // Vrai clic (ou tap) sur une photo visible depuis la position de départ
    await waitReady(page);
    await enter(page);
    // Première photo dont le centre est visible ET non masqué par un mur
    let target = null;
    for (let i = 0; i < 30 && !target; i++) {
      const p = await page.evaluate((n) => window.__musee?.cmd?.('ecran', n), i);
      if (!p?.visible) continue;
      const picked = await page.evaluate(([x, y]) => {
        const r = document.querySelector('#viewport canvas').getBoundingClientRect();
        return window.__musee.app.pickFrame(x - r.left, y - r.top)?.photo.numero ?? null;
      }, [p.x, p.y]);
      if (picked !== null) target = { ...p, picked };
    }
    if (!target) return console.log('  (aucune photo atteignable à cliquer)');
    console.log(`  Photo visée : n° ${target.picked}`);
    if (vp === 'mobile') await page.touchscreen.tap(target.x, target.y);
    else await page.mouse.click(target.x, target.y);
    await wait(2500);
    const mode = await page.evaluate(() => window.__musee?.app?.mode);
    console.log(`  Mode après le clic : ${mode}`);
    await shot(page, `clic-photo-${vp}`);
  },
  async assis(page, vp) {
    await waitReady(page);
    await enter(page);
    await cmd(page, 'banc', 0);
    await wait(9000);
    await shot(page, `assis-${vp}`);
  },
  async danse(page, vp) {
    await waitReady(page);
    await enter(page);
    await cmd(page, 'danse');
    await wait(4000);
    await shot(page, `danse-${vp}`);
  },
  async visite(page, vp) {
    await waitReady(page);
    await enter(page);
    await cmd(page, 'visite');
    await wait(9000);
    await shot(page, `visite-${vp}`);
  },
  async erreur(page, vp) {
    // Config volontairement invalide, servie à la place de config.json
    await page.route('**/config.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ titre: '', prenoms: { lui: 'A' }, salles: [{ id: 'a', nom: 'A' }], photos: [{ fichier: 'photos/x.jpg', salle: 'b', date: '2020-13-45' }] }),
      }),
    );
    await page.reload();
    await wait(2000);
    await shot(page, `erreur-config-${vp}`);
    await page.unroute('**/config.json');
  },
  async vertical(page, vp) {
    if (vp !== 'bureau') return;
    await page.goto(withParams(baseUrl, 'format=9x16'));
    await waitReady(page);
    await wait(1500);
    await page.mouse.click(720, 450);
    await wait(8000);
    await shot(page, `vertical-9x16`);
  },
};

let baseUrl = urlArg;
const consoleIssues = [];

function withParams(url, extra) {
  const u = new URL(url);
  u.searchParams.set('capture', '1');
  for (const kv of extra ? extra.split('&') : []) {
    const [k, v] = kv.split('=');
    u.searchParams.set(k, v ?? '');
  }
  return u.toString();
}

async function shot(page, name) {
  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  📸 ${file}`);
}

async function startPreview() {
  const child = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('vite preview ne démarre pas')), 30000);
    child.stdout.on('data', (d) => {
      if (String(d).includes(String(PORT))) {
        clearTimeout(timer);
        res();
      }
    });
    child.on('exit', (code) => rej(new Error(`vite preview s'est arrêté (${code})`)));
  });
  return child;
}

/**
 * Lance Chromium. Si le navigateur attendu par cette version de Playwright
 * n'est pas installé, on réutilise un Chromium déjà présent dans ms-playwright
 * (ou celui indiqué par la variable CHROMIUM_PATH).
 */
async function launchBrowser() {
  const options = {
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  };
  if (process.env.CHROMIUM_PATH) return chromium.launch({ ...options, executablePath: process.env.CHROMIUM_PATH });
  try {
    return await chromium.launch(options);
  } catch (err) {
    const root =
      process.platform === 'win32'
        ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
        : join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
    const candidates = existsSync(root)
      ? readdirSync(root)
          .filter((d) => /^chromium-\d+$/.test(d))
          .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
          .flatMap((d) => [
            join(root, d, 'chrome-win64', 'chrome.exe'),
            join(root, d, 'chrome-win', 'chrome.exe'),
            join(root, d, 'chrome-linux', 'chrome'),
            join(root, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          ])
          .filter((p) => existsSync(p))
      : [];
    if (!candidates.length) throw err;
    console.log(`(Chromium de repli : ${candidates[0]})`);
    return chromium.launch({ ...options, executablePath: candidates[0] });
  }
}

async function main() {
  let server = null;
  if (!baseUrl) {
    server = await startPreview();
    baseUrl = `http://localhost:${PORT}/`;
  }
  const browser = await launchBrowser();
  const list = names.length ? names : ['defaut'];
  try {
    for (const name of list) {
      const scenario = SCENARIOS[name];
      if (!scenario) {
        console.error(`Scénario inconnu : ${name} (disponibles : ${Object.keys(SCENARIOS).join(', ')})`);
        continue;
      }
      for (const [vpName, options] of Object.entries(VIEWPORTS)) {
        console.log(`▶ ${name} (${vpName})`);
        const context = await browser.newContext(options);
        const page = await context.newPage();
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleIssues.push(`[${name}/${vpName}] console.error : ${msg.text()}`);
        });
        page.on('pageerror', (err) => consoleIssues.push(`[${name}/${vpName}] exception : ${err.message}`));
        page.on('requestfailed', (req) => consoleIssues.push(`[${name}/${vpName}] requête échouée : ${req.url()}`));
        page.on('response', (res) => {
          if (res.status() >= 400) consoleIssues.push(`[${name}/${vpName}] HTTP ${res.status()} : ${res.url()}`);
        });
        await page.goto(withParams(baseUrl));
        await scenario(page, vpName);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  if (consoleIssues.length) {
    console.log(`\n❌ ${consoleIssues.length} problème(s) détecté(s) :`);
    for (const issue of consoleIssues) console.log('  - ' + issue);
    process.exitCode = 1;
  } else {
    console.log('\n✅ Aucune erreur console.');
  }
  // Sur Windows, le serveur lancé via le shell peut survivre : on force la sortie.
  setTimeout(() => process.exit(process.exitCode ?? 0), 200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
