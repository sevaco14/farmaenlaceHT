import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const agentOutput = v.object({
  role: v.union(
    v.literal("whatsapp"),
    v.literal("inventario"),
    v.literal("promocion"),
  ),
  summary: v.string(),
  level: v.number(),
  rationale: v.string(),
});

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function restockUnits(target: number, onHand: number) {
  return Math.max(0, Math.ceil(target - onHand));
}

export const applyAgentRun = internalMutation({
  args: {
    city: v.string(),
    product: v.string(),
    sku: v.string(),
    agents: v.array(agentOutput),
    inventoryOnHand: v.number(),
    inventoryTarget: v.number(),
    waRecent7: v.number(),
    lift: v.number(),
    activePromo: v.boolean(),
    baselineLiveStockId: v.union(v.id("liveStock"), v.null()),
    baselineDecisionRevision: v.number(),
    analysisStartedAt: v.number(),
  },
  returns: v.object({
    recommendationId: v.union(v.id("recommendations"), v.null()),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const cityStock = await ctx.db.query("liveStock")
      .withIndex("by_city", (q) => q.eq("city", args.city)).take(20);
    const live = cityStock.find((row) => row.sku === args.sku);
    if (
      (live?._id ?? null) !== args.baselineLiveStockId ||
      (live?.decisionRevision ?? 0) !== args.baselineDecisionRevision ||
      cityStock.some((row) => (row.lastAnalysisAt ?? 0) > args.analysisStartedAt)
    ) return { recommendationId: null, stale: true };

    const inventoryOnHand = live?.onHand ?? args.inventoryOnHand;
    const inventoryTarget = live?.target ?? args.inventoryTarget;
    const stockPct = inventoryTarget > 0 ? Math.round(100 * inventoryOnHand / inventoryTarget) : 0;
    const clock = await ctx.db.query("liveClock").withIndex("by_key", (q) => q.eq("key", "main")).unique();
    const activePromo = live ? live.seasonPromo || live.promoUntil > (clock?.tick ?? 0) : args.activePromo;
    if (live) await ctx.db.patch(live._id, { lastAnalysisAt: args.analysisStartedAt });
    const byRole = new Map(args.agents.map((a) => [a.role, a]));
    const rows = await ctx.db.query("signals")
      .withIndex("by_city", (q) => q.eq("city", args.city)).take(12);

    for (const role of ["whatsapp", "inventario", "promocion"] as const) {
      const out = byRole.get(role);
      if (!out) continue;
      const existing = rows.find(
        (row) => row.source === role && row.product === args.product,
      );
      const patch = {
        summary: out.summary,
        level: role === "inventario"
          ? clamp(stockPct, 0, 100)
          : role === "promocion"
            ? activePromo ? live?.seasonPromo ? 60 : 100 : 0
            : clamp(Math.round(out.level), 0, 100),
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
      } else {
        await ctx.db.insert("signals", {
          city: args.city,
          source: role,
          product: args.product,
          ...patch,
        });
      }
    }
    for (const row of rows) {
      if (row.product !== args.product) await ctx.db.delete(row._id);
    }

    const wa = byRole.get("whatsapp");
    const inv = byRole.get("inventario");
    const pro = byRole.get("promocion");
    const units = restockUnits(inventoryTarget, inventoryOnHand);
    const needsAction = inventoryTarget > 0 && units > 0 && stockPct < 40 &&
      (args.lift >= 1.3 || stockPct < 25);

    const pending = await ctx.db
      .query("recommendations")
      .withIndex("by_city_and_status", (q) => q.eq("city", args.city).eq("status", "pending"))
      .take(20);
    for (const row of pending) {
      await ctx.db.patch(row._id, { status: "superseded", decidedAt: Date.now() });
    }

    if (!needsAction) {
      return { recommendationId: null, stale: false };
    }

    const promoDays =
      !activePromo && stockPct < 35 && args.lift >= 1.4
        ? 7
        : 0;

    const headline =
      promoDays > 0
        ? `Reabastecer ${units} unidades de ${args.product} y activar una promo local por ${promoDays} días.`
        : `Reabastecer ${units} unidades de ${args.product} en la zona.`;

    const detailParts = [
      `Al emitir esta propuesta: ${inventoryOnHand}/${inventoryTarget} unidades (${stockPct}% de stock).`,
      wa?.summary,
      inv?.summary,
      pro?.summary,
      wa?.rationale && `WhatsApp: ${wa.rationale}`,
      inv?.rationale && `Inventario: ${inv.rationale}`,
      pro?.rationale && `Promociones: ${pro.rationale}`,
    ].filter(Boolean);

    const id = await ctx.db.insert("recommendations", {
      city: args.city,
      product: args.product,
      headline,
      detail: detailParts.join(" "),
      status: "pending",
      proposedBy: "agentes-bedrock",
      decidedBy: null,
      restockUnits: units,
      promoDays: promoDays > 0 ? promoDays : undefined,
      sku: args.sku,
      expiresAt: Date.now() + 15 * 60_000,
      liveStockId: live?._id,
      decisionRevision: live?.decisionRevision ?? 0,
      inventoryOnHand,
      inventoryTarget,
    });
    await ctx.scheduler.runAfter(15 * 60_000, internal.comercial.expireRecommendation, { recommendationId: id });

    return { recommendationId: id, stale: false };
  },
});
