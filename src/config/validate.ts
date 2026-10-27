import type { AvatarConfig, Coiffure, MuseeConfig, PhotoConfig, SalleConfig, Tenue } from './types';
import { parseDate } from '../utils/dates';

/**
 * Validation de config.json : renvoie la config complétée par les valeurs
 * par défaut, la liste des erreurs bloquantes et des avertissements.
 * Les messages sont en français et indiquent le chemin du champ.
 */
export interface ValidationResult {
  config: MuseeConfig;
  errors: string[];
  warnings: string[];
}

const COIFFURES: Coiffure[] = ['courte', 'rasee', 'afro', 'longue', 'chignon', 'tresses'];
const TENUES: Tenue[] = ['pantalon', 'jupe', 'robe'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const DEFAULT_AVATARS: Record<'lui' | 'elle', AvatarConfig> = {
  lui: { peau: '#8d5524', cheveux: '#1b1b1b', haut: '#2b3a55', bas: '#1f1f1f', chaussures: '#2a2522', coiffure: 'courte', tenue: 'pantalon', taille: 1 },
  elle: { peau: '#8d5524', cheveux: '#1b1b1b', haut: '#b3202a', bas: '#1f1f1f', chaussures: '#2a2522', coiffure: 'tresses', tenue: 'jupe', taille: 0.95 },
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isObj(raw)) {
    return { config: null as unknown as MuseeConfig, errors: ['Le fichier doit contenir un objet JSON { … }.'], warnings };
  }

  // --- Champs texte obligatoires ---
  if (!isStr(raw.titre)) errors.push('« titre » est manquant (ex. : "titre": "Notre Musée").');
  const prenoms = isObj(raw.prenoms) ? raw.prenoms : {};
  if (!isObj(raw.prenoms)) errors.push('« prenoms » est manquant (ex. : "prenoms": { "lui": "Paul", "elle": "Marie" }).');
  else {
    if (!isStr(prenoms.lui)) errors.push('« prenoms.lui » est manquant ou vide.');
    if (!isStr(prenoms.elle)) errors.push('« prenoms.elle » est manquant ou vide.');
  }
  const sousTitre = typeof raw.sousTitre === 'string' ? raw.sousTitre : '';
  if (raw.sousTitre !== undefined && typeof raw.sousTitre !== 'string') errors.push('« sousTitre » doit être un texte.');

  let musique: string | null = null;
  if (raw.musique !== undefined && raw.musique !== null && raw.musique !== '') {
    if (typeof raw.musique !== 'string') errors.push('« musique » doit être un chemin de fichier (ex. : "assets/music/musique.mp3").');
    else musique = raw.musique.replace(/^\.?\//, '');
  }

  let theme: MuseeConfig['theme'] = 'clair';
  if (raw.theme !== undefined) {
    if (raw.theme === 'clair' || raw.theme === 'sombre') theme = raw.theme;
    else errors.push('« theme » doit valoir "clair" ou "sombre".');
  }

  // --- Avatars ---
  const avatars = { lui: { ...DEFAULT_AVATARS.lui }, elle: { ...DEFAULT_AVATARS.elle } };
  if (raw.avatars === undefined) warnings.push('« avatars » absent : couleurs par défaut utilisées.');
  else if (!isObj(raw.avatars)) errors.push('« avatars » doit être un objet { "lui": {…}, "elle": {…} }.');
  else {
    for (const who of ['lui', 'elle'] as const) {
      const a = raw.avatars[who];
      if (a === undefined) {
        warnings.push(`« avatars.${who} » absent : couleurs par défaut utilisées.`);
        continue;
      }
      if (!isObj(a)) {
        errors.push(`« avatars.${who} » doit être un objet.`);
        continue;
      }
      for (const k of ['peau', 'cheveux', 'haut', 'bas', 'chaussures'] as const) {
        if (a[k] === undefined) continue;
        if (typeof a[k] === 'string' && HEX.test(a[k] as string)) avatars[who][k] = a[k] as string;
        else errors.push(`« avatars.${who}.${k} » doit être une couleur hexadécimale (ex. : "#8d5524"), reçu : ${JSON.stringify(a[k])}.`);
      }
      if (a.coiffure !== undefined) {
        if (COIFFURES.includes(a.coiffure as Coiffure)) avatars[who].coiffure = a.coiffure as Coiffure;
        else errors.push(`« avatars.${who}.coiffure » doit valoir : ${COIFFURES.join(', ')}.`);
      }
      if (a.tenue !== undefined) {
        if (TENUES.includes(a.tenue as Tenue)) avatars[who].tenue = a.tenue as Tenue;
        else errors.push(`« avatars.${who}.tenue » doit valoir : ${TENUES.join(', ')}.`);
      }
      if (a.taille !== undefined) {
        if (typeof a.taille === 'number' && a.taille >= 0.7 && a.taille <= 1.3) avatars[who].taille = a.taille;
        else errors.push(`« avatars.${who}.taille » doit être un nombre entre 0.7 et 1.3.`);
      }
      for (const k of ['modele', 'animations'] as const) {
        if (a[k] === undefined || a[k] === '') continue;
        if (typeof a[k] === 'string' && /\.(glb|gltf)$/i.test(a[k] as string)) avatars[who][k] = (a[k] as string).replace(/^\.?\//, '');
        else errors.push(`« avatars.${who}.${k} » doit être un fichier .glb (ex. : "assets/models/${who}.glb").`);
      }
    }
  }

  // --- Salles ---
  const salles: SalleConfig[] = [];
  if (!Array.isArray(raw.salles) || raw.salles.length === 0) {
    errors.push('« salles » doit être une liste non vide (ex. : [{ "id": "rencontre", "nom": "Notre rencontre" }]).');
  } else {
    const ids = new Set<string>();
    raw.salles.forEach((s, i) => {
      if (!isObj(s)) {
        errors.push(`« salles[${i}] » doit être un objet { "id": …, "nom": … }.`);
        return;
      }
      if (!isStr(s.id)) errors.push(`« salles[${i}].id » est manquant.`);
      else if (ids.has(s.id)) errors.push(`« salles[${i}].id » : l'identifiant « ${s.id} » est utilisé deux fois.`);
      if (!isStr(s.nom)) errors.push(`« salles[${i}].nom » est manquant.`);
      if (s.cadre !== undefined && s.cadre !== 'noir' && s.cadre !== 'blanc') errors.push(`« salles[${i}].cadre » doit valoir "noir" ou "blanc".`);
      if (isStr(s.id)) ids.add(s.id);
      salles.push({
        id: String(s.id ?? ''),
        nom: String(s.nom ?? ''),
        cloisonCentrale: s.cloisonCentrale === true,
        cadre: s.cadre as SalleConfig['cadre'],
      });
    });
    if (raw.salles.length > 6) warnings.push(`${raw.salles.length} salles : au-delà de 6, la visite devient longue.`);
  }

  // --- Photos ---
  const photos: PhotoConfig[] = [];
  if (!Array.isArray(raw.photos)) {
    errors.push('« photos » doit être une liste (elle peut être vide : des images de remplacement seront affichées).');
  } else {
    const ids = new Set(salles.map((s) => s.id));
    raw.photos.forEach((p, i) => {
      const where = `« photos[${i}]${isObj(p) && isStr(p.titre) ? ` (${p.titre})` : ''}`;
      if (!isObj(p)) {
        errors.push(`« photos[${i}] » doit être un objet { "fichier": … }.`);
        return;
      }
      if (!isStr(p.fichier)) errors.push(`${where}.fichier » est manquant (ex. : "photos/01.jpg").`);
      if (p.salle !== undefined && p.salle !== '' && !ids.has(p.salle as string)) {
        errors.push(`${where}.salle » : la salle « ${p.salle} » n'existe pas (salles disponibles : ${[...ids].join(', ')}).`);
      }
      if (p.date !== undefined && p.date !== '' && (typeof p.date !== 'string' || !parseDate(p.date))) {
        errors.push(`${where}.date » : « ${p.date} » n'est pas une date valide (formats acceptés : 2020-02-14, 2020-02, 2020, 14/02/2020).`);
      }
      if (p.grandFormat !== undefined && typeof p.grandFormat !== 'boolean') errors.push(`${where}.grandFormat » doit valoir true ou false.`);
      if (p.cadre !== undefined && p.cadre !== 'noir' && p.cadre !== 'blanc') errors.push(`${where}.cadre » doit valoir "noir" ou "blanc".`);
      for (const k of ['titre', 'lieu', 'legende'] as const) {
        if (p[k] !== undefined && typeof p[k] !== 'string') errors.push(`${where}.${k} » doit être un texte.`);
      }
      photos.push({
        fichier: String(p.fichier ?? '').replace(/^\.?\//, ''),
        salle: isStr(p.salle) ? p.salle : undefined,
        titre: typeof p.titre === 'string' ? p.titre : undefined,
        date: isStr(p.date) ? p.date : undefined,
        lieu: typeof p.lieu === 'string' ? p.lieu : undefined,
        legende: typeof p.legende === 'string' ? p.legende : undefined,
        grandFormat: p.grandFormat === true,
        cadre: p.cadre as PhotoConfig['cadre'],
      });
    });
  }

  const config: MuseeConfig = {
    titre: String(raw.titre ?? ''),
    prenoms: { lui: String(prenoms.lui ?? ''), elle: String(prenoms.elle ?? '') },
    sousTitre,
    musique,
    theme,
    avatars,
    salles,
    photos,
  };
  return { config, errors, warnings };
}
