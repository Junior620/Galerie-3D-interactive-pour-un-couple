import * as THREE from 'three';
import type { CollisionWorld } from '../scene/collision';
import type { NavGrid } from '../scene/navGrid';
import type { Avatar } from './Avatar';

/**
 * Déplacements automatiques vers un point (banc, piste de danse, visite) :
 * chemin A* lissé, ralentissement à l'arrivée, détection de blocage
 * (recalcul du chemin, puis téléportation si demandé).
 */
interface Task {
  goal: THREE.Vector3;
  path: THREE.Vector3[];
  index: number;
  speed: number;
  arrive: number;
  teleport: boolean;
  resolve: (ok: boolean) => void;
  stuckTime: number;
  lastPos: THREE.Vector3;
  retries: number;
  elapsed: number;
  maxTime: number;
}

export interface WalkOptions {
  /** Vitesse (m/s), 1,4 par défaut */
  speed?: number;
  /** Distance d'arrivée (m) */
  arrive?: number;
  /** En cas d'échec, on place l'avatar directement à destination */
  teleport?: boolean;
}

export class Navigator {
  private readonly tasks = new Map<Avatar, Task>();
  private readonly wish = new THREE.Vector3();

  constructor(
    private readonly world: CollisionWorld,
    private readonly nav: NavGrid,
  ) {}

  walkTo(avatar: Avatar, goal: THREE.Vector3, opts: WalkOptions = {}): Promise<boolean> {
    this.cancel(avatar);
    const path = this.nav.findPath(avatar.position, goal) ?? [avatar.position.clone(), goal.clone()];
    const length = path.reduce((s, p, i) => (i ? s + p.distanceTo(path[i - 1]) : 0), 0);
    const speed = opts.speed ?? 1.4;
    return new Promise((resolve) => {
      this.tasks.set(avatar, {
        goal: goal.clone().setY(0),
        path,
        index: 1,
        speed,
        arrive: opts.arrive ?? 0.12,
        teleport: opts.teleport ?? false,
        resolve,
        stuckTime: 0,
        lastPos: avatar.position.clone(),
        retries: 0,
        elapsed: 0,
        maxTime: length / speed * 2.5 + 4,
      });
    });
  }

  isWalking(avatar: Avatar): boolean {
    return this.tasks.has(avatar);
  }

  cancel(avatar: Avatar): void {
    const t = this.tasks.get(avatar);
    if (!t) return;
    this.tasks.delete(avatar);
    t.resolve(false);
  }

  cancelAll(): void {
    for (const a of [...this.tasks.keys()]) this.cancel(a);
  }

  update(dt: number): void {
    for (const [avatar, t] of this.tasks) {
      t.elapsed += dt;
      const target = t.path[Math.min(t.index, t.path.length - 1)];
      const isLast = t.index >= t.path.length - 1;
      const dx = target.x - avatar.position.x;
      const dz = target.z - avatar.position.z;
      const dist = Math.hypot(dx, dz);

      if (isLast && dist < t.arrive) {
        avatar.move(this.wish.set(0, 0, 0), dt, this.world);
        this.finish(avatar, t, true);
        continue;
      }
      if (!isLast && dist < 0.35) {
        t.index++;
        continue;
      }
      // Ralentissement en approche de la destination finale
      const speed = isLast ? Math.max(0.45, Math.min(t.speed, dist * 2.2)) : t.speed;
      this.wish.set(dx / dist, 0, dz / dist).multiplyScalar(speed);
      avatar.move(this.wish, dt, this.world);

      // Blocage : presque immobile depuis une seconde
      if (avatar.position.distanceToSquared(t.lastPos) < 0.0004) t.stuckTime += dt;
      else t.stuckTime = 0;
      t.lastPos.copy(avatar.position);
      if (t.stuckTime > 1 || t.elapsed > t.maxTime) {
        t.stuckTime = 0;
        t.retries++;
        const path = t.retries < 3 && t.elapsed < t.maxTime ? this.nav.findPath(avatar.position, t.goal) : null;
        if (path) {
          t.path = path;
          t.index = 1;
        } else {
          if (t.teleport) avatar.position.copy(t.goal);
          this.finish(avatar, t, t.teleport);
        }
      }
    }
  }

  private finish(avatar: Avatar, t: Task, ok: boolean): void {
    this.tasks.delete(avatar);
    t.resolve(ok);
  }
}
