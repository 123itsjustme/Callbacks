alter table public.profiles add column if not exists job_locations text[] not null default array[]::text[];
alter table public.profiles add column if not exists work_modes text[] not null default array['remote','hybrid','onsite'];
alter table public.profiles add column if not exists include_unknown_location boolean not null default true;
alter table public.profiles add constraint profiles_work_modes_valid check (work_modes <@ array['remote','hybrid','onsite']);
