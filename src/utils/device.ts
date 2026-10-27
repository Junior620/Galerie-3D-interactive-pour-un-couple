/**
 * Détection de l'appareil et choix du niveau de qualité.
 * On peut forcer un niveau avec le paramètre d'URL ?qualite=basse|haute.
 */
export interface DeviceProfile {
  /** Appareil tactile / téléphone / tablette */
  mobile: boolean;
  /** Plafond du devicePixelRatio */
  maxPixelRatio: number;
  /** Ombres portées dynamiques (lumière principale uniquement) */
  shadows: boolean;
  /** Taille maximale des textures de photos (px) */
  textureSize: number;
  /** Nombre de vrais SpotLights réaffectés aux cadres proches */
  spotCount: number;
  /** Vitre légèrement réfléchissante devant les photos */
  glass: boolean;
  /** Plafonniers (PointLights) par salle */
  roomLights: boolean;
}

export function detectDevice(): DeviceProfile {
  const params = new URLSearchParams(location.search);
  const forced = params.get('qualite');

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent);
  // iPadOS se présente comme un Mac : on le repère grâce au tactile.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  let mobile = uaMobile || iPadOS || (coarse && Math.min(screen.width, screen.height) < 900);

  if (forced === 'basse') mobile = true;
  if (forced === 'haute') mobile = false;

  return mobile
    ? { mobile, maxPixelRatio: 1.5, shadows: false, textureSize: 1024, spotCount: 4, glass: false, roomLights: false }
    : { mobile, maxPixelRatio: 2, shadows: true, textureSize: 2048, spotCount: 10, glass: true, roomLights: true };
}

/**
 * Vrai si l'interface doit être tactile : pointeur principal grossier (doigt).
 * Un PC portable à écran tactile utilisé à la souris reste en mode clavier.
 */
export function isTouchDevice(): boolean {
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  return mq('(pointer: coarse)') || (!mq('(any-pointer: fine)') && navigator.maxTouchPoints > 0);
}
