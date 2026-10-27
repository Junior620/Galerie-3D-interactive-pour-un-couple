import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { frameDims } from '../src/gallery/frameSize';
import { CollisionWorld } from '../src/scene/collision';
import { computeLayout, DIM, type FrameSpec, type MuseumLayout, type RoomSpec } from '../src/scene/layout';
import { NavGrid } from '../src/scene/navGrid';

let key = 0;
const f = (aspect: number, grand = false, partition = false): FrameSpec => {
  const d = frameDims(aspect, grand);
  return { key: key++, outerW: d.outerW, outerH: d.outerH, grand, partition };
};

function sampleSpecs(extra = 0): RoomSpec[] {
  return [
    { id: 'a', nom: 'A', cloison: false, frames: [f(1.5), f(0.67), f(1.5, true), f(1), ...Array.from({ length: extra }, () => f(1.33))] },
    { id: 'b', nom: 'B', cloison: false, frames: [f(3, true), f(0.75), f(1.5), f(0.67)] },
    { id: 'c', nom: 'C', cloison: true, frames: [f(0.8, true, true), f(0.75, true, true), f(1.5), f(1)] },
  ];
}

/** Collisions construites comme dans le musée (murs + bancs). */
function worldOf(layout: MuseumLayout): CollisionWorld {
  const w = new CollisionWorld();
  for (const b of layout.walls) w.add({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, minZ: b.min.z, maxZ: b.max.z, kind: b.kind, blocksCamera: true });
  for (const r of layout.rooms) {
    for (const b of r.benches) {
      const alongX = Math.abs(b.facing.z) > 0.5;
      w.addBox(b.center, alongX ? b.length : DIM.benchDepth, alongX ? DIM.benchDepth : b.length, DIM.benchH, 'banc');
    }
  }
  return w;
}

describe('plan du musée', () => {
  const layout = computeLayout(sampleSpecs());

  it('place tous les cadres', () => {
    const placed = layout.rooms.reduce((s, r) => s + r.frames.length, 0);
    expect(placed).toBe(12);
  });

  it('ne superpose jamais deux cadres d’un même mur', () => {
    for (const r of layout.rooms) {
      const byWall = new Map<string, typeof r.frames>();
      for (const fr of r.frames) byWall.set(fr.wall, [...(byWall.get(fr.wall) ?? []), fr]);
      for (const list of byWall.values()) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            const dist = a.position.distanceTo(b.position.clone().setY(a.position.y));
            expect(dist).toBeGreaterThanOrEqual((a.spec.outerW + b.spec.outerW) / 2 - 1e-6);
          }
        }
      }
    }
  });

  it('ne coupe aucun cadre par une ouverture ni par un angle', () => {
    const D = layout.depth;
    for (const r of layout.rooms) {
      for (const fr of r.frames) {
        const half = fr.spec.outerW / 2;
        if (fr.wall === 'E' || fr.wall === 'W') {
          const z = fr.position.z;
          const hasDoor = fr.wall === 'E' ? r.hasEastDoor : r.hasWestDoor;
          if (hasDoor) expect(Math.abs(z) - half).toBeGreaterThanOrEqual(DIM.doorW / 2 - 1e-6);
          expect(Math.abs(z) + half).toBeLessThanOrEqual(D / 2 - DIM.wallT / 2 + 1e-6);
        }
        if (fr.wall === 'N' || fr.wall === 'S') {
          expect(fr.position.x - half).toBeGreaterThanOrEqual(r.x0);
          expect(fr.position.x + half).toBeLessThanOrEqual(r.x1);
        }
        // Le cadre tient dans la hauteur du mur (ou de la cloison)
        const top = fr.wall.startsWith('P') ? DIM.partitionH : DIM.wallH;
        expect(fr.position.y + fr.spec.outerH / 2).toBeLessThanOrEqual(top);
        expect(fr.position.y - fr.spec.outerH / 2).toBeGreaterThan(0.3);
      }
    }
  });

  it('réserve les grands formats aux murs pleins et leur ajoute un banc', () => {
    for (const r of layout.rooms) {
      for (const fr of r.frames.filter((x) => x.spec.grand)) {
        expect(fr.bench).not.toBeNull();
        if (fr.wall === 'E') expect(r.hasEastDoor).toBe(false);
        if (fr.wall === 'W') expect(r.hasWestDoor).toBe(false);
      }
    }
  });

  it('dresse la cloison centrale avec deux portraits face à l’entrée', () => {
    const room = layout.rooms.find((r) => r.id === 'c')!;
    expect(room.partition).not.toBeNull();
    const front = room.frames.filter((x) => x.wall === 'P-avant');
    expect(front.length).toBe(2);
    expect(layout.depth).toBeGreaterThanOrEqual(room.partition!.width + 2 * DIM.partitionPassage - 1e-6);
  });

  it('agrandit la salle quand il y a beaucoup de photos', () => {
    const big = computeLayout(sampleSpecs(14));
    expect(big.rooms[0].x1 - big.rooms[0].x0).toBeGreaterThan(layout.rooms[0].x1 - layout.rooms[0].x0);
    expect(big.rooms[0].frames.length).toBe(18);
  });
});

describe('collisions et navigation', () => {
  const layout = computeLayout(sampleSpecs());
  const world = worldOf(layout);

  it('repousse un avatar hors d’un mur', () => {
    const p = new THREE.Vector3(layout.rooms[0].x0 + 0.05, 0, 0);
    world.resolveCircle(p, 0.3);
    expect(p.x).toBeGreaterThanOrEqual(layout.rooms[0].x0 + DIM.wallT / 2 + 0.3 - 1e-6);
  });

  it('laisse passer sous le linteau d’une ouverture', () => {
    const door = layout.doors[0];
    expect(world.overlaps(door.x, 0, 0.3)).toBe(false);
  });

  it('arrête la caméra devant un mur', () => {
    const origin = new THREE.Vector3(layout.rooms[0].center.x, 1.6, 0);
    const d = world.raycast(origin, new THREE.Vector3(0, 0, -1), 50);
    expect(d).toBeCloseTo(layout.depth / 2 - DIM.wallT / 2, 3);
  });

  it('trouve un chemin de l’entrée à la dernière salle', () => {
    const nav = new NavGrid(world, layout.minX, layout.maxX, -layout.depth / 2, layout.depth / 2);
    const goal = layout.rooms[layout.rooms.length - 1].danceSpot;
    const path = nav.findPath(layout.spawn.position, goal);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1].distanceTo(goal)).toBeLessThan(1e-6);
    // Aucun point du chemin n'est dans un obstacle
    for (const p of path!) expect(world.overlaps(p.x, p.z, 0.25)).toBe(false);
  });
});
