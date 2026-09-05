/** One entry per player slot. `hex` is used by Phaser, `css` by the UI. */
export interface PlayerColor {
  name: string;
  hex: number;
  css: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { name: "Red", hex: 0xff4d4d, css: "#ff4d4d" },
  { name: "Blue", hex: 0x4d8bff, css: "#4d8bff" },
  { name: "Green", hex: 0x4ddc6a, css: "#4ddc6a" },
  { name: "Yellow", hex: 0xffd93d, css: "#ffd93d" },
  { name: "Purple", hex: 0xb266ff, css: "#b266ff" },
  { name: "Orange", hex: 0xff9a3d, css: "#ff9a3d" },
  { name: "Cyan", hex: 0x3de0ff, css: "#3de0ff" },
  { name: "Pink", hex: 0xff6ad5, css: "#ff6ad5" },
];

export function colorFor(index: number): PlayerColor {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}
