import { describe, it, expect, vi } from "vitest";

// minimal browser-ish stubs for next/headers usage if imported transitively
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, delete: () => {} })) }));

// db client: avoid real files/sockets — stub createClient
vi.mock("@libsql/client", () => ({ createClient: () => ({ execute: async () => ({ rows: [{ c: 0 }] }) }) }));

const auth = await import("@/lib/auth");

describe("passwordIssue", () => {
  it("requires 8+ chars with a letter and a number", () => {
    expect(auth.passwordIssue("short1")).toContain("8 characters");
    expect(auth.passwordIssue("alllettersonly")).toContain("letter and one number");
    expect(auth.passwordIssue("12345678")).toContain("letter and one number");
    expect(auth.passwordIssue("goodpass1")).toBeNull();
    expect(auth.passwordIssue("x".repeat(201))).toContain("too long");
  });
});

describe("isValidEmail", () => {
  it("validates basic email shapes", () => {
    expect(auth.isValidEmail("a@b.co")).toBe(true);
    expect(auth.isValidEmail("user.name+tag@sub.domain.org")).toBe(true);
    expect(auth.isValidEmail("nope")).toBe(false);
    expect(auth.isValidEmail("a@b")).toBe(false);
    expect(auth.isValidEmail("a b@c.com")).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to max then blocks within the window", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(auth.rateLimit(key, 5, 1000)).toBe(true);
    expect(auth.rateLimit(key, 5, 1000)).toBe(false);
  });

  it("frees the key after the window passes", () => {
    vi.useFakeTimers();
    const key = `t2-${Math.random()}`;
    expect(auth.rateLimit(key, 1, 100)).toBe(true);
    expect(auth.rateLimit(key, 1, 100)).toBe(false);
    vi.advanceTimersByTime(150);
    expect(auth.rateLimit(key, 1, 100)).toBe(true);
    vi.useRealTimers();
  });
});

describe("argon2 password hashing", () => {
  it("hashes and verifies; wrong password fails", async () => {
    const h = await auth.hashPassword("secret123");
    expect(h).not.toContain("secret123");
    expect(h.startsWith("$argon2")).toBe(true);
    expect(await auth.verifyPassword(h, "secret123")).toBe(true);
    expect(await auth.verifyPassword(h, "wrongpass")).toBe(false);
  });

  it("produces a unique salt per hash", async () => {
    const a = await auth.hashPassword("same-password");
    const b = await auth.hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(auth.safeEqual("abc", "abc")).toBe(true);
    expect(auth.safeEqual("abc", "abd")).toBe(false);
    expect(auth.safeEqual("abc", "abcd")).toBe(false);
  });
});
