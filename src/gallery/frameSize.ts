/**
 * Dimensions d'un cadre (en mètres) selon le format de la photo.
 * aspect = largeur / hauteur de l'image.
 */
export interface FrameDims {
  /** Taille de l'image visible */
  iw: number;
  ih: number;
  /** Largeur du passe-partout */
  mat: number;
  /** Largeur de la baguette du cadre */
  border: number;
  outerW: number;
  outerH: number;
}

export function frameDims(aspect: number, grand: boolean): FrameDims {
  const a = Math.min(6, Math.max(0.25, aspect || 1));
  let iw: number;
  let ih: number;
  if (grand) {
    if (a >= 1.8) {
      // Grand format panoramique
      iw = Math.min(4.2, 1.35 * a);
      ih = iw / a;
    } else if (a >= 1) {
      iw = 2.1;
      ih = iw / a;
    } else {
      ih = 1.9;
      iw = ih * a;
    }
  } else if (a >= 1) {
    iw = a >= 1.8 ? Math.min(2.0, 0.7 * a) : 1.1;
    ih = iw / a;
  } else {
    ih = 1.05;
    iw = ih * a;
  }
  const mat = grand ? 0.14 : 0.1;
  const border = grand ? 0.045 : 0.03;
  return { iw, ih, mat, border, outerW: iw + 2 * (mat + border), outerH: ih + 2 * (mat + border) };
}
