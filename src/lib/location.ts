/** Shared (client + server) job location matching. */

export type WorkMode = "remote" | "hybrid" | "onsite";
export type LocationPrefs = { places: string[]; modes: WorkMode[]; includeUnknown: boolean };

export const ALL_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
export const MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

const ALIASES: Record<string, string[]> = {
  uk: ["uk", "u.k.", "united kingdom", "great britain", "gb", "england", "scotland", "wales", "northern ireland"],
  "united kingdom": ["uk", "united kingdom", "great britain", "england", "scotland", "wales"],
  england: ["england", "uk", "united kingdom"],
  us: ["us", "usa", "u.s.", "united states", "america"],
  usa: ["us", "usa", "united states"],
  "united states": ["us", "usa", "united states"],
  europe: ["europe", "emea", "eu"],
  emea: ["emea", "europe"],
};

const GENERIC_REMOTE = /^(fully\s+)?(remote|anywhere|worldwide|global|distributed|work from home|wfh)[\s,()/-]*$/i;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, term: string) => new RegExp(`(^|[^a-z])${esc(term.toLowerCase())}($|[^a-z])`, "i").test(text);

export function inferMode(location: string | null, workMode: string | null): WorkMode | null {
  if (workMode === "remote" || workMode === "hybrid" || workMode === "onsite") return workMode;
  const l = (location ?? "").toLowerCase();
  if (/hybrid/.test(l)) return "hybrid";
  if (/remote|anywhere|work from home|wfh/.test(l)) return "remote";
  return null;
}

export function placeMatches(location: string, place: string) {
  const terms = ALIASES[place.trim().toLowerCase()] ?? [place.trim()];
  return terms.some((t) => t && hasWord(location, t));
}

/** Whether a job passes the user's location preferences. */
export function matchesLocation(job: { location: string | null; work_mode: string | null }, prefs: LocationPrefs) {
  const mode = inferMode(job.location, job.work_mode);
  if (mode && prefs.modes.length && !prefs.modes.includes(mode)) return false;
  const loc = (job.location ?? "").trim();
  if (!prefs.places.length) return loc || mode ? true : prefs.includeUnknown;
  if (!loc) return prefs.includeUnknown;
  if (prefs.places.some((p) => placeMatches(loc, p))) return true;
  // A remote role that names no place at all ("Remote", "Anywhere") is open to everyone.
  return mode === "remote" && GENERIC_REMOTE.test(loc);
}

export function describePrefs(prefs: LocationPrefs) {
  const modes = prefs.modes.length === ALL_MODES.length ? "any work mode" : prefs.modes.map((m) => MODE_LABEL[m]).join(" or ");
  const places = prefs.places.length ? `in ${prefs.places.join(", ")}` : "in any location";
  return `${modes}, ${places}`;
}
