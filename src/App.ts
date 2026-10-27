import * as THREE from 'three';
import type { Avatar, Who } from './avatars/Avatar';
import { CameraDirector } from './camera/CameraDirector';
import type { Input } from './controls/Input';
import { PointerControls } from './controls/PointerControls';
import type { World } from './scene/world';

/** Modes de l'application (un seul actif à la fois). */
export type Mode = 'accueil' | 'libre' | 'photo' | 'assis' | 'danse' | 'visite';

/**
 * Orchestrateur : boucle de rendu, avatar contrôlé, caméra et modes.
 */
export class App {
  mode: Mode = 'libre';
  controlled: Who = 'lui';
  readonly director: CameraDirector;
  readonly pointer: PointerControls;
  private readonly timer = new THREE.Timer();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly onFrame: ((dt: number) => void)[] = [];

  constructor(
    readonly world: World,
    readonly avatars: Record<Who, Avatar>,
    readonly input: Input,
  ) {
    this.director = new CameraDirector(world.camera, world.museum.world);
    this.pointer = new PointerControls(world.renderer.domElement);
    this.pointer.onRotate = (dx, dy) => {
      if (this.mode === 'libre' || this.mode === 'assis' || this.mode === 'danse') this.director.third.rotate(dx, dy);
    };
    this.pointer.onZoom = (f) => this.director.third.zoom(f);

    // Placement initial : les deux avatars côte à côte, tournés vers l'enfilade.
    const { position, yaw } = world.layout.spawn;
    for (const a of Object.values(avatars)) world.scene.add(a.object);
    this.player.position.copy(position);
    const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.partner.position.copy(position).addScaledVector(left, 1.2);
    for (const a of Object.values(avatars)) {
      a.yaw = a.targetYaw = yaw;
      a.object.rotation.y = yaw;
    }
    this.director.third.snap(this.player.position, this.player.height, yaw);
    this.director.jump(this.director.third.position, this.director.third.target);
    this.timer.connect(document);
  }

  get player(): Avatar {
    return this.avatars[this.controlled];
  }

  get partner(): Avatar {
    return this.avatars[this.controlled === 'lui' ? 'elle' : 'lui'];
  }

  /** Ajoute une tâche exécutée à chaque image. */
  each(fn: (dt: number) => void): void {
    this.onFrame.push(fn);
  }

  start(): void {
    this.world.renderer.setAnimationLoop((t) => {
      this.timer.update(t);
      this.update(Math.min(this.timer.getDelta(), 1 / 20));
    });
  }

  /** Vitesse voulue de l'avatar contrôlé, relative à la caméra. */
  private wishVelocity(): THREE.Vector3 {
    const a = this.input.axes();
    this.director.third.basis(this.fwd, this.right);
    this.wish.set(0, 0, 0).addScaledVector(this.fwd, a.y).addScaledVector(this.right, a.x);
    const speed = a.run ? 3.7 : 1.5;
    return this.wish.multiplyScalar(speed * this.player.rig.scale);
  }

  private update(dt: number): void {
    const { world } = this;
    if (this.mode === 'libre') {
      this.player.move(this.wishVelocity(), dt, world.museum.world);
    }
    for (const fn of this.onFrame) fn(dt);
    for (const a of Object.values(this.avatars)) a.update(dt);

    const p = this.player.position;
    this.director.update(dt, p, this.player.height);
    world.lighting.follow(p);
    world.spots.update(dt, this.mode === 'photo' ? world.camera.position : p);
    world.textures.update(world.roomAt(p.x));
    world.renderer.render(world.scene, world.camera);
  }
}
