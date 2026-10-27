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
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';
import { listPhotos, listUnsupported, listVideos, OPT_DIR, readConfigSafe, variantBase, VARIANTS, VIDEO_VARIANT } from './lib/manifest.mjs';
import { faststart, mp4Info } from './lib/mp4.mjs';

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

/** Crée un dossier par salle de config.json (public/photos/<id>/) s'il manque. */
function ensureRoomFolders() {
  const config = readConfigSafe(resolve('config.json'));
  for (const s of Array.isArray(config?.salles) ? config.salles : []) {
    if (typeof s?.id !== 'string' || !s.id) continue;
    const dir = join(photosDir, s.id);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`📁 Dossier créé pour la salle « ${s.nom ?? s.id} » : public/photos/${s.id}/`);
    }
  }
}

/** Vidéos : pas de conversion (elles sont servies telles quelles), mais on prévient si elles sont lourdes. */
function checkVideos() {
  const videos = listVideos(photosDir);
  for (const v of videos) {
    const mo = statSync(v).size / 1024 / 1024;
    const rel = relative(photosDir, v).replace(/\\/g, '/');
    if (mo > 90) console.log(`⚠ ${rel} : ${mo.toFixed(0)} Mo — GitHub refuse les fichiers de plus de 100 Mo, compressez-la (HandBrake, préréglage « Fast 1080p30 »).`);
    else if (mo > 30) console.log(`ℹ ${rel} : ${mo.toFixed(0)} Mo — lourd pour les téléphones en 4G, une version compressée (720p ou 1080p, H.264) est conseillée.`);
    if (/\.mov$/i.test(v)) console.log(`ℹ ${rel} : les .mov d'iPhone (HEVC) ne sont pas lus par Chrome sur Android/Windows ; préférez MP4 (H.264).`);
  }
  if (videos.length) console.log(`${videos.length} vidéo(s) trouvée(s).`);
  const hevc = videos.filter((v) => {
    try {
      return /^(hvc1|hev1)$/.test(mp4Info(v)?.codec ?? '');
    } catch {
      return false;
    }
  });
  if (hevc.length) {
    console.log(
      `ℹ ${hevc.length} vidéo(s) en HEVC (H.265) : lues sur iPhone, Mac, PC Windows récents et la plupart des Android récents ; ` +
        'ailleurs, le cadre affiche une affiche « Vidéo ». Pour une compatibilité totale : MP4 H.264 (HandBrake, ou réglage « Le plus compatible » du téléphone).',
    );
  }
  for (const f of listUnsupported(photosDir)) {
    const rel = relative(photosDir, f).replace(/\\/g, '/');
    const heic = /\.hei[cf]$/i.test(f);
    if (heic && existsSync(f.replace(/\.hei[cf]$/i, '.jpg'))) continue; // déjà converti
    console.log(
      `⚠ ${rel} : format non affichable sur le web, fichier ignoré. ` +
        (heic
          ? 'Exportez-le en JPEG (Photos Windows : « Enregistrer sous » → JPEG ; iPhone : Réglages → Appareil photo → Formats → « Le plus compatible »).'
          : 'Convertissez la vidéo en MP4 (H.264), par exemple avec HandBrake.'),
    );
  }
}

/**
 * Photos HEIC/HEIF (iPhone, Samsung…) : conversion automatique en JPEG à côté
 * de l'original (Windows : décodeur intégré ; macOS : sips). L'original est conservé.
 */
async function convertHeic() {
  const files = listUnsupported(photosDir).filter((f) => /\.hei[cf]$/i.test(f));
  let converted = 0;
  for (const f of files) {
    const out = f.replace(/\.hei[cf]$/i, '.jpg');
    if (existsSync(out)) continue;
    const rel = relative(photosDir, f).replace(/\\/g, '/');
    let res = null;
    if (process.platform === 'win32') {
      // Windows décode en PNG (sans perte), puis sharp écrit le JPEG avec la date de prise de vue.
      const tmp = join(tmpdir(), `musee-heic-${process.pid}-${converted}.png`);
      res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts', 'lib', 'heic-to-jpg.ps1'), '-Source', f, '-Destination', tmp], { encoding: 'utf8' });
      if (res.status === 0 && existsSync(tmp)) {
        try {
          const exif = await exifr.parse(f, ['DateTimeOriginal', 'CreateDate']).catch(() => null);
          const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
          let img = sharp(tmp).jpeg({ quality: 92, mozjpeg: true });
          if (d instanceof Date && !Number.isNaN(d.getTime())) img = img.withExif({ IFD2: { DateTimeOriginal: exifDate(d) } });
          await img.toFile(out);
        } finally {
          unlinkSync(tmp);
        }
      }
    } else if (process.platform === 'darwin') {
      res = spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', f, '--out', out], { encoding: 'utf8' });
    }
    if (res && res.status === 0 && existsSync(out)) {
      converted++;
      console.log(`✓ ${rel} → converti en JPEG`);
    } else if (res) {
      console.log(`✗ ${rel} : conversion impossible (${(res.stderr || res.stdout || '').trim().split('\n')[0] || 'erreur inconnue'}).`);
      if (process.platform === 'win32') console.log('  Installez « Extensions d’image HEIF » depuis le Microsoft Store, ou exportez la photo en JPEG.');
    }
  }
  if (converted) console.log(`${converted} photo(s) HEIC convertie(s) en JPEG (les originaux .heic peuvent être supprimés).`);
}

/** Date au format EXIF « AAAA:MM:JJ HH:MM:SS » (heure locale, comme l'appareil). */
function exifDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Vidéos MP4/MOV dont l'index est à la fin (cas fréquent sur téléphone) :
 * copie « lecture immédiate » dans optimisees/ avec l'index au début.
 * Sans réencodage : l'image et le son sont identiques, seul l'ordre change.
 */
function optimizeVideos(videos, expected) {
  let made = 0;
  for (const file of videos) {
    if (!/\.(mp4|m4v|mov)$/i.test(file)) continue;
    const rel = relative(photosDir, file).replace(/\\/g, '/');
    let info = null;
    try {
      info = mp4Info(file);
    } catch {
      /* format non reconnu : servie telle quelle */
    }
    if (!info || info.faststart) continue;
    const name = VIDEO_VARIANT(variantBase(rel));
    const out = join(optDir, name);
    expected.add(name);
    if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs) continue;
    const buf = readFileSync(file);
    const fixed = faststart(buf);
    if (!fixed || fixed.length !== buf.length) {
      expected.delete(name);
      console.log(`ℹ ${rel} : réorganisation impossible, vidéo servie telle quelle.`);
      continue;
    }
    writeFileSync(out, fixed);
    made++;
    console.log(`✓ ${rel} → lecture immédiate (index déplacé au début, sans réencodage)`);
  }
  return made;
}

async function main() {
  ensureRoomFolders();
  await convertHeic();
  checkVideos();
  const files = listPhotos(photosDir);
  const videos = listVideos(photosDir);
  if (!files.length && !videos.length) {
    console.log('Aucune photo dans public/photos/ : déposez vos images dans le dossier de chaque salle (rencontre, voyages, nous…) puis relancez « npm run photos ».');
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
  const videosMade = optimizeVideos(videos, expected);

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
      (savedBytes ? `\nGain sur les versions HD : ${(savedBytes / 1024 / 1024).toFixed(1)} Mo` : '') +
      (videos.length ? `\n${videos.length} vidéo(s) : ${videosMade} préparée(s) pour une lecture immédiate` : ''),
  );
  if (failed) process.exitCode = 1;
}

main();
