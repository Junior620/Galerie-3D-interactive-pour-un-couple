import * as THREE from 'three';
import './ui/fonts';
import './ui/base.css';
import './ui/ui.css';
import { App } from './App';
import { Music } from './audio/Music';
import { createAvatars } from './avatars/factory';
import { ConfigError, loadMusee } from './config/loadConfig';
import type { Musee } from './config/types';
import { Input } from './controls/Input';
import { buildWorld } from './scene/world';
import { showErrorScreen } from './ui/errorScreen';
import { LoadingScreen, WelcomeScreen } from './ui/screens';
import { loadFonts } from './utils/canvasText';
import { detectDevice, isTouchDevice } from './utils/device';
import { installTestHooks } from './testHooks';

/**
 * Point d'entrée : chargement (barre de progression réelle) → configuration
 * → monde 3D → avatars → écran d'accueil → visite.
 */
async function start() {
  const ui = document.getElementById('ui')!;
  const loading = new LoadingScreen(ui);
  loading.set(0.02, 'Lecture de la configuration…');

  if (!webglAvailable()) {
    loading.remove();
    showErrorScreen('WebGL n’est pas disponible', [
      'Votre navigateur ou votre appareil ne permet pas l’affichage 3D (WebGL 2).',
      'Essayez une version récente de Chrome, Edge, Firefox ou Safari, et activez l’accélération matérielle.',
    ]);
    return;
  }

  const profile = detectDevice();
  await loadFonts();

  let musee: Musee;
  try {
    musee = await loadMusee(profile);
  } catch (e) {
    loading.remove();
    if (e instanceof ConfigError) {
      showErrorScreen('La configuration contient des erreurs', e.problems, 'Corrigez config.json (à la racine du projet) puis rechargez la page.');
      return;
    }
    throw e;
  }
  document.title = musee.config.titre;
  loading.setTitle(musee.config.titre);
  loading.set(0.08, 'Accrochage des photos…');

  // Toutes les ressources (photos, modèles) passent par ce LoadingManager.
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => loading.set(0.08 + 0.8 * (loaded / Math.max(1, total)));

  const viewport = document.getElementById('viewport')!;
  const world = await buildWorld(viewport, musee, profile, manager);
  loading.set(0.9, 'Arrivée des visiteurs…');
  const avatars = await createAvatars(musee, profile, manager);
  const input = new Input();
  const music = new Music(musee.config.musique && musee.hasFile(musee.config.musique) ? musee.config.musique : null);
  const app = new App(world, avatars, input, music);

  // Compilation des shaders avant d'afficher la scène (évite un à-coup à l'entrée).
  loading.set(0.95, 'Derniers réglages…');
  await world.renderer.compileAsync(world.scene, world.camera).catch(() => undefined);
  app.start();
  await loading.hide();

  new WelcomeScreen(ui, musee.config, isTouchDevice(), () => app.enter());
  installTestHooks(app);
}

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

start().catch((err) => {
  console.error(err);
  showErrorScreen('Le musée n’a pas pu s’ouvrir', [err instanceof Error ? err.message : String(err)], 'Rechargez la page. Si le problème persiste, vérifiez config.json et les fichiers du dossier public/.');
});
