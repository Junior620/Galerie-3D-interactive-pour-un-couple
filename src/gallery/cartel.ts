import * as THREE from 'three';
import type { Photo } from '../config/types';
import { FONT_SANS, FONT_SERIF, wrapText } from '../utils/canvasText';

/**
 * Cartel : petite étiquette sous le cadre (numéro, titre, date, lieu),
 * dessinée dans un canvas puis appliquée sur une fine plaque.
 */
export const CARTEL = { w: 0.32, h: 0.13, depth: 0.004 };

let plateGeo: THREE.BoxGeometry | null = null;
let edgeMat: THREE.MeshStandardMaterial | null = null;

export function createCartel(photo: Photo, anisotropy: number, scale = 1): THREE.Mesh {
  const W = 810;
  const H = Math.round((W * CARTEL.h) / CARTEL.w);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, W, H);

  const pad = 34;
  ctx.textBaseline = 'alphabetic';
  // Numéro
  ctx.fillStyle = '#8f887f';
  ctx.font = `600 24px ${FONT_SANS}`;
  ctx.fillText(String(photo.numero).padStart(2, '0'), pad, pad + 16);

  // Titre (jusqu'à deux lignes)
  ctx.fillStyle = '#141311';
  let size = 66;
  ctx.font = `italic 500 ${size}px ${FONT_SERIF}`;
  let lines = wrapText(ctx, photo.titre, W - pad * 2);
  while ((lines.length > 2 || lines.some((l) => ctx.measureText(l).width > W - pad * 2)) && size > 30) {
    size -= 4;
    ctx.font = `italic 500 ${size}px ${FONT_SERIF}`;
    lines = wrapText(ctx, photo.titre, W - pad * 2);
  }
  lines = lines.slice(0, 2);
  let y = pad + 26 + size;
  for (const l of lines) {
    ctx.fillText(l, pad, y);
    y += size * 1.02;
  }

  // Date et lieu
  const meta = [photo.type === 'video' ? '▶ Vidéo' : '', photo.dateLabel, photo.lieu].filter(Boolean).join('  ·  ');
  if (meta) {
    ctx.fillStyle = '#4f4a44';
    let ms = 31;
    ctx.font = `400 ${ms}px ${FONT_SANS}`;
    while (ctx.measureText(meta).width > W - pad * 2 && ms > 16) {
      ms -= 1;
      ctx.font = `400 ${ms}px ${FONT_SANS}`;
    }
    ctx.fillText(meta, pad, H - pad + 4);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;

  plateGeo ??= new THREE.BoxGeometry(CARTEL.w, CARTEL.h, CARTEL.depth);
  edgeMat ??= new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  // Faces de la boîte : +x, -x, +y, -y, +z (avant), -z
  const mesh = new THREE.Mesh(plateGeo, [edgeMat, edgeMat, edgeMat, edgeMat, face, edgeMat]);
  mesh.scale.setScalar(scale);
  mesh.name = 'cartel';
  return mesh;
}
