export const CATEGORIES = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
} as const;

export const CONDITIONS = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well used",
} as const;

export type Category = keyof typeof CATEGORIES;
export type Condition = keyof typeof CONDITIONS;

export function shortDate(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ago(ts: number) {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Pull the readable message out of a ConvexError thrown by a mutation. */
export function errorText(err: unknown) {
  if (err && typeof err === "object" && "data" in err && typeof err.data === "string") return err.data;
  return "Something went wrong. Try again.";
}
