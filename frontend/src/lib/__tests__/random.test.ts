import { describe, it, expect, vi } from "vitest";
import { seededRandom, dateSeed, shuffleArray } from "@/lib/random";

describe("seededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = seededRandom(12345);
    const b = seededRandom(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = seededRandom(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("differs between seeds", () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("dateSeed", () => {
  it("encodes year, month, and day deterministically", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 25, 12, 0, 0) });
    expect(dateSeed()).toBe(20260925);
    vi.useRealTimers();
  });
});

describe("shuffleArray", () => {
  it("keeps the same multiset of elements", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffleArray(arr, 42);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
  });

  it("is deterministic for a fixed seed", () => {
    expect(shuffleArray([1, 2, 3, 4, 5], 42)).toEqual(shuffleArray([1, 2, 3, 4, 5], 42));
  });

  it("does not mutate the input array", () => {
    const arr = [1, 2, 3];
    shuffleArray(arr, 7);
    expect(arr).toEqual([1, 2, 3]);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffleArray([], 1)).toEqual([]);
    expect(shuffleArray(["x"], 1)).toEqual(["x"]);
  });
});
