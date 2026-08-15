"use client";

import { useState } from "react";
import { CityScanPanel } from "@/components/CityScanPanel";
import { JobSearchApp } from "@/components/JobSearchApp";

export function AppHome() {
  const [tab, setTab] = useState<"search" | "cities">("cities");

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-5 py-8">
      <div className="mb-6 flex gap-2">
        <TabButton active={tab === "cities"} onClick={() => setTab("cities")}>
          City firm scan
        </TabButton>
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>
          Quick SEO search
        </TabButton>
      </div>
      {tab === "cities" ? <CityScanPanel /> : <JobSearchApp />}
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
