import * as THREE from 'three';
import type { Musee } from '../config/types';
import { buildFrames, type FrameObject } from '../gallery/frames';
import { frameDims } from '../gallery/frameSize';
import { PhotoTextures } from '../gallery/textures';
import type { DeviceProfile } from '../utils/device';
import { computeLayout, roomIndexAt, type MuseumLayout, type RoomSpec } from './layout';
import { setupLighting, type Lighting } from './lighting';
import { getMaterials } from './materials';
import { buildMuseum, type Museum } from './museum';
import { createRenderer, watchResize } from './renderer';
import { SpotPool } from './spotPool';

/** Tout ce qui compose la scène 3D du musée. */
export interface World {
  profile: DeviceProfile;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  lighting: Lighting;
  musee: Musee;
  layout: MuseumLayout;
  museum: Museum;
  /** Cadres, dans l'ordre de visite */
  frames: FrameObject[];
  textures: PhotoTextures;
  spots: SpotPool;
  roomAt(x: number): number;
}

/**
 * Assemble le monde à partir de la configuration normalisée :
 * plan → murs et mobilier → cadres → textures (chargement initial) → spots.
 */
export async function buildWorld(viewport: HTMLElement, musee: Musee, profile: DeviceProfile, manager: THREE.LoadingManager): Promise<World> {
  const renderer = createRenderer(viewport, profile);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(musee.config.theme === 'sombre' ? 0x18181a : 0xf3f1ec);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 120);
  watchResize(viewport, renderer, camera);

  const lighting = setupLighting(scene, renderer, profile);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mats = getMaterials(anisotropy, musee.config.theme);

  // Plan : la taille de chaque cadre découle du format réel de la photo.
  const specs: RoomSpec[] = musee.rooms.map((r) => ({
    id: r.id,
    nom: r.nom,
    cloison: r.cloison,
    frames: r.photos.map((p) => {
      const d = frameDims(p.aspect, p.grand);
      return { key: p.index, outerW: d.outerW, outerH: d.outerH, grand: p.grand, partition: p.partition };
    }),
  }));
  const layout = computeLayout(specs);
  const { prenoms } = musee.config;
  const museum = buildMuseum(
    layout,
    mats,
    { titre: musee.config.titre, sousTitre: musee.config.sousTitre, prenoms: `${prenoms.lui} & ${prenoms.elle}`, theme: musee.config.theme },
    profile,
  );
  scene.add(museum.group);

  const waiting = PhotoTextures.createWaitingTexture();
  const byIndex = new Map(musee.photos.map((p) => [p.index, p]));
  const { group, frames } = buildFrames(layout, byIndex, mats, profile, anisotropy, waiting);
  scene.add(group);
  // Ordre de visite : salle par salle, puis chronologique (numéro de la photo).
  frames.sort((a, b) => a.photo.numero - b.photo.numero);

  const textures = new PhotoTextures(renderer, profile, manager, waiting);
  const startRoom = roomIndexAt(layout, layout.spawn.position.x);
  await textures.preload(frames, startRoom);

  const spots = new SpotPool(
    scene,
    profile.spotCount,
    frames.map((f) => ({ fixture: f.fixture, aim: f.center, radius: Math.max(f.dims.outerW, f.dims.outerH) / 2 })),
  );

  return {
    profile,
    renderer,
    scene,
    camera,
    lighting,
    musee,
    layout,
    museum,
    frames,
    textures,
    spots,
    roomAt: (x) => roomIndexAt(layout, x),
  };
}
