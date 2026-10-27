import * as THREE from 'three';
import type { DeviceProfile } from '../utils/device';
import type { FrameObject } from './frames';
import { createVideoPoster } from './placeholders';

/**
 * Vidéos accrochées comme des photos :
 * - en boucle et sans le son dans leur cadre, seulement dans la salle où se
 *   trouve le visiteur (4 au plus, 2 sur mobile) pour ménager batterie et data ;
 * - une affiche s'affiche tant que la première image n'est pas chargée ;
 * - en mode photo, la vidéo regardée repart du début avec le son.
 */
interface Clip {
  frame: FrameObject;
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  poster: THREE.CanvasTexture;
}

export class VideoWall {
  private readonly clips: Clip[] = [];
  private focused: Clip | null = null;
  private readonly maxPlaying: number;
  private timer = 0;
  /** Prévient quand une vidéo joue avec le son (pour baisser la musique). */
  onSoundChange: (withSound: boolean) => void = () => {};

  constructor(frames: FrameObject[], profile: DeviceProfile) {
    this.maxPlaying = profile.mobile ? 2 : 4;
    for (const frame of frames) {
      if (frame.photo.type !== 'video' || !frame.photo.sources) continue;
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.src = frame.photo.sources.full;
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      const poster = new THREE.CanvasTexture(createVideoPoster(frame.photo.titre, frame.photo.aspect));
      poster.colorSpace = THREE.SRGBColorSpace;
      frame.photoMesh.material.map = poster;
      // Première image disponible : la vidéo remplace l'affiche.
      video.addEventListener('loadeddata', () => (frame.photoMesh.material.map = texture), { once: true });
      video.addEventListener('error', () => console.warn(`[musée] Vidéo illisible : ${frame.photo.fichier}`), { once: true });
      this.clips.push({ frame, video, texture, poster });
    }
    // Onglet caché : tout est mis en pause (reprise automatique au retour).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) for (const c of this.clips) c.video.pause();
    });
  }

  get count(): number {
    return this.clips.length;
  }

  /** Lance les vidéos proches du visiteur dans sa salle, met les autres en pause. */
  update(dt: number, room: number, focus: THREE.Vector3): void {
    if (!this.clips.length) return;
    this.timer -= dt;
    if (this.timer > 0 || document.hidden) return;
    this.timer = 0.5;
    const near = this.clips
      .filter((c) => c.frame.room === room)
      .sort((a, b) => a.frame.center.distanceToSquared(focus) - b.frame.center.distanceToSquared(focus))
      .slice(0, this.maxPlaying);
    for (const c of this.clips) {
      const wanted = c === this.focused || near.includes(c);
      if (wanted && c.video.paused) {
        c.video.preload = 'auto';
        play(c.video);
      } else if (!wanted && !c.video.paused) c.video.pause();
    }
  }

  /**
   * Mode photo : la vidéo regardée repart du début, avec le son
   * (autorisé car l'utilisateur vient de cliquer). Renvoie vrai si c'est une vidéo.
   */
  focus(frame: FrameObject | null): boolean {
    if (this.focused && this.focused.frame !== frame) this.focused.video.muted = true;
    const clip = frame ? this.clips.find((c) => c.frame === frame) ?? null : null;
    this.focused = clip;
    if (clip) {
      clip.video.currentTime = 0;
      clip.video.muted = false;
      clip.video.preload = 'auto';
      clip.video.play().catch(() => {
        // Lecture avec le son refusée par le navigateur : on joue sans le son.
        clip.video.muted = true;
        this.onSoundChange(false);
        play(clip.video);
      });
    }
    this.onSoundChange(!!clip && !clip.video.muted);
    return !!clip;
  }

  get soundOn(): boolean {
    return !!this.focused && !this.focused.video.muted;
  }

  /** Coupe ou remet le son de la vidéo regardée. */
  setSound(on: boolean): void {
    if (!this.focused) return;
    this.focused.video.muted = !on;
    if (on) play(this.focused.video);
    this.onSoundChange(on);
  }
}

/** play() renvoie une promesse : on ignore un refus (pas d'erreur dans la console). */
function play(video: HTMLVideoElement): void {
  video.play().catch(() => undefined);
}
