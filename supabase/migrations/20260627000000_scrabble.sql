-- ============================================================
-- scrabble — a Scrabble-style word game
-- ============================================================
--
-- Players build interlocking words from lettered tiles on the standard
-- 15×15 premium-square board, drawing from a shared 100-tile bag.
--
-- "scrabble" is the codename used in SQL, TypeScript, and folder names.
-- The user-facing brand lives only in the FE manifest (see
-- docs/naming.md for the codename-vs-brand split).
--
-- Coop + compete ship as a sibling-manifest pair (`scrabble_coop` +
-- `scrabble_compete`, a denormalized `mode` column, a `mode` arg on
-- create_game) — the pattern waffle/wordle/spellingbee follow.
--   - Compete (2..4): classic turn-based Scrabble. Private per-player
--     racks + scores; only the player whose turn it is may act; highest
--     final score wins.
--   - Coop (1..4, solo OK): ONE shared rack / board / bag / score, NO
--     turn rotation — any player commits a word at any time, planning
--     over chat. The team maximizes its score.
--
-- THE ARCHITECTURE THAT SHAPES THIS FILE — a *trusting* commit, not a
-- server-side re-validation. The intricate logic (placement geometry,
-- reading the main word + every cross-word, scoring with premiums) lives
-- ONCE, in the TS `src/scrabble/lib/play.ts`, where the board already is.
-- The FE evaluates a play instantly (live score + highlighting) and, on
-- submit, hands the server the placements it made, the words it read off,
-- and the score it computed. Per the trust model (players are friends; we
-- don't defend against cheating) the server TRUSTS those and does only the
-- things it alone can:
--   1. check the words against the dictionary (`common.words` is here),
--   2. draw replacement tiles from the HIDDEN bag (fairness without trust),
--   3. keep the books (apply tiles, advance turn, detect end, score-out).
-- Concurrency (esp. coop's shared rack) is handled by OPTIMISTIC
-- CONCURRENCY: `games.version` is a move counter, the FE submits the
-- `base_version` it read, and the commit compare-and-sets under the row
-- lock — a mismatch is rejected `stale` and the FE recomputes. Two cheap
-- integrity guards (placements on empty squares; consumed tiles really in
-- the rack) keep the board/bag accounting honest against a *buggy* client;
-- they are NOT the duplicated word/score logic. See docs/games/scrabble.md
-- §6 for the full reasoning.
--
-- Depends on `common` (clubs, profiles, games, game_players, words,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- require_valid_timer). Per the removability invariant, common MUST NOT
-- reference scrabble back.

-- ============================================================
-- Schema + usage grant
-- ============================================================
create schema if not exists scrabble;

-- ============================================================
-- scrabble.games — one row per game
-- ============================================================
-- `board` is the public 15×15 state (a flat 225-element jsonb array; each
-- cell is null or {"l": "Q", "b": false} — `b` = came-from-a-blank, scores
-- 0). `bag` is the HIDDEN remaining draw order (column-excluded; only its
-- COUNT is ever exposed). `version` is the optimistic-concurrency move
-- counter. The coop/compete column asymmetry is deliberate (see §4.2):
-- coop SHARES its rack + score on this row; compete PARTITIONS them onto
-- scrabble.players, and tracks whose turn it is + a consecutive-pass counter
-- for the blocked-game end.
create table scrabble.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode        text not null check (mode in ('coop', 'compete')),
  -- The dictionary acceptance bands (both 1..6): a word is legal iff its
  -- common.words.difficulty <= the band for its length — `dict_2` gates
  -- 2-letter words, `dict_3plus` gates everything 3+ (2-letter words are a
  -- thin, separate vocabulary, like bananagrams). Unlike most games these IS
  -- the bar, not just a puzzle knob — see docs §3.3.
  dict_2      int  not null check (dict_2 between 1 and 6),
  dict_3plus  int  not null check (dict_3plus between 1 and 6),
  board       jsonb not null,                  -- PUBLIC: 225-cell array
  bag         text[] not null,                 -- HIDDEN: remaining draw order
  version     int  not null default 0,         -- optimistic-concurrency counter
  -- Coop-only (null in compete): the shared team rack + score.
  shared_rack text[],
  team_score  int,
  -- Compete-only (null in coop): whose turn (by SEAT, not user — a seat may be
  -- an AI, which has no profile), and the blocked-end counter — passes in a
  -- row, cleared by any play or exchange. The game ends when it reaches the
  -- number of active seats (see _commit_pass).
  current_seat       int,
  consecutive_passes int not null default 0,
  created_at  timestamptz not null default now()
);

create index scrabble_games_club_handle_idx on scrabble.games (club_handle);

alter table scrabble.games enable row level security;

-- ============================================================
-- scrabble.players — per-player seat / score / rack
-- ============================================================
-- `seat` is the turn order (compete) AND the identity key — a seat may be an
-- AI PLAYER (docs/scrabble-ai-strength.md), which has no profile, so `user_id`
-- is nullable and the PK is (game_id, seat), not (game_id, user_id). Exactly
-- one of `user_id` / `ai_level` is set: a human seat carries `user_id` (and
-- `ai_level` null); an AI seat carries `ai_level` (a LEVELS name from policy.ts)
-- and a null user_id. AI is scrabble-local — it is NOT in common.game_players
-- or common.profiles, so presence-pause and the club roster naturally ignore
-- it. `score` + `rack` are per-seat in COMPETE; in COOP they're null (the rack +
-- score live on games; coop has no AI). `rack` is HIDDEN: a player sees only
-- their own mid-game, everyone's once the game ends (the leftover-tile reveal).
create table scrabble.players (
  game_id uuid not null references scrabble.games(id) on delete cascade,
  user_id uuid references common.profiles(user_id) on delete cascade,
  seat    int  not null,
  score   int,                      -- compete per-seat; null in coop
  rack    text[],                   -- HIDDEN; compete per-seat; null in coop
  ai_level text,                    -- AI seat: a LEVELS name; null for a human
  primary key (game_id, seat),
  -- Exactly one of user_id / ai_level (a seat is human XOR AI).
  constraint players_human_xor_ai check ((user_id is null) <> (ai_level is null)),
  -- A human is seated at most once (nulls — AI seats — are exempt).
  unique (game_id, user_id)
);

create index scrabble_players_game_id_idx on scrabble.players (game_id);

alter table scrabble.players enable row level security;

-- ============================================================
-- scrabble.plays — the durable move log
-- ============================================================
-- One row per move, a single per-game sequence. `kind`: 'word' (carries
-- `placements`/`words`/`score`), 'exchange' (`tile_count` returned),
-- 'pass', or 'forfeit' (a coop game ended with tiles still in hand — the
-- leftover-tile value is logged as a NEGATIVE `score`; see end_game).
-- PUBLIC in both modes — every played word is already on the shared public
-- board, so there's nothing to hide here. Only racks + the bag are secret.
create table scrabble.plays (
  game_id    uuid not null references scrabble.games(id) on delete cascade,
  -- The actor: `user_id` for a human seat, null for an AI seat; `seat` is
  -- always set and is the real attribution key (the FE labels an AI seat
  -- "AI 1"…). Coop plays are attributed to the acting human (seat 0-based too).
  user_id    uuid references common.profiles(user_id) on delete cascade,
  seat       int  not null,
  seq        int  not null,
  kind       text not null check (kind in ('word', 'exchange', 'pass', 'forfeit')),
  placements jsonb,                 -- kind='word'
  words      text[],                -- kind='word'
  score      int,                   -- kind='word' (gained) / 'forfeit' (lost, negative)
  tile_count int,                   -- kind='exchange' / 'forfeit'
  played_at  timestamptz not null default now(),
  primary key (game_id, seq)
);

create index scrabble_plays_game_id_idx on scrabble.plays (game_id);

alter table scrabble.plays enable row level security;

-- No INSERT/UPDATE/DELETE policies — writes go through the RPCs below.

-- Realtime: the FE's useGame subscribes to all three.
alter publication supabase_realtime add table scrabble.games;
alter publication supabase_realtime add table scrabble.players;
alter publication supabase_realtime add table scrabble.plays;

-- ============================================================
-- Register the gametypes
-- ============================================================
-- compete's floor is 1 HUMAN (solo vs AI) — the ≥2-total rule (humans + AI)
-- lives in create_game. min_players 1 makes it solo-playable, so a solo club
-- gets the compete Start button too (mirrors manifest numberOfPlayers [1,4]).
insert into common.gametypes (gametype, min_players) values
  ('scrabble_coop', 1),
  ('scrabble_compete', 1)
on conflict do nothing;
