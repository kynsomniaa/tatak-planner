create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username citext not null,
  program text not null check (program = 'BS Computer Engineering'),
  course_code text not null,
  difficulty smallint not null check (difficulty between 1 and 5),
  workload smallint not null check (workload between 1 and 5),
  usefulness smallint not null check (usefulness between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 300),
  report_count integer not null default 0 check (report_count >= 0),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program, course_code)
);

create table if not exists public.rating_reports (
  rating_id uuid not null references public.ratings(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rating_id, reporter_id)
);

create index if not exists ratings_program_course_idx on public.ratings (program, course_code);
create index if not exists ratings_updated_at_idx on public.ratings (updated_at desc);
create index if not exists rating_reports_rating_idx on public.rating_reports (rating_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare requested_username text;
begin
  requested_username := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if requested_username !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$' then
    raise exception 'Invalid username';
  end if;
  insert into public.profiles (id, username) values (new.id, requested_username);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.enforce_rating_identity_and_moderation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare profile_username citext;
begin
  select username into profile_username from public.profiles where id = new.user_id;
  if profile_username is null then raise exception 'Rating user has no profile'; end if;
  new.username := profile_username;
  new.updated_at := now();
  if tg_op = 'UPDATE' and not public.is_admin() then
    new.hidden := old.hidden;
    if current_setting('app.rating_report_update', true) is distinct from 'true' then
      new.report_count := old.report_count;
    end if;
    new.user_id := old.user_id;
    new.program := old.program;
    new.course_code := old.course_code;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_rating_identity on public.ratings;
create trigger enforce_rating_identity before insert or update on public.ratings
for each row execute procedure public.enforce_rating_identity_and_moderation();

create or replace function public.report_rating(target_rating_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform set_config('app.rating_report_update', 'true', true);
  insert into public.rating_reports (rating_id, reporter_id)
  values (target_rating_id, auth.uid()) on conflict do nothing;
  update public.ratings
  set report_count = (select count(*) from public.rating_reports where rating_id = target_rating_id)
  where id = target_rating_id;
end;
$$;

create or replace function public.moderate_rating(target_rating_id uuid, should_hide boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  update public.ratings set hidden = should_hide where id = target_rating_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.ratings enable row level security;
alter table public.rating_reports enable row level security;

create policy "profiles_read_own" on public.profiles for select
using (id = auth.uid() or public.is_admin());

create policy "workspaces_read_own" on public.workspaces for select using (user_id = auth.uid());
create policy "workspaces_insert_own" on public.workspaces for insert with check (user_id = auth.uid());
create policy "workspaces_update_own" on public.workspaces for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "workspaces_delete_own" on public.workspaces for delete using (user_id = auth.uid());

create policy "ratings_read_visible" on public.ratings for select
using (not hidden or user_id = auth.uid() or public.is_admin());
create policy "ratings_insert_own" on public.ratings for insert with check (user_id = auth.uid());
create policy "ratings_update_own_or_admin" on public.ratings for update
using (user_id = auth.uid() or public.is_admin());
create policy "ratings_delete_own_or_admin" on public.ratings for delete
using (user_id = auth.uid() or public.is_admin());

create policy "reports_read_own_or_admin" on public.rating_reports for select
using (reporter_id = auth.uid() or public.is_admin());
create policy "reports_insert_own" on public.rating_reports for insert
with check (reporter_id = auth.uid());

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.ratings to authenticated;
grant select, insert on public.rating_reports to authenticated;
grant execute on function public.report_rating(uuid) to authenticated;
grant execute on function public.moderate_rating(uuid, boolean) to authenticated;
