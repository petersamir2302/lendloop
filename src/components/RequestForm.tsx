"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { errorText } from "@/lib/format";

function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const [start, setStart] = useState(isoDay(1));
  const [end, setEnd] = useState(isoDay(3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId, startDate: start, endDate: end });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
      <label className="text-xs text-stone-600">
        From
        <input type="date" className="field mt-1" value={start} min={isoDay()} onChange={(e) => setStart(e.target.value)} required />
      </label>
      <label className="text-xs text-stone-600">
        Until
        <input type="date" className="field mt-1" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
      </label>
      <button className="btn-primary" disabled={busy}>
        {busy ? "Sending…" : "Send request"}
      </button>
      <button type="button" className="btn-ghost" onClick={onDone}>
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}
