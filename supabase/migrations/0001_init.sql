-- Job Hunter: initial schema (reviewed version of the handoff migration)
create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  full_name text not null,
  headline text,
  bio text,
  location text,
  availability_status text default 'Open to opportunities',
  preferred_org_types text[] default array['agency', 'indie', 'publisher', 'client'],
  target_roles text[] default array[]::text[],
  contact_email text,
  social_links jsonb default '{}'::jsonb,
  is_public boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.master_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  raw_cv_text text,
  structured_data jsonb not null default '{"summary":"","experience":[],"projects":[],"skills":[],"education":[],"awards":[]}'::jsonb,
  embedding extensions.vector(1536),
  updated_at timestamptz default now()
);

create table public.target_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  org_type text check (org_type in ('agency', 'indie', 'publisher', 'client', 'other')) default 'other',
  careers_url text unique not null,
  ats_provider text default 'custom',
  added_by uuid references public.profiles(id) on delete set null,
  last_scraped_at timestamptz,
  created_at timestamptz default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.target_companies(id) on delete set null,
  company_name text not null,
  company_slug text not null,
  org_type text check (org_type in ('agency', 'indie', 'publisher', 'client', 'other')) default 'other',
  title text not null,
  location text,
  work_mode text,
  salary_text text,
  source_url text unique not null,
  description_md text not null,
  summary_bullets text[] default array[]::text[],
  embedding extensions.vector(1536),
  posted_at timestamptz default now(),
  created_at timestamptz default now()
);

create table public.user_pipeline (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null check (status in ('new', 'approved', 'applied', 'interview', 'offer', 'rejected', 'passed')) default 'new',
  match_score int check (match_score between 0 and 100),
  fit_reasoning text,
  red_flags text[] default array[]::text[],
  tailored_cv_json jsonb,
  cover_letter_md text,
  company_slug text not null,
  custom_pitch_headline text,
  custom_pitch_intro text,
  featured_project_ids text[] default array[]::text[],
  microsite_views int default 0,
  notes text,
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, job_id)
);

create index on public.jobs using hnsw (embedding extensions.vector_cosine_ops);
create index on public.master_profiles using hnsw (embedding extensions.vector_cosine_ops);
create index idx_pipeline_user_status on public.user_pipeline(user_id, status);
create index idx_pipeline_user_company on public.user_pipeline(user_id, company_slug);
create index idx_pipeline_job on public.user_pipeline(job_id);
create index idx_jobs_company on public.jobs(company_id);
create index idx_companies_added_by on public.target_companies(added_by);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_master_updated before update on public.master_profiles for each row execute function public.set_updated_at();
create trigger trg_pipeline_updated before update on public.user_pipeline for each row execute function public.set_updated_at();

-- Vector similarity matching
create or replace function public.match_jobs_for_user(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.68,
  match_count int default 25
)
returns table (id uuid, company_name text, company_slug text, org_type text, title text, similarity float)
language sql stable set search_path = public, extensions
as $$
  select j.id, j.company_name, j.company_slug, j.org_type, j.title,
         1 - (j.embedding <=> query_embedding) as similarity
  from public.jobs j
  where j.embedding is not null
    and 1 - (j.embedding <=> query_embedding) >= match_threshold
  order by j.embedding <=> query_embedding
  limit match_count;
$$;

-- View counter (server-only: called with the service role from the public pitch page)
create or replace function public.increment_microsite_views(p_username text, p_company_slug text)
returns void language sql security definer set search_path = public
as $$
  update public.user_pipeline up
  set microsite_views = up.microsite_views + 1
  from public.profiles p
  where up.user_id = p.id
    and p.username = p_username
    and up.company_slug = p_company_slug
    and up.status in ('approved', 'applied', 'interview', 'offer');
$$;
revoke execute on function public.increment_microsite_views(text, text) from public, anon, authenticated;
revoke execute on function public.match_jobs_for_user(extensions.vector, float, int) from public, anon;
grant execute on function public.match_jobs_for_user(extensions.vector, float, int) to authenticated, service_role;

-- RLS
alter table public.profiles enable row level security;
alter table public.master_profiles enable row level security;
alter table public.target_companies enable row level security;
alter table public.jobs enable row level security;
alter table public.user_pipeline enable row level security;

create policy "Public profiles viewable by everyone" on public.profiles
  for select using (is_public = true or (select auth.uid()) = id);
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users delete own profile" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

create policy "Users manage own master profile" on public.master_profiles
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Authenticated read target companies" on public.target_companies
  for select to authenticated using (true);
create policy "Authenticated insert target companies" on public.target_companies
  for insert to authenticated with check (added_by is null or added_by = (select auth.uid()));

create policy "Authenticated read jobs" on public.jobs
  for select to authenticated using (true);
-- jobs are inserted server-side with the service role (URL import + cron)

create policy "Users manage own pipeline" on public.user_pipeline
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- NOTE: no public select policy on user_pipeline. Public pitch pages read only
-- whitelisted columns server-side via the service role.

-- Storage
insert into storage.buckets (id, name, public) values ('cvs', 'cvs', false) on conflict (id) do nothing;
create policy "Users upload own CVs" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users read own CVs" on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users update own CVs" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own CVs" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = (select auth.uid())::text);
