"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, type Category, type Condition, errorText, shortDate } from "@/lib/format";

type Draft = { name: string; category: Category; condition: Condition; description: string };
const empty: Draft = { name: "", category: "power_tools", condition: "good", description: "" };

function ToolForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (d: Draft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft);
      if (!onCancel) setDraft(empty);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-2">
      <input className="field sm:col-span-2" placeholder="What is it? e.g. Cordless drill" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required />
      <select className="field" value={draft.category} onChange={(e) => set("category", e.target.value as Category)}>
        {Object.entries(CATEGORIES).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select className="field" value={draft.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
        {Object.entries(CONDITIONS).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <textarea className="field sm:col-span-2" rows={2} placeholder="Anything a borrower should know" value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={500} required />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    </form>
  );
}

export function MyListings() {
  const tools = useQuery(api.tools.mine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);

  async function del(tool: Doc<"tools">) {
    if (!confirm(`Delete "${tool.name}"? Pending requests for it will be cancelled.`)) return;
    try {
      await remove({ toolId: tool._id });
    } catch (err) {
      alert(errorText(err));
    }
  }

  return (
    <section className="space-y-4">
      <div className="card">
        <h3 className="mb-3 font-semibold">List a tool</h3>
        <ToolForm initial={empty} submitLabel="Add to the board" onSubmit={async (d) => { await create(d); }} />
      </div>

      {tools === undefined ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="text-sm text-stone-500">You haven&apos;t listed anything yet.</p>
      ) : (
        <ul className="space-y-2">
          {tools.map((t) => (
            <li key={t._id} className="card">
              {editing === t._id ? (
                <ToolForm
                  initial={{ name: t.name, category: t.category, condition: t.condition, description: t.description }}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (d) => {
                    await update({ toolId: t._id, ...d });
                    setEditing(null);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-stone-600">
                      {CATEGORIES[t.category]} · {CONDITIONS[t.condition]}
                      {!t.available && ` · lent out until ${shortDate(t.until!)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setEditing(t._id)}>Edit</button>
                    <button className="btn-danger" onClick={() => del(t)}>Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
