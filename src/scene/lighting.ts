import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { DeviceProfile } from '../utils/device';

export interface Lighting {
  /** Lumière principale (la seule qui projette des ombres) */
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Fait suivre la zone d'ombre autour d'un point (l'avatar joueur) */
  follow(target: THREE.Vector3): void;
}

/**
 * Éclairage d'ambiance : environnement doux (IBL), lumière hémisphérique,
 * et une lumière directionnelle quasi verticale pour les ombres des avatars.
 */
export function setupLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  profile: DeviceProfile,
): Lighting {
  // Environnement « pièce blanche » pré-filtré : reflets doux sur le sol et les vitres.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.55;
  room.dispose();
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9d2c5, profile.mobile ? 1.5 : 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff6ea, 0.9);
  sun.position.set(3, 12, 4);
  sun.castShadow = profile.shadows;
  if (profile.shadows) {
    sun.shadow.mapSize.set(2048, 2048);
    const s = 9;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
  }
  scene.add(sun);
  scene.add(sun.target);

  const offset = new THREE.Vector3(3, 12, 4);
  return {
    sun,
    hemi,
    follow(target) {
      sun.target.position.copy(target);
      sun.position.copy(target).add(offset);
    },
  };
}
