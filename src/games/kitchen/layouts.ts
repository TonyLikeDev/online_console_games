import { GRID_H, GRID_W } from "./config";
import type { IngredientType } from "./items";

export type TileKind = "floor" | "counter" | "crate" | "board" | "stove" | "plates" | "hatch" | "bin";

export interface TileDef {
  gx: number;
  gy: number;
  kind: TileKind;
  crate: IngredientType | null;
  /** spawn order for chefs, 1-based, on floor tiles only */
  spawn: number | null;
}

export interface LayoutSpec {
  name: string;
  /** shown on the phones */
  title: string;
  /** kitchens that force hand-offs need at least this many chefs */
  minPlayers: number;
  rows: string[];
}

/**
 * Map legend:
 *   .  floor          C  counter        K  chopping board   S  stove
 *   T  tomato crate   L  lettuce crate  O  onion crate      B  bun crate
 *   P  patty crate    D  plate stack    H  serving hatch    X  bin
 *   1-8 floor tile where the n-th chef starts
 */
const LEGEND: Record<string, { kind: TileKind; crate?: IngredientType }> = {
  ".": { kind: "floor" },
  C: { kind: "counter" },
  K: { kind: "board" },
  S: { kind: "stove" },
  T: { kind: "crate", crate: "tomato" },
  L: { kind: "crate", crate: "lettuce" },
  O: { kind: "crate", crate: "onion" },
  B: { kind: "crate", crate: "bread" },
  P: { kind: "crate", crate: "patty" },
  D: { kind: "plates" },
  H: { kind: "hatch" },
  X: { kind: "bin" },
};

export const DINER: LayoutSpec = {
  name: "Diner",
  title: "Shift at the Diner",
  minPlayers: 1,
  rows: [
    "CTLOCCCCCCCCCCCCCHHC",
    "C1......2.........XC",
    "B..................C",
    "P.....CKKSSC.......C",
    "C.....CCCCCC.......C",
    "D.....CKKSSC.......C",
    "C..................C",
    "C3.....4....5....6.C",
    "C..7.........8.....C",
    "CCCCCCCCCCCCCCCCCCCC",
  ],
};

/** A counter splits the kitchen: ingredients on the left, stoves and the hatch on the right. */
export const SPLIT: LayoutSpec = {
  name: "Split Kitchen",
  title: "Shift at the Split Kitchen",
  minPlayers: 2,
  rows: [
    "CTLOCCCCCCCCCCCCCHHC",
    "C1......C.........XC",
    "B.......C....3.....C",
    "P.......K.....SS...C",
    "C.......C.....SS...C",
    "D.......K..........C",
    "C.......C....5.....C",
    "C.2.....C..........C",
    "C....4..C..7....6..C",
    "CCCCCCCCCCCCCCCCCCCC",
  ],
};

export const LAYOUTS: LayoutSpec[] = [DINER, SPLIT];

export interface ParsedLayout {
  tiles: TileDef[][];
  /** chef start tiles in spawn order */
  spawns: Array<{ gx: number; gy: number }>;
}

export function parseLayout(spec: LayoutSpec): ParsedLayout {
  if (spec.rows.length !== GRID_H || spec.rows.some((r) => r.length !== GRID_W)) {
    throw new Error(`Layout ${spec.name} must be ${GRID_W}x${GRID_H}`);
  }
  const tiles: TileDef[][] = [];
  const spawnList: Array<{ n: number; gx: number; gy: number }> = [];
  spec.rows.forEach((row, gy) => {
    const line: TileDef[] = [];
    [...row].forEach((ch, gx) => {
      const digit = /[1-8]/.test(ch) ? Number(ch) : null;
      const legend = digit ? LEGEND["."] : LEGEND[ch];
      if (!legend) throw new Error(`Unknown tile '${ch}' in ${spec.name}`);
      line.push({ gx, gy, kind: legend.kind, crate: legend.crate ?? null, spawn: digit });
      if (digit) spawnList.push({ n: digit, gx, gy });
    });
    tiles.push(line);
  });
  spawnList.sort((a, b) => a.n - b.n);
  return { tiles, spawns: spawnList.map(({ gx, gy }) => ({ gx, gy })) };
}

export function isSolid(kind: TileKind): boolean {
  return kind !== "floor";
}
