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

export function appUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
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
