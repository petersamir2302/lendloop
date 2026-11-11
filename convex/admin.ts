import { query } from "./_generated/server";
import { currentUser, isAdmin } from "./lib/access";

/** Failed or stuck automation, so admins notice before users do. */
export const automationIssues = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUser(ctx);
    if (!me || !isAdmin(me)) return null;
    const events = await ctx.db.query("automationEvents").order("desc").take(100);
    return events
      .filter((e) => e.status !== "sent")
      .slice(0, 20)
      .map((e) => ({
        _id: e._id,
        kind: e.kind,
        status: e.status,
        attempts: e.attempts,
        detail: e.detail ?? "",
        at: e.updatedAt,
      }));
  },
});
