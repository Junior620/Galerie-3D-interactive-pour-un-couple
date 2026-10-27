import * as THREE from 'three';
import type { CollisionWorld } from '../scene/collision';
import type { NavGrid } from '../scene/navGrid';
import type { Avatar } from './Avatar';

/**
 * Compagnon : suit l'avatar contrôlé à environ 1,2 m sur le côté.
 * Il marche (ou court) quand la distance augmente, s'arrête en Idle sinon,
 * regarde dans la même direction que son partenaire, et contourne les murs
 * grâce à la grille de navigation quand la ligne droite est bloquée.
 */
export class Companion {
  private side = 1;
  private moving = false;
  private path: THREE.Vector3[] | null = null;
  private pathIndex = 0;
  private repath = 0;
  private readonly target = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(
    private readonly world: CollisionWorld,
    private readonly nav: NavGrid,
  ) {}

  /** Place à côté du partenaire (gauche ou droite selon où l'on se trouve déjà). */
  private computeTarget(leader: Avatar, follower: Avatar): THREE.Vector3 {
    const y = leader.yaw;
    this.fwd.set(Math.sin(y), 0, Math.cos(y));
    this.right.set(-Math.cos(y), 0, Math.sin(y));
    const rel = this.wish.subVectors(follower.position, leader.position);
    const d = rel.dot(this.right);
    // Hystérésis : on ne change de côté que si l'on est nettement passé de l'autre.
    if (d * this.side < -0.5) this.side = Math.sign(d) || 1;

    const r = follower.radius + 0.05;
    for (const s of [this.side, -this.side]) {
      this.target.copy(leader.position).addScaledVector(this.right, 1.2 * s).addScaledVector(this.fwd, -0.3);
      if (!this.world.overlaps(this.target.x, this.target.z, r) && this.world.clearPath(leader.position.x, leader.position.z, this.target.x, this.target.z, 0.15)) {
        this.side = s;
        return this.target;
      }
    }
    // Pas de place sur les côtés (passage étroit) : on se met derrière.
    return this.target.copy(leader.position).addScaledVector(this.fwd, -1.2);
  }

  update(dt: number, follower: Avatar, leader: Avatar): void {
    if (follower.busy) return;
    const target = this.computeTarget(leader, follower);
    const dx = target.x - follower.position.x;
    const dz = target.z - follower.position.z;
    const dist = Math.hypot(dx, dz);
    const leaderSpeed = Math.hypot(leader.velocity.x, leader.velocity.z);

    // Trop loin (téléportation de l'autre avatar, etc.) : on le rejoint directement.
    if (dist > 22) {
      follower.position.copy(target);
      this.path = null;
      return;
    }
    if (!this.moving && dist > 0.6) this.moving = true;
    if (this.moving && dist < 0.22 && leaderSpeed < 0.3) this.moving = false;

    if (!this.moving) {
      follower.move(this.wish.set(0, 0, 0), dt, this.world);
      follower.targetYaw = leader.yaw;
      this.path = null;
      return;
    }

    // Direction : ligne droite si dégagée, sinon chemin A*.
    let tx = target.x;
    let tz = target.z;
    if (!this.world.clearPath(follower.position.x, follower.position.z, tx, tz, follower.radius * 0.9)) {
      this.repath -= dt;
      if (!this.path || this.repath <= 0) {
        this.path = this.nav.findPath(follower.position, target);
        this.pathIndex = 1;
        this.repath = 0.6;
      }
      if (this.path && this.pathIndex < this.path.length) {
        const wp = this.path[this.pathIndex];
        if (Math.hypot(wp.x - follower.position.x, wp.z - follower.position.z) < 0.35) this.pathIndex++;
        const p = this.path[Math.min(this.pathIndex, this.path.length - 1)];
        tx = p.x;
        tz = p.z;
      }
    } else this.path = null;

    const ddx = tx - follower.position.x;
    const ddz = tz - follower.position.z;
    const dd = Math.hypot(ddx, ddz) || 1;
    // Rattrapage : on court si l'on est loin, sinon on règle la vitesse sur la distance.
    const max = dist > 4 || leaderSpeed > 2.6 ? 3.8 : Math.max(1.5, leaderSpeed + 0.4);
    const speed = Math.min(max, Math.max(0.5, dist * 1.8));
    this.wish.set(ddx / dd, 0, ddz / dd).multiplyScalar(speed);
    follower.move(this.wish, dt, this.world);
  }
}
