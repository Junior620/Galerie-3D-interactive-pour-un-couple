import * as THREE from 'three';
import type { CollisionWorld } from './collision';

/**
 * Grille de navigation (A*) construite à partir des obstacles.
 * Sert au compagnon quand il perd son partenaire de vue, à la visite guidée
 * et aux trajets vers un banc.
 */
export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly ox: number;
  private readonly oz: number;
  private readonly blocked: Uint8Array;

  constructor(world: CollisionWorld, minX: number, maxX: number, minZ: number, maxZ: number, radius = 0.34, cell = 0.2) {
    this.cell = cell;
    this.ox = minX;
    this.oz = minZ;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.ox + (c + 0.5) * cell;
        const z = this.oz + (r + 0.5) * cell;
        if (world.overlaps(x, z, radius)) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  private toCell(x: number, z: number): [number, number] {
    return [
      Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.ox) / this.cell))),
      Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.oz) / this.cell))),
    ];
  }

  private isFree(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.blocked[r * this.cols + c] === 0;
  }

  /** Cellule libre la plus proche (recherche en anneaux). */
  private nearestFree(c: number, r: number): [number, number] | null {
    if (this.isFree(c, r)) return [c, r];
    for (let rad = 1; rad < 30; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.isFree(c + dc, r + dr)) return [c + dc, r + dr];
        }
      }
    }
    return null;
  }

  /** Ligne de vue sur la grille (supercouverture, pas de diagonale « coupée »). */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const [c, r] = this.toCell(ax + (dx * i) / steps, az + (dz * i) / steps);
      if (!this.isFree(c, r)) return false;
    }
    return true;
  }

  /** Chemin lissé (liste de points au sol) ou null si inaccessible. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const s = this.nearestFree(...this.toCell(from.x, from.z));
    const g = this.nearestFree(...this.toCell(to.x, to.z));
    if (!s || !g) return null;
    const cols = this.cols;
    const start = s[1] * cols + s[0];
    const goal = g[1] * cols + g[0];
    const n = cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (i: number) => {
      const dx = Math.abs((i % cols) - g[0]);
      const dz = Math.abs(Math.floor(i / cols) - g[1]);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    gScore[start] = 0;
    heap.push(start, h(start));
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cc = cur % cols;
      const cr = Math.floor(cur / cols);
      for (const [dc, dr, cost] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (!this.isFree(nc, nr)) continue;
        // Pas de diagonale entre deux obstacles
        if (dc && dr && (!this.isFree(cc + dc, cr) || !this.isFree(cc, cr + dr))) continue;
        const ni = nr * cols + nc;
        const tentative = gScore[cur] + cost;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          came[ni] = cur;
          heap.push(ni, tentative + h(ni));
        }
      }
    }
    if (!found) return null;

    const cells: number[] = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => new THREE.Vector3(this.ox + ((i % cols) + 0.5) * this.cell, 0, this.oz + (Math.floor(i / cols) + 0.5) * this.cell));
    pts[pts.length - 1].set(to.x, 0, to.z);
    if (this.isFree(...this.toCell(from.x, from.z))) pts[0].set(from.x, 0, from.z);

    // Lissage : on saute les points intermédiaires tant que la vue est dégagée.
    const out: THREE.Vector3[] = [pts[0]];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let next = pts.length - 1;
      while (next > anchor + 1 && !this.lineOfSight(pts[anchor].x, pts[anchor].z, pts[next].x, pts[next].z)) next--;
      out.push(pts[next]);
      anchor = next;
    }
    return out;
  }
}

/** Tas binaire minimal pour A*. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && keys[r] < keys[l] ? r : l;
        if (keys[m] >= lastKey) break;
        ids[i] = ids[m];
        keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
