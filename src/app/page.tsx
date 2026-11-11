"use client";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { CATEGORIES } from "@/lib/format";

export default function Home() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10">
        <p className="text-sm font-semibold tracking-wide text-brand">LendLoop</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Borrow what you need.
          <br />
          Lend what you don&apos;t.
        </h1>
        <p className="mt-3 max-w-lg text-stone-600">
          A drill you use twice a year, a tent that lives in the attic. Share them with the
          people on your street instead.
        </p>
        <div className="mt-6">
          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/app">
              <button className="btn-primary">Sign in to lend or borrow</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/app" className="btn-primary">
              Open your board
            </Link>
          </SignedIn>
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Available on the board</h2>
        {tools === undefined ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : tools.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing listed yet. Be the first.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tools.map((t) => (
              <li key={t._id} className="card flex items-center justify-between py-3">
                <span className="font-medium">{t.name}</span>
                <span className="pill bg-stone-100 text-stone-700">{CATEGORIES[t.category]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
