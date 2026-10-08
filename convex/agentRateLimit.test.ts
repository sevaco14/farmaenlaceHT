/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("global Bedrock request limit", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T18:00:00Z")); });
  afterEach(() => vi.useRealTimers());

  it("admits only one concurrent action and waits after its response", async () => {
    const t = convexTest(schema, modules);
    const results = await Promise.all(["first", "second"].map((leaseId) => t.mutation(internal.agentRateLimit.acquire, { leaseId })));
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    const winner = results[0].granted ? "first" : "second";
    await t.mutation(internal.agentRateLimit.release, { leaseId: winner });
    expect((await t.mutation(internal.agentRateLimit.acquire, { leaseId: "next" })).granted).toBe(false);
    vi.advanceTimersByTime(1099);
    expect((await t.mutation(internal.agentRateLimit.acquire, { leaseId: "next" })).granted).toBe(false);
    vi.advanceTimersByTime(2);
    expect((await t.mutation(internal.agentRateLimit.acquire, { leaseId: "next" })).granted).toBe(true);
  });

  it("cannot unlock another request and recovers an abandoned lease", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.agentRateLimit.acquire, { leaseId: "owner" });
    await t.mutation(internal.agentRateLimit.release, { leaseId: "wrong" });
    vi.advanceTimersByTime(2000);
    expect((await t.mutation(internal.agentRateLimit.acquire, { leaseId: "next" })).granted).toBe(false);
    vi.advanceTimersByTime(33001);
    expect((await t.mutation(internal.agentRateLimit.acquire, { leaseId: "next" })).granted).toBe(true);
  });
});
