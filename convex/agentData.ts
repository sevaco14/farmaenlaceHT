import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

const citySkuArgs = {
  city: v.string(),
  sku: v.string(),
};

const AS_OF = Date.parse("2026-10-08T12:00:00-05:00");
const DAY_MS = 86_400_000;

async function liveRow(ctx: QueryCtx, city: string, sku: string) {
  return await ctx.db
    .query("liveStock")
    .withIndex("by_city_and_sku", (q) => q.eq("city", city).eq("sku", sku))
    .unique();
}

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
    const live = await ctx.db
      .query("liveStock")
      .withIndex("by_city", (q) => q.eq("city", args.city))
      .take(20);
    if (live.length > 0) {
      const named = product
        ? live.find((row) => row.product.toLowerCase() === product.toLowerCase())
        : undefined;
      const hottest = [...live].sort(
        (a, b) => b.waRate / b.baseRate * (1 - b.onHand / b.target) - a.waRate / a.baseRate * (1 - a.onHand / a.target),
      )[0];
      const chosen = named ?? hottest;
      return { sku: chosen.sku, product: chosen.product };
    }
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
    const live = await liveRow(ctx, args.city, args.sku);
    if (live) {
      const events = await ctx.db
        .query("liveEvents")
        .withIndex("by_city_and_at", (q) => q.eq("city", args.city))
        .order("desc")
        .take(40);
      return {
        city: args.city,
        sku: args.sku,
        product: live.product,
        waRecent7: Math.round(live.waRate * 6),
        waPrior21: Math.round(live.baseRate * 18),
        lift: Math.round((live.waRate / live.baseRate) * 100) / 100,
        sampleMessages: events
          .filter((row) => row.code === "WA" && row.product === live.product)
          .slice(0, 5)
          .map((row) => row.text),
        newsTitles: live.trend ? [live.trend] : [],
      };
    }

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
    const live = await liveRow(ctx, args.city, args.sku);
    if (live) {
      return {
        city: args.city,
        sku: args.sku,
        product: live.product,
        onHand: live.onHand,
        target: live.target,
        stockPct: Math.round((100 * live.onHand) / live.target),
        criticalBranches: [],
      };
    }

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
    const live = await liveRow(ctx, args.city, args.sku);
    if (live) {
      const clock = await ctx.db
        .query("liveClock")
        .withIndex("by_key", (q) => q.eq("key", "main"))
        .unique();
      const active = live.promoUntil > (clock?.tick ?? 0) || live.seasonPromo;
      return {
        city: args.city,
        sku: args.sku,
        product: live.product,
        activePromo: active,
        promos: active
          ? [
              {
                promoId: `LIVE-${args.city}-${args.sku}`,
                program: live.seasonPromo ? "Temporada" : "SmartClub local",
                discountPct: live.seasonPromo ? 10 : 15,
                active: true,
                startsAt: AS_OF,
                endsAt: AS_OF + 7 * DAY_MS,
              },
            ]
          : [],
      };
    }

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
