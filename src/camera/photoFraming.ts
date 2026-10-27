import * as THREE from 'three';
import type { FrameObject } from '../gallery/frames';

/**
 * Calcule la position de caméra qui cadre une photo « plein écran »,
 * bien perpendiculaire au mur, en laissant libre la zone occupée par le
 * panneau d'information :
 * - panelRight : fraction de la largeur couverte à droite (ordinateur) ;
 * - panelBottom : fraction de la hauteur couverte en bas (mobile).
 */
export function framePhoto(
  frame: FrameObject,
  camera: THREE.PerspectiveCamera,
  panelRight = 0,
  panelBottom = 0,
  margin = 1.1,
): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const aspect = camera.aspect;
  const w = frame.dims.outerW / 2;
  const h = frame.dims.outerH / 2;
  const availW = Math.max(0.3, 1 - panelRight);
  const availH = Math.max(0.3, 1 - panelBottom);
  const d = Math.max(h / (tanV * availH), w / (tanV * aspect * availW)) * margin;

  const n = frame.normal;
  const right = new THREE.Vector3().crossVectors(n.clone().negate(), THREE.Object3D.DEFAULT_UP).normalize();
  // Décalage parallèle : la photo apparaît au centre de la zone non couverte.
  const shiftX = panelRight * d * tanV * aspect;
  const shiftY = -panelBottom * d * tanV;
  const look = frame.center.clone().addScaledVector(right, shiftX);
  look.y += shiftY;
  const pos = look.clone().addScaledVector(n, Math.max(0.6, d));
  return { pos, look };
}
