import * as THREE from 'three';
import type { Avatar, Who } from './avatars/Avatar';
import { Companion } from './avatars/Companion';
import { Couple } from './avatars/Couple';
import { Navigator } from './avatars/Navigator';
import { CameraDirector } from './camera/CameraDirector';
import type { Music } from './audio/Music';
import { GuidedTour } from './camera/GuidedTour';
import { framePhoto } from './camera/photoFraming';
import type { Input } from './controls/Input';
import { Joystick } from './controls/Joystick';
import { PointerControls } from './controls/PointerControls';
import type { FrameObject } from './gallery/frames';
import type { BenchLayout } from './scene/layout';
import type { World } from './scene/world';
import { Hud } from './ui/hud';
import { PhotoPanel } from './ui/photoPanel';
import { Toast } from './ui/toast';
import { isTouchDevice } from './utils/device';
import { damp, lerpAngle } from './utils/math';

export interface AppOptions {
  /** Mode vidéo 9:16 : aucune interface, visite automatique */
  vertical?: boolean;
  /** Pause devant chaque photo pendant la visite (s) */
  tourPause?: number;
}

/** Modes de l'application (un seul actif à la fois). */
export type Mode = 'accueil' | 'libre' | 'photo' | 'assis' | 'danse' | 'visite';

/** Distance maximale pour s'asseoir avec E (m) */
const BENCH_RANGE = 1.5;

/**
 * Orchestrateur : boucle de rendu, avatar contrôlé, compagnon, caméra et modes.
 */
export class App {
  mode: Mode = 'accueil';
  controlled: Who = 'lui';
  readonly touch = isTouchDevice();
  /** Images par seconde (moyenne glissante) */
  fps = 60;
  readonly hud: Hud;
  readonly joystick: Joystick | null;
  readonly director: CameraDirector;
  readonly pointer: PointerControls;
  readonly navigator: Navigator;
  readonly companion: Companion;
  readonly couple: Couple;
  readonly toast: Toast;
  readonly panel: PhotoPanel;
  readonly tour: GuidedTour;
  /** Banc occupé (mode assis) */
  bench: BenchLayout | null = null;
  /** Index (ordre de visite) de la photo regardée en mode photo */
  photoIndex = -1;
  /** Mode auquel revenir en quittant la photo */
  private photoReturn: Mode = 'libre';
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly ndc = new THREE.Vector2();
  private hoverTimer = 0;
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
    readonly music: Music,
    readonly options: AppOptions = {},
  ) {
    const collision = world.museum.world;
    const ui = document.getElementById('ui')!;
    this.tour = new GuidedTour(this);
    this.hud = new Hud(ui, this.touch, {
      tour: () => this.toggleTour(),
      switchAvatar: () => this.switchAvatar(),
      music: () => this.toggleMusic(),
      sit: () => this.toggleSit(),
      dance: () => this.toggleDance(),
    });
    this.joystick = this.touch && !options.vertical ? new Joystick(ui, input) : null;
    this.joystick?.setVisible(false);
    input.movementEnabled = false;
    if (options.vertical) this.hud.hideAll();
    this.director = new CameraDirector(world.camera, collision);
    this.pointer = new PointerControls(world.renderer.domElement);
    this.navigator = new Navigator(collision, world.museum.nav);
    this.companion = new Companion(collision, world.museum.nav);
    this.couple = new Couple(this.navigator);
    this.toast = new Toast(document.getElementById('ui')!);
    this.toast.enabled = !options.vertical;

    this.panel = new PhotoPanel(document.getElementById('ui')!, isTouchDevice());
    this.panel.onPrev = () => this.stepPhoto(-1);
    this.panel.onNext = () => this.stepPhoto(1);
    this.panel.onClose = () => this.closePhoto();

    this.pointer.onRotate = (dx, dy) => {
      if (this.mode === 'libre' || this.mode === 'danse') this.director.third.rotate(dx, dy);
    };
    this.pointer.onZoom = (f) => this.director.third.zoom(f);
    this.pointer.onTap = (x, y) => this.handleTap(x, y);

    // Objets cliquables : photos ; murs et cloison masquent ce qui est derrière.
    this.pickables.push(...world.frames.map((f) => f.photoMesh));
    world.museum.group.traverse((o) => {
      if (o.name === 'murs' || o.name === 'cloison') this.pickables.push(o);
    });
    const canvas = world.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => this.hover(e));

    input.on('sit', () => this.toggleSit());
    input.on('dance', () => this.toggleDance());
    input.on('switch', () => this.switchAvatar());
    input.on('prev', () => this.mode === 'photo' && this.stepPhoto(-1));
    input.on('next', () => this.mode === 'photo' && this.stepPhoto(1));
    input.on('escape', () => this.escape());
    input.on('music', () => this.mode !== 'accueil' && this.toggleMusic());
    input.on('help', () => this.mode !== 'accueil' && this.hud.toggleHelp());
    input.on('tour', () => this.toggleTour());

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
    // Écran d'accueil : plan de face sur le couple, le titre du musée derrière eux.
    const mid = this.player.position.clone().addScaledVector(left, 0.6);
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const welcomePos = mid.clone().addScaledVector(fwd, 3.6).setY(1.45);
    this.director.jump(welcomePos, mid.clone().setY(1.5));
    this.director.shot(welcomePos, mid.clone().setY(1.5), 0);
    this.timer.connect(document);
    this.onModeChange((m) => {
      this.hud.setMode(m);
      this.joystick?.setVisible(m !== 'photo' && m !== 'accueil');
    });
  }

  /** « Entrer dans le musée » : musique (geste utilisateur), interface, caméra derrière l'avatar. */
  enter(): void {
    if (this.mode !== 'accueil') return;
    this.music.start();
    this.hud.setMusic(!this.music.muted);
    this.setMode('libre');
    if (!this.options.vertical) this.hud.show();
    // Travelling d'introduction : de face vers l'arrière de l'avatar.
    this.director.third.yaw = this.player.yaw;
    this.director.follow(2.8, false);
  }

  toggleMusic(): void {
    const on = this.music.toggle();
    this.hud.setMusic(on);
    this.toast.show(on ? 'Musique activée' : 'Musique coupée', 1400);
  }

  /** Visite guidée : démarre depuis n'importe quel mode, ou s'arrête. */
  toggleTour(endless = false): void {
    if (this.mode === 'accueil') return;
    if (this.tour.running) return this.tour.stop();
    if (this.mode === 'photo') this.closePhoto();
    if (this.mode === 'assis') this.standUp();
    if (this.mode === 'danse') this.stopDance();
    this.tour.start({ pause: this.options.tourPause, endless });
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
    this.input.movementEnabled = mode !== 'photo' && mode !== 'accueil';
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
    this.sitShot(bench, 2.2);
    const ok = await this.couple.sit(this.player, this.partner, bench);
    if (ok && this.mode === 'assis') this.toast.show(isTouchDevice() ? 'Touchez le joystick pour vous relever' : 'Une touche de déplacement pour vous relever');
    return ok;
  }

  /**
   * Plan « assis » : derrière le couple, la photo au-dessus d'eux. On recule
   * davantage sur un écran vertical, sans jamais passer derrière un mur.
   */
  sitShot(bench: BenchLayout, duration: number): Promise<void> {
    const f = bench.facing;
    const along = new THREE.Vector3(f.z, 0, -f.x);
    const photo = bench.frame ? bench.frame.position.clone() : bench.center.clone().addScaledVector(f, 2.6).setY(1.6);
    const portrait = Math.max(1, 1.25 / this.world.camera.aspect);
    let back = 2.4 * Math.pow(portrait, 0.6);
    const origin = bench.center.clone().setY(1.7);
    const dir = f.clone().negate().addScaledVector(along, 0.28).normalize();
    back = Math.min(back, this.world.museum.world.raycast(origin, dir, back + 0.5) - 0.4);
    const camPos = origin.clone().addScaledVector(dir, back);
    camPos.y = 1.7 + (portrait - 1) * 0.25;
    const look = photo.lerp(bench.center.clone().setY(0.9), portrait > 1.2 ? 0.42 : 0.3);
    return this.director.shot(camPos, look, duration);
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

  /** Échap : fermer l'aide, sinon quitter le mode en cours. */
  escape(): void {
    if (this.hud.helpOpen) this.hud.toggleHelp(false);
    else if (this.mode === 'visite') this.tour.stop();
    else if (this.mode === 'photo') this.closePhoto();
    else if (this.mode === 'assis') this.standUp();
    else if (this.mode === 'danse') this.stopDance();
  }

  // ------------------------------------------------------------------ photos

  /** Photo sous le pointeur (null si rien, ou si un mur la cache). */
  pickFrame(x: number, y: number): FrameObject | null {
    const el = this.world.renderer.domElement;
    this.ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.world.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    const i = hit?.object.userData.frameIndex as number | undefined;
    return i === undefined ? null : this.world.frames.find((f) => f.photoMesh === hit!.object) ?? null;
  }

  private handleTap(x: number, y: number): void {
    if (this.mode !== 'libre' && this.mode !== 'assis') return;
    const frame = this.pickFrame(x, y);
    if (frame) this.openPhoto(this.world.frames.indexOf(frame));
  }

  /** Curseur « main » au survol d'une photo (ordinateur). */
  private hover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const now = performance.now();
    if (now - this.hoverTimer < 90) return;
    this.hoverTimer = now;
    const ok = (this.mode === 'libre' || this.mode === 'assis') && !!this.pickFrame(e.offsetX, e.offsetY);
    this.world.renderer.domElement.style.cursor = ok ? 'pointer' : '';
  }

  /** La caméra glisse jusqu'à la photo, cadrée plein écran, et le panneau s'affiche. */
  openPhoto(index: number, duration = 1.5): void {
    const frame = this.world.frames[index];
    if (!frame) return;
    if (this.mode !== 'photo') this.photoReturn = this.mode === 'assis' ? 'assis' : 'libre';
    this.setMode('photo');
    this.photoIndex = index;
    this.toast.hint('');
    const room = this.world.layout.rooms[frame.room];
    this.panel.show(frame.photo, this.world.frames.length, `Salle ${room.index + 1} — ${room.nom}`);
    this.world.textures.ensureFull(frame);
    // Le panneau vient d'être affiché : on mesure la place qu'il occupe.
    const cov = this.panel.coverage(this.world.renderer.domElement.parentElement!);
    const { pos, look } = framePhoto(frame, this.world.camera, cov.right, cov.bottom);
    this.director.shot(pos, look, duration, 'power3.inOut');
  }

  stepPhoto(delta: number): void {
    if (this.mode !== 'photo') return;
    const n = this.world.frames.length;
    this.openPhoto((this.photoIndex + delta + n) % n, 1.2);
  }

  closePhoto(): void {
    if (this.mode !== 'photo') return;
    this.panel.hide();
    this.photoIndex = -1;
    for (const a of Object.values(this.avatars)) a.object.visible = true;
    if (this.photoReturn === 'assis' && this.bench) {
      this.setMode('assis');
      this.sitShot(this.bench, 1.4);
    } else {
      this.setMode('libre');
      this.director.follow(1.3);
    }
  }

  /** En mode photo, on masque l'avatar qui se trouverait entre la caméra et la photo. */
  private hideOccluders(): void {
    const frame = this.world.frames[this.photoIndex];
    if (!frame) return;
    const cam = this.world.camera.position;
    for (const a of Object.values(this.avatars)) {
      const p = a.position;
      // Distance de l'avatar au segment caméra → photo, dans le plan horizontal
      const ax = frame.center.x - cam.x;
      const az = frame.center.z - cam.z;
      const len2 = ax * ax + az * az || 1;
      const t = Math.max(0, Math.min(1, ((p.x - cam.x) * ax + (p.z - cam.z) * az) / len2));
      const d = Math.hypot(cam.x + ax * t - p.x, cam.z + az * t - p.z);
      a.object.visible = d > 0.7;
    }
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
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    switch (this.mode) {
      case 'libre': {
        this.player.move(this.wishVelocity(), dt, collision);
        this.companion.update(dt, this.partner, this.player);
        const near = !!this.nearestBench();
        this.toast.hint(near && !this.touch ? '<kbd>E</kbd> S’asseoir sur le banc' : '');
        this.hud.setBenchNear(near);
        break;
      }
      case 'assis':
        if (this.settleTime <= 0 && this.input.moving) this.standUp();
        break;
      case 'danse':
        if (this.settleTime <= 0 && this.input.moving) this.stopDance();
        break;
      case 'photo':
        this.hideOccluders();
        break;
      case 'visite':
        if (this.settleTime <= 0 && this.input.moving && !this.options.vertical) this.tour.stop();
        // Caméra de marche : se replace doucement derrière l'avatar.
        else if (this.director.mode === 'follow' && this.player.velocity.lengthSq() > 0.2) {
          const t = this.director.third;
          t.yaw = lerpAngle(t.yaw, this.player.yaw, damp(1.6, dt));
        }
        break;
    }
    this.navigator.update(dt);
    for (const fn of this.onFrame) fn(dt);
    for (const a of Object.values(this.avatars)) a.update(dt);

    const p = this.player.position;
    if (this.mode !== 'accueil') {
      const r = world.roomAt(p.x);
      this.hud.setRoom(r, world.layout.rooms[r].nom);
    }
    this.director.update(dt, p, this.player.height);
    world.lighting.follow(p);
    world.spots.update(dt, this.mode === 'photo' ? world.camera.position : p);
    world.textures.update(world.roomAt(p.x));
    world.renderer.render(world.scene, world.camera);
  }
}
