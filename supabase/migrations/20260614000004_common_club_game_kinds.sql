-- ============================================================
-- common: club ↔ gametype m2m + gametype registry
-- ============================================================
--
-- Adds two related tables and threads them into the
-- club-creation flow:
--
--   common.gametypes        — the registered-gametype list
--   common.club_game_kinds  — m2m saying "this club may play
--                              this gametype"
--
-- Both `handle_new_user` (auto-creates the solo club) and
-- `create_club` (creates a regular club) are extended to
-- populate `club_game_kinds` with every registered gametype
-- at club-creation time. v1 lets every newly-created club
-- play every game; per-club opt-out is deferred behind a
-- future club-settings UI (see docs/deferred.md).
--
-- Per docs/common.md's "Solo and multiplayer play" section,
-- the FE side reads this m2m to decide which Start buttons
-- to render in a club — visible iff there's an m2m row, and
-- then disabled-with-tooltip if the club's member count is
-- outside the gametype's declared range (declared in each
-- manifest's `numberOfPlayers` field).
--
-- We do NOT auto-add new gametypes to existing clubs when
-- they're registered later. Per Joel's call: rare event,
-- handled as a DB-admin INSERT when (if ever) a new gametype
-- needs to retro-apply. Acceptable under the alpha-software
-- prior.

-- ============================================================
-- common.gametypes — the registered-gametype list
-- ============================================================
-- Authoritative SQL-side list of gametypes. Used by the
-- m2m-population RPCs below so each only needs one query
-- ("INSERT INTO club_game_kinds SELECT new_club_id, gametype
-- FROM gametypes") rather than hardcoding the list of
-- gametype strings.
--
-- ┌─ Convention for new gametypes ─────────────────────────┐
-- │ Each gametype's baseline migration must register itself│
-- │ here:                                                  │
-- │                                                        │
-- │   insert into common.gametypes (gametype)              │
-- │   values ('boggle')                                    │
-- │   on conflict do nothing;                              │
-- │                                                        │
-- │ The seed inserts at the bottom of THIS file cover the  │
-- │ two existing gametypes (tinyspy, psychicnum) whose     │
-- │ baselines pre-date the registry table. Future baselines│
-- │ register themselves in their own files.                │
-- └────────────────────────────────────────────────────────┘

create table common.gametypes (
  gametype text primary key
);

alter table common.gametypes enable row level security;

-- Permissive read — gametype identifiers are not sensitive,
-- and the FE needs to discover them anyway (the registry
-- table mirrors what src/games.ts declares on the FE side).
create policy gametypes_select on common.gametypes
  for select to authenticated using (true);

grant select on common.gametypes to authenticated;

-- ============================================================
-- common.club_game_kinds — m2m
-- ============================================================
-- PK is (club_id, gametype) so each pair is recorded at most
-- once. `gametype` FKs to common.gametypes for referential
-- integrity (an unregistered gametype can't be inserted).
--
-- v1 only writes from the security-definer RPCs below. A
-- future "club admin UI" would add an RPC for member-driven
-- enable/disable. No INSERT/UPDATE/DELETE policies on the
-- table itself.

create table common.club_game_kinds (
  club_id  uuid not null references common.clubs(id) on delete cascade,
  gametype text not null references common.gametypes(gametype) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (club_id, gametype)
);

alter table common.club_game_kinds enable row level security;

create policy club_game_kinds_select on common.club_game_kinds
  for select to authenticated
  using (common.is_club_member(club_id));

grant select on common.club_game_kinds to authenticated;

-- ============================================================
-- Replace handle_new_user — also populate club_game_kinds
-- ============================================================
-- Same body as the baseline, with one additional INSERT at
-- the end that adds an m2m row for every registered gametype.
-- CREATE OR REPLACE preserves the trigger binding (the
-- on_auth_user_created trigger still points at this function).

create or replace function common.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  derived_username text;
  solo_club_id uuid;
begin
  derived_username := coalesce(nullif(split_part(new.email, '@', 1), ''), 'player');

  insert into common.profiles (user_id, username)
  values (new.id, derived_username);

  insert into common.clubs (handle, name, created_by)
  values ('=' || derived_username, derived_username, new.id)
  returning clubs.id into solo_club_id;

  insert into common.club_members (club_id, user_id)
  values (solo_club_id, new.id);

  -- Populate club_game_kinds for the new solo club with every
  -- registered gametype. The FE filters at render time on the
  -- gametype's `numberOfPlayers` range, so e.g. tinyspy ([2,2])
  -- shows up here but the Start button will be hidden by the
  -- range check — the row's still here for the (future)
  -- "your solo club doesn't play tinyspy because solo" tooltip.
  insert into common.club_game_kinds (club_id, gametype)
  select solo_club_id, gametype from common.gametypes;

  return new;
end;
$$;

-- ============================================================
-- Replace create_club — also populate club_game_kinds
-- ============================================================
-- Same body as the baseline; the only addition is the m2m
-- INSERT at the end. CREATE OR REPLACE keeps the existing
-- grant unchanged.

create or replace function common.create_club(
  club_name text,
  member_usernames text[]
)
returns table(id uuid, handle text)
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  new_handle text;
  resolved_ids uuid[];
  unknown_names text[];
  new_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  new_handle := common.slugify_club_name(club_name);
  if length(new_handle) = 0 then
    raise exception 'club name must contain alphanumeric characters'
      using errcode = 'P0001';
  end if;
  if new_handle like '=%' then
    raise exception 'club handle cannot start with reserved character'
      using errcode = 'P0001';
  end if;

  select
    coalesce(array_remove(array_agg(p.user_id), null), array[]::uuid[]),
    coalesce(array_remove(array_agg(case when p.user_id is null then u end), null), array[]::text[])
    into resolved_ids, unknown_names
  from unnest(member_usernames) as u
  left join common.profiles p on p.username = u;

  if array_length(unknown_names, 1) > 0 then
    raise exception 'unknown usernames: %', array_to_string(unknown_names, ', ')
      using errcode = 'P0002';
  end if;

  if not (caller_id = any(resolved_ids)) then
    resolved_ids := resolved_ids || caller_id;
  end if;

  if coalesce(array_length(resolved_ids, 1), 0) < 2 then
    raise exception 'a club must have at least 2 members'
      using errcode = 'P0001';
  end if;

  insert into common.clubs (handle, name, created_by)
  values (new_handle, club_name, caller_id)
  returning clubs.id into new_id;

  insert into common.club_members (club_id, user_id)
  select new_id, member_id from unnest(resolved_ids) as member_id;

  -- Populate club_game_kinds with every registered gametype.
  -- v1 lets every new club play every registered game; per-club
  -- opt-out is deferred (see docs/deferred.md). The FE's
  -- per-club Start-button rendering still applies the player-
  -- count range from each gametype's manifest, so e.g. tinyspy
  -- appears disabled in a 3-member club's button list.
  insert into common.club_game_kinds (club_id, gametype)
  select new_id, gametype from common.gametypes;

  return query select new_id, new_handle;
end;
$$;

-- ============================================================
-- Seed: the two gametypes whose baselines pre-date this file
-- ============================================================
-- Future gametype baselines register themselves; these two
-- are seeded here because their baselines were written before
-- common.gametypes existed. The ON CONFLICT keeps this
-- idempotent (a partial replay can't duplicate-error).

insert into common.gametypes (gametype) values
  ('tinyspy'),
  ('psychicnum')
on conflict do nothing;
