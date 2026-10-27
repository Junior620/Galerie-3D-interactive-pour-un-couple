import { dateFromFileName, isVideoFile, slug, titleFromFileName } from './fileNames';
import type { Manifest, Musee, MuseeConfig, ParsedDate, Photo, PhotoConfig, Room } from './types';
import { validateConfig } from './validate';
import { formatDate, parseDate } from '../utils/dates';
import type { DeviceProfile } from '../utils/device';

/** Erreur de configuration à afficher à l'utilisateur (liste de problèmes). */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}

/** Traduit une erreur JSON.parse en message lisible avec ligne et colonne. */
function jsonErrorMessage(err: unknown, text: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const pos = msg.match(/position (\d+)/);
  let where = '';
  const lc = msg.match(/line (\d+) column (\d+)/);
  if (lc) where = ` (ligne ${lc[1]}, colonne ${lc[2]})`;
  else if (pos) {
    const before = text.slice(0, +pos[1]);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    where = ` (ligne ${line}, colonne ${col})`;
  }
  return `config.json n'est pas un JSON valide${where}. Vérifiez les virgules, les guillemets droits "…" et les accolades. Détail : ${msg}`;
}

/**
 * Charge config.json + le manifeste des fichiers, valide, puis normalise :
 * répartition automatique des photos sans salle, choix des portraits de la
 * cloison, tri chronologique et sources d'images adaptées à l'appareil.
 */
export async function loadMusee(profile: DeviceProfile): Promise<Musee> {
  let text: string;
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new ConfigError([`Impossible de lire config.json (HTTP ${res.status}). Le fichier doit se trouver à la racine du site.`]);
    text = await res.text();
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    throw new ConfigError(['Impossible de charger config.json. Ouvrez le site via « npm run dev » ou un serveur web (pas en double-cliquant sur index.html).']);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ConfigError([jsonErrorMessage(e, text)]);
  }
  const { config, errors, warnings } = validateConfig(raw);
  if (errors.length) throw new ConfigError(errors);

  let manifest: Manifest = { version: 1, photos: {}, fichiers: {} };
  try {
    const res = await fetch('musee-manifest.json', { cache: 'no-store' });
    if (res.ok) manifest = await res.json();
  } catch {
    warnings.push('Manifeste des fichiers indisponible : toutes les photos seront remplacées.');
  }
  // Format des vidéos : lu par le navigateur (il applique la rotation des vidéos de téléphone).
  const videos = Object.entries(manifest.photos).filter(([, m]) => m.type === 'video').map(([f]) => f);
  const aspects = new Map<string, number>();
  await Promise.all(
    videos.map(async (f) => {
      const a = await probeVideoAspect(f);
      if (a) aspects.set(f, a);
      else warnings.push(`Vidéo non lisible par ce navigateur : public/${f} (préférez le format MP4 H.264).`);
    }),
  );
  return normalize(config, manifest, warnings, profile, aspects);
}

/** Largeur / hauteur d'une vidéo (ou null si le navigateur ne sait pas la lire). */
function probeVideoAspect(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      v.removeAttribute('src');
      v.load();
      resolve(value);
    };
    v.preload = 'metadata';
    v.muted = true;
    v.addEventListener('loadedmetadata', () => finish(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null));
    v.addEventListener('error', () => finish(null));
    setTimeout(() => finish(null), 10000);
    v.src = url;
  });
}

/** « Souvenir du 14 février 2020 », « Vidéo d’août 2021 », « Souvenir de 2019 ». */
function defaultTitle(prefix: string, date: ParsedDate | null): string {
  if (!date) return prefix;
  const label = formatDate(date);
  if (date.jour) return `${prefix} du ${label}`;
  return /^[aeiouéèêh]/i.test(label) ? `${prefix} d’${label}` : `${prefix} de ${label}`;
}

/** Format des images de remplacement (variés, mais stables d'un chargement à l'autre). */
function placeholderAspect(index: number, grand: boolean, partition: boolean): number {
  if (partition) return 4 / 5;
  if (grand) return index % 2 ? 16 / 9 : 2.6;
  return [3 / 2, 2 / 3, 4 / 3, 4 / 5, 3 / 2, 1, 3 / 4, 16 / 9][index % 8];
}

export function normalize(
  config: MuseeConfig,
  manifest: Manifest,
  warnings: string[],
  profile: DeviceProfile,
  videoAspects: Map<string, number> = new Map(),
): Musee {
  const cloisonIds = new Set(config.salles.filter((s) => s.cloisonCentrale).map((s) => s.id));

  // Un dossier par salle : public/photos/<id ou nom de la salle>/
  const roomByFolder = new Map<string, string>();
  for (const s of config.salles) {
    roomByFolder.set(slug(s.nom), s.id);
    roomByFolder.set(slug(s.id), s.id);
  }
  const folderRoom = (fichier: string): string => {
    const parts = fichier.split('/');
    return parts.length >= 3 ? roomByFolder.get(slug(parts[1])) ?? '' : '';
  };

  // Entrées de config.json, puis fichiers déposés dans les dossiers sans y être déclarés.
  const files = Object.keys(manifest.photos);
  const hasMedia = files.length > 0;
  const listed = new Set(config.photos.map((p) => p.fichier));
  const missing: string[] = [];
  let entries: PhotoConfig[] = [];
  for (const p of config.photos) {
    if (p.fichier && !manifest.photos[p.fichier]) {
      missing.push(p.fichier);
      // De vraies photos existent : les entrées sans fichier (exemples) sont ignorées.
      if (hasMedia) continue;
    }
    entries.push(p);
  }
  for (const f of files) if (!listed.has(f)) entries.push({ fichier: f });
  if (missing.length) {
    const list = missing.length > 4 ? `${missing.slice(0, 4).join(', ')}… (+${missing.length - 4})` : missing.join(', ');
    warnings.push(
      hasMedia
        ? `${missing.length} entrée(s) de config.json sans fichier, ignorée(s) : ${list}.`
        : `${missing.length} photo(s) introuvable(s) dans public/ : ${list}. Des images de remplacement sont affichées.`,
    );
  }

  // Aucune photo : on génère une collection de démonstration.
  if (!entries.length) {
    warnings.push('Aucune photo : des images de remplacement numérotées sont affichées.');
    entries = config.salles.flatMap((s) =>
      Array.from({ length: s.cloisonCentrale ? 5 : 6 }, (_, k) => ({
        fichier: '',
        salle: s.id,
        titre: `${s.nom} — ${k + 1}`,
        grandFormat: s.cloisonCentrale ? k < 2 : k === 3,
      })),
    );
  }

  const photos: Photo[] = entries.map((p, index) => {
    const info = p.fichier ? manifest.photos[p.fichier] : undefined;
    const video = info?.type === 'video' || (!!p.fichier && isVideoFile(p.fichier));
    // Date : config.json, sinon EXIF, sinon nom du fichier.
    const nameDate = p.fichier ? dateFromFileName(p.fichier) : null;
    const date: ParsedDate | null = p.date ? parseDate(p.date) : info?.date ? parseDate(info.date) : nameDate ? parseDate(nameDate) : null;
    let sources: Photo['sources'] = null;
    let aspect = 1;
    if (info && video) {
      aspect = videoAspects.get(p.fichier) ?? 16 / 9;
      sources = { full: p.fichier };
    } else if (info && info.largeur && info.hauteur) {
      aspect = info.largeur / info.hauteur;
      const v = info.variantes;
      const full = profile.textureSize <= 1024 ? v.md ?? v.hd ?? p.fichier : v.hd ?? p.fichier;
      sources = { full, mini: v.mini };
    }
    const titre = p.titre?.trim() || (p.fichier ? titleFromFileName(p.fichier) : '') || defaultTitle(video ? 'Vidéo' : 'Souvenir', date);
    return {
      index,
      type: video ? 'video' : 'image',
      fichier: p.fichier,
      salle: p.salle || folderRoom(p.fichier),
      titre,
      date,
      dateLabel: formatDate(date),
      lieu: p.lieu?.trim() ?? '',
      legende: p.legende?.trim() ?? '',
      grand: p.grandFormat === true,
      partition: false,
      cadre: p.cadre ?? 'noir',
      aspect,
      orientation: 'paysage',
      placeholder: !sources,
      sources,
      numero: 0,
    };
  });

  assignRooms(photos, config);

  // Choix des portraits de la cloison : les grands formats d'abord, sinon on
  // promeut les premiers portraits de la salle pour en avoir au moins deux.
  for (const id of cloisonIds) {
    const inRoom = sortChrono(photos.filter((p) => p.salle === id));
    const chosen = inRoom.filter((p) => p.grand).slice(0, 4);
    const isPortrait = (p: Photo) => p.placeholder || p.aspect < 0.95;
    for (const p of inRoom) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p) && isPortrait(p)) chosen.push(p);
    }
    for (const p of inRoom) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p)) chosen.push(p);
    }
    for (const p of chosen) {
      p.partition = true;
      p.grand = true;
    }
  }

  // Formats des images de remplacement et orientation
  for (const p of photos) {
    if (p.placeholder) p.aspect = placeholderAspect(p.index, p.grand, p.partition);
    p.orientation = p.aspect > 1.05 ? 'paysage' : p.aspect < 0.95 ? 'portrait' : 'carre';
  }

  // Salles, ordre chronologique et couleur des cadres
  const rooms: Room[] = config.salles.map((s, index) => {
    const list = sortChrono(photos.filter((p) => p.salle === s.id));
    for (const p of list) p.cadre = entries[p.index]?.cadre ?? s.cadre ?? (index % 2 === 0 ? 'noir' : 'blanc');
    return { index, id: s.id, nom: s.nom, cloison: s.cloisonCentrale, photos: list };
  });
  const ordered = rooms.flatMap((r) => r.photos);
  ordered.forEach((p, i) => (p.numero = i + 1));

  for (const w of warnings) console.warn(`[musée] ${w}`);

  return {
    config,
    rooms,
    photos: ordered,
    manifest,
    warnings,
    hasFile: (path) => !!path && manifest.fichiers[path.replace(/^\.?\//, '')] === true,
  };
}

/** Tri chronologique ; les photos sans date suivent, dans l'ordre du fichier. */
function sortChrono(list: Photo[]): Photo[] {
  return [...list].sort((a, b) => {
    const ta = a.date?.time ?? Infinity;
    const tb = b.date?.time ?? Infinity;
    return ta === tb ? a.index - b.index : ta - tb;
  });
}

/**
 * Répartit les photos sans salle : chacune rejoint la salle dont la période
 * (dates des photos déjà placées) est la plus proche de sa date. Si aucune
 * salle n'a de photo datée, on découpe la chronologie en parts égales.
 * Les photos sans date vont dans la salle la moins remplie.
 */
function assignRooms(photos: Photo[], config: MuseeConfig): void {
  const ids = config.salles.map((s) => s.id);
  const free = sortChrono(photos.filter((p) => !p.salle));
  if (!free.length) return;

  const ranges = new Map<string, [number, number]>();
  for (const p of photos) {
    if (!p.salle || !p.date) continue;
    const r = ranges.get(p.salle);
    ranges.set(p.salle, r ? [Math.min(r[0], p.date.time), Math.max(r[1], p.date.time)] : [p.date.time, p.date.time]);
  }
  const count = (id: string) => photos.filter((p) => p.salle === id).length;

  if (!ranges.size) {
    // Découpage régulier de la chronologie entre les salles, dans l'ordre.
    free.forEach((p, i) => (p.salle = ids[Math.min(ids.length - 1, Math.floor((i * ids.length) / free.length))]));
    return;
  }
  for (const p of free) {
    if (!p.date) {
      p.salle = ids.reduce((best, id) => (count(id) < count(best) ? id : best), ids[0]);
      continue;
    }
    let best = ids[0];
    let bestDist = Infinity;
    for (const id of ids) {
      const r = ranges.get(id);
      if (!r) continue;
      const t = p.date.time;
      const d = t < r[0] ? r[0] - t : t > r[1] ? t - r[1] : 0;
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    p.salle = best;
  }
}
