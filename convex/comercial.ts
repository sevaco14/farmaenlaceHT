import { v } from "convex/values";
import { internal } from "./_generated/api";
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
        .take(8);
      for (const row of rows) recommendations.push(toRecommendation(row));
    }
    return { signals, recommendations };
  },
});

async function seed(ctx: MutationCtx) {
  const signals = [
    {
      city: "guayaquil",
      source: "whatsapp" as const,
      product: "Vitamina C",
      summary: "Aumento inusual de consultas de clientes en WhatsApp.",
      level: 86,
    },
    {
      city: "guayaquil",
      source: "inventario" as const,
      product: "Vitamina C",
      summary: "Stock al 18% en la zona de Guayaquil.",
      level: 18,
    },
    {
      city: "guayaquil",
      source: "promocion" as const,
      product: "Vitamina C",
      summary: "No hay promoción local activa.",
      level: 0,
    },
    {
      city: "quito",
      source: "whatsapp" as const,
      product: "Protector solar",
      summary: "Consultas estables, sin pico.",
      level: 34,
    },
    {
      city: "quito",
      source: "inventario" as const,
      product: "Protector solar",
      summary: "Cobertura para 18 días.",
      level: 72,
    },
    {
      city: "quito",
      source: "promocion" as const,
      product: "Protector solar",
      summary: "Promo de temporada ya vigente.",
      level: 60,
    },
    {
      city: "cuenca",
      source: "whatsapp" as const,
      product: "Alcohol 70%",
      summary: "Menciones ocasionales.",
      level: 22,
    },
    {
      city: "cuenca",
      source: "inventario" as const,
      product: "Alcohol 70%",
      summary: "Stock sano.",
      level: 81,
    },
    {
      city: "cuenca",
      source: "promocion" as const,
      product: "Alcohol 70%",
      summary: "Sin necesidad de activar promo.",
      level: 10,
    },
  ];
  for (const signal of signals) await ctx.db.insert("signals", signal);

  await ctx.db.insert("recommendations", {
    city: "guayaquil",
    product: "Vitamina C",
    headline:
      "Reabastecer 500 unidades de Vitamina C y activar una promo local por 7 días.",
    detail:
      "Hay un aumento inusual de consultas sobre Vitamina C en Guayaquil. El stock está al 18% y no hay promoción activa en esa zona. Recomiendo reabastecer 500 unidades y activar una promo local por 7 días.",
    status: "pending",
    proposedBy: "analista-comercial",
    decidedBy: null,
  });
}

export const ensureScenario = mutation({
  args: {},
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx) => {
    const catalog = await ctx.db.query("catalogItems").withIndex("by_sku").take(1);
    if (catalog.length > 0) {
      const facts = await ctx.db.query("insightFacts").take(1);
      if (facts.length === 0) {
        const rebuilt: { ready: boolean } = await ctx.runMutation(
          internal.insights.rebuildBoard,
          { replaceRecommendations: true },
        );
        return { ready: rebuilt.ready };
      }
      return { ready: true };
    }

    const existing = await ctx.db
      .query("recommendations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(1);
    if (existing.length > 0) return { ready: true };

    const decided = await ctx.db.query("recommendations").take(1);
    if (decided.length > 0) return { ready: true };

    await seed(ctx);
    return { ready: true };
  },
});

export const resetScenario = mutation({
  args: {},
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx) => {
    for (const city of CITIES) {
      const rows = await ctx.db
        .query("signals")
        .withIndex("by_city", (q) => q.eq("city", city))
        .take(50);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    for (const state of ["pending", "approved", "rejected"] as const) {
      const rows = await ctx.db
        .query("recommendations")
        .withIndex("by_status", (q) => q.eq("status", state))
        .take(50);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const catalog = await ctx.db.query("catalogItems").withIndex("by_sku").take(1);
    if (catalog.length > 0) {
      const rebuilt: { ready: boolean } = await ctx.runMutation(
        internal.insights.rebuildBoard,
        { replaceRecommendations: true },
      );
      return { ready: rebuilt.ready };
    }
    await seed(ctx);
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

    if (args.decision === "approve") {
      const units = recommendation.restockUnits ?? 500;
      const days = recommendation.promoDays ?? 7;
      const rows = await ctx.db
        .query("signals")
        .withIndex("by_city", (q) => q.eq("city", recommendation.city))
        .take(8);
      for (const row of rows) {
        if (row.product !== recommendation.product) continue;
        if (row.source === "inventario") {
          await ctx.db.patch(row._id, {
            level: 78,
            summary: `Reabastecimiento de ${units} unidades aprobado por primera línea.`,
          });
        }
        if (row.source === "promocion" && days > 0) {
          await ctx.db.patch(row._id, {
            level: 100,
            summary: `Promo local SmartClub activa por ${days} días.`,
          });
        }
      }
    }

    const updated = await ctx.db.get(recommendation._id);
    if (!updated) throw new Error("No se pudo leer la sugerencia.");
    return toRecommendation(updated);
  },
});
