import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AvatarConfig } from '../config/types';

/**
 * Avatar humanoïde stylisé (« dessin animé 3D »), entièrement généré en code.
 * Squelette hiérarchique d'Object3D (animé par AnimationMixer) ; chaque partie
 * du corps est rigide, et les maillages sont fusionnés par os et par matériau
 * pour limiter les appels de dessin. Repère : l'avatar regarde vers +Z,
 * sa gauche est +X, les pieds sont à y = 0.
 */

export const SK = {
  hip: 0.94,
  spine: 0.1,
  chest: 0.2,
  neck: 0.22,
  head: 0.08,
  upperArm: 0.28,
  foreArm: 0.25,
  legY: -0.03,
  upperLeg: 0.42,
  lowerLeg: 0.43,
  /** Hauteur totale approximative (sommet du crâne) */
  height: 1.8,
} as const;

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
  'upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR',
  'skirt',
] as const;
export type BoneName = (typeof BONES)[number];

interface Shape {
  shoulder: number;
  legX: number;
  thigh: number;
  arm: number;
  waist: number;
}

const SHAPES: Record<'lui' | 'elle', Shape> = {
  lui: { shoulder: 0.19, legX: 0.095, thigh: 0.068, arm: 0.05, waist: 1.08 },
  elle: { shoulder: 0.165, legX: 0.1, thigh: 0.071, arm: 0.044, waist: 0.92 },
};

/** Collecte les géométries par (os, matériau) puis les fusionne. */
class Parts {
  private map = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();

  add(bone: THREE.Object3D, mat: THREE.Material, geo: THREE.BufferGeometry, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): void {
    this.q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(...scale));
    geo.applyMatrix4(this.m);
    let byMat = this.map.get(bone);
    if (!byMat) this.map.set(bone, (byMat = new Map()));
    const list = byMat.get(mat) ?? [];
    list.push(geo);
    byMat.set(mat, list);
  }

  build(castShadow: boolean): void {
    for (const [bone, byMat] of this.map) {
      for (const [mat, list] of byMat) {
        const merged = list.length === 1 ? list[0] : mergeGeometries(list);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = false;
        bone.add(mesh);
      }
    }
  }
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 14);
const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);

let blobTexture: THREE.CanvasTexture | null = null;

/** Ombre de contact douce sous les pieds (toujours présente, même sans ombres dynamiques). */
function createBlobShadow(opacity: number): THREE.Mesh {
  if (!blobTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.6)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    blobTexture = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  );
  m.position.y = 0.004;
  m.renderOrder = 1;
  m.name = 'ombre';
  return m;
}

export function createProceduralAvatar(cfg: AvatarConfig, who: 'lui' | 'elle', castShadow: boolean): THREE.Group {
  const shape = SHAPES[who];
  const root = new THREE.Group();
  root.name = `avatar-${who}`;

  // --- Matériaux (un par couleur) ---
  const std = (color: string, roughness = 0.62) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin = std(cfg.peau, 0.55);
  const hair = std(cfg.cheveux, 0.78);
  const top = std(cfg.haut);
  const bottom = std(cfg.bas);
  const shoes = std(cfg.chaussures, 0.5);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x17110d, roughness: 0.15 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lips = std(who === 'elle' ? '#7a2b2b' : '#4a2a22', 0.5);
  const nose = std(cfg.peau, 0.5);
  nose.color.multiplyScalar(0.9);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a73c, roughness: 0.3, metalness: 0.8 });

  const dress = cfg.tenue === 'robe';
  const skirted = cfg.tenue !== 'pantalon';
  const bodyBottom = dress ? top : bottom;
  const legMat = skirted ? skin : bottom;

  // --- Squelette ---
  const bones = {} as Record<BoneName, THREE.Object3D>;
  const bone = (name: BoneName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const b = new THREE.Object3D();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    bones[name] = b;
    return b;
  };
  const hips = bone('hips', root, 0, SK.hip);
  const spine = bone('spine', hips, 0, SK.spine);
  const chest = bone('chest', spine, 0, SK.chest);
  const neck = bone('neck', chest, 0, SK.neck);
  const head = bone('head', neck, 0, SK.head);
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const ua = bone(`upperArm${side}`, chest, s * (shape.shoulder - 0.03), 0.17);
    const fa = bone(`foreArm${side}`, ua, 0, -SK.upperArm);
    bone(`hand${side}`, fa, 0, -SK.foreArm);
    const ul = bone(`upperLeg${side}`, hips, s * shape.legX, SK.legY);
    const ll = bone(`lowerLeg${side}`, ul, 0, -SK.upperLeg);
    bone(`foot${side}`, ll, 0, -SK.lowerLeg);
  }
  // L'os « jupe » existe toujours : les animations partagées le ciblent.
  const skirtBone = bone('skirt', hips, 0, 0.02);

  const P = new Parts();

  // --- Bassin, ventre, buste ---
  const pelvisW = (shape.legX + shape.thigh) / 0.15;
  P.add(hips, bodyBottom, sphere(0.15), [0, -0.03, 0], [0, 0, 0], [pelvisW, 0.66, 0.66]);
  P.add(spine, top, capsule(0.125, 0.12), [0, 0.07, 0], [0, 0, 0], [shape.waist, 1, 0.62]);
  const chestProfile = [
    [0.125, -0.06], [0.14, 0.02], [0.152, 0.1], [0.158, 0.17], [0.15, 0.215], [0.12, 0.245], [0.07, 0.262], [0.001, 0.268],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  P.add(chest, top, new THREE.LatheGeometry(chestProfile, 20), [0, 0, 0], [0, 0, 0], [shape.shoulder / 0.158, 1, 0.6]);
  P.add(neck, skin, new THREE.CylinderGeometry(0.046, 0.05, 0.13, 14), [0, 0.03, 0]);

  // --- Tête et visage ---
  const hc: [number, number, number] = [0, 0.115, 0.01];
  const R = 0.135;
  P.add(head, skin, sphere(R, 32, 22), hc, [0, 0, 0], [0.96, 1.05, 1]);
  for (const s of [1, -1]) {
    P.add(head, skin, sphere(0.03, 12, 8), [s * 0.128, 0.105, 0.0], [0, 0, 0], [0.5, 1, 0.8]); // oreille
    P.add(head, eyeMat, sphere(0.021, 14, 10), [s * 0.047, 0.122, 0.128], [0, 0, 0], [1, 1.28, 0.55]); // œil
    P.add(head, shine, sphere(0.0055, 8, 6), [s * 0.047 + 0.007, 0.132, 0.139]); // reflet
    P.add(head, hair, capsule(0.0065, 0.032), [s * 0.05, 0.168, 0.122], [0, 0, Math.PI / 2 + s * (who === 'elle' ? 0.18 : 0.08)]); // sourcil
  }
  P.add(head, nose, sphere(0.019, 12, 8), [0, 0.085, 0.142], [0, 0, 0], [1, 0.8, 0.9]);
  const arc = Math.PI * 0.7;
  P.add(head, lips, new THREE.TorusGeometry(0.022, who === 'elle' ? 0.0055 : 0.0042, 6, 18, arc), [0, 0.062, 0.128], [0, 0, -Math.PI / 2 - arc / 2]);

  // --- Coiffure ---
  const cap = (scale: number, theta: number) =>
    P.add(head, hair, new THREE.SphereGeometry(R * scale, 32, 18, 0, Math.PI * 2, 0, Math.PI * theta), hc, [-0.45, 0, 0], [0.96, 1.05, 1]);
  switch (cfg.coiffure) {
    case 'rasee':
      cap(1.018, 0.5);
      break;
    case 'courte':
      cap(1.065, 0.52);
      break;
    case 'afro':
      cap(1.05, 0.55);
      P.add(head, hair, sphere(0.21, 28, 20), [0, 0.19, -0.035], [0, 0, 0], [1, 0.9, 0.95]);
      break;
    case 'chignon':
      cap(1.05, 0.57);
      P.add(head, hair, sphere(0.075, 18, 14), [0, 0.24, -0.09]);
      break;
    case 'longue':
      cap(1.06, 0.6);
      P.add(head, hair, capsule(0.1, 0.24), [0, -0.03, -0.075], [0.08, 0, 0], [1.3, 1, 0.55]);
      for (const s of [1, -1]) P.add(head, hair, capsule(0.036, 0.17), [s * 0.115, 0.0, 0.03], [0, 0, s * 0.08]);
      break;
    case 'tresses': {
      cap(1.055, 0.58);
      const n = 15;
      for (let i = 0; i < n; i++) {
        const a = (-105 + (210 * i) / (n - 1)) * (Math.PI / 180);
        const x = Math.sin(a) * 0.122;
        const z = -Math.cos(a) * 0.118 + 0.0;
        const len = 0.3 + (1 - Math.abs(Math.sin(a))) * 0.06;
        P.add(head, hair, capsule(0.016, len), [x * 1.05, 0.08 - len / 2, z], [-0.08, 0, Math.sin(a) * 0.18]);
        if (i % 2 === 0) P.add(head, gold, sphere(0.014, 8, 6), [x * 1.15, 0.08 - len - 0.005, z - 0.01]);
      }
      break;
    }
  }

  // --- Bras ---
  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const ua = bones[`upperArm${side}`];
    const fa = bones[`foreArm${side}`];
    const hand = bones[`hand${side}`];
    const sleeve = who === 'lui' ? top : skin; // lui : manches longues, elle : manches courtes
    P.add(ua, top, sphere(0.058), [0, -0.01, 0]);
    P.add(ua, top, capsule(shape.arm, 0.11), [0, -0.09, 0]);
    P.add(ua, sleeve, capsule(shape.arm * 0.92, 0.12), [0, -0.19, 0]);
    P.add(fa, sleeve, sphere(shape.arm * 0.88), [0, 0, 0]);
    P.add(fa, sleeve, capsule(shape.arm * 0.82, 0.17), [0, -0.115, 0]);
    P.add(hand, skin, sphere(0.045, 14, 10), [0, -0.045, 0.005], [0, 0, 0], [0.72, 1.15, 0.5]);
    P.add(hand, skin, capsule(0.013, 0.03), [s * 0.028, -0.03, 0.018], [0.4, 0, s * 0.5]); // pouce
  }

  // --- Jambes ---
  for (const side of ['L', 'R'] as const) {
    const ul = bones[`upperLeg${side}`];
    const ll = bones[`lowerLeg${side}`];
    const foot = bones[`foot${side}`];
    P.add(ul, legMat, capsule(shape.thigh, 0.3), [0, -0.2, 0]);
    P.add(ll, legMat, sphere(shape.thigh * 0.85), [0, 0, 0]);
    P.add(ll, legMat, capsule(0.052, 0.31), [0, -0.2, 0]);
    // Chaussure : capsule couchée vers l'avant
    P.add(foot, shoes, capsule(0.046, 0.15), [0, -0.025, 0.05], [Math.PI / 2, 0, 0], [1.08, 1, 0.72]);
  }

  // --- Jupe / robe (os dédié : elle se replie quand l'avatar s'assoit) ---
  if (skirted) {
    const profile = [
      [0.155, 0.08], [0.17, 0.0], [0.205, -0.12], [0.25, -0.26], [0.29, -0.38], [0.295, -0.4],
    ].map(([x, y]) => new THREE.Vector2(x * (shape.legX / 0.1), y));
    const skirtMat = (dress ? top : bottom).clone();
    skirtMat.side = THREE.DoubleSide;
    P.add(skirtBone, skirtMat, new THREE.LatheGeometry(profile, 26), [0, 0, 0], [0, 0, 0], [1, 1, 0.82]);
  }

  P.build(castShadow);
  root.add(createBlobShadow(castShadow ? 0.32 : 0.5));
  root.scale.setScalar(cfg.taille);
  return root;
}
