import * as THREE from 'three';
import { BONES, SK, type BoneName } from './proceduralAvatar';
import { DEG, smoothstep } from '../utils/math';

/**
 * Animations de l'avatar procédural, décrites par des fonctions du temps
 * puis échantillonnées en AnimationClip (pistes de quaternions).
 * Toutes les pistes ciblent tous les os : les fondus enchaînés (crossFade)
 * passent proprement d'un clip à l'autre.
 *
 * Conventions d'angle (degrés, avatar tourné vers +Z, gauche = +X) :
 * - jambe / bras vers l'avant : x négatif ; genou plié : x positif ;
 * - avant-bras replié vers l'avant : x négatif ;
 * - bras gauche écarté : z positif (bras droit : z négatif) ;
 * - buste penché en avant : x positif.
 */

export type AnimName = 'Idle' | 'Walk' | 'Run' | 'Sit' | 'SitIdle' | 'Dance';

/** Vitesses (m/s) pour lesquelles les cycles de marche et de course sont écrits */
export const WALK_REF = 1.45;
export const RUN_REF = 3.7;

type E3 = [number, number, number];
interface Pose {
  rot: Partial<Record<BoneName, E3>>;
  hips: E3;
  skirtScale?: E3;
}

const ROT_BONES = BONES;
const TAU = Math.PI * 2;

function sample(name: AnimName, duration: number, fn: (t: number) => Pose, fps = 30): THREE.AnimationClip {
  const n = Math.max(2, Math.round(duration * fps) + 1);
  const times = new Float32Array(n);
  const rot: Record<string, Float32Array> = {};
  for (const b of ROT_BONES) rot[b] = new Float32Array(n * 4);
  const hips = new Float32Array(n * 3);
  const skirtScale = new Float32Array(n * 3);
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    times[i] = t * duration;
    const pose = fn(t);
    for (const b of ROT_BONES) {
      const r = pose.rot[b] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0] * DEG, r[1] * DEG, r[2] * DEG));
      q.toArray(rot[b], i * 4);
    }
    hips.set(pose.hips, i * 3);
    skirtScale.set(pose.skirtScale ?? [1, 1, 1], i * 3);
  }
  const tracks: THREE.KeyframeTrack[] = ROT_BONES.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rot[b]));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hips));
  tracks.push(new THREE.VectorKeyframeTrack('skirt.scale', times, skirtScale));
  return new THREE.AnimationClip(name, duration, tracks);
}

const H = SK.hip;

/** Respiration et léger balancement. */
function idle(t: number): Pose {
  const b = Math.sin(TAU * 2 * t);
  const sway = Math.sin(TAU * t);
  return {
    hips: [0.012 * sway, H - 0.004 * (b + 1), 0],
    rot: {
      hips: [0, 2 * sway, 1.5 * sway],
      spine: [1.5, 0, -1 * sway],
      chest: [-1.2 * b, 0, -0.5 * sway],
      neck: [-1, 0, 0],
      head: [-2, 7 * Math.sin(TAU * t + 0.8), 1.5 * sway],
      upperArmL: [2, 0, 7 + b],
      upperArmR: [2, 0, -7 - b],
      foreArmL: [-12, 0, 0],
      foreArmR: [-12, 0, 0],
      upperLegL: [-2, 0, 2 - 1.5 * sway],
      upperLegR: [-2, 0, -2 - 1.5 * sway],
      lowerLegL: [4, 0, 0],
      lowerLegR: [4, 0, 0],
      footL: [-2, 0, 0],
      footR: [-2, 0, 0],
      skirt: [0, 0, -1.5 * sway],
    },
  };
}

/** Cycle de marche (deux pas). */
function walk(t: number): Pose {
  const p = TAU * t;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const kneeL = 6 + 38 * Math.pow(0.5 + 0.5 * c, 2);
  const kneeR = 6 + 38 * Math.pow(0.5 - 0.5 * c, 2);
  return {
    hips: [0, H - 0.012 + 0.016 * Math.cos(2 * p), 0],
    rot: {
      hips: [0, -7 * s, 1.5 * Math.cos(2 * p)],
      spine: [3, 0, 0],
      chest: [0, 10 * s, 0],
      neck: [0, -3 * s, 0],
      head: [-3, -2 * s, 0],
      upperArmL: [24 * s, 0, 6],
      upperArmR: [-24 * s, 0, -6],
      foreArmL: [-14 - 16 * Math.max(0, -s), 0, 0],
      foreArmR: [-14 - 16 * Math.max(0, s), 0, 0],
      upperLegL: [-27 * s, 0, 1],
      upperLegR: [27 * s, 0, -1],
      lowerLegL: [kneeL, 0, 0],
      lowerLegR: [kneeR, 0, 0],
      footL: [-10 * s + 6 * Math.max(0, c), 0, 0],
      footR: [10 * s + 6 * Math.max(0, -c), 0, 0],
      skirt: [0, 4 * s, 2 * s],
    },
  };
}

/** Course : penché en avant, coudes pliés, grandes enjambées. */
function run(t: number): Pose {
  const p = TAU * t;
  const s = Math.sin(p);
  const c = Math.cos(p);
  const kneeL = 18 + 82 * Math.pow(0.5 + 0.5 * c, 2);
  const kneeR = 18 + 82 * Math.pow(0.5 - 0.5 * c, 2);
  return {
    hips: [0, H - 0.045 + 0.04 * Math.cos(2 * p), 0],
    rot: {
      hips: [0, -11 * s, 0],
      spine: [11, 0, 0],
      chest: [4, 15 * s, 0],
      neck: [-5, -5 * s, 0],
      head: [-8, -3 * s, 0],
      upperArmL: [42 * s, 0, 9],
      upperArmR: [-42 * s, 0, -9],
      foreArmL: [-82 - 12 * s, 0, 0],
      foreArmR: [-82 + 12 * s, 0, 0],
      upperLegL: [-44 * s - 8, 0, 1],
      upperLegR: [44 * s - 8, 0, -1],
      lowerLegL: [kneeL, 0, 0],
      lowerLegR: [kneeR, 0, 0],
      footL: [-8 * s + 12, 0, 0],
      footR: [8 * s + 12, 0, 0],
      skirt: [-10, 6 * s, 3 * s],
    },
  };
}

/** Position assise (bassin reculé et abaissé, jambes à angle droit). */
export const SIT_BACK = 0.36;
export const SIT_HIP = 0.53;

function seated(breath = 0, look = 0): Pose {
  return {
    hips: [0, SIT_HIP - 0.003 * breath, -SIT_BACK],
    rot: {
      hips: [0, 0, 0],
      spine: [5, 0, 0],
      chest: [1 - 1.2 * breath, 0, 0],
      neck: [-4, look * 0.4, 0],
      head: [-9, look, 0],
      upperArmL: [-24, 0, 9],
      upperArmR: [-24, 0, -9],
      foreArmL: [-52, 0, -6],
      foreArmR: [-52, 0, 6],
      upperLegL: [-88, 0, 4],
      upperLegR: [-88, 0, -4],
      lowerLegL: [86, 0, 0],
      lowerLegR: [86, 0, 0],
      footL: [2, 0, 0],
      footR: [2, 0, 0],
      skirt: [-78, 0, 0],
    },
    skirtScale: [1.04, 0.82, 1.04],
  };
}

/** Mélange deux poses (angles et positions). */
function mix(a: Pose, b: Pose, k: number, extra?: Partial<Record<BoneName, E3>>): Pose {
  const rot: Partial<Record<BoneName, E3>> = {};
  for (const bn of ROT_BONES) {
    const ra = a.rot[bn] ?? [0, 0, 0];
    const rb = b.rot[bn] ?? [0, 0, 0];
    const ex = extra?.[bn] ?? [0, 0, 0];
    rot[bn] = [ra[0] + (rb[0] - ra[0]) * k + ex[0], ra[1] + (rb[1] - ra[1]) * k + ex[1], ra[2] + (rb[2] - ra[2]) * k + ex[2]];
  }
  const sa = a.skirtScale ?? [1, 1, 1];
  const sb = b.skirtScale ?? [1, 1, 1];
  return {
    rot,
    hips: [a.hips[0] + (b.hips[0] - a.hips[0]) * k, a.hips[1] + (b.hips[1] - a.hips[1]) * k, a.hips[2] + (b.hips[2] - a.hips[2]) * k],
    skirtScale: [sa[0] + (sb[0] - sa[0]) * k, sa[1] + (sb[1] - sa[1]) * k, sa[2] + (sb[2] - sa[2]) * k],
  };
}

/** S'asseoir : on se penche, on recule le bassin, puis on se pose (une fois, puis on reste assis). */
function sit(t: number): Pose {
  const stand = idle(0);
  const k = smoothstep(t);
  const lean = Math.sin(Math.PI * t) * 24;
  const pose = mix(stand, seated(), k, { spine: [lean, 0, 0], head: [-lean * 0.5, 0, 0] });
  // Le bassin descend un peu après le début du mouvement.
  const down = smoothstep(Math.min(1, Math.max(0, (t - 0.12) / 0.88)));
  pose.hips[1] = stand.hips[1] + (SIT_HIP - stand.hips[1]) * down;
  return pose;
}

function sitIdle(t: number): Pose {
  return seated(Math.sin(TAU * 2 * t), 7 * Math.sin(TAU * t));
}

/** Danse (4 temps à 120 bpm) : rebond, balancement, bras pliés puis levés. */
function dance(t: number): Pose {
  const beat = 0.5 - 0.5 * Math.cos(TAU * 4 * t); // 0..1 à chaque temps
  const sway = Math.sin(TAU * 2 * t);
  const up = 0.5 - 0.5 * Math.cos(TAU * t); // 0 → bras pliés, 1 → bras levés
  const wave = Math.sin(TAU * 4 * t);
  const armLz = 18 + 14 * sway + (148 - 18) * up + 10 * wave * up;
  const armRz = -(18 - 14 * sway + (148 - 18) * up - 10 * wave * up);
  return {
    hips: [0.07 * sway, H - 0.03 - 0.045 * beat, 0],
    rot: {
      hips: [0, 10 * Math.sin(TAU * 2 * t + 0.8), -5 * sway],
      spine: [4 * beat, 0, 2 * sway],
      chest: [-3 * beat, -6 * sway, 7 * sway],
      neck: [0, 0, 0],
      head: [7 * beat - 3, 8 * sway, 6 * sway],
      upperArmL: [-38 * (1 - up) - 8 * up, 0, armLz],
      upperArmR: [-38 * (1 - up) - 8 * up, 0, armRz],
      foreArmL: [-85 * (1 - up) - 25 * up, 0, 0],
      foreArmR: [-85 * (1 - up) - 25 * up, 0, 0],
      upperLegL: [-14 * beat, 0, 4 + 4 * sway],
      upperLegR: [-14 * beat, 0, -4 + 4 * sway],
      lowerLegL: [28 * beat, 0, 0],
      lowerLegR: [28 * beat, 0, 0],
      footL: [-12 * beat, 0, 0],
      footR: [-12 * beat, 0, 0],
      skirt: [0, 0, -9 * sway],
    },
    skirtScale: [1.04 + 0.06 * beat, 1, 1.04 + 0.06 * beat],
  };
}

let cache: THREE.AnimationClip[] | null = null;

/** Clips partagés par tous les avatars procéduraux (générés une seule fois). */
export function getProceduralClips(): THREE.AnimationClip[] {
  cache ??= [
    sample('Idle', 4, idle),
    sample('Walk', 2 * 0.52, walk),
    sample('Run', 0.62, run),
    sample('Sit', 1.1, sit),
    sample('SitIdle', 4, sitIdle),
    sample('Dance', 2, dance),
  ];
  return cache;
}
