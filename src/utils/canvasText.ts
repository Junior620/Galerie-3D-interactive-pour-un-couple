import * as THREE from 'three';

/** Polices de l'interface (chargées via @fontsource, donc 100 % locales). */
export const FONT_SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
export const FONT_SANS = '"Inter Variable", system-ui, "Segoe UI", Roboto, sans-serif';

export interface TextLine {
  text: string;
  /** Taille relative à la hauteur du canvas (0..1) */
  size: number;
  font?: string;
  weight?: number | string;
  style?: 'normal' | 'italic';
  color?: string;
  /** Espacement des lettres (em) */
  tracking?: number;
  /** Espace avant la ligne, relatif à la hauteur */
  spaceBefore?: number;
  uppercase?: boolean;
}

/** Attend que les polices utilisées par les textures canvas soient prêtes. */
export async function loadFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`300 64px ${FONT_SERIF}`),
    document.fonts.load(`italic 400 64px ${FONT_SERIF}`),
    document.fonts.load(`500 64px ${FONT_SERIF}`),
    document.fonts.load(`400 64px ${FONT_SANS}`),
    document.fonts.load(`600 64px ${FONT_SANS}`),
  ]).catch(() => undefined);
}

/** Réduit la taille de police jusqu'à ce que le texte tienne dans maxWidth. */
function fitFont(ctx: CanvasRenderingContext2D, line: TextLine, px: number, maxWidth: number): number {
  let size = px;
  for (let i = 0; i < 30; i++) {
    ctx.font = `${line.style ?? 'normal'} ${line.weight ?? 400} ${size}px ${line.font ?? FONT_SANS}`;
    const text = line.uppercase ? line.text.toUpperCase() : line.text;
    const w = ctx.measureText(text).width + (line.tracking ?? 0) * size * text.length;
    if (w <= maxWidth) break;
    size *= 0.92;
  }
  return size;
}

/** Coupe un texte en lignes qui tiennent dans maxWidth. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Dessine des lignes de texte centrées (ou alignées) dans un canvas transparent.
 */
export function drawTextCanvas(
  lines: TextLine[],
  width: number,
  height: number,
  options: { align?: CanvasTextAlign; background?: string; padding?: number } = {},
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  const pad = (options.padding ?? 0.04) * width;
  const align = options.align ?? 'center';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const x = align === 'center' ? width / 2 : align === 'left' || align === 'start' ? pad : width - pad;

  // Hauteur totale pour centrer verticalement le bloc
  const sizes = lines.map((l) => fitFont(ctx, l, l.size * height, width - pad * 2));
  const total = lines.reduce((s, l, i) => s + sizes[i] * 1.18 + (l.spaceBefore ?? 0) * height, 0);
  let y = (height - total) / 2;
  lines.forEach((l, i) => {
    const size = sizes[i];
    y += (l.spaceBefore ?? 0) * height + size;
    ctx.font = `${l.style ?? 'normal'} ${l.weight ?? 400} ${size}px ${l.font ?? FONT_SANS}`;
    ctx.fillStyle = l.color ?? '#1d1c1a';
    const text = l.uppercase ? l.text.toUpperCase() : l.text;
    if ('letterSpacing' in ctx && l.tracking) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.tracking * size}px`;
    }
    ctx.fillText(text, x, y);
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    y += size * 0.18;
  });
  return canvas;
}

/** Plan texturé avec du texte « peint » sur le mur (lettrage vinyle). */
export function createWallText(lines: TextLine[], widthM: number, heightM: number, pxPerM = 360): THREE.Mesh {
  const canvas = drawTextCanvas(lines, Math.round(widthM * pxPerM), Math.round(heightM * pxPerM));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), mat);
  mesh.renderOrder = 1;
  return mesh;
}
