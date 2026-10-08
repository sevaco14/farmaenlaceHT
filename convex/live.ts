import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

export const CITIES = ["guayaquil", "quito", "cuenca"] as const;
type City = (typeof CITIES)[number];

const CITY_LABEL: Record<City, string> = { guayaquil: "Guayaquil", quito: "Quito", cuenca: "Cuenca" };
const CITY_CODE: Record<City, string> = { guayaquil: "GYE", quito: "UIO", cuenca: "CUE" };
const CITY_WEIGHT: Record<City, number> = { guayaquil: 1, quito: 0.75, cuenca: 0.45 };

const TICK_MS = 2200;
const FAST_TICK_MS = 650;
const SIM_START = Date.parse("2026-10-08T08:00:00-05:00");
const SIM_MINUTES_PER_TICK = 10;
const ALIVE_MS = 3 * 60_000;
const EVENT_TTL_MS = 20 * 60_000;
const PRODUCTS_PER_CITY = 9;
const PROMO_TICKS = 7 * 24 * 6;

const FALLBACK_CATALOG = [
  { sku: "FE-VC500", name: "Vitamina C", category: "vitaminas" },
  { sku: "FE-PARA500", name: "Paracetamol 500 mg", category: "analgesicos" },
  { sku: "FE-IBU400", name: "Ibuprofeno 400 mg", category: "analgesicos" },
  { sku: "FE-ALC70", name: "Alcohol 70%", category: "antisepticos" },
  { sku: "FE-SUN50", name: "Protector solar", category: "dermocosmetica" },
  { sku: "FE-LOR10", name: "Loratadina 10 mg", category: "antihistaminicos" },
  { sku: "FE-OMEP20", name: "Omeprazol 20 mg", category: "gastro" },
  { sku: "FE-LOS50", name: "Losartán 50 mg", category: "cardiovascular" },
  { sku: "FE-MET850", name: "Metformina 850 mg", category: "metabolico" },
  { sku: "FE-AMX500", name: "Amoxicilina 500 mg", category: "antibioticos" },
  { sku: "FE-SAL100", name: "Suero oral", category: "hidratacion" },
  { sku: "FE-GAS10", name: "Gasas estériles", category: "curacion" },
  { sku: "FE-DIAP", name: "Pañales", category: "infantil" },
  { sku: "FE-JAB", name: "Jabón antibacterial", category: "higiene" },
  { sku: "FE-MAG", name: "Magnesio + B6", category: "vitaminas" },
];

const TRENDS: Record<string, string[]> = {
  "FE-VC500": ["temporada de gripe en la zona", "campaña escolar de defensas"],
  "FE-SAL100": ["ola de calor de 34 °C", "brote de gastroenteritis"],
  "FE-SUN50": ["índice UV extremo", "feriado de playa"],
  "FE-LOR10": ["alta concentración de polen"],
  "FE-PARA500": ["brote de influenza estacional"],
  "FE-IBU400": ["maratón de la ciudad este fin de semana"],
  "FE-ALC70": ["alerta sanitaria local"],
  "FE-MAG": ["tendencia en redes sobre magnesio"],
  "FE-JAB": ["campaña de lavado de manos en escuelas"],
};

const ASKS = [
  (p: string) => `¿Tienen ${p} en la sucursal?`,
  (p: string) => `¿Cuánto cuesta ${p}?`,
  (p: string) => `¿Hay promo en ${p}?`,
  (p: string) => `Necesito 2 cajas de ${p}, ¿me las separan?`,
  (p: string) => `¿Hacen delivery de ${p}?`,
  (p: string) => `Busco ${p}, ¿les queda?`,
];

const codeValidator = v.union(v.literal("WA"), v.literal("INV"), v.literal("PRO"), v.literal("ORD"));

type Row = Doc<"liveStock">;
type Code = "WA" | "INV" | "PRO" | "ORD";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle<T>(list: readonly T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function poisson(lambda: number) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

function spoken(product: string) {
  return /^[A-Z][a-zá-ú]+( [a-zá-ú]+)?$/.test(product) ? product.toLowerCase() : product;
}

function stockPct(row: Pick<Row, "onHand" | "target">) {
  return row.target > 0 ? Math.round((100 * row.onHand) / row.target) : 0;
}

function liftOf(row: Pick<Row, "waRate" | "baseRate">) {
  return row.baseRate > 0 ? row.waRate / row.baseRate : 1;
}

function promoLive(row: Pick<Row, "promoUntil">, tick: number) {
  return row.promoUntil > tick;
}

function scoreOf(row: Row, tick: number) {
  const lift = Math.max(0.5, liftOf(row));
  const scarcity = 1 - stockPct(row) / 100;
  const promoGap = promoLive(row, tick) ? 0.6 : row.seasonPromo ? 0.9 : 1.3;
  return lift * scarcity * promoGap;
}

function band(pct: number) {
  if (pct < 20) return 3;
  if (pct < 30) return 2;
  if (pct < 50) return 1;
  return 0;
}

function asCity(city: string): City | null {
  return (CITIES as readonly string[]).includes(city) ? (city as City) : null;
}

async function getClock(ctx: MutationCtx) {
  return await ctx.db
    .query("liveClock")
    .withIndex("by_key", (q) => q.eq("key", "main"))
    .unique();
}

async function logEvent(
  ctx: MutationCtx,
  tick: number,
  city: string,
  code: Code,
  product: string,
  text: string,
) {
  await ctx.db.insert("liveEvents", { at: Date.now(), tick, city, code, product, text });
}

async function pendingFor(ctx: MutationCtx, city: string) {
  const rows = await ctx.db
    .query("recommendations")
    .withIndex("by_status", (q) => q.eq("status", "pending"))
    .take(20);
  return rows.find((row) => row.city === city) ?? null;
}

async function writeSignals(ctx: MutationCtx, row: Row, tick: number) {
  const lift = liftOf(row);
  const pct = stockPct(row);
  const promo = promoLive(row, tick);
  const values = {
    whatsapp: {
      level: clamp(Math.round(20 + (lift - 1) * 58), 0, 100),
      summary: `${Math.round(row.waRate * 6)} consultas por hora sobre ${row.product} (×${lift.toFixed(1)} sobre lo normal).`,
    },
    inventario: {
      level: pct,
      summary: `Stock zonal al ${pct}% (${row.onHand} de ${row.target} u.).`,
    },
    promocion: {
      level: promo ? 100 : row.seasonPromo ? 60 : 0,
      summary: promo
        ? "Promo local SmartClub activa por 7 días."
        : row.seasonPromo
          ? "Promo de temporada vigente en catálogo."
          : "No hay promoción local activa.",
    },
  };
  const existing = await ctx.db
    .query("signals")
    .withIndex("by_city", (q) => q.eq("city", row.city))
    .take(12);
  for (const source of ["whatsapp", "inventario", "promocion"] as const) {
    const found = existing.find((signal) => signal.source === source && signal.product === row.product);
    if (found) await ctx.db.patch(found._id, values[source]);
    else await ctx.db.insert("signals", { city: row.city, source, product: row.product, ...values[source] });
  }
  for (const signal of existing) {
    if (signal.product !== row.product) await ctx.db.delete(signal._id);
  }
}

async function maybePropose(ctx: MutationCtx, city: City, row: Row, tick: number) {
  if (row.snoozeUntil > tick) return;
  const lift = liftOf(row);
  const pct = stockPct(row);
  const promo = promoLive(row, tick) || row.seasonPromo;
  const withPromo = lift >= 1.7 && pct < 32 && !promo;
  const restockOnly = pct < 15;
  if (!withPromo && !restockOnly) return;

  const units = Math.max(50, Math.round((row.target * 0.8 - row.onHand) / 50) * 50);
  const label = CITY_LABEL[city];
  const headline = withPromo
    ? `Reabastecer ${units} unidades de ${row.product} y activar una promo local por 7 días.`
    : `Reabastecer ${units} unidades de ${row.product} en la zona.`;
  const context = row.trend ? ` Contexto: ${row.trend}.` : "";
  const detail = withPromo
    ? `Hay un aumento inusual de consultas sobre ${row.product} en ${label} (×${lift.toFixed(1)}). El stock está al ${pct}% y no hay promoción activa en esa zona.${context} Recomiendo reabastecer ${units} unidades y activar una promo local por 7 días.`
    : `El stock de ${row.product} en ${label} está al ${pct}% y la demanda sigue.${context} Recomiendo reabastecer ${units} unidades.`;

  await ctx.db.insert("recommendations", {
    city,
    product: row.product,
    headline,
    detail,
    status: "pending",
    proposedBy: "analista-comercial",
    decidedBy: null,
    restockUnits: units,
    promoDays: withPromo ? 7 : undefined,
  });
  await logEvent(ctx, tick, city, "ORD", row.product, `Nueva orden por firmar: ${units} u. de ${row.product}${withPromo ? " + promo 7 días" : ""}.`);
}

async function maybeStartTrend(ctx: MutationCtx, city: City, rows: Row[], tick: number) {
  if (rows.some((row) => row.heatTarget > 1.2)) return;
  if (Math.random() > 0.06) return;
  const candidates = rows.filter((row) => TRENDS[row.sku] && row.snoozeUntil <= tick && !promoLive(row, tick));
  if (candidates.length === 0) return;
  const row = pick(candidates);
  const trend = pick(TRENDS[row.sku]);
  await ctx.db.patch(row._id, { heatTarget: 2.6 + Math.random() * 0.7, trend });
  await logEvent(ctx, tick, city, "PRO", row.product, `Tendencia en ${CITY_LABEL[city]}: ${trend}. Sube la demanda de ${row.product}.`);
}

async function step(ctx: MutationCtx, tick: number) {
  for (const city of CITIES) {
    const rows = await ctx.db
      .query("liveStock")
      .withIndex("by_city", (q) => q.eq("city", city))
      .take(20);
    if (rows.length === 0) continue;
    const label = CITY_LABEL[city];
    const asks: { row: Row; weight: number }[] = [];
    const next: Row[] = [];

    for (const row of rows) {
      const promo = promoLive(row, tick);
      const heat = row.heat + clamp(row.heatTarget - row.heat, -0.08, 0.16);
      const inbound = poisson(row.baseRate * heat * (promo ? 0.85 : 1));
      const waRate = row.waRate * 0.75 + inbound * 0.25;
      const sold = poisson(row.salesRate * (0.6 + 0.5 * heat) * (promo ? 1.25 : 1));
      let onHand = Math.max(0, row.onHand - sold);

      if (heat < 1.15 && onHand / row.target < 0.4 && Math.random() < 0.3) {
        const added = Math.round(row.target * 0.45);
        onHand += added;
        await logEvent(ctx, tick, city, "INV", row.product, `Reposición programada desde el CD: +${added} u. de ${row.product}.`);
      }

      const pct = stockPct({ onHand, target: row.target });
      const nowBand = band(pct);
      if (nowBand > row.lastBand && heat >= 1.15) {
        await logEvent(ctx, tick, city, "INV", row.product, `Stock de ${row.product} en ${label} baja al ${pct}%.`);
      }
      const heatTarget = row.heatTarget > 1 && heat >= row.heatTarget - 0.05 && Math.random() < 0.01 ? 1 : row.heatTarget;
      const patch = {
        heat: Math.round(heat * 100) / 100,
        heatTarget,
        trend: heatTarget > 1.05 ? row.trend : null,
        waRate: Math.round(waRate * 1000) / 1000,
        onHand,
        lastBand: nowBand,
      };
      await ctx.db.patch(row._id, patch);
      const updated = { ...row, ...patch };
      next.push(updated);
      if (inbound > 0) asks.push({ row: updated, weight: inbound });
    }

    const total = asks.reduce((sum, item) => sum + item.weight, 0);
    const messages = Math.min(2, total);
    for (let i = 0; i < messages; i++) {
      let roll = Math.random() * total;
      const chosen = asks.find((item) => (roll -= item.weight) <= 0) ?? asks[0];
      const branch = `${CITY_CODE[city]}-${String(1 + Math.floor(Math.random() * 40)).padStart(3, "0")}`;
      await logEvent(ctx, tick, city, "WA", chosen.row.product, `“${pick(ASKS)(spoken(chosen.row.product))}” · ${branch}`);
    }

    await maybeStartTrend(ctx, city, next, tick);

    const pending = await pendingFor(ctx, city);
    const hero = pending
      ? (next.find((row) => row.product === pending.product) ?? null)
      : [...next].sort((a, b) => scoreOf(b, tick) - scoreOf(a, tick))[0];
    if (!hero) continue;
    await writeSignals(ctx, hero, tick);
    if (!pending) await maybePropose(ctx, city, hero, tick);
  }
}

async function prune(ctx: MutationCtx) {
  const cutoff = Date.now() - EVENT_TTL_MS;
  const old = await ctx.db
    .query("liveEvents")
    .withIndex("by_at", (q) => q.lt("at", cutoff))
    .take(40);
  for (const row of old) await ctx.db.delete(row._id);
}

async function startChain(ctx: MutationCtx, clock: Doc<"liveClock">, delay: number) {
  const generation = clock.generation + 1;
  await ctx.db.patch(clock._id, { generation, scheduled: true });
  await ctx.scheduler.runAfter(delay, internal.live.tick, { generation });
}

async function catalogOf(ctx: MutationCtx) {
  const rows = await ctx.db.query("catalogItems").withIndex("by_sku").take(60);
  if (rows.length >= PRODUCTS_PER_CITY) {
    return rows.map((row) => ({ sku: row.sku, name: row.name, category: row.category }));
  }
  return FALLBACK_CATALOG;
}

/** Wipes the live world and the board, then deals each city a fresh assortment and trend. */
export async function resetWorld(ctx: MutationCtx) {
  const drain = async (read: () => Promise<{ _id: Parameters<MutationCtx["db"]["delete"]>[0] }[]>) => {
    for (;;) {
      const rows = await read();
      if (rows.length === 0) break;
      for (const row of rows) await ctx.db.delete(row._id);
    }
  };
  await drain(() => ctx.db.query("liveStock").take(100));
  await drain(() => ctx.db.query("liveEvents").take(100));
  await drain(() => ctx.db.query("signals").take(100));
  await drain(() => ctx.db.query("recommendations").take(100));

  const catalog = await catalogOf(ctx);
  const trendSkus = shuffle(catalog.filter((item) => TRENDS[item.sku]).map((item) => item.sku));

  for (const [index, city] of CITIES.entries()) {
    const weight = CITY_WEIGHT[city];
    const trendSku = index < 2 ? trendSkus[index] : null;
    const others = shuffle(catalog.filter((item) => item.sku !== trendSku)).slice(0, trendSku ? PRODUCTS_PER_CITY - 1 : PRODUCTS_PER_CITY);
    const assortment = trendSku ? [catalog.find((item) => item.sku === trendSku)!, ...others] : others;

    for (const item of assortment) {
      const trending = item.sku === trendSku;
      const target = Math.round((500 + Math.random() * 900) * weight / 10) * 10;
      const baseRate = Math.round((trending ? 0.7 : 0.2 + Math.random() * 0.5) * weight * 1000) / 1000;
      const start = trending ? (index === 0 ? 0.42 : 0.62) : 0.55 + Math.random() * 0.4;
      const heat = trending ? (index === 0 ? 1.5 : 1.15) : 1;
      const trend = trending ? pick(TRENDS[item.sku]) : null;
      const onHand = Math.round(target * start);
      await ctx.db.insert("liveStock", {
        city,
        sku: item.sku,
        product: item.name,
        category: item.category,
        onHand,
        target,
        baseRate,
        waRate: baseRate * heat,
        salesRate: Math.round(target * (trending ? 0.0094 : 0.006) * 100) / 100,
        heat,
        heatTarget: trending ? (index === 0 ? 3 : 2.7) : 1,
        trend,
        promoUntil: 0,
        seasonPromo: !trending && Math.random() < 0.25,
        snoozeUntil: 0,
        lastBand: band(Math.round(start * 100)),
      });
      if (trending && trend) {
        await logEvent(ctx, 0, city, "PRO", item.name, `Tendencia en ${CITY_LABEL[city]}: ${trend}. Sube la demanda de ${item.name}.`);
      }
    }
  }

  await step(ctx, 0);

  const now = Date.now();
  const clock = await getClock(ctx);
  if (clock) {
    await ctx.db.patch(clock._id, { running: true, tick: 0, aliveUntil: now + ALIVE_MS });
    const fresh = await ctx.db.get(clock._id);
    if (fresh) await startChain(ctx, fresh, 1200);
  } else {
    const id = await ctx.db.insert("liveClock", {
      key: "main",
      running: true,
      fast: false,
      tick: 0,
      generation: 0,
      aliveUntil: now + ALIVE_MS,
      scheduled: false,
    });
    const fresh = await ctx.db.get(id);
    if (fresh) await startChain(ctx, fresh, 1200);
  }
}

export async function hasWorld(ctx: MutationCtx) {
  return (await getClock(ctx)) !== null;
}

/** Applies a signed or rejected order to the live world so the next ticks follow from it. */
export async function applyDecision(
  ctx: MutationCtx,
  recommendation: Doc<"recommendations">,
  decision: "approve" | "reject",
) {
  const city = asCity(recommendation.city);
  if (!city) return;
  const clock = await getClock(ctx);
  const tick = clock?.tick ?? 0;
  const rows = await ctx.db
    .query("liveStock")
    .withIndex("by_city", (q) => q.eq("city", city))
    .take(20);
  const row = rows.find((item) => item.product === recommendation.product);
  if (!row) return;

  if (decision === "approve") {
    const units = recommendation.restockUnits ?? 500;
    const days = recommendation.promoDays ?? 0;
    const onHand = row.onHand + units;
    await ctx.db.patch(row._id, {
      onHand,
      promoUntil: days > 0 ? tick + PROMO_TICKS : row.promoUntil,
      heatTarget: 1,
      trend: null,
      snoozeUntil: tick + 60,
      lastBand: band(stockPct({ onHand, target: row.target })),
    });
    await logEvent(ctx, tick, city, "ORD", row.product, `Orden liberada por primera línea: +${units} u. de ${row.product}${days > 0 ? " y promo SmartClub 7 días" : ""}.`);
  } else {
    await ctx.db.patch(row._id, { snoozeUntil: tick + 36 });
    await logEvent(ctx, tick, city, "ORD", row.product, `Orden de ${row.product} rechazada. Los agentes siguen observando.`);
  }

  const updated = await ctx.db.get(row._id);
  if (updated) await writeSignals(ctx, updated, tick);
}

export const tick = internalMutation({
  args: { generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clock = await getClock(ctx);
    if (!clock || clock.generation !== args.generation) return null;
    if (!clock.running || Date.now() > clock.aliveUntil) {
      await ctx.db.patch(clock._id, { scheduled: false });
      return null;
    }
    const next = clock.tick + 1;
    await step(ctx, next);
    await prune(ctx);
    await ctx.db.patch(clock._id, { tick: next, scheduled: true });
    await ctx.scheduler.runAfter(clock.fast ? FAST_TICK_MS : TICK_MS, internal.live.tick, {
      generation: clock.generation,
    });
    return null;
  },
});

export const heartbeat = mutation({
  args: {},
  returns: v.object({ running: v.boolean() }),
  handler: async (ctx) => {
    const clock = await getClock(ctx);
    if (!clock) {
      await resetWorld(ctx);
      return { running: true };
    }
    await ctx.db.patch(clock._id, { aliveUntil: Date.now() + ALIVE_MS });
    if (clock.running && !clock.scheduled) await startChain(ctx, clock, 300);
    return { running: clock.running };
  },
});

export const setRunning = mutation({
  args: { running: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clock = await getClock(ctx);
    if (!clock) return null;
    await ctx.db.patch(clock._id, { running: args.running, aliveUntil: Date.now() + ALIVE_MS });
    if (args.running && !clock.scheduled) await startChain(ctx, clock, 200);
    return null;
  },
});

export const setFast = mutation({
  args: { fast: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const clock = await getClock(ctx);
    if (!clock) return null;
    await ctx.db.patch(clock._id, { fast: args.fast });
    return null;
  },
});

/** Jumps the simulation one hour ahead in a single transaction. */
export const advance = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const clock = await getClock(ctx);
    if (!clock) return null;
    let tick = clock.tick;
    for (let i = 0; i < 6; i++) {
      tick += 1;
      await step(ctx, tick);
    }
    await ctx.db.patch(clock._id, { tick, aliveUntil: Date.now() + ALIVE_MS });
    return null;
  },
});

const shelfValidator = v.object({
  sku: v.string(),
  product: v.string(),
  category: v.string(),
  stockPct: v.number(),
  trend: v.union(v.string(), v.null()),
});

export const world = query({
  args: {},
  returns: v.object({
    clock: v.union(
      v.null(),
      v.object({ running: v.boolean(), fast: v.boolean(), tick: v.number(), simTime: v.number() }),
    ),
    cities: v.array(
      v.object({
        city: v.string(),
        trend: v.union(v.string(), v.null()),
        shelves: v.array(shelfValidator),
      }),
    ),
    events: v.array(
      v.object({
        id: v.id("liveEvents"),
        simTime: v.number(),
        city: v.string(),
        code: codeValidator,
        product: v.string(),
        text: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const clock = await ctx.db
      .query("liveClock")
      .withIndex("by_key", (q) => q.eq("key", "main"))
      .unique();
    const tick = clock?.tick ?? 0;
    const cities = [];
    for (const city of CITIES) {
      const rows = await ctx.db
        .query("liveStock")
        .withIndex("by_city", (q) => q.eq("city", city))
        .take(20);
      const ranked = [...rows].sort((a, b) => scoreOf(b, tick) - scoreOf(a, tick));
      cities.push({
        city,
        trend: rows.find((row) => row.trend)?.trend ?? null,
        shelves: ranked.slice(0, 6).map((row) => ({
          sku: row.sku,
          product: row.product,
          category: row.category,
          stockPct: stockPct(row),
          trend: row.trend,
        })),
      });
    }
    const events = await ctx.db.query("liveEvents").withIndex("by_at").order("desc").take(48);
    return {
      clock: clock
        ? {
            running: clock.running,
            fast: clock.fast,
            tick,
            simTime: SIM_START + tick * SIM_MINUTES_PER_TICK * 60_000,
          }
        : null,
      cities,
      events: events.map((row) => ({
        id: row._id,
        simTime: SIM_START + row.tick * SIM_MINUTES_PER_TICK * 60_000,
        city: row.city,
        code: row.code,
        product: row.product,
        text: row.text,
      })),
    };
  },
});
