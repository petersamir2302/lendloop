import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  assertBorrower,
  assertLender,
  isAdmin,
  loadTool,
  requireUser,
} from "./lib/access";
import { assertDay, daysBetween, overlaps, today } from "./lib/dates";

const MAX_LOAN_DAYS = 30;

async function loadLoan(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("That request doesn't exist.");
  return loan;
}

async function setStatus(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  status: Doc<"loans">["status"],
  extra: Partial<Doc<"loans">> = {},
) {
  await ctx.db.patch(loan._id, { status, ...extra });
  // Fire and forget from the user's point of view; the action retries on its own.
  await ctx.scheduler.runAfter(0, internal.automation.notifyLoanChange, {
    loanId: loan._id,
    status,
  });
}

/** Shape a loan for the UI with only what that view needs. */
async function present(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, lender, borrower, events] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .collect(),
  ]);
  const latest = events.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    lenderName: lender?.name.split(" ")[0] ?? "Unknown",
    borrowerName: borrower?.name.split(" ")[0] ?? "Unknown",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    returnedAt: loan.returnedAt ?? null,
    overdue: loan.status === "approved" && !loan.returnedAt && loan.endDate < today(),
    lastAutomation: latest
      ? { kind: latest.kind, status: latest.status, at: latest.updatedAt }
      : null,
  };
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const me = await requireUser(ctx);
    const tool = await loadTool(ctx, toolId);

    if (tool.ownerId === me._id) throw new ConvexError("That's your own tool.");
    assertDay(startDate, "Start date");
    assertDay(endDate, "End date");
    if (startDate < today()) throw new ConvexError("Start date is in the past.");
    if (endDate < startDate) throw new ConvexError("End date is before the start date.");
    if (daysBetween(startDate, endDate) + 1 > MAX_LOAN_DAYS) {
      throw new ConvexError(`Loans are limited to ${MAX_LOAN_DAYS} days.`);
    }

    const existing = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();

    const clash = existing.find(
      (l) =>
        l.status === "approved" &&
        !l.returnedAt &&
        overlaps(l.startDate, l.endDate, startDate, endDate),
    );
    if (clash) throw new ConvexError("It's already lent out for some of those days.");

    const duplicate = existing.find(
      (l) => l.borrowerId === me._id && l.status === "requested",
    );
    if (duplicate) throw new ConvexError("You already have a pending request for this tool.");

    const loanId = await ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: me._id,
      startDate,
      endDate,
      status: "requested",
    });
    await ctx.scheduler.runAfter(0, internal.automation.notifyLoanChange, {
      loanId,
      status: "requested",
    });
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    assertLender(me, loan);
    if (loan.status !== "requested") throw new ConvexError("This request was already handled.");

    const others = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .collect();
    const clash = others.find(
      (l) =>
        l._id !== loan._id &&
        l.status === "approved" &&
        !l.returnedAt &&
        overlaps(l.startDate, l.endDate, loan.startDate, loan.endDate),
    );
    if (clash) throw new ConvexError("You've already approved someone else for those dates.");

    await setStatus(ctx, loan, "approved");
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    assertLender(me, loan);
    if (loan.status !== "requested") throw new ConvexError("This request was already handled.");
    await setStatus(ctx, loan, "declined");
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    assertBorrower(me, loan);
    if (loan.status !== "requested") throw new ConvexError("Only pending requests can be cancelled.");
    await setStatus(ctx, loan, "cancelled");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    assertLender(me, loan);
    if (loan.status !== "approved") throw new ConvexError("Only active loans can be returned.");
    await setStatus(ctx, loan, "returned", { returnedAt: Date.now() });
  },
});

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(loans.map((l) => present(ctx, l)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", me._id))
      .order("desc")
      .collect();
    return await Promise.all(loans.map((l) => present(ctx, l)));
  },
});

/** Admin view: every loan, plus who's involved so they can mark trusted lenders. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    if (!isAdmin(me)) return null;
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(
      loans.map(async (l) => {
        const lender = await ctx.db.get(l.lenderId);
        return {
          ...(await present(ctx, l)),
          lenderId: l.lenderId,
          lenderTrusted: lender?.trusted ?? false,
        };
      }),
    );
  },
});
