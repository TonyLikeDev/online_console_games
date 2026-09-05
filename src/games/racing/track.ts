import { TRACK_HALF_WIDTH, WORLD_H, WORLD_W } from "./config";

export interface Vec {
  x: number;
  y: number;
}

export interface TrackPoint extends Vec {
  /** unit tangent (direction of travel) */
  tx: number;
  ty: number;
}

export interface Track {
  points: TrackPoint[];
  /** distance along the track to each point; cumulative[0] = 0 */
  cumulative: number[];
  length: number;
  halfWidth: number;
  width: number;
  height: number;
}

/**
 * Control points of the first course, clockwise on screen. The finish line is
 * at the first point, on the left-hand straight heading up.
 */
const WAYPOINTS: Vec[] = [
  { x: 150, y: 450 },
  { x: 230, y: 200 },
  { x: 500, y: 130 },
  { x: 760, y: 220 },
  { x: 900, y: 430 },
  { x: 1100, y: 250 },
  { x: 1380, y: 180 },
  { x: 1470, y: 430 },
  { x: 1350, y: 700 },
  { x: 1050, y: 770 },
  { x: 760, y: 650 },
  { x: 450, y: 770 },
  { x: 200, y: 690 },
];

const SAMPLES_PER_SEGMENT = 50;

function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function buildTrack(waypoints: Vec[] = WAYPOINTS): Track {
  const n = waypoints.length;
  const raw: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = waypoints[(i - 1 + n) % n];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];
    const p3 = waypoints[(i + 2) % n];
    for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) raw.push(catmullRom(p0, p1, p2, p3, s / SAMPLES_PER_SEGMENT));
  }
  const points: TrackPoint[] = raw.map((p, i) => {
    const next = raw[(i + 1) % raw.length];
    const prev = raw[(i - 1 + raw.length) % raw.length];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    return { x: p.x, y: p.y, tx, ty };
  });
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const last = points[points.length - 1];
  const length = cumulative[cumulative.length - 1] + Math.hypot(points[0].x - last.x, points[0].y - last.y);
  return { points, cumulative, length, halfWidth: TRACK_HALF_WIDTH, width: WORLD_W, height: WORLD_H };
}

export interface Nearest {
  idx: number;
  dist: number;
}

/** Brute-force nearest sample point. ~650 points x 8 cars per frame is cheap. */
export function nearestPoint(track: Track, x: number, y: number): Nearest {
  let best = 0;
  let bestD2 = Infinity;
  const pts = track.points;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x;
    const dy = pts[i].y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return { idx: best, dist: Math.sqrt(bestD2) };
}

export function fractionAt(track: Track, idx: number): number {
  return track.cumulative[idx] / track.length;
}

/** Interpolated point at a signed distance along the track (wraps around). */
export function pointAtDistance(track: Track, distance: number): TrackPoint {
  const L = track.length;
  let d = ((distance % L) + L) % L;
  const c = track.cumulative;
  let i = 0;
  // cumulative is sorted, small linear scan is fine (called only for grid placement)
  while (i < c.length - 1 && c[i + 1] <= d) i++;
  const a = track.points[i];
  const b = track.points[(i + 1) % track.points.length];
  const segLen = (i + 1 < c.length ? c[i + 1] : L) - c[i] || 1;
  d = (d - c[i]) / segLen;
  return { x: a.x + (b.x - a.x) * d, y: a.y + (b.y - a.y) * d, tx: a.tx, ty: a.ty };
}

export interface GridSlot extends Vec {
  heading: number;
}

/** Two-column starting grid just behind the finish line. */
export function startingGrid(track: Track, count: number): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let i = 0; i < count; i++) {
    const back = 40 + Math.floor(i / 2) * 48;
    const side = i % 2 === 0 ? -22 : 22;
    const p = pointAtDistance(track, -back);
    const nx = -p.ty;
    const ny = p.tx;
    slots.push({ x: p.x + nx * side, y: p.y + ny * side, heading: Math.atan2(p.ty, p.tx) });
  }
  return slots;
}
