# Folio — AI Job Hunter & Portfolio Microsite

Upload a CV → master profile + live microsite (`/[username]`) → discover/import jobs → approve on a Kanban →
truth-anchored tailored CV (PDF), tone-matched cover letter and a company pitch page (`/[username]/for/[company]`).

Next.js 16 (App Router, `proxy.ts`), Supabase (Postgres + pgvector + Auth + Storage), AI SDK v7
(`generateText` + `Output.object` with Zod), Anthropic for generation, OpenAI `text-embedding-3-small` for matching.

## Setup

1. `cp .env.example .env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already set for the `job-hunter` project
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Project Settings → API Keys (secret key)
   - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
   - `CRON_SECRET` — any long random string (`openssl rand -hex 32`)
   - `FIRECRAWL_API_KEY` — optional; without it pages are fetched directly and converted to text
   - `AI_MODEL` — optional, defaults to `claude-sonnet-5-5`
2. `npm install && npm run dev`
3. In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` and your production
   `https://<domain>/auth/callback` to Redirect URLs (needed for magic links and email confirmation).

The database schema is in `supabase/migrations/0001_init.sql` (already applied to the `job-hunter` project).

## Deploying (Vercel)

Import the repo, add the env vars above (set `NEXT_PUBLIC_APP_URL` to the production URL), deploy.
`vercel.json` schedules `/api/cron/scrape` daily at 06:17 UTC; Vercel sends `Authorization: Bearer $CRON_SECRET`.
LLM-heavy routes set `maxDuration = 300`.

## How the pieces fit

| Area | Where |
| --- | --- |
| CV parse → profile, embedding, instant job matches | `src/app/onboarding/actions.ts` |
| URL import → scrape → classify → embed → fit score | `src/lib/jobs.ts#importJobForUser` |
| Approve → tailored CV / cover letter / pitch | `src/lib/jobs.ts#tailorApplication` |
| Truth-anchor guard (post-generation) | `src/lib/jobs.ts#enforceTruthAnchor` |
| Watchlist scanning (Greenhouse/Lever/Ashby APIs, else scrape) | `src/lib/discovery.ts`, `src/lib/scraper.ts` |
| Public microsite + pitch pages | `src/app/[username]`, `src/components/public-portfolio-view.tsx` |
| PDF CVs | `src/app/api/pdf/[pipelineId]/route.tsx`, `src/components/pdf-cv-document.tsx` |

## Security notes

- No public RLS policy on `user_pipeline`: notes, fit reasoning, red flags and cover letters are never exposed.
  Public pages read whitelisted columns server-side with the service role (`src/lib/portfolio.ts`).
- Tailored CV PDFs are public only while the pitch is active (approved/applied/interview/offer) and are addressed by UUID.
- `increment_microsite_views` is callable only by the service role; owner previews aren't counted.
- The watchlist is shared: any signed-in user can add, edit or remove companies (fine for two beta users).
