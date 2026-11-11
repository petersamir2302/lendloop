"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ago, errorText, shortDate } from "@/lib/format";
import { Activity } from "./Loans";

export function AdminPanel() {
  const loans = useQuery(api.loans.all);
  const issues = useQuery(api.admin.automationIssues);
  const setTrusted = useMutation(api.users.setTrusted);

  if (loans === null) return <p className="text-sm text-stone-500">Admins only.</p>;

  return (
    <section className="space-y-6">
      <div>
        <h3 className="mb-2 font-semibold">Automation problems</h3>
        {issues === undefined ? null : !issues || issues.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing failing right now.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {issues.map((i) => (
              <li key={i._id} className="card py-2">
                <span className={`pill mr-2 ${i.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                  {i.status}
                </span>
                {i.kind.replace("_", " ")} · {i.detail} · {ago(i.at)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-semibold">All loans</h3>
        {loans === undefined ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : loans.length === 0 ? (
          <p className="text-sm text-stone-500">No loans yet.</p>
        ) : (
          <ul className="space-y-2">
            {loans.map((l) => (
              <li key={l._id} className="card flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{l.toolName}</p>
                  <p className="text-sm text-stone-600">
                    {l.lenderName} → {l.borrowerName} · {shortDate(l.startDate)} to {shortDate(l.endDate)} · {l.status}
                    {l.overdue && <span className="pill ml-2 bg-red-100 text-red-800">Overdue</span>}
                  </p>
                  <Activity loan={l} />
                </div>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      await setTrusted({ userId: l.lenderId, trusted: !l.lenderTrusted });
                    } catch (err) {
                      alert(errorText(err));
                    }
                  }}
                >
                  {l.lenderTrusted ? `Untrust ${l.lenderName}` : `Mark ${l.lenderName} trusted`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
