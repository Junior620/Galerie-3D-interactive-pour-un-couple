import * as THREE from 'three';
import type { CollisionWorld } from '../scene/collision';
import { damp, lerpAngle } from '../utils/math';
import { RUN_REF, WALK_REF, type AnimName } from './animations';

/** Ce qu'il faut pour animer un avatar, quelle que soit sa source (procédural ou GLB). */
export interface AvatarRig {
  /** Modèle contenant les os nommés (racine de l'AnimationMixer) */
  model: THREE.Object3D;
  clips: Map<AnimName, THREE.AnimationClip>;
  /** Échelle de taille (1 ≈ 1,80 m) */
  scale: number;
  /** Recul du bassin dans l'animation « assis » (m, à l'échelle 1) */
  sitBack: number;
  height: number;
  procedural: boolean;
}

export type Who = 'lui' | 'elle';

/**
 * Un avatar dans le musée : position, orientation, animations (fondus de 0,3 s)
 * et déplacement avec collisions. Il ne sait pas qui le pilote : clavier,
 * compagnon automatique ou visite guidée appellent tous move().
 */
export class Avatar {
  readonly object = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  readonly velocity = new THREE.Vector3();
  readonly radius = 0.28;
  yaw = 0;
  targetYaw = 0;
  current: AnimName | null = null;
  /** Assis ou en train de danser : la locomotion est suspendue */
  busy = false;
  private readonly actions = new Map<AnimName, THREE.AnimationAction>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    readonly who: Who,
    readonly label: string,
    readonly rig: AvatarRig,
  ) {
    this.object.name = `avatar-${who}`;
    this.object.add(rig.model);
    this.mixer = new THREE.AnimationMixer(rig.model);
    for (const [name, clip] of rig.clips) {
      const action = this.mixer.clipAction(clip);
      if (name === 'Sit') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    // Après « s'asseoir », on enchaîne sur la position assise qui respire.
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.actions.get('Sit') && this.current === 'Sit' && this.actions.has('SitIdle')) this.play('SitIdle', 0.5);
    });
    this.play('Idle', 0);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get height(): number {
    return this.rig.height;
  }

  has(name: AnimName): boolean {
    return this.actions.has(name);
  }

  /** Lance une animation avec un fondu enchaîné (0,3 s par défaut). */
  play(name: AnimName, fade = 0.3, startAt = 0): void {
    const next = this.actions.get(name) ?? (name === 'SitIdle' ? this.actions.get('Sit') : this.actions.get('Idle'));
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : undefined;
    this.current = name;
    if (prev === next) return;
    next.reset();
    next.time = startAt;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
  }

  setTimeScale(s: number): void {
    const a = this.current ? this.actions.get(this.current) : undefined;
    a?.setEffectiveTimeScale(s);
  }

  /** Oriente l'avatar vers un point (immédiatement ou en douceur). */
  faceTowards(p: THREE.Vector3, immediate = false): void {
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetYaw = Math.atan2(dx, dz);
    if (immediate) this.yaw = this.targetYaw;
  }

  /**
   * Déplacement : on accélère vers la vitesse voulue (m/s, plan XZ), on avance,
   * on résout les collisions, puis on choisit Idle / Walk / Run selon la vitesse réelle.
   */
  move(desired: THREE.Vector3, dt: number, world: CollisionWorld): number {
    const k = damp(desired.lengthSq() > this.velocity.lengthSq() ? 9 : 12, dt);
    this.velocity.x += (desired.x - this.velocity.x) * k;
    this.velocity.z += (desired.z - this.velocity.z) * k;
    const before = this.tmp.copy(this.position);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    world.resolveCircle(this.position, this.radius);
    const speed = dt > 0 ? Math.hypot(this.position.x - before.x, this.position.z - before.z) / dt : 0;
    if (desired.lengthSq() > 0.01) this.targetYaw = Math.atan2(desired.x, desired.z);
    this.animateLocomotion(speed);
    return speed;
  }

  /** Choix de l'animation de déplacement (avec hystérésis) et vitesse de lecture. */
  private animateLocomotion(speed: number): void {
    if (this.busy) return;
    const s = this.rig.scale;
    if (speed < 0.12) {
      if (this.current !== 'Idle') this.play('Idle', 0.3);
      return;
    }
    const running = this.current === 'Run' ? speed > 2.1 * s : speed > 2.5 * s;
    if (running) {
      if (this.current !== 'Run') this.play('Run', 0.3);
      this.setTimeScale(Math.min(1.5, Math.max(0.6, speed / (RUN_REF * s))));
    } else {
      if (this.current !== 'Walk') this.play('Walk', 0.3);
      this.setTimeScale(Math.min(1.6, Math.max(0.45, speed / (WALK_REF * s))));
    }
  }

  update(dt: number): void {
    this.yaw = lerpAngle(this.yaw, this.targetYaw, damp(this.busy ? 6 : 11, dt));
    this.object.rotation.y = this.yaw;
    this.mixer.update(dt);
  }
}
