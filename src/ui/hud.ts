import { ICONS } from './icons';

/**
 * Interface en jeu : nom de la salle, boutons (visite, avatar, musique,
 * aide, plein écran), boutons d'action sur mobile et fenêtre d'aide.
 */
export interface HudActions {
  tour(): void;
  switchAvatar(): void;
  music(): void;
  sit(): void;
  dance(): void;
}

export class Hud {
  readonly el: HTMLElement;
  private readonly room: HTMLElement;
  private readonly help: HTMLElement;
  private readonly hintBar: HTMLElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private roomIndex = -1;

  constructor(
    root: HTMLElement,
    private readonly touch: boolean,
    actions: HudActions,
  ) {
    this.el = document.createElement('div');
    this.el.className = `hud${touch ? ' tactile' : ''}`;
    this.el.innerHTML = `
      <div class="hud-salle" aria-live="polite"><span class="hs-num"></span><span class="hs-nom"></span></div>
      <div class="hud-boutons">
        <button type="button" class="hud-btn" data-hud="tour" aria-label="Visite guidée (V)" title="Visite guidée (V)">${ICONS.visite}</button>
        <button type="button" class="hud-btn" data-hud="switch" aria-label="Changer d'avatar (Tab)" title="Changer d'avatar (Tab)">${ICONS.changer}</button>
        <button type="button" class="hud-btn" data-hud="music" aria-label="Musique (M)" title="Musique (M)">${ICONS.musique}</button>
        <button type="button" class="hud-btn" data-hud="help" aria-label="Aide (H)" title="Aide (H)">${ICONS.aide}</button>
        <button type="button" class="hud-btn" data-hud="fullscreen" aria-label="Plein écran" title="Plein écran">${ICONS.pleinEcran}</button>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-action" data-hud="sit">${ICONS.banc}<span>S’asseoir</span></button>
        <button type="button" class="hud-action" data-hud="dance">${ICONS.danse}<span>Danser</span></button>
        <button type="button" class="hud-action" data-hud="tour-m">${ICONS.visite}<span>Visite</span></button>
        <button type="button" class="hud-action" data-hud="music-m">${ICONS.musique}<span>Musique</span></button>
      </div>
      <p class="hud-aide-rapide"></p>`;
    this.room = this.el.querySelector('.hud-salle')!;
    this.hintBar = this.el.querySelector('.hud-aide-rapide')!;
    this.el.querySelectorAll<HTMLButtonElement>('[data-hud]').forEach((b) => this.buttons.set(b.dataset.hud!, b));

    if (!document.fullscreenEnabled) this.buttons.get('fullscreen')!.remove();
    document.addEventListener('fullscreenchange', () => {
      const b = this.buttons.get('fullscreen');
      if (b) b.innerHTML = document.fullscreenElement ? ICONS.quitterPleinEcran : ICONS.pleinEcran;
    });

    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-hud]');
      if (!b) return;
      b.blur(); // garde le clavier pour le jeu (Tab, flèches…)
      switch (b.dataset.hud) {
        case 'tour':
        case 'tour-m':
          actions.tour();
          break;
        case 'switch':
          actions.switchAvatar();
          break;
        case 'music':
        case 'music-m':
          actions.music();
          break;
        case 'help':
          this.toggleHelp();
          break;
        case 'fullscreen':
          this.toggleFullscreen();
          break;
        case 'sit':
          actions.sit();
          break;
        case 'dance':
          actions.dance();
          break;
      }
    });

    this.help = document.createElement('section');
    this.help.className = 'aide';
    this.help.setAttribute('role', 'dialog');
    this.help.setAttribute('aria-label', 'Aide');
    this.help.innerHTML = touch ? HELP_TOUCH : HELP_KEYS;
    this.help.addEventListener('click', (e) => {
      if (e.target === this.help || (e.target as HTMLElement).closest('[data-fermer]')) this.toggleHelp(false);
    });
    root.append(this.el, this.help);
  }

  show(): void {
    this.el.classList.add('visible');
    if (!this.touch) {
      this.hintBar.innerHTML = '<kbd>Z Q S D</kbd> marcher · <kbd>Maj</kbd> courir · <kbd>E</kbd> s’asseoir · <kbd>F</kbd> danser · <kbd>V</kbd> visite · <kbd>H</kbd> aide';
      this.hintBar.classList.add('visible');
      setTimeout(() => this.hintBar.classList.remove('visible'), 9000);
    }
  }

  /** Masque l'interface (mode vertical 9:16). */
  hideAll(): void {
    this.el.remove();
    this.help.remove();
  }

  setRoom(index: number, name: string): void {
    if (index === this.roomIndex) return;
    this.roomIndex = index;
    this.room.classList.remove('visible');
    setTimeout(() => {
      this.room.querySelector('.hs-num')!.textContent = `Salle ${index + 1}`;
      this.room.querySelector('.hs-nom')!.textContent = name;
      this.room.classList.add('visible');
    }, 250);
  }

  setMusic(on: boolean): void {
    this.buttons.get('music')!.innerHTML = on ? ICONS.musique : ICONS.muet;
    const m = this.buttons.get('music-m')!;
    m.innerHTML = `${on ? ICONS.musique : ICONS.muet}<span>Musique</span>`;
    m.classList.toggle('inactif', !on);
  }

  /** Libellés selon le mode (« Se lever », « Arrêter »…) et contrôles visibles. */
  setMode(mode: string): void {
    this.el.dataset.mode = mode;
    const sit = this.buttons.get('sit')!;
    sit.querySelector('span')!.textContent = mode === 'assis' ? 'Se lever' : 'S’asseoir';
    sit.classList.toggle('actif', mode === 'assis');
    const dance = this.buttons.get('dance')!;
    dance.querySelector('span')!.textContent = mode === 'danse' ? 'Arrêter' : 'Danser';
    dance.classList.toggle('actif', mode === 'danse');
    const tourOn = mode === 'visite';
    this.buttons.get('tour')!.innerHTML = tourOn ? ICONS.stop : ICONS.visite;
    this.buttons.get('tour')!.title = tourOn ? 'Arrêter la visite (V)' : 'Visite guidée (V)';
    const tm = this.buttons.get('tour-m')!;
    tm.innerHTML = `${tourOn ? ICONS.stop : ICONS.visite}<span>${tourOn ? 'Arrêter' : 'Visite'}</span>`;
    tm.classList.toggle('actif', tourOn);
  }

  /** Bouton « S'asseoir » mis en valeur près d'un banc (mobile). */
  setBenchNear(near: boolean): void {
    this.buttons.get('sit')!.classList.toggle('pret', near);
  }

  toggleHelp(force?: boolean): void {
    const open = force ?? !this.help.classList.contains('visible');
    this.help.classList.toggle('visible', open);
    if (open) this.help.querySelector<HTMLButtonElement>('[data-fermer]')?.focus({ preventScroll: true });
  }

  get helpOpen(): boolean {
    return this.help.classList.contains('visible');
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
}

const row = (k: string, v: string) => `<li><span class="touches">${k}</span><span>${v}</span></li>`;

const HELP_KEYS = `
  <div class="aide-carte">
    <button type="button" class="aide-fermer" data-fermer aria-label="Fermer">${ICONS.fermer}</button>
    <h2>Commandes</h2>
    <ul>
      ${row('<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · flèches', 'Marcher')}
      ${row('<kbd>Maj</kbd>', 'Courir')}
      ${row('Glisser la souris · molette', 'Tourner la caméra · zoomer')}
      ${row('<kbd>E</kbd>', 'S’asseoir sur un banc proche (à deux)')}
      ${row('<kbd>F</kbd>', 'Danser ensemble')}
      ${row('Clic sur une photo', 'L’admirer en grand')}
      ${row('<kbd>←</kbd> <kbd>→</kbd> · <kbd>Échap</kbd>', 'Photo précédente / suivante · retour')}
      ${row('<kbd>Tab</kbd>', 'Changer d’avatar')}
      ${row('<kbd>V</kbd>', 'Visite guidée automatique')}
      ${row('<kbd>M</kbd> · <kbd>H</kbd>', 'Couper la musique · cette aide')}
    </ul>
  </div>`;

const HELP_TOUCH = `
  <div class="aide-carte">
    <button type="button" class="aide-fermer" data-fermer aria-label="Fermer">${ICONS.fermer}</button>
    <h2>Commandes</h2>
    <ul>
      ${row('Joystick (à gauche)', 'Marcher — poussez à fond pour courir')}
      ${row('Glisser un doigt', 'Tourner la caméra')}
      ${row('Pincer', 'Zoomer')}
      ${row('Toucher une photo', 'L’admirer en grand (balayez pour la suivante)')}
      ${row('S’asseoir', 'Près d’un banc, à deux')}
      ${row('Danser · Visite', 'Danser ensemble · visite guidée')}
    </ul>
  </div>`;
