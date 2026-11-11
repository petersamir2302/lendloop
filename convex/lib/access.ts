import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

// Every public function goes through one of these. The UI hides buttons too,
// but that's for convenience only; these are the actual rules.

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (!user) throw new ConvexError("Sign in first.");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admins only.");
  return user;
}

export function isAdmin(user: Doc<"users">) {
  return user.role === "admin";
}

export async function loadTool(ctx: Ctx, toolId: Id<"tools">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt) throw new ConvexError("That tool isn't listed anymore.");
  return tool;
}

/** Owners manage their own listings. Admins can only remove (handled in tools.remove). */
export function assertOwner(user: Doc<"users">, tool: Doc<"tools">) {
  if (tool.ownerId !== user._id) throw new ConvexError("You can only change your own listings.");
}

export function assertLender(user: Doc<"users">, loan: Doc<"loans">) {
  if (loan.lenderId !== user._id) throw new ConvexError("Only the tool's owner can do that.");
}

export function assertBorrower(user: Doc<"users">, loan: Doc<"loans">) {
  if (loan.borrowerId !== user._id) throw new ConvexError("Only the borrower can do that.");
}
