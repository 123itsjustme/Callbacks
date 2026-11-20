-- Callback v2: personal company lists, swipe deck, outreach kit, tracking

-- Personal company list on top of the shared target_companies pool
create table public.user_companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.target_companies(id) on delete cascade,
  status text not null check (status in ('suggested', 'active', 'removed')) default 'suggested',
  source text not null check (source in ('ai', 'manual', 'sample')) default 'manual',
  fit_reason text,
  last_scanned_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, company_id)
);
create index idx_user_companies_user on public.user_companies(user_id, status);
create index idx_user_companies_company on public.user_companies(company_id);
alter table public.user_companies enable row level security;
create policy "Users manage own company list" on public.user_companies
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Extra company context gathered during discovery
alter table public.target_companies add column if not exists website text;
alter table public.target_companies add column if not exists hq_location text;
alter table public.target_companies add column if not exists url_verified boolean default false;

-- Pipeline: swipe, background generation, outreach, tracking
alter table public.user_pipeline add column if not exists source text default 'match';
alter table public.user_pipeline add column if not exists pass_reason text;
alter table public.user_pipeline add column if not exists fit_assessed_at timestamptz;
alter table public.user_pipeline add column if not exists assets_status text not null default 'none'
  check (assets_status in ('none', 'generating', 'ready', 'error'));
alter table public.user_pipeline add column if not exists assets_error text;
alter table public.user_pipeline add column if not exists outreach_json jsonb;
alter table public.user_pipeline add column if not exists next_action text;
alter table public.user_pipeline add column if not exists next_action_due date;
create index if not exists idx_pipeline_user_due on public.user_pipeline(user_id, next_action_due);

-- Existing rows that already have assets are ready
update public.user_pipeline set assets_status = 'ready' where tailored_cv_json is not null and assets_status = 'none';

-- Activity history per application
create table public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.user_pipeline(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  detail text,
  created_at timestamptz default now()
);
create index idx_events_pipeline on public.pipeline_events(pipeline_id, created_at desc);
create index idx_events_user on public.pipeline_events(user_id);
alter table public.pipeline_events enable row level security;
create policy "Users manage own events" on public.pipeline_events
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Discovery bookkeeping
alter table public.profiles add column if not exists last_discovery_at timestamptz;
