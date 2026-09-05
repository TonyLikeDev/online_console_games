import type { GameBridge } from "@/lib/game-bridge";

export interface KitchenOrderView {
  id: number;
  recipeId: string;
  name: string;
  emoji: string;
  points: number;
  remainingMs: number;
  totalMs: number;
}

export interface KitchenFeedItem {
  id: number;
  text: string;
  good: boolean;
}

export interface KitchenChefView {
  id: string;
  name: string;
  colorIndex: number;
  served: number;
  chopped: number;
}

/** Screen-only overlay data, reported several times a second. */
export interface KitchenHudData {
  phase: "countdown" | "playing" | "ended";
  /** 3, 2, 1 during the countdown, 0 while "GO!" flashes */
  countdown?: number;
  layoutName: string;
  timeLeftMs: number;
  score: number;
  stars: number;
  nextStarAt: number | null;
  orders: KitchenOrderView[];
  feed: KitchenFeedItem[];
  chefs: KitchenChefView[];
}

export type KitchenBridge = GameBridge<KitchenHudData>;
