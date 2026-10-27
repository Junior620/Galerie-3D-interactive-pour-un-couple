import * as THREE from 'three';
import { seededRandom } from '../utils/math';

/**
 * Matériaux partagés du musée. Toutes les textures sont générées par canvas :
 * aucune image téléchargée, et un seul exemplaire de chaque matériau en mémoire.
 */
export interface MuseumMaterials {
  wall: THREE.MeshStandardMaterial;
  partition: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  plinth: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  plaster: THREE.MeshStandardMaterial;
  lamp: THREE.MeshBasicMaterial;
  frameBlack: THREE.MeshStandardMaterial;
  frameWhite: THREE.MeshStandardMaterial;
  mat: THREE.MeshStandardMaterial;
}

let cache: MuseumMaterials | null = null;

export function getMaterials(anisotropy = 4): MuseumMaterials {
  if (cache) return cache;

  const floorTex = concreteTexture();
  floorTex.anisotropy = anisotropy;
  const woodTex = woodTexture();
  woodTex.anisotropy = anisotropy;

  cache = {
    wall: new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.92 }),
    partition: new THREE.MeshStandardMaterial({ color: 0x34363a, roughness: 0.85 }),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.95 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.5, metalness: 0.4 }),
    plinth: new THREE.MeshStandardMaterial({ color: 0xe4e1db, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xfbfaf8, roughness: 0.8 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff4e0 }),
    frameBlack: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45, metalness: 0.1 }),
    frameWhite: new THREE.MeshStandardMaterial({ color: 0xf2f1ee, roughness: 0.5 }),
    mat: new THREE.MeshStandardMaterial({ color: 0xfbf9f4, roughness: 0.95 }),
  };
  return cache;
}

/** Béton ciré clair : bruit fin + taches douces + traces de lissage. */
function concreteTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rnd = seededRandom(7);

  ctx.fillStyle = '#d8d4cd';
  ctx.fillRect(0, 0, size, size);

  // Grandes taches nuageuses (on dessine aussi décalé pour que la texture boucle)
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 60 + rnd() * 220;
    const light = rnd() > 0.5;
    const a = 0.025 + rnd() * 0.05;
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(120,110,100,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }

  // Traces de truelle (arcs très légers)
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
    ctx.lineWidth = 8 + rnd() * 30;
    ctx.beginPath();
    const x = rnd() * size;
    const y = rnd() * size;
    ctx.arc(x, y, 80 + rnd() * 200, rnd() * Math.PI * 2, rnd() * Math.PI * 2);
    ctx.stroke();
  }

  // Grain fin
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Bois clair (chêne) pour les bancs. */
function woodTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rnd = seededRandom(3);
  ctx.fillStyle = '#b8875a';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    const y = rnd() * h;
    const dark = rnd() > 0.4;
    ctx.strokeStyle = dark ? `rgba(90,55,25,${0.08 + rnd() * 0.18})` : `rgba(240,200,150,${0.06 + rnd() * 0.1})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    const amp = 1 + rnd() * 4;
    const freq = 0.004 + rnd() * 0.02;
    const ph = rnd() * 10;
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * freq + ph) * amp);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
