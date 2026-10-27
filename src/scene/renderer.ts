import * as THREE from 'three';
import type { DeviceProfile } from '../utils/device';

/**
 * Crée le moteur de rendu WebGL avec les réglages imposés :
 * tone mapping ACES Filmic, sortie sRGB, ombres douces, pixelRatio plafonné.
 */
export function createRenderer(container: HTMLElement, profile: DeviceProfile): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    // Nécessaire pour les captures d'écran automatiques (Playwright)
    preserveDrawingBuffer: new URLSearchParams(location.search).has('capture'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

/**
 * Garde la taille du canvas synchronisée avec son conteneur
 * (le conteneur peut être en 9:16 grâce au CSS).
 */
export function watchResize(
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  onResize?: (w: number, h: number) => void,
): void {
  const apply = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    onResize?.(w, h);
  };
  new ResizeObserver(apply).observe(container);
  apply();
}
