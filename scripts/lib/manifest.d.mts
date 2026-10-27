/** Types du manifeste (utilisé par vite.config.ts). */
export interface ManifestPhoto {
  largeur: number;
  hauteur: number;
  orientationExif: number;
  date: string | null;
  variantes: { hd?: string; md?: string; mini?: string };
}

export interface Manifest {
  version: number;
  genere: string;
  photos: Record<string, ManifestPhoto>;
  fichiers: Record<string, boolean>;
}

export declare const IMAGE_EXT: Set<string>;
export declare const OPT_DIR: string;
export declare function buildManifest(root: string): Promise<Manifest>;
export declare function listPhotos(photosDir: string): string[];
export declare function readConfigSafe(configPath: string): unknown;
