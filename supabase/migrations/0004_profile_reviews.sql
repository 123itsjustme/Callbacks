create table public.profile_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('cv', 'linkedin')),
  overall_score int not null check (overall_score between 0 and 100),
  review jsonb not null,
  created_at timestamptz default now()
);
create index idx_profile_reviews_user on public.profile_reviews(user_id, kind, created_at desc);
alter table public.profile_reviews enable row level security;
create policy "Users manage own reviews" on public.profile_reviews
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.master_profiles add column if not exists linkedin_text text;
alter table public.master_profiles add column if not exists linkedin_updated_at timestamptz;
