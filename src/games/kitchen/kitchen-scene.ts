import Phaser from "phaser";
import { colorFor } from "@/lib/colors";
import type { GamePlayer, GameResult } from "@/lib/game-bridge";
import { GRID_H, GRID_W, GRID_X, GRID_Y, KITCHEN, KITCHEN_COLORS as K, PANEL_H, PANEL_W, PANEL_X, PANEL_Y, RECIPE_CARD_H, TILE } from "./config";
import {
  INGREDIENTS,
  RECIPES,
  canChop,
  canCook,
  isPlateable,
  itemKey,
  makeIngredient,
  makePlate,
  matchRecipe,
  pickRecipe,
  tryMerge,
  type Ingredient,
  type IngredientState,
  type IngredientType,
  type Item,
  type Plate,
  type Recipe,
} from "./items";
import { isSolid, LAYOUTS, parseLayout, type LayoutSpec, type TileDef } from "./layouts";
import type { KitchenBridge, KitchenFeedItem, KitchenHudData } from "./types";

interface Tile extends TileDef {
  item: Item | null;
  sprite: Phaser.GameObjects.Image | null;
  /** who put the current item on a stove, for the stats */
  cookBy: string | null;
}

interface Chef {
  def: GamePlayer;
  x: number;
  y: number;
  facing: { x: number; y: number };
  moveDir: { x: number; y: number };
  held: Item | null;
  heldKey: string;
  container: Phaser.GameObjects.Container;
  eyes: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  heldSprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  prevA: boolean;
  prevB: boolean;
  dashUntil: number;
  dashReadyAt: number;
  dashDir: { x: number; y: number };
  chopping: boolean;
  stats: { served: number; chopped: number; cooked: number; plated: number };
}

interface Order {
  id: number;
  recipe: Recipe;
  createdAt: number;
  expiresAt: number;
}

type Phase = "countdown" | "playing" | "ended";

const ITEM_TEX = 48;
const HALF_BOX = KITCHEN.chefRadius - 2;
/** every new show gets the next kitchen */
let nextLayout = 0;

function drawPlateShape(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number) {
  g.fillStyle(K.plateRim, 1);
  g.fillCircle(cx, cy, r);
  g.fillStyle(K.plate, 1);
  g.fillCircle(cx, cy, r - 3);
}

function drawIngredient(g: Phaser.GameObjects.Graphics, type: IngredientType, state: IngredientState, cx: number, cy: number, s: number) {
  switch (type) {
    case "tomato":
      if (state === "raw") {
        g.fillStyle(0xe5383b, 1);
        g.fillCircle(cx, cy + 2 * s, 15 * s);
        g.fillStyle(0x3fa34d, 1);
        g.fillTriangle(cx - 7 * s, cy - 12 * s, cx + 7 * s, cy - 12 * s, cx, cy - 3 * s);
      } else {
        for (const [dx, dy] of [
          [-10, -6],
          [8, -4],
          [-2, 8],
        ]) {
          g.fillStyle(0xe5383b, 1);
          g.fillCircle(cx + dx * s, cy + dy * s, 8 * s);
          g.fillStyle(0xffb3b3, 1);
          g.fillCircle(cx + dx * s, cy + dy * s, 3.5 * s);
        }
      }
      break;
    case "lettuce":
      if (state === "raw") {
        g.fillStyle(0x57c25b, 1);
        g.fillCircle(cx, cy, 16 * s);
        g.fillStyle(0x8fe08a, 1);
        g.fillCircle(cx - 4 * s, cy - 4 * s, 7 * s);
      } else {
        g.fillStyle(0x57c25b, 1);
        for (const [dx, dy] of [
          [-9, -8],
          [7, -7],
          [-6, 7],
          [8, 8],
        ]) {
          g.fillRoundedRect(cx + dx * s - 6 * s, cy + dy * s - 6 * s, 12 * s, 12 * s, 3 * s);
        }
      }
      break;
    case "onion":
      if (state === "raw") {
        g.fillStyle(0xf2e6d8, 1);
        g.fillCircle(cx, cy + 1 * s, 15 * s);
        g.fillStyle(0xb98cc9, 1);
        g.fillRect(cx - 2 * s, cy - 17 * s, 4 * s, 7 * s);
        g.lineStyle(2 * s, 0xd9c2e3, 1);
        g.strokeCircle(cx, cy + 1 * s, 9 * s);
      } else if (state === "chopped") {
        g.lineStyle(3 * s, 0xf2e6d8, 1);
        g.strokeCircle(cx - 7 * s, cy - 3 * s, 8 * s);
        g.strokeCircle(cx + 7 * s, cy + 5 * s, 7 * s);
        g.lineStyle(2 * s, 0xb98cc9, 1);
        g.strokeCircle(cx - 7 * s, cy - 3 * s, 4 * s);
      } else {
        g.fillStyle(0xd9d9e3, 1);
        g.fillEllipse(cx, cy + 4 * s, 36 * s, 22 * s);
        g.fillStyle(state === "burnt" ? 0x2b2b2b : 0xf2a23a, 1);
        g.fillEllipse(cx, cy, 30 * s, 14 * s);
        if (state === "cooked") {
          g.fillStyle(0xffd28a, 1);
          g.fillEllipse(cx - 5 * s, cy - 2 * s, 9 * s, 4 * s);
        }
      }
      break;
    case "bread":
      g.fillStyle(0xd9a45b, 1);
      g.fillRoundedRect(cx - 16 * s, cy - 9 * s, 32 * s, 18 * s, 8 * s);
      g.fillStyle(0xf0c986, 1);
      g.fillRoundedRect(cx - 14 * s, cy - 8 * s, 28 * s, 8 * s, 6 * s);
      g.fillStyle(0xfff1c9, 1);
      g.fillCircle(cx - 6 * s, cy - 4 * s, 1.6 * s);
      g.fillCircle(cx + 1 * s, cy - 5 * s, 1.6 * s);
      g.fillCircle(cx + 7 * s, cy - 3 * s, 1.6 * s);
      break;
    case "patty": {
      const color = state === "raw" ? 0xe38c9d : state === "burnt" ? 0x1f1a17 : 0x7a4a2b;
      g.fillStyle(color, 1);
      g.fillEllipse(cx, cy, 32 * s, 22 * s);
      if (state === "cooked") {
        g.fillStyle(0x5c3520, 1);
        g.fillEllipse(cx, cy + 3 * s, 26 * s, 12 * s);
      }
      break;
    }
  }
}

/** One shift in a kitchen: chefs, stations, orders, score. */
export class KitchenScene extends Phaser.Scene {
  private bridge!: KitchenBridge;
  private layout!: LayoutSpec;
  private tiles: Tile[][] = [];
  private chefs: Chef[] = [];
  private orders: Order[] = [];
  private feed: Array<KitchenFeedItem & { at: number }> = [];
  private phase: Phase = "countdown";
  /** simulation clock in seconds (Phaser already owns `this.time`) */
  private simTime = 0;
  private phaseStartedAt = 0;
  private shiftStartedAt = 0;
  private score = 0;
  private nextOrderAt = 0;
  private orderSeq = 0;
  private feedSeq = 0;
  private fx!: Phaser.GameObjects.Graphics;
  private chefStatTexts: Phaser.GameObjects.Text[] = [];
  private lastHudAt = 0;
  private lastStandingsAt = 0;
  private lastOrderKey = "";

  constructor() {
    super("kitchen");
  }

  init(data: { bridge: KitchenBridge; layoutIndex?: number }) {
    this.bridge = data.bridge;
    const eligible = LAYOUTS.filter((l) => data.bridge.players.length >= l.minPlayers);
    const index = data.layoutIndex ?? nextLayout++;
    this.layout = eligible[index % eligible.length] ?? LAYOUTS[0];
  }

  create() {
    this.cameras.main.setBackgroundColor(K.outside);
    this.makeTextures();
    this.buildKitchen();
    this.spawnChefs(this.bridge.players);
    this.drawRecipePanel();
    this.fx = this.add.graphics().setDepth(40);
    this.phase = "countdown";
    this.phaseStartedAt = this.simTime;
    this.bridge.onStage({ index: 1, count: 1, name: this.layout.title });
  }

  update(_: number, delta: number) {
    const dt = Math.min(delta / 1000, 1 / 30);
    this.simTime += dt;

    if (this.phase === "countdown" && this.simTime - this.phaseStartedAt >= KITCHEN.countdownMs / 1000) {
      this.phase = "playing";
      this.shiftStartedAt = this.simTime;
      this.nextOrderAt = this.simTime + KITCHEN.orderFirstMs / 1000;
      this.bridge.onStarted();
    }

    if (this.phase === "playing") {
      for (const chef of this.chefs) this.updateChef(chef, dt);
      this.separateChefs();
      this.updateStations(dt);
      this.updateOrders();
      if (this.simTime - this.shiftStartedAt >= KITCHEN.shiftMs / 1000) this.endShift();
    }

    for (const chef of this.chefs) this.syncChef(chef);
    this.drawFx();

    if (this.simTime - this.lastHudAt >= KITCHEN.hudIntervalMs / 1000) {
      this.lastHudAt = this.simTime;
      this.refreshChefStats();
      this.bridge.onHud(this.hud());
    }
    if (this.phase === "playing" && this.simTime - this.lastStandingsAt >= KITCHEN.standingsIntervalMs / 1000) {
      this.lastStandingsAt = this.simTime;
      this.reportStandings();
    }
  }

  // ---------- setup ----------

  private makeTextures() {
    const g = this.add.graphics();
    const tex = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      g.clear();
      draw(g);
      g.generateTexture(key, w, h);
    };
    const counterBase = (g: Phaser.GameObjects.Graphics) => {
      g.fillStyle(K.counterEdge, 1);
      g.fillRect(0, 0, TILE, TILE);
      g.fillStyle(K.counter, 1);
      g.fillRect(3, 3, TILE - 6, TILE - 6);
      g.fillStyle(K.counterTop, 1);
      g.fillRect(3, 3, TILE - 6, 10);
    };
    tex("floorA", TILE, TILE, (g) => {
      g.fillStyle(K.floorA, 1);
      g.fillRect(0, 0, TILE, TILE);
    });
    tex("floorB", TILE, TILE, (g) => {
      g.fillStyle(K.floorB, 1);
      g.fillRect(0, 0, TILE, TILE);
    });
    tex("counter", TILE, TILE, counterBase);
    for (const type of ["tomato", "lettuce", "onion", "bread", "patty"] as IngredientType[]) {
      tex(`crate:${type}`, TILE, TILE, (g) => {
        counterBase(g);
        g.fillStyle(K.woodDark, 1);
        g.fillRoundedRect(10, 14, 52, 50, 6);
        g.fillStyle(K.wood, 1);
        g.fillRoundedRect(14, 18, 44, 42, 5);
        drawIngredient(g, type, "raw", 36, 40, 0.75);
      });
    }
    tex("board", TILE, TILE, (g) => {
      counterBase(g);
      g.fillStyle(K.woodDark, 1);
      g.fillRoundedRect(8, 18, 56, 40, 6);
      g.fillStyle(K.board, 1);
      g.fillRoundedRect(11, 21, 50, 34, 5);
    });
    tex("stove", TILE, TILE, (g) => {
      counterBase(g);
      g.fillStyle(K.stove, 1);
      g.fillCircle(36, 38, 26);
      g.lineStyle(4, K.stoveRing, 1);
      g.strokeCircle(36, 38, 18);
      g.strokeCircle(36, 38, 9);
    });
    tex("plates", TILE, TILE, (g) => {
      counterBase(g);
      for (let i = 0; i < 3; i++) drawPlateShape(g, 36, 48 - i * 5, 20);
    });
    tex("hatch", TILE, TILE, (g) => {
      counterBase(g);
      g.fillStyle(K.hatch, 1);
      g.fillRoundedRect(8, 14, 56, 46, 8);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(26, 24, 26, 50, 50, 37);
    });
    tex("bin", TILE, TILE, (g) => {
      counterBase(g);
      g.fillStyle(K.bin, 1);
      g.fillRoundedRect(20, 22, 32, 38, 4);
      g.fillRect(16, 18, 40, 6);
    });
    tex("chef", 48, 48, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(24, 24, 22);
    });
    tex("hat", 40, 26, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(4, 12, 32, 12, 5);
      g.fillCircle(12, 11, 8);
      g.fillCircle(20, 9, 9);
      g.fillCircle(28, 11, 8);
    });
    tex("eye", 8, 8, (g) => {
      g.fillStyle(0x1b1b22, 1);
      g.fillCircle(4, 4, 4);
    });
    tex("shadow", 56, 24, (g) => {
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(28, 12, 52, 20);
    });
    g.destroy();
  }

  /** Texture for an item, generated the first time that look is needed. */
  private itemTexture(item: Item): string {
    const key = itemKey(item);
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics();
    const c = ITEM_TEX / 2;
    if (item.kind === "ingredient") {
      drawIngredient(g, item.type, item.state, c, c, 1);
    } else {
      drawPlateShape(g, c, c, 21);
      const n = item.contents.length;
      const spots: number[][] = n <= 1 ? [[0, 0]] : n === 2 ? [[-7, 0], [7, 0]] : n === 3 ? [[-8, -4], [8, -4], [0, 7]] : [[-8, -7], [8, -7], [-8, 7], [8, 7]];
      item.contents.forEach((ing, i) => drawIngredient(g, ing.type, ing.state, c + spots[i][0], c + spots[i][1], 0.45));
    }
    g.generateTexture(key, ITEM_TEX, ITEM_TEX);
    g.destroy();
    return key;
  }

  private buildKitchen() {
    const parsed = parseLayout(this.layout);
    this.tiles = parsed.tiles.map((row) => row.map((t) => ({ ...t, item: null, sprite: null, cookBy: null })));
    for (const row of this.tiles) {
      for (const t of row) {
        const cx = GRID_X + t.gx * TILE + TILE / 2;
        const cy = GRID_Y + t.gy * TILE + TILE / 2;
        let key: string;
        switch (t.kind) {
          case "floor":
            key = (t.gx + t.gy) % 2 === 0 ? "floorA" : "floorB";
            break;
          case "crate":
            key = `crate:${t.crate}`;
            break;
          default:
            key = t.kind;
        }
        this.add.image(cx, cy, key).setDisplaySize(TILE, TILE).setDepth(0);
      }
    }
  }

  /** Recipe cards and per-chef stats, in the column to the right of the kitchen. */
  private drawRecipePanel() {
    const font = "system-ui, sans-serif";
    const muted = "#9aa1b8";
    const g = this.add.graphics().setDepth(5);
    g.fillStyle(0x151a29, 0.92);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 16);
    this.add
      .text(PANEL_X + 16, PANEL_Y + 14, "RECIPES", { fontFamily: font, fontSize: "15px", fontStyle: "800", color: "#ffd93d" })
      .setLetterSpacing(3)
      .setDepth(6);

    let y = PANEL_Y + 44;
    const icon = 42;
    const gap = 14;
    for (const recipe of RECIPES) {
      g.fillStyle(0x0b0d14, 0.7);
      g.fillRoundedRect(PANEL_X + 10, y, PANEL_W - 20, RECIPE_CARD_H, 12);
      this.add
        .text(PANEL_X + 20, y + 10, `${recipe.emoji} ${recipe.name}`, { fontFamily: font, fontSize: "17px", fontStyle: "700", color: "#f4f4f8" })
        .setDepth(6);
      this.add
        .text(PANEL_X + PANEL_W - 20, y + 13, `${recipe.points} pts`, { fontFamily: font, fontSize: "12px", color: muted })
        .setOrigin(1, 0)
        .setDepth(6);
      let x = PANEL_X + 22;
      recipe.needs.forEach((need, i) => {
        const [type, state] = need.split(":") as [IngredientType, IngredientState];
        const tex = this.itemTexture({ kind: "ingredient", type, state, progress: 0 });
        this.add.image(x + icon / 2, y + 60, tex).setDisplaySize(icon, icon).setDepth(6);
        const step = state === "chopped" ? "chop" : state === "cooked" ? (INGREDIENTS[type].choppable ? "chop · cook" : "cook") : "as is";
        this.add.text(x + icon / 2, y + 85, step, { fontFamily: font, fontSize: "11px", color: muted }).setOrigin(0.5, 0).setDepth(6);
        if (i < recipe.needs.length - 1) {
          this.add
            .text(x + icon + gap / 2, y + 60, "+", { fontFamily: font, fontSize: "18px", fontStyle: "700", color: muted })
            .setOrigin(0.5)
            .setDepth(6);
        }
        x += icon + gap;
      });
      y += RECIPE_CARD_H + 10;
    }
    this.add
      .text(PANEL_X + 16, y + 2, "Plate it with GRAB, then serve at the green hatch.", {
        fontFamily: font,
        fontSize: "12px",
        color: muted,
        wordWrap: { width: PANEL_W - 32 },
      })
      .setDepth(6);

    const statsY = y + 44;
    this.add
      .text(PANEL_X + PANEL_W - 16, statsY, "served · chopped", { fontFamily: font, fontSize: "11px", color: muted })
      .setOrigin(1, 0)
      .setDepth(6);
    this.chefStatTexts = this.chefs.map((chef, i) => {
      const rowY = statsY + 20 + i * 20;
      const color = colorFor(chef.def.colorIndex).css;
      const name = chef.def.name.length > 11 ? `${chef.def.name.slice(0, 10)}…` : chef.def.name;
      this.add.text(PANEL_X + 16, rowY, `● ${name}`, { fontFamily: font, fontSize: "13px", fontStyle: "700", color }).setDepth(6);
      return this.add
        .text(PANEL_X + PANEL_W - 16, rowY + 1, "0 · 0", { fontFamily: font, fontSize: "13px", color: "#f4f4f8" })
        .setOrigin(1, 0)
        .setDepth(6);
    });
  }

  private refreshChefStats() {
    this.chefs.forEach((chef, i) => {
      const text = this.chefStatTexts[i];
      if (!text) return;
      const next = `${chef.stats.served} · ${chef.stats.chopped}`;
      if (text.text !== next) text.setText(next);
    });
  }

  private spawnChefs(players: GamePlayer[]) {
    const { spawns } = parseLayout(this.layout);
    this.chefs = players.map((def, i) => {
      const s = spawns[i % spawns.length];
      const x = GRID_X + s.gx * TILE + TILE / 2 + (i >= spawns.length ? 10 : 0);
      const y = GRID_Y + s.gy * TILE + TILE / 2;
      const color = colorFor(def.colorIndex);
      const shadow = this.add.image(0, 20, "shadow");
      const body = this.add.image(0, 0, "chef").setTint(color.hex);
      const hat = this.add.image(0, -20, "hat");
      const eyeL = this.add.image(-6, -4, "eye");
      const eyeR = this.add.image(6, -4, "eye");
      const heldSprite = this.add.image(0, -42, "chef").setVisible(false).setScale(0.8);
      const container = this.add.container(x, y, [shadow, body, hat, eyeL, eyeR, heldSprite]).setDepth(20);
      const label = this.add
        .text(x, y - 54, def.name, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
          fontStyle: "700",
          color: color.css,
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(30);
      return {
        def,
        x,
        y,
        facing: { x: 0, y: -1 },
        moveDir: { x: 0, y: 0 },
        held: null,
        heldKey: "",
        container,
        eyes: [eyeL, eyeR],
        heldSprite,
        label,
        prevA: false,
        prevB: false,
        dashUntil: -10,
        dashReadyAt: 0,
        dashDir: { x: 0, y: -1 },
        chopping: false,
        stats: { served: 0, chopped: 0, cooked: 0, plated: 0 },
      };
    });
  }

  // ---------- chefs ----------

  private tileAtWorld(px: number, py: number): Tile | null {
    const gx = Math.floor((px - GRID_X) / TILE);
    const gy = Math.floor((py - GRID_Y) / TILE);
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return null;
    return this.tiles[gy][gx];
  }

  private solidAt(px: number, py: number): boolean {
    const t = this.tileAtWorld(px, py);
    return !t || isSolid(t.kind);
  }

  private blocked(cx: number, cy: number): boolean {
    const h = HALF_BOX;
    return this.solidAt(cx - h, cy - h) || this.solidAt(cx + h, cy - h) || this.solidAt(cx - h, cy + h) || this.solidAt(cx + h, cy + h);
  }

  private targetTile(chef: Chef): Tile | null {
    const t = this.tileAtWorld(chef.x + chef.facing.x * 44, chef.y + chef.facing.y * 44);
    return t && t.kind !== "floor" ? t : null;
  }

  private updateChef(chef: Chef, dt: number) {
    const input = this.bridge.inputs.get(chef.def.id);
    let dx = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    let dy = (input.d ? 1 : 0) - (input.u ? 1 : 0);
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
      chef.facing = Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    }
    chef.moveDir = { x: dx, y: dy };
    const target = this.targetTile(chef);

    // B: chop while held at a board, otherwise a dash on press
    const bPressed = input.b && !chef.prevB;
    chef.prevB = input.b;
    chef.chopping = false;
    const boardItem: Ingredient | null = target?.kind === "board" && target.item?.kind === "ingredient" ? target.item : null;
    if (input.b && target && boardItem && canChop(boardItem)) {
      chef.chopping = true;
      boardItem.progress += dt / KITCHEN.chopSeconds;
      if (boardItem.progress >= 1) {
        boardItem.state = "chopped";
        boardItem.progress = 0;
        chef.stats.chopped += 1;
        this.refreshTile(target);
      }
    } else if (bPressed && this.simTime >= chef.dashReadyAt) {
      chef.dashUntil = this.simTime + KITCHEN.dashMs / 1000;
      chef.dashReadyAt = this.simTime + KITCHEN.dashCooldownMs / 1000;
      chef.dashDir = len > 0 ? { x: dx, y: dy } : { ...chef.facing };
    }

    // A: interact with whatever is in front
    const aPressed = input.a && !chef.prevA;
    chef.prevA = input.a;
    if (aPressed && target) this.interact(chef, target);

    let speed: number = KITCHEN.chefSpeed;
    let mx = dx;
    let my = dy;
    if (this.simTime < chef.dashUntil) {
      speed = KITCHEN.dashSpeed;
      mx = chef.dashDir.x;
      my = chef.dashDir.y;
    }
    if (chef.chopping) speed = 0;
    this.moveChef(chef, mx * speed * dt, my * speed * dt);
  }

  private moveChef(chef: Chef, ddx: number, ddy: number) {
    const h = HALF_BOX;
    if (ddx !== 0) {
      let nx = chef.x + ddx;
      if (this.blocked(nx, chef.y)) {
        if (ddx > 0) {
          const gx = Math.floor((nx + h - GRID_X) / TILE);
          nx = GRID_X + gx * TILE - h - 0.01;
        } else {
          const gx = Math.floor((nx - h - GRID_X) / TILE);
          nx = GRID_X + (gx + 1) * TILE + h + 0.01;
        }
        if (this.blocked(nx, chef.y)) nx = chef.x;
      }
      chef.x = nx;
    }
    if (ddy !== 0) {
      let ny = chef.y + ddy;
      if (this.blocked(chef.x, ny)) {
        if (ddy > 0) {
          const gy = Math.floor((ny + h - GRID_Y) / TILE);
          ny = GRID_Y + gy * TILE - h - 0.01;
        } else {
          const gy = Math.floor((ny - h - GRID_Y) / TILE);
          ny = GRID_Y + (gy + 1) * TILE + h + 0.01;
        }
        if (this.blocked(chef.x, ny)) ny = chef.y;
      }
      chef.y = ny;
    }
  }

  private separateChefs() {
    const minDist = KITCHEN.chefRadius * 2;
    for (let i = 0; i < this.chefs.length; i++) {
      for (let j = i + 1; j < this.chefs.length; j++) {
        const a = this.chefs[i];
        const b = this.chefs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0 || dist >= minDist) continue;
        const push = (minDist - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const ax = a.x - nx * push;
        const ay = a.y - ny * push;
        const bx = b.x + nx * push;
        const by = b.y + ny * push;
        if (!this.blocked(ax, ay)) {
          a.x = ax;
          a.y = ay;
        }
        if (!this.blocked(bx, by)) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  private interact(chef: Chef, tile: Tile) {
    const held = chef.held;
    switch (tile.kind) {
      case "crate": {
        if (!tile.crate) return;
        if (!held) {
          chef.held = makeIngredient(tile.crate);
        } else if (held.kind === "plate") {
          const merged = tryMerge(held, makeIngredient(tile.crate));
          if (merged) {
            chef.held = merged;
            chef.stats.plated += 1;
          }
        }
        return;
      }
      case "plates": {
        if (!held) chef.held = makePlate();
        else if (held.kind === "ingredient" && isPlateable(held)) {
          chef.held = makePlate([held]);
          chef.stats.plated += 1;
        }
        return;
      }
      case "bin": {
        if (held) {
          chef.held = null;
          this.pushFeed("Binned", false);
        }
        return;
      }
      case "hatch": {
        if (held?.kind === "plate") {
          this.serve(chef, held);
          chef.held = null;
        }
        return;
      }
      case "counter":
      case "board":
      case "stove": {
        if (!held && tile.item) {
          chef.held = tile.item;
          tile.item = null;
          tile.cookBy = null;
          this.refreshTile(tile);
        } else if (held && !tile.item) {
          if (this.accepts(tile, held)) {
            tile.item = held;
            chef.held = null;
            if (tile.kind === "stove" && held.kind === "ingredient") {
              held.progress = 0;
              tile.cookBy = chef.def.id;
            }
            this.refreshTile(tile);
          }
        } else if (held && tile.item) {
          const merged = tryMerge(held, tile.item);
          if (!merged) return;
          chef.stats.plated += 1;
          if (held.kind === "plate") {
            chef.held = merged;
            tile.item = null;
          } else {
            tile.item = merged;
            chef.held = null;
          }
          this.refreshTile(tile);
        }
        return;
      }
      default:
        return;
    }
  }

  private accepts(tile: Tile, item: Item): boolean {
    switch (tile.kind) {
      case "counter":
        return true;
      case "board":
        return item.kind === "ingredient";
      case "stove":
        return canCook(item);
      default:
        return false;
    }
  }

  private serve(chef: Chef, plate: Plate) {
    const recipe = matchRecipe(plate);
    const order = recipe ? this.orders.find((o) => o.recipe.id === recipe.id) : undefined;
    if (!recipe || !order) {
      this.score = Math.max(0, this.score - KITCHEN.wrongDishPenalty);
      this.pushFeed(`Nobody ordered that −${KITCHEN.wrongDishPenalty}`, false);
      return;
    }
    const remaining = Math.max(0, order.expiresAt - this.simTime);
    const bonus = Math.round((KITCHEN.timeBonusMax * remaining) / (KITCHEN.orderTimeMs / 1000));
    const gained = recipe.points + bonus;
    this.score += gained;
    this.orders = this.orders.filter((o) => o !== order);
    chef.stats.served += 1;
    this.pushFeed(`${recipe.emoji} ${recipe.name} +${gained} by ${chef.def.name}`, true);
  }

  // ---------- stations & orders ----------

  private updateStations(dt: number) {
    for (const row of this.tiles) {
      for (const tile of row) {
        if (tile.kind !== "stove" || !tile.item || tile.item.kind !== "ingredient") continue;
        const item = tile.item;
        if (canCook(item)) {
          item.progress += dt / KITCHEN.cookSeconds;
          if (item.progress >= 1) {
            item.state = "cooked";
            item.progress = 0;
            const cook = this.chefs.find((c) => c.def.id === tile.cookBy);
            if (cook) cook.stats.cooked += 1;
            this.refreshTile(tile);
          }
        } else if (item.state === "cooked") {
          item.progress += dt / KITCHEN.burnSeconds;
          if (item.progress >= 1) {
            item.state = "burnt";
            item.progress = 0;
            this.pushFeed("Something burnt!", false);
            this.refreshTile(tile);
          }
        }
      }
    }
  }

  private orderInterval(): number {
    const t = Phaser.Math.Clamp((this.simTime - this.shiftStartedAt) / (KITCHEN.shiftMs / 1000), 0, 1);
    return Phaser.Math.Linear(KITCHEN.orderIntervalStartMs, KITCHEN.orderIntervalEndMs, t) / 1000;
  }

  private updateOrders() {
    if (this.simTime >= this.nextOrderAt) {
      if (this.orders.length < KITCHEN.maxOrders) {
        this.orders.push({
          id: ++this.orderSeq,
          recipe: pickRecipe(),
          createdAt: this.simTime,
          expiresAt: this.simTime + KITCHEN.orderTimeMs / 1000,
        });
        this.nextOrderAt = this.simTime + this.orderInterval();
      } else {
        this.nextOrderAt = this.simTime + 3;
      }
    }
    const expired = this.orders.filter((o) => this.simTime >= o.expiresAt);
    if (expired.length > 0) {
      for (const o of expired) {
        // penalties never take the team below zero; a bad shift should sting, not humiliate
        this.score = Math.max(0, this.score - KITCHEN.expiredPenalty);
        this.pushFeed(`${o.recipe.emoji} ${o.recipe.name} expired −${KITCHEN.expiredPenalty}`, false);
      }
      this.orders = this.orders.filter((o) => this.simTime < o.expiresAt);
    }
  }

  private pushFeed(text: string, good: boolean) {
    this.feed.push({ id: ++this.feedSeq, text, good, at: this.simTime });
    if (this.feed.length > 6) this.feed.shift();
  }

  private contribution(chef: Chef): number {
    const s = chef.stats;
    return s.served * 30 + s.cooked * 8 + s.chopped * 5 + s.plated * 3;
  }

  private stars(): number {
    return KITCHEN.stars.filter((threshold) => this.score >= threshold).length;
  }

  private endShift() {
    this.phase = "ended";
    for (const chef of this.chefs) chef.chopping = false;
    const ranked = this.chefs.slice().sort((a, b) => this.contribution(b) - this.contribution(a));
    const results: GameResult[] = ranked.map((c, i) => ({
      id: c.def.id,
      position: i + 1,
      detail: `Served ${c.stats.served} · Chopped ${c.stats.chopped}`,
      finishTimeMs: null,
    }));
    const stars = this.stars();
    this.bridge.onStage({ index: 1, count: 1, name: `Team ${this.score} · ${"★".repeat(stars)}${"☆".repeat(3 - stars)}` });
    this.bridge.onEnded(results);
  }

  // ---------- reporting ----------

  private reportStandings() {
    const order = this.chefs
      .slice()
      .sort((a, b) => this.contribution(b) - this.contribution(a))
      .map((c) => c.def.id);
    const key = order.join("|");
    if (key === this.lastOrderKey) return;
    this.lastOrderKey = key;
    this.bridge.onStandings(order);
  }

  private hud(): KitchenHudData {
    let countdown: number | undefined;
    if (this.phase === "countdown") countdown = Math.max(1, Math.ceil(KITCHEN.countdownMs / 1000 - (this.simTime - this.phaseStartedAt)));
    else if (this.phase === "playing" && this.simTime - this.shiftStartedAt < KITCHEN.goFlashMs / 1000) countdown = 0;
    const elapsed = this.phase === "countdown" ? 0 : this.simTime - this.shiftStartedAt;
    const stars = this.stars();
    return {
      phase: this.phase,
      countdown,
      layoutName: this.layout.name,
      timeLeftMs: Math.max(0, Math.round(KITCHEN.shiftMs - elapsed * 1000)),
      score: this.score,
      stars,
      nextStarAt: KITCHEN.stars[stars] ?? null,
      orders: this.orders.map((o) => ({
        id: o.id,
        recipeId: o.recipe.id,
        name: o.recipe.name,
        emoji: o.recipe.emoji,
        points: o.recipe.points,
        remainingMs: Math.max(0, Math.round((o.expiresAt - this.simTime) * 1000)),
        totalMs: KITCHEN.orderTimeMs,
      })),
      feed: this.feed.filter((f) => this.simTime - f.at < KITCHEN.feedLifeMs / 1000).map(({ id, text, good }) => ({ id, text, good })),
      chefs: this.chefs.map((c) => ({ id: c.def.id, name: c.def.name, colorIndex: c.def.colorIndex, served: c.stats.served, chopped: c.stats.chopped })),
    };
  }

  // ---------- rendering ----------

  private refreshTile(tile: Tile) {
    if (!tile.item) {
      tile.sprite?.destroy();
      tile.sprite = null;
      return;
    }
    const key = this.itemTexture(tile.item);
    const cx = GRID_X + tile.gx * TILE + TILE / 2;
    const cy = GRID_Y + tile.gy * TILE + TILE / 2 - 6;
    if (!tile.sprite) tile.sprite = this.add.image(cx, cy, key).setDepth(10);
    else tile.sprite.setTexture(key);
  }

  private syncChef(chef: Chef) {
    chef.container.setPosition(chef.x, chef.y);
    chef.container.setDepth(20 + chef.y / 10000);
    chef.label.setPosition(chef.x, chef.y - 54);
    const fx = chef.facing.x;
    const fy = chef.facing.y;
    chef.eyes[0].setPosition(-6 + fx * 7, -4 + fy * 6);
    chef.eyes[1].setPosition(6 + fx * 7, -4 + fy * 6);
    const dashing = this.simTime < chef.dashUntil;
    chef.container.setScale(dashing ? 1.12 : 1, dashing ? 0.92 : 1);
    const key = chef.held ? this.itemTexture(chef.held) : "";
    if (key !== chef.heldKey) {
      chef.heldKey = key;
      if (key) chef.heldSprite.setTexture(key).setVisible(true);
      else chef.heldSprite.setVisible(false);
    }
  }

  private drawFx() {
    const g = this.fx;
    g.clear();
    for (const chef of this.chefs) {
      const target = this.targetTile(chef);
      if (!target || this.phase !== "playing") continue;
      const x = GRID_X + target.gx * TILE;
      const y = GRID_Y + target.gy * TILE;
      g.lineStyle(3, colorFor(chef.def.colorIndex).hex, 0.9);
      g.strokeRoundedRect(x + 4, y + 4, TILE - 8, TILE - 8, 8);
    }
    for (const row of this.tiles) {
      for (const tile of row) {
        const item = tile.item;
        if (!item || item.kind !== "ingredient") continue;
        let progress = 0;
        let color = 0xffffff;
        if (tile.kind === "board" && canChop(item) && item.progress > 0) {
          progress = item.progress;
          color = 0x4dd0e1;
        } else if (tile.kind === "stove" && canCook(item)) {
          progress = item.progress;
          color = 0x4ddc6a;
        } else if (tile.kind === "stove" && item.state === "cooked") {
          progress = item.progress;
          color = 0xff9a3d;
          if (item.progress > 0.5) {
            const pulse = 0.5 + 0.5 * Math.sin(this.simTime * 14);
            g.lineStyle(4, 0xff4d4d, 0.4 + 0.6 * pulse);
            g.strokeCircle(GRID_X + tile.gx * TILE + TILE / 2, GRID_Y + tile.gy * TILE + TILE / 2 + 2, 30);
          }
        }
        if (progress <= 0) continue;
        const x = GRID_X + tile.gx * TILE + 10;
        const y = GRID_Y + tile.gy * TILE + TILE - 12;
        g.fillStyle(0x000000, 0.55);
        g.fillRoundedRect(x, y, TILE - 20, 7, 3);
        g.fillStyle(color, 1);
        g.fillRoundedRect(x, y, (TILE - 20) * Math.min(1, progress), 7, 3);
      }
    }
  }
}
