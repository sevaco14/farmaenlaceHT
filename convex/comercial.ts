import { v } from "convex/values";
import { applyDecision, hasWorld, resetWorld } from "./live";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const source = v.union(
  v.literal("whatsapp"),
  v.literal("inventario"),
  v.literal("promocion"),
);

const status = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
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
});

const CITIES = ["guayaquil", "quito", "cuenca"] as const;

async function actorOf(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? "gerente-demo";
}

function toRecommendation(doc: {
  _id: Id<"recommendations">;
  city: string;
  product: string;
  headline: string;
  detail: string;
  status: "pending" | "approved" | "rejected";
  proposedBy: string;
  decidedBy: string | null;
  restockUnits?: number;
  promoDays?: number;
}) {
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
    for (const state of ["pending", "approved", "rejected"] as const) {
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
    const next = args.decision === "approve" ? "approved" : "rejected";
    await ctx.db.patch(recommendation._id, { status: next, decidedBy: actor });
    await applyDecision(ctx, recommendation, args.decision);

    const updated = await ctx.db.get(recommendation._id);
    if (!updated) throw new Error("No se pudo leer la sugerencia.");
    return toRecommendation(updated);
  },
});