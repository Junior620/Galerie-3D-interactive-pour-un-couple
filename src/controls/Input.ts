/**
 * Clavier + joystick virtuel.
 *
 * Déplacements : on lit à la fois la position physique de la touche
 * (event.code : KeyW/KeyA/KeyS/KeyD = Z/Q/S/D sur AZERTY) et le caractère
 * (event.key), pour que ZQSD, WASD et les flèches fonctionnent quel que soit
 * le clavier. Actions (E, F, M, H, V) : par caractère, comme l'utilisateur
 * les voit sur son clavier.
 */
export type Action = 'sit' | 'dance' | 'switch' | 'music' | 'help' | 'tour' | 'escape' | 'prev' | 'next' | 'move';
type Dir = 'fwd' | 'back' | 'left' | 'right';

function dirFor(code: string, key: string): Dir | null {
  if (code === 'KeyW' || key === 'z' || key === 'w' || code === 'ArrowUp') return 'fwd';
  if (code === 'KeyS' || key === 's' || code === 'ArrowDown') return 'back';
  if (code === 'KeyA' || key === 'q' || key === 'a' || code === 'ArrowLeft') return 'left';
  if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') return 'right';
  return null;
}

export class Input {
  private readonly moves = new Map<string, Dir>();
  private readonly listeners = new Map<Action, Set<() => void>>();
  private shift = false;
  /** Joystick : x = droite, y = avant (−1..1) */
  readonly joystick = { x: 0, y: 0 };
  /** Course forcée (bouton mobile) */
  runToggle = false;
  /** Les touches de déplacement déplacent l'avatar (désactivé en mode photo) */
  movementEnabled = true;
  private simulated: { x: number; y: number; until: number } | null = null;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => {
      this.moves.delete(e.code);
      if (e.key === 'Shift') this.shift = false;
    });
    // Fenêtre quittée : on relâche tout (évite un avatar qui marche tout seul).
    target.addEventListener('blur', () => {
      this.moves.clear();
      this.shift = false;
    });
  }

  on(action: Action, cb: () => void): () => void {
    let set = this.listeners.get(action);
    if (!set) this.listeners.set(action, (set = new Set()));
    set.add(cb);
    return () => set!.delete(cb);
  }

  emit(action: Action): void {
    this.listeners.get(action)?.forEach((cb) => cb());
  }

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.key === 'Shift') this.shift = true;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!e.repeat) this.emit(e.key === 'ArrowLeft' ? 'prev' : 'next');
    }
    const dir = dirFor(e.code, key);
    if (dir) {
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.moves.set(e.code, dir);
      if (this.movementEnabled) this.emit('move');
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.emit('switch');
      return;
    }
    if (e.repeat) return;
    switch (key) {
      case 'e':
        this.emit('sit');
        break;
      case 'f':
        this.emit('dance');
        break;
      case 'm':
        this.emit('music');
        break;
      case 'h':
      case '?':
        this.emit('help');
        break;
      case 'v':
        this.emit('tour');
        break;
      case 'Escape':
        this.emit('escape');
        break;
    }
  }

  /** Direction voulue (x = droite, y = avant, longueur ≤ 1) et course. */
  axes(): { x: number; y: number; run: boolean } {
    let x = 0;
    let y = 0;
    if (this.movementEnabled) {
      for (const d of this.moves.values()) {
        if (d === 'fwd') y += 1;
        else if (d === 'back') y -= 1;
        else if (d === 'left') x -= 1;
        else x += 1;
      }
      x += this.joystick.x;
      y += this.joystick.y;
      if (this.simulated) {
        if (performance.now() < this.simulated.until) {
          x += this.simulated.x;
          y += this.simulated.y;
        } else this.simulated = null;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const joyFull = Math.hypot(this.joystick.x, this.joystick.y) > 0.92;
    return { x, y, run: this.shift || this.runToggle || joyFull };
  }

  get moving(): boolean {
    const a = this.axes();
    return Math.abs(a.x) + Math.abs(a.y) > 0.05;
  }

  /** Déplacement simulé (tests automatiques). */
  simulate(x: number, y: number, seconds: number): void {
    this.simulated = { x, y, until: performance.now() + seconds * 1000 };
  }
}
