import * as THREE from 'three';
import { DIM } from './layout';
import type { MuseumMaterials } from './materials';

/**
 * Mobilier procédural : bancs en bois, socles blancs et petites sculptures.
 * Les géométries sont partagées entre toutes les instances.
 */

let benchGeo: { top: THREE.BufferGeometry; leg: THREE.BufferGeometry } | null = null;

/** Banc : longueur selon X local, les personnes assises regardent vers +Z local. */
export function createBench(mats: MuseumMaterials): THREE.Group {
  if (!benchGeo) {
    const top = new THREE.BoxGeometry(DIM.benchLen, 0.07, DIM.benchDepth);
    // Le grain du bois suit la longueur du banc
    const uv = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i) * 0.5);
    benchGeo = { top, leg: new THREE.BoxGeometry(0.05, DIM.benchH - 0.07, DIM.benchDepth - 0.06) };
  }
  const g = new THREE.Group();
  g.name = 'banc';
  const top = new THREE.Mesh(benchGeo.top, mats.wood);
  top.position.y = DIM.benchH - 0.035;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(benchGeo.leg, mats.metal);
    leg.position.set(sx * (DIM.benchLen / 2 - 0.16), (DIM.benchH - 0.07) / 2, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

let socleGeo: THREE.BufferGeometry | null = null;
const sculptureCache: THREE.Object3D[] = [];

/** Socle blanc surmonté d'une sculpture (0 : cœur, 1 : nœud, 2 : sphères). */
export function createSocle(mats: MuseumMaterials, sculpture: number): THREE.Group {
  socleGeo ??= new THREE.BoxGeometry(DIM.socleSize, DIM.socleH, DIM.socleSize);
  const g = new THREE.Group();
  g.name = 'socle';
  const base = new THREE.Mesh(socleGeo, mats.plaster);
  base.position.y = DIM.socleH / 2;
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  const art = getSculpture(sculpture).clone();
  art.position.y = DIM.socleH;
  g.add(art);
  return g;
}

function getSculpture(kind: number): THREE.Object3D {
  if (sculptureCache[kind]) return sculptureCache[kind];
  const g = new THREE.Group();
  if (kind === 0) {
    // Cœur extrudé, rouge laqué
    const s = new THREE.Shape();
    s.moveTo(5, 5);
    s.bezierCurveTo(5, 5, 4, 0, 0, 0);
    s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
    s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    s.bezierCurveTo(16, 7, 16, 0, 10, 0);
    s.bezierCurveTo(7, 0, 5, 5, 5, 5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 4, bevelEnabled: true, bevelSegments: 6, bevelSize: 1.6, bevelThickness: 1.6, curveSegments: 24 });
    geo.center();
    geo.rotateZ(Math.PI);
    geo.scale(0.014, 0.014, 0.014);
    const heart = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb3202a, roughness: 0.25, metalness: 0.05 }));
    heart.position.y = 0.2;
    heart.castShadow = true;
    g.add(heart);
  } else if (kind === 1) {
    // Nœud torique en bronze
    const knot = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.11, 0.032, 160, 18, 2, 3),
      new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.32, metalness: 0.85 }),
    );
    knot.position.y = 0.19;
    knot.castShadow = true;
    g.add(knot);
  } else {
    // Empilement de sphères façon galets
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.35 });
    let y = 0;
    [0.11, 0.085, 0.06].forEach((r, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), mat);
      m.scale.y = 0.78;
      y += r * 0.78;
      m.position.set(i % 2 ? 0.012 : -0.01, y, 0);
      y += r * 0.72;
      m.castShadow = true;
      g.add(m);
    });
  }
  sculptureCache[kind] = g;
  return g;
}
