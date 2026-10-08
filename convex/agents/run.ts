"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  INVENTARIO_INSTRUCTIONS,
  PROMOCION_INSTRUCTIONS,
  WHATSAPP_INSTRUCTIONS,
} from "./instructions";
import { bedrockConfigured, runAgentWithTools, type AgentJson, type ToolSpec } from "./bedrock";

const agentOut = v.object({
  role: v.union(
    v.literal("whatsapp"),
    v.literal("inventario"),
    v.literal("promocion"),
  ),
  summary: v.string(),
  level: v.number(),
  rationale: v.string(),
});

const CITY_PRODUCT: Record<string, string> = {
  guayaquil: "Vitamina C",
  quito: "Protector solar",
  cuenca: "Alcohol 70%",
};

const citySkuSchema = {
  type: "object",
  properties: {
    city: { type: "string", description: "Ciudad en minúsculas, ej. guayaquil" },
    sku: { type: "string", description: "SKU del catálogo, ej. FE-VC500" },
  },
  required: ["city", "sku"],
};

function whatsappTools(): ToolSpec[] {
  return [
    {
      name: "get_whatsapp_metrics",
      description:
        "Consultas WhatsApp agregadas: últimos 7 días, baseline 21 días, lift y noticias.",
      inputSchema: citySkuSchema,
    },
    {
      name: "get_recent_wa_messages",
      description: "Muestra textos recientes de clientes para el SKU en la ciudad.",
      inputSchema: citySkuSchema,
    },
  ];
}

function inventarioTools(): ToolSpec[] {
  return [
    {
      name: "get_inventory_position",
      description: "Stock agregado onHand/target y stockPct por ciudad y SKU.",
      inputSchema: citySkuSchema,
    },
    {
      name: "get_critical_branches",
      description: "Sucursales con menor cobertura de stock en la ciudad.",
      inputSchema: citySkuSchema,
    },
  ];
}

function promoTools(): ToolSpec[] {
  return [
    {
      name: "get_promo_calendar",
      description: "Promociones SmartClub registradas para ciudad y SKU.",
      inputSchema: citySkuSchema,
    },
    {
      name: "get_catalog_item",
      description: "Ficha básica del producto en catálogo Farmaenlace.",
      inputSchema: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
    },
  ];
}

function fallbackAgent(
  role: "whatsapp" | "inventario" | "promocion",
  wa: { lift: number; waRecent7: number },
  inv: { stockPct: number; onHand: number; target: number },
  pro: { activePromo: boolean },
  product: string,
  city: string,
): AgentJson {
  if (role === "whatsapp") {
    const hot = wa.lift >= 1.5 || wa.waRecent7 >= 12;
    return {
      summary: hot
        ? `Aumento inusual de consultas de clientes sobre ${product} en ${city}.`
        : `Consultas estables sobre ${product} en ${city}.`,
      level: hot ? Math.min(95, Math.round(40 + wa.lift * 20)) : Math.round(25 + wa.waRecent7),
      rationale: `${wa.waRecent7} consultas en 7 días, lift ×${wa.lift.toFixed(1)}.`,
    };
  }
  if (role === "inventario") {
    return {
      summary:
        inv.stockPct < 30
          ? `Stock al ${inv.stockPct}% en la zona de ${city}.`
          : `Cobertura de stock al ${inv.stockPct}% en ${city}.`,
      level: inv.stockPct,
      rationale: `${inv.onHand}/${inv.target} unidades agregadas.`,
    };
  }
  return {
    summary: pro.activePromo
      ? "Promo de temporada ya vigente en la zona."
      : "No hay promoción local activa.",
    level: pro.activePromo ? 60 : 0,
    rationale: pro.activePromo ? "SmartClub activo." : "Oportunidad de promo local si hay presión.",
  };
}

export const analyzeCity = action({
  args: {
    city: v.string(),
    product: v.optional(v.string()),
    sku: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    mode: v.union(v.literal("bedrock"), v.literal("fallback")),
    agents: v.array(agentOut),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const city = args.city.toLowerCase();
    const resolved = await ctx.runQuery(internal.agentData.resolveSku, {
      city,
      product: args.product ?? CITY_PRODUCT[city],
      sku: args.sku,
    });

    const wa = await ctx.runQuery(internal.agentData.whatsappMetrics, {
      city,
      sku: resolved.sku,
    });
    const inv = await ctx.runQuery(internal.agentData.inventoryMetrics, {
      city,
      sku: resolved.sku,
    });
    const pro = await ctx.runQuery(internal.agentData.promoMetrics, {
      city,
      sku: resolved.sku,
    });

    const toolCtx = { city, sku: resolved.sku };

    async function executeTool(name: string, input: Record<string, unknown>) {
      const c = String(input.city ?? toolCtx.city);
      const s = String(input.sku ?? toolCtx.sku);
      switch (name) {
        case "get_whatsapp_metrics":
          return ctx.runQuery(internal.agentData.whatsappMetrics, { city: c, sku: s });
        case "get_recent_wa_messages": {
          const metrics = await ctx.runQuery(internal.agentData.whatsappMetrics, {
            city: c,
            sku: s,
          });
          return { sampleMessages: metrics.sampleMessages, newsTitles: metrics.newsTitles };
        }
        case "get_inventory_position":
          return ctx.runQuery(internal.agentData.inventoryMetrics, { city: c, sku: s });
        case "get_critical_branches": {
          const metrics = await ctx.runQuery(internal.agentData.inventoryMetrics, {
            city: c,
            sku: s,
          });
          return { criticalBranches: metrics.criticalBranches };
        }
        case "get_promo_calendar":
          return ctx.runQuery(internal.agentData.promoMetrics, { city: c, sku: s });
        case "get_catalog_item": {
          const sku = String(input.sku ?? s);
          const metrics = await ctx.runQuery(internal.agentData.promoMetrics, {
            city: c,
            sku,
          });
          return { sku, product: metrics.product };
        }
        default:
          return { error: `unknown_tool:${name}` };
      }
    }

    const userTask = `Analiza la ciudad "${city}" para el producto "${resolved.product}" (SKU ${resolved.sku}). Usa las herramientas antes de concluir.`;

    let mode: "bedrock" | "fallback" = "bedrock";
    let error: string | undefined;
    let agents: Array<AgentJson & { role: "whatsapp" | "inventario" | "promocion" }>;

    if (!bedrockConfigured()) {
      mode = "fallback";
      error = "Faltan AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION en Convex.";
      agents = [
        { role: "whatsapp", ...fallbackAgent("whatsapp", wa, inv, pro, resolved.product, city) },
        { role: "inventario", ...fallbackAgent("inventario", wa, inv, pro, resolved.product, city) },
        { role: "promocion", ...fallbackAgent("promocion", wa, inv, pro, resolved.product, city) },
      ];
    } else {
      try {
        const [waOut, invOut, proOut] = await Promise.all([
          runAgentWithTools({
            system: WHATSAPP_INSTRUCTIONS,
            userTask,
            tools: whatsappTools(),
            executeTool,
          }),
          runAgentWithTools({
            system: INVENTARIO_INSTRUCTIONS,
            userTask,
            tools: inventarioTools(),
            executeTool,
          }),
          runAgentWithTools({
            system: PROMOCION_INSTRUCTIONS,
            userTask,
            tools: promoTools(),
            executeTool,
          }),
        ]);
        agents = [
          { role: "whatsapp", ...waOut },
          { role: "inventario", ...invOut },
          { role: "promocion", ...proOut },
        ];
      } catch (e) {
        mode = "fallback";
        error = e instanceof Error ? e.message : "bedrock_error";
        agents = [
          { role: "whatsapp", ...fallbackAgent("whatsapp", wa, inv, pro, resolved.product, city) },
          { role: "inventario", ...fallbackAgent("inventario", wa, inv, pro, resolved.product, city) },
          { role: "promocion", ...fallbackAgent("promocion", wa, inv, pro, resolved.product, city) },
        ];
      }
    }

    await ctx.runMutation(internal.agentApply.applyAgentRun, {
      city,
      product: resolved.product,
      sku: resolved.sku,
      agents,
      inventoryOnHand: inv.onHand,
      inventoryTarget: inv.target,
      waRecent7: wa.waRecent7,
      lift: wa.lift,
      activePromo: pro.activePromo,
    });

    return { ok: true, mode, agents, error };
  },
});
