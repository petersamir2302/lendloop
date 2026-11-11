"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { ago, errorText, shortDate } from "@/lib/format";

type Loan = NonNullable<FunctionReturnType<typeof api.loans.incoming>>[number];

const STATUS_STYLE: Record<Loan["status"], string> = {
  requested: "bg-sky-100 text-sky-800",
  approved: "bg-emerald-100 text-emerald-800",
  declined: "bg-stone-200 text-stone-700",
  cancelled: "bg-stone-200 text-stone-700",
  returned: "bg-stone-100 text-stone-600",
};

export function Activity({ loan }: { loan: Loan }) {
  const a = loan.lastAutomation;
  if (!a) return null;
  const what = a.kind === "reminder" ? "Reminder" : "Notification";
  const text =
    a.status === "sent" ? `${what} sent ${ago(a.at)}` :
    a.status === "pending" ? `${what} retrying` :
    `${what} failed ${ago(a.at)}`;
  return <p className={`mt-1 text-xs ${a.status === "failed" ? "text-red-700" : "text-stone-500"}`}>{text}</p>;
}

function act(fn: () => Promise<unknown>) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      alert(errorText(err));
    }
  };
}

function LoanRow({ loan, view }: { loan: Loan; view: "incoming" | "mine" }) {
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const cancel = useMutation(api.loans.cancel);
  const returned = useMutation(api.loans.markReturned);
  const who = view === "incoming" ? `${loan.borrowerName} wants it` : `from ${loan.lenderName}`;

  return (
    <li className="card flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-medium">
          {loan.toolName} <span className="font-normal text-stone-500">· {who}</span>
        </p>
        <p className="text-sm text-stone-600">
          {shortDate(loan.startDate)} to {shortDate(loan.endDate)}
          {loan.overdue && <span className="pill ml-2 bg-red-100 text-red-800">Overdue</span>}
        </p>
        <Activity loan={loan} />
      </div>
      <div className="flex items-center gap-2">
        <span className={`pill ${STATUS_STYLE[loan.status]}`}>{loan.status}</span>
        {view === "incoming" && loan.status === "requested" && (
          <>
            <button className="btn-primary" onClick={act(() => approve({ loanId: loan._id }))}>Approve</button>
            <button className="btn-ghost" onClick={act(() => decline({ loanId: loan._id }))}>Decline</button>
          </>
        )}
        {view === "incoming" && loan.status === "approved" && (
          <button className="btn-ghost" onClick={act(() => returned({ loanId: loan._id }))}>Mark returned</button>
        )}
        {view === "mine" && loan.status === "requested" && (
          <button className="btn-ghost" onClick={act(() => cancel({ loanId: loan._id }))}>Cancel</button>
        )}
      </div>
    </li>
  );
}

export function LoanList({ view }: { view: "incoming" | "mine" }) {
  const loans = useQuery(view === "incoming" ? api.loans.incoming : api.loans.myRequests);
  if (loans === undefined) return <p className="text-sm text-stone-500">Loading…</p>;
  if (loans.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        {view === "incoming" ? "Nobody has asked to borrow your tools yet." : "You haven't asked to borrow anything yet."}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {loans.map((l) => (
        <LoanRow key={l._id} loan={l} view={view} />
      ))}
    </ul>
  );
}
