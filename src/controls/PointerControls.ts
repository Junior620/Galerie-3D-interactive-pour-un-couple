/**
 * Souris et tactile sur le canvas :
 * - glisser (un doigt ou bouton de souris) : tourner la caméra ;
 * - molette ou pincement à deux doigts : zoom ;
 * - clic / tap bref sans glisser : sélection (photo).
 */
export class PointerControls {
  onRotate: (dx: number, dy: number) => void = () => {};
  onZoom: (factor: number) => void = () => {};
  onTap: (x: number, y: number) => void = () => {};
  enabled = true;

  private readonly pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private dragging = false;
  private pinchDist = 0;
  private multi = false;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.enabled) this.onZoom(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0025));
      },
      { passive: false },
    );
  }

  private down(e: PointerEvent): void {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 1) {
      this.dragging = false;
      this.multi = false;
    }
    if (this.pointers.size === 2) {
      this.multi = true;
      this.pinchDist = this.distance();
    }
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.enabled) return;
    if (this.pointers.size === 1 && !this.multi) {
      if (!this.dragging && Math.hypot(p.x - p.sx, p.y - p.sy) > 6) this.dragging = true;
      if (this.dragging) this.onRotate(dx, dy);
    } else if (this.pointers.size === 2) {
      const d = this.distance();
      if (this.pinchDist > 0 && d > 0) this.onZoom(this.pinchDist / d);
      this.pinchDist = d;
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p || cancelled || !this.enabled) return;
    const quick = performance.now() - p.t < 450;
    if (!this.dragging && !this.multi && quick && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 8) {
      const r = this.el.getBoundingClientRect();
      this.onTap(e.clientX - r.left, e.clientY - r.top);
    }
  }

  private distance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
