-- ============================================================
-- common schema — baseline
-- ============================================================
--
-- What `common` holds:
--   - profiles      — one row per auth user (created on their
--                     first sign-in; persists across sign-out).
--                     username is the public identity (immutable
--                     after first sign-in in the future picker flow).
--   - clubs         — fixed-membership rooms friends play in
--                     together. Cross-game social primitive.
--   - club_members  — m2m between clubs and profiles.
--   - club_active_game — at-most-one row per club; tracks which
--                     game the club is currently playing (across
--                     all gametypes). Auto-cleared by each game's
--                     own termination trigger.
--   - messages      — per-club chat. Single thread per club,
--                     persists across gametype switches.
--
-- What `common` MUST NOT do: reference any game schema. The
-- removability invariant (delete a game in three actions — folder,
-- registry line, schema) depends on common staying gametype-blind.
-- The link goes the other way: each game schema references
-- common.clubs(id) for `club_id`.
--
-- Per the alpha-software prior in CLAUDE.md, schema changes after
-- this baseline are written as new timestamped migrations, not as
-- edits to this file.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists common;

-- Authenticated users need usage on the schema so PostgREST can
-- expose tables and RPCs under it.
grant usage on schema common to authenticated;

-- ============================================================
-- common.profiles — one row per auth user
-- ============================================================
-- Created automatically by the on_auth_user_created trigger on
-- first sign-in. `username` is the public identity (URLs, rosters,
-- chat); `email` stays on auth.users as the magic-link credential
-- and is not surfaced in-app.
--
-- The unique constraint on username means a second user signing
-- in with a colliding email local-part (e.g. bob@foo.com after
-- bob@bar.com already exists) will fail the magic-link sign-in
-- entirely. That's accepted for alpha (~3 users, picker UI is
-- deferred — see project memory). When a picker lands, collision
-- handling moves into the auth flow.

create table common.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

alter table common.profiles enable row level security;

-- INTENTIONAL: any signed-in user can read any profile. Username
-- is public; there's no sensitive data on profiles today. Required
-- for club creation — when you type "leah" into the new-club form,
-- the FE has to be able to resolve "leah" → user_id BEFORE you
-- share a club with her, which rules out any "only people I share
-- a club with" row-tightening. The right axis is which COLUMNS
-- get exposed, not which rows.
--
-- If profile data ever grows sensitive (real names, settings,
-- email-derived metadata, etc.), the hardening move is to revoke
-- direct SELECT on common.profiles from authenticated and expose
-- a `common.profiles_public` view that selects only the safe
-- columns (username + whatever else is genuinely public). The FE
-- queries the view; security-definer RPCs that need the full row
-- read the base table directly.
create policy profiles_select_authenticated on common.profiles
  for select to authenticated using (true);

create policy profiles_update_own on common.profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on common.profiles to authenticated;

-- ============================================================
-- common.clubs — fixed-membership rooms
-- ============================================================
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

-- ============================================================
-- common.club_members — m2m
-- ============================================================
--
-- Pk on (club_id, user_id) so a user can't be listed twice in
-- the same club. Membership is fixed at creation in v1 (no
-- add/remove RPCs); the table exists in this normalized form
-- because (a) it's the right shape and (b) future member-listing
-- UI wants the relational structure.

create table common.club_members (
  club_id uuid not null references common.clubs(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- ============================================================
-- common.club_active_game — "what is this club playing now"
-- ============================================================
--
-- The primary key on club_id alone (NOT (club_id, gametype,
-- game_id)) is what enforces the "one active game per club, across
-- all gametypes" rule. Presence of a row → club has an active
-- game; absence → nothing is active for the club.
--
-- (game_id, gametype) is a soft FK into <gametype>.games(id). The
-- real FK can't be declared here because the target schema varies
-- per row (tinyspy.games for tinyspy, psychicnum.games for
-- psychicnum, future games for theirs). Cleanup of orphan rows
-- when a gametype is removed is handled in the drop-a-game recipe,
-- not by referential integrity.

create table common.club_active_game (
  club_id uuid primary key references common.clubs(id) on delete cascade,
  gametype text not null,
  game_id uuid not null,
  set_active_at timestamptz not null default now()
);

-- ============================================================
-- common.messages — per-club chat
-- ============================================================
-- Keyed by club, not game. Each club has a single persistent
-- chat thread; conversations span games and gametypes within
-- the club's lifetime. The 1–1000 character constraint matches
-- the prior per-game messages behavior. Writes only go through
-- common.send_message; no insert policy on the table itself.

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
-- The security-definer helper is_club_member (below) bypasses
-- RLS inside its body, preventing the infinite recursion that
-- would happen if club_members's own policy needed to ask
-- "is the caller a member of this club?"

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
-- go through the security-definer RPCs defined below (create_club,
-- send_message) and, for game-lifecycle transitions, through each
-- gametype's RPCs (which upsert/delete common.club_active_game via
-- their security-definer status).

grant select on common.clubs to authenticated;
grant select on common.club_members to authenticated;
grant select on common.club_active_game to authenticated;
grant select on common.messages to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- All four club tables broadcast so the FE can subscribe to:
--   - clubs              new club created / renamed
--   - club_members       roster changes (deferred to v2 but free)
--   - club_active_game   the "every member follows the active game"
--                        auto-nav rule lives on this one
--   - messages           chat
--
-- Profiles is deliberately NOT in the publication — usernames
-- don't change during a session and the realtime traffic isn't
-- worth it. If usernames become mutable later, add it then.

alter publication supabase_realtime add table common.clubs;
alter publication supabase_realtime add table common.club_members;
alter publication supabase_realtime add table common.club_active_game;
alter publication supabase_realtime add table common.messages;

-- ============================================================
-- common.slugify_club_name — user-typed name → URL handle
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
-- live in a slug-space user input cannot reach.
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
-- common.create_club RPC
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
  if new_handle like '=%' then
    raise exception 'club handle cannot start with reserved character'
      using errcode = 'P0001';
  end if;

  -- Resolve usernames → user_ids; collect any that didn't map.
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

  -- The unique constraint on clubs.handle does collision
  -- enforcement; we let the exception propagate so the caller
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
-- common.send_message RPC
-- ============================================================
--
-- Post a message to a club's chat. Authorized for any member of
-- the club. Trimmed content must be 1–1000 chars (matches the
-- check constraint on common.messages).

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
-- common.handle_new_user — auth.users trigger function
-- ============================================================
--
-- Materializes per-user state whenever a new auth.users row
-- appears (i.e. after a first successful magic-link sign-in):
--
--   1. A profile row with username = email's local-part.
--   2. A solo club with handle '=<username>', single-membered
--      (just this user). The '=' prefix puts solo clubs in a
--      slug-space user-typed names cannot reach (slugify_club_name
--      strips '='), so there's no risk of collision.
--
-- All three inserts happen in the same transaction as the
-- original auth.users insert. If username collides (unique
-- constraint on common.profiles.username), the entire magic-link
-- sign-in fails — per the alpha-software prior, that's accepted;
-- a username picker with collision UX moves into the auth flow
-- when that's redesigned.

create function common.handle_new_user()
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function common.handle_new_user();
