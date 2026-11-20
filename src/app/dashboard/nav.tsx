"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/discover", label: "Discover" },
  { href: "/dashboard", label: "Pipeline" },
  { href: "/dashboard/companies", label: "Companies" },
  { href: "/dashboard/profile#score", label: "Score" },
  { href: "/dashboard/profile", label: "Profile" },
];

export function DashNav({ newCount = 0 }: { newCount?: number }) {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active =
          l.href === "/dashboard"
            ? path === "/dashboard" || path.startsWith("/dashboard/pipeline")
            : l.href.includes("#")
              ? false
              : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={cn("whitespace-nowrap rounded-full px-3 py-1.5", active ? "bg-ink text-paper" : "text-muted hover:text-ink")}>
            {l.label}
            {l.href === "/dashboard/discover" && newCount > 0 && (
              <span className="ml-1.5 rounded-full bg-pop px-1.5 py-px font-mono text-[10px] font-semibold text-ink" aria-label={`${newCount} new roles`}>
                {newCount > 99 ? "99+" : newCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
