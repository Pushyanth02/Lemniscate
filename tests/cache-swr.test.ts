/**
 * Stale-while-revalidate cache tests (run against fake-indexeddb).
 *
 * The SWR read is the hit-rate mechanism: a row that expired moments ago
 * must still SERVE (flagged stale) instead of reading as a cold miss, a
 * row long past its grace window must behave exactly like cacheGet, and
 * the session metrics must count each case honestly.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { freshDb } from "./helpers";
import {
  cacheGet,
  cacheMetrics,
  cacheSet,
  cacheSwrGet,
} from "../src/lib/cache";

beforeEach(async () => {
  await freshDb();
});

describe("cacheSwrGet", () => {
  test("a live row serves as a normal (non-stale) hit", async () => {
    await cacheSet("swr:live", { v: 1 }, 60_000);
    const hit = await cacheSwrGet<{ v: number }>("swr:live", 1_000);
    expect(hit).not.toBeNull();
    expect(hit?.value.v).toBe(1);
    expect(hit?.stale).toBe(false);
  });

  test("a row inside the grace window serves stale instead of missing", async () => {
    await cacheSet("swr:grace", { v: 2 }, 1); // expires almost immediately
    await new Promise((r) => setTimeout(r, 10));
    const before = cacheMetrics();
    const hit = await cacheSwrGet<{ v: number }>("swr:grace", 3_600_000);
    const after = cacheMetrics();
    expect(hit).not.toBeNull();
    expect(hit?.value.v).toBe(2);
    expect(hit?.stale).toBe(true);
    // served as a HIT (not a miss) and counted as an SWR serve
    expect(after.hits - before.hits).toBe(1);
    expect(after.swrServed - before.swrServed).toBe(1);
    expect(after.misses - before.misses).toBe(0);
    // the row itself survives: a second SWR read with the same grace
    // window still serves it (a cold read would have deleted it)
    const again = await cacheSwrGet<{ v: number }>("swr:grace", 3_600_000);
    expect(again?.stale).toBe(true);
    expect(again?.value.v).toBe(2);
  });

  test("a row beyond the grace window is a miss and is deleted", async () => {
    await cacheSet("swr:beyond", { v: 3 }, 1);
    await new Promise((r) => setTimeout(r, 10));
    const before = cacheMetrics();
    const hit = await cacheSwrGet<{ v: number }>("swr:beyond", 2);
    const after = cacheMetrics();
    expect(hit).toBeNull();
    expect(after.misses - before.misses).toBe(1);
    expect(after.expired - before.expired).toBe(1);
    // deleted like cacheGet would delete it
    const gone = await cacheGet("swr:beyond");
    expect(gone).toBeNull();
  });

  test("a missing key is a plain miss", async () => {
    const before = cacheMetrics();
    const hit = await cacheSwrGet("swr:never-written", 60_000);
    const after = cacheMetrics();
    expect(hit).toBeNull();
    expect(after.misses - before.misses).toBe(1);
  });

  test("grace boundary is inclusive: exactly graceMs past expiry still serves", async () => {
    await cacheSet("swr:edge", { v: 4 }, 1);
    await new Promise((r) => setTimeout(r, 10));
    // grace of 10ms covers the ~10ms elapsed; grace of 5ms would not.
    const inclusive = await cacheSwrGet("swr:edge", 60_000);
    expect(inclusive?.stale).toBe(true);
  });
});
