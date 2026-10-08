import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const PROPOSAL_TTL_MS = 5 * 60 * 1000;

const skuResult = v.object({
  sku: v.string(),
  name: v.string(),
});

const offerResult = v.object({
  sku: v.string(),
  floorSlug: v.string(),
  floorName: v.string(),
  quantity: v.number(),
  priceCents: v.number(),
  version: v.number(),
});

const proposalResult = v.object({
  id: v.id("proposals"),
  sku: v.string(),
  floorSlug: v.string(),
  quantity: v.number(),
  offerVersion: v.number(),
  unitPriceCents: v.number(),
  totalCents: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("expired"),
    v.literal("uncertain"),
  ),
  idempotencyKey: v.string(),
  proposedBy: v.string(),
  decidedBy: v.union(v.string(), v.null()),
  expiresAt: v.number(),
});

const journalResult = v.object({
  kind: v.union(
    v.literal("proposed"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("expired"),
    v.literal("stale"),
  ),
  actor: v.string(),
  at: v.number(),
});

async function actorOf(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) return identity.tokenIdentifier;
  return "demo-clerk";
}

async function floorName(ctx: QueryCtx | MutationCtx, slug: string) {
  const floor = await ctx.db
    .query("floors")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return floor?.name ?? slug;
}

function toProposal(doc: {
  _id: Id<"proposals">;
  sku: string;
  floorSlug: string;
  quantity: number;
  offerVersion: number;
  unitPriceCents: number;
  totalCents: number;
  status: "pending" | "approved" | "rejected" | "expired" | "uncertain";
  idempotencyKey: string;
  proposedBy: string;
  decidedBy: string | null;
  expiresAt: number;
}) {
  return {
    id: doc._id,
    sku: doc.sku,
    floorSlug: doc.floorSlug,
    quantity: doc.quantity,
    offerVersion: doc.offerVersion,
    unitPriceCents: doc.unitPriceCents,
    totalCents: doc.totalCents,
    status: doc.status,
    idempotencyKey: doc.idempotencyKey,
    proposedBy: doc.proposedBy,
    decidedBy: doc.decidedBy,
    expiresAt: doc.expiresAt,
  };
}

export const searchCatalog = query({
  args: { q: v.string() },
  returns: v.array(skuResult),
  handler: async (ctx, args) => {
    const term = args.q.trim();
    if (!term) {
      const rows = await ctx.db.query("skus").withIndex("by_sku").take(20);
      return rows.map((row) => ({ sku: row.sku, name: row.name }));
    }
    const rows = await ctx.db
      .query("skus")
      .withSearchIndex("search_keywords", (q) => q.search("keywords", term))
      .take(20);
    return rows.map((row) => ({ sku: row.sku, name: row.name }));
  },
});

export const offersForSku = query({
  args: { sku: v.string() },
  returns: v.array(offerResult),
  handler: async (ctx, args) => {
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .take(20);
    const named = [];
    for (const offer of offers) {
      named.push({
        sku: offer.sku,
        floorSlug: offer.floorSlug,
        floorName: await floorName(ctx, offer.floorSlug),
        quantity: offer.quantity,
        priceCents: offer.priceCents,
        version: offer.version,
      });
    }
    return named;
  },
});

export const pendingProposals = query({
  args: {},
  returns: v.array(proposalResult),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("proposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(30);
    return rows.map(toProposal);
  },
});

export const journalFor = query({
  args: { proposalId: v.id("proposals") },
  returns: v.array(journalResult),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("journal")
      .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId))
      .take(50);
    return rows.map((row) => ({
      kind: row.kind,
      actor: row.actor,
      at: row.at,
    }));
  },
});

export const ensureDemo = mutation({
  args: {},
  returns: v.object({ ready: v.boolean() }),
  handler: async (ctx) => {
    const existing = await ctx.db.query("skus").withIndex("by_sku").take(1);
    if (existing.length > 0) return { ready: true };

    await ctx.db.insert("floors", { slug: "centro", name: "Sucursal Centro" });
    await ctx.db.insert("floors", { slug: "norte", name: "Sucursal Norte" });

    const catalog = [
      {
        sku: "DEMO-001",
        name: "Gasas estériles",
        keywords: "gasas esteriles demo-001 curacion",
      },
      {
        sku: "DEMO-002",
        name: "Paracetamol 500 mg",
        keywords: "paracetamol demo-002 analgesico",
      },
      {
        sku: "DEMO-003",
        name: "Alcohol 70%",
        keywords: "alcohol demo-003 antiseptico",
      },
    ];
    for (const item of catalog) {
      await ctx.db.insert("skus", item);
    }

    const offers = [
      { sku: "DEMO-001", floorSlug: "centro", quantity: 24, priceCents: 185, version: 1 },
      { sku: "DEMO-001", floorSlug: "norte", quantity: 6, priceCents: 190, version: 1 },
      { sku: "DEMO-002", floorSlug: "centro", quantity: 40, priceCents: 95, version: 1 },
      { sku: "DEMO-002", floorSlug: "norte", quantity: 12, priceCents: 110, version: 1 },
      { sku: "DEMO-003", floorSlug: "centro", quantity: 15, priceCents: 240, version: 1 },
      { sku: "DEMO-003", floorSlug: "norte", quantity: 0, priceCents: 240, version: 1 },
    ];
    for (const offer of offers) {
      await ctx.db.insert("offers", offer);
    }
    return { ready: true };
  },
});

export const createProposal = mutation({
  args: {
    sku: v.string(),
    floorSlug: v.string(),
    quantity: v.number(),
    idempotencyKey: v.string(),
  },
  returns: proposalResult,
  handler: async (ctx, args) => {
    if (args.quantity < 1 || !Number.isInteger(args.quantity)) {
      throw new Error("La cantidad debe ser un entero mayor que cero.");
    }
    const prior = await ctx.db
      .query("proposals")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (prior) return toProposal(prior);

    const offer = await ctx.db
      .query("offers")
      .withIndex("by_sku_and_floor", (q) =>
        q.eq("sku", args.sku).eq("floorSlug", args.floorSlug),
      )
      .unique();
    if (!offer) throw new Error("No hay oferta para ese producto en esa sucursal.");
    if (offer.quantity < args.quantity) {
      throw new Error("No hay stock suficiente para preparar la reserva.");
    }

    const actor = await actorOf(ctx);
    const now = Date.now();
    const proposalId = await ctx.db.insert("proposals", {
      sku: args.sku,
      floorSlug: args.floorSlug,
      quantity: args.quantity,
      offerVersion: offer.version,
      unitPriceCents: offer.priceCents,
      totalCents: offer.priceCents * args.quantity,
      status: "pending",
      idempotencyKey: args.idempotencyKey,
      proposedBy: actor,
      decidedBy: null,
      expiresAt: now + PROPOSAL_TTL_MS,
    });
    await ctx.db.insert("journal", {
      proposalId,
      kind: "proposed",
      actor,
      at: now,
    });
    const created = await ctx.db.get(proposalId);
    if (!created) throw new Error("No se pudo leer la propuesta creada.");
    return toProposal(created);
  },
});

export const decideProposal = mutation({
  args: {
    proposalId: v.id("proposals"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  returns: proposalResult,
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("La propuesta no existe.");
    if (proposal.status !== "pending") return toProposal(proposal);

    const actor = await actorOf(ctx);
    const now = Date.now();
    if (now > proposal.expiresAt) {
      await ctx.db.patch(proposal._id, { status: "expired", decidedBy: actor });
      await ctx.db.insert("journal", {
        proposalId: proposal._id,
        kind: "expired",
        actor,
        at: now,
      });
      const expired = await ctx.db.get(proposal._id);
      if (!expired) throw new Error("No se pudo leer la propuesta vencida.");
      return toProposal(expired);
    }

    if (args.decision === "reject") {
      await ctx.db.patch(proposal._id, { status: "rejected", decidedBy: actor });
      await ctx.db.insert("journal", {
        proposalId: proposal._id,
        kind: "rejected",
        actor,
        at: now,
      });
      const rejected = await ctx.db.get(proposal._id);
      if (!rejected) throw new Error("No se pudo leer la propuesta rechazada.");
      return toProposal(rejected);
    }

    const offer = await ctx.db
      .query("offers")
      .withIndex("by_sku_and_floor", (q) =>
        q.eq("sku", proposal.sku).eq("floorSlug", proposal.floorSlug),
      )
      .unique();
    if (
      !offer ||
      offer.version !== proposal.offerVersion ||
      offer.priceCents !== proposal.unitPriceCents ||
      offer.quantity < proposal.quantity
    ) {
      await ctx.db.patch(proposal._id, { status: "rejected", decidedBy: actor });
      await ctx.db.insert("journal", {
        proposalId: proposal._id,
        kind: "stale",
        actor,
        at: now,
      });
      const stale = await ctx.db.get(proposal._id);
      if (!stale) throw new Error("No se pudo leer la propuesta desactualizada.");
      return toProposal(stale);
    }

    await ctx.db.patch(offer._id, {
      quantity: offer.quantity - proposal.quantity,
      version: offer.version + 1,
    });
    await ctx.db.patch(proposal._id, { status: "approved", decidedBy: actor });
    await ctx.db.insert("journal", {
      proposalId: proposal._id,
      kind: "approved",
      actor,
      at: now,
    });
    const approved = await ctx.db.get(proposal._id);
    if (!approved) throw new Error("No se pudo leer la propuesta aprobada.");
    return toProposal(approved);
  },
});
