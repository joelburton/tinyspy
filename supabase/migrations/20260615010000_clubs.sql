-- ============================================================
-- Clubs v1: the cross-game social primitive
-- ============================================================
--
-- See project memory's "Clubs v1 model" entry for the full design.
-- This migration is purely additive — no game schemas are touched.
-- Tinyspy still uses its own join_code / lobby / tinyspy.messages
-- flow; commit 5 of the execution sequence will rewire it to use
-- clubs. The intermediate state has clubs + chat infrastructure
-- existing without anyone reading from it, which is fine.
--
-- A club is a fixed-membership room formed by one creator. Members
-- are listed at creation and never change in v1; there are no
-- invitations or acceptance flows. The club page is visible only
-- to its members.
--
-- Solo clubs (handle starts with '=') are auto-created per user on
-- signup. They anchor solo-eligible games and (eventually) per-user
-- stats. UI hides them from the main clubs list.
--
-- Game-instance-per-club lifecycle uses three states:
--
--   active     — currently being played; at most one per club, across
--                all gametypes, enforced by common.club_active_game's
--                pk(club_id).
--   paused     — non-terminal internal status, no row in
--                club_active_game. Any number per club, including
--                multiple of the same gametype.
--   completed  — terminal internal status. Any number per club.
--
-- This migration creates the tables, RLS helpers, RLS policies,
-- and the create_club + send_message RPCs. State transitions
-- (start / pause / resume / complete) are game-specific and land
-- in commit 5 when tinyspy adopts clubs.

-- ============================================================
-- Tables
-- ============================================================

-- common.clubs — one row per club.
--
-- handle is the URL-safe slug used in `/c/<handle>` routes. Unique
-- across all clubs, including solo clubs. User-typed names go
-- through common.slugify_club_name (defined below) which strips
-- the '=' character (among other non-alphanumerics), so user clubs
-- can never collide with solo clubs whose handles start with '='.
--
-- name is the human-readable form (as typed by the creator). The
-- handle is derived from it at insert time by create_club().

create table common.clubs (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  name text not null,
  created_by uuid not null references common.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

-- common.club_members — m2m between clubs and profiles.
--
-- Pk on (club_id, user_id) so the same user can't be listed twice.
-- Membership is fixed at creation in v1 (no add/remove RPCs); the
-- table exists in this normalized form anyway because (a) it's the
-- right shape, and (b) commit-5+ work will add member-listing UI
-- and the relational shape is what that wants.

create table common.club_members (
  club_id uuid not null references common.clubs(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- common.club_active_game — the "what is this club playing right
-- now" pointer. The primary key on club_id alone (NOT (club_id,
-- gametype, game_id)) is what enforces the "one active game per
-- club, across all gametypes" rule. Presence of a row → club has
-- an active game; absence → nothing is active for the club.
--
-- (game_id, gametype) is a soft FK into <gametype>.games(id). The
-- real FK can't be declared here because the target schema varies
-- per row (tinyspy.games for tinyspy, future boggle.games, etc.).
-- Cleanup of orphan rows when a gametype is removed is handled in
-- the drop-a-game recipe, not by referential integrity.

create table common.club_active_game (
  club_id uuid primary key references common.clubs(id) on delete cascade,
  gametype text not null,
  game_id uuid not null,
  set_active_at timestamptz not null default now()
);

-- common.messages — chat, keyed by club not by game. Each club
-- has a single persistent chat thread; conversations span games
-- and gametypes within the club's lifetime. Per-game ephemeral
-- chat doesn't exist in this model.
--
-- The 1–1000 character constraint matches the prior tinyspy.messages
-- behavior. Writes only go through common.send_message (below);
-- no insert policy on the table itself.

create table common.messages (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  sent_at timestamptz not null default now()
);

create index messages_club_id_sent_at_idx
  on common.messages (club_id, sent_at);

-- ============================================================
-- RLS — only members can read club data
-- ============================================================
--
-- Pattern matches tinyspy.is_player_in_game: a security-definer
-- helper to avoid infinite recursion when club_members has a
-- policy that needs to ask "is the caller in this club?"

alter table common.clubs enable row level security;
alter table common.club_members enable row level security;
alter table common.club_active_game enable row level security;
alter table common.messages enable row level security;

create function common.is_club_member(target_club uuid)
returns boolean
language sql
security definer
set search_path = common, public, extensions
stable
as $$
  select exists (
    select 1 from common.club_members
    where club_id = target_club and user_id = auth.uid()
  );
$$;

create policy clubs_select on common.clubs
  for select to authenticated
  using (common.is_club_member(id));

create policy club_members_select on common.club_members
  for select to authenticated
  using (common.is_club_member(club_id));

create policy club_active_game_select on common.club_active_game
  for select to authenticated
  using (common.is_club_member(club_id));

create policy messages_select on common.messages
  for select to authenticated
  using (common.is_club_member(club_id));

-- No insert/update/delete policies on any of these tables. Writes
-- all go through the security-definer RPCs defined below
-- (create_club, send_message) and, for game-lifecycle transitions,
-- through each gametype's RPCs in commit 5.

grant select on common.clubs to authenticated;
grant select on common.club_members to authenticated;
grant select on common.club_active_game to authenticated;
grant select on common.messages to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
--
-- All four tables become realtime-aware so the (commit-4) clubs UI
-- can subscribe to "new message," "active-game changed," and (when
-- it eventually matters) "new member." common.messages is the
-- chatty one; the other three change rarely.

alter publication supabase_realtime add table common.clubs;
alter publication supabase_realtime add table common.club_members;
alter publication supabase_realtime add table common.club_active_game;
alter publication supabase_realtime add table common.messages;

-- ============================================================
-- slugify_club_name — turn user-typed name into URL handle
-- ============================================================
--
-- Rules:
--   - lowercase
--   - any run of non-alphanumeric characters collapses to a single '-'
--   - leading / trailing '-' stripped
--   - capped to 40 chars
--
-- The "non-alphanumeric → '-'" rule is what gives us namespace
-- separation from solo clubs. A user typing "=joel" produces the
-- handle "joel" — the '=' was treated like any other separator.
-- Solo clubs use literal '=<username>' handles set directly by the
-- new-user trigger (NOT routed through this function), so they
-- live in a slug-space that user input cannot reach.
--
-- Marked `immutable` so Postgres can use it in indexed expressions
-- if we ever want a generated column or expression index.

create function common.slugify_club_name(name text)
returns text
language sql
immutable
as $$
  select substr(
    regexp_replace(
      regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$', '', 'g'
    ),
    1, 40
  );
$$;

-- ============================================================
-- create_club RPC
-- ============================================================
--
-- Creates a new club + its full membership in a single transaction.
-- Reject reasons (all P0001 unless noted):
--
--   - not authenticated (42501)
--   - club name slugifies to an empty handle ("!!!" etc.)
--   - club name slugifies to a handle starting with '=' (defensive
--     check — the slugify rules already prevent this, but the
--     belt-and-suspenders check is cheap)
--   - one or more member_usernames don't exist (P0002)
--   - resulting membership has fewer than 2 members
--   - handle collision with an existing club (unique_violation, 23505)
--
-- Caller is automatically added if not already in member_usernames,
-- so a UI that lets the creator type only their friends doesn't
-- have to remember to also include themselves.

create function common.create_club(
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
  -- Defensive: slugify strips '=', so this should be unreachable.
  -- If it ever fires, we have a slugify bug, not a malicious input.
  if new_handle like '=%' then
    raise exception 'club handle cannot start with reserved character'
      using errcode = 'P0001';
  end if;

  -- Resolve usernames → user_ids. unknown_names collects any that
  -- didn't map. We aggregate both in one query for a single round
  -- trip; the array_remove peels off the nulls each side leaves.
  --
  -- The COALESCE-to-empty-array on both is load-bearing: when
  -- member_usernames is empty, the aggregate result is NULL and
  -- every subsequent NULL-in-condition (NULL > 0, NULL < 2,
  -- caller = ANY(NULL)) silently evaluates to false, letting the
  -- function fall through to create a zero-member club. Coercing
  -- to empty arrays makes the downstream checks behave.
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

  -- Auto-add the caller if they weren't in the list.
  if not (caller_id = any(resolved_ids)) then
    resolved_ids := resolved_ids || caller_id;
  end if;

  if coalesce(array_length(resolved_ids, 1), 0) < 2 then
    raise exception 'a club must have at least 2 members'
      using errcode = 'P0001';
  end if;

  -- The unique constraint on clubs.handle does the collision
  -- enforcement here; we let the exception propagate so the caller
  -- gets SQLSTATE 23505 (unique_violation).
  insert into common.clubs (handle, name, created_by)
  values (new_handle, club_name, caller_id)
  returning clubs.id into new_id;

  insert into common.club_members (club_id, user_id)
  select new_id, member_id from unnest(resolved_ids) as member_id;

  return query select new_id, new_handle;
end;
$$;

revoke execute on function common.create_club(text, text[]) from public;
grant execute on function common.create_club(text, text[]) to authenticated;

-- ============================================================
-- send_message RPC
-- ============================================================
--
-- Post a message to a club's chat. Authorized for any member of
-- the club. Trimmed content must be 1–1000 chars (matches the
-- check constraint on common.messages).
--
-- Tinyspy will rewire ChatPanel to use this RPC in commit 5; for
-- now the function exists but nothing calls it.

create function common.send_message(target_club uuid, content text)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  trimmed text := trim(content);
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from common.club_members
    where club_id = target_club and user_id = auth.uid()
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if length(trimmed) = 0 then
    raise exception 'message must not be empty' using errcode = 'P0001';
  end if;

  if length(trimmed) > 1000 then
    raise exception 'message too long (max 1000 chars)' using errcode = 'P0001';
  end if;

  insert into common.messages (club_id, user_id, content)
  values (target_club, auth.uid(), trimmed);
end;
$$;

revoke execute on function common.send_message(uuid, text) from public;
grant execute on function common.send_message(uuid, text) to authenticated;

-- ============================================================
-- handle_new_user — extended to create a solo club too
-- ============================================================
--
-- Each new user gets:
--   1. A profile row (existing behavior).
--   2. A solo club with handle '=<username>', single-membered
--      (just this user). The '=' prefix puts solo clubs in a
--      slug-space user-typed names cannot reach (slugify_club_name
--      strips '='), so there's no risk of collision.
--
-- The two inserts happen in the same transaction as the original
-- auth.users insert. If username collides (unique constraint on
-- common.profiles.username), the entire magic-link sign-in fails —
-- per the alpha-software prior, that's accepted; a username picker
-- with collision UX moves into the auth flow when it's redesigned.
--
-- We CREATE OR REPLACE rather than ALTER FUNCTION because plpgsql
-- function bodies aren't alterable in place.

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

  return new;
end;
$$;
