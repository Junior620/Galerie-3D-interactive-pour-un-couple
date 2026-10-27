import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision';
import { createBench, createSocle } from './furniture';
import { DIM, type BenchLayout, type MuseumLayout, type WallBox } from './layout';
import type { MuseumMaterials } from './materials';
import { NavGrid } from './navGrid';
import { createWallText, FONT_SANS, FONT_SERIF } from '../utils/canvasText';
import type { DeviceProfile } from '../utils/device';

export interface MuseumTexts {
  titre: string;
  sousTitre: string;
  prenoms: string;
}

export interface Museum {
  group: THREE.Group;
  layout: MuseumLayout;
  world: CollisionWorld;
  nav: NavGrid;
  benches: { layout: BenchLayout; object: THREE.Group }[];
}

const yawFromNormal = (n: THREE.Vector3) => Math.atan2(n.x, n.z);

/** Boîte de géométrie à partir de ses coins min/max. */
function boxFrom(min: THREE.Vector3, max: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(max.x - min.x, max.y - min.y, max.z - min.z);
  g.translate((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  return g;
}

/**
 * Construit les maillages du musée à partir du plan : sol, plafond technique,
 * murs (fusionnés en un seul maillage), plinthes, rails, plafonniers,
 * cloison, bancs, socles et textes muraux. Prépare aussi collisions et navigation.
 */
export function buildMuseum(layout: MuseumLayout, mats: MuseumMaterials, texts: MuseumTexts, profile: DeviceProfile): Museum {
  const group = new THREE.Group();
  group.name = 'musee';
  const D = layout.depth;
  const H = DIM.wallH;
  const t = DIM.wallT;
  const L = layout.maxX - layout.minX;
  const cx = (layout.minX + layout.maxX) / 2;

  // --- Sol en béton ciré (une texture répétée tous les 4 m) ---
  const floorGeo = new THREE.PlaneGeometry(L + t, D + t);
  floorGeo.rotateX(-Math.PI / 2);
  const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * (L + t)) / 4, (uv.getY(i) * (D + t)) / 4);
  const floor = new THREE.Mesh(floorGeo, mats.floor);
  floor.position.x = cx;
  floor.receiveShadow = true;
  floor.name = 'sol';
  group.add(floor);

  // --- Plafond technique sombre ---
  const ceilGeo = new THREE.PlaneGeometry(L + t, D + t);
  ceilGeo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(ceilGeo, mats.ceiling);
  ceiling.position.set(cx, H, 0);
  group.add(ceiling);

  // --- Murs : tous fusionnés (un seul appel de dessin) ---
  const wallBoxes = layout.walls.filter((w) => w.kind === 'mur');
  const walls = new THREE.Mesh(mergeGeometries(wallBoxes.map((w) => boxFrom(w.min, w.max))), mats.wall);
  walls.receiveShadow = true;
  walls.name = 'murs';
  group.add(walls);

  // --- Plinthes le long des faces intérieures ---
  const plinths: THREE.BufferGeometry[] = [];
  const ph = 0.08;
  const pd = 0.012;
  const addPlinthX = (x0: number, x1: number, z: number) => plinths.push(boxFrom(new THREE.Vector3(x0, 0, z - pd / 2), new THREE.Vector3(x1, ph, z + pd / 2)));
  const addPlinthZ = (z0: number, z1: number, x: number) => plinths.push(boxFrom(new THREE.Vector3(x - pd / 2, 0, z0), new THREE.Vector3(x + pd / 2, ph, z1)));
  for (const r of layout.rooms) {
    addPlinthX(r.x0 + t / 2, r.x1 - t / 2, -D / 2 + t / 2 + pd / 2);
    addPlinthX(r.x0 + t / 2, r.x1 - t / 2, D / 2 - t / 2 - pd / 2);
    const dw = DIM.doorW / 2;
    for (const [x, hasDoor] of [[r.x0 + t / 2 + pd / 2, r.hasWestDoor], [r.x1 - t / 2 - pd / 2, r.hasEastDoor]] as [number, boolean][]) {
      if (hasDoor) {
        addPlinthZ(-D / 2 + t / 2, -dw, x);
        addPlinthZ(dw, D / 2 - t / 2, x);
      } else addPlinthZ(-D / 2 + t / 2, D / 2 - t / 2, x);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(plinths), mats.plinth));

  // --- Rails d'éclairage et plafonniers ---
  const rails: THREE.BufferGeometry[] = [];
  const lamps: THREE.BufferGeometry[] = [];
  const ry = H - 0.035;
  const inset = 1.4;
  for (const r of layout.rooms) {
    for (const z of [-D / 2 + inset, D / 2 - inset]) rails.push(boxFrom(new THREE.Vector3(r.x0 + 0.5, ry - 0.02, z - 0.03), new THREE.Vector3(r.x1 - 0.5, ry + 0.02, z + 0.03)));
    for (const x of [r.x0 + inset, r.x1 - inset]) rails.push(boxFrom(new THREE.Vector3(x - 0.03, ry - 0.02, -D / 2 + 0.5), new THREE.Vector3(x + 0.03, ry + 0.02, D / 2 - 0.5)));
    if (r.partition) {
      const p = r.partition;
      for (const s of [-1, 1]) {
        const x = p.center.x + s * (p.thickness / 2 + inset);
        rails.push(boxFrom(new THREE.Vector3(x - 0.03, ry - 0.02, -p.width / 2 - 0.5), new THREE.Vector3(x + 0.03, ry + 0.02, p.width / 2 + 0.5)));
      }
    }
    // Deux bandeaux lumineux par salle
    const len = Math.max(2, r.x1 - r.x0 - 4.5);
    for (const z of [-D * 0.13, D * 0.13]) {
      lamps.push(boxFrom(new THREE.Vector3(r.center.x - len / 2, H - 0.025, z - 0.09), new THREE.Vector3(r.center.x + len / 2, H - 0.005, z + 0.09)));
    }
    if (profile.roomLights) {
      const light = new THREE.PointLight(0xfff3e2, 9, 0, 2);
      light.position.set(r.center.x, H - 0.6, 0);
      group.add(light);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(rails), mats.rail));
  group.add(new THREE.Mesh(mergeGeometries(lamps), mats.lamp));

  // --- Cloison anthracite ---
  for (const w of layout.walls.filter((x: WallBox) => x.kind === 'cloison')) {
    const m = new THREE.Mesh(boxFrom(w.min, w.max), mats.partition);
    m.castShadow = m.receiveShadow = true;
    m.name = 'cloison';
    group.add(m);
  }

  // --- Collisions ---
  const world = new CollisionWorld();
  for (const w of layout.walls) {
    world.add({ minX: w.min.x, maxX: w.max.x, minY: w.min.y, maxY: w.max.y, minZ: w.min.z, maxZ: w.max.z, kind: w.kind, blocksCamera: true });
  }
  // Plafond (pour la caméra)
  world.add({ minX: layout.minX - 1, maxX: layout.maxX + 1, minY: H, maxY: H + 1, minZ: -D, maxZ: D, kind: 'mur', blocksCamera: true });

  // --- Bancs ---
  const benches: Museum['benches'] = [];
  for (const r of layout.rooms) {
    for (const b of r.benches) {
      const obj = createBench(mats);
      obj.position.copy(b.center);
      obj.rotation.y = yawFromNormal(b.facing);
      group.add(obj);
      benches.push({ layout: b, object: obj });
      const alongX = Math.abs(b.facing.z) > 0.5;
      world.addBox(b.center, alongX ? b.length : DIM.benchDepth, alongX ? DIM.benchDepth : b.length, DIM.benchH, 'banc');
    }
    for (const s of r.socles) {
      const obj = createSocle(mats, s.sculpture);
      obj.position.copy(s.position);
      obj.rotation.y = (s.position.x * 0.7) % Math.PI;
      group.add(obj);
      world.addBox(s.position, DIM.socleSize, DIM.socleSize, DIM.socleH, 'socle');
    }
  }

  // --- Textes muraux ---
  const dark = '#1d1c1a';
  const title = createWallText(
    [
      { text: texts.titre, size: 0.3, font: FONT_SERIF, weight: 300, color: dark },
      { text: texts.prenoms, size: 0.15, font: FONT_SERIF, style: 'italic', color: '#6d5f50', spaceBefore: 0.02 },
      { text: texts.sousTitre, size: 0.065, font: FONT_SANS, weight: 500, color: '#6f6a64', tracking: 0.18, uppercase: true, spaceBefore: 0.07 },
    ],
    5.2,
    1.9,
  );
  title.position.copy(layout.titleWall.position).addScaledVector(layout.titleWall.normal, 0.003);
  title.rotation.y = yawFromNormal(layout.titleWall.normal);
  group.add(title);

  for (const l of layout.lintels) {
    const room = layout.rooms[l.room];
    const m = createWallText(
      [
        { text: `Salle ${l.room + 1}`, size: 0.17, font: FONT_SANS, weight: 600, color: '#77716a', tracking: 0.3, uppercase: true },
        { text: room.nom, size: 0.42, font: FONT_SERIF, weight: 400, color: dark, spaceBefore: 0.03 },
      ],
      3.2,
      0.95,
    );
    m.position.copy(l.position).addScaledVector(l.normal, 0.003);
    m.rotation.y = yawFromNormal(l.normal);
    group.add(m);
  }

  // Dos de la cloison : prénoms en lettres claires s'il n'y a pas de cadre.
  for (const r of layout.rooms) {
    if (!r.partition || r.frames.some((f) => f.wall === 'P-arriere')) continue;
    const m = createWallText(
      [
        { text: texts.prenoms, size: 0.36, font: FONT_SERIF, style: 'italic', color: '#f1ede6' },
        { text: r.nom, size: 0.14, font: FONT_SANS, weight: 500, color: '#b9b4ac', tracking: 0.3, uppercase: true, spaceBefore: 0.06 },
      ],
      Math.min(4, r.partition.width - 0.6),
      1.1,
    );
    m.position.set(r.partition.center.x + r.partition.thickness / 2 + 0.003, 1.9, 0);
    m.rotation.y = Math.PI / 2;
    group.add(m);
  }

  const nav = new NavGrid(world, layout.minX, layout.maxX, -D / 2, D / 2);
  return { group, layout, world, nav, benches };
}
