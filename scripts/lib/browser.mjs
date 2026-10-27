/**
 * Outils communs aux scripts Playwright (captures, image d'aperçu).
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

/** Lance « vite preview » sur le dossier dist/ et attend qu'il réponde. */
export async function startPreview(port) {
  const child = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('vite preview ne démarre pas')), 30000);
    child.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
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
export async function launchBrowser() {
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

/** Attend que l'application signale qu'elle est prête. */
export async function waitReady(page, timeout = 60000) {
  await page.waitForFunction(() => window.__musee?.ready === true, null, { timeout }).catch(() => {});
}

/** Clique sur « Entrer dans le musée » dès que l'écran d'accueil est affiché. */
export async function enter(page, settle = 4500) {
  const btn = page.locator('[data-action="entrer"]');
  await btn.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await btn.count()) {
    await new Promise((r) => setTimeout(r, 1000)); // fondu d'apparition de l'écran d'accueil
    await btn.first().click({ timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, settle));
  }
}
