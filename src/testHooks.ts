import * as THREE from 'three';
import type { App } from './App';

/**
 * Commandes de pilotage pour les tests automatiques (captures Playwright) :
 * window.__musee.cmd('photo', 0), cmd('danse'), cmd('visite')…
 * Sans effet sur l'utilisation normale.
 */
export function installTestHooks(app: App): void {
  const { world, input } = app;
  const w = window as unknown as { __musee: { ready: boolean; app: App; cmd: (name: string, ...a: number[]) => unknown } };
  w.__musee = {
    ready: true,
    app,
    cmd(name, n = 0) {
      switch (name) {
        case 'marcher':
          input.simulate(0, 1, n || 2);
          return true;
        case 'portrait': {
          // Plan rapproché, de face, sur le couple
          const mid = app.player.position.clone().add(app.partner.position).multiplyScalar(0.5);
          const yaw = app.player.yaw;
          const pos = mid.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(n || 2.6));
          pos.y = 1.35;
          app.director.shot(pos, mid.clone().setY(1.05), 0.01);
          return true;
        }
        case 'banc': {
          const b = world.museum.benches[n]?.layout;
          if (!b) return false;
          const p = b.center.clone().addScaledVector(b.facing, 1.2);
          app.player.position.copy(p);
          app.partner.position.copy(p).add(new THREE.Vector3(b.facing.z, 0, -b.facing.x).multiplyScalar(1.2));
          app.sitOn(b);
          return true;
        }
        case 'photo':
          app.openPhoto(n);
          return true;
        case 'ecran': {
          // Coordonnées à l'écran du centre de la photo n (pour simuler un vrai clic)
          const f = world.frames[n];
          if (!f) return null;
          const v = f.center.clone().project(world.camera);
          const el = world.renderer.domElement.getBoundingClientRect();
          return { x: el.left + ((v.x + 1) / 2) * el.width, y: el.top + ((1 - v.y) / 2) * el.height, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
        }
        case 'danse':
          app.startDance();
          return true;
        case 'changer':
          app.switchAvatar();
          return true;
        case 'visite':
          app.toggleTour();
          return true;
        case 'salle': {
          const r = world.layout.rooms[n];
          if (!r) return false;
          app.player.position.set(r.x0 + 2.2, 0, 0);
          app.partner.position.set(r.x0 + 2.2, 0, -1.2);
          app.director.third.snap(app.player.position, app.player.height, Math.PI / 2 - 0.5);
          return true;
        }
        case 'fps':
          return app.fps;
      }
      return undefined;
    },
  };
}
