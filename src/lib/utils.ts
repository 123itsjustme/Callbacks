import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Usernames that would collide with top-level routes. */
export const RESERVED_USERNAMES = new Set([
  "login", "logout", "signup", "dashboard", "onboarding", "api", "auth", "for", "admin",
  "settings", "about", "privacy", "terms", "static", "_next", "favicon-ico", "robots-txt", "sitemap-xml",
]);

/** Server-side base URL: explicit setting, else Vercel's production domain, else localhost. */
export function appUrl(path = "") {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = (process.env.NEXT_PUBLIC_APP_URL || (vercel ? `https://${vercel}` : "http://localhost:3000")).replace(/\/$/, "");
  return base + path;
}

export const ACTIVE_PITCH_STATUSES = ["approved", "applied", "interview", "offer"] as const;
export const PIPELINE_STATUSES = ["new", "approved", "applied", "interview", "offer", "rejected", "passed"] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const AVAILABILITY_OPTIONS = [
  "Available immediately",
  "Open to opportunities",
  "Available in 1 month",
  "Available in 3 months",
  "Not looking",
];

/** Stage colours: warm grey → marigold → sage → forest green. Same palette as the microsite. */
export const STAGE_STYLE: Record<string, { dot: string; tint: string; bar: string; label: string }> = {
  new: { dot: "#a8a294", tint: "rgba(168,162,148,0.10)", bar: "#d9d4c7", label: "New" },
  approved: { dot: "#f2b53a", tint: "rgba(242,181,58,0.10)", bar: "#f2b53a", label: "Ready to send" },
  applied: { dot: "#7fa58e", tint: "rgba(127,165,142,0.09)", bar: "#7fa58e", label: "Applied" },
  interview: { dot: "#1f4d3a", tint: "rgba(31,77,58,0.05)", bar: "#1f4d3a", label: "Interview" },
  offer: { dot: "#1f4d3a", tint: "rgba(31,77,58,0.07)", bar: "linear-gradient(90deg,#1f4d3a 60%,#f2b53a)", label: "Offer" },
  passed: { dot: "#cfcabd", tint: "transparent", bar: "#e3dfd4", label: "Passed" },
  rejected: { dot: "#cfcabd", tint: "transparent", bar: "#e3dfd4", label: "Rejected" },
};
