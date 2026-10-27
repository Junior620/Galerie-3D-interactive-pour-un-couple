import * as THREE from 'three';
import gsap from 'gsap';
import type { CollisionWorld } from '../scene/collision';
import { ThirdPersonCamera } from './ThirdPersonCamera';

/**
 * Chef opérateur : décide où est la caméra.
 * - follow : troisième personne (ThirdPersonCamera) ;
 * - shot   : plan fixe (photo, banc, visite guidée), atteint par une transition GSAP ;
 * - orbit  : rotation lente autour d'un point (danse).
 * Les transitions mélangent la pose de départ et la pose cible « vivante »,
 * ce qui reste fluide même si la cible bouge pendant la transition.
 */
type Mode = 'follow' | 'shot' | 'orbit';

export class CameraDirector {
  mode: Mode = 'follow';
  readonly third: ThirdPersonCamera;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly shotPos = new THREE.Vector3();
  private readonly shotLook = new THREE.Vector3();
  private readonly orbitCenter = new THREE.Vector3();
  private orbitAngle = 0;
  private orbitRadius = 3.4;
  private orbitHeight = 1.7;
  private orbitSpeed = 0.18;
  private readonly blend = { t: 1 };
  private tween: gsap.core.Tween | null = null;
  private readonly tp = new THREE.Vector3();
  private readonly tl = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  /** Léger mouvement de « respiration » sur les plans fixes */
  private drift = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: CollisionWorld,
  ) {
    this.third = new ThirdPersonCamera(world);
  }

  private transition(duration: number, ease = 'power2.inOut'): Promise<void> {
    this.fromPos.copy(this.pos);
    this.fromLook.copy(this.look);
    this.tween?.kill();
    this.blend.t = duration > 0 ? 0 : 1;
    if (duration <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.tween = gsap.to(this.blend, { t: 1, duration, ease, onComplete: () => resolve() });
    });
  }

  /**
   * Retour à la troisième personne. Par défaut on garde l'angle de vue actuel ;
   * keepAngle = false conserve l'angle déjà réglé sur third (ex. derrière l'avatar).
   */
  follow(duration = 1.1, keepAngle = true): Promise<void> {
    if (this.mode !== 'follow' && keepAngle) {
      const d = this.dir.subVectors(this.look, this.pos);
      if (d.x * d.x + d.z * d.z > 1e-4) this.third.yaw = Math.atan2(d.x, d.z);
    }
    this.mode = 'follow';
    return this.transition(duration);
  }

  /** Plan fixe : la caméra glisse jusqu'à pos en regardant look. */
  shot(pos: THREE.Vector3, look: THREE.Vector3, duration = 1.4, ease?: string): Promise<void> {
    this.mode = 'shot';
    this.shotPos.copy(pos);
    this.shotLook.copy(look);
    this.drift = 0;
    return this.transition(duration, ease);
  }

  /** Rotation lente autour d'un point (danse). */
  orbit(center: THREE.Vector3, opts: { radius?: number; height?: number; speed?: number; duration?: number } = {}): Promise<void> {
    this.mode = 'orbit';
    this.orbitCenter.copy(center);
    this.orbitRadius = opts.radius ?? 3.4;
    this.orbitHeight = opts.height ?? 1.7;
    this.orbitSpeed = opts.speed ?? 0.18;
    // On démarre l'orbite là où se trouve déjà la caméra.
    this.orbitAngle = Math.atan2(this.pos.x - center.x, this.pos.z - center.z);
    return this.transition(opts.duration ?? 1.4);
  }

  get busy(): boolean {
    return this.blend.t < 1;
  }

  update(dt: number, focus: THREE.Vector3, height: number): void {
    this.third.update(dt, focus, height);
    if (this.mode === 'follow') {
      this.tp.copy(this.third.position);
      this.tl.copy(this.third.target);
    } else if (this.mode === 'shot') {
      this.drift += dt;
      this.tp.copy(this.shotPos);
      this.tp.y += Math.sin(this.drift * 0.6) * 0.015;
      this.tl.copy(this.shotLook);
    } else {
      this.orbitAngle += this.orbitSpeed * dt;
      const c = this.orbitCenter;
      this.dir.set(Math.sin(this.orbitAngle), 0, Math.cos(this.orbitAngle));
      const origin = this.tl.set(c.x, c.y + 1.2, c.z);
      const hit = this.world.raycast(origin, this.dir, this.orbitRadius + 0.3);
      const r = Math.max(1.2, Math.min(this.orbitRadius, hit - 0.35));
      this.tp.set(c.x + this.dir.x * r, c.y + this.orbitHeight, c.z + this.dir.z * r);
      this.tl.set(c.x, c.y + 1.05, c.z);
    }

    if (this.blend.t < 1) {
      this.pos.lerpVectors(this.fromPos, this.tp, this.blend.t);
      this.look.lerpVectors(this.fromLook, this.tl, this.blend.t);
    } else {
      this.pos.copy(this.tp);
      this.look.copy(this.tl);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  /** Place la caméra instantanément (premier affichage). */
  jump(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.tween?.kill();
    this.blend.t = 1;
    this.pos.copy(pos);
    this.look.copy(look);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }
}
