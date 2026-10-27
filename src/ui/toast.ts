/**
 * Messages éphémères (bas de l'écran) et indice contextuel persistant
 * (ex. « E — S'asseoir » près d'un banc).
 */
export class Toast {
  private readonly el: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private timer = 0;
  private hintText = '';
  /** Désactivé en mode vidéo 9:16 (image sans interface) */
  enabled = true;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'toast';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.hintEl = document.createElement('div');
    this.hintEl.className = 'indice';
    root.append(this.el, this.hintEl);
  }

  show(text: string, ms = 2600): void {
    if (!this.enabled) return;
    this.el.textContent = text;
    this.el.classList.add('visible');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.classList.remove('visible'), ms);
  }

  /** Indice persistant (chaîne vide pour masquer). */
  hint(text: string): void {
    if (!this.enabled) text = '';
    if (text === this.hintText) return;
    this.hintText = text;
    if (text) this.hintEl.innerHTML = text;
    this.hintEl.classList.toggle('visible', !!text);
  }
}
