"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AdminPanel } from "@/components/AdminPanel";
import { Browse } from "@/components/Browse";
import { LoanList } from "@/components/Loans";
import { MyListings } from "@/components/MyListings";

const TABS = [
  { id: "browse", label: "All tools" },
  { id: "listings", label: "My listings" },
  { id: "requests", label: "My requests" },
  { id: "incoming", label: "Incoming requests" },
  { id: "admin", label: "Admin" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Board() {
  const { isAuthenticated } = useConvexAuth();
  const storeUser = useMutation(api.users.store);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [tab, setTab] = useState<Tab>("browse");

  // Make sure we have a users row before any other query needs it.
  useEffect(() => {
    if (isAuthenticated) void storeUser();
  }, [isAuthenticated, storeUser]);

  if (!me) {
    return <p className="p-8 text-sm text-stone-500">Setting up your account…</p>;
  }

  const tabs = TABS.filter((t) => t.id !== "admin" || me.role === "admin");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          LendLoop
        </Link>
        <div className="flex items-center gap-3 text-sm text-stone-600">
          {me.trusted && <span className="pill bg-amber-100 text-amber-800">Trusted lender</span>}
          {me.role === "admin" && <span className="pill bg-stone-800 text-white">admin</span>}
          <UserButton />
        </div>
      </header>

      <nav className="mb-5 flex flex-wrap gap-1 border-b border-stone-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.id ? "border-brand font-semibold text-brand" : "border-transparent text-stone-600 hover:text-stone-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "browse" && <Browse isAdmin={me.role === "admin"} />}
      {tab === "listings" && <MyListings />}
      {tab === "requests" && <LoanList view="mine" />}
      {tab === "incoming" && <LoanList view="incoming" />}
      {tab === "admin" && me.role === "admin" && <AdminPanel />}
    </main>
  );
}
