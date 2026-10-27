import * as THREE from 'three';
import './ui/fonts';
import './ui/base.css';
import './ui/ui.css';
import { App } from './App';
import { createAvatars } from './avatars/factory';
import { ConfigError, loadMusee } from './config/loadConfig';
import { Input } from './controls/Input';
import { buildWorld } from './scene/world';
import { showErrorScreen } from './ui/errorScreen';
import { loadFonts } from './utils/canvasText';
import { detectDevice } from './utils/device';

/**
 * Point d'entrée : configuration → monde 3D → avatars → application.
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
  const avatars = await createAvatars(musee, profile, manager);
  const input = new Input();
  const app = new App(world, avatars, input);
  app.start();

  // Commandes de test (captures Playwright)
  const w = window as unknown as { __musee: { ready: boolean; app: App; cmd: (name: string, ...a: number[]) => unknown } };
  w.__musee = {
    ready: true,
    app,
    cmd(name, n = 0) {
      if (name === 'marcher') {
        input.simulate(0, 1, n || 2);
        return true;
      }
      if (name === 'portrait') {
        // Plan rapproché, de face, sur le couple
        const mid = app.player.position.clone().add(app.partner.position).multiplyScalar(0.5);
        const yaw = app.player.yaw;
        const pos = mid.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(n || 2.6));
        pos.y = 1.35;
        app.director.shot(pos, mid.clone().setY(1.05), 0.01);
        return true;
      }
      if (name === 'banc') {
        // Téléporte le couple près du banc n puis s'assoit
        const b = world.museum.benches[n]?.layout;
        if (!b) return false;
        const p = b.center.clone().addScaledVector(b.facing, 1.2);
        app.player.position.copy(p);
        app.partner.position.copy(p).add(new THREE.Vector3(b.facing.z, 0, -b.facing.x).multiplyScalar(1.2));
        app.sitOn(b);
        return true;
      }
      if (name === 'danse') {
        app.startDance();
        return true;
      }
      if (name === 'changer') {
        app.switchAvatar();
        return true;
      }
      if (name === 'salle') {
        const r = world.layout.rooms[n];
        if (!r) return false;
        app.player.position.set(r.x0 + 2.2, 0, 0);
        app.partner.position.set(r.x0 + 2.2, 0, -1.2);
        app.director.third.snap(app.player.position, app.player.height, Math.PI / 2 - 0.5);
        return true;
      }
      return undefined;
    },
  };
}

start();
