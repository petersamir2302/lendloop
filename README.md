# LendLoop

Borrow what you need. Lend what you don't.

A small tool-lending board for a neighbourhood: people list tools, others ask to
borrow them for a few days, owners approve or decline, and n8n handles the
notifications and the "you still have my drill" reminders.

Built for the Fluence take-home with Next.js (App Router), Clerk, Convex, n8n and
TypeScript.

## What's in here

```
convex/                 data model, every rule, and the endpoints n8n calls
  schema.ts             users, tools, loans, automationEvents
  lib/access.ts         requireUser / requireAdmin / ownership checks
  lib/signing.ts        HMAC signing + verification (both directions)
  tools.ts loans.ts     the actual features
  users.ts admin.ts     roles, trusted lenders, automation problems
  automation.ts         outgoing webhook with retries, overdue query, write-backs
  http.ts               signed HTTP endpoints for n8n
src/app/page.tsx        public page (tool names and categories only)
src/app/app/page.tsx    the signed-in board
src/components/         Browse, MyListings, Loans, AdminPanel
n8n/workflows/          exported workflows (no secrets inside)
docker-compose.yml      n8n for local development
```

## Running it locally

You need Node 20+, Docker, a free Clerk app and a free Convex project.

1. **Install**

   ```bash
   npm install
   ```

2. **Clerk.** Create an application, then add a JWT template named `convex`
   (Clerk has a Convex preset; the only claim that matters is `"aud": "convex"`,
   plus `name` and `email`). Put the keys in `.env.local`:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

3. **Convex.** `npx convex dev` creates the deployment and adds
   `NEXT_PUBLIC_CONVEX_URL` to `.env.local`. Then set the server-side variables
   (these live on the Convex deployment, not in the repo):

   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   npx convex env set ADMIN_EMAILS you@example.com
   npx convex env set N8N_WEBHOOK_SECRET "$(openssl rand -hex 32)"
   npx convex env set CONVEX_AUTOMATION_SECRET "$(openssl rand -hex 32)"
   # after n8n is up (step 4):
   npx convex env set N8N_NOTIFY_WEBHOOK_URL https://<public-n8n-url>/webhook/lendloop/loan-status
   ```

4. **n8n.** Copy `n8n/.env.example` to `n8n/.env`, use the same two secrets as
   above, and set `LENDLOOP_CONVEX_SITE_URL` to your deployment's `.convex.site`
   URL. Convex runs in the cloud, so it needs a public URL for n8n; locally I used
   `cloudflared tunnel --url http://localhost:5678` and put that URL in
   `WEBHOOK_URL` and `N8N_NOTIFY_WEBHOOK_URL`.

   ```bash
   docker compose up -d
   for f in error-handler request-notification overdue-reminders; do
     docker compose exec n8n n8n import:workflow --input=/workflows/$f.json
   done
   docker compose exec n8n n8n update:workflow --id=LLnotify0000001 --active=true
   docker compose exec n8n n8n update:workflow --id=LLremind0000001 --active=true
   docker compose restart n8n
   ```

5. **Run the app**

   ```bash
   npm run dev
   ```

   Sign in with the email from `ADMIN_EMAILS` to get the admin tab. In a Clerk
   development instance, `anything+clerk_test@example.com` with code `424242`
   is handy for a second (non-admin) user.

## Environment variables

| Where | Name | What it's for |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL` | Convex client URL (written by `convex dev`) |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| Convex | `CLERK_JWT_ISSUER_DOMAIN` | Lets Convex verify Clerk tokens |
| Convex | `ADMIN_EMAILS` | Comma-separated; these users get the admin role |
| Convex | `N8N_NOTIFY_WEBHOOK_URL` | Where loan status changes are posted |
| Convex | `N8N_WEBHOOK_SECRET` | Signs Convex → n8n webhooks |
| Convex | `CONVEX_AUTOMATION_SECRET` | Verifies n8n → Convex calls |
| `n8n/.env` | `LENDLOOP_WEBHOOK_SECRET` | Same value as `N8N_WEBHOOK_SECRET` |
| `n8n/.env` | `LENDLOOP_CONVEX_SECRET` | Same value as `CONVEX_AUTOMATION_SECRET` |
| `n8n/.env` | `LENDLOOP_CONVEX_SITE_URL` | `https://<deployment>.convex.site` |
| `n8n/.env` | `N8N_ENCRYPTION_KEY`, `WEBHOOK_URL` | n8n itself |

## How it fits together

```
 browser ──Clerk JWT──▶ Convex queries/mutations ──(rules in convex/lib/access.ts)
                              │
                              │ status change → scheduler → internal action
                              ▼
                    POST /webhook/lendloop/loan-status  ──▶  n8n "request notification"
                    (signed, Idempotency-Key)                verify → dedupe → notify → 200

 n8n "overdue reminders" (daily 09:00)
   → POST /automation/overdue-loans        (signed)  ◀── Convex HTTP action
   → send reminder per loan
   → POST /automation/reminder-status      (signed, idempotent by reminderKey)

 any failed run → n8n "error handler" → POST /automation/workflow-error → admin tab
```

Each loan shows its latest automation event ("Notification sent 3 min ago",
"Reminder sent yesterday", or a failure), and the admin tab lists anything that
failed or is still retrying.

## Security and data decisions

**Access control lives in Convex.** Every public function starts with
`requireUser` or `requireAdmin`, and the user is looked up from the verified Clerk
token, never from an id the client sends. Owners can edit and delete only their
own tools; only the lender can approve, decline or mark returned; only the
borrower can cancel. Admins can remove any listing, see every loan and mark
trusted lenders. The UI hides buttons people can't use, but that's just
convenience: calling a mutation directly hits the same checks.

**Roles come from the server.** `ADMIN_EMAILS` is a Convex env var, applied when
the user row is created or refreshed. There's no client path to become admin.

**Signed in both directions.** Convex signs `${timestamp}.${body}` with
HMAC-SHA256 and n8n verifies it against the raw request bytes before doing
anything; n8n signs its calls to Convex the same way with a different secret.
Signatures older than five minutes are rejected (replay window), comparisons are
constant-time, and a bad signature gets a plain 401.

**No secrets in code or workflow JSON.** Clerk keys are in `.env.local`, Convex
secrets are Convex env vars, and the n8n workflows read theirs from the container
environment (`$env.…`). The exported JSON in `n8n/workflows` has nothing secret
in it.

**Data minimisation.** The public page shows tool names and categories only. The
board shows an owner's first name, not their email. Webhook payloads carry only
what the message needs: recipient first name and email, tool name, dates and
status. No user ids, no other party's details. Convex endpoints for n8n are POST
so nothing sensitive sits in URLs or access logs.

**Idempotency and retries.**
- Outgoing notifications use the key `notify:<loanId>:<status>`. Convex retries
  failed deliveries with backoff (30 s, 1, 2, 4 min, five attempts) and records
  the result; n8n remembers recent keys so a retry after a lost response doesn't
  notify twice.
- Reminders use `reminder:<loanId>:<YYYY-MM-DD>`. The overdue query skips loans
  already reminded today, and the write-back upserts by that key, so re-running
  the workflow or retrying the HTTP call can't create duplicates.
- A late "failed" report can't overwrite a "sent" one.
- HTTP nodes retry three times; anything that still fails goes to the error
  workflow, which reports it to Convex so it's visible in the app.

## Testing

`npm test` runs the unit tests for request signing and date logic.

Beyond that I checked the flows by hand against a real Convex deployment, Clerk
dev instance and n8n:

- Two users and an admin through the whole loop: list, request, approve,
  mark returned, overdue reminder, trusted lender, admin removal.
- Every rule from outside the UI with `npx convex run --identity`: a borrower
  approving their own request, editing or deleting someone else's tool, a
  non-admin marking themselves trusted or reading all loans, bad date ranges,
  duplicate requests, anonymous calls. All rejected with the right message.
- Webhook security: unsigned, wrong signature, wrong secret and a 15-minute-old
  timestamp all get 401; the same signed payload sent twice notifies once.
- Retries: with n8n stopped, marking a loan returned showed "Notification
  retrying"; once n8n was back, Convex's second attempt went through.
- Idempotency: running the reminder workflow twice on the same day sent one
  reminder and left one record; a late "failed" report didn't overwrite "sent".
- Error path: forcing the overdue endpoint to fail sent the run to the error
  workflow, and the failure appeared in the admin tab.

## What I'd change for production

- **Tests for every function.** Convex has no row level security, so the
  per-function checks are the boundary. I'd add a test suite that calls every
  public function as an anonymous user, a stranger and an admin, so a forgotten
  check fails CI rather than review.
- **Real notifications.** Swap the mock Code nodes for email (Postmark/SES) with
  templates, and let users choose their channel. Unsubscribe links too.
- **Queue instead of direct webhook.** Put an outbox table between Convex and
  n8n so deliveries survive n8n being down for longer than the retry window.
- **Secrets.** Rotate both HMAC secrets with a short overlap (accept old and new
  for a while), and keep them in a secrets manager rather than `.env` files.
- **n8n hosting.** Run n8n on its own host or n8n Cloud with Postgres, basic auth
  or SSO on the editor, and the webhook path behind a domain rather than a tunnel.
- **Availability.** Reservations as date ranges are fine here, but I'd add a
  calendar view and block requests that overlap already-pending ones.
- **Audit log** of admin actions (removals, trust changes).
- **Rate limiting** on request creation to stop someone spamming a lender.
