import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './ui/fonts';
import './ui/base.css';
import { detectDevice } from './utils/device';
import { createRenderer, watchResize } from './scene/renderer';
import { setupLighting } from './scene/lighting';
import { getMaterials } from './scene/materials';
import { computeLayout, type FrameSpec, type RoomSpec } from './scene/layout';
import { buildMuseum } from './scene/museum';
import { frameDims } from './gallery/frameSize';
import { loadFonts } from './utils/canvasText';

/**
 * Étape 2 : plan complet du musée (salles, cloison, bancs, socles) + collisions.
 * Les salles sont encore décrites ici en dur ; config.json arrive à l'étape 3.
 */
async function start() {
  await loadFonts();
  const profile = detectDevice();
  const viewport = document.getElementById('viewport')!;
  const renderer = createRenderer(viewport, profile);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ec);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  watchResize(viewport, renderer, camera);
  const lighting = setupLighting(scene, renderer, profile);
  const mats = getMaterials(renderer.capabilities.getMaxAnisotropy());

  // Salles provisoires : formats variés pour éprouver le placement automatique
  let key = 0;
  const f = (aspect: number, grand = false, partition = false): FrameSpec => {
    const d = frameDims(aspect, grand);
    return { key: key++, outerW: d.outerW, outerH: d.outerH, grand, partition };
  };
  const specs: RoomSpec[] = [
    { id: 'rencontre', nom: 'Notre rencontre', cloison: false, frames: [f(1.5), f(0.67), f(0.8), f(1.5, true), f(1.33), f(0.67), f(1)] },
    { id: 'voyages', nom: 'Nos voyages', cloison: false, frames: [f(1.5), f(1.5), f(3, true), f(0.67), f(1.78), f(0.75), f(1.5), f(0.67), f(1.33)] },
    { id: 'nous', nom: 'Nous', cloison: true, frames: [f(0.8, true, true), f(0.75, true, true), f(1.5), f(0.67), f(1.5, true), f(1)] },
  ];
  const layout = computeLayout(specs);
  const museum = buildMuseum(layout, mats, { titre: 'Notre Musée', sousTitre: 'Notre histoire, salle après salle', prenoms: 'Prénom1 & Prénom2' }, profile);
  scene.add(museum.group);

  // Repères provisoires à l'emplacement des futurs cadres
  const debugMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.8 });
  for (const r of layout.rooms) {
    for (const fr of r.frames) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(fr.spec.outerW, fr.spec.outerH, 0.04), debugMat);
      m.position.copy(fr.position).addScaledVector(fr.normal, 0.02);
      m.rotation.y = Math.atan2(fr.normal.x, fr.normal.z);
      scene.add(m);
    }
  }

  const start = layout.spawn.position;
  camera.position.set(start.x - 2.5, 2.4, 3.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(start.x + 3, 1.4, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  lighting.follow(new THREE.Vector3(start.x + 3, 0, 0));

  // Commandes de test (captures Playwright)
  const w = window as unknown as { __musee: { ready: boolean; cmd: (name: string, ...a: number[]) => unknown } };
  w.__musee = {
    ready: true,
    cmd(name, n = 0) {
      if (name === 'salle') {
        const r = layout.rooms[n];
        if (!r) return false;
        camera.position.set(r.x0 + 1.2, 2.6, layout.depth / 2 - 1.2);
        controls.target.set(r.x1 - 1.5, 1.3, -layout.depth / 4);
        lighting.follow(r.center);
        return true;
      }
      if (name === 'testCollisions') {
        const p = new THREE.Vector3(r0().x0 + 1, 0, 0);
        museum.world.resolveCircle(p.set(r0().x0 + 0.05, 0, 0), 0.3);
        const pushedOut = p.x >= r0().x0 + DIM_T + 0.29;
        const path = museum.nav.findPath(layout.spawn.position, layout.rooms[layout.rooms.length - 1].danceSpot);
        return { pushedOut, pathLength: path?.length ?? 0, depth: layout.depth, widths: layout.rooms.map((r) => r.x1 - r.x0) };
      }
      return undefined;
    },
  };
  const r0 = () => layout.rooms[0];
  const DIM_T = 0.1;

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    controls.update();
    renderer.render(scene, camera);
  });
}

start();
