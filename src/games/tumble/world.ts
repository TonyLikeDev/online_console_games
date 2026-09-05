import * as THREE from "three";
import RAPIER, { type Collider, type RigidBody, type World } from "@dimforge/rapier3d-compat";
import { PALETTE, TUMBLE } from "./config";

/** What a collider belongs to, looked up from collision events and ground rays. */
export type ColliderRef =
  | { kind: "runner"; id: string }
  | { kind: "hazard"; obstacle: Obstacle }
  | { kind: "tile"; tile: DropTile }
  | { kind: "ball"; ball: Ball }
  | { kind: "ground"; obstacle?: Obstacle; belt?: THREE.Vector3 };

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const materialCache = new Map<number, THREE.MeshStandardMaterial>();
export function material(color: number): THREE.MeshStandardMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
    materialCache.set(color, m);
  }
  return m;
}

let stripeTexture: THREE.CanvasTexture | null = null;
function beltTexture(): THREE.CanvasTexture {
  if (stripeTexture) return stripeTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#5c6b73";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#d9e2ec";
  g.fillRect(0, 0, 64, 20);
  stripeTexture = new THREE.CanvasTexture(c);
  stripeTexture.wrapS = THREE.RepeatWrapping;
  stripeTexture.wrapT = THREE.RepeatWrapping;
  stripeTexture.colorSpace = THREE.SRGBColorSpace;
  return stripeTexture;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? "#111111" : "#ffffff";
      g.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Owns the Rapier world, the Three scene contents for a course, and the map
 * from collider handles to game objects. Rebuilt for every round.
 */
export class PhysicsWorld {
  readonly world: World;
  readonly events = new RAPIER.EventQueue(true);
  readonly refs = new Map<number, ColliderRef>();
  readonly obstacles: Obstacle[] = [];
  readonly tiles: DropTile[] = [];
  readonly balls: Ball[] = [];
  readonly group = new THREE.Group();
  private readonly disposables: Array<() => void> = [];
  private time = 0;

  constructor(readonly scene: THREE.Scene, gravity = TUMBLE.gravity) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = TUMBLE.fixedDt;
    scene.add(this.group);
  }

  get now(): number {
    return this.time;
  }

  register(collider: Collider, ref: ColliderRef): void {
    this.refs.set(collider.handle, ref);
  }
  unregister(collider: Collider): void {
    this.refs.delete(collider.handle);
  }
  refOf(handle: number): ColliderRef | undefined {
    return this.refs.get(handle);
  }

  /** Advance kinematic obstacles then the physics world by one fixed step. */
  step(dt: number): void {
    this.time += dt;
    for (const o of this.obstacles) o.update(this.time, dt);
    for (const t of this.tiles) t.update(this.time);
    for (const b of this.balls) b.update(dt);
    this.world.step(this.events);
  }

  /** Update visuals after all substeps of a frame. */
  sync(dt: number): void {
    for (const o of this.obstacles) o.sync();
    for (const t of this.tiles) t.sync(dt);
    for (const b of this.balls) b.sync();
    beltTexture().offset.y -= dt * 1.5;
  }

  addMesh(mesh: THREE.Object3D): void {
    this.group.add(mesh);
  }

  onDispose(fn: () => void): void {
    this.disposables.push(fn);
  }

  removeBall(ball: Ball): void {
    const i = this.balls.indexOf(ball);
    if (i >= 0) this.balls.splice(i, 1);
    ball.dispose(this);
  }

  dispose(): void {
    for (const b of this.balls.slice()) this.removeBall(b);
    for (const fn of this.disposables) fn();
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.geometry.dispose();
    });
    this.events.free();
    this.world.free();
  }

  // ---------- static geometry ----------

  /** Axis-aligned fixed box. `size` is full extents. */
  box(
    center: Vec3Like,
    size: Vec3Like,
    color: number,
    opts: { rotX?: number; friction?: number; belt?: THREE.Vector3; castShadow?: boolean } = {},
  ): { body: RigidBody; collider: Collider; mesh: THREE.Mesh } {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rotX ?? 0, 0, 0));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setFriction(opts.friction ?? 0.8),
      body,
    );
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(color));
    if (opts.belt) {
      const tex = beltTexture();
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
      tex.repeat.set(size.x / 2, size.z / 2);
      mesh.material = m;
    }
    mesh.position.set(center.x, center.y, center.z);
    mesh.quaternion.copy(q);
    mesh.receiveShadow = true;
    mesh.castShadow = opts.castShadow ?? size.y > 1;
    this.addMesh(mesh);
    this.register(collider, { kind: "ground", belt: opts.belt });
    return { body, collider, mesh };
  }

  finishLine(z: number, width: number): void {
    const tex = checkerTexture();
    tex.repeat.set(width / 4, 1);
    const geo = new THREE.PlaneGeometry(width, 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.02, z);
    this.addMesh(mesh);
    this.onDispose(() => tex.dispose());
  }

  // ---------- obstacles ----------

  spinner(center: Vec3Like, length: number, speed: number, phase = 0): Spinner {
    const s = new Spinner(this, center, length, speed, phase);
    this.obstacles.push(s);
    return s;
  }
  hammer(pivot: Vec3Like, arm: number, amplitude: number, speed: number, phase: number): Hammer {
    const h = new Hammer(this, pivot, arm, amplitude, speed, phase);
    this.obstacles.push(h);
    return h;
  }
  pusher(center: Vec3Like, size: Vec3Like, amplitude: number, speed: number, phase: number): Pusher {
    const p = new Pusher(this, center, size, amplitude, speed, phase);
    this.obstacles.push(p);
    return p;
  }
  platform(center: Vec3Like, size: Vec3Like, axis: "x" | "z", amplitude: number, speed: number, phase: number): MovingPlatform {
    const p = new MovingPlatform(this, center, size, axis, amplitude, speed, phase);
    this.obstacles.push(p);
    return p;
  }
  dropTile(center: Vec3Like, size: number, color: number, respawnMs: number | null): DropTile {
    const t = new DropTile(this, center, size, color, respawnMs);
    this.tiles.push(t);
    return t;
  }
  spawnBall(pos: Vec3Like, vel: Vec3Like, color: number): Ball {
    const b = new Ball(this, pos, vel, color);
    this.balls.push(b);
    return b;
  }
}

// ---------- obstacle classes ----------

export abstract class Obstacle {
  /** velocity of the surface, used to carry runners standing on it */
  readonly velocity = new THREE.Vector3();
  protected readonly bodies: RigidBody[] = [];
  protected readonly meshes: THREE.Object3D[] = [];
  abstract update(t: number, dt: number): void;
  abstract sync(): void;
  /** impulse to apply to a runner at `pos` that touched this obstacle, or null if harmless */
  pushFor(pos: THREE.Vector3): THREE.Vector3 | null {
    void pos;
    return null;
  }
  protected kinematic(pw: PhysicsWorld, at: Vec3Like): RigidBody {
    const body = pw.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y, at.z));
    this.bodies.push(body);
    return body;
  }
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/** A bar rotating around a central post, sweeping runners off their feet. */
export class Spinner extends Obstacle {
  private readonly bar: RigidBody;
  private readonly barMesh: THREE.Mesh;
  private angle = 0;
  constructor(pw: PhysicsWorld, private readonly center: Vec3Like, length: number, private readonly speed: number, private readonly phase: number) {
    super();
    const postH = 3;
    pw.box({ x: center.x, y: postH / 2, z: center.z }, { x: 1, y: postH, z: 1 }, PALETTE.post);
    this.bar = this.kinematic(pw, { x: center.x, y: 1.1, z: center.z });
    const collider = pw.world.createCollider(
      RAPIER.ColliderDesc.cuboid(length / 2, 0.45, 0.45).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.bar,
    );
    pw.register(collider, { kind: "hazard", obstacle: this });
    this.barMesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.9, 0.9), material(PALETTE.bar));
    this.barMesh.castShadow = true;
    pw.addMesh(this.barMesh);
    this.meshes.push(this.barMesh);
  }
  update(t: number): void {
    this.angle = this.phase + t * this.speed;
    _q.setFromEuler(_e.set(0, this.angle, 0));
    this.bar.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  }
  sync(): void {
    const p = this.bar.translation();
    const r = this.bar.rotation();
    this.barMesh.position.set(p.x, p.y, p.z);
    this.barMesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
  pushFor(pos: THREE.Vector3): THREE.Vector3 {
    const rx = pos.x - this.center.x;
    const rz = pos.z - this.center.z;
    // tangential direction of rotation around +Y
    const sign = Math.sign(this.speed) || 1;
    const tx = -rz * sign;
    const tz = rx * sign;
    const len = Math.hypot(tx, tz) || 1;
    return new THREE.Vector3((tx / len) * 9, 5, (tz / len) * 9);
  }
}

/** A pendulum head swinging across the course. */
export class Hammer extends Obstacle {
  private readonly head: RigidBody;
  private readonly headMesh: THREE.Mesh;
  private readonly armMesh: THREE.Mesh;
  private angle = 0;
  private angVel = 0;
  constructor(
    pw: PhysicsWorld,
    private readonly pivot: Vec3Like,
    private readonly arm: number,
    private readonly amplitude: number,
    private readonly speed: number,
    private readonly phase: number,
  ) {
    super();
    // gantry: two posts and a beam
    const beamY = pivot.y + 0.6;
    pw.box({ x: pivot.x - 5, y: beamY / 2, z: pivot.z }, { x: 0.6, y: beamY, z: 0.6 }, PALETTE.post);
    pw.box({ x: pivot.x + 5, y: beamY / 2, z: pivot.z }, { x: 0.6, y: beamY, z: 0.6 }, PALETTE.post);
    pw.box({ x: pivot.x, y: beamY, z: pivot.z }, { x: 10.6, y: 0.6, z: 0.6 }, PALETTE.post, { castShadow: true });
    this.head = this.kinematic(pw, { x: pivot.x, y: pivot.y - arm, z: pivot.z });
    const collider = pw.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.1, 1.1, 1.1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.head,
    );
    pw.register(collider, { kind: "hazard", obstacle: this });
    this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), material(PALETTE.hammerHead));
    this.headMesh.castShadow = true;
    this.armMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, arm, 8), material(PALETTE.arm));
    this.armMesh.castShadow = true;
    pw.addMesh(this.headMesh);
    pw.addMesh(this.armMesh);
    this.meshes.push(this.headMesh, this.armMesh);
  }
  update(t: number): void {
    this.angle = this.amplitude * Math.sin(t * this.speed + this.phase);
    this.angVel = this.amplitude * this.speed * Math.cos(t * this.speed + this.phase);
    const x = this.pivot.x + Math.sin(this.angle) * this.arm;
    const y = this.pivot.y - Math.cos(this.angle) * this.arm;
    this.head.setNextKinematicTranslation({ x, y, z: this.pivot.z });
    _q.setFromEuler(_e.set(0, 0, this.angle));
    this.head.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
  }
  sync(): void {
    const p = this.head.translation();
    const r = this.head.rotation();
    this.headMesh.position.set(p.x, p.y, p.z);
    this.headMesh.quaternion.set(r.x, r.y, r.z, r.w);
    // arm hangs from the pivot to the head centre
    this.armMesh.position.set((this.pivot.x + p.x) / 2, (this.pivot.y + p.y) / 2, this.pivot.z);
    this.armMesh.quaternion.copy(_q.setFromEuler(_e.set(0, 0, this.angle)));
  }
  pushFor(): THREE.Vector3 {
    // head moves along +x when angVel > 0 (angle increasing)
    const dir = Math.sign(this.angVel) || 1;
    return new THREE.Vector3(dir * 11, 6, 0);
  }
}

/** A block sliding side to side across the course. */
export class Pusher extends Obstacle {
  private readonly body: RigidBody;
  private readonly mesh: THREE.Mesh;
  private dir = 1;
  constructor(
    pw: PhysicsWorld,
    private readonly center: Vec3Like,
    size: Vec3Like,
    private readonly amplitude: number,
    private readonly speed: number,
    private readonly phase: number,
  ) {
    super();
    this.body = this.kinematic(pw, center);
    const collider = pw.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    pw.register(collider, { kind: "hazard", obstacle: this });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(PALETTE.pusher));
    this.mesh.castShadow = true;
    pw.addMesh(this.mesh);
    this.meshes.push(this.mesh);
  }
  update(t: number): void {
    const x = this.center.x + Math.sin(t * this.speed + this.phase) * this.amplitude;
    this.dir = Math.sign(Math.cos(t * this.speed + this.phase)) || 1;
    this.velocity.set(Math.cos(t * this.speed + this.phase) * this.amplitude * this.speed, 0, 0);
    this.body.setNextKinematicTranslation({ x, y: this.center.y, z: this.center.z });
  }
  sync(): void {
    const p = this.body.translation();
    this.mesh.position.set(p.x, p.y, p.z);
  }
  pushFor(): THREE.Vector3 {
    return new THREE.Vector3(this.dir * 10, 5, 0);
  }
}

/** A platform runners can ride. */
export class MovingPlatform extends Obstacle {
  private readonly body: RigidBody;
  private readonly mesh: THREE.Mesh;
  constructor(
    pw: PhysicsWorld,
    private readonly center: Vec3Like,
    size: Vec3Like,
    private readonly axis: "x" | "z",
    private readonly amplitude: number,
    private readonly speed: number,
    private readonly phase: number,
  ) {
    super();
    this.body = this.kinematic(pw, center);
    const collider = pw.world.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setFriction(1), this.body);
    pw.register(collider, { kind: "ground", obstacle: this });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material(PALETTE.platform));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    pw.addMesh(this.mesh);
    this.meshes.push(this.mesh);
  }
  update(t: number): void {
    const off = Math.sin(t * this.speed + this.phase) * this.amplitude;
    const vel = Math.cos(t * this.speed + this.phase) * this.amplitude * this.speed;
    if (this.axis === "x") {
      this.velocity.set(vel, 0, 0);
      this.body.setNextKinematicTranslation({ x: this.center.x + off, y: this.center.y, z: this.center.z });
    } else {
      this.velocity.set(0, 0, vel);
      this.body.setNextKinematicTranslation({ x: this.center.x, y: this.center.y, z: this.center.z + off });
    }
  }
  sync(): void {
    const p = this.body.translation();
    this.mesh.position.set(p.x, p.y, p.z);
  }
}

/** A floor tile that falls away shortly after someone steps on it. */
export class DropTile {
  readonly collider: Collider;
  private readonly mesh: THREE.Mesh;
  private readonly baseY: number;
  private armedAt: number | null = null;
  private droppedAt: number | null = null;
  private gone = false;
  constructor(
    private readonly pw: PhysicsWorld,
    private readonly center: Vec3Like,
    size: number,
    color: number,
    private readonly respawnMs: number | null,
  ) {
    const body = pw.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    this.collider = pw.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, 0.2, size / 2).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    pw.register(this.collider, { kind: "tile", tile: this });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(size, 0.4, size), material(color));
    this.mesh.position.set(center.x, center.y, center.z);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.baseY = center.y;
    pw.addMesh(this.mesh);
  }
  /** Called from a collision event when a runner lands on the tile. */
  touch(): void {
    if (this.gone || this.armedAt !== null) return;
    this.armedAt = this.pw.now;
  }
  update(t: number): void {
    if (this.armedAt !== null && !this.gone && t - this.armedAt > 0.45) {
      this.gone = true;
      this.droppedAt = t;
      this.collider.setEnabled(false);
    }
    if (this.gone && this.respawnMs !== null && this.droppedAt !== null && t - this.droppedAt > this.respawnMs / 1000) {
      this.gone = false;
      this.armedAt = null;
      this.droppedAt = null;
      this.collider.setEnabled(true);
      this.mesh.visible = true;
      this.mesh.position.y = this.baseY;
      this.mesh.rotation.set(0, 0, 0);
    }
  }
  sync(dt: number): void {
    if (this.armedAt !== null && !this.gone) {
      // wobble warning
      this.mesh.position.y = this.baseY + Math.sin(this.pw.now * 40) * 0.05;
      this.mesh.rotation.z = Math.sin(this.pw.now * 30) * 0.04;
    } else if (this.gone && this.mesh.visible) {
      this.mesh.position.y -= 18 * dt;
      this.mesh.rotation.x += 2 * dt;
      if (this.mesh.position.y < this.baseY - 30) this.mesh.visible = false;
    }
  }
}

/** A heavy ball rolled into the pack by an eliminated player. */
export class Ball {
  readonly body: RigidBody;
  readonly collider: Collider;
  private readonly mesh: THREE.Mesh;
  private age = 0;
  constructor(pw: PhysicsWorld, pos: Vec3Like, vel: Vec3Like, color: number) {
    this.body = pw.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinvel(vel.x, vel.y, vel.z).setCcdEnabled(true).setAngularDamping(0.3),
    );
    this.collider = pw.world.createCollider(
      RAPIER.ColliderDesc.ball(TUMBLE.ball.radius).setDensity(2.5).setRestitution(0.35).setFriction(0.9).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );
    pw.register(this.collider, { kind: "ball", ball: this });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(TUMBLE.ball.radius, 20, 14), material(color));
    this.mesh.castShadow = true;
    pw.addMesh(this.mesh);
  }
  get expired(): boolean {
    return this.age > TUMBLE.ball.lifeMs / 1000 || this.body.translation().y < TUMBLE.final.killY;
  }
  update(dt: number): void {
    this.age += dt;
  }
  sync(): void {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  }
  pushFor(pos: THREE.Vector3): THREE.Vector3 {
    const p = this.body.translation();
    const v = this.body.linvel();
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3((dx / len) * 6 + v.x * 0.6, 6, (dz / len) * 6 + v.z * 0.6);
  }
  dispose(pw: PhysicsWorld): void {
    pw.unregister(this.collider);
    pw.world.removeRigidBody(this.body);
    pw.group.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
