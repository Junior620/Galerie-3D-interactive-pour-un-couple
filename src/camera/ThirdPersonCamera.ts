import * as THREE from 'three';
import type { CollisionWorld } from '../scene/collision';
import { clamp, damp } from '../utils/math';

/**
 * Caméra à la troisième personne : derrière et au-dessus de l'avatar
 * (≈ 4 m, ≈ 2,4 m de haut), suivi lissé, rotation et zoom bornés.
 * Anti-collision : un rayon part de l'avatar vers la caméra ; si un mur
 * s'interpose, la caméra se rapproche (vite), puis recule doucement.
 */
export class ThirdPersonCamera {
  /** Direction de regard horizontale (même convention que l'orientation des avatars) */
  yaw = 0;
  pitch = 0.24;
  distance = 4;
  readonly minDistance = 1.5;
  readonly maxDistance = 7;
  readonly target = new THREE.Vector3();
  readonly position = new THREE.Vector3();
  private current = 4;
  private readonly dir = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();

  constructor(private readonly world: CollisionWorld) {}

  rotate(dx: number, dy: number): void {
    this.yaw += dx * 0.0055;
    this.pitch = clamp(this.pitch + dy * 0.004, -0.15, 1.1);
  }

  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Place immédiatement la caméra derrière un point. */
  snap(focus: THREE.Vector3, height: number, yaw: number): void {
    this.yaw = yaw;
    this.target.set(focus.x, focus.y + height * 0.8, focus.z);
    this.current = this.distance;
    this.update(0, focus, height);
  }

  /** Vecteurs avant / droite au sol, relatifs à la caméra (pour le déplacement). */
  basis(forward: THREE.Vector3, right: THREE.Vector3): void {
    forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  update(dt: number, focus: THREE.Vector3, height: number): void {
    this.desired.set(focus.x, focus.y + height * 0.8, focus.z);
    if (dt > 0) this.target.lerp(this.desired, damp(10, dt));
    else this.target.copy(this.desired);

    const cp = Math.cos(this.pitch);
    this.dir.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // Trois rayons (centre et côtés) : la caméra ne frôle pas les chambranles.
    let hit = this.world.raycast(this.target, this.dir, this.distance + 0.4);
    this.side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.22);
    for (const s of [1, -1]) {
      this.origin.copy(this.target).addScaledVector(this.side, s);
      hit = Math.min(hit, this.world.raycast(this.origin, this.dir, this.distance + 0.4));
    }
    const allowed = Math.max(0.45, Math.min(this.distance, hit - 0.3));
    if (dt <= 0) this.current = allowed;
    else this.current += (allowed - this.current) * damp(allowed < this.current ? 22 : 3.5, dt);
    this.position.copy(this.target).addScaledVector(this.dir, this.current);
  }
}
