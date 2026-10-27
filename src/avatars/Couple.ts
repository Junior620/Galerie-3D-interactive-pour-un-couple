import * as THREE from 'three';
import gsap from 'gsap';
import { DIM, type BenchLayout } from '../scene/layout';
import type { Avatar } from './Avatar';
import type { Navigator } from './Navigator';

/**
 * Actions à deux : s'asseoir côte à côte sur un banc, face à la photo,
 * et danser face à face.
 */
export class Couple {
  private seq = 0;

  constructor(private readonly navigator: Navigator) {}

  /** Places assises sur un banc (deux sièges espacés de 0,9 m). */
  static seats(bench: BenchLayout): [THREE.Vector3, THREE.Vector3] {
    const f = bench.facing;
    const along = new THREE.Vector3(f.z, 0, -f.x);
    return [bench.center.clone().addScaledVector(along, 0.45), bench.center.clone().addScaledVector(along, -0.45)];
  }

  /** Distance entre un point et le rectangle du banc. */
  static distanceToBench(p: THREE.Vector3, bench: BenchLayout): number {
    const f = bench.facing;
    const dx = p.x - bench.center.x;
    const dz = p.z - bench.center.z;
    const a = Math.abs(dx * f.z - dz * f.x) - bench.length / 2;
    const b = Math.abs(dx * f.x + dz * f.z) - DIM.benchDepth / 2;
    return Math.hypot(Math.max(0, a), Math.max(0, b));
  }

  /**
   * Les deux avatars rejoignent le banc puis s'assoient.
   * Renvoie false si l'action a été interrompue entre-temps.
   */
  async sit(a: Avatar, b: Avatar, bench: BenchLayout): Promise<boolean> {
    const id = ++this.seq;
    const f = bench.facing;
    const [s1, s2] = Couple.seats(bench);
    const swap = a.position.distanceToSquared(s2) + b.position.distanceToSquared(s1) < a.position.distanceToSquared(s1) + b.position.distanceToSquared(s2);
    const seatOf = new Map([[a, swap ? s2 : s1], [b, swap ? s1 : s2]]);

    // 1. Marcher jusque devant le banc (hors de sa zone de collision)
    const front = (av: Avatar) => seatOf.get(av)!.clone().addScaledVector(f, DIM.benchDepth / 2 + av.radius + 0.12);
    const ok = await Promise.all([a, b].map((av) => this.navigator.walkTo(av, front(av), { speed: 1.35, teleport: true })));
    if (id !== this.seq || ok.includes(false)) return false;

    // 2. Se tourner vers la photo, reculer jusqu'au siège et s'asseoir
    const yaw = Math.atan2(f.x, f.z);
    for (const av of [a, b]) {
      av.busy = true;
      av.targetYaw = yaw;
      av.velocity.set(0, 0, 0);
      const stand = seatOf.get(av)!.clone().addScaledVector(f, av.rig.sitBack * av.rig.scale);
      gsap.to(av.position, { x: stand.x, z: stand.z, duration: 0.45, ease: 'sine.inOut' });
    }
    await wait(250);
    if (id !== this.seq) return false;
    a.play('Sit', 0.35);
    await wait(120);
    if (id !== this.seq) return false;
    b.play('Sit', 0.35);
    return true;
  }

  /** Se relever et s'écarter du banc. */
  stand(a: Avatar, b: Avatar, bench: BenchLayout | null): void {
    this.seq++;
    for (const av of [a, b]) {
      gsap.killTweensOf(av.position);
      if (!av.busy) continue;
      av.play('Idle', 0.45);
      if (bench) {
        const p = av.position.clone();
        const d = Couple.distanceToBench(p, bench);
        const push = DIM.benchDepth / 2 + av.radius + 0.05 - d;
        if (push > 0) {
          const t = p.addScaledVector(bench.facing, push + 0.1);
          gsap.to(av.position, { x: t.x, z: t.z, duration: 0.5, ease: 'sine.out' });
        }
      }
      setTimeout(() => (av.busy = false), 450);
    }
  }

  /** Les deux avatars se placent face à face puis dansent. */
  async dance(a: Avatar, b: Avatar): Promise<THREE.Vector3 | null> {
    const id = ++this.seq;
    const center = a.position.clone().add(b.position).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(b.position, a.position).setY(0);
    if (dir.lengthSq() < 0.04) dir.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    dir.normalize();
    const pa = center.clone().addScaledVector(dir, -0.55);
    const pb = center.clone().addScaledVector(dir, 0.55);
    const ok = await Promise.all([this.navigator.walkTo(a, pa, { speed: 1.2, teleport: true }), this.navigator.walkTo(b, pb, { speed: 1.2, teleport: true })]);
    if (id !== this.seq || ok.includes(false)) return null;
    a.faceTowards(b.position);
    b.faceTowards(a.position);
    a.busy = b.busy = true;
    a.play('Dance', 0.4);
    // Légère avance de phase pour elle : les gestes se répondent.
    b.play('Dance', 0.4, 0.5);
    return center;
  }

  stopDance(a: Avatar, b: Avatar): void {
    this.seq++;
    for (const av of [a, b]) {
      if (!av.busy) continue;
      av.play('Idle', 0.4);
      av.busy = false;
    }
  }

  /** Annule une action en cours (les marches sont interrompues par l'appelant). */
  cancel(): void {
    this.seq++;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
