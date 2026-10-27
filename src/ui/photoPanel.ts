import type { Photo } from '../config/types';

/**
 * Panneau d'information d'une photo : numéro, salle, titre, date, lieu,
 * légende, navigation précédente / suivante et bouton « Retour ».
 * À droite sur ordinateur, en bas de l'écran sur téléphone.
 */
export class PhotoPanel {
  readonly el: HTMLElement;
  onPrev: () => void = () => {};
  onNext: () => void = () => {};
  onClose: () => void = () => {};
  /** Bouton son d'une vidéo */
  onSound: () => void = () => {};
  private readonly num: HTMLElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly sound: HTMLButtonElement;

  constructor(root: HTMLElement, touch: boolean) {
    this.el = document.createElement('aside');
    this.el.className = 'panneau-photo';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = `
      <p class="pp-num"></p>
      <h2 class="pp-titre"></h2>
      <p class="pp-meta"></p>
      <p class="pp-legende"></p>
      <button type="button" class="pp-son" data-pp="sound" hidden></button>
      <div class="pp-nav">
        <button type="button" class="pp-btn" data-pp="prev" aria-label="Photo précédente">←</button>
        <button type="button" class="bouton pp-retour" data-pp="close">Retour</button>
        <button type="button" class="pp-btn" data-pp="next" aria-label="Photo suivante">→</button>
      </div>
      <p class="pp-aide">${touch ? 'Balayez ou utilisez les flèches' : '← → pour naviguer · Échap pour revenir'}</p>`;
    this.num = this.el.querySelector('.pp-num')!;
    this.title = this.el.querySelector('.pp-titre')!;
    this.meta = this.el.querySelector('.pp-meta')!;
    this.caption = this.el.querySelector('.pp-legende')!;
    this.sound = this.el.querySelector('.pp-son')!;
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pp]');
      btn?.blur(); // garde les flèches du clavier pour la navigation
      const action = btn?.getAttribute('data-pp');
      if (action === 'prev') this.onPrev();
      else if (action === 'next') this.onNext();
      else if (action === 'close') this.onClose();
      else if (action === 'sound') this.onSound();
    });
    // Balayage horizontal sur le panneau (mobile)
    let sx = 0;
    this.el.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
    this.el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) (dx < 0 ? this.onNext : this.onPrev)();
    });
    root.appendChild(this.el);
  }

  show(photo: Photo, total: number, roomName: string): void {
    const kind = photo.type === 'video' ? ' · Vidéo' : '';
    this.num.textContent = `${String(photo.numero).padStart(2, '0')} / ${String(total).padStart(2, '0')} · ${roomName}${kind}`;
    this.sound.hidden = photo.type !== 'video';
    this.title.textContent = photo.titre;
    this.meta.textContent = [photo.dateLabel, photo.lieu].filter(Boolean).join(' · ');
    this.meta.hidden = !this.meta.textContent;
    this.caption.textContent = photo.legende;
    this.caption.hidden = !photo.legende;
    this.el.classList.add('visible');
    this.el.setAttribute('aria-hidden', 'false');
  }

  /** État du bouton son (vidéo). */
  setSound(on: boolean): void {
    this.sound.textContent = on ? '🔊  Son activé — couper' : '🔇  Son coupé — activer';
    this.sound.setAttribute('aria-pressed', String(on));
  }

  hide(): void {
    this.el.classList.remove('visible');
    this.el.setAttribute('aria-hidden', 'true');
  }

  /** Part de l'écran couverte (à droite ou en bas), pour le cadrage de la caméra. */
  coverage(viewport: HTMLElement): { right: number; bottom: number } {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (this.isSheet(vw)) return { right: 0, bottom: Math.min(0.6, (this.el.offsetHeight + 16) / vh) };
    return { right: Math.min(0.5, (this.el.offsetWidth + 32) / vw), bottom: 0 };
  }

  private isSheet(vw: number): boolean {
    return vw < 760;
  }
}
