import type { Input } from './Input';

/**
 * Joystick virtuel (composant maison, sans dépendance) pour le tactile.
 * Il écrit la direction dans input.joystick (x = droite, y = avant).
 * Pousser à fond fait courir.
 */
export class Joystick {
  readonly el: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private pointer: number | null = null;
  private cx = 0;
  private cy = 0;
  private readonly radius = 52;

  constructor(
    root: HTMLElement,
    private readonly input: Input,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'joystick';
    this.el.setAttribute('aria-hidden', 'true');
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-bouton';
    this.el.appendChild(this.knob);
    root.appendChild(this.el);

    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.pointer !== null) return;
      this.pointer = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      this.cx = r.left + r.width / 2;
      this.cy = r.top + r.height / 2;
      this.el.classList.add('actif');
      this.update(e.clientX, e.clientY);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.update(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.el.classList.remove('actif');
      this.knob.style.transform = '';
      this.input.joystick.x = 0;
      this.input.joystick.y = 0;
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private update(x: number, y: number): void {
    let dx = x - this.cx;
    let dy = y - this.cy;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Petite zone morte au centre
    const k = len < 8 ? 0 : 1;
    this.input.joystick.x = (dx / this.radius) * k;
    this.input.joystick.y = (-dy / this.radius) * k;
    if (k) this.input.emit('move');
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('cache', !v);
  }
}
