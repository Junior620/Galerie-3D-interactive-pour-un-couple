import * as THREE from 'three';

/**
 * Génération procédurale du plan du musée (données pures, sans maillage).
 *
 * Les salles sont alignées en enfilade le long de l'axe X et reliées par des
 * ouvertures centrées. La profondeur (axe Z) est commune à toutes les salles ;
 * la largeur de chaque salle s'adapte au nombre et à la taille de ses cadres.
 * Une salle « cloisonCentrale » reçoit une cloison sombre autoportante.
 */

/** Dimensions de référence (mètres). */
export const DIM = {
  wallH: 4.2,
  wallT: 0.2,
  doorW: 2.6,
  doorH: 3.0,
  eye: 1.6,
  /** Marge minimale entre un cadre et un angle de mur */
  corner: 0.8,
  /** Marge minimale entre un cadre et une ouverture */
  doorMargin: 0.55,
  /** Écart souhaité entre deux cadres (bords extérieurs) */
  gap: 1.1,
  gapGrand: 1.5,
  baseDepth: 10,
  minWidth: 9,
  minWidthPartition: 12,
  maxWidth: 30,
  benchDist: 2.6,
  benchLen: 1.8,
  benchDepth: 0.48,
  benchH: 0.45,
  partitionT: 0.36,
  partitionH: 3.5,
  /** Largeur minimale des passages de part et d'autre de la cloison */
  partitionPassage: 2.8,
  socleSize: 0.5,
  socleH: 1.05,
} as const;

export interface FrameSpec {
  /** Identifiant unique (index de la photo) */
  key: number;
  /** Largeur extérieure du cadre (m) */
  outerW: number;
  /** Hauteur extérieure du cadre (m) */
  outerH: number;
  grand: boolean;
  /** À accrocher sur la cloison centrale (si la salle en a une) */
  partition: boolean;
}

export interface RoomSpec {
  id: string;
  nom: string;
  cloison: boolean;
  /** Cadres dans l'ordre chronologique */
  frames: FrameSpec[];
}

export type WallId = 'N' | 'S' | 'E' | 'W' | 'P-avant' | 'P-arriere';

export interface BenchLayout {
  /** Centre au sol */
  center: THREE.Vector3;
  /** Direction regardée par les personnes assises (vers la photo) */
  facing: THREE.Vector3;
  length: number;
  frame: PlacedFrame | null;
  room: number;
}

export interface PlacedFrame {
  spec: FrameSpec;
  room: number;
  wall: WallId;
  /** Centre du cadre, contre la surface du mur */
  position: THREE.Vector3;
  /** Normale du mur, orientée vers la salle */
  normal: THREE.Vector3;
  bench: BenchLayout | null;
  /** Ordre de passage dans la salle */
  order: number;
}

export interface SocleLayout {
  position: THREE.Vector3;
  sculpture: number;
}

export interface PartitionLayout {
  center: THREE.Vector3;
  /** Étendue le long de Z */
  width: number;
  height: number;
  thickness: number;
}

export interface RoomLayout {
  index: number;
  id: string;
  nom: string;
  x0: number;
  x1: number;
  center: THREE.Vector3;
  partition: PartitionLayout | null;
  frames: PlacedFrame[];
  benches: BenchLayout[];
  socles: SocleLayout[];
  danceSpot: THREE.Vector3;
  hasWestDoor: boolean;
  hasEastDoor: boolean;
}

/** Boîte de mur en 3D (sert au rendu, aux collisions et à la caméra). */
export interface WallBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  kind: 'mur' | 'cloison';
}

export interface WallText {
  room: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface MuseumLayout {
  rooms: RoomLayout[];
  depth: number;
  minX: number;
  maxX: number;
  walls: WallBox[];
  doors: { x: number; width: number; height: number }[];
  spawn: { position: THREE.Vector3; yaw: number };
  /** Mur de titre (entrée du musée) */
  titleWall: WallText;
  /** Panneaux de nom de salle au-dessus des ouvertures */
  lintels: WallText[];
}

interface Segment {
  wall: WallId;
  /** Point de départ (x, z) de la portion utilisable */
  sx: number;
  sz: number;
  /** Direction de parcours */
  dx: number;
  dz: number;
  length: number;
  normal: THREE.Vector3;
  allowGrand: boolean;
}

interface RoomFit {
  frames: PlacedFrame[];
  leftover: number;
}

/** Hauteur du centre d'un cadre : hauteur des yeux, relevée pour les grands formats. */
export function frameCenterY(spec: FrameSpec): number {
  const y = spec.grand ? Math.max(DIM.eye + 0.1, spec.outerH / 2 + 0.6) : DIM.eye;
  return Math.min(y, DIM.wallH - 0.45 - spec.outerH / 2);
}

function partitionFrontWidth(frames: FrameSpec[]): number {
  const front = frames.filter((f) => f.partition).slice(0, 2);
  const sum = front.reduce((s, f) => s + f.outerW, 0);
  return Math.max(5, sum + DIM.gapGrand * Math.max(0, front.length - 1) + 1.6);
}

function buildSegments(x0: number, W: number, D: number, westDoor: boolean, eastDoor: boolean, first: boolean): Segment[] {
  const t = DIM.wallT / 2;
  const xa = x0 + t;
  const xb = x0 + W - t;
  const za = -D / 2 + t;
  const zb = D / 2 - t;
  const c = DIM.corner;
  const dz = DIM.doorW / 2 + DIM.doorMargin;
  const segs: Segment[] = [];
  const push = (s: Segment) => {
    if (s.length > 0.6) segs.push(s);
  };

  // Mur nord, de l'ouest vers l'est
  push({ wall: 'N', sx: xa + c, sz: za, dx: 1, dz: 0, length: xb - xa - 2 * c, normal: new THREE.Vector3(0, 0, 1), allowGrand: true });
  // Mur est
  if (eastDoor) {
    push({ wall: 'E', sx: xb, sz: za + c, dx: 0, dz: 1, length: -dz - (za + c), normal: new THREE.Vector3(-1, 0, 0), allowGrand: false });
    push({ wall: 'E', sx: xb, sz: dz, dx: 0, dz: 1, length: zb - c - dz, normal: new THREE.Vector3(-1, 0, 0), allowGrand: false });
  } else {
    push({ wall: 'E', sx: xb, sz: za + c, dx: 0, dz: 1, length: zb - za - 2 * c, normal: new THREE.Vector3(-1, 0, 0), allowGrand: true });
  }
  // Mur sud, de l'est vers l'ouest
  push({ wall: 'S', sx: xb - c, sz: zb, dx: -1, dz: 0, length: xb - xa - 2 * c, normal: new THREE.Vector3(0, 0, -1), allowGrand: true });
  // Mur ouest (la première salle garde ce mur pour le titre du musée)
  if (westDoor) {
    push({ wall: 'W', sx: xa, sz: zb - c, dx: 0, dz: -1, length: zb - c - dz, normal: new THREE.Vector3(1, 0, 0), allowGrand: false });
    push({ wall: 'W', sx: xa, sz: -dz, dx: 0, dz: -1, length: -dz - (za + c), normal: new THREE.Vector3(1, 0, 0), allowGrand: false });
  } else if (!first) {
    push({ wall: 'W', sx: xa, sz: zb - c, dx: 0, dz: -1, length: zb - za - 2 * c, normal: new THREE.Vector3(1, 0, 0), allowGrand: true });
  }
  return segs;
}

/**
 * Remplit les murs d'une salle avec ses cadres, dans l'ordre chronologique.
 * Un grand format ne va que sur un mur qui l'accepte (pas à côté d'une ouverture).
 */
function fitRoom(index: number, spec: RoomSpec, x0: number, W: number, D: number, westDoor: boolean, eastDoor: boolean): RoomFit {
  const segs = buildSegments(x0, W, D, westDoor, eastDoor, index === 0);
  const queue = spec.frames.filter((f) => !(spec.cloison && f.partition && isOnPartition(spec, f)));
  const placed: PlacedFrame[] = [];
  let order = 0;

  for (const seg of segs) {
    const fit: FrameSpec[] = [];
    let used = 0;
    for (let i = 0; i < queue.length; ) {
      const f = queue[i];
      if (f.grand && !seg.allowGrand) {
        i++;
        continue;
      }
      const prev = fit[fit.length - 1];
      const gap = prev ? (prev.grand || f.grand ? DIM.gapGrand : DIM.gap) : 0;
      if (used + gap + f.outerW > seg.length) break;
      fit.push(f);
      queue.splice(i, 1);
      used += gap + f.outerW;
    }
    if (!fit.length) continue;

    // Répartition régulière : l'espace libre est partagé équitablement.
    const widths = fit.reduce((s, f) => s + f.outerW, 0);
    const space = (seg.length - widths) / (fit.length + 1);
    let cursor = space;
    for (const f of fit) {
      const t = cursor + f.outerW / 2;
      cursor += f.outerW + space;
      const x = seg.sx + seg.dx * t;
      const z = seg.sz + seg.dz * t;
      placed.push({
        spec: f,
        room: index,
        wall: seg.wall,
        position: new THREE.Vector3(x, frameCenterY(f), z),
        normal: seg.normal.clone(),
        bench: null,
        order: order++,
      });
    }
  }
  return { frames: placed, leftover: queue.length };
}

/** Les deux premiers cadres « cloison » vont devant, les deux suivants derrière. */
function isOnPartition(spec: RoomSpec, f: FrameSpec): boolean {
  const list = spec.frames.filter((x) => x.partition);
  return list.indexOf(f) < 4;
}

export function computeLayout(specs: RoomSpec[]): MuseumLayout {
  if (!specs.length) throw new Error('Aucune salle à construire.');

  // Profondeur commune : la cloison doit laisser deux passages confortables.
  let D: number = DIM.baseDepth;
  for (const s of specs) {
    if (s.cloison) D = Math.max(D, Math.ceil(partitionFrontWidth(s.frames) + 2 * DIM.partitionPassage));
  }

  let widths: number[] = [];
  let fits: RoomFit[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    widths = [];
    fits = [];
    let x0 = 0;
    let ok = true;
    specs.forEach((s, i) => {
      const westDoor = i > 0;
      const eastDoor = i < specs.length - 1;
      let W: number = s.cloison ? DIM.minWidthPartition : DIM.minWidth;
      let fit = fitRoom(i, s, x0, W, D, westDoor, eastDoor);
      while (fit.leftover > 0 && W < DIM.maxWidth) {
        W += 0.5;
        fit = fitRoom(i, s, x0, W, D, westDoor, eastDoor);
      }
      if (fit.leftover > 0) ok = false;
      widths.push(W);
      fits.push(fit);
      x0 += W;
    });
    if (ok) break;
    D += 2; // On approfondit toutes les salles et on recommence.
  }

  const t = DIM.wallT;
  const rooms: RoomLayout[] = [];
  const walls: WallBox[] = [];
  const doors: MuseumLayout['doors'] = [];
  const lintels: WallText[] = [];
  let x0 = 0;

  specs.forEach((s, i) => {
    const W = widths[i];
    const x1 = x0 + W;
    const room: RoomLayout = {
      index: i,
      id: s.id,
      nom: s.nom,
      x0,
      x1,
      center: new THREE.Vector3((x0 + x1) / 2, 0, 0),
      partition: null,
      frames: fits[i].frames,
      benches: [],
      socles: [],
      danceSpot: new THREE.Vector3((x0 + x1) / 2, 0, 0),
      hasWestDoor: i > 0,
      hasEastDoor: i < specs.length - 1,
    };

    // --- Cloison centrale ---
    if (s.cloison) {
      const onPartition = s.frames.filter((f) => f.partition).slice(0, 4);
      const front = onPartition.slice(0, 2);
      const back = onPartition.slice(2, 4);
      const pw = partitionFrontWidth(s.frames);
      const px = x0 + W * 0.58;
      const tp = DIM.partitionT;
      room.partition = { center: new THREE.Vector3(px, DIM.partitionH / 2, 0), width: pw, height: DIM.partitionH, thickness: tp };
      walls.push({
        min: new THREE.Vector3(px - tp / 2, 0, -pw / 2),
        max: new THREE.Vector3(px + tp / 2, DIM.partitionH, pw / 2),
        kind: 'cloison',
      });
      const placeOnFace = (list: FrameSpec[], face: 'P-avant' | 'P-arriere') => {
        const sign = face === 'P-avant' ? -1 : 1;
        const total = list.reduce((acc, f) => acc + f.outerW, 0) + DIM.gapGrand * Math.max(0, list.length - 1);
        // Face avant (vers l'entrée) : de gauche à droite pour un visiteur qui arrive de l'ouest.
        let cursor = -total / 2;
        const ordered = face === 'P-avant' ? list : [...list].reverse();
        for (const f of ordered) {
          const z = cursor + f.outerW / 2;
          cursor += f.outerW + DIM.gapGrand;
          room.frames.push({
            spec: f,
            room: i,
            wall: face,
            position: new THREE.Vector3(px + (sign * tp) / 2, Math.min(frameCenterY(f), DIM.partitionH - 0.35 - f.outerH / 2), z),
            normal: new THREE.Vector3(sign, 0, 0),
            bench: null,
            order: -1,
          });
        }
      };
      placeOnFace(front, 'P-avant');
      placeOnFace(back, 'P-arriere');
      // Ordre de visite : les portraits de la cloison d'abord (on arrive face à eux).
      room.frames.sort((a, b) => (a.order === -1 ? -1 : 0) - (b.order === -1 ? -1 : 0) || a.order - b.order);
      room.frames.forEach((f, k) => (f.order = k));
      room.danceSpot.set(Math.max(x0 + 2.2, px - tp / 2 - DIM.benchDist - 1.9), 0, 0);
    }

    // --- Bancs devant les grands formats ---
    for (const f of room.frames) {
      if (!f.spec.grand) continue;
      const center = new THREE.Vector3(f.position.x, 0, f.position.z).addScaledVector(f.normal, DIM.benchDist);
      const bench: BenchLayout = { center, facing: f.normal.clone().negate(), length: DIM.benchLen, frame: f, room: i };
      f.bench = bench;
      room.benches.push(bench);
    }
    // Une salle sans grand format reçoit tout de même un banc face au mur nord.
    if (!room.benches.length) {
      const north = room.frames.filter((f) => f.wall === 'N');
      if (north.length) {
        const target = north.reduce((best, f) => (Math.abs(f.position.x - room.center.x) < Math.abs(best.position.x - room.center.x) ? f : best));
        const center = new THREE.Vector3(target.position.x, 0, target.position.z).addScaledVector(target.normal, DIM.benchDist + 0.3);
        const bench: BenchLayout = { center, facing: target.normal.clone().negate(), length: DIM.benchLen, frame: target, room: i };
        target.bench = bench;
        room.benches.push(bench);
      }
    }

    // --- Socles : hors de l'axe de circulation, dégagés des bancs et de la cloison ---
    const obstacles: Rect[] = room.benches.map((b) => {
      const alongX = Math.abs(b.facing.z) > 0.5;
      const hx = (alongX ? b.length : DIM.benchDepth) / 2;
      const hz = (alongX ? DIM.benchDepth : b.length) / 2;
      return [b.center.x - hx, b.center.z - hz, b.center.x + hx, b.center.z + hz];
    });
    if (room.partition) {
      const p = room.partition;
      // On réserve aussi la zone de danse devant les grands portraits.
      obstacles.push([p.center.x - p.thickness / 2 - 0.4, -p.width / 2, p.center.x + p.thickness / 2 + 0.4, p.width / 2]);
      obstacles.push([room.danceSpot.x - 1.6, -1.6, room.danceSpot.x + 1.6, 1.6]);
    }
    const zS = Math.min(2.4, D / 2 - 3.3);
    const half = DIM.socleSize / 2;
    [-1, 1].forEach((side, k) => {
      let best: THREE.Vector3 | null = null;
      let bestScore = -Infinity;
      for (let x = x0 + 2.6; x <= x1 - 2.6 + 1e-6; x += 0.25) {
        const r: Rect = [x - half, side * zS - half, x + half, side * zS + half];
        const clearance = Math.min(3, ...obstacles.map((o) => rectDistance(r, o)));
        if (clearance < 1.3) continue;
        // Préférence pour les grands dégagements, puis pour le centre de la salle
        const score = clearance - Math.abs(x - room.center.x) * 0.08;
        if (score > bestScore) {
          bestScore = score;
          best = new THREE.Vector3(x, 0, side * zS);
        }
      }
      if (best) {
        room.socles.push({ position: best, sculpture: (i * 2 + k) % 3 });
        obstacles.push([best.x - 1.2, best.z - 1.2, best.x + 1.2, best.z + 1.2]);
      }
    });

    // --- Murs ---
    // Mur nord et sud de la salle
    walls.push({ min: new THREE.Vector3(x0 - t / 2, 0, -D / 2 - t / 2), max: new THREE.Vector3(x1 + t / 2, DIM.wallH, -D / 2 + t / 2), kind: 'mur' });
    walls.push({ min: new THREE.Vector3(x0 - t / 2, 0, D / 2 - t / 2), max: new THREE.Vector3(x1 + t / 2, DIM.wallH, D / 2 + t / 2), kind: 'mur' });
    // Mur ouest : plein pour la première salle, sinon percé d'une ouverture
    if (i === 0) {
      walls.push({ min: new THREE.Vector3(x0 - t / 2, 0, -D / 2), max: new THREE.Vector3(x0 + t / 2, DIM.wallH, D / 2), kind: 'mur' });
    } else {
      const dw = DIM.doorW / 2;
      walls.push({ min: new THREE.Vector3(x0 - t / 2, 0, -D / 2), max: new THREE.Vector3(x0 + t / 2, DIM.wallH, -dw), kind: 'mur' });
      walls.push({ min: new THREE.Vector3(x0 - t / 2, 0, dw), max: new THREE.Vector3(x0 + t / 2, DIM.wallH, D / 2), kind: 'mur' });
      walls.push({ min: new THREE.Vector3(x0 - t / 2, DIM.doorH, -dw), max: new THREE.Vector3(x0 + t / 2, DIM.wallH, dw), kind: 'mur' });
      doors.push({ x: x0, width: DIM.doorW, height: DIM.doorH });
      lintels.push({ room: i, position: new THREE.Vector3(x0 - t / 2, (DIM.doorH + DIM.wallH) / 2, 0), normal: new THREE.Vector3(-1, 0, 0) });
    }
    if (i === specs.length - 1) {
      walls.push({ min: new THREE.Vector3(x1 - t / 2, 0, -D / 2), max: new THREE.Vector3(x1 + t / 2, DIM.wallH, D / 2), kind: 'mur' });
    }

    rooms.push(room);
    x0 = x1;
  });

  const first = rooms[0];
  return {
    rooms,
    depth: D,
    minX: 0,
    maxX: x0,
    walls,
    doors,
    // L'avatar démarre dans la première salle, tourné vers l'enfilade (+X).
    spawn: { position: new THREE.Vector3(first.x0 + Math.min(4, (first.x1 - first.x0) / 2), 0, 0), yaw: Math.PI / 2 },
    titleWall: { room: 0, position: new THREE.Vector3(first.x0 + t / 2, 2.25, 0), normal: new THREE.Vector3(1, 0, 0) },
    lintels,
  };
}

/** Rectangle au sol [minX, minZ, maxX, maxZ]. */
type Rect = [number, number, number, number];

/** Distance entre deux rectangles alignés sur les axes (0 s'ils se touchent). */
function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b[0] - a[2], a[0] - b[2]);
  const dz = Math.max(0, b[1] - a[3], a[1] - b[3]);
  return Math.hypot(dx, dz);
}

/** Index de la salle contenant la position x (bornée aux salles existantes). */
export function roomIndexAt(layout: MuseumLayout, x: number): number {
  for (const r of layout.rooms) if (x < r.x1) return r.index;
  return layout.rooms.length - 1;
}
