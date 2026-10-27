import * as THREE from 'three';
import type { App } from '../App';
import type { FrameObject } from '../gallery/frames';

/**
 * Visite guidée : toutes les photos dans l'ordre de visite (salle par salle,
 * puis chronologique). Le couple marche ensemble, s'arrête devant chaque photo
 * (4 s par défaut, réglable par ?pause=2), s'assoit devant les grands formats
 * et danse à la fin dans la salle « Nous ».
 * Une touche de déplacement, V ou Échap interrompt la visite.
 */
export interface TourOptions {
  /** Pause devant chaque photo (s) */
  pause?: number;
  /** Mode vidéo : la danse finale continue indéfiniment */
  endless?: boolean;
}

export class GuidedTour {
  private token = 0;
  running = false;
  /** Étape en cours (index de photo, ou -1 pour le final) — utile aux tests */
  step = 0;
  /** Banc occupé pendant la visite (pour se relever proprement si on l'arrête) */
  private bench: FrameObject['placed']['bench'] = null;

  constructor(private readonly app: App) {}

  /** Lance la visite (depuis le mode libre). */
  async start(opts: TourOptions = {}): Promise<void> {
    const app = this.app;
    const id = ++this.token;
    const alive = () => id === this.token && this.running;
    const pause = (opts.pause ?? 4) * 1000;
    this.running = true;
    app.setMode('visite');
    app.toast.show(app.touch ? 'Visite guidée — touchez le joystick pour l’arrêter' : 'Visite guidée — une touche de déplacement pour l’arrêter', 3500);

    const frames = app.world.frames;
    for (const [i, frame] of frames.entries()) {
      if (!alive()) return;
      this.step = i;
      app.world.textures.ensureFull(frame);
      if (frame.placed.bench && frame.photo.grand) {
        await this.visitBench(frame, pause, alive);
      } else {
        await this.visitFrame(frame, pause, alive);
      }
    }
    if (!alive()) return;
    this.step = -1;
    await this.finale(alive, opts.endless ?? false);
  }

  stop(silent = false): void {
    if (!this.running) return;
    this.running = false;
    this.token++;
    const app = this.app;
    app.navigator.cancelAll();
    app.couple.stand(app.player, app.partner, this.bench);
    this.bench = null;
    app.couple.stopDance(app.player, app.partner);
    app.setMode('libre');
    app.director.follow(1.2);
    if (!silent) app.toast.show('Visite interrompue', 1800);
  }

  /** Caméra de marche : derrière le couple, alignée sur la direction suivie. */
  private walkCamera(): void {
    const app = this.app;
    if (app.director.mode !== 'follow') {
      app.director.third.yaw = app.player.yaw;
      app.director.follow(1.4, false);
    }
  }

  /** Le couple rejoint deux points côte à côte devant la photo. */
  private async walkTo(a: THREE.Vector3, b: THREE.Vector3, alive: () => boolean): Promise<boolean> {
    const app = this.app;
    this.walkCamera();
    // Le joueur part le premier, son partenaire lui emboîte le pas.
    const pa = app.navigator.walkTo(app.player, a, { speed: 1.35, teleport: true });
    await wait(250);
    if (!alive()) return false;
    const pb = app.navigator.walkTo(app.partner, b, { speed: 1.45, teleport: true });
    await Promise.all([pa, pb]);
    return alive();
  }

  private async visitFrame(frame: FrameObject, pause: number, alive: () => boolean): Promise<void> {
    const app = this.app;
    const n = frame.normal;
    const along = new THREE.Vector3(n.z, 0, -n.x);
    const dist = THREE.MathUtils.clamp(frame.dims.outerH * 1.1 + 0.7, 1.7, 2.6);
    const base = new THREE.Vector3(frame.center.x, 0, frame.center.z).addScaledVector(n, dist);
    // Couple bien écarté : la photo reste visible entre eux.
    const pa = base.clone().addScaledVector(along, -0.62);
    const pb = base.clone().addScaledVector(along, 0.62);
    // Le plus proche de chaque point y va (évite que le couple se croise).
    const swap = app.player.position.distanceToSquared(pb) < app.player.position.distanceToSquared(pa);
    if (!(await this.walkTo(swap ? pb : pa, swap ? pa : pb, alive))) return;

    const yaw = Math.atan2(-n.x, -n.z);
    app.player.targetYaw = app.partner.targetYaw = yaw;
    await this.frameShot(frame, base);
    await wait(pause);
  }

  /** Plan « visite » : derrière le couple, la photo bien visible au-dessus. */
  private frameShot(frame: FrameObject, base: THREE.Vector3): Promise<void> {
    const app = this.app;
    const n = frame.normal;
    const along = new THREE.Vector3(n.z, 0, -n.x);
    const portrait = Math.max(1, 1.25 / app.world.camera.aspect);
    const origin = base.clone().setY(2.1);
    const dir = n.clone().addScaledVector(along, 0.12).normalize();
    let back = 2.2 * Math.pow(portrait, 0.55);
    back = Math.min(back, app.world.museum.world.raycast(origin, dir, back + 0.5) - 0.4);
    const pos = origin.clone().addScaledVector(dir, Math.max(0.8, back));
    // Caméra au-dessus des têtes : la photo n'est pas masquée par le couple.
    pos.y = 2.2 + (portrait - 1) * 0.18;
    const look = frame.center.clone().lerp(base.clone().setY(1.0), 0.22);
    return app.director.shot(pos, look, 1.6);
  }

  private async visitBench(frame: FrameObject, pause: number, alive: () => boolean): Promise<void> {
    const app = this.app;
    const bench = frame.placed.bench!;
    this.walkCamera();
    this.bench = bench;
    const sat = app.couple.sit(app.player, app.partner, bench);
    // Plan sur le banc dès que le couple en approche
    await wait(600);
    if (!alive()) return;
    const ok = await sat;
    if (!ok || !alive()) return;
    app.sitShot(bench, 1.8);
    await wait(pause + 1200);
    if (!alive()) return;
    app.couple.stand(app.player, app.partner, bench);
    this.bench = null;
    await wait(700);
  }

  /** Final : danse dans la salle « Nous » (ou la salle à cloison, ou la dernière). */
  private async finale(alive: () => boolean, endless: boolean): Promise<void> {
    const app = this.app;
    const rooms = app.world.layout.rooms;
    const room = rooms.find((r) => r.id === 'nous') ?? rooms.find((r) => r.partition) ?? rooms[rooms.length - 1];
    const spot = room.danceSpot;
    if (!(await this.walkTo(spot.clone().add(new THREE.Vector3(-0.55, 0, 0.1)), spot.clone().add(new THREE.Vector3(0.55, 0, -0.1)), alive))) return;
    const center = await app.couple.dance(app.player, app.partner);
    if (!center || !alive()) return;
    app.director.orbit(center, { radius: 3.2, height: 1.7, speed: 0.16 });
    app.toast.show('Fin de la visite ❤', 3000);
    if (endless) return;
    await wait(11000);
    if (!alive()) return;
    this.stop(true);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
