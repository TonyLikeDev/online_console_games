import * as THREE from "three";
import RAPIER, { type Collider, type RigidBody } from "@dimforge/rapier3d-compat";
import type { InputState } from "@/lib/protocol";
import type { GamePlayer } from "@/lib/game-bridge";
import { colorFor } from "@/lib/colors";
import { TUMBLE } from "./config";
import { material, type PhysicsWorld, type Vec3Like } from "./world";

export type RunnerState = "idle" | "diving" | "prone" | "stunned" | "done" | "out";

const R = TUMBLE.runner;
const GROUND_RAY = R.halfHeight + R.radius + 0.18;
const _dir = { x: 0, y: -1, z: 0 };

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function nameSprite(name: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 34px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 8;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  g.strokeText(name, 128, 32);
  g.fillStyle = color;
  g.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(3.2, 0.8, 1);
  sprite.position.y = 1.75;
  return sprite;
}

/** One wobbly contestant: a physics capsule, its controller, and its look. */
export class Runner {
  readonly body: RigidBody;
  readonly collider: Collider;
  readonly root = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly label: THREE.Sprite;
  state: RunnerState = "idle";
  private stateUntil = 0;
  private invulnUntil = 0;
  private grounded = false;
  private lastGroundedAt = -10;
  private jumpQueuedAt = -10;
  private prevA = false;
  private prevB = false;
  private yaw = 0;
  private moving = false;
  private readonly groundVel = new THREE.Vector3();
  private wobbleSeed = 0;
  readonly position = new THREE.Vector3();
  checkpoint = new THREE.Vector3();
  /** furthest distance travelled down the course */
  progress = 0;
  falls = 0;
  finishedAt: number | null = null;
  controlsEnabled = false;
  hidden = false;
  private hideAt: number | null = null;

  constructor(readonly def: GamePlayer, private readonly pw: PhysicsWorld, spawn: Vec3Like, private killY: number) {
    this.body = pw.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, spawn.y, spawn.z).lockRotations().setCcdEnabled(true).setLinearDamping(0.05),
    );
    this.collider = pw.world.createCollider(
      RAPIER.ColliderDesc.capsule(R.halfHeight, R.radius).setFriction(0.15).setRestitution(0.1).setDensity(1),
      this.body,
    );
    pw.register(this.collider, { kind: "runner", id: def.id });
    this.checkpoint.set(spawn.x, spawn.y, spawn.z);
    this.position.set(spawn.x, spawn.y, spawn.z);

    const color = colorFor(def.colorIndex);
    const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(R.radius, R.halfHeight * 2, 6, 18), material(color.hex));
    bodyMesh.castShadow = true;
    this.figure.add(bodyMesh);
    const eyeGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const pupilGeo = new THREE.SphereGeometry(0.07, 8, 6);
    for (const sx of [-0.19, 0.19]) {
      const eye = new THREE.Mesh(eyeGeo, material(0xffffff));
      eye.position.set(sx, 0.35, -0.42);
      const pupil = new THREE.Mesh(pupilGeo, material(0x111111));
      pupil.position.set(sx, 0.36, -0.53);
      this.figure.add(eye, pupil);
    }
    this.root.add(this.figure);
    this.label = nameSprite(def.name, color.css);
    this.root.add(this.label);
    this.root.position.copy(this.position);
    pw.addMesh(this.root);
  }

  get active(): boolean {
    return this.state !== "done" && this.state !== "out";
  }

  setKillY(y: number): void {
    this.killY = y;
  }

  private groundCheck(): void {
    this.grounded = false;
    this.groundVel.set(0, 0, 0);
    const p = this.body.translation();
    for (const ox of [0, -0.32, 0.32]) {
      const ray = new RAPIER.Ray({ x: p.x + ox, y: p.y, z: p.z }, _dir);
      const hit = this.pw.world.castRay(ray, GROUND_RAY, true, undefined, undefined, this.collider, this.body);
      if (!hit) continue;
      this.grounded = true;
      const ref = this.pw.refOf(hit.collider.handle);
      if (ref?.kind === "ground") {
        if (ref.belt) this.groundVel.copy(ref.belt);
        else if (ref.obstacle) this.groundVel.copy(ref.obstacle.velocity);
      } else if (ref?.kind === "tile") {
        ref.tile.touch();
      }
      break;
    }
  }

  /** One fixed physics step of control logic. */
  step(input: InputState, dt: number): void {
    if (this.hidden) return;
    const t = this.pw.now;
    if (this.state === "diving" && t >= this.stateUntil) {
      this.state = "prone";
      this.stateUntil = t + R.proneMs / 1000;
    } else if ((this.state === "prone" || this.state === "stunned") && t >= this.stateUntil) {
      this.state = "idle";
    }
    if (this.state === "done" && this.hideAt !== null && t >= this.hideAt) {
      this.hide();
      return;
    }

    this.groundCheck();
    if (this.grounded) this.lastGroundedAt = t;

    const v = this.body.linvel();
    const canControl = this.controlsEnabled && this.state === "idle";
    let dx = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    let dz = (input.d ? 1 : 0) - (input.u ? 1 : 0);
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
    }
    this.moving = canControl && len > 0;

    let tx = 0;
    let tz = 0;
    if (canControl) {
      tx = dx * R.speed;
      tz = dz * R.speed;
    }
    if (this.grounded) {
      tx += this.groundVel.x;
      tz += this.groundVel.z;
    }
    let vx = v.x;
    let vz = v.z;
    let vy = v.y;
    if (this.state !== "diving") {
      const accel = this.state === "stunned" || this.state === "prone" ? 5 : this.grounded ? R.groundAccel : R.airAccel;
      vx = approach(v.x, tx, accel * dt);
      vz = approach(v.z, tz, accel * dt);
    }

    const aPressed = input.a && !this.prevA;
    this.prevA = input.a;
    if (aPressed) this.jumpQueuedAt = t;
    const jumpWanted = t - this.jumpQueuedAt <= R.jumpBufferMs / 1000;
    const canJump = this.grounded || t - this.lastGroundedAt <= R.coyoteMs / 1000;
    if (canControl && jumpWanted && canJump && vy < 2) {
      vy = R.jumpSpeed;
      this.jumpQueuedAt = -10;
      this.lastGroundedAt = -10;
      this.grounded = false;
    }

    const bPressed = input.b && !this.prevB;
    this.prevB = input.b;
    if (bPressed && canControl) {
      let fx = -Math.sin(this.yaw);
      let fz = -Math.cos(this.yaw);
      if (len > 0) {
        fx = dx;
        fz = dz;
        this.yaw = Math.atan2(-dx, -dz);
      }
      vx = fx * R.diveSpeed;
      vz = fz * R.diveSpeed;
      vy = Math.max(vy, 0) + R.diveUp;
      this.state = "diving";
      this.stateUntil = t + R.diveMs / 1000;
    }

    this.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    if (this.moving) this.yaw = lerpAngle(this.yaw, Math.atan2(-dx, -dz), 0.3);

    const p = this.body.translation();
    this.position.set(p.x, p.y, p.z);
    if (this.active) this.progress = Math.max(this.progress, -p.z);
    if (this.active && p.y < this.killY) this.respawn();
  }

  /** Knocked by a hazard: lose control briefly and get shoved. */
  hit(push: THREE.Vector3): void {
    const t = this.pw.now;
    if (t < this.invulnUntil || !this.active || this.hidden) return;
    this.state = "stunned";
    this.stateUntil = t + R.stunMs / 1000;
    this.invulnUntil = t + (R.stunMs + R.invulnMs) / 1000;
    this.wobbleSeed = Math.random() * 10;
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x * 0.3 + push.x, y: Math.max(v.y, 0) + push.y, z: v.z * 0.3 + push.z }, true);
  }

  respawn(): void {
    this.falls += 1;
    const x = this.checkpoint.x + (Math.random() - 0.5) * 4;
    this.body.setTranslation({ x, y: this.checkpoint.y + 1.6, z: this.checkpoint.z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.state = "idle";
    this.invulnUntil = this.pw.now + R.respawnProtectMs / 1000;
    this.jumpQueuedAt = -10;
  }

  finish(now: number): void {
    if (!this.active) return;
    this.state = "done";
    this.finishedAt = now;
    this.hideAt = this.pw.now + 1.6;
    this.body.setLinvel({ x: 0, y: 4, z: 0 }, true);
  }

  eliminate(): void {
    if (this.state === "out") return;
    this.state = "out";
    this.hide();
  }

  hide(): void {
    if (this.hidden) return;
    this.hidden = true;
    this.root.visible = false;
    this.body.setEnabled(false);
  }

  /** Visual update once per rendered frame. */
  sync(dt: number, t: number): void {
    if (this.hidden) return;
    const p = this.body.translation();
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.y = this.yaw;
    const f = this.figure;
    switch (this.state) {
      case "diving":
        f.rotation.set(-1.25, 0, 0);
        f.position.y = -0.25;
        break;
      case "prone":
        f.rotation.set(-1.5, 0, 0);
        f.position.y = -0.4;
        break;
      case "stunned": {
        const remaining = Math.max(0, this.stateUntil - t) / (R.stunMs / 1000);
        f.rotation.set(Math.cos(t * 11 + this.wobbleSeed) * 0.5 * remaining, t * 6, Math.sin(t * 14 + this.wobbleSeed) * 0.6 * remaining);
        f.position.y = -0.1 * remaining;
        break;
      }
      case "done":
        f.rotation.set(0, t * 8, 0);
        f.position.y = Math.abs(Math.sin(t * 9)) * 0.5;
        break;
      default: {
        const lean = this.moving ? -0.18 : 0;
        f.rotation.x = THREE.MathUtils.lerp(f.rotation.x, lean, Math.min(1, dt * 10));
        f.rotation.y = 0;
        f.rotation.z = 0;
        const bob = this.moving && this.grounded ? Math.abs(Math.sin(t * 13)) * 0.12 : 0;
        f.position.y = THREE.MathUtils.lerp(f.position.y, bob, Math.min(1, dt * 12));
      }
    }
  }

  dispose(): void {
    this.pw.unregister(this.collider);
    this.pw.world.removeRigidBody(this.body);
    this.pw.group.remove(this.root);
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}
