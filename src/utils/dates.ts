import type { ParsedDate } from '../config/types';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Lit une date dans les formats courants :
 * 2020-02-14, 2020-02, 2020, 14/02/2020, 02/2020.
 * Renvoie null si le texte n'est pas une date valide.
 */
export function parseDate(text: string): ParsedDate | null {
  const s = text.trim();
  let annee: number;
  let mois: number | undefined;
  let jour: number | undefined;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/))) {
    annee = +m[1];
    mois = m[2] ? +m[2] : undefined;
    jour = m[3] ? +m[3] : undefined;
  } else if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
    jour = +m[1];
    mois = +m[2];
    annee = +m[3];
  } else if ((m = s.match(/^(\d{1,2})[/.](\d{4})$/))) {
    mois = +m[1];
    annee = +m[2];
  } else return null;

  if (annee < 1800 || annee > 2200) return null;
  if (mois !== undefined && (mois < 1 || mois > 12)) return null;
  if (jour !== undefined) {
    const max = new Date(annee, mois!, 0).getDate();
    if (jour < 1 || jour > max) return null;
  }
  return { annee, mois, jour, time: Date.UTC(annee, (mois ?? 1) - 1, jour ?? 1) };
}

/** « 14 février 2020 », « février 2020 » ou « 2020 ». */
export function formatDate(d: ParsedDate | null): string {
  if (!d) return '';
  if (d.mois && d.jour) return `${d.jour === 1 ? '1er' : d.jour} ${MOIS[d.mois - 1]} ${d.annee}`;
  if (d.mois) return `${MOIS[d.mois - 1]} ${d.annee}`;
  return String(d.annee);
}
