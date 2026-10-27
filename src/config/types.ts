/**
 * Types de config.json (tel qu'écrit par l'utilisateur) et du modèle
 * normalisé utilisé par l'application.
 */

export type Coiffure = 'courte' | 'rasee' | 'afro' | 'longue' | 'chignon' | 'tresses';
export type Tenue = 'pantalon' | 'jupe' | 'robe';
export type CouleurCadre = 'noir' | 'blanc';
export type Theme = 'clair' | 'sombre';

export interface AvatarConfig {
  peau: string;
  cheveux: string;
  haut: string;
  bas: string;
  chaussures: string;
  coiffure: Coiffure;
  tenue: Tenue;
  /** Échelle de taille (1 = 1,75 m environ) */
  taille: number;
  /** Modèle .glb facultatif (sinon avatar procédural) */
  modele?: string;
  /** Fichier .glb d'animations facultatif (même squelette que le modèle) */
  animations?: string;
}

export interface SalleConfig {
  id: string;
  nom: string;
  cloisonCentrale: boolean;
  cadre?: CouleurCadre;
}

export interface PhotoConfig {
  fichier: string;
  salle?: string;
  titre?: string;
  date?: string;
  lieu?: string;
  legende?: string;
  grandFormat?: boolean;
  cadre?: CouleurCadre;
}

export interface MuseeConfig {
  titre: string;
  prenoms: { lui: string; elle: string };
  sousTitre: string;
  /** Adresse publique du site (aperçu de lien Open Graph) */
  urlSite: string | null;
  musique: string | null;
  theme: Theme;
  avatars: { lui: AvatarConfig; elle: AvatarConfig };
  salles: SalleConfig[];
  photos: PhotoConfig[];
}

export interface ParsedDate {
  annee: number;
  mois?: number;
  jour?: number;
  /** Horodatage pour le tri chronologique */
  time: number;
}

/** Photo normalisée, prête à être exposée. */
export interface Photo {
  /** Index dans config.photos (clé stable) */
  index: number;
  fichier: string;
  salle: string;
  titre: string;
  date: ParsedDate | null;
  dateLabel: string;
  lieu: string;
  legende: string;
  grand: boolean;
  /** Accrochée sur la cloison centrale */
  partition: boolean;
  cadre: CouleurCadre;
  /** largeur / hauteur */
  aspect: number;
  orientation: 'portrait' | 'paysage' | 'carre';
  /** Image de remplacement générée (fichier absent) */
  placeholder: boolean;
  sources: { mini?: string; full: string } | null;
  /** Numéro dans l'ordre de visite (1, 2, 3…) */
  numero: number;
}

export interface Room {
  index: number;
  id: string;
  nom: string;
  cloison: boolean;
  /** Photos dans l'ordre chronologique */
  photos: Photo[];
}

export interface ManifestPhoto {
  largeur: number;
  hauteur: number;
  orientationExif: number;
  date: string | null;
  variantes: { hd?: string; md?: string; mini?: string };
}

export interface Manifest {
  version: number;
  photos: Record<string, ManifestPhoto>;
  fichiers: Record<string, boolean>;
}

export interface Musee {
  config: MuseeConfig;
  rooms: Room[];
  /** Toutes les photos dans l'ordre de visite (salle par salle, puis par date) */
  photos: Photo[];
  manifest: Manifest;
  warnings: string[];
  /** Fichier présent dans public/ ? (musique, modèles) */
  hasFile(path: string | null | undefined): boolean;
}
