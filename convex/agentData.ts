import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const citySkuArgs = {
  city: v.string(),
  sku: v.string(),
};

const AS_OF = Date.parse("2026-10-08T12:00:00-05:00");
const DAY_MS = 86_400_000;

export const resolveSku = internalQuery({
  args: {
    city: v.string(),
    product: v.optional(v.string()),
    sku: v.optional(v.string()),
  },
  returns: v.object({
    sku: v.string(),
    product: v.string(),
  }),
  handler: async (ctx, args) => {
    if (args.sku) {
      const row = await ctx.db
        .query("catalogItems")
        .withIndex("by_sku", (q) => q.eq("sku", args.sku!))
        .unique();
      return { sku: args.sku, product: row?.name ?? args.product ?? args.sku };
    }
    const product = args.product?.trim();
    if (product) {
      const catalog = await ctx.db.query("catalogItems").withIndex("by_sku").take(80);
      const match =
        catalog.find((item) => item.name.toLowerCase() === product.toLowerCase()) ??
        catalog.find((item) => item.name.toLowerCase().includes(product.toLowerCase()));
      if (match) return { sku: match.sku, product: match.name };
    }
    const fact = await ctx.db
      .query("insightFacts")
      .withIndex("by_city_and_sku", (q) => q.eq("city", args.city))
      .take(20);
    const hero = fact.sort((a, b) => b.score - a.score)[0];
    if (hero) return { sku: hero.sku, product: hero.product };
    return { sku: "FE-VC500", product: product ?? "Vitamina C" };
  },
});

export const whatsappMetrics = internalQuery({
  args: citySkuArgs,
  returns: v.object({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    waRecent7: v.number(),
    waPrior21: v.number(),
    lift: v.number(),
    sampleMessages: v.array(v.string()),
    newsTitles: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const fact = await ctx.db
      .query("insightFacts")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .unique();

    const daily = await ctx.db
      .query("waDaily")
      .withIndex("by_city", (q) => q.eq("city", args.city))
      .filter((q) => q.eq(q.field("sku"), args.sku))
      .take(40);

    let waRecent7 = fact?.waRecent7 ?? 0;
    let waPrior21 = fact?.waPrior21 ?? 0;
    if (daily.length > 0) {
      waRecent7 = 0;
      waPrior21 = 0;
      for (const row of daily) {
        const offset = Math.floor(
          (Date.parse(`${row.day}T12:00:00-05:00`) - (AS_OF - 28 * DAY_MS)) / DAY_MS,
        );
        if (offset >= 21) waRecent7 += row.inbound;
        else if (offset >= 0) waPrior21 += row.inbound;
      }
    }
    const expected = waPrior21 > 0 ? waPrior21 / 3 : 1;
    const lift = fact?.lift ?? (expected > 0 ? waRecent7 / expected : 1);

    const messages = await ctx.db
      .query("waMessages")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .take(6);

    const news = await ctx.db.query("newsItems").take(40);
    const newsTitles = news
      .filter(
        (item) =>
          item.cityTags.includes(args.city) &&
          item.skuTags.includes(args.sku) &&
          item.publishedAt >= AS_OF - 21 * DAY_MS,
      )
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .map((item) => item.title);

    const catalog = await ctx.db
      .query("catalogItems")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();

    return {
      city: args.city,
      sku: args.sku,
      product: catalog?.name ?? fact?.product ?? args.sku,
      waRecent7,
      waPrior21,
      lift,
      sampleMessages: messages.map((m) => m.text).slice(0, 5),
      newsTitles,
    };
  },
});

export const inventoryMetrics = internalQuery({
  args: citySkuArgs,
  returns: v.object({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    onHand: v.number(),
    target: v.number(),
    stockPct: v.number(),
    criticalBranches: v.array(
      v.object({ branchCode: v.string(), onHand: v.number(), target: v.number() }),
    ),
  }),
  handler: async (ctx, args) => {
    const fact = await ctx.db
      .query("insightFacts")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .unique();

    const rows = await ctx.db
      .query("inventoryPositions")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .take(40);

    let onHand = fact?.onHand ?? 0;
    let target = fact?.target ?? 0;
    if (rows.length > 0) {
      onHand = rows.reduce((sum, row) => sum + row.onHand, 0);
      target = rows.reduce((sum, row) => sum + row.target, 0);
    }
    const stockPct =
      fact?.stockPct ?? (target > 0 ? Math.round((onHand / target) * 100) : 0);

    const criticalBranches = rows
      .map((row) => ({
        branchCode: row.branchCode,
        onHand: row.onHand,
        target: row.target,
      }))
      .filter((row) => row.target > 0 && row.onHand / row.target < 0.25)
      .sort((a, b) => a.onHand / a.target - b.onHand / b.target)
      .slice(0, 5);

    const catalog = await ctx.db
      .query("catalogItems")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();

    return {
      city: args.city,
      sku: args.sku,
      product: catalog?.name ?? fact?.product ?? args.sku,
      onHand,
      target,
      stockPct,
      criticalBranches,
    };
  },
});

export const promoMetrics = internalQuery({
  args: citySkuArgs,
  returns: v.object({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    activePromo: v.boolean(),
    promos: v.array(
      v.object({
        promoId: v.string(),
        program: v.string(),
        discountPct: v.number(),
        active: v.boolean(),
        startsAt: v.number(),
        endsAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const fact = await ctx.db
      .query("insightFacts")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .unique();

    const promos = await ctx.db
      .query("promoCalendar")
      .withIndex("by_city_and_sku", (q) =>
        q.eq("city", args.city).eq("sku", args.sku),
      )
      .take(12);

    const now = AS_OF;
    const activePromo =
      fact?.activePromo ??
      promos.some((p) => p.active && p.startsAt <= now && p.endsAt >= now);

    const catalog = await ctx.db
      .query("catalogItems")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();

    return {
      city: args.city,
      sku: args.sku,
      product: catalog?.name ?? fact?.product ?? args.sku,
      activePromo,
      promos: promos.map((p) => ({
        promoId: p.promoId,
        program: p.program,
        discountPct: p.discountPct,
        active: p.active,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
      })),
    };
  },
});
