#!/usr/bin/env node
/**
 * npm run og
 *
 * Génère public/og-image.jpg (1200 × 630), l'image affichée dans l'aperçu des
 * liens (WhatsApp, Telegram, Facebook, X…) : titre et prénoms à gauche, vraie
 * vue 3D du musée à droite (le couple devant les grands portraits).
 *
 * À relancer quand le titre, les prénoms ou les grands portraits changent :
 *   npm run build && npm run og && npm run build
 * (le premier build sert à photographier le musée, le second copie l'image dans dist/).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { enter, launchBrowser, startPreview, waitReady } from './lib/browser.mjs';

const PORT = 4318;
const OUT = resolve('public', 'og-image.jpg');

async function main() {
  if (!existsSync(resolve('dist', 'index.html'))) {
    console.error('Lancez d’abord « npm run build ».');
    process.exit(1);
  }
  const server = await startPreview(PORT);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/?capture=1&qualite=haute`);
    await waitReady(page);
    await enter(page);

    // Mise en scène : le couple de dos devant les grands portraits, plan large.
    await page.evaluate(() => {
      const a = window.__musee.app;
      const rooms = a.world.layout.rooms;
      const room = rooms.find((r) => r.partition) ?? rooms[rooms.length - 1];
      a.setMode('visite'); // fige le compagnon pendant la prise de vue
      const v = (x, y, z) => a.player.position.clone().set(x, y, z);
      let cam;
      let look;
      if (room.partition) {
        const face = room.partition.center.x - room.partition.thickness / 2;
        a.player.position.set(face - 2.1, 0, -0.5);
        a.partner.position.set(face - 2.1, 0, 0.5);
        cam = v(face - 4.9, 1.75, 0);
        look = v(face, 1.6, 0);
      } else {
        const c = room.center;
        a.player.position.set(c.x - 0.5, 0, -1);
        a.partner.position.set(c.x + 0.5, 0, -1);
        cam = v(c.x, 1.8, 2.5);
        look = v(c.x, 1.6, -5);
      }
      const yaw = Math.atan2(look.x - a.player.position.x, look.z - a.player.position.z);
      for (const av of [a.player, a.partner]) {
        av.yaw = av.targetYaw = yaw;
        av.velocity.set(0, 0, 0);
        av.play('Idle', 0);
      }
      a.world.camera.fov = 60;
      a.world.camera.updateProjectionMatrix();
      a.director.shot(cam, look, 0.01);

      // Composition 1200 × 630 : panneau de texte (560 px) + vue 3D (640 px)
      const style = document.createElement('style');
      style.textContent = `
        #ui { display: none !important; }
        #app { justify-content: flex-end !important; }
        #viewport { width: 640px !important; height: 630px !important; flex: none !important; }`;
      document.head.appendChild(style);

      const cfg = a.world.musee.config;
      const panel = document.createElement('div');
      panel.style.cssText =
        'position:fixed;left:0;top:0;width:560px;height:630px;box-sizing:border-box;padding:0 52px 0 64px;' +
        'display:flex;flex-direction:column;justify-content:center;background:#f6f4f0;color:#1d1c1a;z-index:10;' +
        'box-shadow:12px 0 40px rgba(20,18,15,0.10);';
      const el = (tag, css, text) => {
        const e = document.createElement(tag);
        e.style.cssText = css;
        e.textContent = text;
        panel.appendChild(e);
        return e;
      };
      const sans = "'Inter Variable', system-ui, sans-serif";
      const serif = "'Cormorant Garamond', Georgia, serif";
      el('div', `font:600 13px/1.4 ${sans};letter-spacing:.32em;text-transform:uppercase;color:#6f6a64;`, 'Musée virtuel en 3D');
      const big = cfg.titre.length <= 14;
      el('div', `font:300 ${big ? 78 : 60}px/0.98 ${serif};margin-top:18px;letter-spacing:-0.01em;`, cfg.titre);
      el('div', `font:italic 400 40px/1.15 ${serif};color:#6d5f50;margin-top:18px;`, `${cfg.prenoms.lui} & ${cfg.prenoms.elle}`);
      el('div', 'width:64px;height:1px;background:rgba(29,28,26,0.35);margin:30px 0 26px;', '');
      if (cfg.sousTitre) el('div', `font:500 14px/1.6 ${sans};letter-spacing:.2em;text-transform:uppercase;color:#6f6a64;`, cfg.sousTitre);
      const foot = el('div', `font:400 15px/1.5 ${sans};color:#6f6a64;margin-top:34px;display:flex;align-items:center;gap:10px;`, '');
      foot.innerHTML = '<span style="color:#b3202a;font-size:18px">❤</span>';
      foot.append('Visite à pied, photo après photo');
      document.body.appendChild(panel);
    });

    // Laisse le temps au redimensionnement, aux spots et aux textures.
    await page.waitForTimeout(3500);
    const png = await page.screenshot({ type: 'png' });
    const info = await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(OUT);
    console.log(`✓ ${OUT} (${info.width}×${info.height}, ${Math.round(info.size / 1024)} Ko)`);
    console.log('Relancez « npm run build » pour copier l’image dans dist/, puis redéployez.');
  } finally {
    await browser.close();
    server.kill();
  }
  setTimeout(() => process.exit(0), 200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
