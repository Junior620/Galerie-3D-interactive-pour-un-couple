import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AvatarConfig } from '../config/types';
import type { AnimName } from './animations';
import type { AvatarRig } from './Avatar';

/**
 * Chargement d'un avatar .glb (Quaternius, Kenney, Mixamo converti…).
 * - normalise la taille ;
 * - retrouve les animations par leur nom (idle, walk, run, sit, dance…) ;
 * - supprime le déplacement horizontal intégré (« root motion ») ;
 * - teinte les matériaux selon leur nom (peau, cheveux, haut, bas, chaussures).
 *
 * Limite : la teinte multiplie la couleur du matériau. Si le modèle utilise
 * une texture déjà colorée (atlas), le résultat sera assombri ; les modèles
 * « low poly » à couleurs unies (Quaternius) se prêtent bien à la teinte.
 */

const loaders = new WeakMap<THREE.LoadingManager, GLTFLoader>();
const cache = new Map<string, Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>>();

function load(url: string, manager: THREE.LoadingManager) {
  let loader = loaders.get(manager);
  if (!loader) loaders.set(manager, (loader = new GLTFLoader(manager)));
  let p = cache.get(url);
  if (!p) cache.set(url, (p = loader.loadAsync(url)));
  return p;
}

/** Ordre de priorité des motifs de nom pour chaque animation attendue. */
const CLIP_PATTERNS: Record<AnimName, RegExp[]> = {
  Idle: [/^idle$/i, /idle(?!.*(sit|crouch|gun|sword))/i, /stand/i, /breath/i],
  Walk: [/^walk(ing)?$/i, /walk.*(forward|fwd)/i, /walk(?!.*(back|left|right|carry|crouch))/i],
  Run: [/^run(ning)?$/i, /jog(?!.*(back|left|right))/i, /run(?!.*(back|left|right|carry))/i, /sprint/i],
  Sit: [/sit.*down/i, /^sit$/i, /sitting(?!.*idle)/i, /sit/i],
  SitIdle: [/sit.*idle/i, /sitting.*idle/i, /seated/i],
  Dance: [/dance/i, /danc/i, /samba|salsa|hiphop|twerk/i],
};

function findClip(clips: THREE.AnimationClip[], name: AnimName): THREE.AnimationClip | undefined {
  for (const re of CLIP_PATTERNS[name]) {
    const c = clips.find((cl) => re.test(cl.name));
    if (c) return c;
  }
  return undefined;
}

/** Fige le déplacement horizontal de l'os racine (les animations doivent être « sur place »). */
function stripRootMotion(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const node = track.name.split('.')[0].toLowerCase();
    if (!/hips|pelvis|root|armature/.test(node)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return c;
}

const TINTS: [keyof AvatarConfig, RegExp][] = [
  ['cheveux', /hair|cheveu|brow|beard|barbe|lash/i],
  ['chaussures', /shoe|boot|sneaker|chaussure|sandal/i],
  ['bas', /pant|trouser|jean|short|skirt|jupe|bottom|legging/i],
  ['haut', /shirt|top|torso|jacket|hoodie|dress|robe|haut|chest|cloth|sweater|coat|vest/i],
  ['peau', /skin|peau|body|face|head|hand|arm|neck/i],
];

export async function loadGltfRig(cfg: AvatarConfig, who: 'lui' | 'elle', manager: THREE.LoadingManager, castShadow: boolean): Promise<AvatarRig> {
  const gltf = await load(cfg.modele!, manager);
  const model = SkeletonUtils.clone(gltf.scene);
  let clips = [...gltf.animations];
  if (cfg.animations) clips = clips.concat((await load(cfg.animations, manager)).animations);

  // Taille : on ramène le modèle à 1,80 m × taille, pieds au sol.
  const box = new THREE.Box3().setFromObject(model);
  const h = Math.max(0.01, box.max.y - box.min.y);
  const height = 1.8 * cfg.taille;
  const k = height / h;
  const holder = new THREE.Group();
  holder.name = `glb-${who}`;
  model.scale.multiplyScalar(k);
  model.position.y -= box.min.y * k;
  holder.add(model);

  // Teinte et ombres (matériaux clonés : lui et elle peuvent partager le même fichier)
  const tinted = new Set<string>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = castShadow;
    mesh.frustumCulled = false; // les maillages skinnés ont souvent une boîte englobante fausse
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const mat = (m as THREE.MeshStandardMaterial).clone();
      const key = `${mesh.name} ${mat.name}`;
      for (const [field, re] of TINTS) {
        if (re.test(key) && 'color' in mat) {
          mat.color.set(cfg[field] as string);
          tinted.add(field);
          break;
        }
      }
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
  });
  if (tinted.size < 3) {
    console.warn(`[musée] ${cfg.modele} : peu de matériaux reconnus pour la teinte (${[...tinted].join(', ') || 'aucun'}). Nommez les matériaux « Skin », « Hair », « Shirt », « Pants », « Shoes ».`);
  }

  const map = new Map<AnimName, THREE.AnimationClip>();
  for (const name of ['Idle', 'Walk', 'Run', 'Sit', 'SitIdle', 'Dance'] as AnimName[]) {
    const c = findClip(clips, name);
    if (c) map.set(name, stripRootMotion(c));
  }
  const missing = (['Idle', 'Walk', 'Run', 'Sit', 'Dance'] as AnimName[]).filter((n) => !map.has(n));
  if (!map.has('Idle')) throw new Error(`${cfg.modele} : aucune animation « Idle » trouvée (animations : ${clips.map((c) => c.name).join(', ') || 'aucune'}).`);
  if (missing.length) console.warn(`[musée] ${cfg.modele} : animations absentes (${missing.join(', ')}), remplacées au mieux.`);
  if (!map.has('Run') && map.has('Walk')) map.set('Run', map.get('Walk')!);

  return { model: holder, clips: map, scale: cfg.taille, sitBack: 0.12, height, procedural: false };
}
