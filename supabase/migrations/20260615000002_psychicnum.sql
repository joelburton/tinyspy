-- ============================================================
-- psychicnum schema — baseline
-- ============================================================
--
-- psychicnum is a tiny word-guessing game: the board shows N
-- words (N = 5..20, chosen at setup) drawn from a dictionary at a
-- chosen difficulty; THREE of them are secret, and players win by
-- finding all three (by clicking a word or typing it). Two helper
-- affordances: "reveal" shows an unfound secret WORD (the answer);
-- "hint" shows its CLUE (common.words.hint). Two modes:
--
--   psychicnum_coop    — players share a single guess budget and
--                        a single board, see each other's guesses
--                        live, win OR lose together. Find all
--                        three (as a team) = team wins. Budget
--                        exhausted first = team loses.
--
--   psychicnum_compete — players each have their own guess
--                        budget + private board, and race to find
--                        all three themselves. Opponents see each
--                        other's remaining budget AND a count of
--                        how many secrets each has found (for
--                        tension) — but NOT the guesses, results,
--                        or which words. First to all three
--                        wins; everyone else loses. All-exhausted
--                        or timer-expired = everyone loses.
--
-- Both modes share this one schema. The mode is denormalized onto
-- psychicnum.games.mode so RLS can branch without joining to
-- common.games every check. Schema-side gametype registration
-- inserts BOTH 'psychicnum_coop' and 'psychicnum_compete' rows
-- in common.gametypes.
--
-- The "family pair sharing a schema" pattern is canonical here.
-- See manifest.baseGametype + manifest.mode in src/common/lib/games.ts
-- for the FE side of the same idea. A future game that adds a
-- compete sibling (connections, spellingbee) follows this template:
--   - one schema, one folder
--   - two `common.gametypes` rows ('<base>_coop', '<base>_compete')
--   - mode-denormalized column on the game row for RLS branching
--   - one create_game RPC taking a `mode text` parameter
--
-- Educationally minimal: psychicnum is a deliberately tiny game,
-- and its coop/compete split is the smallest possible surface to
-- learn the pattern. Connections + spellingbee adoption can crib from
-- here directly.
--
-- What this still exercises that codenamesduet doesn't:
--   - N-player, no turns (anyone-acts-any-time)
--   - Genuine server-side secrets (the three words), hidden
--     from the client even with devtools open via a column-level
--     grant that excludes `secrets` from authenticated SELECT
--   - The hidden-wordlist-style reveal pattern (secrets column
--     gated through a SECURITY DEFINER helper called inside a
--     security_invoker view)
--   - A public per-player progress counter (players.found_secrets_count)
--     that leaks the COUNT but not the values — the smallest
--     "show opponents your progress, not your answers" surface
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant,
-- common MUST NOT reference psychicnum back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists psychicnum;

-- ============================================================
-- psychicnum.games — one row per playing
-- ============================================================
-- `secrets` holds the three secret words; column-grant excludes
-- it from authenticated SELECT (see grants below) while `words`
-- (the public board) is granted. RPCs run as postgres under
-- SECURITY DEFINER and read `secrets` freely; the FE only learns
-- it once the game is terminal, via the `psychicnum.games_state`
-- view + `_secrets_for` helper pattern.
--
-- `mode` is denormalized from `common.games.gametype`
-- ('psychicnum_coop' → mode='coop', etc.). The column lets the
-- RLS policy on `psychicnum.guesses` branch on mode without
-- joining to common.games on every visibility check. Read-only
-- after insert; no UPDATE policy.
--
-- Per-player guess budget lives on `psychicnum.players` (below).
-- The shared budget (coop) is "every player row has the same
-- value, and we decrement them all in lock-step"; the per-player
-- budget (compete) is "each row decrements independently." Same
-- shape, different RPC mechanics — see submit_guess.
--
-- club_handle stays on this row (denormalized from
-- common.games.club_handle) so the RLS policies can ask
-- is_club_member(club_handle) without a join.

create table psychicnum.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  -- The board: 5..20 distinct words drawn from common.words at create-game
  -- time under a clean, american, difficulty-≤-band filter (see create_game).
  -- PUBLIC — players see and click these to guess. The count is the setup's
  -- "how many words" choice.
  words text[] not null check (array_length(words, 1) between 5 and 20),
  -- The THREE secret words, distinct, a subset of `words`. The column-grant
  -- below excludes this from authenticated SELECT; it's revealed only
  -- post-terminal via games_state. Players win by finding all three (coop: as
  -- a team; compete: each on their own). The CHECK only asserts the count;
  -- distinctness + the subset property come from construction (create_game
  -- samples three of the board words) — a CHECK can't hold a subquery.
  secrets text[] not null check (array_length(secrets, 1) = 3),
  created_at timestamptz not null default now()
);

create index psychicnum_games_club_handle_idx on psychicnum.games (club_handle);

-- ============================================================
-- psychicnum.players — per-player budget tracking
-- ============================================================
-- Created at game-start time: one row per player_user_ids entry,
-- with `guesses_remaining` seeded from `setup.guesses`.
--
-- In coop mode: every row shares the same value (and decrements
-- in lock-step with every guess). The shape is symmetric across
-- modes — a coop row's "remaining" just happens to equal the
-- next row's "remaining" because they decrement together.
--
-- In compete mode: each row decrements independently when its
-- owner submits.
--
-- Per-player outcome (won/lost) doesn't live here — it's
-- written to `common.game_players.result` at game-end (via
-- common.end_game's player_results param), which already has
-- the right shape for "all gametypes need a per-player outcome
-- jsonb." Storing it twice (here + game_players) would just be
-- duplicate writes. The FE reads game_players.result.

create table psychicnum.players (
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  guesses_remaining int not null
    check (guesses_remaining between 0 and 9),
  -- How many distinct secrets THIS player has found (0..3). Public to the
  -- club (like guesses_remaining) — it's the count, never the numbers. In
  -- compete it's what powers opponent tension: the FE watches an opponent's
  -- count tick up and announces "X guessed a secret number" without leaking
  -- which one. (In coop it's incidental — coop shows the actual guesses.)
  found_secrets_count int not null default 0
    check (found_secrets_count between 0 and 3),
  primary key (game_id, user_id)
);

create index psychicnum_players_game_id_idx on psychicnum.players (game_id);

-- ============================================================
-- psychicnum.guesses — append-only log
-- ============================================================
-- Used both for "show the history" in the UI and for tests'
-- post-condition checks. The per-player budget update happens on
-- psychicnum.players directly (not derived from a count(*) over
-- this table) so submit_guess stays cheap.

create table psychicnum.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  -- The text this row carries. For 'guess' / 'reveal' rows it's a board word
  -- (lowercase). For 'hint' rows it's the CLUE text (a sentence, or
  -- "No hint available") — NOT the secret word, so a hint never leaks the
  -- answer into the row data.
  word text not null,
  is_correct boolean not null,
  -- 'guess'  = a real guess (counts toward finding the secrets, colors the
  --            board tile green/red, can't be repeated).
  -- 'reveal' = the player asked to reveal an answer: request_reveal picks an
  --            unfound secret and logs the WORD here (shown in the turn log).
  -- 'hint'   = the player asked for a hint: request_hint picks an unfound
  --            secret and logs its CLUE (from common.words.hint) here.
  -- Neither helper finds the secret, colors a tile, or blocks re-guessing —
  -- they're log entries; everything that computes from real guesses filters
  -- `kind = 'guess'`.
  kind text not null default 'guess' check (kind in ('guess', 'hint', 'reveal')),
  guessed_at timestamptz not null default now()
);

create index psychicnum_guesses_game_id_idx on psychicnum.guesses (game_id);

-- ============================================================
-- RLS
-- ============================================================

alter table psychicnum.games   enable row level security;
alter table psychicnum.players enable row level security;
alter table psychicnum.guesses enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   - games   — terminal-state flip (used to re-fetch the view
--                with secrets now revealed)
--   - players — guesses_remaining decrement (drives the budget
--                strip's live update + own-budget UI in compete)
--   - guesses — new entry (in coop everyone sees; in compete
--                the receiver's RLS hides others' entries, but
--                the postgres-changes payload still arrives —
--                FE filters defensively too)

alter publication supabase_realtime add table psychicnum.games;
alter publication supabase_realtime add table psychicnum.players;
alter publication supabase_realtime add table psychicnum.guesses;

-- ============================================================
-- Register psychicnum with common.gametypes — both modes
-- ============================================================
-- Two rows: coop and compete. Same schema serves both; the FE
-- manifests carry the per-mode display + behavior; the
-- create_game RPC routes on mode.

-- `hides_solution`: this game keeps its answer covered when a game ends without
-- a win, so a replay of the same board is a genuine second try. The players
-- open it with the terminal Reveal (common.reveal_solution). See
-- common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('psychicnum_coop', 1, true),
  ('psychicnum_compete', 2, true)
on conflict do nothing;
