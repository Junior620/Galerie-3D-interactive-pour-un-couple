import { FONT_SANS, FONT_SERIF } from '../utils/canvasText';
import { seededRandom } from '../utils/math';

/**
 * Images de remplacement : dégradés doux numérotés, générés localement.
 * (Jamais d'image téléchargée sur internet.)
 */
const PALETTES: [string, string, string][] = [
  ['#f6d1c1', '#c97b84', '#7a4e6d'],
  ['#fde2b8', '#e8a66f', '#9b5b3c'],
  ['#cfe3e8', '#7fa8b8', '#3f5f73'],
  ['#e3e8cf', '#9db48a', '#4d6b4a'],
  ['#f1d9e8', '#b48ab4', '#5d4b7a'],
  ['#f8e6c9', '#d9a441', '#7a5a1e'],
  ['#d9e4f5', '#8ea7d6', '#3e4f7a'],
  ['#f5d6d0', '#e07a5f', '#8d3b2f'],
];

/** Affiche d'une vidéo, montrée tant que sa première image n'est pas chargée. */
export function createVideoPoster(titre: string, aspect: number, longSide = 640): HTMLCanvasElement {
  const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2b2d33');
  g.addColorStop(1, '#15161a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  // Bouton lecture
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(2, m * 0.012);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2 - m * 0.04, m * 0.13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  const cx = w / 2 + m * 0.015;
  const cy = h / 2 - m * 0.04;
  ctx.moveTo(cx - m * 0.04, cy - m * 0.06);
  ctx.lineTo(cx + m * 0.06, cy);
  ctx.lineTo(cx - m * 0.04, cy + m * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `500 ${Math.round(m * 0.045)}px ${FONT_SANS}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${m * 0.012}px`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('VIDÉO', w / 2, h / 2 + m * 0.17);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  ctx.font = `italic 400 ${Math.round(m * 0.06)}px ${FONT_SERIF}`;
  const t = titre.length > 34 ? `${titre.slice(0, 32)}…` : titre;
  ctx.fillText(t, w / 2, h / 2 + m * 0.27);
  return canvas;
}

export function createPlaceholderCanvas(numero: number, aspect: number, titre: string, longSide = 640): HTMLCanvasElement {
  const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rnd = seededRandom(numero * 7919 + 13);
  const [c1, c2, c3] = PALETTES[(numero - 1 + PALETTES.length) % PALETTES.length];

  // Dégradé diagonal
  const angle = rnd() * Math.PI * 2;
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createLinearGradient(w / 2 - Math.cos(angle) * r, h / 2 - Math.sin(angle) * r, w / 2 + Math.cos(angle) * r, h / 2 + Math.sin(angle) * r);
  g.addColorStop(0, c1);
  g.addColorStop(0.55, c2);
  g.addColorStop(1, c3);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Halos lumineux façon « bokeh »
  ctx.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const rad = (0.08 + rnd() * 0.3) * Math.min(w, h);
    const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, `rgba(255,255,255,${0.35 + rnd() * 0.4})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Vignettage léger
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // Numéro et mention
  const m = Math.min(w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  // Chiffres en Inter fine : la Cormorant a des chiffres elzéviriens (« 01 » ressemble à « OI »).
  ctx.font = `200 ${Math.round(m * 0.36)}px ${FONT_SANS}`;
  ctx.fillText(String(numero).padStart(2, '0'), w / 2, h / 2 + m * 0.1);
  ctx.font = `500 ${Math.round(m * 0.045)}px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${m * 0.012}px`;
  ctx.fillText('PHOTO À VENIR', w / 2, h / 2 + m * 0.26);
  ctx.font = `italic 400 ${Math.round(m * 0.06)}px ${FONT_SERIF}`;
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
  const t = titre.length > 34 ? `${titre.slice(0, 32)}…` : titre;
  ctx.fillText(t, w / 2, h / 2 + m * 0.36);
  return canvas;
}
