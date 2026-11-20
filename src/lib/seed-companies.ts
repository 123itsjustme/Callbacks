import type { OrgType } from "./ai/schemas";

/**
 * Sample watchlist for beta testing. URLs were written from public knowledge and could NOT be
 * verified from the build sandbox — if a scan reports a 404, fix the URL inline on /dashboard/companies.
 */
export const SEED_COMPANIES: { name: string; org_type: OrgType; careers_url: string }[] = [
  { name: "Devolver Digital", org_type: "publisher", careers_url: "https://www.devolverdigital.com/jobs" },
  { name: "Team17", org_type: "publisher", careers_url: "https://www.team17.com/careers" },
  { name: "Raw Fury", org_type: "publisher", careers_url: "https://rawfury.com/jobs" },
  { name: "Annapurna Interactive", org_type: "publisher", careers_url: "https://annapurnainteractive.com/careers" },
  { name: "Supergiant Games", org_type: "indie", careers_url: "https://www.supergiantgames.com/careers" },
  { name: "ustwo games", org_type: "indie", careers_url: "https://ustwogames.co.uk/careers" },
  { name: "Sumo Digital", org_type: "indie", careers_url: "https://www.sumo-digital.com/careers" },
  { name: "AKQA", org_type: "agency", careers_url: "https://www.akqa.com/careers" },
  { name: "Wieden+Kennedy", org_type: "agency", careers_url: "https://www.wk.com/careers" },
  { name: "Mother London", org_type: "agency", careers_url: "https://www.motherlondon.com/careers" },
  { name: "Spotify", org_type: "client", careers_url: "https://jobs.lever.co/spotify" },
];
