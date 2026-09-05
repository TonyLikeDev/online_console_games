import * as THREE from "three";
import { PALETTE, TUMBLE } from "./config";
import { material, type PhysicsWorld, type Vec3Like } from "./world";

export interface BuiltCourse {
  spawns: Vec3Like[];
  /** respawn points in course order; a runner uses the furthest one behind it */
  checkpoints: Vec3Like[];
  finishZ: number | null;
  killY: number;
  camera: "chase" | "fixed";
  length: number;
}

export interface CourseSpec {
  name: string;
  kind: "race" | "final";
  build(pw: PhysicsWorld, playerCount: number): BuiltCourse;
}

const W = TUMBLE.courseWidth;
const HALF = W / 2;
const WALL_H = 1.6;

class Builder {
  z = 0;
  section = 0;
  readonly checkpoints: Vec3Like[] = [];
  spawns: Vec3Like[] = [];
  finishZ: number | null = null;
  constructor(readonly pw: PhysicsWorld, readonly tileRespawnMs: number | null) {}

  private color(): number {
    return PALETTE.floors[this.section % PALETTE.floors.length];
  }

  floor(z0: number, len: number, opts: { x?: number; width?: number; y?: number; belt?: THREE.Vector3; color?: number } = {}): void {
    const width = opts.width ?? W;
    const y = opts.y ?? 0;
    this.pw.box({ x: opts.x ?? 0, y: y - 0.5, z: z0 - len / 2 }, { x: width, y: 1, z: len }, opts.color ?? this.color(), { belt: opts.belt });
  }

  walls(z0: number, len: number, opts: { y?: number; height?: number } = {}): void {
    const h = opts.height ?? WALL_H;
    const y = (opts.y ?? 0) + h / 2 - 0.5;
    for (const side of [-1, 1]) {
      this.pw.box({ x: side * (HALF + 0.5), y, z: z0 - len / 2 }, { x: 1, y: h + 0.5, z: len }, PALETTE.wall, { castShadow: true });
    }
  }

  checkpoint(z: number, y = 0): void {
    this.checkpoints.push({ x: 0, y, z });
  }

  private next(len: number): number {
    const z0 = this.z;
    this.z -= len;
    this.section += 1;
    return z0;
  }

  start(len = 16): void {
    const z0 = this.next(len);
    this.floor(z0, len);
    this.walls(z0, len);
    this.pw.box({ x: 0, y: 1.5, z: z0 + 0.5 }, { x: W + 2, y: 4, z: 1 }, PALETTE.wall, { castShadow: true });
    this.checkpoint(z0 - 5);
    this.spawns = [];
    for (let i = 0; i < 8; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      this.spawns.push({ x: -6 + col * 4, y: 1.2, z: z0 - 5 - row * 3.5 });
    }
  }

  spinners(len = 30): void {
    const z0 = this.next(len);
    this.floor(z0, len);
    this.walls(z0, len);
    this.checkpoint(z0 - 2);
    const xs = [-4, 4, -4];
    const speeds = [1.7, -2.0, 1.8];
    xs.forEach((x, i) => this.pw.spinner({ x, y: 0, z: z0 - 8 - i * 8 }, 9, speeds[i], i * 1.3));
  }

  hammers(len = 28): void {
    const z0 = this.next(len);
    this.floor(z0, len);
    this.walls(z0, len);
    this.checkpoint(z0 - 2);
    const rows: Array<{ z: number; xs: number[] }> = [
      { z: z0 - 7, xs: [-5, 5] },
      { z: z0 - 15, xs: [0] },
      { z: z0 - 23, xs: [-5, 5] },
    ];
    let phase = 0;
    for (const row of rows) {
      for (const x of row.xs) {
        this.pw.hammer({ x, y: 8, z: row.z }, 5.5, 1.25, 1.6, phase);
        phase += 1.9;
      }
    }
  }

  tiles(len = 24): void {
    const z0 = this.next(len);
    this.walls(z0, len);
    this.floor(z0, 4);
    this.checkpoint(z0 - 2);
    const pitch = 2.45;
    const size = 2.25;
    const cols = 8;
    const rows = Math.floor((len - 6) / pitch);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -((cols - 1) * pitch) / 2 + c * pitch;
        const z = z0 - 4 - pitch / 2 - r * pitch;
        this.pw.dropTile({ x, y: -0.2, z }, size, (r + c) % 2 === 0 ? PALETTE.tileA : PALETTE.tileB, this.tileRespawnMs);
      }
    }
    this.floor(z0 - (len - 2), 2);
  }

  pushers(len = 24): void {
    const z0 = this.next(len);
    this.floor(z0, len);
    this.walls(z0, len, { height: 2.4 });
    this.checkpoint(z0 - 2);
    const speeds = [1.3, -1.5, 1.4];
    for (let i = 0; i < 3; i++) {
      this.pw.pusher({ x: 0, y: 0.9, z: z0 - 6 - i * 6 }, { x: 6, y: 1.8, z: 1.8 }, 6.5, speeds[i], i * 2.1);
    }
  }

  gaps(len = 32): void {
    const z0 = this.next(len);
    this.walls(z0, len);
    this.checkpoint(z0 - 2);
    this.floor(z0, 8);
    this.floor(z0 - 12, 7);
    this.pw.platform({ x: 0, y: -0.3, z: z0 - 21.5 }, { x: 5, y: 0.6, z: 4 }, "x", 6, 1.1, 0);
    this.floor(z0 - 24, 8);
  }

  conveyors(len = 24): void {
    const z0 = this.next(len);
    this.walls(z0, len);
    this.checkpoint(z0 - 2);
    this.floor(z0, 3);
    this.floor(z0 - 3, 6, { belt: new THREE.Vector3(4.5, 0, 0) });
    this.floor(z0 - 9, 1.5);
    this.floor(z0 - 10.5, 6, { belt: new THREE.Vector3(-4.5, 0, 0) });
    this.floor(z0 - 16.5, 1.5);
    this.floor(z0 - 18, 6, { belt: new THREE.Vector3(0, 0, 3.5) });
  }

  finish(len = 26): void {
    const z0 = this.next(len);
    this.checkpoint(z0 - 1);
    // downhill ramp: drops 3 units over 10
    const drop = 3;
    const rampLen = 10;
    const a = -Math.atan2(drop, rampLen);
    const hyp = Math.hypot(drop, rampLen) + 0.6;
    this.pw.box(
      { x: 0, y: -drop / 2 - 0.5 * Math.cos(a), z: z0 - rampLen / 2 + 0.5 * Math.sin(a) },
      { x: W, y: 1, z: hyp },
      this.color(),
      { rotX: a },
    );
    this.floor(z0 - rampLen, len - rampLen, { y: -drop });
    this.walls(z0, len, { y: -drop, height: WALL_H + drop });
    this.finishZ = z0 - rampLen - 5;
    this.pw.finishLine(this.finishZ, W);
    // back wall
    this.pw.box({ x: 0, y: -drop + 1.5, z: z0 - len - 0.5 }, { x: W + 2, y: 4, z: 1 }, PALETTE.wall, { castShadow: true });
    // two banners so the finish reads from far away
    for (const side of [-1, 1]) {
      this.pw.box({ x: side * (HALF + 0.5), y: -drop + 4.5, z: this.finishZ }, { x: 1, y: 6, z: 0.8 }, PALETTE.bar, { castShadow: true });
    }
    this.pw.box({ x: 0, y: -drop + 7.6, z: this.finishZ }, { x: W + 2, y: 0.8, z: 0.8 }, PALETTE.bar, { castShadow: true });
  }

  done(camera: BuiltCourse["camera"], killY: number): BuiltCourse {
    return { spawns: this.spawns, checkpoints: this.checkpoints, finishZ: this.finishZ, killY, camera, length: -this.z };
  }
}

const RACE_TILE_RESPAWN_MS = 3500;

export const GATE_CRASH: CourseSpec = {
  name: "Gate Crash",
  kind: "race",
  build(pw) {
    const b = new Builder(pw, RACE_TILE_RESPAWN_MS);
    b.start();
    b.spinners();
    b.gaps();
    b.hammers();
    b.finish();
    return b.done("chase", TUMBLE.killY);
  },
};

export const TILE_TROUBLE: CourseSpec = {
  name: "Tile Trouble",
  kind: "race",
  build(pw) {
    const b = new Builder(pw, RACE_TILE_RESPAWN_MS);
    b.start();
    b.tiles();
    b.pushers();
    b.conveyors();
    b.spinners();
    b.finish();
    return b.done("chase", TUMBLE.killY);
  },
};

/** Three stacked floors of vanishing tiles. Last one standing wins. */
export const HEX_HAVOC: CourseSpec = {
  name: "Hex Havoc",
  kind: "final",
  build(pw, playerCount) {
    const layers = [0, -8, -16];
    const pitch = 2.6;
    const size = 2.4;
    const n = 15;
    layers.forEach((y, li) => {
      const shift = li % 2 === 0 ? 0 : pitch / 2;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x = -((n - 1) * pitch) / 2 + c * pitch + shift;
          const z = -((n - 1) * pitch) / 2 + r * pitch + shift;
          const color = (r + c + li) % 2 === 0 ? PALETTE.tileA : PALETTE.tileB;
          pw.dropTile({ x, y, z }, size, color, null);
        }
      }
    });
    // slime pool far below, purely decorative
    const slime = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), material(0xff7ab8));
    slime.rotation.x = -Math.PI / 2;
    slime.position.y = -25;
    pw.addMesh(slime);

    const spawns: Vec3Like[] = [];
    const count = Math.max(playerCount, 1);
    for (let i = 0; i < Math.max(count, 8); i++) {
      const angle = (i / 8) * Math.PI * 2;
      spawns.push({ x: Math.cos(angle) * 10, y: 1.4, z: Math.sin(angle) * 10 });
    }
    return { spawns, checkpoints: [], finishZ: null, killY: TUMBLE.final.killY, camera: "fixed", length: n * pitch };
  },
};

export const SHOW: CourseSpec[] = [GATE_CRASH, TILE_TROUBLE, HEX_HAVOC];
