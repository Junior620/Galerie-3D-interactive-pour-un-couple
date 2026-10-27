import type { MuseeConfig } from '../config/types';

/**
 * Écran de chargement (barre de progression réelle) et écran d'accueil.
 */
export class LoadingScreen {
  private readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly label: HTMLElement;
  private readonly title: HTMLElement;
  private value = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('section');
    this.el.className = 'ecran-chargement';
    this.el.setAttribute('role', 'progressbar');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.innerHTML = `
      <div class="ch-contenu">
        <p class="ch-surtitre">Ouverture du musée</p>
        <h1 class="ch-titre">&nbsp;</h1>
        <div class="ch-barre"><span></span></div>
        <p class="ch-etat"><span class="ch-label">Préparation…</span><span class="ch-pct">0 %</span></p>
      </div>`;
    this.bar = this.el.querySelector('.ch-barre span')!;
    this.pct = this.el.querySelector('.ch-pct')!;
    this.label = this.el.querySelector('.ch-label')!;
    this.title = this.el.querySelector('.ch-titre')!;
    root.appendChild(this.el);
  }

  setTitle(t: string): void {
    this.title.textContent = t;
  }

  /** Progression 0..1 (jamais en arrière) avec un libellé facultatif. */
  set(p: number, label?: string): void {
    this.value = Math.max(this.value, Math.min(1, p));
    const v = Math.round(this.value * 100);
    this.bar.style.width = `${v}%`;
    this.pct.textContent = `${v} %`;
    this.el.setAttribute('aria-valuenow', String(v));
    if (label) this.label.textContent = label;
  }

  hide(): Promise<void> {
    this.set(1, 'Bienvenue');
    this.el.classList.add('fini');
    return new Promise((r) =>
      setTimeout(() => {
        this.el.remove();
        r();
      }, 700),
    );
  }

  remove(): void {
    this.el.remove();
  }
}

export class WelcomeScreen {
  private readonly el: HTMLElement;

  constructor(root: HTMLElement, config: MuseeConfig, touch: boolean, onEnter: () => void) {
    this.el = document.createElement('section');
    this.el.className = 'ecran-accueil';
    const { lui, elle } = config.prenoms;
    this.el.innerHTML = `
      <div class="ac-contenu">
        <p class="ac-surtitre">Bienvenue dans</p>
        <h1 class="ac-titre"></h1>
        <p class="ac-prenoms"></p>
        <p class="ac-sous-titre"></p>
        <button type="button" class="bouton ac-entrer" data-action="entrer">Entrer dans le musée</button>
        <p class="ac-aide">${
          touch
            ? 'Joystick pour marcher · touchez une photo pour l’admirer'
            : 'ZQSD, WASD ou flèches pour marcher · cliquez sur une photo pour l’admirer'
        }</p>
        <p class="ac-son">Le son se lance à l’entrée — touche M pour le couper</p>
      </div>`;
    this.el.querySelector('.ac-titre')!.textContent = config.titre;
    this.el.querySelector('.ac-prenoms')!.textContent = `${lui} & ${elle}`;
    const st = this.el.querySelector('.ac-sous-titre')!;
    st.textContent = config.sousTitre;
    if (!config.sousTitre) st.remove();
    if (touch) this.el.querySelector('.ac-son')!.textContent = 'Le son se lance à l’entrée';
    const btn = this.el.querySelector<HTMLButtonElement>('.ac-entrer')!;
    btn.addEventListener('click', () => {
      this.el.classList.add('fini');
      setTimeout(() => this.el.remove(), 900);
      onEnter();
    });
    root.appendChild(this.el);
    requestAnimationFrame(() => {
      this.el.classList.add('visible');
      btn.focus({ preventScroll: true });
    });
  }
}
