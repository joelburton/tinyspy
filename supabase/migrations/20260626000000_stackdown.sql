-- ============================================================
-- stackdown — mahjong-style word game
-- ============================================================
-- Thirty letter tiles are stacked on a fixed geometry; only EXPOSED tiles
-- (nothing remaining covers them) are selectable. A player clears the
-- board by finding six 5-letter words in sequence: clicking exposed tiles
-- builds a word in selection ORDER — the reveal-on-select mechanic gates
-- which orders are reachable (BROAD is spellable, its anagram BOARD is
-- not) — and a completed lexicon word permanently removes its five tiles,
-- exposing the ones beneath. Codename `stackdown` everywhere in code/DB;
-- the user-facing brand lives only in the FE manifest (see docs/naming.md).
--
-- Boards are PRE-GENERATED offline (with strict no-trap validation — see
-- docs/games/stackdown.md) and stored in stackdown.boards; a game claims a
-- random one. The 30 tiles (letters + positions) are PUBLIC — there is no
-- hidden board; the only secret is the six solution words, hidden until
-- terminal (the waffle/wordle hidden-answer pattern) for the end reveal.
--
-- Sibling-manifest pair:
--   coop    — one SHARED board; the in-progress selection is shared peer-
--             to-peer (connections pattern); the team finds all six together.
--   compete — same starting board, played INDEPENDENTLY; the first player
--             to clear all six wins immediately (a race). Opponents show
--             only a tally ("Found words: Joel 2 · Moth 1").

create schema if not exists stackdown;

-- ============================================================
-- Board representation
-- ============================================================
-- A board is a jsonb array of 30 tiles: {id,x,y,z,letter}. Positions and
-- the covering DAG are a CONSTANT shape across boards; only letters vary.
-- Covering: A covers B iff A.z > B.z and |A.x-B.x| <= 1 and |A.y-B.y| <= 1.
-- A tile is exposed iff no remaining tile covers it.

-- ============================================================
-- stackdown.boards — the pre-generated library (server-read only)
-- ============================================================
-- Filled offline by the board-gen import script. `words` are the six
-- solution words — spoilers — so this table is NOT granted to
-- authenticated; only create_game (SECURITY DEFINER) reads it.
create table stackdown.boards (
  id         uuid primary key default gen_random_uuid(),
  tiles      jsonb not null,          -- [{id,x,y,z,letter} x30]
  words      text[] not null,         -- 6 solution words, in play order
  -- The word-difficulty BAND the board was generated against — all six words
  -- are EXACTLY `common.words.difficulty = band` (american, clean = no
  -- crude/slur/slang, 5-letter — the app-wide must-spell filter).
  -- band 1 = the common everyday set; band 2 = the next tier (no band-1 words
  -- mixed in); 3..6 widen further. This is BOTH provenance AND the pool
  -- create_game filters on — a game claims a random board OF THE CHOSEN BAND.
  -- Runtime never consults a lexicon: a submission is accepted iff it's the
  -- next solution word (see submit_word).
  band       int not null check (band between 1 and 6),
  created_at timestamptz not null default now()
);
-- (intentionally no grants to authenticated — definer-only access)

-- ============================================================
-- stackdown.games — one row per playthrough
-- ============================================================
-- `tiles` is the board, PUBLIC (the FE renders it). `solution` is the six
-- words — HIDDEN via a column-level grant, revealed only post-terminal
-- through games_state.
create table stackdown.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode        text not null check (mode in ('coop', 'compete')),
  tiles       jsonb not null,          -- the board (public)
  solution    text[] not null,         -- the 6 words (HIDDEN until terminal)
  band        int not null,            -- copied from the board (see boards.band)
  -- Provenance + difficulty. tiles/solution/band are COPIED above, so a board
  -- can be deleted to retire it without affecting games built from it —
  -- hence ON DELETE SET NULL (the game survives, just loses the back-link).
  board_id    uuid references stackdown.boards(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index stackdown_games_club_handle_idx on stackdown.games (club_handle);

alter table stackdown.games enable row level security;

-- ============================================================
-- stackdown.players — per-player working state
-- ============================================================
-- Board state (which tiles a player has removed) is DERIVED from
-- stackdown.submissions (coop = union over all players; compete = own), so
-- it isn't stored. `found_count` is the PUBLIC tally the compete
-- OpponentStrip shows. `solved`/`solved_at` mark the compete winner (first
-- to clear all six).
create table stackdown.players (
  game_id     uuid not null references stackdown.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  found_count int  not null default 0,
  solved      boolean not null default false,
  solved_at   timestamptz,
  primary key (game_id, user_id)
);
create index stackdown_players_game_id_idx on stackdown.players (game_id);

alter table stackdown.players enable row level security;

-- ============================================================
-- stackdown.submissions — the game log (played words AND cheat requests)
-- ============================================================
-- Every entry the right-panel log shows lands here. `kind`:
--   'word'   — a completed 5-letter entry. `valid` = accepted (its tiles
--              are gone from the board) vs invalid (tiles returned). The
--              board's removed set = union of `tile_ids` over VALID rows.
--   'hint'   — the player asked for the next word's hint. The clue text is
--              stored in `word` so the log can show "Hint: <clue>".
--   'reveal' — the player asked for the next word itself. The word is stored
--              in `word` (lowercase) so the log can show "Revealed: <WORD>".
-- Cheat requests are SEPARATE rows from the played word (so the log can show
-- "moth asked for a hint, later joel found the word"); they carry no tiles and
-- no `valid`, but DO carry the revealed text in `word` (a hint clue, or the
-- revealed word). `for_word_index` is the solution-word index the request was
-- about, which doubles as a dedup key: at most one hint + one reveal request
-- per (player, word), so repeated clicks don't spam the log. Visibility rides
-- the same RLS as word rows (coop → all; compete → requester).
--
-- Mid-word RETRACTIONS are NOT here — those are ephemeral + broadcast (coop).
--
-- `seq` is the submitter's 1-based ordinal; the games-row `for update` lock
-- (submit_word + the reveal RPCs) keeps it collision-free.
create table stackdown.submissions (
  game_id      uuid not null references stackdown.games(id) on delete cascade,
  user_id      uuid not null references common.profiles(user_id) on delete cascade,
  seq          int  not null,          -- submitter's ordinal
  kind         text not null default 'word'
                 check (kind in ('word', 'hint', 'reveal')),
  word         text,                   -- the 5 letters, spelling order (uppercase); word rows only
  tile_ids     int[],                  -- the 5 tiles (only valid rows count as removed); word rows only
  valid        boolean,                -- accepted? word rows only
  for_word_index int,                  -- which solution word a request was about (hint/reveal rows)
  submitted_at timestamptz not null default now(),
  primary key (game_id, user_id, seq),
  -- A played word is fully specified; a request carries none of that.
  constraint submissions_word_shape check (
    kind <> 'word' or (word is not null and tile_ids is not null and valid is not null)
  )
);
create index stackdown_submissions_game_id_idx on stackdown.submissions (game_id);

alter table stackdown.submissions enable row level security;

-- Realtime: the FE's useGame subscribes to stackdown.{games,players,submissions}.
alter publication supabase_realtime add table stackdown.games;
alter publication supabase_realtime add table stackdown.players;
alter publication supabase_realtime add table stackdown.submissions;

-- ============================================================
-- Register the gametype(s)
-- ============================================================
-- `hides_solution`: this game keeps its answer covered when a game ends without
-- a win, so a replay of the same board is a genuine second try. The players
-- open it with the terminal Reveal (common.reveal_solution). See
-- common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('stackdown_coop', 1, true),
  ('stackdown_compete', 2, true)
on conflict do nothing;
