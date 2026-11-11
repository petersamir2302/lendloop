import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { categories, conditions } from "./schema";
import { assertOwner, isAdmin, loadTool, requireUser } from "./lib/access";
import { today } from "./lib/dates";

const category = v.union(...categories.map((c) => v.literal(c)));
const condition = v.union(...conditions.map((c) => v.literal(c)));

function cleanText(value: string, field: string, max: number) {
  const trimmed = value.trim();
  if (!trimmed) throw new ConvexError(`${field} can't be empty.`);
  if (trimmed.length > max) throw new ConvexError(`${field} is too long (max ${max}).`);
  return trimmed;
}

async function activeTools(ctx: QueryCtx, cat?: Doc<"tools">["category"]) {
  const rows = cat
    ? await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", cat)).collect()
    : await ctx.db.query("tools").collect();
  return rows.filter((t) => !t.removedAt);
}

/** Whether the tool is out right now, and until when. */
async function availability(ctx: QueryCtx, tool: Doc<"tools">) {
  const day = today();
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
    .collect();
  const current = loans.find(
    (l) => l.status === "approved" && l.startDate <= day && !l.returnedAt,
  );
  return current
    ? { available: false, until: current.endDate }
    : { available: true, until: null };
}

/** Public landing page. Name and category only, nothing about the owner. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await activeTools(ctx);
    return tools
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 50)
      .map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

export const browse = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tools = await activeTools(ctx, args.category);

    return await Promise.all(
      tools
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (t) => {
          const owner = await ctx.db.get(t.ownerId);
          return {
            _id: t._id,
            name: t.name,
            category: t.category,
            condition: t.condition,
            description: t.description,
            // First name is enough to know who you're borrowing from.
            ownerName: owner?.name.split(" ")[0] ?? "A neighbour",
            ownerTrusted: owner?.trusted ?? false,
            isMine: t.ownerId === me._id,
            ...(await availability(ctx, t)),
          };
        }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .collect();
    return await Promise.all(
      tools
        .filter((t) => !t.removedAt)
        .map(async (t) => ({ ...t, ...(await availability(ctx, t)) })),
    );
  },
});

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      name: cleanText(args.name, "Name", 80),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "Description", 500),
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  },
  handler: async (ctx, { toolId, ...fields }) => {
    const me = await requireUser(ctx);
    const tool = await loadTool(ctx, toolId);
    assertOwner(me, tool);
    await ctx.db.patch(toolId, {
      name: cleanText(fields.name, "Name", 80),
      category: fields.category,
      condition: fields.condition,
      description: cleanText(fields.description, "Description", 500),
    });
  },
});

/** Owners delete their own listings; admins can remove anyone's. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await loadTool(ctx, toolId);
    if (!isAdmin(me)) assertOwner(me, tool);

    const open = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    const lentOut = open.some((l) => l.status === "approved" && !l.returnedAt);
    if (lentOut && !isAdmin(me)) {
      throw new ConvexError("This tool is lent out. Mark it returned before deleting it.");
    }

    // Pending requests can't go anywhere once the tool is gone.
    for (const loan of open.filter((l) => l.status === "requested")) {
      await ctx.db.patch(loan._id, { status: "cancelled" });
      await ctx.scheduler.runAfter(0, internal.automation.notifyLoanChange, {
        loanId: loan._id,
        status: "cancelled",
      });
    }
    await ctx.db.patch(toolId, { removedAt: Date.now() });
  },
});
