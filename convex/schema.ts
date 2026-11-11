import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categories = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const conditions = ["like_new", "good", "fair", "worn"] as const;

export const loanStatuses = [
  "requested",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;

export default defineSchema({
  users: defineTable({
    // Clerk's subject + issuer. We never trust ids sent from the client.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trusted: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.union(...categories.map((c) => v.literal(c))),
    condition: v.union(...conditions.map((c) => v.literal(c))),
    description: v.string(),
    // Soft delete so past loans keep pointing at something.
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD, inclusive
    status: v.union(...loanStatuses.map((s) => v.literal(s))),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_lender", ["lenderId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_end", ["status", "endDate"]),

  // One row per thing n8n did (or failed to do) for a loan.
  // `key` makes every write-back idempotent: a retried webhook or a
  // re-run workflow finds the existing row instead of adding a second one.
  automationEvents: defineTable({
    key: v.string(),
    loanId: v.optional(v.id("loans")),
    kind: v.union(
      v.literal("notification"),
      v.literal("reminder"),
      v.literal("workflow_error"),
    ),
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    detail: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"]),
});
