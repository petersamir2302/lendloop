import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { loanStatuses } from "./schema";
import { daysBetween, today } from "./lib/dates";
import { sign } from "./lib/signing";

const MAX_ATTEMPTS = 5;
const status = v.union(...loanStatuses.map((s) => v.literal(s)));

/** Who should hear about each status change. */
function recipientFor(loan: Doc<"loans">, newStatus: Doc<"loans">["status"]) {
  switch (newStatus) {
    case "requested":
    case "cancelled":
      return loan.lenderId;
    default:
      return loan.borrowerId; // approved, declined, returned
  }
}

/**
 * Upsert keyed by `key`. Calling it twice with the same key updates one row,
 * which is what makes n8n retries safe.
 */
export const recordEvent = internalMutation({
  args: {
    key: v.string(),
    loanId: v.optional(v.id("loans")),
    kind: v.union(v.literal("notification"), v.literal("reminder"), v.literal("workflow_error")),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
    countAttempt: v.optional(v.boolean()),
  },
  handler: async (ctx, { countAttempt, ...e }) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("key", e.key))
      .unique();
    if (existing) {
      // A late failure report must not overwrite a success.
      if (existing.status === "sent" && e.status !== "sent") return existing._id;
      await ctx.db.patch(existing._id, {
        status: e.status,
        detail: e.detail,
        attempts: existing.attempts + (countAttempt ? 1 : 0),
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("automationEvents", {
      ...e,
      attempts: countAttempt ? 1 : 0,
      updatedAt: Date.now(),
    });
  },
});

export const eventByKey = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) =>
    ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("key", key)).unique(),
});

/** Only the fields the notification needs. No ids of people, no addresses. */
export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans"), status },
  handler: async (ctx, { loanId, status }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const [tool, recipient] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(recipientFor(loan, status)),
    ]);
    if (!recipient) return null;
    return {
      event: "loan.status_changed",
      loanId,
      status,
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { firstName: recipient.name.split(" ")[0], email: recipient.email },
    };
  },
});

export const notifyLoanChange = internalAction({
  args: { loanId: v.id("loans"), status, attempt: v.optional(v.number()) },
  handler: async (ctx, { loanId, status, attempt = 1 }) => {
    const key = `notify:${loanId}:${status}`;
    const already = await ctx.runQuery(internal.automation.eventByKey, { key });
    if (already?.status === "sent") return;

    const url = process.env.N8N_NOTIFY_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.recordEvent, {
        key, loanId, kind: "notification", status: "failed",
        detail: "n8n isn't configured on this deployment",
      });
      return;
    }

    const payload = await ctx.runQuery(internal.automation.notificationPayload, { loanId, status });
    if (!payload) return;

    const body = JSON.stringify({ ...payload, key });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let failure: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          "X-LendLoop-Timestamp": timestamp,
          "X-LendLoop-Signature": await sign(secret, timestamp, body),
        },
        body,
      });
      if (!res.ok) failure = `n8n answered ${res.status}`;
    } catch (err) {
      failure = err instanceof Error ? err.message : "network error";
    }

    if (!failure) {
      await ctx.runMutation(internal.automation.recordEvent, {
        key, loanId, kind: "notification", status: "sent", countAttempt: true,
      });
      return;
    }

    const giveUp = attempt >= MAX_ATTEMPTS;
    await ctx.runMutation(internal.automation.recordEvent, {
      key, loanId, kind: "notification", countAttempt: true,
      status: giveUp ? "failed" : "pending",
      detail: `${failure} (attempt ${attempt}/${MAX_ATTEMPTS})`,
    });
    if (!giveUp) {
      // 30s, 1m, 2m, 4m
      const delay = 30_000 * 2 ** (attempt - 1);
      await ctx.scheduler.runAfter(delay, internal.automation.notifyLoanChange, {
        loanId, status, attempt: attempt + 1,
      });
    }
  },
});

/** Loans past their end date and not returned, minus ones already reminded today. */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const day = today();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", day))
      .collect();

    const out = [];
    for (const loan of loans) {
      if (loan.returnedAt) continue;
      const reminderKey = `reminder:${loan._id}:${day}`;
      const sent = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("key", reminderKey))
        .unique();
      if (sent?.status === "sent") continue;

      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!borrower) continue;
      out.push({
        loanId: loan._id,
        reminderKey,
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, day),
        borrower: { firstName: borrower.name.split(" ")[0], email: borrower.email },
      });
    }
    return out;
  },
});
