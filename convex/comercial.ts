import { v } from "convex/values";
import { applyDecision, hasWorld, resetWorld } from "./live";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const source = v.union(
  v.literal("whatsapp"),
  v.literal("inventario"),
  v.literal("promocion"),
);

const status = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("superseded"),
);

const signalResult = v.object({
  city: v.string(),
  source,
  product: v.string(),
  summary: v.string(),
  level: v.number(),
});

const recommendationResult = v.object({
  id: v.id("recommendations"),
  city: v.string(),
  product: v.string(),
  headline: v.string(),
  detail: v.string(),
  status,
  proposedBy: v.string(),
  decidedBy: v.union(v.string(), v.null()),
  restockUnits: v.union(v.number(), v.null()),
  promoDays: v.union(v.number(), v.null()),
  createdAt: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  decidedAt: v.union(v.number(), v.null()),
});

const CITIES = ["guayaquil", "quito", "cuenca"] as const;

async function actorOf(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? "gerente-demo";
}

function toRecommendation(doc: Doc<"recommendations">) {
  return {
    id: doc._id,
    city: doc.city,
    product: doc.product,
    headline: doc.headline,
    detail: doc.detail,
    status: doc.status,
    proposedBy: doc.proposedBy,
    decidedBy: doc.decidedBy,
    restockUnits: doc.restockUnits ?? null,
    promoDays: doc.promoDays ?? null,
    createdAt: doc._creationTime,
    expiresAt: doc.expiresAt ?? null,
    decidedAt: doc.decidedAt ?? null,
  };
}

export const board = query({
  args: {},
  returns: v.object({
    signals: v.array(signalResult),
    recommendations: v.array(recommendationResult),
  }),
  handler: async (ctx) => {
    const signals = [];
    for (const city of CITIES) {
      const rows = await ctx.db
        .query("signals")
        .withIndex("by_city", (q) => q.eq("city", city))
        .take(8);
      for (const row of rows) {
        signals.push({
          city: row.city,
          source: row.source,
          product: row.product,
          summary: row.summary,
          level: row.level,
        });
      }
    }

    const recommendations = [];
    for (const state of ["pending", "approved", "rejected", "expired", "superseded"] as const) {
      const rows = await ctx.db
        .query("recommendations")
        .withIndex("by_status", (q) => q.eq("status", state))
        .order("desc")
        .take(12);
      for (const row of rows) recommendations.push(toRecommendation(row));
    }
    return { signals, recommendations };
  },
});

export const ensureScenario = mutation({
  args: {},
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx) => {
    if (!(await hasWorld(ctx))) await resetWorld(ctx);
    return { ready: true };
  },
});

export const resetScenario = mutation({
  args: {},
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx) => {
    await resetWorld(ctx);
    return { ready: true };
  },
});

export const decide = mutation({
  args: {
    recommendationId: v.id("recommendations"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  returns: recommendationResult,
  handler: async (ctx, args) => {
    const recommendation = await ctx.db.get(args.recommendationId);
    if (!recommendation) throw new Error("La sugerencia no existe.");
    if (recommendation.status !== "pending") return toRecommendation(recommendation);

    const actor = await actorOf(ctx);
    const now = Date.now();
    const expired = now >= (recommendation.expiresAt ?? recommendation._creationTime + 15 * 60_000);
    let stale = false;
    if (recommendation.liveStockId) {
      const stock = await ctx.db.get(recommendation.liveStockId);
      stale = !stock || (stock.decisionRevision ?? 0) !== (recommendation.decisionRevision ?? 0) ||
        stock.target !== recommendation.inventoryTarget ||
        (recommendation.inventoryOnHand !== undefined && stock.onHand > recommendation.inventoryOnHand) ||
        (args.decision === "approve" && stock.onHand / stock.target >= 0.4);
    }
    const next = expired ? "expired" : stale ? "superseded" : args.decision === "approve" ? "approved" : "rejected";
    if (!expired && !stale) {
      const applied = await applyDecision(ctx, recommendation, args.decision);
      if (!applied) throw new Error("El inventario del escenario cambió. Vuelve a analizar antes de decidir.");
    }
    await ctx.db.patch(recommendation._id, { status: next, decidedBy: actor, decidedAt: now });

    const updated = await ctx.db.get(recommendation._id);
    if (!updated) throw new Error("No se pudo leer la sugerencia.");
    return toRecommendation(updated);
  },
});

export const expireRecommendation = internalMutation({
  args: { recommendationId: v.id("recommendations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.recommendationId);
    if (row?.status === "pending" && Date.now() >= (row.expiresAt ?? row._creationTime + 15 * 60_000)) {
      await ctx.db.patch(row._id, { status: "expired", decidedAt: Date.now() });
    }
    return null;
  },
});
