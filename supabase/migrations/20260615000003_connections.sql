-- ============================================================
-- connections — Connections-style word-grouping puzzle
-- ============================================================
--
-- A 4×4 board of 16 tiles split into 4 hidden categories of 4.
-- Players select 4 tiles, submit, and try to identify a category.
-- Correct guesses reveal the category as a colored band;
-- wrong/oneAway guesses cost a mistake. 4 mistakes lose; matching
-- all 4 categories wins.
--
-- "connections" is the codename for the gametype (analogous to how
-- "codenamesduet" is the codename for Codenames Duet). The user-facing
-- copy can use whatever phrasing reads best; SQL / TypeScript /
-- folder names are all `connections`.
--
-- connections ships as a coop/compete PAIR via the sibling-manifest
-- pattern (mirroring psychicnum): one schema, one folder, two
-- `common.gametypes` rows ('connections_coop' / 'connections_compete'),
-- one create_game RPC routing on `mode`.
--
-- ┌─ Compete rules (delta from coop) ───────────────────────┐
-- │ - Per-player mistake_count instead of game-level shared.│
-- │ - Per-player matched_categories — each player must      │
-- │   solve all 4 themselves; "I matched it" doesn't help   │
-- │   anyone else.                                          │
-- │ - First player to all-4 wins; everyone else loses       │
-- │   immediately. (psychicnum-style race-end.)             │
-- │ - 4 mistakes eliminates that player but the game        │
-- │   continues. All-eliminated → lost_compete.             │
-- │ - Timer expiry → lost_compete, everyone loses.          │
-- │ - Opponents see each other's mistake_count (so the      │
-- │   race has tension), NOT each other's guesses or        │
-- │   matched-rank list. RLS enforces.                      │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ The "FE-knows-the-answer" design decision ────────────┐
-- │ Unlike codenamesduet and psychicnum — where the server      │
-- │ holds a secret and validates moves against it — the    │
-- │ connections board (categories + tile order) is publicly   │
-- │ readable. The FE has the answer key and evaluates      │
-- │ guesses locally. The submit_guess RPC trusts the FE's  │
-- │ verdict (correct / oneAway / wrong + the matched       │
-- │ category's rank) and just records it, applying         │
-- │ atomicity for shared state (per-player mistake_count,   │
-- │ and one-correct-per-rank idempotency via partial       │
-- │ unique indexes on guesses).                             │
-- │                                                        │
-- │ This holds in BOTH modes. A compete player who reads   │
-- │ board.categories in devtools wins — but per CLAUDE.md  │
-- │ trust-model, we're not the gatekeeper of cheating.     │
-- │                                                        │
-- │ Why: the evaluator is a small pure function (~15 lines │
-- │ of TS), nothing on the board is genuinely secret in    │
-- │ this codebase's deployment, and the friends-only audi- │
-- │ ence per CLAUDE.md doesn't justify column-grant +      │
-- │ PL/pgSQL evaluation infrastructure. Psychic-num's      │
-- │ column-grant pattern is documented as the canonical    │
-- │ "true server-side secret" example; reading that file   │
-- │ is enough — repeating the pattern here for a non-      │
-- │ secret game would be educational noise.                │
-- │                                                        │
-- │ If this game ever ships beyond friends, the migration  │
-- │ to flip back is: hide `board` via column-level grant,  │
-- │ add a server-side evaluator in PL/pgSQL, drop the FE's │
-- │ `result` / `matched_category_rank` parameters from     │
-- │ submit_guess.                                          │
-- └────────────────────────────────────────────────────────┘
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, common MUST NOT reference connections back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists connections;

-- ============================================================
-- connections.puzzles — the source-of-truth puzzle library
-- ============================================================
-- A *puzzle* is a prewritten, replayable board shape: one date's
-- NYT Connections puzzle, imported from the Eyefyre/
-- NYT-Connections-Answers repo via `gmake g-connections-puzzles`. Distinct from a *game's* `board` jsonb (below), which
-- is the per-game-instance copy plus that game's shuffled
-- `tileOrder`. Puzzles stay pristine; games copy from them.
--
-- Two unique identifiers we preserve from NYT:
--   - `source_id` — the NYT puzzle number ("1", "500"). Text
--     because it's used as a number-in-display but a future NYT
--     could publish "500-bonus" without breaking the schema.
--   - `puzzle_date`  — the calendar date NYT published. Drives the
--     setup-form date picker.
--
-- `categories` is a jsonb array matching the shape of
-- `connections.games.board.categories`:
--     [{ rank: 0..3, name: text, tiles: text[4] }, …]
-- The importer normalizes the NYT shape (rank from array index,
-- name from `group`, tiles from `members`).

create table connections.puzzles (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  -- Nullable on purpose. Today every puzzle comes from the NYT
  -- importer and carries the puzzle's puzzle_date — the date picker
  -- + calendar widget in the setup form anchor on this column.
  -- The decision (per Joel): non-NYT puzzles MAY land later (no
  -- UI for them today; only the date picker), and they'd carry
  -- NULL here rather than competing for a calendar slot. UNIQUE
  -- still enforces "at most one puzzle per calendar date" for
  -- the dated subset; Postgres treats NULLs as distinct under
  -- UNIQUE by default, so multiple non-dated rows coexist fine.
  -- The setup form's date-picker query (`.eq('puzzle_date', d)
  -- .maybeSingle()`) then trivially returns 0-or-1 row.
  puzzle_date date unique,
  categories jsonb not null,
  imported_at timestamptz not null default now()
);

-- ============================================================
-- connections.games
-- ============================================================
-- One row per playthrough. `board` is jsonb with shape
--   {
--     "categories": [{rank: 0..3, name: text, tiles: text[4]}, ...4],
--     "tileOrder":  [text, text, ...16]
--   }
-- The whole board is publicly readable (see the "FE-knows" note
-- in the file header). Per-player mutable state (mistake_count,
-- matched categories) lives on connections.players + connections.guesses
-- so it can be partial-updated atomically; play_state lives on
-- common.games.
--
-- (Setup lives on common.games.setup — the canonical home for the
-- frozen-at-create-time player choices. connections's setup today is
-- just `{ "puzzleId": ..., "timer": ... }`. Server-side validated
-- in create_game.)
--
-- connections.games.id is FK'd to common.games(id) — the canonical
-- id is generated by common.create_game and passed in. ON DELETE
-- CASCADE means a row here goes away if its common.games parent
-- is deleted (e.g., the gametype is unregistered).
--
-- club_handle stays on this row (denormalized from common.games.club_handle)
-- so the RLS policy can ask is_club_member(club_handle) without a join.
-- The denormalization is safe — club_handle is set at create-game time
-- and never changes.
--
-- `mode` ('coop' | 'compete') is the per-game flavor. It's also
-- denormalized onto connections.guesses so the mode-aware partial
-- unique indexes and RLS policy can filter without a join.

create table connections.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- The puzzle this game was created from — PROVENANCE only (a SOFT FK).
  -- Everything needed to play AND identify the game is COPIED below (board +
  -- puzzle_date), so a puzzle can be retired with ON DELETE SET NULL: games
  -- built from it survive, just losing the back-link. Mirrors
  -- stackdown.games.board_id. Set at create_game time; never updated.
  puzzle_id uuid references connections.puzzles(id) on delete set null,
  -- Frozen per-game copy of the puzzle's categories + this game's shuffled
  -- tileOrder. Keeping the copy means the played board is self-contained:
  -- gameplay reads board.categories, NEVER the puzzles table, so a deleted or
  -- re-imported puzzle never affects in-flight games.
  board jsonb not null,
  -- Frozen copy of the puzzle's NYT date — its provenance ("which daily
  -- puzzle"), copied so the game stays self-describing after the puzzle is
  -- deleted. Null for a non-NYT puzzle (puzzles.puzzle_date is nullable).
  puzzle_date date,
  created_at timestamptz not null default now(),
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('connections_coop' / 'connections_compete') by construction in
  -- create_game.
  mode text not null
    check (mode in ('coop', 'compete'))
);

create index connections_games_club_handle_idx on connections.games (club_handle);
create index connections_games_puzzle_id_idx on connections.games (puzzle_id);

-- ============================================================
-- connections.guesses — append-only log
-- ============================================================
-- One row per submit. `matched_category_rank` is non-null iff
-- result = 'correct' — the rank (0..3) of the category that was
-- matched. Duplicate submissions (same 4-tile set) are filtered
-- on the FE side (the client has full game state including the
-- guess log), so the RPC just records what it's told.
--
-- `mode` is denormalized from the parent game. Two reasons:
--   1. The mode-aware partial unique indexes below need to
--      filter on mode without a subquery (Postgres partial-
--      index predicates can't reference other tables).
--   2. The mode-aware RLS policy reads it from the row via
--      EXISTS — same pattern as psychicnum.guesses_select.

create table connections.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references connections.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  tiles text[] not null,
  result text not null check (result in ('correct', 'oneAway', 'wrong')),
  matched_category_rank int
    check (matched_category_rank between 0 and 3),
  guessed_at timestamptz not null default now(),
  mode text not null
    check (mode in ('coop', 'compete'))
);

create index connections_guesses_game_id_idx on connections.guesses (game_id);

-- One-correct-per-rank idempotency, mode-aware. These partial
-- unique indexes are the race-idempotency enforcers — when two
-- writers both submit a correct guess for the same category at
-- the same instant, the second INSERT raises unique_violation,
-- which submit_guess catches and treats as "already matched,
-- no-op."
--
-- The set of matched categories is fully derivable from `guesses`
-- filtered to result='correct' plus the static board, so there's
-- no separate matched-categories table — the partial indexes give
-- the same idempotency property with one fewer table to fan
-- postgres-changes events out of.

-- Coop: one correct per rank per game. Two players racing to
-- match the same category — the second INSERT raises
-- unique_violation and submit_guess catches it.
create unique index connections_guesses_one_correct_per_rank_coop
  on connections.guesses (game_id, matched_category_rank)
  where result = 'correct' and mode = 'coop';

-- Compete: one correct per rank PER PLAYER per game. Each
-- player solves the puzzle for themselves; ada can match rank-0
-- and so can bea — those are different rows. The same player
-- accidentally re-submitting the same correct match (e.g., a
-- broken UI sending the request twice) gets caught here.
create unique index connections_guesses_one_correct_per_rank_compete
  on connections.guesses (game_id, user_id, matched_category_rank)
  where result = 'correct' and mode = 'compete';

-- ============================================================
-- connections.players — per-player tracking
-- ============================================================
-- One row per player_user_ids entry, created at game-start time
-- with mistake_count seeded at 0.
--
-- Coop: every row updates in lock-step (mistake_count++ on
-- every wrong guess hits every player row). The shape is
-- symmetric across modes — a coop row's mistake_count just
-- happens to equal the next row's because they increment
-- together.
--
-- Compete: each row increments independently when its owner
-- guesses wrong. When a player's mistake_count hits 4 they're
-- eliminated; the game continues until all are eliminated OR
-- someone matches all 4 categories OR the timer expires.
--
-- Per-player win/lose outcome doesn't live here — that's
-- common.game_players.result written at terminal time via
-- common.end_game's player_results param. Same separation as
-- psychicnum.players.
create table connections.players (
  game_id uuid not null
    references connections.games(id) on delete cascade,
  user_id uuid not null
    references common.profiles(user_id) on delete cascade,
  mistake_count int not null default 0
    check (mistake_count between 0 and 4),
  -- The player's own categories-found count (their correct guesses). PUBLIC like
  -- mistake_count, so a compete opponent strip can show race progress ("Found")
  -- — the guess log itself is RLS-scoped to the caller in compete, so this row
  -- is the only public window onto an opponent's progress (mirrors
  -- psychicnum.players.found_secrets_count). Maintained by submit_guess on a correct
  -- guess.
  matched_count int not null default 0
    check (matched_count between 0 and 4),
  primary key (game_id, user_id)
);

create index connections_players_game_id_idx on connections.players (game_id);

-- ============================================================
-- RLS
-- ============================================================
-- Same shape as psychicnum: SELECT gated on club membership,
-- no INSERT/UPDATE/DELETE policies (writes go through the
-- security-definer RPCs).

alter table connections.games enable row level security;
alter table connections.guesses enable row level security;
alter table connections.players enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   games    status flips
--   guesses  new guess submissions (including correct ones —
--            which is how the FE learns a category was matched,
--            now that there's no separate found_groups table)
--   players  mistake_count increments — drives the opponent-
--            mistakes strip live when an opponent guesses wrong

alter publication supabase_realtime add table connections.games;
alter publication supabase_realtime add table connections.guesses;
alter publication supabase_realtime add table connections.players;


insert into common.gametypes (gametype, min_players) values
  ('connections_coop', 1),
  ('connections_compete', 2)
on conflict do nothing;
