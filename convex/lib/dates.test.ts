import { describe, expect, it } from "vitest";
import { daysBetween, overlaps } from "./dates";

describe("overlaps (inclusive ranges)", () => {
  it("catches shared days", () => {
    expect(overlaps("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-15")).toBe(true);
    expect(overlaps("2026-11-10", "2026-11-20", "2026-11-12", "2026-11-13")).toBe(true);
  });

  it("allows back-to-back loans", () => {
    expect(overlaps("2026-11-10", "2026-11-12", "2026-11-13", "2026-11-15")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-11-07", "2026-11-11")).toBe(4);
    expect(daysBetween("2026-11-11", "2026-11-11")).toBe(0);
  });
});
