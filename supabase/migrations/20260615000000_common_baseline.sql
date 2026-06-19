-- ============================================================
-- common schema — baseline
-- ============================================================
--
-- The forward definition of every `common.*` table, function,
-- index, and policy. Each table created once with its final
-- shape; each function created once with its final body.
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
--                            across all gametypes. Holds club_handle,
--                            gametype, timestamps, view state
--                            (is_current_view, paused), play state
--                            (play_state, is_terminal), and `status`
--                            jsonb for the club-page listing
--                            label. Per-gametype detail (board,
--                            secret, current turn, etc.) lives on
--                            `<gametype>.games`, which shares an id
--                            with this row via FK. See
--                            docs/states.md.
--   - game_players        — who played each game + their per-player
--                            outcome (`result jsonb`, populated at
--                            game-end). Persisted "who played" is a
--                            distinct concept from current club
--                            membership — game_players is frozen
--                            at game-create time, while clubs_members
--                            is the durable membership of the room.
--   - clubs_gametypes     — m2m saying "this club may play this
--                            gametype." Populated for every new
--                            club by claim_username / create_club.
--   - messages            — per-club chat. Single thread per club,
--                            persists across gametype switches.
--
-- Naming note: m2m tables are pluralized on both sides
-- (`clubs_members`, `clubs_gametypes`) so they read as m:m at a
-- glance rather than as 1:m. See docs/naming.md.
--
-- What `common` MUST NOT do: reference any game schema. The
-- removability invariant (delete a game in three actions — folder,
-- registry line, schema) depends on common staying gametype-blind.
-- The link goes the other way: each game schema references
-- common.clubs(handle) for `club_handle` and self-registers via
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
-- Created by the user themselves on first sign-in, via the
-- common.claim_username RPC. The auth.users row arrives first
-- (magic-link verifies); the FE then routes the signed-in but
-- not-yet-claimed user to a "pick a handle" screen. Until they
-- claim, no profile row exists for them and no other app
-- surface is reachable.
--
-- `username` is the public identity (URLs, rosters, chat) AND
-- the user's chosen handle. IMMUTABLE by policy — no UPDATE on
-- common.profiles in v1, matching the immutable-club-handle
-- decision (rationale in plan docs). If a user really wants a
-- new handle, the friends-only escape hatch is "delete the
-- account and resignup."
--
-- The CHECK on username enforces the canonical regex:
--   ^[a-z][a-z0-9-]{2,29}$
-- (3–30 chars, leading alpha, lowercase + digits + hyphens).
-- The unique constraint enforces collision rejection — the
-- claim RPC surfaces 23505 to the FE as "that username is
-- taken; pick another."

create table common.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null
    check (username ~ '^[a-z][a-z0-9-]{2,29}$'),
  -- Visual identity color, drawn from a fixed 8-name palette.
  -- Stored as a NAME (not a hex) so the FE theme can translate it
  -- per context — the hex for "blue" on a white page-background
  -- can differ from "blue" on a colored tile, and a future dark
  -- theme can map the same name to a different shade entirely
  -- without rewriting every consumer.
  --
  -- Used wherever a user's identity needs to be visually anchored:
  -- the colored circle next to their name in member lists, the
  -- bold name in chat messages, the wordknit per-peer tile-
  -- selection borders, per-game guess/clue history attribution.
  --
  -- Deterministically derived from the username at claim time
  -- (see common.color_for_username below). Immutable like
  -- username itself in v1; a future "change my color" RPC would
  -- need a narrow UPDATE policy.
  color text not null check (color in (
    'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'
  )),
  created_at timestamptz not null default now()
);

-- ============================================================
-- common.clubs — fixed-membership rooms
-- ============================================================
--
-- handle IS the primary key — the URL-safe slug used in
-- `/c/<handle>` routes AND the FK target from every per-game
-- club_handle column. There's no separate uuid id; handle is
-- the only identifier for a club. IMMUTABLE by policy (no
-- UPDATE clause anywhere); if a friend wants a different
-- handle they delete-and-recreate.
--
-- Two-form handle space:
--   - User clubs use slugify(name): no '=' prefix possible
--     (slugify strips it).
--   - Solo clubs use literal '=<username>' (claim_username
--     writes this; users cannot create '=…' handles via the UI).
-- Both are valid under the CHECK regex, which allows an optional
-- leading '='. Solo clubs live in a slug-space user input
-- cannot reach.
--
-- name is the human-readable form (as typed by the creator).
-- A second club whose slugified name would collide raises
-- 23505 from the unique constraint inside the handle PK —
-- create_club lets that propagate; the FE renders an inline
-- "that name is taken" error.

create table common.clubs (
  handle text primary key
    check (handle ~ '^=?[a-z][a-z0-9-]{2,29}$'),
  name text not null,
  created_by uuid not null references common.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================
-- common.clubs_members — m2m
-- ============================================================
--
-- PK on (club_handle, user_id) so a user can't be listed twice
-- in the same club. Membership is fixed at creation in v1 (no
-- add/remove RPCs); the table exists in this normalized form
-- because (a) it's the right shape and (b) future member-listing
-- UI wants the relational structure.

create table common.clubs_members (
  club_handle text not null references common.clubs(handle) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_handle, user_id)
);

-- ============================================================
-- common.gametypes — the registered-gametype list
-- ============================================================
-- Authoritative SQL-side list of gametypes. Used by the
-- m2m-population RPCs below so each only needs one query
-- ("INSERT INTO clubs_gametypes SELECT new_club_handle, gametype
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
-- query against common.games is all ClubPage needs; each
-- manifest's `labelFor(row)` renders the per-row status label
-- from this row's `status` jsonb. Per-gametype detail stays
-- lazy-loaded (matches the FE's chunk-per-game pattern).
--
-- `status jsonb` is the gametype's structured "where is this
-- game now" snapshot — kept current by every state-transition
-- RPC (the duplicate-write discipline; see docs/states.md). The
-- manifest is the only thing that knows how to render it (typed
-- by the gametype, not by common).
--
-- ended_at is null while non-terminal and set at terminal
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
--                (the target IS leaked — psychicnum is a toy
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
-- View-state vs play-state vocabulary (see docs/states.md):
--
--   View states (where this game sits in the club's "what are we
--   looking at right now" picture):
--     - is_current_view — true iff at least one member is viewing
--                          the GamePage. At most one current
--                          game per club, enforced by the partial
--                          unique index below.
--     - paused          — true iff presence-pause OR manual-pause
--                          is in effect. Only meaningful when
--                          is_current_view = true; defaults false
--                          for non-current games.
--
--   Play states (the game's rules-side situation, totally
--   independent of view state):
--     - play_state  — text; the gametype's enum value (e.g.
--                      'playing', 'won', 'lost_timeout'). Every
--                      gametype uses 'playing' for its standard
--                      mid-game value — see docs/states.md for
--                      the no-'active'-as-play_state rule.
--                      No CHECK constraint here — common stays
--                      gametype-blind. The per-gametype RPCs
--                      are the gate.
--     - is_terminal — boolean; materialized derivation. Each
--                      gametype's RPC writes it in the same
--                      transaction as play_state. Avoids
--                      callers having to interpret per-gametype
--                      terminal-sets.
--     - status      — jsonb; gametype-specific data for the
--                      club-page listing label (rendered by
--                      `manifest.labelFor`). Kept current on
--                      every state-transition RPC via the
--                      duplicate-write discipline: each gametype
--                      RPC writes its foo.games row AND the
--                      common.games status in one transaction.
create table common.games (
  id uuid primary key default gen_random_uuid(),
  club_handle text not null references common.clubs(handle) on delete cascade,
  gametype text not null references common.gametypes(gametype) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  setup jsonb not null,
  is_current_view boolean not null default false,
  paused boolean not null default false,
  play_state text not null default 'playing',
  is_terminal boolean not null default false,
  status jsonb,
  -- `started_at` anchors the games list ordering; it is NOT the
  -- timer source. Elapsed game time lives in common.timers as an
  -- additive tick count (see that table + common.tick_timer), so
  -- pauses and "nobody viewing" gaps simply don't accrue ticks —
  -- no wall-clock subtraction, no idle accumulator.
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index common_games_club_handle_started_at_idx
  on common.games (club_handle, started_at desc);

-- "At most one current-view game per club, across all gametypes"
-- — the same invariant the old `is_active` partial index
-- enforced. The "clear prior current" step in common.create_game
-- handles the transition.
create unique index common_games_one_current_view_per_club
  on common.games (club_handle)
  where is_current_view = true;

-- ============================================================
-- common.timers — the additive game clock
-- ============================================================
-- One row per game. `ticks` is the number of whole seconds of
-- ACTIVE play (someone viewing, not paused) that have elapsed.
-- The FE timer derives display from it: countdown shows
-- max(0, duration - ticks), countup shows ticks.
--
-- Why additive (vs. wall-clock-minus-gaps): every active player's
-- browser calls common.tick_timer once a second; that advances
-- `ticks` by at most 1 per real second (see the conditional
-- there). When the game is paused, or nobody is viewing it, NOBODY
-- calls tick_timer — so the clock simply stops. Pauses and idle
-- gaps need no tracking at all; they're just seconds with no tick.
-- This replaces the old idle_since/total_idle_seconds accumulator
-- + the FE's pause-duration bookkeeping with one counter.
--
-- Kept in its own table (not a column on common.games) so the
-- once-per-second tick UPDATE doesn't churn the games row — that
-- row drives the club-page + game realtime subscriptions, which we
-- do NOT want firing every second.
create table common.timers (
  game_id   uuid primary key references common.games(id) on delete cascade,
  ticks     int not null default 0,
  last_tick timestamptz not null default now()
);

-- Read-only to members (the FE seeds its initial display from
-- `ticks`); writes go exclusively through common.tick_timer. RLS
-- (members-of-the-game's-club) is enabled in the policy section
-- below, alongside the other tables — it gates on is_club_member,
-- which isn't defined yet here.
grant select on common.timers to authenticated;

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
-- PK is (club_handle, gametype) so each pair is recorded at most
-- once. `gametype` FKs to common.gametypes for referential
-- integrity (an unregistered gametype can't be inserted).
--
-- v1 only writes from the security-definer RPCs below
-- (claim_username for solo clubs, create_club for friend clubs).
-- A future "club admin UI" would add an RPC for member-driven
-- enable/disable. No INSERT/UPDATE/DELETE policies on the table
-- itself.

create table common.clubs_gametypes (
  club_handle    text not null references common.clubs(handle) on delete cascade,
  gametype       text not null references common.gametypes(gametype) on delete cascade,
  added_at       timestamptz not null default now(),
  -- Saved setup form-defaults for the (club, gametype) pair.
  -- Auto-write-back: every successful create_game for this club +
  -- gametype overwrites this with the setup it just used (minus
  -- per-gametype private fields — see each gametype's
  -- create_game for what's excluded). The setup dialog reads this
  -- on open and merges it under the manifest's static defaults so
  -- the form remembers what the friends played last time. NULL
  -- on a fresh row; the FE merge with manifest defaults handles
  -- that case cleanly. Shape is gametype-specific; no constraint.
  -- See docs/code-conventions.md → "Setup defaults" for the
  -- evolution-strategy story; until that's formalized, don't
  -- reshape setup fields without thinking about saved blobs in
  -- flight in production.
  default_setup  jsonb,
  primary key (club_handle, gametype)
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
  club_handle text not null references common.clubs(handle) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  content text not null check (length(trim(content)) > 0 and length(content) <= 1000),
  sent_at timestamptz not null default now()
);

create index messages_club_handle_sent_at_idx
  on common.messages (club_handle, sent_at);

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
alter table common.timers           enable row level security;

create function common.is_club_member(target_club text)
returns boolean
language sql
security definer
set search_path = common, public, extensions
stable
as $$
  select exists (
    select 1 from common.clubs_members
    where club_handle = target_club and user_id = auth.uid()
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

-- Timers: readable by members of the game's club (the FE seeds its
-- initial timer display from `ticks`). Writes go through
-- common.tick_timer only — no INSERT/UPDATE policy.
create policy timers_select on common.timers
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = timers.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No UPDATE policy on profiles. username and color are both
-- immutable in v1 — the only way to alter either is to
-- delete-and-recreate. A future "change my color" surface would
-- add a narrow column-scoped policy here.

create policy clubs_select on common.clubs
  for select to authenticated
  using (common.is_club_member(handle));

create policy clubs_members_select on common.clubs_members
  for select to authenticated
  using (common.is_club_member(club_handle));

create policy messages_select on common.messages
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Permissive read on gametypes — gametype identifiers are not
-- sensitive, and the FE needs to discover them anyway (the
-- registry table mirrors what src/games.ts declares on the FE
-- side).
create policy gametypes_select on common.gametypes
  for select to authenticated using (true);

create policy clubs_gametypes_select on common.clubs_gametypes
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Game records are club-wide: any club member can see every game
-- ever played in the club, regardless of whether they were one of
-- the players themselves. "History belongs to the club." Same
-- model as messages — chat threads span game playings and aren't
-- per-game-private.
create policy games_select on common.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Game-player records inherit visibility from their parent game.
-- The EXISTS subquery mirrors the per-gametype `*_select` policy
-- shape (psychicnum.guesses, wordknit.guesses, etc.).
create policy game_players_select on common.game_players
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = game_players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No insert/update/delete policies on any of these tables. Writes
-- go through the security-definer RPCs defined below (create_club,
-- send_message, the create_game/end_game game-lifecycle helpers
-- called from each gametype's RPCs).

grant select on common.profiles                to authenticated;
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
--   - games              new games appear; status, play_state,
--                        is_terminal, ended_at, is_current_view
--                        flips drive list updates AND the
--                        "every member follows the current-view
--                        game" auto-nav
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

-- Replica identity FULL on common.games so DELETE events carry
-- the full pre-deletion row. ClubPage's postgres_changes
-- subscription filters on `club_handle=eq.<X>`; under the default
-- replica identity (PK only) the OLD payload on a DELETE event
-- has just the id, the filter fails to match, and the subscriber
-- never sees the event. INSERT/UPDATE are unaffected — their NEW
-- payload always carries every column. The extra realtime
-- bandwidth on UPDATE/DELETE is small at our scale; this is the
-- cheaper fix vs. dropping the club_handle filter and accepting
-- noise from every game change in the database.
--
-- Other tables here keep the default replica identity because
-- their FE subscriptions filter on PK (per-game `useGame` hooks
-- subscribe with `id=eq.<gameId>`, which the default identity
-- carries) or because rows in those tables are never deleted
-- by the FE today (messages, game_players via cascade only).
alter table common.games replica identity full;

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
-- common.color_for_username — deterministic palette pick
-- ============================================================
--
-- Maps a username to one of the 8 profile palette names by
-- hashing the string and indexing into the palette array.
-- Deterministic: the same username always yields the same color,
-- so the choice is stable across signup, db:reset, and test
-- fixtures.
--
-- The palette array MUST stay in sync with the check constraint
-- on common.profiles.color — if a new name is added, update
-- both AND consider what should happen to existing rows whose
-- old hash now maps differently. (Today's friends-only scale
-- makes "wipe and rebuild" the answer; if production data ever
-- exists, this becomes a real migration concern.)
--
-- `abs(hashtext(...))` keeps the modulo positive without
-- bringing in a CASE or COALESCE — hashtext can return negative
-- integers. The +1 shifts from PostgreSQL's 1-based array
-- indexing.
--
-- Marked `immutable` so it composes cleanly into INSERT
-- expressions (used by claim_username below).

create function common.color_for_username(username text)
returns text
language sql
immutable
as $$
  select (array[
    'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'
  ])[(abs(hashtext(username)) % 8) + 1];
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

create function common.require_club_member(target_club text)
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
    where club_handle = target_club and user_id = caller_id
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
revoke execute on function common.require_club_member(text) from public;

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
--   - Vacate any prior current-view game for this club (UPDATE
--     is_current_view = false on whichever row currently holds
--     it). This is the "auto-suspend the previous game" behavior;
--     the prior game stays in common.games but loses its
--     current-view flag.
--   - Insert the new common.games row with is_current_view = true.
--     The partial unique index on (club_handle) where is_current_view
--     = true guarantees the just-cleared step worked.
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
  target_club text,
  gametype text,
  player_user_ids uuid[],
  title text,
  setup jsonb,
  -- The savable subset of `setup` for the saved-defaults feature
  -- (see common.clubs_gametypes.default_setup). Each gametype's
  -- create_game decides what to pass: most pass `setup` verbatim;
  -- tinyspy strips its `firstClueGiverUserId` (per-game decision,
  -- not a per-club preference). Pass NULL to opt out of auto-save
  -- entirely for this call.
  saved_default jsonb
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
     where club_handle = target_club and user_id = uid
  );

  if array_length(non_members, 1) > 0 then
    raise exception 'player_user_ids contains non-members: %',
      array_to_string(non_members, ', ')
      using errcode = 'P0001';
  end if;

  -- Vacate the prior current-view game (if any) for this club —
  -- the partial unique index would reject the new
  -- is_current_view=true row otherwise. The previously-current
  -- game stays in common.games with is_current_view=false;
  -- it's now a suspended game (non-current, non-terminal). Pure
  -- pointer flip — no timer bookkeeping (see common.timers).
  update common.games
     set is_current_view = false
   where club_handle = target_club and is_current_view = true;

  -- Setup is passed in as-validated (each gametype's create_game
  -- does field-level checks + common.validate_timer before calling
  -- here). We just persist what we're handed. play_state defaults
  -- to 'playing'; is_terminal defaults to false. (The `gametype`
  -- on the right of VALUES resolves to the function parameter,
  -- not the column on the left — PostgreSQL knows column-list
  -- positions from value-list positions.)
  insert into common.games (club_handle, gametype, title, setup, is_current_view)
  values (target_club, gametype, title, setup, true)
  returning id into new_id;

  -- Seed the additive game clock at zero. last_tick = now() so the
  -- first tick_timer call doesn't immediately jump (it needs a full
  -- real second to elapse before the first +1).
  insert into common.timers (game_id) values (new_id);

  insert into common.game_players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  -- Auto-save the saved subset to the (club, gametype) row in
  -- clubs_gametypes so the next setup dialog can pre-fill it.
  -- NULL opts this call out of saving (a gametype that doesn't
  -- want a saved-defaults UX passes NULL). On every successful
  -- create_game, the row's default_setup overwrites — there's
  -- no "save as default" gesture; the click on Start is the save.
  --
  -- The `create_game.gametype` qualifier (function-name, NOT
  -- schema.function-name) disambiguates the parameter from the
  -- column on the left of `=` in the WHERE clause — both are
  -- valid identifiers in scope here. Without it, PL/pgSQL would
  -- match the column.
  if saved_default is not null then
    update common.clubs_gametypes
       set default_setup = saved_default
     where club_handle = target_club
       and clubs_gametypes.gametype = create_game.gametype;
  end if;

  return new_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.create_game(text, text, uuid[], text, jsonb, jsonb) from public;

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

-- ─── common.update_state ───────────────────────────────
-- The mid-game state-write helper. Per-gametype RPCs call this
-- after any state transition that's NOT a game-end — wordknit's
-- mistake-count bump, tinyspy's sudden-death entry, psychicnum's
-- guesses_remaining decrement, etc. Updates `play_state` (the
-- gametype's enum value) + `status` (the listing-label jsonb) +
-- `is_terminal` (always false here by definition; the column
-- exists so the same write-pattern works for both mid-game and
-- end-game).
--
-- This is half of the "duplicate-write discipline": each
-- per-gametype RPC that mutates state writes BOTH its own
-- foo.games row (mistake_count, key_card, etc.) AND calls this
-- helper to mirror the listing-visible bits into common.games.
-- Same transaction; readers see a coherent snapshot.
--
-- Why play_state lives on common.games (not on the per-gametype
-- foo.games row): the club-page listing needs to query play_state
-- without joining to per-gametype tables. See docs/states.md →
-- "Where the two tables sit."

create function common.update_state(
  target_game uuid,
  play_state text,
  status jsonb
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  update common.games
     set play_state = update_state.play_state,
         status = update_state.status,
         is_terminal = false
   where id = target_game;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.update_state(uuid, text, jsonb) from public;

-- ─── common.end_game ───────────────────────────────────
-- The terminal-transition counterpart to create_game + the
-- end-game half of the duplicate-write discipline. Called by
-- each gametype's RPC at the moment its game-specific rule says
-- "this game is over" — 4 mistakes in wordknit, assassin in
-- tinyspy, last guess used in psychicnum, countdown expired,
-- etc. Writes:
--
--   - common.games.ended_at        = now()
--   - common.games.play_state      = play_state (the terminal
--                                     value: 'won', 'lost_timeout',
--                                     etc. — gametype-specific)
--   - common.games.is_terminal     = true
--   - common.games.status          = status (manifest-shaped jsonb
--                                     for the listing label)
--   - common.game_players.result for each user in player_results
--
-- Note: is_current_view is NOT cleared here. A finished game can
-- still have viewers reviewing it (the "we lost — let's look at
-- the unmatched bands" experience); the view-state lifecycle is
-- separate from terminal transition. is_current_view clears when
-- the last viewer actually leaves the page.
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
-- status / play_state / player_results. The current pattern of
-- "termination fires once from one RPC" makes the idempotency
-- detail moot in practice.

create function common.end_game(
  target_game uuid,
  play_state text,
  status jsonb,
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
         play_state = end_game.play_state,
         is_terminal = true,
         status = end_game.status
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
revoke execute on function common.end_game(uuid, text, jsonb, jsonb) from public;

-- ─── common.set_current_view ───────────────────────────────
-- Fired from the FE when the first viewer mounts a game's
-- GamePage. Sets common.games.is_current_view=true on this game
-- and clears it on any other game in the same club (the partial
-- unique index `(club_handle) where is_current_view=true` would
-- otherwise reject the new true).
--
-- Idempotent: re-mounting the already-current game writes the
-- same row's value back to true (still satisfies the index).
-- Concurrent mounts of two different games in the same club
-- serialize via the index — last writer wins, the loser's FE
-- realtime auto-nav pulls them into the winner's game.
--
-- Auth: caller must be a member of the game's club. We use
-- require_club_member rather than require_game_player so a
-- non-player club member can still view (and become the
-- current viewer of) a game they weren't seated in. Today's
-- seating model puts every club member in game_players for
-- every game, but the looser gate is the future-correct one.
--
-- Companion to unset_current_view (called when the last viewer
-- leaves). See docs/states.md → "Lifecycle: when
-- is_current_view flips" for the full story.

create function common.set_current_view(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_club_member(target_club);

  -- Vacate any other current-view game for this club. Done first
  -- so the partial unique index doesn't reject the target's write.
  -- The `id <> target_game` clause keeps this a no-op when the
  -- target is already current.
  update common.games
     set is_current_view = false
   where club_handle = target_club
     and is_current_view = true
     and id <> target_game;

  -- Set the target current. Pure pointer flip — no timer work: the
  -- clock is the additive tick count in common.timers, which simply
  -- doesn't advance while nobody's viewing, so there's no idle
  -- window to fold here.
  update common.games
     set is_current_view = true
   where id = target_game
     and is_current_view = false;
end;
$$;

revoke execute on function common.set_current_view(uuid) from public;
grant execute on function common.set_current_view(uuid) to authenticated;

-- ─── common.unset_current_view ─────────────────────────────
-- Fired from the FE when the last viewer's tab is leaving a
-- GamePage (presence-sync sees only-me + I'm unmounting). Clears
-- is_current_view on the target game. Idempotent via the
-- `where is_current_view=true` guard: a second concurrent call
-- from another tab is a silent no-op.
--
-- Auth: same club_member gate as set_current_view — symmetry
-- matters and "you can flip your club's current pointer if
-- you're a member" is the right granularity.

create function common.unset_current_view(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_club_member(target_club);

  -- Pure pointer flip. No timer work — the tick clock in
  -- common.timers stops advancing on its own once no one's viewing
  -- (nobody calls tick_timer), so there's no idle gap to stamp.
  update common.games
     set is_current_view = false
   where id = target_game
     and is_current_view = true;
end;
$$;

revoke execute on function common.unset_current_view(uuid) from public;
grant execute on function common.unset_current_view(uuid) to authenticated;

-- ─── common.tick_timer ─────────────────────────────────────
-- The game clock's one writer. Every actively-playing client calls
-- this once a second; it advances common.timers.ticks by AT MOST 1
-- per real second and returns the current count.
--
-- The conditional (`now() - last_tick >= 1 second`) does all the
-- work:
--   - **Dedup across players.** Three clients calling within the
--     same second: only the first passes the WHERE and advances;
--     the other two no-op and just read the value back. So the
--     clock runs at ~1 tick/sec no matter how many are driving it —
--     no leader election needed.
--   - **Pause / idle are free.** When the game is paused, or nobody
--     is viewing it, no client calls this, so last_tick stays put.
--     The first call on resume adds +1 (it's `ticks + 1`, never
--     `ticks + gap`), so a five-minute pause costs one second, not
--     five minutes. No gap tracking anywhere.
--   - **Server clock is authority.** The `now()` is the database's,
--     so a client's wall-clock skew or setInterval drift can't move
--     the count — it only triggers the attempt.
--
-- Returns the current ticks either way, so the same call the FE
-- uses to advance the clock also reads it back.
create function common.tick_timer(target_game uuid)
returns int
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  current_ticks int;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  perform common.require_club_member(target_club);

  update common.timers
     set ticks = ticks + 1,
         last_tick = now()
   where game_id = target_game
     and now() - last_tick >= interval '1 second'
  returning ticks into current_ticks;

  -- WHERE didn't match (already ticked this second) — read current.
  if current_ticks is null then
    select ticks into current_ticks
      from common.timers where game_id = target_game;
  end if;

  return coalesce(current_ticks, 0);
end;
$$;

revoke execute on function common.tick_timer(uuid) from public;
grant execute on function common.tick_timer(uuid) to authenticated;

-- ─── common.delete_game ────────────────────────────────────
-- Permanently remove a game and everything that belongs to it.
-- Called from the FE when a club member clicks the delete
-- affordance on a game card.
--
-- Authorization: any member of the owning club can delete any
-- of the club's games. Friends-only trust model — we don't
-- attribute "who created the game" or restrict to that user
-- (no owner column today, and the social ask is "the friends
-- agreed to delete this," not "only the starter can").
--
-- Cascade: the FK chain handles cleanup:
--   - common.game_players      (game_id FK, ON DELETE CASCADE)
--   - <gametype>.games         (id FK,      ON DELETE CASCADE)
--     ⤷ which cascades to per-gametype child tables
--        (tinyspy.words/clues, psychicnum.guesses, wordknit.guesses)
-- So one DELETE on common.games removes the whole subtree.
--
-- This RPC does NOT handle "tell peers viewing the game to
-- leave first." For a current-view game, the FE caller is
-- expected to broadcast a `suspend` event on the
-- `game:<uuid>` channel first so peers navigate to the club
-- page BEFORE the row vanishes — same broadcast already used
-- by the suspend-confirm dialog, so peers don't need a new
-- handler. Non-current games have no viewers by definition;
-- the FE skips the broadcast in that case.
--
-- Raises:
--   - 42501  via require_club_member (not authenticated, not
--            a member)
--   - P0002  'game not found' when target_game is unknown
--            (matches end_game / unset_current_view's
--            vocabulary for the same case)

create function common.delete_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_club_member(target_club);

  delete from common.games where id = target_game;
end;
$$;

revoke execute on function common.delete_game(uuid) from public;
grant execute on function common.delete_game(uuid) to authenticated;

-- ============================================================
-- common.create_club RPC
-- ============================================================
--
-- Creates a new club + its full membership + its clubs_gametypes
-- entries in a single transaction. Returns the new club's handle
-- (the URL slug AND the PK).
--
-- Reject reasons (all P0001 unless noted):
--
--   - not authenticated (42501)
--   - club name slugifies to an empty handle ("!!!" etc.)
--   - club name slugifies to a handle that doesn't start with
--     a letter ("123 club" → "123-club", which the handle CHECK
--     would reject anyway; we surface a friendlier P0001 instead
--     of a constraint violation)
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
returns text
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  new_handle text;
  resolved_ids uuid[];
  unknown_names text[];
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
  -- The handle CHECK regex requires a leading letter. Surface a
  -- clean P0001 instead of letting the constraint raise 23514,
  -- so the FE's inline error reads as a name problem ("add a
  -- letter") rather than a database error.
  if new_handle !~ '^[a-z]' then
    raise exception 'club name must start with a letter'
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

  -- The PK on clubs.handle does collision enforcement; we let
  -- the exception propagate so the caller gets SQLSTATE 23505
  -- (unique_violation), surfaced by the FE as "that name is taken."
  insert into common.clubs (handle, name, created_by)
  values (new_handle, club_name, caller_id);

  insert into common.clubs_members (club_handle, user_id)
  select new_handle, member_id from unnest(resolved_ids) as member_id;

  -- Populate clubs_gametypes with every registered gametype.
  -- v1 lets every new club play every registered game; per-club
  -- opt-out is deferred (see docs/deferred.md). The FE's
  -- per-club Start-button rendering still applies the player-
  -- count range from each gametype's manifest, so e.g. tinyspy
  -- appears disabled in a 3-member club's button list.
  insert into common.clubs_gametypes (club_handle, gametype)
  select new_handle, gametype from common.gametypes;

  return new_handle;
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

create function common.send_message(target_club text, content text)
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

  insert into common.messages (club_handle, user_id, content)
  values (target_club, caller_id, trimmed);
end;
$$;

revoke execute on function common.send_message(text, text) from public;
grant execute on function common.send_message(text, text) to authenticated;

-- ============================================================
-- common.claim_username RPC
-- ============================================================
--
-- Materializes per-user state on demand: the user signs in via
-- magic-link, the FE detects they have no profile row, and
-- routes them to a "pick a handle" screen. That screen calls
-- this RPC with their chosen username. The RPC atomically:
--
--   1. Inserts the profile row (user_id := auth.uid(), the
--      chosen username, color derived deterministically).
--   2. Creates a solo club with handle '=<username>',
--      single-membered. The '=' prefix puts solo clubs in a
--      slug-space user-typed names cannot reach (slugify_club_name
--      strips '='), so there's no risk of collision with
--      friend-club handles.
--   3. clubs_gametypes rows for the solo club covering every
--      registered gametype. (The FE still hides Start buttons
--      whose `numberOfPlayers` range excludes solo, but the m2m
--      row is there for the future "your solo club doesn't play
--      tinyspy because solo" tooltip.)
--
-- Returns the claimed username on success.
--
-- Reject reasons:
--   - 42501  not authenticated (no auth.uid())
--   - P0001  username format invalid (doesn't match the regex)
--   - 23505  username taken (profile insert collision) OR
--            solo-club handle taken (impossible if profile
--            insert succeeded — same uniqueness scope)
--   - 23503  auth.users row gone (the FK from profiles.user_id;
--            edge case from a stale JWT after a db:reset)
--   - P0001  profile already claimed (the user_id PK rejects a
--            second claim; surfaced as a clean message instead
--            of letting 23505 propagate)
--
-- The CHECK on profiles.username would catch a bad regex too,
-- but the explicit P0001 reads cleaner in error display. Belt-
-- and-braces.

create function common.claim_username(desired text)
returns text
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

  -- Clean P0001 if the requested handle doesn't match the regex.
  -- (The profiles CHECK would raise 23514 from the same input;
  -- this just gives the FE a friendlier error string.)
  if desired !~ '^[a-z][a-z0-9-]{2,29}$' then
    raise exception 'username must be 3–30 chars, lowercase letters/digits/hyphens, starting with a letter'
      using errcode = 'P0001';
  end if;

  -- Block double-claim explicitly — without this, the same user
  -- re-calling would raise 23505 from the user_id PK and the FE
  -- couldn't distinguish "this user already claimed" from "this
  -- username is taken by someone else."
  if exists (select 1 from common.profiles where user_id = caller_id) then
    raise exception 'profile already claimed' using errcode = 'P0001';
  end if;

  -- Color is derived from the username deterministically so the
  -- choice is stable across db:reset and predictable in tests.
  insert into common.profiles (user_id, username, color)
  values (caller_id, desired, common.color_for_username(desired));

  insert into common.clubs (handle, name, created_by)
  values ('=' || desired, desired, caller_id);

  insert into common.clubs_members (club_handle, user_id)
  values ('=' || desired, caller_id);

  insert into common.clubs_gametypes (club_handle, gametype)
  select '=' || desired, gametype from common.gametypes;

  return desired;
end;
$$;

revoke execute on function common.claim_username(text) from public;
grant execute on function common.claim_username(text) to authenticated;
