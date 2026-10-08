import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const AS_OF = Date.parse("2026-10-08T12:00:00-05:00");
const DAY_MS = 86_400_000;
const CITIES = ["guayaquil", "quito", "cuenca"] as const;

const actionValidator = v.union(
  v.literal("none"),
  v.literal("watch"),
  v.literal("restock"),
  v.literal("restock_promo"),
);

const rebuildResult = v.object({
  ready: v.boolean(),
  facts: v.number(),
  cities: v.array(
    v.object({
      city: v.string(),
      sku: v.string(),
      product: v.string(),
      action: actionValidator,
      score: v.number(),
      lift: v.number(),
      stockPct: v.number(),
      waRecent7: v.number(),
    }),
  ),
});

async function clearTake<T extends { _id: Parameters<MutationCtx["db"]["delete"]>[0] }>(
  ctx: MutationCtx,
  read: () => Promise<T[]>,
) {
  for (;;) {
    const rows = await read();
    if (rows.length === 0) break;
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function dayOffset(day: string) {
  const t = Date.parse(`${day}T12:00:00-05:00`);
  return Math.floor((t - (AS_OF - 28 * DAY_MS)) / DAY_MS);
}

function decideAction(args: {
  lift: number;
  stockPct: number;
  waRecent7: number;
  activePromo: boolean;
  newsCount: number;
}) {
  if (args.lift >= 1.8 && args.stockPct < 30 && !args.activePromo && args.waRecent7 >= 12) {
    return "restock_promo" as const;
  }
  if (args.stockPct < 25 && (args.lift >= 1.05 || args.newsCount >= 1)) {
    return "restock" as const;
  }
  if (args.lift >= 1.5 || args.stockPct < 35) return "watch" as const;
  return "none" as const;
}

function restockUnits(target: number, onHand: number) {
  const gap = Math.max(0, target - onHand);
  const rounded = Math.round(gap / 50) * 50;
  return Math.max(50, rounded);
}

async function rebuild(ctx: MutationCtx, replaceRecommendations: boolean) {
  const catalog = await ctx.db.query("catalogItems").withIndex("by_sku").take(40);
  if (catalog.length === 0) {
    return { ready: false, facts: 0, cities: [] };
  }

  const daily = await ctx.db.query("waDaily").take(2000);
  const inventory = await ctx.db.query("inventoryPositions").take(2000);
  const promos = await ctx.db.query("promoCalendar").take(200);
  const news = await ctx.db.query("newsItems").take(80);

  type Agg = {
    city: string;
    sku: string;
    product: string;
    waRecent7: number;
    waPrior21: number;
    onHand: number;
    target: number;
    activePromo: boolean;
    newsCount: number;
  };

  const map = new Map<string, Agg>();
  const keyOf = (city: string, sku: string) => `${city}|${sku}`;

  for (const item of catalog) {
    for (const city of CITIES) {
      map.set(keyOf(city, item.sku), {
        city,
        sku: item.sku,
        product: item.name,
        waRecent7: 0,
        waPrior21: 0,
        onHand: 0,
        target: 0,
        activePromo: false,
        newsCount: 0,
      });
    }
  }

  for (const row of daily) {
    const agg = map.get(keyOf(row.city, row.sku));
    if (!agg) continue;
    const offset = dayOffset(row.day);
    if (offset >= 21 && offset < 28) agg.waRecent7 += row.inbound;
    else if (offset >= 0 && offset < 21) agg.waPrior21 += row.inbound;
  }

  for (const row of inventory) {
    const agg = map.get(keyOf(row.city, row.sku));
    if (!agg) continue;
    agg.onHand += row.onHand;
    agg.target += row.target;
  }

  for (const promo of promos) {
    if (!promo.active) continue;
    if (promo.city === "nacional") {
      for (const city of CITIES) {
        const agg = map.get(keyOf(city, promo.sku));
        if (agg) agg.activePromo = true;
      }
      continue;
    }
    const agg = map.get(keyOf(promo.city, promo.sku));
    if (agg) agg.activePromo = true;
  }

  for (const item of news) {
    if (item.publishedAt < AS_OF - 21 * DAY_MS) continue;
    for (const city of item.cityTags) {
      for (const sku of item.skuTags) {
        const agg = map.get(keyOf(city, sku));
        if (agg) agg.newsCount += 1;
      }
    }
  }

  const facts = [];
  for (const agg of map.values()) {
    const expected = (agg.waPrior21 / 21) * 7;
    const lift = expected > 0.5 ? agg.waRecent7 / expected : 0;
    const stockPct = agg.target > 0 ? Math.round((100 * agg.onHand) / agg.target) : 0;
    const action = decideAction({
      lift,
      stockPct,
      waRecent7: agg.waRecent7,
      activePromo: agg.activePromo,
      newsCount: agg.newsCount,
    });
    const volume = Math.log10(1 + agg.waRecent7);
    const scarcity = (100 - stockPct) / 100;
    const promoGap = agg.activePromo ? 0.7 : 1.35;
    const newsBoost = 1 + agg.newsCount * 0.08;
    const liftScore = lift >= 1 ? lift : 0.45;
    const score = liftScore * scarcity * promoGap * newsBoost * (1 + volume);
    facts.push({
      city: agg.city,
      sku: agg.sku,
      product: agg.product,
      waRecent7: agg.waRecent7,
      waPrior21: agg.waPrior21,
      lift: Math.round(lift * 100) / 100,
      onHand: agg.onHand,
      target: agg.target,
      stockPct,
      activePromo: agg.activePromo,
      newsCount: agg.newsCount,
      score: Math.round(score * 100) / 100,
      action,
    });
  }

  await clearTake(ctx, () => ctx.db.query("insightFacts").take(64));
  for (const city of CITIES) {
    await clearTake(ctx, () =>
      ctx.db
        .query("signals")
        .withIndex("by_city", (q) => q.eq("city", city))
        .take(64),
    );
  }
  if (replaceRecommendations) {
    for (const state of ["pending", "approved", "rejected"] as const) {
      await clearTake(ctx, () =>
        ctx.db
          .query("recommendations")
          .withIndex("by_status", (q) => q.eq("status", state))
          .take(64),
      );
    }
  }

  for (const fact of facts) await ctx.db.insert("insightFacts", fact);

  const heroes = [];
  for (const city of CITIES) {
    const local = facts.filter((row) => row.city === city);
    local.sort((a, b) => b.score - a.score);
    const hero = local[0];
    if (!hero) continue;
    heroes.push(hero);

    const waLevel = clamp(Math.round(hero.lift * 22 + hero.waRecent7 / 4), 0, 100);
    const expected = Math.round((hero.waPrior21 / 21) * 7);
    await ctx.db.insert("signals", {
      city,
      source: "whatsapp",
      product: hero.product,
      summary: `${hero.waRecent7} consultas inbound en 7 días vs ${expected} esperadas (×${hero.lift.toFixed(1)}).`,
      level: waLevel,
    });
    await ctx.db.insert("signals", {
      city,
      source: "inventario",
      product: hero.product,
      summary: `Stock zonal al ${hero.stockPct}% (${hero.onHand} de ${hero.target} unidades objetivo).`,
      level: hero.stockPct,
    });
    await ctx.db.insert("signals", {
      city,
      source: "promocion",
      product: hero.product,
      summary: hero.activePromo
        ? "Hay promoción vigente en catálogo para este producto."
        : "No hay promoción local activa.",
      level: hero.activePromo ? 60 : 0,
    });

    if (!replaceRecommendations) continue;
    if (hero.action !== "restock" && hero.action !== "restock_promo") continue;

    const units = restockUnits(hero.target, hero.onHand);
    const promoDays = hero.action === "restock_promo" ? 7 : 0;
    const relatedNews = news
      .filter(
        (item) =>
          item.cityTags.includes(city) &&
          item.skuTags.includes(hero.sku) &&
          item.publishedAt >= AS_OF - 21 * DAY_MS,
      )
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 2)
      .map((item) => item.title);

    const headline =
      promoDays > 0
        ? `Reabastecer ${units} unidades de ${hero.product} y activar una promo local por ${promoDays} días.`
        : `Reabastecer ${units} unidades de ${hero.product} en la zona.`;

    const newsLine =
      relatedNews.length > 0
        ? ` Noticias coincidentes: ${relatedNews.join(" · ")}.`
        : "";

    const detail =
      `WhatsApp: ${hero.waRecent7} consultas de ${hero.product} en 7 días en ${city} contra un baseline de ${expected} (×${hero.lift.toFixed(1)}). ` +
      `Inventario: ${hero.onHand}/${hero.target} unidades (${hero.stockPct}%). ` +
      (hero.activePromo
        ? "Ya hay una promo vigente."
        : "No hay promo local activa.") +
      newsLine;

    await ctx.db.insert("recommendations", {
      city,
      product: hero.product,
      headline,
      detail,
      status: "pending",
      proposedBy: "analista-comercial",
      decidedBy: null,
      restockUnits: units,
      promoDays: promoDays || undefined,
    });
  }

  return {
    ready: true,
    facts: facts.length,
    cities: heroes.map((hero) => ({
      city: hero.city,
      sku: hero.sku,
      product: hero.product,
      action: hero.action,
      score: hero.score,
      lift: hero.lift,
      stockPct: hero.stockPct,
      waRecent7: hero.waRecent7,
    })),
  };
}

export const rebuildBoard = internalMutation({
  args: { replaceRecommendations: v.boolean() },
  returns: rebuildResult,
  handler: async (ctx, args) => rebuild(ctx, args.replaceRecommendations),
});

export const runRebuild = mutation({
  args: { replaceRecommendations: v.optional(v.boolean()) },
  returns: rebuildResult,
  handler: async (ctx, args) => rebuild(ctx, args.replaceRecommendations ?? true),
});

export const datasetStats = query({
  args: {},
  returns: v.object({
    catalogItems: v.number(),
    pharmacyBranches: v.number(),
    waMessages: v.number(),
    waInbound: v.number(),
    waDaily: v.number(),
    inventoryPositions: v.number(),
    promoCalendar: v.number(),
    newsItems: v.number(),
    insightFacts: v.number(),
    asOf: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const meta = await ctx.db
      .query("opsMeta")
      .withIndex("by_key", (q) => q.eq("key", "counts"))
      .unique();
    const facts = await ctx.db.query("insightFacts").take(80);
    return {
      catalogItems: meta?.catalogItems ?? 0,
      pharmacyBranches: meta?.pharmacyBranches ?? 0,
      waMessages: meta?.waMessages ?? 0,
      waInbound: meta?.waInbound ?? 0,
      waDaily: meta?.waDaily ?? 0,
      inventoryPositions: meta?.inventoryPositions ?? 0,
      promoCalendar: meta?.promoCalendar ?? 0,
      newsItems: meta?.newsItems ?? 0,
      insightFacts: facts.length,
      asOf: meta?.asOf ?? null,
    };
  },
});
