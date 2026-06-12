-- profiles: one row per auth user. Holds display name (and later, preferences).
-- Auto-created via trigger when a new auth.users row appears.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can read any profile (needed to show opponent display names).
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Users can update only their own profile.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert/delete policies: rows are created by the trigger below, and deleted
-- by the cascade from auth.users. Clients have no direct write paths.

grant select, update on public.profiles to authenticated;

-- Trigger: when a new user signs up, materialize a profile row.
-- display_name defaults to the part of the email before '@'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'player')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
