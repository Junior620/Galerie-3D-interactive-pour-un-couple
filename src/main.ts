import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './ui/fonts';
import './ui/base.css';
import './ui/ui.css';
import { ConfigError, loadMusee } from './config/loadConfig';
import { buildWorld } from './scene/world';
import { showErrorScreen } from './ui/errorScreen';
import { loadFonts } from './utils/canvasText';
import { detectDevice } from './utils/device';

/**
 * Étape 3 : musée piloté par config.json, cadres, photos (ou images de
 * remplacement), cartels et spots. Caméra encore libre (OrbitControls).
 */
async function start() {
  const profile = detectDevice();
  await loadFonts();

  let musee;
  try {
    musee = await loadMusee(profile);
  } catch (e) {
    if (e instanceof ConfigError) {
      showErrorScreen('La configuration contient des erreurs', e.problems, 'Corrigez config.json (à la racine du projet) puis rechargez la page.');
      return;
    }
    throw e;
  }

  const manager = new THREE.LoadingManager();
  const viewport = document.getElementById('viewport')!;
  const world = await buildWorld(viewport, musee, profile, manager);
  const { camera, renderer, scene, layout, lighting } = world;

  const start = layout.spawn.position;
  camera.position.set(start.x - 2.5, 2.4, 3.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(start.x + 3, 1.4, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  // Commandes de test (captures Playwright)
  const w = window as unknown as { __musee: { ready: boolean; cmd: (name: string, ...a: number[]) => unknown } };
  w.__musee = {
    ready: true,
    cmd(name, n = 0) {
      if (name === 'salle') {
        const r = layout.rooms[n];
        if (!r) return false;
        camera.position.set(r.x0 + 1.2, 2.5, layout.depth / 2 - 1.2);
        controls.target.set(r.x1 - 2, 1.4, -layout.depth / 4);
        return true;
      }
      if (name === 'photo') {
        const f = world.frames[n];
        if (!f) return false;
        const p = f.center.clone().addScaledVector(f.normal, 2.4);
        camera.position.set(p.x, f.center.y + 0.1, p.z);
        controls.target.copy(f.center);
        return true;
      }
      return undefined;
    },
  };

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    controls.update();
    lighting.follow(controls.target);
    world.spots.update(dt, controls.target);
    world.textures.update(world.roomAt(controls.target.x));
    renderer.render(scene, camera);
  });
}

start();
