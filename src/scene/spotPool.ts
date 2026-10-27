import * as THREE from 'three';

/**
 * « Un spot par cadre », de façon économe : chaque cadre a son luminaire et
 * son halo dessiné, mais seuls les K cadres les plus proches du visiteur
 * reçoivent un vrai SpotLight. Le nombre de lumières reste constant (pas de
 * recompilation des shaders) ; les lumières sont réaffectées en fondu.
 */
export interface SpotTarget {
  fixture: THREE.Vector3;
  aim: THREE.Vector3;
  /** Demi-taille du cadre à éclairer (m) */
  radius: number;
}

interface PooledLight {
  light: THREE.SpotLight;
  target: number;
  intensity: number;
}

const INTENSITY = 26;

export class SpotPool {
  private readonly lights: PooledLight[] = [];
  private timer = 0;
  private wanted = new Set<number>();

  constructor(
    scene: THREE.Scene,
    count: number,
    private readonly targets: SpotTarget[],
  ) {
    const n = Math.min(count, targets.length);
    for (let i = 0; i < n; i++) {
      const light = new THREE.SpotLight(0xfff0dc, 0, 0, 0.5, 0.6, 2);
      light.castShadow = false;
      scene.add(light, light.target);
      this.lights.push({ light, target: -1, intensity: 0 });
    }
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.3;
      const order = this.targets
        .map((t, i) => ({ i, d: t.aim.distanceToSquared(focus) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lights.length);
      this.wanted = new Set(order.map((o) => o.i));
    }
    const assigned = new Set(this.lights.map((l) => l.target));
    for (const pl of this.lights) {
      const keep = pl.target >= 0 && this.wanted.has(pl.target);
      if (!keep && pl.intensity < 0.05) {
        // Lumière éteinte : on la déplace vers un cadre qui en manque.
        const free = [...this.wanted].find((i) => !assigned.has(i));
        if (free !== undefined) {
          assigned.delete(pl.target);
          assigned.add(free);
          pl.target = free;
          this.aim(pl.light, this.targets[free]);
        }
      }
      const goal = pl.target >= 0 && this.wanted.has(pl.target) ? INTENSITY : 0;
      pl.intensity += (goal - pl.intensity) * Math.min(1, dt * 4);
      pl.light.intensity = pl.intensity;
    }
  }

  private aim(light: THREE.SpotLight, t: SpotTarget): void {
    light.position.copy(t.fixture);
    light.target.position.copy(t.aim);
    light.target.updateMatrixWorld();
    const dist = t.fixture.distanceTo(t.aim);
    light.angle = Math.min(0.9, Math.atan((t.radius + 0.35) / dist));
  }
}
