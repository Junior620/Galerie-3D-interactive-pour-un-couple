import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Photo } from '../config/types';
import { DIM, type MuseumLayout, type PlacedFrame } from '../scene/layout';
import type { MuseumMaterials } from '../scene/materials';
import type { DeviceProfile } from '../utils/device';
import { CARTEL, createCartel } from './cartel';
import { frameDims, type FrameDims } from './frameSize';

/** Un cadre accroché : maillages + informations utiles à la caméra et à l'éclairage. */
export interface FrameObject {
  photo: Photo;
  placed: PlacedFrame;
  dims: FrameDims;
  group: THREE.Group;
  photoMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Centre de l'image (repère monde) */
  center: THREE.Vector3;
  /** Normale du mur (vers le visiteur) */
  normal: THREE.Vector3;
  room: number;
  /** Position du projecteur au plafond */
  fixture: THREE.Vector3;
}

let haloTexture: THREE.CanvasTexture | null = null;

/** Tache de lumière douce projetée par le spot sur le mur (plus intense en haut). */
function getHaloTexture(): THREE.CanvasTexture {
  if (haloTexture) return haloTexture;
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s * 0.4, 0, s / 2, s * 0.48, s / 2);
  g.addColorStop(0, 'rgba(255,244,226,1)');
  g.addColorStop(0.45, 'rgba(255,240,218,0.55)');
  g.addColorStop(0.8, 'rgba(255,236,210,0.12)');
  g.addColorStop(1, 'rgba(255,236,210,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

/** Baguette du cadre : quatre montants fusionnés en une géométrie. */
function frameGeometry(d: FrameDims, depth: number): THREE.BufferGeometry {
  const { outerW: w, outerH: h, border: b } = d;
  const parts = [
    new THREE.BoxGeometry(w, b, depth).translate(0, h / 2 - b / 2, depth / 2),
    new THREE.BoxGeometry(w, b, depth).translate(0, -h / 2 + b / 2, depth / 2),
    new THREE.BoxGeometry(b, h - 2 * b, depth).translate(-w / 2 + b / 2, 0, depth / 2),
    new THREE.BoxGeometry(b, h - 2 * b, depth).translate(w / 2 - b / 2, 0, depth / 2),
  ];
  return mergeGeometries(parts);
}

export function buildFrames(
  layout: MuseumLayout,
  photosByIndex: Map<number, Photo>,
  mats: MuseumMaterials,
  profile: DeviceProfile,
  anisotropy: number,
  waiting: THREE.Texture,
): { group: THREE.Group; frames: FrameObject[] } {
  const group = new THREE.Group();
  group.name = 'galerie';
  const frames: FrameObject[] = [];
  const halo = getHaloTexture();
  const haloWall = new THREE.MeshBasicMaterial({ map: halo, color: 0xffffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloDark = haloWall.clone();
  haloDark.opacity = 0.45;
  const glassMat = profile.glass
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.04, metalness: 0, envMapIntensity: 1.4, depthWrite: false })
    : null;
  const unitPlane = new THREE.PlaneGeometry(1, 1);

  // Optimisation : seules la photo et le cartel (textures uniques) restent des
  // maillages individuels. Baguettes fusionnées par couleur ; passe-partout,
  // vitres et halos instanciés → environ 2 appels de dessin par cadre au lieu de 6.
  const barsBlack: THREE.BufferGeometry[] = [];
  const barsWhite: THREE.BufferGeometry[] = [];
  const matXf: THREE.Matrix4[] = [];
  const glassXf: THREE.Matrix4[] = [];
  const haloWallXf: THREE.Matrix4[] = [];
  const haloDarkXf: THREE.Matrix4[] = [];
  const local = new THREE.Matrix4();
  const place = (g: THREE.Group, list: THREE.Matrix4[], x: number, y: number, z: number, sx: number, sy: number) => {
    local.makeScale(sx, sy, 1).setPosition(x, y, z);
    list.push(g.matrix.clone().multiply(local));
  };

  for (const room of layout.rooms) {
    for (const placed of room.frames) {
      const photo = photosByIndex.get(placed.spec.key);
      if (!photo) continue;
      const d = frameDims(photo.aspect, photo.grand);
      const depth = photo.grand ? 0.05 : 0.035;
      const g = new THREE.Group();
      g.name = `cadre-${photo.numero}`;
      g.position.copy(placed.position);
      g.rotation.y = Math.atan2(placed.normal.x, placed.normal.z);
      g.updateMatrix();

      const bars = frameGeometry(d, depth).applyMatrix4(g.matrix);
      (photo.cadre === 'blanc' ? barsWhite : barsBlack).push(bars);
      place(g, matXf, 0, 0, 0.012, d.outerW - 2 * d.border, d.outerH - 2 * d.border);

      const photoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(d.iw, d.ih),
        // Couleurs fidèles : la photo n'est pas assombrie par le tone mapping.
        new THREE.MeshBasicMaterial({ map: waiting, color: 0xeeeeee, toneMapped: false }),
      );
      photoMesh.position.z = 0.014;
      photoMesh.userData.frameIndex = frames.length;
      g.add(photoMesh);

      if (glassMat) place(g, glassXf, 0, 0, depth - 0.004, d.outerW - 2 * d.border, d.outerH - 2 * d.border);

      // Cartel sous le cadre
      const scale = photo.grand ? 1.15 : 1;
      const cartel = createCartel(photo, anisotropy, scale);
      cartel.position.set(0, -d.outerH / 2 - 0.11 - (CARTEL.h * scale) / 2, (CARTEL.depth * scale) / 2);
      g.add(cartel);

      // Halo du spot sur le mur
      const onPartition = placed.wall.startsWith('P');
      const hw = Math.min(d.outerW + 1.5, onPartition ? room.partition!.width : 99);
      const hh = Math.min(d.outerH + 1.9, (onPartition ? DIM.partitionH : DIM.wallH) - 0.2);
      place(g, onPartition ? haloDarkXf : haloWallXf, 0, 0.25, 0.003, hw, hh);

      group.add(g);
      const center = placed.position.clone().addScaledVector(placed.normal, 0.014);
      const fixture = new THREE.Vector3(placed.position.x, DIM.wallH - 0.12, placed.position.z).addScaledVector(placed.normal, 1.35);
      frames.push({ photo, placed, dims: d, group: g, photoMesh, center, normal: placed.normal.clone(), room: room.index, fixture });
    }
  }

  // Parties communes fusionnées / instanciées
  if (barsBlack.length) group.add(new THREE.Mesh(mergeGeometries(barsBlack), mats.frameBlack));
  if (barsWhite.length) group.add(new THREE.Mesh(mergeGeometries(barsWhite), mats.frameWhite));
  const instanced = (list: THREE.Matrix4[], material: THREE.Material, renderOrder = 0) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(unitPlane, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.renderOrder = renderOrder;
    im.computeBoundingSphere();
    group.add(im);
  };
  instanced(matXf, mats.mat);
  instanced(haloWallXf, haloWall, 1);
  instanced(haloDarkXf, haloDark, 1);
  if (glassMat) instanced(glassXf, glassMat, 2);

  // Projecteurs sur rail : deux InstancedMesh (corps + lentille), un seul appel de dessin chacun.
  const body = new THREE.CylinderGeometry(0.05, 0.042, 0.17, 16).rotateX(Math.PI / 2);
  const lens = new THREE.CircleGeometry(0.04, 16).translate(0, 0, 0.0851);
  const bodies = new THREE.InstancedMesh(body, mats.rail, frames.length);
  const lenses = new THREE.InstancedMesh(lens, mats.lamp, frames.length);
  const stems = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.09, 0.018), mats.rail, frames.length);
  const dummy = new THREE.Object3D();
  frames.forEach((f, i) => {
    dummy.position.copy(f.fixture);
    dummy.lookAt(f.center);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    lenses.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    dummy.position.y += 0.065;
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
  });
  group.add(bodies, lenses, stems);

  return { group, frames };
}
