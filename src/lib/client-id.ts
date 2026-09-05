/**
 * Stable per-device identity for phones, kept in localStorage so a reload
 * rejoins the same seat in the room.
 */
const ID_KEY = "ocg:playerId";
const NAME_KEY = "ocg:playerName";

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getPlayerClientId(): string {
  try {
    const existing = localStorage.getItem(ID_KEY);
    if (existing) return existing;
    const id = `p-${randomId()}`;
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return `p-${randomId()}`;
  }
}

export function screenClientId(code: string): string {
  return `screen-${code}`;
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
