import { parseDate } from '../utils/dates';

/**
 * Informations tirées du nom d'un fichier déposé dans un dossier de salle :
 * type (photo ou vidéo), date et titre lisible.
 *   « 2020-02-14 Premier café.jpg »  → date 2020-02-14, titre « Premier café »
 *   « IMG_20210403_101500.jpg »      → date 2021-04-03, pas de titre
 *   « 03 - Plage de Kribi.mp4 »      → vidéo, titre « Plage de Kribi »
 */

export const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;

export function isVideoFile(path: string): boolean {
  return VIDEO_EXT.test(path);
}

/** Nom du fichier sans dossier ni extension. */
function baseName(path: string): string {
  return path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '');
}

const DATE_IN_NAME = /(?:^|[^0-9])((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?![0-9])/;

/** Date contenue dans le nom (2020-02-14, 20200214, IMG-20200214-WA0001…), au format AAAA-MM-JJ. */
export function dateFromFileName(path: string): string | null {
  const m = baseName(path).match(DATE_IN_NAME);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return parseDate(iso) ? iso : null;
}

/** Préfixes automatiques des appareils photo (« IMG_1234 », « DSC01234 »…). */
const CAMERA = /^(img|vid|pxl|dsc[nf]?|mvimg|mov|gopr|dji|wa\d+)(?![a-z])/i;
/** Mots génériques, ignorés seulement s'ils ne sont suivis de rien d'utile (« Photo de mariage » est gardé). */
const GENERIC = /^(photo|image|video|vidéo|screenshot|capture( d'écran)?|whatsapp( image| video)?|signal|snapchat|received)[\s\d\-_.()]*(at)?[\s\d\-_.()]*$/i;

/** Titre lisible tiré du nom, ou chaîne vide si le nom n'apporte rien. */
export function titleFromFileName(path: string): string {
  let s = baseName(path);
  s = s.replace(DATE_IN_NAME, ' ');
  s = s.replace(/\b\d{2}[-_.h]\d{2}[-_.m]\d{2}s?\b/gi, ' '); // heures « 10.15.00 »
  s = s.replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^\d{1,3}\s*[-.)]?\s+/, ''); // numérotation « 01 - », « 3. »
  s = s.replace(/^[-–—\s]+|[-–—\s]+$/g, '');
  if (!s || CAMERA.test(s) || GENERIC.test(s) || /^[\d\s\-.()]+$/.test(s) || /\bwa\d+\b/i.test(s)) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Forme comparable d'un nom de dossier ou de salle (minuscules, sans accents ni espaces). */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
