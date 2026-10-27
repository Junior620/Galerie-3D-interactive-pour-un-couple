#!/usr/bin/env node
/**
 * npm run photos
 *
 * Lit public/photos/, corrige l'orientation EXIF, et génère dans
 * public/photos/optimisees/ pour chaque photo :
 *   - <nom>.webp        2048 px max (ordinateur)
 *   - <nom>-1024.webp   1024 px max (téléphone)
 *   - <nom>-mini.webp    320 px max (miniature, chargée en premier)
 * Les originaux ne sont jamais modifiés. Les variantes déjà à jour sont
 * conservées ; celles dont l'original a disparu sont supprimées.
 *
 * Options : --force (tout régénérer), --qualite=82
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { listPhotos, OPT_DIR, variantBase, VARIANTS } from './lib/manifest.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const quality = Number(args.find((a) => a.startsWith('--qualite='))?.split('=')[1] ?? 82);

const photosDir = resolve('public', 'photos');
const optDir = join(photosDir, OPT_DIR);

const SIZES = [
  ['hd', 2048, quality],
  ['md', 1024, quality],
  ['mini', 320, 70],
];

async function main() {
  const files = listPhotos(photosDir);
  if (!files.length) {
    console.log('Aucune photo dans public/photos/ : déposez-y vos images (JPG, PNG, WebP…) puis relancez « npm run photos ».');
    console.log("En attendant, le musée affiche des images de remplacement.");
    return;
  }
  mkdirSync(optDir, { recursive: true });
  sharp.cache(false);

  const expected = new Set();
  let made = 0;
  let skipped = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const file of files) {
    const rel = relative(photosDir, file).replace(/\\/g, '/');
    const base = variantBase(rel);
    const srcStat = statSync(file);
    for (const [kind, size, q] of SIZES) {
      const outName = VARIANTS[kind](base);
      const out = join(optDir, outName);
      expected.add(outName);
      if (!force && existsSync(out) && statSync(out).mtimeMs >= srcStat.mtimeMs) {
        skipped++;
        continue;
      }
      try {
        // rotate() sans argument applique l'orientation EXIF puis la supprime.
        const info = await sharp(file)
          .rotate()
          .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: q, effort: 5 })
          .toFile(out);
        made++;
        if (kind === 'hd') savedBytes += Math.max(0, srcStat.size - info.size);
      } catch (err) {
        failed++;
        console.error(`✗ ${rel} (${kind}) : ${err.message}`);
      }
    }
    console.log(`✓ ${rel}`);
  }

  // Nettoyage des variantes orphelines
  let removed = 0;
  for (const name of readdirSync(optDir)) {
    if (!expected.has(name)) {
      unlinkSync(join(optDir, name));
      removed++;
    }
  }

  console.log(
    `\n${files.length} photo(s) : ${made} variante(s) générée(s), ${skipped} déjà à jour, ${removed} supprimée(s)` +
      (failed ? `, ${failed} échec(s)` : '') +
      (savedBytes ? `\nGain sur les versions HD : ${(savedBytes / 1024 / 1024).toFixed(1)} Mo` : ''),
  );
  if (failed) {
    console.log('Astuce : les fichiers HEIC (iPhone) ne sont pas pris en charge, exportez-les en JPEG.');
    process.exitCode = 1;
  }
}

main();
