import * as THREE from 'three';
import type { Avatar, Who } from './avatars/Avatar';
import { Companion } from './avatars/Companion';
import { Couple } from './avatars/Couple';
import { Navigator } from './avatars/Navigator';
import { CameraDirector } from './camera/CameraDirector';
import type { Input } from './controls/Input';
import { PointerControls } from './controls/PointerControls';
import type { BenchLayout } from './scene/layout';
import type { World } from './scene/world';
import { Toast } from './ui/toast';
import { isTouchDevice } from './utils/device';

/** Modes de l'application (un seul actif à la fois). */
export type Mode = 'accueil' | 'libre' | 'photo' | 'assis' | 'danse' | 'visite';

/** Distance maximale pour s'asseoir avec E (m) */
const BENCH_RANGE = 1.5;

/**
 * Orchestrateur : boucle de rendu, avatar contrôlé, compagnon, caméra et modes.
 */
export class App {
  mode: Mode = 'libre';
  controlled: Who = 'lui';
  readonly director: CameraDirector;
  readonly pointer: PointerControls;
  readonly navigator: Navigator;
  readonly companion: Companion;
  readonly couple: Couple;
  readonly toast: Toast;
  /** Banc occupé (mode assis) */
  bench: BenchLayout | null = null;
  /** Mode qui vient de changer : on ignore le déplacement le temps de la transition */
  private settleTime = 0;
  private readonly timer = new THREE.Timer();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly onFrame: ((dt: number) => void)[] = [];
  private readonly listeners = new Set<(mode: Mode) => void>();

  constructor(
    readonly world: World,
    readonly avatars: Record<Who, Avatar>,
    readonly input: Input,
  ) {
    const collision = world.museum.world;
    this.director = new CameraDirector(world.camera, collision);
    this.pointer = new PointerControls(world.renderer.domElement);
    this.navigator = new Navigator(collision, world.museum.nav);
    this.companion = new Companion(collision, world.museum.nav);
    this.couple = new Couple(this.navigator);
    this.toast = new Toast(document.getElementById('ui')!);

    this.pointer.onRotate = (dx, dy) => {
      if (this.mode === 'libre' || this.mode === 'danse') this.director.third.rotate(dx, dy);
    };
    this.pointer.onZoom = (f) => this.director.third.zoom(f);

    input.on('sit', () => this.toggleSit());
    input.on('dance', () => this.toggleDance());
    input.on('switch', () => this.switchAvatar());

    // Placement initial : les deux avatars côte à côte, tournés vers l'enfilade.
    const { position, yaw } = world.layout.spawn;
    for (const a of Object.values(avatars)) world.scene.add(a.object);
    this.player.position.copy(position);
    const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.partner.position.copy(position).addScaledVector(left, 1.2);
    for (const a of Object.values(avatars)) {
      a.yaw = a.targetYaw = yaw;
      a.object.rotation.y = yaw;
    }
    this.director.third.snap(this.player.position, this.player.height, yaw);
    this.director.jump(this.director.third.position, this.director.third.target);
    this.timer.connect(document);
  }

  get player(): Avatar {
    return this.avatars[this.controlled];
  }

  get partner(): Avatar {
    return this.avatars[this.controlled === 'lui' ? 'elle' : 'lui'];
  }

  /** Ajoute une tâche exécutée à chaque image. */
  each(fn: (dt: number) => void): void {
    this.onFrame.push(fn);
  }

  onModeChange(fn: (mode: Mode) => void): void {
    this.listeners.add(fn);
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.settleTime = 0.35;
    this.input.movementEnabled = mode !== 'photo';
    this.listeners.forEach((fn) => fn(mode));
  }

  start(): void {
    this.world.renderer.setAnimationLoop((t) => {
      this.timer.update(t);
      this.update(Math.min(this.timer.getDelta(), 1 / 20));
    });
  }

  // ------------------------------------------------------------------ actions

  /** Banc le plus proche à moins de 1,5 m de l'avatar contrôlé. */
  nearestBench(range = BENCH_RANGE): BenchLayout | null {
    let best: BenchLayout | null = null;
    let bestD = range;
    for (const { layout } of this.world.museum.benches) {
      const d = Couple.distanceToBench(this.player.position, layout);
      if (d < bestD) {
        bestD = d;
        best = layout;
      }
    }
    return best;
  }

  toggleSit(): void {
    if (this.mode === 'assis') return this.standUp();
    if (this.mode !== 'libre') return;
    const bench = this.nearestBench();
    if (!bench) {
      this.toast.show(isTouchDevice() ? 'Approchez-vous d’un banc pour vous asseoir' : 'Approchez-vous d’un banc (moins de 1,5 m) puis appuyez sur E');
      return;
    }
    this.sitOn(bench);
  }

  /** Les deux avatars s'assoient sur ce banc, la caméra cadre le couple et la photo. */
  async sitOn(bench: BenchLayout): Promise<boolean> {
    this.setMode('assis');
    this.bench = bench;
    this.toast.hint('');
    const f = bench.facing;
    const along = new THREE.Vector3(f.z, 0, -f.x);
    const photo = bench.frame ? bench.frame.position.clone() : bench.center.clone().addScaledVector(f, 2.6).setY(1.6);
    const camPos = bench.center.clone().addScaledVector(f, -2.4).addScaledVector(along, 0.7).setY(1.7);
    const look = photo.clone().lerp(bench.center.clone().setY(0.9), 0.3);
    this.director.shot(camPos, look, 2.2);
    const ok = await this.couple.sit(this.player, this.partner, bench);
    if (ok && this.mode === 'assis') this.toast.show(isTouchDevice() ? 'Touchez le joystick pour vous relever' : 'Une touche de déplacement pour vous relever');
    return ok;
  }

  standUp(): void {
    if (this.mode !== 'assis') return;
    this.navigator.cancelAll();
    this.couple.stand(this.player, this.partner, this.bench);
    this.bench = null;
    this.setMode('libre');
    this.director.follow(1.1);
  }

  toggleDance(): void {
    if (this.mode === 'danse') return this.stopDance();
    if (this.mode !== 'libre') return;
    this.startDance();
  }

  async startDance(): Promise<THREE.Vector3 | null> {
    this.setMode('danse');
    this.toast.hint('');
    const center = await this.couple.dance(this.player, this.partner);
    if (!center || this.mode !== 'danse') return null;
    this.director.orbit(center, { radius: 3.3, height: 1.75, speed: 0.17 });
    return center;
  }

  stopDance(): void {
    if (this.mode !== 'danse') return;
    this.navigator.cancelAll();
    this.couple.stopDance(this.player, this.partner);
    this.setMode('libre');
    this.director.follow(1.1);
  }

  switchAvatar(): void {
    if (this.mode !== 'libre') return;
    this.controlled = this.controlled === 'lui' ? 'elle' : 'lui';
    this.director.follow(0.9);
    this.toast.show(`Vous guidez ${this.player.label}`);
  }

  // ------------------------------------------------------------------ boucle

  /** Vitesse voulue de l'avatar contrôlé, relative à la caméra. */
  private wishVelocity(): THREE.Vector3 {
    const a = this.input.axes();
    this.director.third.basis(this.fwd, this.right);
    this.wish.set(0, 0, 0).addScaledVector(this.fwd, a.y).addScaledVector(this.right, a.x);
    const speed = a.run ? 3.7 : 1.5;
    return this.wish.multiplyScalar(speed * this.player.rig.scale);
  }

  private update(dt: number): void {
    const { world } = this;
    const collision = world.museum.world;
    this.settleTime = Math.max(0, this.settleTime - dt);

    switch (this.mode) {
      case 'libre':
        this.player.move(this.wishVelocity(), dt, collision);
        this.companion.update(dt, this.partner, this.player);
        this.toast.hint(this.nearestBench() ? (isTouchDevice() ? 'Banc à proximité : touchez « S’asseoir »' : '<kbd>E</kbd> S’asseoir sur le banc') : '');
        break;
      case 'assis':
        if (this.settleTime <= 0 && this.input.moving) this.standUp();
        break;
      case 'danse':
        if (this.settleTime <= 0 && this.input.moving) this.stopDance();
        break;
    }
    this.navigator.update(dt);
    for (const fn of this.onFrame) fn(dt);
    for (const a of Object.values(this.avatars)) a.update(dt);

    const p = this.player.position;
    this.director.update(dt, p, this.player.height);
    world.lighting.follow(p);
    world.spots.update(dt, this.mode === 'photo' ? world.camera.position : p);
    world.textures.update(world.roomAt(p.x));
    world.renderer.render(world.scene, world.camera);
  }
}
