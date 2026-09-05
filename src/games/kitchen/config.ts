/** Logical world size, shared with the racer so the screen scaling code is identical. */
export const WORLD_W = 1600;
export const WORLD_H = 900;

export const TILE = 64;
export const GRID_W = 20;
export const GRID_H = 10;
/** The order bar lives above the kitchen and the recipe panel to its right, so the grid sits low and left. */
export const GRID_X = 40;
export const GRID_Y = 150;

/** Recipe panel, drawn inside the canvas so it lines up with the kitchen at any screen size. */
export const PANEL_X = GRID_X + GRID_W * TILE + 30;
export const PANEL_Y = GRID_Y;
export const PANEL_W = WORLD_W - PANEL_X - 30;
export const PANEL_H = GRID_H * TILE;
export const RECIPE_CARD_H = 106;

export const KITCHEN = {
  shiftMs: 180000,
  countdownMs: 3000,
  goFlashMs: 800,
  chefSpeed: 300,
  chefRadius: 22,
  dashSpeed: 780,
  dashMs: 170,
  dashCooldownMs: 650,
  chopSeconds: 1.3,
  cookSeconds: 6,
  burnSeconds: 7,
  orderFirstMs: 1500,
  orderIntervalStartMs: 20000,
  orderIntervalEndMs: 11000,
  orderTimeMs: 70000,
  maxOrders: 5,
  wrongDishPenalty: 5,
  expiredPenalty: 10,
  timeBonusMax: 10,
  /** score needed for one, two, and three stars */
  stars: [120, 240, 400],
  hudIntervalMs: 150,
  standingsIntervalMs: 1000,
  feedLifeMs: 4000,
} as const;

export const KITCHEN_COLORS = {
  outside: 0x232733,
  floorA: 0xe9e2d3,
  floorB: 0xded6c4,
  counter: 0x8fa3b8,
  counterTop: 0xaabdd0,
  counterEdge: 0x6f8399,
  wood: 0xb5813f,
  woodDark: 0x8d6230,
  board: 0xd7a96a,
  stove: 0x2d2d33,
  stoveRing: 0x5a5a66,
  hatch: 0x3ec46d,
  bin: 0x4a4f5a,
  plate: 0xffffff,
  plateRim: 0xc9ced8,
} as const;
