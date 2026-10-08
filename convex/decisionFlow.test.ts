/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-08T17:00:00Z");

function makeTest() {
  return convexTest(schema, modules);
}

async function seedStock(t: ReturnType<typeof makeTest>, onHand = 100) {
  return t.run(async (ctx) => {
    await ctx.db.insert("liveClock", {
      key: "main", running: false, fast: false, tick: 10,
      generation: 1, aliveUntil: NOW + 180_000, scheduled: false,
    });
    return ctx.db.insert("liveStock", {
      city: "guayaquil", sku: "FE-VC500", product: "Vitamina C", category: "vitaminas",
      onHand, target: 1000, baseRate: 1, waRate: 3, salesRate: 0,
      heat: 3, heatTarget: 3, trend: "Demanda sintética", promoUntil: 0,
      seasonPromo: false, snoozeUntil: 0, lastBand: 3,
    });
  });
}

function runArgs(liveStockId: Id<"liveStock">) {
  return {
    city: "guayaquil", sku: "FE-VC500", product: "Vitamina C",
    inventoryOnHand: 100, inventoryTarget: 1000, waRecent7: 300, lift: 3,
    activePromo: false, baselineLiveStockId: liveStockId,
    baselineDecisionRevision: 0, analysisStartedAt: NOW,
    agents: [
      { role: "whatsapp" as const, level: 95, summary: "Demanda alta.", rationale: "Consultas sintéticas." },
      // Deliberately inaccurate model level: numerical inventory remains authoritative.
      { role: "inventario" as const, level: 0, summary: "Stock bajo.", rationale: "Revisar existencias." },
      { role: "promocion" as const, level: 0, summary: "Sin promoción.", rationale: "Calendario sintético." },
    ],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("commercial decisions against synthetic inventory", () => {
  it("does not restock full inventory even when the model says zero stock", async () => {
    const t = makeTest();
    const stockId = await seedStock(t, 1000);
    const result = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    expect(result).toEqual({ recommendationId: null, stale: false });
    const board = await t.query(api.comercial.board, {});
    expect(board.recommendations).toHaveLength(0);
    expect(board.signals.find((s) => s.source === "inventario")?.level).toBe(100);
  });

  it("approves stock and promo exactly once and records the acting identity", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const proposal = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    const actor = t.withIdentity({ subject: "manager-1", issuer: "https://test.example", tokenIdentifier: "test|manager-1" });
    const args = { recommendationId: proposal.recommendationId!, decision: "approve" as const };
    const approved = await actor.mutation(api.comercial.decide, args);
    await actor.mutation(api.comercial.decide, args);
    const stock = await t.run((ctx) => ctx.db.get(stockId));
    expect(approved.status).toBe("approved");
    expect(approved.decidedBy).toBe("test|manager-1");
    expect(stock?.onHand).toBe(1000);
    expect(stock?.promoUntil).toBe(10 + 7 * 24 * 6);
    expect(stock?.decisionRevision).toBe(1);
  });

  it("rejects without changing inventory or promotion and is idempotent", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const proposal = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    const args = { recommendationId: proposal.recommendationId!, decision: "reject" as const };
    expect((await t.mutation(api.comercial.decide, args)).status).toBe("rejected");
    await t.mutation(api.comercial.decide, args);
    const stock = await t.run((ctx) => ctx.db.get(stockId));
    expect(stock?.onHand).toBe(100);
    expect(stock?.promoUntil).toBe(0);
    expect(stock?.decisionRevision).toBe(1);
  });

  it.each(["approve", "reject"] as const)("discards in-flight analysis after %s", async (decision) => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const args = runArgs(stockId);
    const proposal = await t.mutation(internal.agentApply.applyAgentRun, args);
    await t.mutation(api.comercial.decide, { recommendationId: proposal.recommendationId!, decision });
    expect(await t.mutation(internal.agentApply.applyAgentRun, args)).toEqual({ recommendationId: null, stale: true });
    const board = await t.query(api.comercial.board, {});
    expect(board.recommendations.filter((r) => r.status === "pending")).toHaveLength(0);
  });

  it("discards in-flight analysis after resetting the world", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    await t.mutation(api.comercial.resetScenario, {});
    expect(await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId))).toEqual({ recommendationId: null, stale: true });
  });

  it("retains superseded proposals and rejects an older analysis result", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const first = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    const newer = { ...runArgs(stockId), analysisStartedAt: NOW + 1 };
    await t.mutation(internal.agentApply.applyAgentRun, newer);
    expect((await t.run((ctx) => ctx.db.get(first.recommendationId!)))?.status).toBe("superseded");
    expect((await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId))).stale).toBe(true);
    const board = await t.query(api.comercial.board, {});
    expect(board.recommendations.map((r) => r.status).sort()).toEqual(["pending", "superseded"]);
  });

  it("expires an order before approval without changing inventory", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const proposal = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    vi.setSystemTime(NOW + 15 * 60_000);
    const result = await t.mutation(api.comercial.decide, { recommendationId: proposal.recommendationId!, decision: "approve" });
    expect(result.status).toBe("expired");
    expect((await t.run((ctx) => ctx.db.get(stockId)))?.onHand).toBe(100);
  });

  it("invalidates an order if inventory was replenished after its evidence snapshot", async () => {
    const t = makeTest();
    const stockId = await seedStock(t);
    const proposal = await t.mutation(internal.agentApply.applyAgentRun, runArgs(stockId));
    await t.run((ctx) => ctx.db.patch(stockId, { onHand: 500 }));
    const result = await t.mutation(api.comercial.decide, { recommendationId: proposal.recommendationId!, decision: "approve" });
    expect(result.status).toBe("superseded");
    expect((await t.run((ctx) => ctx.db.get(stockId)))?.onHand).toBe(500);
  });

  it("uses hourly simulated WhatsApp metrics and rejects unknown selected products", async () => {
    const t = makeTest();
    await seedStock(t);
    const wa = await t.query(internal.agentData.whatsappMetrics, { city: "guayaquil", sku: "FE-VC500" });
    expect(wa).toMatchObject({ metricWindow: "hour", observedCount: 18, baselineCount: 6, lift: 3 });
    expect(wa.waRecent7).toBe(18 * 24 * 7);
    await expect(t.query(internal.agentData.resolveSku, { city: "guayaquil", product: "Producto inexistente" })).rejects.toThrow("no pertenece");
  });

  it("includes national promos and ignores expired or future promo windows", async () => {
    const t = makeTest();
    await t.run(async (ctx) => {
      for (const [city, startsAt, endsAt] of [
        ["guayaquil", NOW - 10_000, NOW - 1],
        ["guayaquil", NOW + 1, NOW + 10_000],
        ["nacional", NOW - 10_000, NOW + 10_000],
      ] as const) {
        await ctx.db.insert("promoCalendar", { city, startsAt, endsAt, sku: "FE-VC500", product: "Vitamina C", promoId: `${city}-${startsAt}`, program: "SmartClub", discountPct: 10, active: true });
      }
    });
    const promo = await t.query(internal.agentData.promoMetrics, { city: "guayaquil", sku: "FE-VC500" });
    expect(promo.activePromo).toBe(true);
    expect(promo.promos).toHaveLength(3);
    await t.run(async (ctx) => {
      const national = await ctx.db.query("promoCalendar").withIndex("by_city_and_sku", (q) => q.eq("city", "nacional").eq("sku", "FE-VC500")).unique();
      await ctx.db.delete(national!._id);
    });
    expect((await t.query(internal.agentData.promoMetrics, { city: "guayaquil", sku: "FE-VC500" })).activePromo).toBe(false);
  });
});
