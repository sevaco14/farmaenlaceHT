import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const KEY = "bedrock-global";
const REQUEST_LEASE_MS = 35_000;
const REQUEST_SPACING_MS = 1_100;

// One transactional lease serializes every HTTP request across actions. Spacing
// after completion prevents delayed actions spending old slots at the same time.
export const acquire = internalMutation({
  args: { leaseId: v.string() },
  returns: v.object({ granted: v.boolean(), retryAfterMs: v.number() }),
  handler: async (ctx, { leaseId }) => {
    const now = Date.now();
    const gate = await ctx.db.query("bedrockGate").withIndex("by_key", (q) => q.eq("key", KEY)).unique();
    const readyAt = Math.max(gate?.leaseUntil ?? 0, gate?.nextAllowedAt ?? 0);
    if (readyAt > now) return { granted: false, retryAfterMs: readyAt - now };
    const value = { leaseId, leaseUntil: now + REQUEST_LEASE_MS, nextAllowedAt: now + REQUEST_SPACING_MS };
    if (gate) await ctx.db.patch(gate._id, value);
    else await ctx.db.insert("bedrockGate", { key: KEY, ...value });
    return { granted: true, retryAfterMs: 0 };
  },
});

export const release = internalMutation({
  args: { leaseId: v.string() },
  returns: v.null(),
  handler: async (ctx, { leaseId }) => {
    const gate = await ctx.db.query("bedrockGate").withIndex("by_key", (q) => q.eq("key", KEY)).unique();
    if (gate?.leaseId === leaseId) {
      await ctx.db.patch(gate._id, { leaseId: undefined, leaseUntil: 0, nextAllowedAt: Date.now() + REQUEST_SPACING_MS });
    }
    return null;
  },
});
