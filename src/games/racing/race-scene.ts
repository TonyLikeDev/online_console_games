import Phaser from "phaser";
import { NEUTRAL_INPUT, type InputState } from "@/lib/protocol";
import { PLAYER_COLORS, colorFor } from "@/lib/colors";
import {
  CAR,
  COUNTDOWN_MS,
  PHYSICS as P,
  RACE_END_GRACE_MS,
  RACE_MAX_MS,
  STANDINGS_INTERVAL_MS,
  WORLD_H,
  WORLD_W,
} from "./config";
import { buildTrack, fractionAt, nearestPoint, startingGrid, type Track } from "./track";
import type { RaceBridge, RaceResult, RacerDef, StandingEntry } from "./types";

interface Car {
  def: RacerDef;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  lap: number;
  /** index of the next checkpoint this car must pass; 0 is the finish line */
  nextCp: number;
  frac: number;
  onTrack: boolean;
  finished: boolean;
  finishTimeMs: number | null;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** labels alternate above/below so grid neighbours do not overlap */
  labelOffset: number;
}

type State = "countdown" | "racing" | "ended";

const GRASS = 0x2f7a35;
const GRASS_DARK = 0x2a6e30;
const ASPHALT = 0x3a3a44;
const EDGE = 0xf1f1f1;
const CENTER_LINE = 0x8c8c96;

/**
 * Checkpoints are evenly spaced fractions of the lap. A lap only counts when
 * every checkpoint was passed in order and the car then reaches the line, so
 * cutting across the infield or reversing over the line earns nothing.
 */
const CHECKPOINTS = 12;
const CHECKPOINT_WINDOW = 0.5 / CHECKPOINTS;

/** Deterministic pseudo-random so the grass looks the same on every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export class RaceScene extends Phaser.Scene {
  private bridge!: RaceBridge;
  private track!: Track;
  private cars: Car[] = [];
  private state: State = "countdown";
  private countdownEndsAt = 0;
  private lastCountdownShown = -1;
  private countdownText!: Phaser.GameObjects.Text;
  private raceStartedAt = 0;
  private firstFinishAt: number | null = null;
  private lastStandingsAt = 0;
  private lastOrderKey = "";

  constructor() {
    super("race");
  }

  init(data: { bridge: RaceBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    this.track = buildTrack();
    this.drawTrack();
    this.makeCarTextures();
    this.spawnCars(this.bridge.racers);

    this.countdownText = this.add
      .text(WORLD_W / 2, WORLD_H / 2, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "160px",
        fontStyle: "900",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.state = "countdown";
    this.countdownEndsAt = this.time.now + COUNTDOWN_MS;
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.state === "countdown") {
      this.updateCountdown(time);
      return;
    }
    if (this.state !== "racing") return;

    const now = performance.now();
    for (const car of this.cars) {
      const input = car.finished ? NEUTRAL_INPUT : this.bridge.inputs.get(car.def.id, now);
      this.stepCar(car, input, dt);
    }
    this.resolveCarCollisions();
    for (const car of this.cars) {
      this.updateProgress(car, time);
      this.syncSprite(car);
    }

    if (time - this.lastStandingsAt >= STANDINGS_INTERVAL_MS) {
      this.lastStandingsAt = time;
      this.reportStandings(time);
    }
    this.checkRaceEnd(time);
  }

  // ---------- setup ----------

  private drawTrack() {
    const g = this.add.graphics();
    const rnd = lcg(1337);

    g.fillStyle(GRASS, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.fillStyle(GRASS_DARK, 1);
    for (let i = 0; i < 70; i++) {
      const w = 40 + rnd() * 140;
      const h = 20 + rnd() * 60;
      g.fillEllipse(rnd() * WORLD_W, rnd() * WORLD_H, w, h);
    }

    const pts = this.track.points;
    const hw = this.track.halfWidth;
    const strokeRoad = (width: number, color: number) => {
      g.lineStyle(width, color, 1);
      g.strokePoints(pts, true, true);
      g.fillStyle(color, 1);
      for (const p of pts) g.fillCircle(p.x, p.y, width / 2);
    };
    strokeRoad(hw * 2 + 14, EDGE);
    strokeRoad(hw * 2, ASPHALT);

    // dashed centre line
    g.lineStyle(3, CENTER_LINE, 1);
    for (let i = 0; i < pts.length; i += 14) {
      const a = pts[i];
      const b = pts[(i + 6) % pts.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    // start / finish line: checkered strip perpendicular to the track at point 0
    const s = pts[0];
    const nx = -s.ty;
    const ny = s.tx;
    const cell = 12;
    const cols = 2;
    const rows = Math.floor((hw * 2) / cell);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const along = (c - cols / 2) * cell;
        const across = -hw + r * cell;
        const cx = s.x + s.tx * along + nx * across;
        const cy = s.y + s.ty * along + ny * across;
        g.fillStyle((c + r) % 2 === 0 ? 0xffffff : 0x111111, 1);
        g.fillPoints(
          [
            { x: cx, y: cy },
            { x: cx + s.tx * cell, y: cy + s.ty * cell },
            { x: cx + s.tx * cell + nx * cell, y: cy + s.ty * cell + ny * cell },
            { x: cx + nx * cell, y: cy + ny * cell },
          ],
          true,
        );
      }
    }

    g.generateTexture("track", WORLD_W, WORLD_H);
    g.destroy();
    this.add.image(WORLD_W / 2, WORLD_H / 2, "track").setDepth(0);
  }

  private makeCarTextures() {
    const w = CAR.length;
    const h = CAR.width;
    const texW = w + 4;
    const texH = h + 6;
    PLAYER_COLORS.forEach((color, i) => {
      const key = `car${i}`;
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      // wheels
      g.fillStyle(0x151515, 1);
      g.fillRoundedRect(4, 0, 9, 5, 2);
      g.fillRoundedRect(texW - 13, 0, 9, 5, 2);
      g.fillRoundedRect(4, texH - 5, 9, 5, 2);
      g.fillRoundedRect(texW - 13, texH - 5, 9, 5, 2);
      // body
      g.fillStyle(color.hex, 1);
      g.fillRoundedRect(2, 3, w, h, 5);
      // cabin
      g.fillStyle(0x1b1b22, 0.85);
      g.fillRoundedRect(w * 0.42, 6, w * 0.34, h - 6, 3);
      // headlights
      g.fillStyle(0xfff3b0, 1);
      g.fillRect(w - 1, 5, 3, 4);
      g.fillRect(w - 1, texH - 9, 3, 4);
      g.generateTexture(key, texW, texH);
      g.destroy();
    });
    if (!this.textures.exists("shadow")) {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(texW / 2, texH / 2, texW, texH);
      g.generateTexture("shadow", texW, texH);
      g.destroy();
    }
  }

  private spawnCars(racers: RacerDef[]) {
    const grid = startingGrid(this.track, racers.length);
    this.cars = racers.map((def, i) => {
      const slot = grid[i];
      const labelOffset = i % 2 === 0 ? -26 : 28;
      const shadow = this.add.image(slot.x + 4, slot.y + 4, "shadow").setDepth(5).setRotation(slot.heading);
      const sprite = this.add.image(slot.x, slot.y, `car${def.colorIndex % PLAYER_COLORS.length}`).setDepth(10).setRotation(slot.heading);
      const label = this.add
        .text(slot.x, slot.y + labelOffset, def.name, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          fontStyle: "700",
          color: colorFor(def.colorIndex).css,
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(20);
      const near = nearestPoint(this.track, slot.x, slot.y);
      return {
        def,
        x: slot.x,
        y: slot.y,
        heading: slot.heading,
        vx: 0,
        vy: 0,
        lap: 1,
        nextCp: 1,
        frac: fractionAt(this.track, near.idx),
        onTrack: true,
        finished: false,
        finishTimeMs: null,
        sprite,
        shadow,
        label,
        labelOffset,
      };
    });
  }

  // ---------- countdown ----------

  private updateCountdown(time: number) {
    const remaining = this.countdownEndsAt - time;
    const n = Math.ceil(remaining / 1000);
    if (remaining <= 0) {
      this.state = "racing";
      this.raceStartedAt = time;
      this.lastStandingsAt = time;
      this.countdownText.setText("GO!").setScale(1).setAlpha(1);
      this.tweens.add({ targets: this.countdownText, alpha: 0, scale: 1.6, duration: 700, ease: "Cubic.easeOut" });
      this.bridge.onRaceStarted();
      return;
    }
    if (n !== this.lastCountdownShown) {
      this.lastCountdownShown = n;
      this.countdownText.setText(String(n)).setScale(1.5).setAlpha(1);
      this.tweens.add({ targets: this.countdownText, scale: 1, duration: 350, ease: "Back.easeOut" });
    }
  }

  // ---------- physics ----------

  private stepCar(car: Car, input: InputState, dt: number) {
    const steer = (input.r ? 1 : 0) - (input.l ? 1 : 0);

    let fx = Math.cos(car.heading);
    let fy = Math.sin(car.heading);
    let vf = car.vx * fx + car.vy * fy;
    const speedAbs = Math.abs(vf);

    if (steer !== 0) {
      const dir = Phaser.Math.Clamp(vf / P.turnSpeedRef, -1, 1);
      const loss = 1 - P.highSpeedTurnLoss * Math.min(speedAbs / P.maxSpeed, 1);
      car.heading += steer * P.turnRate * dir * loss * dt;
      fx = Math.cos(car.heading);
      fy = Math.sin(car.heading);
    }

    // split velocity on the new heading: forward speed + lateral slide
    vf = car.vx * fx + car.vy * fy;
    let lx = car.vx - vf * fx;
    let ly = car.vy - vf * fy;

    const maxForward = car.onTrack ? P.maxSpeed : P.grassMaxSpeed;
    if (input.g && vf < maxForward) vf = Math.min(vf + P.accel * dt, maxForward);
    if (input.b) {
      if (vf > 20) vf -= P.brakeDecel * dt;
      else vf = Math.max(vf - P.reverseAccel * dt, -P.reverseMax);
    }
    vf -= vf * P.drag * dt;
    if (!car.onTrack) vf -= vf * P.grassDrag * dt;

    const grip = car.onTrack ? P.grip : P.grassGrip;
    const keep = Math.max(0, 1 - grip * dt);
    lx *= keep;
    ly *= keep;

    car.vx = fx * vf + lx;
    car.vy = fy * vf + ly;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    const r = CAR.radius;
    if (car.x < r) {
      car.x = r;
      car.vx = -car.vx * P.wallBounce;
    } else if (car.x > WORLD_W - r) {
      car.x = WORLD_W - r;
      car.vx = -car.vx * P.wallBounce;
    }
    if (car.y < r) {
      car.y = r;
      car.vy = -car.vy * P.wallBounce;
    } else if (car.y > WORLD_H - r) {
      car.y = WORLD_H - r;
      car.vy = -car.vy * P.wallBounce;
    }
  }

  private resolveCarCollisions() {
    const minDist = CAR.radius * 2;
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= minDist) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const jImp = (-(1 + P.carBounce) * rvn) / 2;
          a.vx -= jImp * nx;
          a.vy -= jImp * ny;
          b.vx += jImp * nx;
          b.vy += jImp * ny;
        }
      }
    }
  }

  // ---------- progress / laps ----------

  private updateProgress(car: Car, time: number) {
    const near = nearestPoint(this.track, car.x, car.y);
    const hw = this.track.halfWidth;
    car.onTrack = near.dist <= hw + 4;
    if (near.dist > hw * 2) return; // far off the road: progress frozen

    car.frac = fractionAt(this.track, near.idx);
    const target = car.nextCp / CHECKPOINTS;
    let gap = Math.abs(car.frac - target);
    if (gap > 0.5) gap = 1 - gap;
    if (gap > CHECKPOINT_WINDOW) return;

    if (car.nextCp === 0) {
      car.nextCp = 1;
      car.lap += 1;
      if (car.lap > this.bridge.laps) this.finishCar(car, time);
      else this.bridge.onLap(car.def.id, car.lap);
    } else {
      car.nextCp = (car.nextCp + 1) % CHECKPOINTS;
    }
  }

  private finishCar(car: Car, time: number) {
    if (car.finished) return;
    car.finished = true;
    car.finishTimeMs = Math.round(time - this.raceStartedAt);
    car.label.setText(`${car.def.name} 🏁`);
    if (this.firstFinishAt === null) this.firstFinishAt = time;
    this.bridge.onPlayerFinished(car.def.id, car.finishTimeMs);
  }

  /** Race progress used for ranking: laps, checkpoints passed, then distance into the current segment. */
  private score(car: Car): number {
    const passed = car.nextCp === 0 ? CHECKPOINTS - 1 : car.nextCp - 1;
    const segStart = passed / CHECKPOINTS;
    let local = car.frac - segStart;
    local = ((local % 1) + 1) % 1;
    const segLen = 1 / CHECKPOINTS;
    const within = local <= segLen + CHECKPOINT_WINDOW ? Math.min(local, segLen) : 0;
    return car.lap + segStart + within;
  }

  private ordered(): Car[] {
    return this.cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.score(b) - this.score(a);
    });
  }

  private reportStandings(time: number) {
    const order = this.ordered();
    const standings: StandingEntry[] = order.map((c, i) => ({
      id: c.def.id,
      name: c.def.name,
      colorIndex: c.def.colorIndex,
      position: i + 1,
      lap: Math.min(c.lap, this.bridge.laps),
      finished: c.finished,
      finishTimeMs: c.finishTimeMs,
    }));
    this.bridge.onTick({ elapsedMs: Math.round(time - this.raceStartedAt), standings });
    const key = order.map((c) => c.def.id).join("|");
    if (key !== this.lastOrderKey) {
      this.lastOrderKey = key;
      this.bridge.onStandings(order.map((c) => c.def.id));
    }
  }

  private checkRaceEnd(time: number) {
    const allDone = this.cars.every((c) => c.finished);
    const graceOver = this.firstFinishAt !== null && time - this.firstFinishAt > RACE_END_GRACE_MS;
    const timeUp = time - this.raceStartedAt > RACE_MAX_MS;
    if (!allDone && !graceOver && !timeUp) return;
    this.state = "ended";
    const results: RaceResult[] = this.ordered().map((c, i) => ({
      id: c.def.id,
      position: i + 1,
      finishTimeMs: c.finishTimeMs,
    }));
    this.reportStandings(time);
    this.bridge.onRaceEnded(results);
  }

  // ---------- rendering ----------

  private syncSprite(car: Car) {
    car.sprite.setPosition(car.x, car.y).setRotation(car.heading);
    car.shadow.setPosition(car.x + 4, car.y + 4).setRotation(car.heading);
    car.label.setPosition(car.x, car.y + car.labelOffset);
  }
}
