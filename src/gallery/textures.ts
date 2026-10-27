import * as THREE from 'three';
import type { DeviceProfile } from '../utils/device';
import type { FrameObject } from './frames';
import { createPlaceholderCanvas } from './placeholders';

/**
 * Chargement progressif des photos et gestion de la mémoire :
 * - salle courante et voisines : pleine résolution (2048 px, 1024 px sur mobile) ;
 * - salles éloignées : miniature (la pleine résolution est libérée avec dispose()).
 * Les salles proches sont chargées en premier.
 */
type Level = 0 | 1 | 2; // 0 : texture d'attente, 1 : miniature, 2 : pleine résolution

interface Slot {
  frame: FrameObject;
  level: Level;
  mini: THREE.Texture | null;
  full: THREE.Texture | null;
  loading: boolean;
  failed: boolean;
}

export class PhotoTextures {
  private slots: Slot[] = [];
  private queue: { slot: Slot; level: Level }[] = [];
  private active = 0;
  private currentRoom = -1;
  private readonly anisotropy: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly profile: DeviceProfile,
    private readonly manager: THREE.LoadingManager,
    private readonly waiting: THREE.Texture,
  ) {
    this.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  /** Texture neutre affichée pendant le chargement. */
  static createWaitingTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e7e3dc';
    ctx.fillRect(0, 0, 8, 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * Chargement initial (compté dans la barre de progression) :
   * images de remplacement, miniatures, puis pleine résolution de la salle de départ.
   */
  async preload(frames: FrameObject[], startRoom: number): Promise<void> {
    // Les vidéos sont gérées à part (VideoWall).
    this.slots = frames
      .filter((frame) => frame.photo.type !== 'video')
      .map((frame) => ({ frame, level: 0, mini: null, full: null, loading: false, failed: false }));
    this.currentRoom = startRoom;
    const jobs: Promise<void>[] = [];
    for (const slot of this.slots) {
      const p = slot.frame.photo;
      if (p.placeholder) {
        jobs.push(this.tracked(`remplacement-${p.index}`, async () => this.applyPlaceholder(slot)));
      } else if (Math.abs(slot.frame.room - startRoom) <= 1) {
        jobs.push(this.tracked(p.sources!.full, () => this.load(slot, 2)));
      } else if (p.sources?.mini) {
        jobs.push(this.tracked(p.sources.mini, () => this.load(slot, 1)));
      }
    }
    await Promise.all(jobs);
    this.update(startRoom, true);
  }

  /** À appeler régulièrement avec la salle où se trouve le visiteur. */
  update(room: number, force = false): void {
    if (room === this.currentRoom && !force) return;
    this.currentRoom = room;
    this.queue = [];
    // Priorité : salle courante, puis voisines, puis miniatures lointaines.
    const sorted = [...this.slots].sort((a, b) => Math.abs(a.frame.room - room) - Math.abs(b.frame.room - room));
    for (const slot of sorted) {
      if (slot.frame.photo.placeholder || slot.failed) continue;
      const near = Math.abs(slot.frame.room - room) <= 1;
      if (near && slot.level < 2) this.queue.push({ slot, level: 2 });
      if (!near) {
        if (slot.full) this.downgrade(slot);
        if (slot.level < 1) this.queue.push({ slot, level: 1 });
      }
    }
    this.pump();
  }

  private pump(): void {
    while (this.active < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.slot.loading || job.slot.level >= job.level) continue;
      this.active++;
      this.load(job.slot, job.level).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async tracked(url: string, fn: () => Promise<void>): Promise<void> {
    this.manager.itemStart(url);
    try {
      await fn();
    } finally {
      this.manager.itemEnd(url);
    }
  }

  private applyPlaceholder(slot: Slot): void {
    const p = slot.frame.photo;
    const canvas = createPlaceholderCanvas(p.numero, p.aspect, p.titre, p.grand ? 900 : 640);
    slot.full = this.makeTexture(canvas);
    slot.level = 2;
    this.show(slot, slot.full);
  }

  private async load(slot: Slot, level: Level): Promise<void> {
    const src = slot.frame.photo.sources!;
    slot.loading = true;
    try {
      // Sans variante optimisée, l'original sert aussi à fabriquer la miniature.
      const url = level === 1 ? src.mini ?? src.full : src.full;
      const img = await loadImage(url);
      if (level === 2) {
        slot.full = this.makeTexture(downscale(img, this.profile.textureSize));
        if (!slot.mini && !src.mini) slot.mini = this.makeTexture(downscale(img, 320));
        slot.level = 2;
        this.show(slot, slot.full);
      } else {
        slot.mini = this.makeTexture(downscale(img, 320));
        if (slot.level < 1) {
          slot.level = 1;
          this.show(slot, slot.mini);
        }
      }
    } catch {
      // Fichier illisible : on affiche une image de remplacement plutôt que de planter.
      slot.failed = true;
      this.applyPlaceholder(slot);
      console.warn(`[musée] Image illisible : ${src.full}`);
    } finally {
      slot.loading = false;
    }
  }

  /** Libère la pleine résolution d'une photo éloignée. */
  private downgrade(slot: Slot): void {
    if (slot.mini) this.show(slot, slot.mini);
    slot.full?.dispose();
    slot.full = null;
    slot.level = slot.mini ? 1 : 0;
    if (!slot.mini) this.show(slot, null);
  }

  private show(slot: Slot, tex: THREE.Texture | null): void {
    slot.frame.photoMesh.material.map = tex ?? this.waiting;
  }

  private makeTexture(source: HTMLCanvasElement | HTMLImageElement): THREE.Texture {
    const t = new THREE.Texture(source);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  /** Garantit la pleine résolution d'une photo regardée de près (mode photo). */
  ensureFull(frame: FrameObject): void {
    const slot = this.slots.find((s) => s.frame === frame);
    if (!slot || slot.level >= 2 || slot.loading || slot.failed || frame.photo.placeholder) return;
    this.queue.unshift({ slot, level: 2 });
    this.pump();
  }

  dispose(): void {
    for (const s of this.slots) {
      s.full?.dispose();
      s.mini?.dispose();
    }
    this.slots = [];
  }
}

/** Charge une image (le navigateur applique l'orientation EXIF au décodage). */
function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  return img.decode().then(() => img);
}

/** Réduit une image à maxSize px (côté le plus long), par paliers pour rester net. */
function downscale(img: HTMLImageElement, maxSize: number): HTMLCanvasElement | HTMLImageElement {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (Math.max(w, h) <= maxSize) return img;
  let source: CanvasImageSource = img;
  // Réductions successives par deux, puis ajustement final.
  while (Math.max(w, h) / 2 >= maxSize) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    source = drawTo(source, w, h);
  }
  const k = maxSize / Math.max(w, h);
  return drawTo(source, Math.round(w * k), Math.round(h * k));
}

function drawTo(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}
