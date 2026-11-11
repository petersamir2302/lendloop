"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, type Category, errorText, shortDate } from "@/lib/format";
import { RequestForm } from "./RequestForm";

export function Browse({ isAdmin }: { isAdmin: boolean }) {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.browse, category ? { category } : {});
  const remove = useMutation(api.tools.remove);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);

  async function adminRemove(toolId: Id<"tools">, name: string) {
    if (!confirm(`Remove "${name}" from the board?`)) return;
    try {
      await remove({ toolId });
    } catch (err) {
      alert(errorText(err));
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="cat" className="text-sm text-stone-600">
          Category
        </label>
        <select id="cat" className="field w-auto" value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
          <option value="">All</option>
          {Object.entries(CATEGORIES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {tools === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="text-sm text-stone-500">No tools in this category yet.</p>
      ) : (
        <ul className="space-y-2">
          {tools.map((t) => (
            <li key={t._id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-stone-600">
                    {CATEGORIES[t.category]} · {CONDITIONS[t.condition]} · from {t.isMine ? "you" : t.ownerName}
                    {t.ownerTrusted && <span className="pill ml-2 bg-amber-100 text-amber-800">Trusted lender</span>}
                  </p>
                  <p className="mt-1 text-sm text-stone-700">{t.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.available ? (
                    <span className="pill bg-emerald-100 text-emerald-800">Available</span>
                  ) : (
                    <span className="pill bg-stone-200 text-stone-700">Out until {shortDate(t.until!)}</span>
                  )}
                  {!t.isMine && requesting !== t._id && (
                    <button className="btn-ghost" onClick={() => setRequesting(t._id)}>
                      Borrow
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn-danger" onClick={() => adminRemove(t._id, t.name)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {requesting === t._id && (
                <RequestForm
                  toolId={t._id}
                  onDone={() => {
                    setRequesting(null);
                    setSent(t._id);
                  }}
                />
              )}
              {sent === t._id && requesting !== t._id && (
                <p className="mt-2 text-sm text-emerald-700">Request sent. You&apos;ll see it under My requests.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
