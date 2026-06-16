-- ============================================================
-- common schema — baseline (squashed)
-- ============================================================
--
-- Squashed from three originally-separate migrations:
--
--   2026-06-12  common_baseline           — profiles, clubs,
--                                            clubs_members, club_active_game,
--                                            messages, slugify, create_club,
--                                            send_message, is_club_member,
--                                            handle_new_user trigger
--   2026-06-14  common_club_game_kinds    — gametypes registry +
--                                            clubs_gametypes m2m, with
--                                            handle_new_user / create_club
--                                            extended to populate it
--
-- The pre-squash files lived behind several CREATE OR REPLACE
-- patches on top of the original baseline. The squash collapses
-- them into a single forward definition: every table created once
-- with its final shape, every function created once with its final
-- body. The original migration files (and their CREATE OR REPLACE
-- dances) live in git history for anyone curious about the
-- evolution.
--
-- What `common` holds:
--   - profiles            — one row per auth user (created on
--                            their first sign-in; persists across
--                            sign-out). username is the public
--                            identity.
--   - clubs               — fixed-membership rooms friends play in
--                            together. Cross-game social primitive.
--   - clubs_members       — m2m between clubs and profiles.
--   - gametypes           — registered-gametype list. Each game's
--                            baseline migration self-registers via
--                            an INSERT ... ON CONFLICT DO NOTHING.
--   - games               — universal game-record header (the
--                            "index"). One row per game-playing
--                            across all gametypes. Holds club_id,
--                            gametype, timestamps, status_summary
--                            jsonb, and `is_active` (the per-club
--                            active-game flag, enforced by a partial
--                            unique index — at most one active row
--                            per club). Per-gametype detail (board,
--                            secret, current turn, etc.) lives on
--                            `<gametype>.games`, which shares an id
--                            with this row via FK.
--   - game_players        — who played each game + their per-player
--                            outcome (`result jsonb`, populated at
--                            game-end). Persisted "who played" is a
--                            distinct concept from current club
--                            membership — game_players is frozen
--                            at game-create time, while clubs_members
--                            is the durable membership of the room.
--   - clubs_gametypes     — m2m saying "this club may play this
--                            gametype." Populated for every new
--                            club by handle_new_user / create_club.
--   - messages            — per-club chat. Single thread per club,
--                            persists across gametype switches.
--
-- (An earlier iteration had a separate `club_active_game` pointer
-- table. That table's three roles — mark which game is active,
-- enforce one-active-per-club, drive realtime auto-nav — all
-- collapsed onto `common.games.is_active` once `common.games`
-- itself existed.)
--
-- Naming note: m2m tables are pluralized on both sides
-- (`clubs_members`, `clubs_gametypes`) so they read as m:m at a
-- glance rather than as 1:m. See docs/naming.md.
--
-- What `common` MUST NOT do: reference any game schema. The
-- removability invariant (delete a game in three actions — folder,
-- registry line, schema) depends on common staying gametype-blind.
-- The link goes the other way: each game schema references
-- common.clubs(id) for `club_id` and self-registers via
-- common.gametypes.

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
-- common.clubs_members — m2m
-- ============================================================
--
-- Pk on (club_id, user_id) so a user can't be listed twice in
-- the same club. Membership is fixed at creation in v1 (no
-- add/remove RPCs); the table exists in this normalized form
-- because (a) it's the right shape and (b) future member-listing
-- UI wants the relational structure.

create table common.clubs_members (
  club_id uuid not null references common.clubs(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- ============================================================
-- common.gametypes — the registered-gametype list
-- ============================================================
-- Authoritative SQL-side list of gametypes. Used by the
-- m2m-population RPCs below so each only needs one query
-- ("INSERT INTO clubs_gametypes SELECT new_club_id, gametype
-- FROM gametypes") rather than hardcoding the list of
-- gametype strings.
--
-- Defined before common.games so that table's `gametype` column
-- can carry a real FK pointing here.
--
-- ┌─ Convention for new gametypes ─────────────────────────┐
-- │ Each gametype's baseline migration must self-register: │
-- │                                                        │
-- │   insert into common.gametypes (gametype)              │
-- │   values ('boggle')                                    │
-- │   on conflict do nothing;                              │
-- │                                                        │
-- │ The three existing baselines (tinyspy, psychicnum,     │
-- │ wordknit) all do this at the bottom of their files;    │
-- │ a future game follows the same pattern.                │
-- └────────────────────────────────────────────────────────┘

create table common.gametypes (
  gametype text primary key
);

-- ============================================================
-- common.games — the universal game record (header)
-- ============================================================
-- One row per game-playing, across all gametypes. The "header"
-- table in a classical header-detail split:
--
--   common.games            — cross-cutting fields (club, gametype,
--                              timestamps, summary status)
--   <gametype>.games        — gametype-specific game state (board,
--                              secrets, current turn, …) FK'd to
--                              this row's id via id PK
--
-- This split powers the "list all games in a club" surface — one
-- query against common.games replaces today's registry-dispatch
-- through each manifest's fetchClubGames. Per-gametype detail
-- stays lazy-loaded (matches the FE's chunk-per-game pattern).
--
-- `status_summary jsonb` is the gametype's structured description
-- of "where is this game now" — populated by each gametype's
-- end-of-game flow. The manifest is the only thing that knows
-- how to render it (typed by the gametype, not by common).
--
-- ended_at is null while in_progress and set at terminal
-- transition by common.end_game.
--
-- `gametype` FKs to common.gametypes(gametype) ON DELETE CASCADE,
-- so dropping a gametype from the registry auto-cleans its games.

-- `title` is a per-game identity string the FE renders in lists
-- as "<Manifest.name>: <title>" — gametype is the prefix, title
-- is the disambiguator. Set at create_game time by the gametype's
-- own RPC, never updated automatically afterward (a future
-- player-rename RPC could update it, but isn't planned today).
--
-- Each gametype owns its title formula. Today's conventions:
--
--   tinyspy:     "<seatA>-v-<seatB>: WORD1, WORD2, WORD3, WORD4"
--                (alphabetical first 4 of the picked 25)
--   psychicnum:  "<target-number-as-text>"
--                (the target IS leaked — psychic-num is a toy
--                 game; the column-grant pattern on `target` is
--                 retained for educational value but not for
--                 actual secrecy)
--   wordknit:    "TILE1, TILE2, TILE3, TILE4"
--                (alphabetical first 4 of the 16 board tiles —
--                 degenerate in the POC since the board is
--                 hardcoded, but the rule travels forward when
--                 real puzzles arrive)
--
-- Future puzzle-based games (crosswords, NYT Connections, etc.)
-- will pull title from the puzzle source ("NYT Sun 2026-06-14").

-- `setup jsonb` is the frozen-at-create-time player choices for
-- this game — the payload the start-game dialog produced. Stored
-- on common.games (not on `<gametype>.games`) because (a) every
-- game has one and the shape is canonical here, (b) a single
-- common-side read can surface setup-derived chrome in club
-- listings (e.g. a future Boggle's "5x5" badge from setup.boardSize),
-- and (c) the FE-side `useCommonGame` hook reads timer + paused
-- state from one place. Each gametype's `create_game` does its own
-- field-level validation (e.g. setup.guesses ∈ {3,5,7,9}) AND
-- calls `common.validate_timer(setup->'timer')` before passing
-- the whole blob up to `common.create_game`.
create table common.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  gametype text not null references common.gametypes(gametype) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  setup jsonb not null,
  is_active boolean not null default false,
  status_summary jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index common_games_club_id_started_at_idx
  on common.games (club_id, started_at desc);

-- "At most one active game per club, across all gametypes" is
-- enforced by this partial unique index. Multiple is_active=false
-- rows per club are fine (the index doesn't include them); a
-- second is_active=true row for the same club would raise
-- unique_violation, which would be a create_game bug — the RPC's
-- "clear current active" step handles the transition.
create unique index common_games_one_active_per_club
  on common.games (club_id)
  where is_active = true;

-- ============================================================
-- common.game_players — who played + per-player outcome
-- ============================================================
-- One row per (game, player) — the persisted record of who
-- actually played a specific game. Frozen at game-create time;
-- not updated when clubs_members grows (a friend joining the
-- club later doesn't retroactively appear in past games'
-- game_players).
--
-- This distinguishes "current membership of the social space"
-- (clubs_members) from "people who played this specific game"
-- (game_players). Both reads are useful — clubs_members for
-- chat / invitations / future-game eligibility, game_players
-- for "who was at this game" historical accuracy.
--
-- `result jsonb` is the per-player end-state — null while the
-- game is in progress, populated by common.end_game at terminal
-- transition. The gametype's manifest knows the shape (won/lost
-- flag for cooperative games, score for boggle, etc.) and how
-- to render it.

create table common.game_players (
  game_id uuid not null references common.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  result jsonb,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index common_game_players_user_id_idx
  on common.game_players (user_id);

-- ============================================================
-- common.clubs_gametypes — m2m
-- ============================================================
-- PK is (club_id, gametype) so each pair is recorded at most
-- once. `gametype` FKs to common.gametypes for referential
-- integrity (an unregistered gametype can't be inserted).
--
-- v1 only writes from the security-definer RPCs below
-- (handle_new_user, create_club). A future "club admin UI"
-- would add an RPC for member-driven enable/disable. No
-- INSERT/UPDATE/DELETE policies on the table itself.

create table common.clubs_gametypes (
  club_id  uuid not null references common.clubs(id) on delete cascade,
  gametype text not null references common.gametypes(gametype) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (club_id, gametype)
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
-- would happen if clubs_members's own policy needed to ask
-- "is the caller a member of this club?"

alter table common.profiles         enable row level security;
alter table common.clubs            enable row level security;
alter table common.clubs_members    enable row level security;
alter table common.gametypes        enable row level security;
alter table common.games            enable row level security;
alter table common.game_players     enable row level security;
alter table common.clubs_gametypes  enable row level security;
alter table common.messages         enable row level security;

create function common.is_club_member(target_club uuid)
returns boolean
language sql
security definer
set search_path = common, public, extensions
stable
as $$
  select exists (
    select 1 from common.clubs_members
    where club_id = target_club and user_id = auth.uid()
  );
$$;

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

create policy clubs_select on common.clubs
  for select to authenticated
  using (common.is_club_member(id));

create policy clubs_members_select on common.clubs_members
  for select to authenticated
  using (common.is_club_member(club_id));

create policy messages_select on common.messages
  for select to authenticated
  using (common.is_club_member(club_id));

-- Permissive read on gametypes — gametype identifiers are not
-- sensitive, and the FE needs to discover them anyway (the
-- registry table mirrors what src/games.ts declares on the FE
-- side).
create policy gametypes_select on common.gametypes
  for select to authenticated using (true);

create policy clubs_gametypes_select on common.clubs_gametypes
  for select to authenticated
  using (common.is_club_member(club_id));

-- Game records are club-wide: any club member can see every game
-- ever played in the club, regardless of whether they were one of
-- the players themselves. "History belongs to the club." Same
-- model as messages — chat threads span game playings and aren't
-- per-game-private.
create policy games_select on common.games
  for select to authenticated
  using (common.is_club_member(club_id));

-- Game-player records inherit visibility from their parent game.
-- The EXISTS subquery mirrors the per-gametype `*_select` policy
-- shape (psychicnum.guesses, wordknit.guesses, etc.).
create policy game_players_select on common.game_players
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = game_players.game_id
         and common.is_club_member(g.club_id)
    )
  );

-- No insert/update/delete policies on any of these tables. Writes
-- go through the security-definer RPCs defined below (create_club,
-- send_message, the create_game/end_game game-lifecycle helpers
-- called from each gametype's RPCs).

grant select, update on common.profiles        to authenticated;
grant select on common.clubs                   to authenticated;
grant select on common.clubs_members           to authenticated;
grant select on common.gametypes               to authenticated;
grant select on common.games                   to authenticated;
grant select on common.game_players            to authenticated;
grant select on common.clubs_gametypes         to authenticated;
grant select on common.messages                to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Five tables broadcast so the FE can subscribe to:
--   - clubs              new club created / renamed
--   - clubs_members      roster changes (deferred to v2 but free)
--   - messages           chat
--   - games              new games appear; status_summary, ended_at,
--                        is_active flips drive list updates AND the
--                        "every member follows the active game"
--                        auto-nav (which used to live on a separate
--                        club_active_game pointer table)
--   - game_players       end-of-game `result` writes trigger
--                        per-player outcome rendering
--
-- Profiles is deliberately NOT in the publication — usernames
-- don't change during a session and the realtime traffic isn't
-- worth it. If usernames become mutable later, add it then.
--
-- gametypes / clubs_gametypes also deliberately not published —
-- they only change at club creation (already handled by the
-- ClubPage refetch on navigation) and at gametype registration
-- (a deploy-time event).

alter publication supabase_realtime add table common.clubs;
alter publication supabase_realtime add table common.clubs_members;
alter publication supabase_realtime add table common.messages;
alter publication supabase_realtime add table common.games;
alter publication supabase_realtime add table common.game_players;

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
-- Helpers for game RPCs
-- ============================================================
-- Per-game RPCs share a few load-bearing patterns: auth + club-
-- membership gating, canonical timer-setup validation, the
-- two-write coordination of "header in common.games + detail in
-- <gametype>.games" at create-game time, and the terminal-
-- transition writes at game-end. Lifting these into common keeps
-- the per-game RPCs focused on game-specific mechanics and ensures
-- the canonical error messages and behavior stay identical across
-- gametypes.
--
-- Each helper is security-definer + granted to authenticated so
-- per-game RPCs (themselves security-definer) can call them. The
-- FE has no reason to invoke them directly.
--
-- Convention: lift when N=3 callers would converge. Today the
-- three callers are tinyspy, psychicnum, wordknit. A future
-- gametype follows the same pattern.

-- ─── common.require_club_member ────────────────────────
-- "Caller must be authenticated AND a member of target_club."
-- Returns the caller's user_id — the calling RPC typically
-- needs it for downstream inserts.
--
-- Raises (both 42501):
--   - 'must be authenticated'      when auth.uid() is null
--   - 'not a member of this club'  when not in common.clubs_members
--
-- security definer so the membership lookup bypasses RLS, the
-- same way is_club_member does.

create function common.require_club_member(target_club uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from common.clubs_members
    where club_id = target_club and user_id = caller_id
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated. SECURITY DEFINER chains (RPCs call
-- this helper) run with the helper-owner's privileges and can
-- call it; direct authenticated calls are blocked, keeping the
-- function out of PostgREST's exposed surface.
revoke execute on function common.require_club_member(uuid) from public;

-- ─── common.validate_timer ─────────────────────────────
-- Validates a jsonb timer object against the canonical shape
-- shared across games:
--
--   { "kind": "none" }
-- | { "kind": "countup" }
-- | { "kind": "countdown", "seconds": <int 1..3600> }
--
-- The argument is the timer *subobject* (typically
-- `setup->'timer'`), not the full setup blob, so games can place
-- timer wherever they want and the helper stays agnostic about
-- the surrounding key.
--
-- Raises (all P0001):
--   - 'setup.timer is required'                          when null
--   - 'setup.timer.kind must be none, countup, or countdown (got X)'
--   - 'setup.timer.seconds is required for countdown'
--   - 'setup.timer.seconds must be 1..3600 (got X)'
--
-- The error-message path uses 'setup.timer.*' because all current
-- games place timer at setup.timer. A future game with a different
-- nesting would either accept the slight message mismatch or write
-- its own validator — the canonical *shape* is the contract here,
-- not the path string in error messages.

create function common.validate_timer(timer_obj jsonb)
returns void
language plpgsql
immutable
as $$
declare
  timer_kind text;
  timer_seconds int;
begin
  if timer_obj is null then
    raise exception 'setup.timer is required' using errcode = 'P0001';
  end if;

  timer_kind := timer_obj->>'kind';
  -- Explicit null check: `NULL not in (...)` returns NULL, not
  -- TRUE, so without this the "missing kind" case would fall
  -- through the next check unraised. Separate "is required" vs
  -- "must be" messages give clearer FE error display.
  if timer_kind is null then
    raise exception 'setup.timer.kind is required' using errcode = 'P0001';
  end if;
  if timer_kind not in ('none', 'countup', 'countdown') then
    raise exception
      'setup.timer.kind must be none, countup, or countdown (got %)',
      timer_kind
      using errcode = 'P0001';
  end if;

  if timer_kind = 'countdown' then
    if (timer_obj->>'seconds') is null then
      raise exception 'setup.timer.seconds is required for countdown'
        using errcode = 'P0001';
    end if;
    timer_seconds := (timer_obj->>'seconds')::int;
    if timer_seconds < 1 or timer_seconds > 3600 then
      raise exception
        'setup.timer.seconds must be 1..3600 (got %)',
        timer_seconds
        using errcode = 'P0001';
    end if;
  end if;
end;
$$;

-- No grant to authenticated; internal helper (see
-- require_club_member's note).
revoke execute on function common.validate_timer(jsonb) from public;

-- ─── common.create_game ────────────────────────────────
-- The common (header) half of starting a new game. Called by
-- every gametype's `<gametype>.create_game` first to get the
-- canonical game id; the gametype then inserts its detail row
-- using that id.
--
-- Responsibilities:
--   - Auth + caller membership in target_club (via
--     require_club_member). The caller must be a club member to
--     start a game in this club; they do NOT have to appear in
--     player_user_ids (the "Ada facilitates a game between Bea
--     and Cade" case is supported).
--   - Validate every uid in player_user_ids is a member of
--     target_club at game-create time. Players are frozen at
--     creation; later membership changes to clubs_members don't
--     affect this game's roster.
--   - Clear any prior active game for this club (UPDATE is_active
--     = false on whichever row currently holds is_active = true).
--     This is the "auto-suspend the previous game" behavior; the
--     prior game stays in common.games for history but loses its
--     active flag.
--   - Insert the new common.games row with is_active = true. The
--     partial unique index on (club_id) where is_active = true
--     guarantees the just-cleared step worked.
--   - Insert one common.game_players row per uid.
--   - Return the new game id.
--
-- Size constraints (exactly-2 for tinyspy, at-least-1 for the
-- open games) live in the gametype's `<gametype>.create_game`,
-- not here — common doesn't know each gametype's rules. This
-- helper just enforces "all listed players are club members."
--
-- Raises:
--   - 42501  'must be authenticated' / 'not a member of this club'
--                                          (via require_club_member)
--   - P0001  'player_user_ids must not be empty'
--   - P0001  'player_user_ids contains non-members: X, Y'

create function common.create_game(
  target_club uuid,
  gametype text,
  player_user_ids uuid[],
  title text,
  setup jsonb
)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  new_id uuid;
  non_members text[];
begin
  -- Caller must be a club member (raises if not auth/not member).
  perform common.require_club_member(target_club);

  if player_user_ids is null
     or array_length(player_user_ids, 1) is null
     or array_length(player_user_ids, 1) = 0 then
    raise exception 'player_user_ids must not be empty'
      using errcode = 'P0001';
  end if;

  -- Identify any listed uid that isn't in clubs_members for this
  -- club. The COALESCE-to-empty-array guard keeps the IF below
  -- behaving when the result is null (no non-members).
  select coalesce(array_agg(uid::text), array[]::text[]) into non_members
  from unnest(player_user_ids) as uid
  where not exists (
    select 1 from common.clubs_members
     where club_id = target_club and user_id = uid
  );

  if array_length(non_members, 1) > 0 then
    raise exception 'player_user_ids contains non-members: %',
      array_to_string(non_members, ', ')
      using errcode = 'P0001';
  end if;

  -- Auto-suspend the prior active game (if any) for this club —
  -- the partial unique index would reject the new is_active=true
  -- row otherwise. The previously-active game stays in
  -- common.games with is_active=false; it's now in the
  -- "suspended" state per the three-state lifecycle (still
  -- non-terminal, just no longer the club's active focus).
  update common.games
     set is_active = false
   where club_id = target_club and is_active = true;

  -- Setup is passed in as-validated (each gametype's create_game
  -- does field-level checks + common.validate_timer before calling
  -- here). We just persist what we're handed.
  insert into common.games (club_id, gametype, title, setup, is_active)
  values (target_club, gametype, title, setup, true)
  returning id into new_id;

  insert into common.game_players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  return new_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.create_game(uuid, text, uuid[], text, jsonb) from public;

-- ─── common.require_game_player ───────────────────────
-- "Caller must be authenticated AND have a game_players row for
-- target_game." Used by mid-game RPCs (submit_guess, submit_clue,
-- etc.) where the question is "is this caller actually playing
-- this specific game" — finer than club membership, since with
-- the per-game player roster a club member who didn't sit down at
-- this game can't take actions in it (but can still watch via
-- the club-wide RLS on common.games).
--
-- Returns the caller's user_id, which mid-game RPCs use for
-- their downstream inserts.
--
-- Raises:
--   - 42501 'must be authenticated'    when auth.uid() is null
--   - 42501 'not playing this game'    when caller isn't in
--                                       common.game_players

create function common.require_game_player(target_game uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from common.game_players
    where game_id = target_game and user_id = caller_id
  ) then
    raise exception 'not playing this game' using errcode = '42501';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.require_game_player(uuid) from public;

-- ─── common.end_game ───────────────────────────────────
-- The terminal-transition counterpart to create_game. Called by
-- each gametype's RPC at the moment its game-specific rule says
-- "this game is over" — 4 mistakes in wordknit, assassin in
-- tinyspy, last guess used in psychic-num, countdown expired,
-- player-confirmed suspend, etc. The helper writes:
--
--   - common.games.ended_at      = now()
--   - common.games.status_summary = status_summary (manifest-shaped)
--   - common.games.is_active     = false (so this game is no
--                                  longer the club's active one;
--                                  the partial unique index allows
--                                  a future game to take the slot)
--   - common.game_players.result for each user in player_results
--
-- player_results is a jsonb object keyed by user_id string:
--
--   { "ada11111-...": {"won": true, "score": 12},
--     "bea22222-...": {"won": false} }
--
-- Each top-level value is the per-player outcome the gametype
-- defines — the helper just persists whatever jsonb it's handed.
--
-- Idempotency: a second call on an already-ended game is a no-op
-- on ended_at (left as the first call's value) and overwrites
-- status_summary + player_results. The current pattern of
-- "termination fires once from one RPC" makes the idempotency
-- detail moot in practice.

create function common.end_game(
  target_game uuid,
  status_summary jsonb,
  player_results jsonb
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  player_key text;
  player_result jsonb;
begin
  update common.games
     set ended_at = coalesce(ended_at, now()),
         status_summary = end_game.status_summary,
         is_active = false
   where id = target_game;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Per-player results — iterate the jsonb object.
  if player_results is not null then
    for player_key, player_result in
      select * from jsonb_each(player_results)
    loop
      update common.game_players
         set result = player_result
       where game_id = target_game and user_id = player_key::uuid;
    end loop;
  end if;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.end_game(uuid, jsonb, jsonb) from public;

-- ============================================================
-- common.create_club RPC
-- ============================================================
--
-- Creates a new club + its full membership + its clubs_gametypes
-- entries in a single transaction. Reject reasons (all P0001
-- unless noted):
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
--
-- clubs_gametypes is populated with every registered gametype; v1
-- lets every new club play every game. Per-club opt-out is
-- deferred (see docs/deferred.md).

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

  insert into common.clubs_members (club_id, user_id)
  select new_id, member_id from unnest(resolved_ids) as member_id;

  -- Populate clubs_gametypes with every registered gametype.
  -- v1 lets every new club play every registered game; per-club
  -- opt-out is deferred (see docs/deferred.md). The FE's
  -- per-club Start-button rendering still applies the player-
  -- count range from each gametype's manifest, so e.g. tinyspy
  -- appears disabled in a 3-member club's button list.
  insert into common.clubs_gametypes (club_id, gametype)
  select new_id, gametype from common.gametypes;

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
  caller_id uuid;
  trimmed text := trim(content);
begin
  -- Auth + membership gate. Raises 42501 on either fail with the
  -- canonical messages — see common.require_club_member.
  caller_id := common.require_club_member(target_club);

  if length(trimmed) = 0 then
    raise exception 'message must not be empty' using errcode = 'P0001';
  end if;

  if length(trimmed) > 1000 then
    raise exception 'message too long (max 1000 chars)' using errcode = 'P0001';
  end if;

  insert into common.messages (club_id, user_id, content)
  values (target_club, caller_id, trimmed);
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
--   3. clubs_gametypes rows for the solo club covering every
--      registered gametype. (The FE still hides Start buttons
--      whose `numberOfPlayers` range excludes solo, but the m2m
--      row is there for the future "your solo club doesn't play
--      tinyspy because solo" tooltip.)
--
-- All inserts happen in the same transaction as the original
-- auth.users insert. If username collides (unique constraint on
-- common.profiles.username), the entire magic-link sign-in fails
-- — per the alpha-software prior, that's accepted; a username
-- picker with collision UX moves into the auth flow when that's
-- redesigned.

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

  insert into common.clubs_members (club_id, user_id)
  values (solo_club_id, new.id);

  insert into common.clubs_gametypes (club_id, gametype)
  select solo_club_id, gametype from common.gametypes;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function common.handle_new_user();
