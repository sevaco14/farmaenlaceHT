import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
  const gap = Math.max(0, target - onHand);
  const rounded = Math.round(gap / 50) * 50;
  return Math.max(50, rounded);
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
  },
  returns: v.object({ recommendationId: v.union(v.id("recommendations"), v.null()) }),
  handler: async (ctx, args) => {
    const byRole = new Map(args.agents.map((a) => [a.role, a]));

    for (const role of ["whatsapp", "inventario", "promocion"] as const) {
      const out = byRole.get(role);
      if (!out) continue;
      const rows = await ctx.db
        .query("signals")
        .withIndex("by_city", (q) => q.eq("city", args.city))
        .take(12);
      const existing = rows.find(
        (row) => row.source === role && row.product === args.product,
      );
      const patch = {
        summary: out.summary,
        level: clamp(Math.round(out.level), 0, 100),
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

    const wa = byRole.get("whatsapp");
    const inv = byRole.get("inventario");
    const pro = byRole.get("promocion");
    const stockPct =
      inv?.level ??
      (args.inventoryTarget > 0
        ? Math.round((args.inventoryOnHand / args.inventoryTarget) * 100)
        : 0);

    const needsAction =
      (args.lift >= 1.5 && stockPct < 35 && !args.activePromo) ||
      (stockPct < 25 && args.waRecent7 >= 8);

    const pending = await ctx.db
      .query("recommendations")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(20);
    for (const row of pending) {
      if (row.city === args.city) await ctx.db.delete(row._id);
    }

    if (!needsAction && stockPct >= 40 && (args.lift < 1.3 || args.activePromo)) {
      return { recommendationId: null };
    }

    const units = restockUnits(args.inventoryTarget, args.inventoryOnHand);
    const promoDays =
      !args.activePromo && stockPct < 35 && (args.lift >= 1.4 || args.waRecent7 >= 12)
        ? 7
        : 0;

    const headline =
      promoDays > 0
        ? `Reabastecer ${units} unidades de ${args.product} y activar una promo local por ${promoDays} días.`
        : `Reabastecer ${units} unidades de ${args.product} en la zona.`;

    const detailParts = [
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
    });

    return { recommendationId: id };
  },
});
