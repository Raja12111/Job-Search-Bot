"use client";

import { useState } from "react";
import Link from "next/link";
import { CityExplorePanel } from "@/components/CityExplorePanel";
import { CityScanPanel } from "@/components/CityScanPanel";
import { JobSearchApp } from "@/components/JobSearchApp";

export function AppHome() {
  const [tab, setTab] = useState<"explore" | "cities" | "search">("explore");

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap gap-2">
        <TabButton active={tab === "explore"} onClick={() => setTab("explore")}>
          City explorer
        </TabButton>
        <TabButton active={tab === "cities"} onClick={() => setTab("cities")}>
          Multi-city scan
        </TabButton>
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>
          Quick SEO search
        </TabButton>
        <Link
          href="/results"
          className="rounded-full border border-[#3ee0a2] px-4 py-2 text-sm font-medium text-[#3ee0a2]"
        >
          Saved results
        </Link>
      </div>
      {tab === "explore" ? <CityExplorePanel /> : tab === "cities" ? <CityScanPanel /> : <JobSearchApp />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium ${
        active ? "bg-[#3ee0a2] text-[#07111f]" : "border border-[#1d3557] text-[#93a4bb]"
      }`}
    >
      {children}
    </button>
  );
}
