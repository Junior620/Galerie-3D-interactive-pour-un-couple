import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './ui/base.css';
import { detectDevice } from './utils/device';
import { createRenderer, watchResize } from './scene/renderer';
import { setupLighting } from './scene/lighting';
import { getMaterials } from './scene/materials';

/**
 * Étape 1 : une salle vide éclairée et une caméra libre (OrbitControls).
 */
const profile = detectDevice();
const viewport = document.getElementById('viewport')!;
const renderer = createRenderer(viewport, profile);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f1ec);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
camera.position.set(4.6, 2.3, 3.9);
watchResize(viewport, renderer, camera);

const lighting = setupLighting(scene, renderer, profile);
const mats = getMaterials(renderer.capabilities.getMaxAnisotropy());

// --- Salle de test : 12 m × 10 m, murs de 4,2 m ---
const W = 12;
const D = 10;
const H = 4.2;
const T = 0.2;

const floorGeo = new THREE.PlaneGeometry(W, D);
floorGeo.rotateX(-Math.PI / 2);
const uv = floorGeo.attributes.uv as THREE.BufferAttribute;
for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 4), uv.getY(i) * (D / 4));
const floor = new THREE.Mesh(floorGeo, mats.floor);
floor.receiveShadow = true;
scene.add(floor);

const ceilingGeo = new THREE.PlaneGeometry(W, D);
ceilingGeo.rotateX(Math.PI / 2);
const ceiling = new THREE.Mesh(ceilingGeo, mats.ceiling);
ceiling.position.y = H;
scene.add(ceiling);

const walls: [number, number, number, number][] = [
  [0, -D / 2, W + T, T],
  [0, D / 2, W + T, T],
  [-W / 2, 0, T, D],
  [W / 2, 0, T, D],
];
for (const [x, z, w, d] of walls) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mats.wall);
  m.position.set(x, H / 2, z);
  m.receiveShadow = true;
  scene.add(m);
}

// Socle témoin pour juger l'éclairage et les ombres
const socle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), mats.plaster);
socle.position.set(0, 0.5, 0);
socle.castShadow = socle.receiveShadow = true;
scene.add(socle);
lighting.follow(new THREE.Vector3(0, 0, 0));

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;

const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((t) => {
  timer.update(t);
  controls.update();
  renderer.render(scene, camera);
});
