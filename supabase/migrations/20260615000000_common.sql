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
--   ^[a-z][a-z0-9-]{2,14}$
-- (3–15 chars, leading alpha, lowercase + digits + hyphens). The 15-char
-- ceiling is a MOBILE constraint: a username headlines rosters, chat lines,
-- the players strip and feedback pills, all of which are tight on a phone
-- (docs/mobile.md → handle length).
-- The unique constraint enforces collision rejection — the
-- claim RPC surfaces 23505 to the FE as "that username is
-- taken; pick another."

create table common.profiles (
  -- RESTRICT, not cascade: users are never deleted through the app, so
  -- the only thing that could delete one is a bug or a fat-fingered
  -- psql statement — and cascading from here would take the profile,
  -- every club they created, and every game in those clubs, silently.
  -- This is the top of the deletion firewall (see
  -- tests/common/fk_delete_rules_test.sql, which pins all six edges).
  user_id uuid primary key references auth.users(id) on delete restrict,
  username text unique not null
    check (username ~ '^[a-z][a-z0-9-]{2,14}$'),
  -- Visual identity color, drawn from a fixed 8-name palette.
  -- Stored as a NAME (not a hex) so the FE theme can translate it
  -- per context — the hex for "blue" on a white page-background
  -- can differ from "blue" on a colored tile, and a future dark
  -- theme can map the same name to a different shade entirely
  -- without rewriting every consumer.
  --
  -- Used wherever a user's identity needs to be visually anchored:
  -- the colored circle next to their name in member lists, the
  -- bold name in chat messages, the connections per-peer tile-
  -- selection borders, per-game guess/clue history attribution.
  --
  -- Deterministically derived from the username at claim time
  -- (see common.color_for_username below). Immutable like
  -- username itself in v1; a future "change my color" RPC would
  -- need a narrow UPDATE policy.
  color text not null check (color in (
    'red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink'
  )),
  -- RESERVED (2026-08-03): the user's chosen theme. Deliberately free-form
  -- text with no CHECK and no default — there are no alternate themes yet, no
  -- picker on the profile form, and nothing reads this column. It exists so
  -- that when theming does happen, the column is already here and the shape of
  -- the setting isn't being invented under time pressure.
  --
  -- NULL means "no preference — use the app default", which is what every row
  -- says today. Keep it that way rather than seeding a magic string: a named
  -- default would have to be guessed now and migrated later, and NULL already
  -- reads as unset. Constrain it (a CHECK, or an enum) when the real theme
  -- names exist; free-form is right for a placeholder, not for a shipped
  -- setting.
  --
  -- Adding it is allowed under the standing rule on the SELECT policy below
  -- (a non-public column on this table would mean building
  -- `common.profiles_public` first): a theme preference is not sensitive —
  -- it's the same kind of fact as `color`, which every club member already
  -- reads. Nothing changes about the exposure story.
  --
  -- The write path, when it lands, is an RPC like `update_profile_color`, not
  -- a direct UPDATE — this table has no UPDATE policy on purpose.
  theme text,
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
  -- The display name, bounded at 20 characters (2026-08-03). It headlines the
  -- club page ("Club: <name>", a 1.5rem h1) and every row of the home clubs
  -- list, so an unbounded one is the classic way a long user string breaks the
  -- no-scroll invariant on a phone (docs/mobile.md → the caps).
  --
  -- 20 also keeps the derived HANDLE legal without anyone thinking about it:
  -- `slugify_club_name` truncates at 40, but the handle check above allows at
  -- most 30, so a ~31-40 character name used to fail this table's constraint
  -- with a raw 23514 that the create-club form rendered verbatim. A name that
  -- can't exceed 20 can't slugify past 20.
  --
  -- Solo clubs are unaffected: `claim_username` names them after the username,
  -- which its own check already caps at 15.
  name text not null check (char_length(name) between 1 and 20),
  -- RESTRICT (firewall): deleting a profile must not silently take the
  -- clubs it created — and with them, everyone else's games.
  created_by uuid not null references common.profiles(user_id) on delete restrict,
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
  -- Both RESTRICT (firewall): the creator is always a member, so these
  -- make every real club and every enrolled profile undeletable by a
  -- single statement. A deliberate teardown detaches membership first.
  club_handle text not null references common.clubs(handle) on delete restrict,
  user_id uuid not null references common.profiles(user_id) on delete restrict,
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
-- `min_players` mirrors the lower bound of each manifest's
-- `numberOfPlayers` range (see src/common/lib/games.ts). It's the
-- one fact the SERVER needs from that range: whether a gametype can
-- be played solo (`min_players <= 1`). New-club enrollment uses it
-- to keep one-player-only clubs out of two-player games — see
-- common.default_gametypes_for_club below. Like the gametype string
-- itself, it's a hand-kept mirror of the manifest; drift only
-- affects which Start buttons a solo club is offered, never move
-- legality (each create_game re-checks its own member count).
--
-- ┌─ Convention for new gametypes ──────────────────────────┐
-- │ Each gametype's baseline migration must self-register,  │
-- │ declaring its minimum player count:                     │
-- │                                                         │
-- │   insert into common.gametypes (gametype, min_players)  │
-- │   values ('boggle', 1)                                  │
-- │   on conflict do nothing;                               │
-- │                                                         │
-- │ Every game baseline does this at the bottom of its      │
-- │ file; a sibling coop/compete pair registers one row     │
-- │ each (coop usually min 1, compete min 2).               │
-- └─────────────────────────────────────────────────────────┘

create table common.gametypes (
  gametype text primary key,
  -- Fewest players a game of this gametype needs. Defaults to 1
  -- (solo-playable) so a forgotten value fails open to "offered
  -- everywhere" rather than silently hiding a game.
  min_players smallint not null default 1,
  -- Does this gametype WITHHOLD its solution from a game that ended without a
  -- win? A registry fact, not a per-ending decision: it's a property of the
  -- game (waffle, wordle, stackdown, psychicnum, crosswords, codenamesduet all
  -- have a single answer worth replaying blind), so common.end_game reads it
  -- once and no ending path can forget to pass it — including
  -- common.concede's all-conceded terminal, which no gametype calls directly.
  --
  -- Defaults FALSE = "reveal at any ending", which is both the majority
  -- (the word-find trio, connections, wordiply) and the safe direction for a
  -- forgotten value: a game that shows its answer when it shouldn't is a
  -- visible bug someone reports, while one that hides an answer it has no
  -- reason to hide looks like the feature working.
  hides_solution boolean not null default false,
  -- Does a NEW club get enrolled in this gametype automatically?
  -- Read by common.default_gametypes_for_club (the one enrollment rule);
  -- a club can still opt IN afterward via the club-settings games editor
  -- (common.set_club_gametypes) — false means off-by-default, not banned.
  -- psychicnum registers false: it's the architecture-exercise toy, not a
  -- game a fresh club of friends should find on its Start list. Defaults
  -- TRUE for the same fail-open reason as min_players: a forgotten value
  -- makes a game visible everywhere (a reportable oddity), never silently
  -- missing.
  default_enroll boolean not null default true
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
-- is the disambiguator. Seeded at create_game time by the
-- gametype's own RPC, which also owns the formula; several
-- gametypes then REWRITE it as play reveals something worth
-- naming the game after (scrabble's first words played, wordle's
-- answer at terminal, …), and reset it on replay.
--
-- Two constraints every formula lives under:
--
--   * this column is readable by the whole club, so a title must
--     never carry state a player is meant not to see (a compete
--     opponent's guesses, a hidden solution). Games that have
--     nothing public to say hold the placeholder 'New game'.
--   * a title that can carry HIDDEN state (waffle, wordle — at
--     terminal the title IS the answer) derives it in one
--     `_sync_title` helper called from every transition;
--     recomputing from state everywhere is what keeps a replayed
--     game from still advertising the answer. A title that only
--     mirrors already-public play doesn't need the full shape: it
--     may assign from its move RPC so long as replay resets the
--     placeholder (scrabble's `_title_for`, stackdown coop's
--     `_found_title` — deliberate, not drift). A never-rewritten
--     title (bananagrams' static id) needs nothing at all.
--
-- The per-game formulas are tabulated in
-- docs/game-status-labels.md (kept there, next to the status
-- lines, since the two are read together).

-- `setup jsonb` is the frozen-at-create-time player choices for
-- this game — the payload the start-game dialog produced. Stored
-- on common.games (not on `<gametype>.games`) because (a) every
-- game has one and the shape is canonical here, (b) a single
-- common-side read can surface setup-derived chrome in club
-- listings (e.g. a future Boggle's "5x5" badge from setup.boardSize),
-- and (c) the FE-side `useCommonGame` hook reads timer + paused
-- state from one place. Each gametype's `create_game` does its own
-- field-level validation (e.g. setup.guesses ∈ {3,5,7,9}) AND
-- calls `common.require_valid_timer(setup->'timer')` before passing
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
  -- Both RESTRICT (firewall): a club or gametype with games refuses to
  -- die. Removing a gametype from the roster means deleting its games
  -- FIRST, deliberately (delete_game or an explicit bulk delete) — the
  -- one-statement version once meant "every game of that type in every
  -- club, gone." Below common.games the cascades stay: delete_game
  -- relies on them for its one-statement total teardown.
  club_handle text not null references common.clubs(handle) on delete restrict,
  gametype text not null references common.gametypes(gametype) on delete restrict,
  -- Who started the game (the player who clicked Start). Drives the
  -- "<name> added you to a new <game>" join-invitation popup. Nullable +
  -- ON DELETE SET NULL so a departed creator doesn't cascade the game.
  created_by uuid references common.profiles(user_id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  setup jsonb not null,
  is_current_view boolean not null default false,
  paused boolean not null default false,
  play_state text not null default 'playing',
  is_terminal boolean not null default false,
  -- "May the players see the solution?" — the ONE place that answers it, for
  -- every gametype that has a solution to hide (waffle, wordle, stackdown,
  -- psychicnum, crosswords, codenamesduet) and, deliberately, for the ones
  -- that don't hide it either (the word-find games set it true at their
  -- ending, so "should they see it?" has the same canonical answer everywhere
  -- rather than living in per-game FE logic). False for games with no
  -- solution at all (bananagrams, scrabble) — nothing to reveal.
  --
  -- Set by common.end_game (true on a win, or when the ending auto-reveals)
  -- and by common.reveal_solution (the explicit control); cleared by
  -- common.reset_game, so a replay of the same board starts blind again —
  -- which is the whole reason the flag is common rather than per-game FE
  -- state that each game has to remember to reset.
  --
  -- NOT a shield: the solution itself is withheld by each gametype's
  -- column-grant + `_x_for()` terminal gate. This is the DISPLAY answer, and
  -- it's shared — one player revealing opens it for the group, because a
  -- post-mortem is something the friends do together.
  solution_revealed boolean not null default false,
  status jsonb,
  -- `started_at` is the game-start time; it is NOT the timer source
  -- (the games list now orders by `last_active_at` below). Elapsed game
  -- time lives in common.timers as an additive tick count (see that
  -- table + common.tick_timer), so pauses and "nobody viewing" gaps
  -- simply don't accrue ticks — no wall-clock subtraction, no idle
  -- accumulator.
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Whose turn it is right now, for the opt-in turn-by-turn coop mode
  -- (setup coop_style='turns'). NULL ⇒ free-for-all — the default and the
  -- behaviour of every game that doesn't opt in — so this column is inert
  -- for them. Set at create-time by common._assign_turn_order and rotated
  -- by common._advance_turn; gated on by common._require_turn. Directly
  -- comparable to auth.uid() server-side and session.user.id client-side.
  -- (This is the COMMON turn pointer; scrabble compete keeps its own
  -- scrabble.games.current_seat — the two coexist deliberately.)
  current_turn_user_id uuid references common.profiles(user_id) on delete set null,
  -- "Last activity" — the club games list orders by and dates from this, so
  -- a long-suspended game surfaces by when it was last touched, not when it
  -- started. Maintained by the `games_touch_last_active` BEFORE UPDATE
  -- trigger below, NOT by hand: every write to this row sets it to now().
  -- Driving it from the trigger rather than imperatively in each RPC is the
  -- whole point — a gametype CAN'T forget to bump it (we did forget, in an
  -- early stackdown path). Because every meaningful game event writes this
  -- row — a move (common.update_state), shelving / resuming (the
  -- is_current_view flip), a pause, the terminal write (common.end_game) —
  -- the timestamp lands on "last touched," which is exactly the
  -- shelved/ended/last-played reading the list wants.
  last_active_at timestamptz not null default now()
);

create index common_games_club_handle_last_active_idx
  on common.games (club_handle, last_active_at desc);

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
--
-- `conceded` / `conceded_at` are the per-player DROP-OUT flag: a
-- player who willfully quit a *compete* game mid-race (see
-- common.concede). It's the one bit of per-player terminal state
-- that exists BEFORE common.end_game runs, because it must be
-- visible to peers (the OpponentStrip shows a conceded player as
-- "out") and, crucially, it distinguishes the two "no longer an
-- active player" conditions at game-over: a conceder reads as
-- "Quit at <rank>", everyone else who didn't win reads as "Lost
-- at <rank>" (beaten to the win, or eliminated). Concede ALWAYS
-- means "I quit, the game continues for the others" — it never
-- ends the table (the last active player conceding is the only
-- exception, and that's a collective loss, not a shared decision).

create table common.game_players (
  game_id uuid not null references common.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  result jsonb,
  conceded boolean not null default false,
  conceded_at timestamptz,
  -- The player's 0-based position in the turn rotation, for the opt-in
  -- turn-by-turn coop mode. NULL for free-for-all games (the default).
  -- Assigned at create-time by common._assign_turn_order (seat 0 = the
  -- chosen first player, the rest shuffled). joined_at can't serve as the
  -- order — every row shares the create transaction's now(), so it isn't
  -- deterministic — hence an explicit seat.
  turn_seat int,
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

create index common_messages_club_handle_sent_at_idx
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

-- ============================================================
-- common.game_scratchpads — the per-game notepad (opt-in feature)
-- ============================================================
-- A DB-backed scratchpad a game's players can jot in during play (clue
-- notes, brainstorming). Games opt in via the manifest `scratchpad` field.
--
--   owner_id null  = the SHARED pad (coop): one pad every player edits,
--                    coordinated in the FE by a Realtime-Broadcast takeover
--                    lock (one editor at a time; others read-only + "Take
--                    over").
--   owner_id = user = that player's PRIVATE pad (compete — a shared pad
--                    would leak solving progress between opponents).
--
-- DB-backed so the notes survive pause-unmount and show in the terminal view.
create table common.game_scratchpads (
  id       uuid primary key default gen_random_uuid(),
  game_id  uuid not null references common.games(id) on delete cascade,
  owner_id uuid references common.profiles(user_id) on delete cascade,
  body     text not null default '' check (char_length(body) <= 10000),
  -- Bumped by trigger on UPDATE; the FE reconciles CDC events "newer wins".
  version  bigint not null default 0,
  -- Surrogate PK gives the realtime-published table a replica identity; the
  -- logical key is one pad per (game, owner), null owner = the single shared
  -- pad (NULLS NOT DISTINCT — the same idiom as crosswords.cells).
  constraint game_scratchpads_owner_key unique nulls not distinct (game_id, owner_id)
);

alter table common.game_scratchpads enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Four tables broadcast so the FE can subscribe to:
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
-- clubs is deliberately NOT published — nothing subscribes to it. It was
-- published for a hypothetical club-rename-liveness feature that never
-- shipped; a published-but-unsubscribed table is pure replication overhead.
-- If live club renames land later, re-add it here (and subscribe).
--
-- Profiles is deliberately NOT in the publication — usernames
-- don't change during a session and the realtime traffic isn't
-- worth it. If usernames become mutable later, add it then.
--
-- gametypes / clubs_gametypes also deliberately not published —
-- they only change at club creation (already handled by the
-- ClubPage refetch on navigation) and at gametype registration
-- (a deploy-time event).
--
-- Membership is pinned by tests/common/publication_test.sql.

alter publication supabase_realtime add table common.clubs_members;
alter publication supabase_realtime add table common.messages;
alter publication supabase_realtime add table common.games;
alter publication supabase_realtime add table common.game_players;
alter publication supabase_realtime add table common.game_scratchpads;

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
-- common.words — the master playable-word list
-- ============================================================
-- One row per playable word, shared by every word game (spellingbee
-- today; Boggle, bananagrams board-validation, crosswords later). A
-- single categorized source means each game filters the same table
-- to its own taste instead of vendoring its own word list. Every
-- row is a single lowercase a–z word fit for play — no proper nouns,
-- abbreviations, contractions, hyphenated or multi-word entries.
--
-- The categorization columns are the knobs games filter on:
--   difficulty  — 1..6 recognizability band (1 = everyone knows it,
--                 6 = expert-only); lower = more recognizable. It's
--                 about whether a player would KNOW the word, not how
--                 often it appears in text (igloo/snuck are easy;
--                 ordure is hard). The 6 bands: 1 universal, 2 common,
--                 3 familiar, 4 uncommon, 5 obscure, 6 expert
--                 (SOWPODS-only). A single threshold controls how hard
--                 the playable set is; games pick by player skill.
--                 spellingbee uses two thresholds: required = <= 3 (clean),
--                 legal = <= 5.
--   american/british/canadian/australian — dialect validity. Mostly
--                 a SPELLING filter (colour/color, -ise/-ize); a word
--                 like `lorry` is american=true too. Default play is
--                 `american AND british`.
--   crude       — profanity level: 0 none, 1 mild (`damn`), 2 strong
--                 (`shit`). Smallint so games can tune tolerance.
--   slur        — identity-slur level: 0 none, 1 mild (`fatty`), 2
--                 strong. The "clean" filter most games want is
--                 `crude = 0 AND slur = 0`. Playable words can be any
--                 level (legal), but the clean set is what required /
--                 board / answer words draw from.
--   slang       — chiefly slang (`dude`, `aggro`). Lets a game offer a
--                 "no slang" filter; orthogonal to difficulty (slang
--                 can be band 1 or band 6).
--   wordle      — in the fixed NYT Wordle answer/guess list. A future
--                 Wordle game would pull exactly `WHERE wordle`.
--   len         — char length, stored so per-game length rules
--                 (spellingbee >=4, Boggle >=3, bananagrams >=2) filter
--                 cheaply without a function call.
--   root_word   — lemma of an inflected form (cats -> cat), else
--                 NULL; drives "see also" grouping.
--   definition / definition_source — the click-to-define payload, in
--                 the compact spellingbee symbology (parseDefinition on
--                 the FE). source provenance: s=real scrabble def,
--                 e=auto gloss ("plural of cat"), w=looked up online
--                 (Wiktionary), m=manual; NULL=never looked up.
--                 definition NULL with source NULL is eligible for a
--                 live lookup; source='w' with definition still NULL
--                 is the negative-cache tombstone (looked up, nothing
--                 found — don't refetch). See common.cache_definition.
--   hint        — a guessing-game clue that HIDES the word (the inverse
--                 of definition): a category / near-synonym nudge. Set
--                 for the 5-letter hint set (len=5 AND (wordle OR
--                 difficulty=1)), NULL elsewhere. Drives stackdown's
--                 "Reveal hint".
--
-- letter_mask is a GENERATED column: the 26-bit set of distinct
-- letters in the word (bit 0 = 'a'). It powers the "find every word
-- whose letters fit this puzzle" bitmask query the spellingbee board
-- builder runs (word.letter_mask & ~puzzle_mask = 0). Generated, so
-- it's always correct and the importer never has to compute it.

-- The bit convention here (bit 0 = 'a', ascii('a')=97) must match
-- the TS letterMask() the spellingbee board builder uses to compute
-- puzzle masks, or the subset test would compare incompatible bit
-- layouts. IMMUTABLE so it's usable in the generated column + any
-- expression index.
create function common.word_letter_mask(w text)
returns bigint
language sql
immutable
strict
as $$
  select coalesce(bit_or(1::bigint << (ascii(ch) - 97)), 0::bigint)
    from regexp_split_to_table(w, '') as ch
   where ch between 'a' and 'z';
$$;

create table common.words (
  word              text primary key,        -- lowercase a-z, the playable form
  difficulty        smallint not null
                      check (difficulty between 1 and 6),
  american          boolean not null,
  british           boolean not null,
  canadian          boolean not null,
  australian        boolean not null,
  -- Profanity / identity-slur LEVELS (0 none, 1 mild, 2 strong). Smallint,
  -- not boolean: a game's "clean" filter is `crude = 0 AND slur = 0`, and a
  -- game can be more permissive on mild (e.g. allow crude=1). Column order
  -- matches the import TSV: crude before slur.
  crude             smallint not null default 0 check (crude between 0 and 2),
  slur              smallint not null default 0 check (slur  between 0 and 2),
  slang             boolean not null default false,  -- chiefly slang; "no slang" filter
  wordle            boolean not null default false,  -- in the fixed Wordle word list
  len               smallint not null,
  root_word         text,                     -- lemma of an inflected form, else NULL
  definition        text,                     -- gloss/def in spellingbee symbology, NULL if none yet
  -- NULL allowed (a CHECK passes when its expression is NULL): a
  -- word that's never been looked up has a NULL source.
  definition_source char(1)
                      check (definition_source in ('s', 'e', 'w', 'm')),
  -- Guessing-game clue that HIDES the word (the opposite of definition):
  -- a category/near-synonym nudge ("A hooded snake" → cobra). Present for
  -- every word in the hint set (len = 5 AND (wordle OR difficulty = 1));
  -- NULL elsewhere. Drives stackdown's "Reveal hint". See the upstream
  -- gamelist AI.md → Hints.
  hint              text,
  -- Distinct-letter bitmask, derived from `word`. See above.
  letter_mask       bigint
                      generated always as (common.word_letter_mask(word)) stored
);

-- The two common per-game filters (mirrors the upstream schema): a
-- difficulty threshold and a length floor. The letter_mask board-
-- build index lands with spellingbee's queries in a later migration — it
-- wants a partial index tuned to the spellingbee universe (len, no-'s'),
-- so it's defined where that query lives, not here.
create index common_words_difficulty_idx on common.words (difficulty);
create index common_words_len_idx  on common.words (len);
