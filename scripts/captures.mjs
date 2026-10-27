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
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startPreview } from './lib/browser.mjs';

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
  await btn.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await btn.count()) {
    await wait(1000); // fondu d'apparition de l'écran d'accueil
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
  /** Statistiques de rendu (appels de dessin, triangles, mémoire GPU, i/s). */
  async perf(page, vp) {
    for (const q of vp === 'bureau' ? ['haute', 'basse'] : ['basse']) {
      await page.goto(withParams(baseUrl, `qualite=${q}`));
      await waitReady(page);
      await enter(page);
      await cmd(page, 'marcher', 4);
      await wait(5000);
      const s = await page.evaluate(() => window.__musee.cmd('stats'));
      console.log(`  qualité ${q} : ${JSON.stringify(s)}`);
    }
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
  async aide(page, vp) {
    await waitReady(page);
    await enter(page);
    await page.locator('[data-hud="help"]').click();
    await wait(600);
    await shot(page, `aide-${vp}`);
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
  /** Vidéo : lecture sans le son dans le cadre, puis avec le son en mode photo. */
  async video(page, vp) {
    await waitReady(page);
    await enter(page);
    const idx = await page.evaluate(() => window.__musee.app.world.frames.findIndex((f) => f.photo.type === 'video'));
    if (idx < 0) return console.log('  (aucune vidéo dans le musée)');
    const room = await page.evaluate((i) => window.__musee.app.world.frames[i].room, idx);
    await cmd(page, 'salle', room);
    await wait(3500);
    const inFrame = await page.evaluate((i) => {
      const f = window.__musee.app.world.frames[i];
      const map = f.photoMesh.material.map;
      const v = map?.image;
      const real = v?.videoWidth ? v.videoWidth / v.videoHeight : null;
      return {
        videoTexture: !!map?.isVideoTexture,
        playing: v ? !v.paused : false,
        muted: v?.muted,
        formatCadre: Math.round(f.photo.aspect * 100) / 100,
        formatVideo: real && Math.round(real * 100) / 100,
      };
    }, idx);
    console.log(`  Dans le cadre : ${JSON.stringify(inFrame)}`);
    if (!inFrame.videoTexture || !inFrame.playing || !inFrame.muted) consoleIssues.push(`[video/${vp}] la vidéo ne joue pas sans le son dans son cadre`);
    if (inFrame.formatVideo && Math.abs(inFrame.formatCadre - inFrame.formatVideo) > 0.05) consoleIssues.push(`[video/${vp}] cadre ${inFrame.formatCadre} ≠ vidéo ${inFrame.formatVideo} (image déformée)`);
    await shot(page, `video-salle-${vp}`);
    await cmd(page, 'photo', idx);
    await wait(2500);
    const big = await page.evaluate((i) => {
      const v = window.__musee.app.world.frames[i].photoMesh.material.map.image;
      const btn = document.querySelector('.pp-son');
      return { playing: !v.paused, muted: v.muted, time: Math.round(v.currentTime * 10) / 10, bouton: btn && !btn.hidden ? btn.textContent.trim() : null };
    }, idx);
    console.log(`  En grand : ${JSON.stringify(big)}`);
    if (!big.playing || big.muted || !big.bouton) consoleIssues.push(`[video/${vp}] la vidéo ne joue pas avec le son en mode photo`);
    await shot(page, `video-photo-${vp}`);
    await page.keyboard.press('Escape');
    await wait(1500);
    const after = await page.evaluate((i) => window.__musee.app.world.frames[i].photoMesh.material.map.image.muted, idx);
    if (!after) consoleIssues.push(`[video/${vp}] la vidéo garde le son après le retour`);
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
    // Pendant la pause devant la première photo (plan fixe), les avatars doivent être immobiles.
    const ok = await page
      .waitForFunction(() => window.__musee.app.director.mode === 'shot', null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) consoleIssues.push(`[visite/${vp}] la visite n'atteint pas la première photo`);
    await wait(1200);
    const anims = await page.evaluate(() => [window.__musee.app.player.current, window.__musee.app.partner.current]);
    console.log(`  Animations pendant la pause : ${anims.join(' / ')}`);
    if (anims.some((a) => a !== 'Idle')) consoleIssues.push(`[visite/${vp}] avatars non immobiles devant la photo : ${anims.join(' / ')}`);
    await shot(page, `visite-${vp}`);
  },
  /** Visite complète accélérée : vérifie qu'elle va jusqu'à la danse finale. */
  async 'visite-complete'(page, vp) {
    if (vp !== 'bureau') return;
    await page.goto(withParams(baseUrl, 'pause=0.3'));
    await waitReady(page);
    await enter(page);
    await cmd(page, 'visite');
    const t0 = Date.now();
    let last = '';
    let bancs = 0;
    while (Date.now() - t0 < 6 * 60 * 1000) {
      const s = await page.evaluate(() => {
        const a = window.__musee.app;
        return { mode: a.mode, step: a.tour.step, running: a.tour.running, sit: a.player.current, fps: Math.round(a.fps) };
      });
      const key = `${s.step}`;
      if (key !== last) {
        console.log(`  étape ${s.step === -1 ? 'finale' : s.step + 1} (mode ${s.mode}, ${s.fps} i/s)`);
        last = key;
        if (s.step === -1) {
          await wait(4000);
          await shot(page, `visite-finale-${vp}`);
        }
      }
      if (s.sit === 'SitIdle' || s.sit === 'Sit') bancs = Math.max(bancs, 1);
      if (!s.running) {
        console.log(`  ✓ visite terminée en ${Math.round((Date.now() - t0) / 1000)} s, mode final : ${s.mode}${bancs ? ', passage assis observé' : ''}`);
        return;
      }
      await wait(500);
    }
    console.log('  ✗ la visite ne s’est pas terminée à temps');
    consoleIssues.push('[visite-complete] délai dépassé');
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

async function main() {
  let server = null;
  if (!baseUrl) {
    server = await startPreview(PORT);
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
        page.on('requestfailed', (req) => {
          const reason = req.failure()?.errorText ?? '';
          // Une vidéo interrompt normalement ses requêtes (lecture des métadonnées, pause, saut) : ce n'est pas une erreur.
          if (req.resourceType() === 'media' && reason.includes('ERR_ABORTED')) return;
          consoleIssues.push(`[${name}/${vpName}] requête échouée (${reason}) : ${req.url()}`);
        });
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
