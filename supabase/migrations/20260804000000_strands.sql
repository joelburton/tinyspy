-- ============================================================
-- strands — NYT-Strands-style word search (brand: PaulPath)
-- ============================================================
--
-- An 8×6 board of letter tiles hiding a set of THEME WORDS plus one
-- SPANGRAM (the puzzle's theme, spanning edge to edge). You trace a
-- word by clicking adjacent tiles in order. Valid non-theme words
-- earn hint points; enough of them buys a hint, which rings the
-- tiles of one unfound theme word without connecting them.
--
-- "strands" is the codename for the gametype (as "codenamesduet" is
-- for Codenames Duet). The user-facing brand is PaulPath, which lives
-- ONLY in the manifest's BRAND const — SQL / TypeScript / folder names
-- are all `strands`.
--
-- Ships coop-first. The compete sibling ('strands_compete') lands
-- later and will add a `strands.players` table for per-player hint
-- pools; the coop pool lives on `strands.games` because it is SHARED.
--
-- ┌─ Two invariants verified against the real NYT feed ─────┐
-- │ Both were checked across sampled puzzles spanning the   │
-- │ archive, not inferred from the rules:                   │
-- │                                                         │
-- │ 1. ADJACENCY IS 8-WAY. Consecutive tiles may touch      │
-- │    diagonally as well as orthogonally. Every sampled    │
-- │    puzzle uses diagonal steps (3–15 of ~40), so a       │
-- │    4-way tracer cannot enter most boards at all.        │
-- │                                                         │
-- │ 2. THE HIDDEN WORDS TILE THE BOARD EXACTLY. Theme words │
-- │    plus the spangram cover all 48 cells, each once,     │
-- │    with no overlap. This is load-bearing, not trivia:   │
-- │      - winning IS consuming the board, so there is no   │
-- │        separate "found them all" bookkeeping;           │
-- │      - found tiles lock, so the pool of remaining hint  │
-- │        words shrinks as you progress — the difficulty   │
-- │        curve is a consequence, not a design knob;       │
-- │      - a puzzle whose coords do not tile 48 cells is    │
-- │        MALFORMED, which makes this an import guard.     │
-- │    The importer asserts it; see import-strands-puzzles. │
-- └─────────────────────────────────────────────────────────┘
--
-- ┌─ Server-authoritative, solution shielded ───────────────┐
-- │ Deliberately NOT connections' "FE-knows-the-answer".    │
-- │                                                         │
-- │ connections went FE-knows because its evaluator is a    │
-- │ ~15-line pure function, and going server-side would     │
-- │ have meant building column-grant + PL/pgSQL evaluation  │
-- │ infrastructure for that alone. strands has no such      │
-- │ choice: classifying a traced word requires a dictionary │
-- │ lookup against common.words, so a round trip is paid    │
-- │ regardless. Once it is, theme-matching in the same RPC  │
-- │ is free and the puzzle's whole content — WHERE the      │
-- │ words are — stays hidden.                               │
-- │                                                         │
-- │ The usual objection to server round trips is latency    │
-- │ under rapid input, which is why boggle and spellingbee  │
-- │ ship word lists and self-score. strands inverts that:   │
-- │ tracing is deliberate and infrequent.                   │
-- │                                                         │
-- │ So `solution` is hidden by COLUMN GRANT (waffle's       │
-- │ pattern) and surfaced through a SECURITY DEFINER helper │
-- │ once common.games.solution_revealed — and the gametype  │
-- │ registers hides_solution = true, which earns the shared │
-- │ reveal_solution RPC and terminal reveal for free.       │
-- │                                                         │
-- │ This is recorded as PROVISIONAL (docs/strands-plan.md): │
-- │ if the verdict feels laggy in the hand, the fallback is │
-- │ trusting-commit — ship solution + legal words, self-    │
-- │ score, and have the RPC record the verdict the way      │
-- │ connections.submit_guess does. The RPC's shape survives │
-- │ that flip; the shielding here is what would not.        │
-- └─────────────────────────────────────────────────────────┘
--
-- ┌─ No Realtime Broadcast channel ─────────────────────────┐
-- │ A peer sees your word only when you SUBMIT it — nobody  │
-- │ watches anyone else's tiles light up mid-trace. That is │
-- │ the opposite of connections, which broadcasts partial   │
-- │ selection so coop players build a guess together, and   │
-- │ it means strands needs no Broadcast channel at all:     │
-- │ postgres_changes on the guess log carries everything.   │
-- │ Recorded so the absence doesn't read later as an        │
-- │ oversight someone should "fix".                         │
-- └─────────────────────────────────────────────────────────┘
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, nothing in `common` depends on this schema.
--
-- SHAPE ONLY (docs/supabase.md → Schema vs code). Functions, views,
-- policies and grants live in supabase/sql/strands.sql and are
-- re-applied on every deploy.

create schema if not exists strands;

-- ============================================================
-- strands.puzzles — the imported NYT archive
-- ============================================================
-- One row per published Strands puzzle, imported by
-- `gmake g-strands-puzzles` from
--     https://www.nytimes.com/svc/strands/v2/YYYY-MM-DD.json
-- which — unlike the NYT crossword endpoint, which needs a cookie
-- jar — is PUBLIC and needs no auth. The archive starts 2024-03-04.
--
-- Puzzles stay pristine; games COPY from them (see strands.games).
--
-- `board` is the 8 rows of 6 letters, one string per row, exactly as
-- NYT ships them ("ARCPAP", "WDZARA", …). Coordinates everywhere in
-- this gametype are [row, col], 0-based, matching that feed.
--
-- `solution` is the answer key, and is NOT granted to `authenticated`
-- (see supabase/sql/strands.sql):
--     { spangram:   { word: text, coords: [[r,c], …] },
--       themeWords: [ { word: text, coords: [[r,c], …] }, … ] }
--
-- `clue` is the theme prompt ("Here's to him!") — NOT a spoiler, and
-- shown from the start.

create table strands.puzzles (
  id uuid primary key default gen_random_uuid(),
  -- The NYT puzzle number ("7", "1062"). Text, not int, so a future
  -- "500-bonus" wouldn't need a migration — connections' reasoning.
  source_id text not null unique,
  -- The calendar date NYT published it. Drives the setup date picker.
  -- Unique so the picker's lookup is trivially 0-or-1 row.
  puzzle_date date not null unique,
  -- 8 rows × 6 columns. The two CHECKs catch a wrong-shaped board
  -- (the realistic import failure); exact per-row length and the
  -- tiling invariant are asserted by the importer, which can report
  -- WHICH puzzle and WHY in a way a CHECK cannot.
  board text[] not null
    check (cardinality(board) = 8 and length(array_to_string(board, '')) = 48),
  clue text not null,
  solution jsonb not null,
  imported_at timestamptz not null default now()
);

-- ============================================================
-- strands.games — one row per playthrough
-- ============================================================
-- Follows the library-puzzle provenance rule (docs/common.md):
-- everything needed to PLAY and to IDENTIFY the game is copied onto
-- this row, and `puzzle_id` is a SOFT FK — nullable, ON DELETE SET
-- NULL — so the archive can be re-imported or pruned without
-- breaking in-flight games. stackdown is the template; connections
-- is the documented cautionary case.
--
-- The three setup knobs are denormalized off common.games.setup for
-- the same reason `mode` is: they are immutable after create_game and
-- the move RPC reads them on every submission.

create table strands.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- Sibling-manifest mode axis; agrees with the gametype string by
  -- construction in create_game. Only 'coop' is reachable today.
  mode text not null check (mode in ('coop', 'compete')),

  -- ── Provenance (soft) + the frozen playable copy ──
  puzzle_id uuid references strands.puzzles(id) on delete set null,
  puzzle_date date,
  board text[] not null
    check (cardinality(board) = 8 and length(array_to_string(board, '')) = 48),
  clue text not null,
  -- The answer key. Column-grant hidden — see supabase/sql/strands.sql.
  solution jsonb not null,

  -- ── The shared coop hint economy ──
  -- hint_points is the BAR, and it CAPS at hint_cost: points found
  -- while a hint is unspent are lost. That is a deliberate rule, not
  -- an overflow bug — the player reads the full bar rather than being
  -- warned. Spending resets it to 0.
  hint_points int not null default 0 check (hint_points >= 0),
  hints_spent int not null default 0 check (hints_spent >= 0),
  -- The active hint exposes COORDS, never the word: a hint rings the
  -- tiles and leaves the player to work out the order. This is the
  -- only piece of the solution that is ever public before terminal.
  active_hint_coords jsonb,

  -- ── Setup knobs, denormalized (immutable after create) ──
  -- Minimum length for a word to EARN a hint point. Theme words are
  -- matched before this applies — 4-letter theme words are common, so
  -- a length-first check would reject real answers whenever a club
  -- raises this to 5+.
  min_word_length int not null check (min_word_length between 3 and 8),
  -- Valid words needed per hint (NYT plays 3).
  hint_cost int not null check (hint_cost between 1 and 10),
  -- common.words difficulty ceiling for hint words. NOTE the direction:
  -- a HIGHER band makes strands EASIER (more words qualify, so hints
  -- come faster) — same as spellingbee's `legal`, opposite of waffle's
  -- tier. Filtered on difficulty ALONE (the may-enter tier in
  -- docs/common.md): slur / crude / slang / dialect unrestricted,
  -- because the player chose to type it.
  band int not null check (band between 1 and 6),

  created_at timestamptz not null default now()
);

create index strands_games_club_handle_idx on strands.games (club_handle);
create index strands_games_puzzle_id_idx on strands.games (puzzle_id);

-- ============================================================
-- strands.guesses — the append-only submission log
-- ============================================================
-- ONE table, not two: found theme words are the projection
-- `result in ('theme','spangram')`, and the credited hint words are
-- the distinct `result = 'hint_word'` set. Only the state that
-- genuinely cannot be derived (the capped bar, the spend count, the
-- active hint) lives as columns on strands.games.
--
-- Every submission is logged, including the rejects — the turn log
-- shows good and bad alike, and "what did we already try?" is the
-- point of keeping them.
--
-- `path` is the traced route, [[r,c], …]; `word` is the string it
-- spells, stored so the log and the dedup check don't have to re-read
-- the board.

create table strands.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references strands.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  word text not null,
  path jsonb not null,
  -- theme      — an unfound theme word, matched BY PATH
  -- spangram   — likewise, but the spanning one (gold, not purple)
  -- hint_word  — a valid non-theme word; earned a hint point
  -- duplicate  — a valid word already credited this game; earns nothing
  -- too_short  — under min_word_length and not a theme path
  -- invalid    — not in the dictionary at this game's band
  result text not null check (result in
    ('theme', 'spangram', 'hint_word', 'duplicate', 'too_short', 'invalid')),
  guessed_at timestamptz not null default now()
);

create index strands_guesses_game_id_idx on strands.guesses (game_id);

-- Idempotency for the found set. submit_path already serializes on a
-- row lock and rejects a path whose tiles are consumed, so this can't
-- fire under the normal path — it's here to make the invariant
-- STRUCTURAL ("a theme word is found at most once per game") rather
-- than merely upheld by the RPC that happens to be written today.
create unique index strands_guesses_found_once_idx
  on strands.guesses (game_id, word)
  where result in ('theme', 'spangram');

-- ============================================================
-- Row-level security
-- ============================================================
-- Policies live in supabase/sql/strands.sql. Reads are club-gated;
-- all writes go through the SECURITY DEFINER RPCs. Coop shows every
-- guess to every player, so there is no per-player read split here —
-- that arrives with the compete sibling.

alter table strands.puzzles enable row level security;
alter table strands.games enable row level security;
alter table strands.guesses enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- BOTH tables, and both are REQUIRED. An unpublished table in a
-- postgres_changes subscription silently kills the WHOLE subscription
-- — not just that table's events — so a missing entry here reads as
-- "realtime is broken" rather than "one table is quiet". This has
-- bitten the repo before (spellingbee shipped with only found_words
-- published); schema_test guards the same invariant for wordwheel and
-- wordiply.
--
--   games    — hint bar, active hint, terminal flips
--   guesses  — new submissions; how every client learns a word landed

alter publication supabase_realtime add table strands.games;
alter publication supabase_realtime add table strands.guesses;

-- ============================================================
-- Gametype registration
-- ============================================================
-- Coop only for now — registering 'strands_compete' before it exists
-- would surface a Start button for an unbuilt game. The compete row
-- gets added here (edited in place, per the alpha rule in CLAUDE.md)
-- when that sibling lands.
--
-- hides_solution = true: strands withholds its answer from a game
-- that ended without a win, which is what wires up the shared
-- RevealButton + common.reveal_solution.

insert into common.gametypes (gametype, min_players, hides_solution) values
  ('strands_coop', 1, true)
on conflict do nothing;
