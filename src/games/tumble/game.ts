import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { NEUTRAL_INPUT } from "@/lib/protocol";
import type { GamePlayer, GameResult } from "@/lib/game-bridge";
import { colorFor } from "@/lib/colors";
import { ordinal } from "@/lib/format";
import { PALETTE, TUMBLE } from "./config";
import { PhysicsWorld, type ColliderRef } from "./world";
import { Runner } from "./runner";
import { SHOW, type BuiltCourse, type CourseSpec } from "./courses";
import type { TumbleBridge, TumbleHudData, TumbleHudEntry } from "./types";

let physicsReady: Promise<void> | null = null;
/** Loads the Rapier WASM once per page. */
export function initPhysics(): Promise<void> {
  if (!physicsReady) physicsReady = RAPIER.init();
  return physicsReady;
}

type Phase = "countdown" | "running" | "intermission" | "ended";

interface Elimination {
  round: number;
  /** rank among those eliminated in that round, 0 = furthest along */
  rank: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function quotaFor(n: number): number {
  return n <= 2 ? n : Math.max(2, Math.ceil(n * 0.6));
}

/** Celebration particles for the end of the show. */
class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly vel: Float32Array;
  private readonly pos: Float32Array;
  private readonly rot: Float32Array;
  private age = 0;
  private readonly dummy = new THREE.Object3D();
  constructor(scene: THREE.Scene, origin: THREE.Vector3, count = 260) {
    const geo = new THREE.BoxGeometry(0.35, 0.08, 0.5);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.vel = new Float32Array(count * 3);
    this.pos = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = origin.x + rand(-2, 2);
      this.pos[i * 3 + 1] = origin.y;
      this.pos[i * 3 + 2] = origin.z + rand(-2, 2);
      this.vel[i * 3] = rand(-9, 9);
      this.vel[i * 3 + 1] = rand(10, 22);
      this.vel[i * 3 + 2] = rand(-9, 9);
      this.rot[i * 3] = rand(0, 6);
      this.rot[i * 3 + 1] = rand(0, 6);
      this.rot[i * 3 + 2] = rand(0, 6);
      color.setHSL(Math.random(), 0.9, 0.6);
      this.mesh.setColorAt(i, color);
    }
    scene.add(this.mesh);
  }
  update(dt: number): boolean {
    this.age += dt;
    const n = this.mesh.count;
    for (let i = 0; i < n; i++) {
      this.vel[i * 3 + 1] -= 14 * dt;
      this.vel[i * 3] *= 0.985;
      this.vel[i * 3 + 2] *= 0.985;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i * 3] += 3 * dt;
      this.rot[i * 3 + 2] += 2 * dt;
      this.dummy.position.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.dummy.rotation.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.age < 6;
  }
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Runs a whole show: three rounds of obstacle courses, eliminations between
 * them, a last-one-standing final, then a ranking for the results screen.
 */
export class TumbleGame {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly resizeObserver: ResizeObserver;
  private pw: PhysicsWorld | null = null;
  private course: BuiltCourse | null = null;
  private spec: CourseSpec = SHOW[0];
  private roundIndex = 0;
  private readonly rounds: CourseSpec[] = SHOW;
  private readonly runners = new Map<string, Runner>();
  private phase: Phase = "countdown";
  /** simulation clock in seconds; every timer in the show runs on it, never on wall-clock */
  private time = 0;
  private phaseStartedAt = 0;
  private startedOnce = false;
  private roundStartedAt = 0;
  private firstQualifiedAt: number | null = null;
  private quota = 0;
  private qualifiedOrder: string[] = [];
  private finalFallOrder: string[] = [];
  private readonly eliminations = new Map<string, Elimination>();
  private readonly hazardReadyAt = new Map<string, number>();
  private readonly hazardPrevA = new Map<string, boolean>();
  private intermission: TumbleHudData["intermission"] | null = null;
  private accumulator = 0;
  private lastFrameTs = 0;
  private raf = 0;
  private lastHudAt = 0;
  private lastStandingsAt = 0;
  private lastOrderKey = "";
  private readonly camPos = new THREE.Vector3(0, 20, 30);
  private readonly camTarget = new THREE.Vector3(0, 0, -10);
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly sunOffset = new THREE.Vector3(18, 42, 24);
  private confetti: Confetti | null = null;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly bridge: TumbleBridge,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.fog, 80, 170);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x9bc27a, 1.0));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -50;
    sc.right = 50;
    sc.top = 50;
    sc.bottom = -50;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
  }

  start(): void {
    this.startRound(0);
    this.lastFrameTs = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.disposeWorld();
    this.confetti?.dispose(this.scene);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }

  // ---------- rounds ----------

  private roundParticipants(): GamePlayer[] {
    return this.bridge.players.filter((p) => !this.eliminations.has(p.id) && !this.finalFallOrder.includes(p.id));
  }

  private disposeWorld(): void {
    for (const r of this.runners.values()) r.dispose();
    this.runners.clear();
    this.pw?.dispose();
    this.pw = null;
    this.course = null;
  }

  private startRound(index: number): void {
    this.roundIndex = index;
    this.spec = this.rounds[index];
    this.disposeWorld();
    const pw = new PhysicsWorld(this.scene);
    this.pw = pw;
    const participants = this.roundParticipants();
    const course = this.spec.build(pw, participants.length);
    this.course = course;
    const isFinal = this.spec.kind === "final";
    participants.forEach((p, i) => {
      const spawn = course.spawns[i % course.spawns.length];
      const runner = new Runner(p, pw, spawn, isFinal ? -Infinity : course.killY);
      const cp = course.checkpoints[0];
      if (cp) runner.checkpoint.set(cp.x, cp.y, cp.z);
      this.runners.set(p.id, runner);
    });
    this.qualifiedOrder = [];
    this.firstQualifiedAt = null;
    this.quota = isFinal ? 1 : quotaFor(participants.length);
    this.intermission = null;
    this.phase = "countdown";
    this.phaseStartedAt = this.time;
    this.accumulator = 0;
    this.hazardPrevA.clear();

    this.bridge.onStage({ index: index + 1, count: this.rounds.length, name: this.spec.name });
    if (index > 0) this.bridge.onPlayers(participants.map((p) => ({ id: p.id, patch: { finished: false, detail: "" } })));

    if (course.camera === "fixed") {
      this.camPos.set(0, 46, 52);
      this.camTarget.set(0, -8, -4);
    } else {
      const z = course.spawns[0]?.z ?? 0;
      this.camPos.set(0, 20, z + 30);
      this.camTarget.set(0, 0, z - 10);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  private advance(): void {
    const remaining = this.roundParticipants();
    const soloShow = this.bridge.players.length <= 1;
    if (this.roundIndex + 1 >= this.rounds.length || (remaining.length <= 1 && !soloShow)) {
      this.endShow();
      return;
    }
    this.startRound(this.roundIndex + 1);
  }

  private endRaceRound(): void {
    const participants = this.roundParticipants();
    const qualified = this.qualifiedOrder.slice();
    const rest = participants
      .filter((p) => !qualified.includes(p.id))
      .map((p) => ({ p, progress: this.runners.get(p.id)?.progress ?? 0 }))
      .sort((a, b) => b.progress - a.progress);
    // If the clock ran out, the furthest runners still go through.
    while (qualified.length < this.quota && rest.length > 0) qualified.push(rest.shift()!.p.id);
    const round = this.roundIndex + 1;
    rest.forEach((e, i) => {
      this.eliminations.set(e.p.id, { round, rank: i });
      this.runners.get(e.p.id)?.eliminate();
    });
    this.bridge.onPlayers([
      ...qualified.map((id) => ({ id, patch: { finished: true } })),
      ...rest.map((e) => ({ id: e.p.id, patch: { eliminated: true, finished: false, detail: `Out in round ${round}` } })),
    ]);
    const nameOf = (id: string) => this.bridge.players.find((p) => p.id === id)?.name ?? id;
    const next = this.rounds[this.roundIndex + 1];
    const remainingCount = qualified.length;
    this.intermission = {
      title: `Round ${round} complete`,
      qualified: qualified.map(nameOf),
      eliminated: rest.map((e) => e.p.name),
      next: remainingCount <= 1 || !next ? null : next.name,
    };
    this.phase = "intermission";
    this.phaseStartedAt = this.time;
  }

  private endShow(): void {
    const survivors = this.roundParticipants()
      .map((p) => ({ p, runner: this.runners.get(p.id) }))
      .sort((a, b) => (b.runner?.position.y ?? 0) - (a.runner?.position.y ?? 0) || (b.runner?.progress ?? 0) - (a.runner?.progress ?? 0));
    const finalists = new Set<string>([...survivors.map((s) => s.p.id), ...this.finalFallOrder]);
    const ranked: string[] = [
      ...survivors.map((s) => s.p.id),
      ...this.finalFallOrder.slice().reverse(),
      ...[...this.eliminations.entries()].sort((a, b) => b[1].round - a[1].round || a[1].rank - b[1].rank).map(([id]) => id),
    ];
    const results: GameResult[] = ranked.map((id, i) => {
      const position = i + 1;
      let detail: string;
      if (position === 1) detail = "Winner!";
      else if (finalists.has(id)) detail = `Final · ${ordinal(position)}`;
      else detail = `Out in round ${this.eliminations.get(id)?.round ?? "?"}`;
      return { id, position, detail, finishTimeMs: null };
    });
    this.phase = "ended";
    this.phaseStartedAt = this.time;
    const winner = ranked[0] ? this.runners.get(ranked[0]) : undefined;
    const origin = winner && !winner.hidden ? winner.position.clone().add(new THREE.Vector3(0, 2, 0)) : this.camTarget.clone().add(new THREE.Vector3(0, 6, 0));
    this.confetti?.dispose(this.scene);
    this.confetti = new Confetti(this.scene, origin);
    this.bridge.onEnded(results);
  }

  // ---------- frame loop ----------

  private readonly frame = (ts: number): void => {
    if (this.disposed) return;
    const dt = Math.min((ts - this.lastFrameTs) / 1000, 0.1);
    this.lastFrameTs = ts;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Advances the show by `dt` seconds. Safe to call from a script for headless tests. */
  update(dt: number): void {
    const pw = this.pw;
    if (!pw || !this.course) return;
    this.time += dt;
    const now = this.time;
    const phaseElapsed = now - this.phaseStartedAt;

    if (this.phase === "countdown" && phaseElapsed >= TUMBLE.countdownMs / 1000) {
      this.phase = "running";
      this.phaseStartedAt = now;
      this.roundStartedAt = now;
      for (const r of this.runners.values()) r.controlsEnabled = true;
      if (!this.startedOnce) {
        this.startedOnce = true;
        this.bridge.onStarted();
      }
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= TUMBLE.fixedDt && steps < TUMBLE.maxSubsteps) {
      this.fixedStep(TUMBLE.fixedDt);
      this.accumulator -= TUMBLE.fixedDt;
      steps += 1;
    }
    if (steps === TUMBLE.maxSubsteps) this.accumulator = 0;
    pw.sync(dt);
    for (const r of this.runners.values()) r.sync(dt, pw.now);

    if (this.phase === "running") this.checkRoundEnd();
    // re-read the phase clock: checkRoundEnd may have just started the intermission
    if (this.phase === "intermission" && now - this.phaseStartedAt >= TUMBLE.intermissionMs / 1000) this.advance();
    if (this.confetti && !this.confetti.update(dt)) {
      this.confetti.dispose(this.scene);
      this.confetti = null;
    }

    this.updateCamera(dt);
    if (now - this.lastHudAt >= TUMBLE.hudIntervalMs / 1000) {
      this.lastHudAt = now;
      this.bridge.onHud(this.hud());
    }
    if (this.phase === "running" && now - this.lastStandingsAt >= TUMBLE.standingsIntervalMs / 1000) {
      this.lastStandingsAt = now;
      this.reportStandings();
    }
  }

  private fixedStep(fdt: number): void {
    const pw = this.pw!;
    for (const r of this.runners.values()) {
      const input = this.phase === "running" && r.active ? this.bridge.inputs.get(r.def.id) : NEUTRAL_INPUT;
      r.step(input, fdt);
    }
    pw.step(fdt);
    pw.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = pw.refOf(h1);
      const b = pw.refOf(h2);
      this.contact(a, b);
      this.contact(b, a);
    });
    for (const ball of pw.balls.slice()) if (ball.expired) pw.removeBall(ball);
    if (this.phase === "running") {
      this.pollHazards();
      this.checkRunners();
    }
  }

  private contact(a: ColliderRef | undefined, b: ColliderRef | undefined): void {
    if (a?.kind !== "runner" || !b) return;
    const runner = this.runners.get(a.id);
    if (!runner) return;
    if (b.kind === "hazard") {
      const push = b.obstacle.pushFor(runner.position);
      if (push) runner.hit(push);
    } else if (b.kind === "ball") {
      runner.hit(b.ball.pushFor(runner.position));
    } else if (b.kind === "tile") {
      b.tile.touch();
    }
  }

  private checkRunners(): void {
    const course = this.course!;
    for (const r of this.runners.values()) {
      if (!r.active) continue;
      if (this.spec.kind === "race") {
        let cp = course.checkpoints[0];
        for (const c of course.checkpoints) if (-c.z <= r.progress) cp = c;
        if (cp) r.checkpoint.set(cp.x, cp.y, cp.z);
        if (course.finishZ !== null && r.position.z <= course.finishZ) {
          r.finish(this.time);
          this.qualifiedOrder.push(r.def.id);
          if (this.firstQualifiedAt === null) this.firstQualifiedAt = this.time;
          this.bridge.onPlayer(r.def.id, { finished: true, detail: `Qualified ${ordinal(this.qualifiedOrder.length)}` });
        }
      } else if (r.position.y < course.killY) {
        r.eliminate();
        this.finalFallOrder.push(r.def.id);
        this.bridge.onPlayer(r.def.id, { eliminated: true, detail: "Fell in the final" });
      }
    }
  }

  private pollHazards(): void {
    const now = this.time;
    for (const p of this.bridge.players) {
      const out = this.eliminations.has(p.id) || this.finalFallOrder.includes(p.id);
      if (!out) continue;
      const input = this.bridge.inputs.get(p.id);
      const prev = this.hazardPrevA.get(p.id) ?? false;
      this.hazardPrevA.set(p.id, input.a);
      if (!input.a || prev) continue;
      if (now < (this.hazardReadyAt.get(p.id) ?? 0)) continue;
      this.hazardReadyAt.set(p.id, now + TUMBLE.hazardCooldownMs / 1000);
      this.spawnBall(p);
    }
  }

  private spawnBall(thrower: GamePlayer): void {
    const pw = this.pw!;
    const color = colorFor(thrower.colorIndex).hex;
    const active = [...this.runners.values()].filter((r) => r.active && !r.hidden);
    if (this.spec.kind === "final" || active.length === 0) {
      pw.spawnBall({ x: rand(-8, 8), y: 14, z: rand(-8, 8) }, { x: 0, y: 0, z: 0 }, color);
      return;
    }
    const leader = active.reduce((a, b) => (b.position.z < a.position.z ? b : a));
    pw.spawnBall({ x: leader.position.x + rand(-3, 3), y: 7, z: leader.position.z - 12 }, { x: 0, y: 0, z: TUMBLE.ball.speed }, color);
  }

  private checkRoundEnd(): void {
    const now = this.time;
    const active = [...this.runners.values()].filter((r) => r.active);
    const elapsed = now - this.roundStartedAt;
    if (this.spec.kind === "race") {
      const quotaFull = this.qualifiedOrder.length >= this.quota;
      const graceOver = this.firstQualifiedAt !== null && now - this.firstQualifiedAt > TUMBLE.race.graceMs / 1000;
      const timeUp = elapsed > TUMBLE.race.limitMs / 1000;
      if (!quotaFull && active.length > 0 && !graceOver && !timeUp) return;
      this.endRaceRound();
      return;
    }
    const participants = this.runners.size;
    const survivorsAllowed = participants > 1 ? 1 : 0;
    if (active.length > survivorsAllowed && elapsed <= TUMBLE.final.limitMs / 1000) return;
    this.endShow();
  }

  // ---------- reporting ----------

  private reportStandings(): void {
    const active = [...this.runners.values()].filter((r) => r.active).sort((a, b) => b.progress - a.progress);
    const outNow = this.finalFallOrder.slice().reverse();
    const outBefore = [...this.eliminations.entries()].sort((a, b) => b[1].round - a[1].round || a[1].rank - b[1].rank).map(([id]) => id);
    const order = [...this.qualifiedOrder, ...active.map((r) => r.def.id), ...outNow, ...outBefore];
    const key = order.join("|");
    if (key === this.lastOrderKey) return;
    this.lastOrderKey = key;
    this.bridge.onStandings(order);
  }

  private hud(): TumbleHudData {
    const now = this.time;
    const players: TumbleHudEntry[] = this.bridge.players.map((p) => ({
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      status:
        this.eliminations.has(p.id) || this.finalFallOrder.includes(p.id)
          ? "eliminated"
          : this.qualifiedOrder.includes(p.id)
            ? "qualified"
            : "running",
    }));
    let countdown: number | undefined;
    if (this.phase === "countdown") countdown = Math.max(1, Math.ceil(TUMBLE.countdownMs / 1000 - (now - this.phaseStartedAt)));
    else if (this.phase === "running" && now - this.roundStartedAt < TUMBLE.goFlashMs / 1000) countdown = 0;
    const kind: TumbleHudData["kind"] =
      this.phase === "intermission" ? "intermission" : this.phase === "ended" ? "ended" : this.spec.kind === "final" ? "final" : "round";
    return {
      kind,
      roundName: this.spec.name,
      roundIndex: this.roundIndex + 1,
      roundCount: this.rounds.length,
      elapsedMs: this.phase === "running" ? Math.round((now - this.roundStartedAt) * 1000) : 0,
      qualified: this.qualifiedOrder.length,
      quota: this.quota,
      alive: [...this.runners.values()].filter((r) => r.active).length,
      players,
      countdown,
      intermission: this.intermission ?? undefined,
    };
  }

  // ---------- camera ----------

  private updateCamera(dt: number): void {
    const course = this.course!;
    const k = 1 - Math.exp(-3.5 * dt);
    if (course.camera === "fixed") {
      this.desiredPos.set(0, 46, 52);
      this.desiredTarget.set(0, -8, -4);
    } else {
      const visible = [...this.runners.values()].filter((r) => !r.hidden && r.active);
      const list = visible.length > 0 ? visible : [...this.runners.values()].filter((r) => !r.hidden);
      if (list.length > 0) {
        let minZ = Infinity;
        let maxZ = -Infinity;
        let sumX = 0;
        for (const r of list) {
          minZ = Math.min(minZ, r.position.z);
          maxZ = Math.max(maxZ, r.position.z);
          sumX += r.position.x;
        }
        const spread = maxZ - minZ;
        const dist = THREE.MathUtils.clamp(17 + spread * 0.55, 17, 48);
        const focusZ = minZ + spread * 0.55;
        const x = (sumX / list.length) * 0.35;
        this.desiredPos.set(x, 10 + dist * 0.5, focusZ + dist * 0.85);
        this.desiredTarget.set(x, 0, focusZ - 8);
      }
    }
    this.camPos.lerp(this.desiredPos, k);
    this.camTarget.lerp(this.desiredTarget, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.sun.position.copy(this.camTarget).add(this.sunOffset);
    this.sun.target.position.copy(this.camTarget);
    this.sun.target.updateMatrixWorld();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
