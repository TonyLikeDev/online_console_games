/** Logical world size. Phaser scales it to fit whatever screen the host has. */
export const WORLD_W = 1600;
export const WORLD_H = 900;

export const TRACK_HALF_WIDTH = 60;

export const CAR = { length: 36, width: 20, radius: 15 } as const;

/** Units are px/s and px/s^2 in world space. */
export const PHYSICS = {
  maxSpeed: 430,
  accel: 480,
  brakeDecel: 760,
  reverseAccel: 220,
  reverseMax: 140,
  /** proportional drag per second */
  drag: 0.9,
  grassMaxSpeed: 170,
  grassDrag: 2.8,
  /** lateral damping: higher = more grip, lower = more slide */
  grip: 7,
  grassGrip: 2.5,
  /** rad/s at reference speed */
  turnRate: 3.4,
  turnSpeedRef: 110,
  /** fraction of turn rate lost at top speed */
  highSpeedTurnLoss: 0.35,
  carBounce: 0.5,
  wallBounce: 0.45,
} as const;

export const COUNTDOWN_MS = 3000;
/** After the winner finishes, everyone else gets this long to cross the line. */
export const RACE_END_GRACE_MS = 20000;
export const RACE_MAX_MS = 4 * 60 * 1000;
/** How often the scene reports standings to React. */
export const STANDINGS_INTERVAL_MS = 150;
