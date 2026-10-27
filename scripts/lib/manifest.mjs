/**
 * Manifeste des fichiers du musée, partagé par le plugin Vite et le script
 * d'optimisation. Il indique au navigateur quelles photos existent vraiment
 * (dimensions après correction EXIF, date de prise de vue, variantes
 * optimisées) et si la musique / les modèles 3D sont présents.
 * Grâce à lui, l'application ne demande jamais un fichier absent :
 * pas d'erreur 404 dans la console.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
export const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);
export const OPT_DIR = 'optimisees';

/** Nom de base des variantes optimisées d'une photo (sous-dossiers aplatis). */
export function variantBase(relFromPhotos) {
  return relFromPhotos.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '__');
}

export const VARIANTS = {
  hd: (base) => `${base}.webp`,
  md: (base) => `${base}-1024.webp`,
  mini: (base) => `${base}-mini.webp`,
};

/** Liste récursive des fichiers de public/photos ayant l'une des extensions (hors variantes). */
function listFiles(photosDir, exts) {
  if (!existsSync(photosDir)) return [];
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name !== OPT_DIR) walk(full);
      } else if (exts.has(extname(name).toLowerCase())) out.push(full);
    }
  };
  walk(photosDir);
  return out.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

/** Images de public/photos et de ses sous-dossiers (un dossier par salle). */
export function listPhotos(photosDir) {
  return listFiles(photosDir, IMAGE_EXT);
}

/** Vidéos de public/photos et de ses sous-dossiers. */
export function listVideos(photosDir) {
  return listFiles(photosDir, VIDEO_EXT);
}

/** Formats déposés mais non lisibles sur le web (HEIC d'iPhone, vidéos AVI…). */
export const UNSUPPORTED_EXT = new Set(['.heic', '.heif', '.dng', '.avi', '.mkv', '.wmv', '.3gp', '.mts']);
export function listUnsupported(photosDir) {
  return listFiles(photosDir, UNSUPPORTED_EXT);
}

const cache = new Map();

/** Métadonnées d'une image : dimensions orientées + date EXIF (avec cache). */
async function readMeta(file) {
  const st = statSync(file);
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  if (cache.has(key)) return cache.get(key);
  let meta = null;
  try {
    const m = await sharp(file).metadata();
    // Orientations EXIF 5 à 8 : l'image est tournée de 90°, on échange largeur et hauteur.
    const rotated = (m.orientation ?? 1) >= 5;
    let date = null;
    try {
      const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
      const d = exif?.DateTimeOriginal ?? exif?.CreateDate;
      if (d instanceof Date && !Number.isNaN(d.getTime())) date = d.toISOString().slice(0, 10);
    } catch {
      /* pas d'EXIF : ce n'est pas une erreur */
    }
    meta = {
      largeur: rotated ? m.height : m.width,
      hauteur: rotated ? m.width : m.height,
      orientationExif: m.orientation ?? 1,
      date,
    };
  } catch (err) {
    console.warn(`[musée] Image illisible ignorée : ${file} (${err.message})`);
  }
  cache.set(key, meta);
  return meta;
}

/** Lit config.json sans planter (l'application affichera l'erreur elle-même). */
export function readConfigSafe(configPath) {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Construit le manifeste.
 * @param {string} root racine du projet
 */
export async function buildManifest(root) {
  const publicDir = join(root, 'public');
  const photosDir = join(publicDir, 'photos');
  const optDir = join(photosDir, OPT_DIR);
  const photos = {};

  for (const file of listPhotos(photosDir)) {
    const meta = await readMeta(file);
    if (!meta) continue;
    const relPhotos = relative(photosDir, file).replace(/\\/g, '/');
    const base = variantBase(relPhotos);
    const srcTime = statSync(file).mtimeMs;
    const variantes = {};
    for (const [k, name] of Object.entries(VARIANTS)) {
      const p = join(optDir, name(base));
      // Une variante plus ancienne que l'original est ignorée (photo remplacée).
      if (existsSync(p) && statSync(p).mtimeMs >= srcTime - 1000) variantes[k] = `photos/${OPT_DIR}/${name(base)}`;
    }
    photos[`photos/${relPhotos}`] = { type: 'image', ...meta, variantes };
  }

  // Vidéos : copiées telles quelles ; le navigateur lit leurs dimensions
  // (rotation des vidéos de téléphone comprise) au chargement.
  for (const file of listVideos(photosDir)) {
    const relPhotos = relative(photosDir, file).replace(/\\/g, '/');
    photos[`photos/${relPhotos}`] = { type: 'video', largeur: null, hauteur: null, orientationExif: 1, date: null, taille: statSync(file).size, variantes: {} };
  }

  // Fichiers optionnels référencés par config.json (musique, modèles 3D)
  const fichiers = {};
  const config = readConfigSafe(join(root, 'config.json'));
  const refs = [];
  if (config) {
    if (typeof config.musique === 'string') refs.push(config.musique);
    for (const who of ['lui', 'elle']) {
      const a = config.avatars?.[who];
      if (typeof a?.modele === 'string') refs.push(a.modele);
      if (typeof a?.animations === 'string') refs.push(a.animations);
    }
  }
  for (const ref of refs) {
    const clean = ref.replace(/^\.?\//, '');
    fichiers[clean] = existsSync(join(publicDir, clean));
  }

  return { version: 1, genere: new Date().toISOString(), photos, fichiers };
}
