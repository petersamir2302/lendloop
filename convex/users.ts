import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentUser, requireAdmin } from "./lib/access";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Called once after sign-in. Creates our user row from the verified token.
 * Role comes from the ADMIN_EMAILS env var on the Convex deployment, never
 * from the client.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in first.");

    const email = (identity.email ?? "").toLowerCase();
    const name = identity.name ?? email.split("@")[0] ?? "Neighbour";
    const role = adminEmails().includes(email) ? "admin" : "user";

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      if (existing.name !== name || existing.email !== email || existing.role !== role) {
        await ctx.db.patch(existing._id, { name, email, role });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role,
      trusted: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trusted: user.trusted };
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("No such user.");
    await ctx.db.patch(userId, { trusted });
  },
});
