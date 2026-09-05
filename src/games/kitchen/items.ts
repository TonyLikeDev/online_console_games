/** Ingredients, plates, and recipes. Pure data and rules, no rendering. */

export type IngredientType = "tomato" | "lettuce" | "onion" | "bread" | "patty";
export type IngredientState = "raw" | "chopped" | "cooked" | "burnt";

export interface Ingredient {
  kind: "ingredient";
  type: IngredientType;
  state: IngredientState;
  /** chop or cook progress, 0..1 */
  progress: number;
}

export interface Plate {
  kind: "plate";
  contents: Ingredient[];
}

export type Item = Ingredient | Plate;

export interface IngredientDef {
  name: string;
  choppable: boolean;
  /** the state an ingredient must be in before it can go on a stove */
  cookableFrom: IngredientState | null;
  /** the state it must reach before it can go on a plate */
  plateableAt: IngredientState;
}

export const INGREDIENTS: Record<IngredientType, IngredientDef> = {
  tomato: { name: "Tomato", choppable: true, cookableFrom: null, plateableAt: "chopped" },
  lettuce: { name: "Lettuce", choppable: true, cookableFrom: null, plateableAt: "chopped" },
  onion: { name: "Onion", choppable: true, cookableFrom: "chopped", plateableAt: "cooked" },
  bread: { name: "Bun", choppable: false, cookableFrom: null, plateableAt: "raw" },
  patty: { name: "Patty", choppable: false, cookableFrom: "raw", plateableAt: "cooked" },
};

export const MAX_PLATE_ITEMS = 4;

export function makeIngredient(type: IngredientType): Ingredient {
  return { kind: "ingredient", type, state: "raw", progress: 0 };
}

export function makePlate(contents: Ingredient[] = []): Plate {
  return { kind: "plate", contents };
}

export function canChop(item: Item | null): boolean {
  return !!item && item.kind === "ingredient" && INGREDIENTS[item.type].choppable && item.state === "raw";
}

export function canCook(item: Item | null): boolean {
  return !!item && item.kind === "ingredient" && INGREDIENTS[item.type].cookableFrom === item.state;
}

export function isPlateable(item: Item | null): boolean {
  return !!item && item.kind === "ingredient" && INGREDIENTS[item.type].plateableAt === item.state;
}

export function ingredientKey(i: Ingredient): string {
  return `${i.type}:${i.state}`;
}

/** Stable identifier for an item's look, used as a texture key. */
export function itemKey(item: Item): string {
  if (item.kind === "ingredient") return `item:${ingredientKey(item)}`;
  return `plate:${item.contents.map(ingredientKey).sort().join("+")}`;
}

/**
 * Put an ingredient on a plate, whichever of the two is held. Returns the new
 * plate, or null when the combination is not allowed.
 */
export function tryMerge(a: Item, b: Item): Plate | null {
  const plate = a.kind === "plate" ? a : b.kind === "plate" ? b : null;
  const ing = a.kind === "ingredient" ? a : b.kind === "ingredient" ? b : null;
  if (!plate || !ing) return null;
  if (!isPlateable(ing)) return null;
  if (plate.contents.length >= MAX_PLATE_ITEMS) return null;
  return makePlate([...plate.contents, ing]);
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  points: number;
  /** ingredient keys, order does not matter */
  needs: string[];
  /** relative spawn weight */
  weight: number;
}

export const RECIPES: Recipe[] = [
  { id: "salad", name: "Salad", emoji: "🥗", points: 20, needs: ["lettuce:chopped", "tomato:chopped"], weight: 4 },
  { id: "soup", name: "Onion soup", emoji: "🍲", points: 30, needs: ["onion:cooked"], weight: 3 },
  { id: "burger", name: "Burger", emoji: "🍔", points: 40, needs: ["bread:raw", "patty:cooked", "tomato:chopped"], weight: 3 },
];

export function matchRecipe(plate: Plate): Recipe | null {
  const have = plate.contents.map(ingredientKey).sort().join("+");
  return RECIPES.find((r) => r.needs.slice().sort().join("+") === have) ?? null;
}

export function pickRecipe(rand: () => number = Math.random): Recipe {
  const total = RECIPES.reduce((s, r) => s + r.weight, 0);
  let roll = rand() * total;
  for (const r of RECIPES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RECIPES[RECIPES.length - 1];
}

/** Plain-language hint for the phones, built from the recipe list. */
export function recipeSummary(): string {
  return RECIPES.map((r) => `${r.emoji} ${r.name}`).join(" · ");
}
