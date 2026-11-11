import { describe, expect, it } from "vitest";
import { sign, verify } from "./signing";

const secret = "test-secret";
const now = () => Math.floor(Date.now() / 1000).toString();

describe("signing", () => {
  it("accepts a fresh, correctly signed body", async () => {
    const ts = now();
    const body = JSON.stringify({ hello: "world" });
    expect(await verify(secret, ts, await sign(secret, ts, body), body)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const ts = now();
    const sig = await sign(secret, ts, '{"status":"sent"}');
    expect(await verify(secret, ts, sig, '{"status":"failed"}')).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    const ts = now();
    const sig = await sign("someone-else", ts, "{}");
    expect(await verify(secret, ts, sig, "{}")).toBe(false);
  });

  it("rejects old timestamps so captured requests can't be replayed", async () => {
    const old = (Number(now()) - 900).toString();
    expect(await verify(secret, old, await sign(secret, old, "{}"), "{}")).toBe(false);
  });

  it("rejects missing pieces instead of throwing", async () => {
    expect(await verify(undefined, now(), "sha256=x", "{}")).toBe(false);
    expect(await verify(secret, null, "sha256=x", "{}")).toBe(false);
    expect(await verify(secret, now(), null, "{}")).toBe(false);
    expect(await verify(secret, "not-a-number", "sha256=x", "{}")).toBe(false);
  });
});
