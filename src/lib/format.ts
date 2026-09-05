/** 83456 -> "1:23.4" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 100));
  const tenths = total % 10;
  const seconds = Math.floor(total / 10) % 60;
  const minutes = Math.floor(total / 600);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/** 1 -> "1st", 22 -> "22nd" */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
