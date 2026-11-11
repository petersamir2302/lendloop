import { ConvexError } from "convex/values";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function assertDay(value: string, label: string) {
  if (!ISO_DAY.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ConvexError(`${label} must be a date (YYYY-MM-DD).`);
  }
}

/** Inclusive ranges, compared as strings since they're all YYYY-MM-DD. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}
