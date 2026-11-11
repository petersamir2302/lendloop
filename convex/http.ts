import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { verify } from "./lib/signing";

// Endpoints n8n calls. Every request must be signed with
// CONVEX_AUTOMATION_SECRET (see lib/signing.ts). Responses are deliberately
// boring: 401 says nothing about why.

const http = httpRouter();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function signedBody(req: Request): Promise<string | null> {
  const body = await req.text();
  const ok = await verify(
    process.env.CONVEX_AUTOMATION_SECRET,
    req.headers.get("X-LendLoop-Timestamp"),
    req.headers.get("X-LendLoop-Signature"),
    body,
  );
  return ok ? body : null;
}

// POST with an empty JSON body rather than GET, so the same signing scheme
// applies and nothing sensitive ends up in a URL or access log.
http.route({
  path: "/automation/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    if ((await signedBody(req)) === null) return json({ error: "unauthorized" }, 401);
    const loans = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json({ loans });
  }),
});

http.route({
  path: "/automation/reminder-status",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await signedBody(req);
    if (body === null) return json({ error: "unauthorized" }, 401);

    let input: { reminderKey?: string; loanId?: string; status?: string; detail?: string };
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const { reminderKey, loanId, status, detail } = input;
    if (
      typeof reminderKey !== "string" ||
      typeof loanId !== "string" ||
      (status !== "sent" && status !== "failed")
    ) {
      return json({ error: "bad request" }, 400);
    }

    // Same key on a retry -> same row. Safe to call as often as n8n likes.
    const result = await ctx.runMutation(internal.automation.recordReminder, {
      reminderKey,
      loanId,
      status,
      detail: typeof detail === "string" ? detail.slice(0, 300) : undefined,
    });
    if (result === "unknown_loan") return json({ error: "unknown loan" }, 404);
    return json({ ok: true });
  }),
});

// The n8n error workflow reports failed runs here so they show up in the app
// instead of only in n8n's execution list.
http.route({
  path: "/automation/workflow-error",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await signedBody(req);
    if (body === null) return json({ error: "unauthorized" }, 401);

    let input: { executionId?: string; workflow?: string; message?: string };
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (typeof input.executionId !== "string") return json({ error: "bad request" }, 400);

    await ctx.runMutation(internal.automation.recordEvent, {
      key: `error:${input.executionId}`,
      kind: "workflow_error",
      status: "failed",
      detail: `${input.workflow ?? "workflow"}: ${input.message ?? "unknown error"}`.slice(0, 300),
    });
    return json({ ok: true });
  }),
});

export default http;
