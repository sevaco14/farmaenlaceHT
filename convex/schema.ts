import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const proposalStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("uncertain"),
);

const journalKind = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("stale"),
);

export default defineSchema({
  floors: defineTable({
    slug: v.string(),
    name: v.string(),
  }).index("by_slug", ["slug"]),

  skus: defineTable({
    sku: v.string(),
    name: v.string(),
    keywords: v.string(),
  })
    .index("by_sku", ["sku"])
    .searchIndex("search_keywords", { searchField: "keywords" }),

  offers: defineTable({
    sku: v.string(),
    floorSlug: v.string(),
    quantity: v.number(),
    priceCents: v.number(),
    version: v.number(),
  })
    .index("by_sku_and_floor", ["sku", "floorSlug"])
    .index("by_sku", ["sku"]),

  proposals: defineTable({
    sku: v.string(),
    floorSlug: v.string(),
    quantity: v.number(),
    offerVersion: v.number(),
    unitPriceCents: v.number(),
    totalCents: v.number(),
    status: proposalStatus,
    idempotencyKey: v.string(),
    proposedBy: v.string(),
    decidedBy: v.union(v.string(), v.null()),
    expiresAt: v.number(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status", ["status"]),

  journal: defineTable({
    proposalId: v.id("proposals"),
    kind: journalKind,
    actor: v.string(),
    at: v.number(),
  }).index("by_proposal", ["proposalId"]),

  signals: defineTable({
    city: v.string(),
    source: v.union(
      v.literal("whatsapp"),
      v.literal("inventario"),
      v.literal("promocion"),
    ),
    product: v.string(),
    summary: v.string(),
    level: v.number(),
  }).index("by_city", ["city"]),

  recommendations: defineTable({
    city: v.string(),
    product: v.string(),
    headline: v.string(),
    detail: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    proposedBy: v.string(),
    decidedBy: v.union(v.string(), v.null()),
    restockUnits: v.optional(v.number()),
    promoDays: v.optional(v.number()),
  }).index("by_status", ["status"]),

  catalogItems: defineTable({
    sku: v.string(),
    name: v.string(),
    category: v.string(),
    form: v.string(),
  }).index("by_sku", ["sku"]),

  pharmacyBranches: defineTable({
    code: v.string(),
    name: v.string(),
    city: v.string(),
    size: v.union(v.literal("small"), v.literal("medium"), v.literal("large")),
  })
    .index("by_city", ["city"])
    .index("by_code", ["code"]),

  waMessages: defineTable({
    messageId: v.string(),
    at: v.number(),
    day: v.string(),
    city: v.string(),
    branchCode: v.union(v.string(), v.null()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    text: v.string(),
    sku: v.union(v.string(), v.null()),
    product: v.union(v.string(), v.null()),
    intent: v.string(),
  })
    .index("by_city_and_sku", ["city", "sku"])
    .index("by_city_and_day", ["city", "day"])
    .index("by_message_id", ["messageId"]),

  waDaily: defineTable({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    day: v.string(),
    inbound: v.number(),
  })
    .index("by_city_and_sku_and_day", ["city", "sku", "day"])
    .index("by_city", ["city"]),

  inventoryPositions: defineTable({
    asOf: v.number(),
    branchCode: v.string(),
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    onHand: v.number(),
    target: v.number(),
    unitCostCents: v.number(),
  })
    .index("by_city_and_sku", ["city", "sku"])
    .index("by_branch_and_sku", ["branchCode", "sku"]),

  promoCalendar: defineTable({
    promoId: v.string(),
    program: v.string(),
    sku: v.string(),
    product: v.string(),
    city: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    discountPct: v.number(),
    active: v.boolean(),
  })
    .index("by_sku", ["sku"])
    .index("by_city_and_sku", ["city", "sku"]),

  newsItems: defineTable({
    newsId: v.string(),
    publishedAt: v.number(),
    title: v.string(),
    summary: v.string(),
    source: v.string(),
    cityTags: v.array(v.string()),
    skuTags: v.array(v.string()),
    relevance: v.number(),
  }).index("by_published", ["publishedAt"]),

  opsMeta: defineTable({
    key: v.string(),
    catalogItems: v.number(),
    pharmacyBranches: v.number(),
    waMessages: v.number(),
    waInbound: v.number(),
    waDaily: v.number(),
    inventoryPositions: v.number(),
    promoCalendar: v.number(),
    newsItems: v.number(),
    asOf: v.string(),
  }).index("by_key", ["key"]),

  liveStock: defineTable({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    category: v.string(),
    onHand: v.number(),
    target: v.number(),
    baseRate: v.number(),
    waRate: v.number(),
    salesRate: v.number(),
    heat: v.number(),
    heatTarget: v.number(),
    trend: v.union(v.string(), v.null()),
    promoUntil: v.number(),
    seasonPromo: v.boolean(),
    snoozeUntil: v.number(),
    lastBand: v.number(),
  })
    .index("by_city", ["city"])
    .index("by_city_and_sku", ["city", "sku"]),

  liveEvents: defineTable({
    at: v.number(),
    tick: v.number(),
    city: v.string(),
    code: v.union(
      v.literal("WA"),
      v.literal("INV"),
      v.literal("PRO"),
      v.literal("ORD"),
    ),
    product: v.string(),
    text: v.string(),
  })
    .index("by_at", ["at"])
    .index("by_city_and_at", ["city", "at"]),

  liveClock: defineTable({
    key: v.string(),
    running: v.boolean(),
    fast: v.boolean(),
    tick: v.number(),
    generation: v.number(),
    aliveUntil: v.number(),
    scheduled: v.boolean(),
  }).index("by_key", ["key"]),

  insightFacts: defineTable({
    city: v.string(),
    sku: v.string(),
    product: v.string(),
    waRecent7: v.number(),
    waPrior21: v.number(),
    lift: v.number(),
    onHand: v.number(),
    target: v.number(),
    stockPct: v.number(),
    activePromo: v.boolean(),
    newsCount: v.number(),
    score: v.number(),
    action: v.union(
      v.literal("none"),
      v.literal("watch"),
      v.literal("restock"),
      v.literal("restock_promo"),
    ),
  }).index("by_city_and_sku", ["city", "sku"]),
});
