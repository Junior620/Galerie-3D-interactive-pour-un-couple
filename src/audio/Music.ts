/**
 * Musique de fond.
 * - Si config.json indique un fichier présent : lecture en boucle, fondu d'entrée.
 * - Sinon (ou si la lecture échoue) : ambiance douce générée en direct
 *   (nappes d'accords + notes de boîte à musique, réverbération synthétique).
 * start() doit être appelé lors d'un clic (contrainte d'autoplay des navigateurs).
 */
const VOLUME = 0.45;

export class Music {
  muted = false;
  private started = false;
  private audio: HTMLAudioElement | null = null;
  private synth: AmbientSynth | null = null;

  constructor(private readonly src: string | null) {
    document.addEventListener('visibilitychange', () => {
      if (!this.started || this.muted) return;
      if (document.hidden) this.pause();
      else this.resume();
    });
  }

  get isGenerative(): boolean {
    return !!this.synth;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.src) {
      const a = new Audio(this.src);
      a.loop = true;
      a.volume = 0;
      a.preload = 'auto';
      this.audio = a;
      a.play()
        .then(() => this.fade(a, this.muted ? 0 : VOLUME, 2000))
        .catch(() => {
          // Format non lu ou lecture refusée : on bascule sur l'ambiance générée.
          this.audio = null;
          this.startSynth();
        });
    } else this.startSynth();
  }

  private startSynth(): void {
    try {
      this.synth = new AmbientSynth();
      this.synth.setVolume(this.muted ? 0 : 1);
    } catch {
      this.synth = null; // WebAudio indisponible : silence.
    }
  }

  toggle(): boolean {
    this.setMuted(!this.muted);
    return !this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (!this.started) return;
    if (this.audio) this.fade(this.audio, m ? 0 : VOLUME, 600);
    this.synth?.setVolume(m ? 0 : 1);
  }

  private pause(): void {
    this.audio?.pause();
    this.synth?.suspend();
  }

  private resume(): void {
    this.audio?.play().catch(() => undefined);
    this.synth?.resume();
  }

  private fade(a: HTMLAudioElement, to: number, ms: number): void {
    const from = a.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
}

/** Petit synthétiseur d'ambiance (WebAudio), très léger en calcul. */
class AmbientSynth {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly bus: GainNode;
  private chord = 0;
  private nextChord = 0;
  private nextNote = 0;
  private readonly timer: number;

  // Fa maj7 → Mi m7 → Ré m9 → Do maj7 (fréquences MIDI)
  private static readonly CHORDS = [
    [41, 53, 57, 60, 64],
    [40, 52, 55, 59, 62],
    [38, 50, 53, 57, 64],
    [36, 48, 52, 55, 59],
  ];

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Réverbération : réponse impulsionnelle de bruit décroissant
    const reverb = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 3.5;
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = ir;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(this.master);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1800;
    this.bus = this.ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(lowpass);
    lowpass.connect(this.master);
    lowpass.connect(reverb);

    this.nextChord = this.ctx.currentTime + 0.1;
    this.nextNote = this.ctx.currentTime + 2;
    this.timer = window.setInterval(() => this.schedule(), 200);
    this.schedule();
  }

  private midi(n: number): number {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  private schedule(): void {
    const now = this.ctx.currentTime;
    while (this.nextChord < now + 0.5) {
      this.pad(AmbientSynth.CHORDS[this.chord % AmbientSynth.CHORDS.length], this.nextChord, 9);
      this.chord++;
      this.nextChord += 8;
    }
    while (this.nextNote < now + 0.5) {
      const chord = AmbientSynth.CHORDS[(this.chord + 3) % AmbientSynth.CHORDS.length];
      const n = chord[1 + Math.floor(Math.random() * (chord.length - 1))] + 24;
      this.bell(this.midi(n), this.nextNote);
      this.nextNote += 0.55 + Math.random() * 1.3;
    }
  }

  /** Nappe : oscillateurs doux, attaque et relâchement lents. */
  private pad(notes: number[], t: number, dur: number): void {
    for (const [i, n] of notes.entries()) {
      for (const detune of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = this.midi(n);
        o.detune.value = detune;
        const g = this.ctx.createGain();
        const peak = (i === 0 ? 0.05 : 0.022) / 2;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 2.5);
        g.gain.setValueAtTime(peak, t + dur - 3);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
        o.connect(g).connect(this.bus);
        o.start(t);
        o.stop(t + dur + 0.6);
      }
    }
  }

  /** Note de boîte à musique. */
  private bell(freq: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g).connect(this.bus);
    o2.connect(g2).connect(g);
    o.start(t);
    o2.start(t);
    o.stop(t + 2.3);
    o2.stop(t + 2.3);
  }

  setVolume(v: number): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(v * 0.9, now + (v > 0 ? 2.5 : 0.6));
    if (v > 0) this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    this.ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    clearInterval(this.timer);
    this.ctx.close().catch(() => undefined);
  }
}
