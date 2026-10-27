import * as THREE from 'three';

/**
 * Collisions simples, sans moteur physique :
 * - les avatars sont des cercles dans le plan XZ, repoussés hors des boîtes ;
 * - la caméra lance un rayon 3D contre les mêmes boîtes (méthode des « slabs »).
 */
export interface Collider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind: 'mur' | 'cloison' | 'banc' | 'socle';
  /** Les obstacles bas (bancs, socles) ne bloquent pas la caméra */
  blocksCamera: boolean;
}

/** Les boîtes qui commencent au-dessus de cette hauteur (linteaux, plafond) ne gênent pas la marche. */
const OVERHEAD = 2;

export class CollisionWorld {
  readonly colliders: Collider[] = [];

  add(c: Collider): void {
    this.colliders.push(c);
  }

  /** Ajoute une boîte orientée selon X ou Z à partir de son centre au sol. */
  addBox(center: THREE.Vector3, sizeX: number, sizeZ: number, height: number, kind: Collider['kind']): void {
    this.add({
      minX: center.x - sizeX / 2,
      maxX: center.x + sizeX / 2,
      minY: 0,
      maxY: height,
      minZ: center.z - sizeZ / 2,
      maxZ: center.z + sizeZ / 2,
      kind,
      blocksCamera: kind === 'mur' || kind === 'cloison',
    });
  }

  /**
   * Repousse un cercle (rayon r) hors de tous les obstacles.
   * Modifie pos.x / pos.z ; renvoie vrai s'il y a eu contact.
   */
  resolveCircle(pos: THREE.Vector3, r: number): boolean {
    let hit = false;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const c of this.colliders) {
        if (c.minY > OVERHEAD) continue;
        if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          // Centre à l'intérieur de la boîte : on sort par le côté le plus proche.
          const left = pos.x - c.minX;
          const right = c.maxX - pos.x;
          const back = pos.z - c.minZ;
          const front = c.maxZ - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = c.minX - r;
          else if (m === right) pos.x = c.maxX + r;
          else if (m === back) pos.z = c.minZ - r;
          else pos.z = c.maxZ + r;
          dx = dz = 0;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** Vrai si un cercle de rayon r à cette position chevauche un obstacle. */
  overlaps(x: number, z: number, r: number): boolean {
    for (const c of this.colliders) {
      if (c.minY > OVERHEAD) continue;
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /**
   * Distance jusqu'au premier obstacle le long d'un rayon 3D (ou maxDist).
   * Utilisé par la caméra pour ne jamais passer derrière un mur.
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, cameraOnly = true): number {
    let best = maxDist;
    for (const c of this.colliders) {
      if (cameraOnly && !c.blocksCamera) continue;
      const t = rayBox(origin, dir, c);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  /** Ligne de vue au sol entre deux points pour un cercle de rayon r (échantillonnage). */
  clearPath(ax: number, az: number, bx: number, bz: number, r: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (r * 0.75)));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (this.overlaps(ax + dx * k, az + dz * k, r)) return false;
    }
    return true;
  }
}

function rayBox(o: THREE.Vector3, d: THREE.Vector3, c: Collider): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, c.minX, c.maxX],
    [o.y, d.y, c.minY, c.maxY],
    [o.z, d.z, c.minZ, c.maxZ],
  ];
  for (const [p, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) {
      if (p < lo || p > hi) return null;
    } else {
      let t1 = (lo - p) / v;
      let t2 = (hi - p) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
