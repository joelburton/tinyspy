-- ============================================================
-- bananagrams schema — baseline (squashed)
-- ============================================================
--
-- bananagrams is a Bananagrams clone: a real-time, competitive
-- word-tile race. Each player builds their own **player board**
-- (a private crossword) from a hand of letter tiles, drawing more
-- from a shared bank as they go:
--
--   - Each player is dealt a STARTER HAND at game start; the
--     leftover after the deal is the shared "bunch" (games.bunch, hidden).
--   - Players build privately; peers see only an unplaced-tile
--     COUNT, never each other's boards.
--   - When your hand empties you PEEL: everyone draws a round, or
--     — if the bunch can't refill the table — you go out and win.
--     DUMP swaps one awkward tile for three from the bunch. A
--     winning peel ALWAYS re-checks board CONNECTIVITY (one
--     connected grid); WORD validity is an opt-in extra
--     (`word_check` = 'win'/'strict'; 'strict' also validates every
--     non-winning peel). See `_win_blockers`.
--
-- All RPCs live INLINE in this one squashed baseline file —
-- create_game, save_player_board, peel, dump, submit_timeout, concede,
-- end_game (this is an alpha repo, so baselines are edited in place rather
-- than accreting per-RPC migrations; see CLAUDE.md). The intrinsic win is
-- detected inside `peel`; `concede` drops a single player out of the
-- race (the last one out ends the game as a collective loss); `end_game`
-- is the whole table stopping with no verdict for anyone.
--
-- See docs/games/bananagrams.md for the full plan, the keyboard
-- rules, and the bank loop.
--
-- The state split is the design's spine — three visibility
-- classes, three handlings:
--
--   bananagrams.games          club-readable header (bunch hidden)
--   bananagrams.player_boards  the private grid — OWNER-ONLY read
--   bananagrams.progress       the public projection — club read
--
-- Within player_boards, a second split (board = FE-owned, tiles =
-- server-owned, hand = derived) is what lets peel/dump grow every
-- player's holdings without colliding with live FE placement — see
-- that table's comment.
--
-- The board is NOT mutated per drag through an RPC; it's FE scratch
-- state snapshotted to player_boards.board (save_player_board).
-- This single file stands up the schema and ALL its RPCs: create_game
-- deals the starter hands and materializes the bunch; save_player_board
-- snapshots the board; peel draws a round / goes out to win; dump swaps
-- a tile; submit_timeout ends a timed race; concede drops a player out.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- gametypes, is_club_member, create_game). Per the removability
-- invariant, common MUST NOT reference bananagrams back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists bananagrams;

-- ============================================================
-- bananagrams.games — one row per playing
-- ============================================================
-- `bunch` is the live "bunch": every tile not currently held by a
-- player. It starts as the undealt remainder of the shuffled
-- 144-tile bag and MUTATES during play — PEEL draws from it (one
-- tile per player), DUMP swaps with it (return one, draw three).
-- It is SENSITIVE: the contents/order are the upcoming draws, so
-- the column-level grant below EXCLUDES `bunch` from authenticated
-- SELECT (same hidden-column pattern as psychicnum.games.target).
-- RPCs run SECURITY DEFINER and read it freely; the FE only ever
-- learns the bunch's COUNT (surfaced via the live status the
-- peel/dump RPCs write).
--
-- The deal shuffles the bag with a throwaway seed; once `bunch` is
-- materialized it's the sole authority (dump returns tiles into it,
-- so a fixed seed could no longer describe it), so the seed isn't
-- stored.
--
-- club_handle is denormalized from common.games.club_handle so
-- the RLS policies (and progress's policy) can call
-- is_club_member(club_handle) without joining common.games.

create table bananagrams.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- `bunch_seed` is the IMMUTABLE record of the shuffled bunch this game was
  -- dealt from: the full in-play tile sequence (length = the chosen bunch
  -- size, ≤ 144), hands-then-draw-pile in deal order. Set once at create_game
  -- and never written again. `bunch` (below) is the live remainder that
  -- mutates; this is what a future "restart game" re-deals from. Hidden from
  -- the FE for the same reason as `bunch` — it carries the draw order, which
  -- would let a player predict peels (the column grant below omits it).
  bunch_seed text not null,
  -- `bunch` is the live draw pile: every tile not currently held by a player.
  -- Starts as the undealt suffix of `bunch_seed` and MUTATES during play.
  bunch text not null,
  -- `bag` is the OUT-OF-PLAY reserve. It starts with the 144 − bunch_size tiles
  -- left out of the bunch (a reduced bunch sets the rest aside rather than
  -- discarding them), and in dump_to_bag mode a dumped tile goes here too
  -- (instead of back to the bunch, so the bunch depletes and the game ends
  -- sooner). The bag isn't dead, though — a dump whose draw the bunch can't
  -- cover dips into it. Hidden like bunch (its order would leak future draws).
  bag text not null default '',
  hand_size int not null check (hand_size between 1 and 30),
  created_at timestamptz not null default now()
);

create index bananagrams_games_club_handle_idx on bananagrams.games (club_handle);

-- ============================================================
-- bananagrams.player_boards — the private player board
-- ============================================================
-- One row per player, split by WHO OWNS each piece of state — the
-- key idea that lets PEEL hand a tile to every player at once
-- without write-conflicts (see docs/games/bananagrams.md → "The
-- player board"):
--
--   board   FE-OWNED. The fixed 25×25 arena: a flat 625-char
--           string, board[row*25 + col] = a letter or '.' (empty).
--           The player drags/types into it; it round-trips only via
--           save_player_board's debounced snapshot.
--   tiles   SERVER-OWNED. Every tile this player HOLDS — whether
--           sitting in their hand or already placed on the board.
--           Set at the deal, grown by PEEL, swapped by DUMP. The FE
--           never writes it.
--
-- The hand the player sees is DERIVED, never stored:
--   hand = tiles − (the letters already on the board).
-- That's the whole trick: peel only ever APPENDS to each player's
-- `tiles` (server-side, all players at once), while every FE is
-- independently editing its own `board` — the two writers never
-- touch the same column, so there's nothing to reconcile on the
-- server. Tiles are interchangeable by letter (no per-tile ids), so
-- both columns are plain strings, which also keeps a future
-- word/connectivity check a simple scan over the 2D char array.
--
-- This is the one table that breaks our "every club member reads
-- every game table" default: RLS restricts SELECT to the owner.
-- It's a competitive game, so peeking at a board is a real edge —
-- the public projection a peer is allowed to see lives on
-- `progress` instead.
--
-- IN the realtime publication (owner-scoped by RLS): a player
-- subscribes to their OWN row so a server-side `tiles` change (the
-- tile a peel/dump just dealt them) reaches the FE, which folds it
-- into the derived hand. Board snapshots echo back to the same
-- owner harmlessly — the FE reacts only to `tiles` changes.

create table bananagrams.player_boards (
  game_id uuid not null references bananagrams.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  board text not null,
  tiles text not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- ============================================================
-- bananagrams.progress — the public projection peers read
-- ============================================================
-- The club-visible counters derived from each player's board:
-- unplaced/placed tile counts + the solved flag. This is what the
-- peer strip and the winner surface read — the board itself stays
-- hidden on player_boards.
--
-- `unplaced` is the race signal (count ticking toward zero).
-- save_player_board recomputes these on every snapshot; the win
-- inside peel sets solved + finished_at on the winner.
--
-- The per-player DROP-OUT flag is NOT here — it lives on
-- `common.game_players.conceded` (the shared concede mechanism every
-- compete game uses; see common.concede). `peel` / `save_player_board`
-- read it from there to skip a dropped-out player, and the FE reads it
-- off `ctx.players`. The game stays 'playing' until a real terminal (a
-- peel-win, the timeout, or the LAST active player conceding).
--
-- In the realtime publication so a peer's count updates live.

create table bananagrams.progress (
  game_id uuid not null references bananagrams.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  unplaced int not null,
  placed int not null default 0,
  solved boolean not null default false,
  finished_at timestamptz,
  primary key (game_id, user_id)
);

-- ============================================================
-- RLS
-- ============================================================

alter table bananagrams.games         enable row level security;
alter table bananagrams.player_boards enable row level security;
alter table bananagrams.progress      enable row level security;

-- ============================================================
-- Realtime publication — progress + player_boards
-- ============================================================
-- progress broadcasts to the whole club: peers watch each other's
-- unplaced counts + the winner flag. player_boards broadcasts only
-- to its owner (owner-only RLS scopes the stream): the FE listens to
-- its own row so a peel/dump's `tiles` change reaches it. games is
-- immutable to the FE (its `bunch` mutates, but that's hidden and the
-- count rides on common.games.status instead).

alter publication supabase_realtime add table bananagrams.progress;
alter publication supabase_realtime add table bananagrams.player_boards;

-- ============================================================
-- Register bananagrams with common.gametypes
-- ============================================================
-- One row (compete-only, single manifest). Backfill
-- clubs_gametypes for every existing club — create_club handles
-- new clubs, but any club that exists before this migration needs
-- the row so its bananagrams Start button surfaces.

insert into common.gametypes (gametype, min_players) values
  ('bananagrams', 1)
on conflict do nothing;

-- bananagrams is solo-playable (min_players 1), so every club —
-- solo clubs included — gets the row.
insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'bananagrams' from common.clubs
on conflict do nothing;
