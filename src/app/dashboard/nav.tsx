"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Pipeline" },
  { href: "/dashboard/companies", label: "Watchlist" },
  { href: "/dashboard/profile", label: "Profile & CV" },
];

export function DashNav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/dashboard" ? path === "/dashboard" || path.startsWith("/dashboard/pipeline") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cn("rounded-full px-3 py-1.5", active ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
