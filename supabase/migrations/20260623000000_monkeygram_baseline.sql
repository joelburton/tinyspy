-- ============================================================
-- monkeygram schema — baseline (v1)
-- ============================================================
--
-- MonkeyGram is a Bananagrams clone: a real-time, competitive
-- word-tile race. Each player builds their own **player board**
-- (a private crossword) from a hand of letter tiles. v1 is the
-- full game minus the bank loop and the validator:
--
--   - Each player is dealt a fixed STARTER HAND at game start.
--     No bank draw during play (no peel/dump yet).
--   - Players build privately; peers see only an unplaced-tile
--     COUNT, never each other's boards.
--   - First to place all their tiles and hit "Done" wins — the
--     server checks only "hand empty", with NO word/connectivity
--     validation in v1.
--
-- See docs/games/monkeygram.md for the full plan, the keyboard
-- rules, and what v1 sets up for the full game.
--
-- The state split is the design's spine — three visibility
-- classes, three handlings:
--
--   monkeygram.games          club-readable header (seed hidden)
--   monkeygram.player_boards  the private grid — OWNER-ONLY read
--   monkeygram.progress       the public projection — club read
--
-- The player board is NOT mutated per drag through an RPC; it's
-- FE scratch state snapshotted to player_boards.state (Phase 2's
-- save_player_board). This baseline only deals the starter hands
-- and stands up the schema; the snapshot + declare_done RPCs land
-- in later phases.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- gametypes, is_club_member, create_game). Per the removability
-- invariant, common MUST NOT reference monkeygram back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists monkeygram;
grant usage on schema monkeygram to authenticated;

-- ============================================================
-- monkeygram.games — one row per playing
-- ============================================================
-- `seed` is the deterministic shuffle source for the tile bag.
-- It is SENSITIVE: the deal is "shuffle the 144-tile bag by seed,
-- hand the first hand_size tiles to player 1, the next to player
-- 2, …" — so knowing the seed reconstructs every opponent's
-- starting hand. The column-level grant below excludes `seed`
-- from authenticated SELECT (same hidden-column pattern as
-- psychicnum.games.target). RPCs run SECURITY DEFINER and read it
-- freely; the FE never needs it (the server deals).
--
-- Storing the seed (rather than the dealt letters) is also what
-- lets the full game's PEEL draw the next tile later: the bag is a
-- fixed shuffle, so position hand_size × N_players onward is the
-- undrawn remainder a future draw cursor reads from.
--
-- club_handle is denormalized from common.games.club_handle so
-- the RLS policies (and progress's policy) can call
-- is_club_member(club_handle) without joining common.games.

create table monkeygram.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  seed double precision not null,
  hand_size int not null check (hand_size between 1 and 30),
  created_at timestamptz not null default now()
);

create index monkeygram_games_club_handle_idx on monkeygram.games (club_handle);

-- ============================================================
-- monkeygram.player_boards — the private player board
-- ============================================================
-- One row per player. `state` is the whole board as the FE models
-- it (see docs/games/monkeygram.md → "The player board"):
--
--   { "board": "....C....", "hand": "AAQ" }
--
-- The board is a FIXED 25×25 arena: a flat GRID*GRID = 625-char
-- string, board[row*25 + col] = a letter or '.' (empty). The hand
-- is a string of the player's unplaced letters. Tiles are
-- interchangeable by letter — no per-tile ids — so both are just
-- strings, which is also what makes word/connectivity validation
-- (later) a simple scan over a 2D char array.
--
-- This is the one table that breaks our "every club member reads
-- every game table" default: RLS restricts SELECT to the owner.
-- It's a competitive game, so peeking at a board is a real edge —
-- the public projection a peer is allowed to see lives on
-- `progress` instead.
--
-- NOT in the realtime publication: only the owner reads or writes
-- their own board, so there's nothing to broadcast to peers.

create table monkeygram.player_boards (
  game_id uuid not null references monkeygram.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

-- ============================================================
-- monkeygram.progress — the public projection peers read
-- ============================================================
-- The club-visible counters derived from each player's board:
-- unplaced/placed tile counts + the done flag. This is what the
-- peer strip and the winner surface read — the board itself stays
-- hidden on player_boards.
--
-- `unplaced` is the race signal (count ticking toward zero).
-- save_player_board (Phase 2) recomputes these on every snapshot;
-- declare_done (Phase 4) sets done + finished_at on the winner.
--
-- In the realtime publication so a peer's count updates live.

create table monkeygram.progress (
  game_id uuid not null references monkeygram.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  unplaced int not null,
  placed int not null default 0,
  done boolean not null default false,
  finished_at timestamptz,
  primary key (game_id, user_id)
);

-- ============================================================
-- RLS
-- ============================================================

alter table monkeygram.games         enable row level security;
alter table monkeygram.player_boards enable row level security;
alter table monkeygram.progress      enable row level security;

-- Games: any club member sees the row (`seed` is additionally
-- column-hidden, regardless of policy).
create policy games_select on monkeygram.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Player boards: OWNER ONLY. A club member who isn't this row's
-- owner cannot read another player's board — the competitive
-- visibility rule, enforced at the row level.
create policy player_boards_select on monkeygram.player_boards
  for select to authenticated
  using (user_id = auth.uid());

-- Progress: club-wide. Peers read each other's counts (but not
-- boards). Branches through the parent game's club_handle.
create policy progress_select on monkeygram.progress
  for select to authenticated
  using (
    exists (
      select 1 from monkeygram.games g
       where g.id = progress.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- Grants — `seed` is column-excluded
-- ============================================================

grant select
  (id, club_handle, hand_size, created_at)
  on monkeygram.games to authenticated;

grant select on monkeygram.player_boards to authenticated;
grant select on monkeygram.progress to authenticated;

-- ============================================================
-- Realtime publication — progress only
-- ============================================================
-- Only `progress` broadcasts: peers watch each other's unplaced
-- counts + the winner flag. Player boards are private + loaded
-- once (no peer subscribes); games is immutable after create.

alter publication supabase_realtime add table monkeygram.progress;

-- ============================================================
-- monkeygram.create_game(target_club, setup, player_user_ids)
-- ============================================================
-- Compete-only, single gametype 'monkeygram' (no mode parameter —
-- there's no coop sibling, like tinyspy). Solo (1 player) is
-- allowed: a one-player race is just "finish your own tiles."
--
-- Setup shape:
--   { "hand_size": 15 | 21,
--     "timer": { "kind": "none" } }
--
-- (v1 ships untimed; the timer field is carried so the common
-- timer machinery has something to read and a later version can
-- offer a count-up.)
--
-- The deal: build the 144-tile Bananagrams bag, shuffle it
-- deterministically by a freshly-picked seed, and hand each player a
-- contiguous slice of hand_size letters as their starting hand
-- string. The slice positions are fixed by the seed, so the undrawn
-- remainder (position N_players × hand_size onward) is what a future
-- peel draws from.

create function monkeygram.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[]
)
returns table(id uuid)
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  new_id uuid;
  s_hand_size int;
  s_seed double precision;
  bag_text text;
  letters text[];
  shuffled text[];
  player_count int;
begin
  -- ─── Player count: 1..6 (solo allowed — see header) ──
  -- MUST AGREE with numberOfPlayers: [1, 6] in
  -- src/monkeygram/manifest.ts. See docs/code-conventions.md →
  -- "Per-game player counts".
  perform common.require_player_count_max(player_user_ids, 6);
  player_count := coalesce(array_length(player_user_ids, 1), 0);

  -- ─── Validate setup shape ────────────────────────────
  if (setup->>'hand_size') is null then
    raise exception 'setup.hand_size is required' using errcode = 'P0001';
  end if;
  s_hand_size := (setup->>'hand_size')::int;
  if s_hand_size not in (15, 21) then
    raise exception 'setup.hand_size must be 15 or 21 (got %)', s_hand_size
      using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Build the 144-tile Bananagrams bag ──────────────
  -- Standard letter distribution. string_to_array(_, NULL)
  -- splits the concatenated string into one element per char.
  bag_text :=
    repeat('A', 13) || repeat('B', 3)  || repeat('C', 3)  || repeat('D', 6)  ||
    repeat('E', 18) || repeat('F', 3)  || repeat('G', 4)  || repeat('H', 3)  ||
    repeat('I', 12) || repeat('J', 2)  || repeat('K', 2)  || repeat('L', 5)  ||
    repeat('M', 3)  || repeat('N', 8)  || repeat('O', 11) || repeat('P', 3)  ||
    repeat('Q', 2)  || repeat('R', 9)  || repeat('S', 6)  || repeat('T', 9)  ||
    repeat('U', 6)  || repeat('V', 3)  || repeat('W', 3)  || repeat('X', 2)  ||
    repeat('Y', 3)  || repeat('Z', 2);
  letters := string_to_array(bag_text, NULL);

  if player_count * s_hand_size > array_length(letters, 1) then
    raise exception 'not enough tiles to deal % to % players',
      s_hand_size, player_count using errcode = 'P0001';
  end if;

  -- ─── Deterministic shuffle by a stored seed ──────────
  -- Pick a fresh seed (the first random() uses the ambient
  -- session seed), then setseed() makes the shuffle reproducible
  -- FROM that stored seed. setseed wants a double in [-1, 1].
  s_seed := random() * 2 - 1;
  perform setseed(s_seed);
  select array_agg(ch order by random()) into shuffled
    from unnest(letters) as ch;

  -- ─── Common header + gametype rows ───────────────────
  new_id := common.create_game(
    target_club, 'monkeygram', player_user_ids,
    'MonkeyGram',
    setup,
    setup
  );

  insert into monkeygram.games (id, club_handle, seed, hand_size)
  values (new_id, target_club, s_seed, s_hand_size);

  -- Deal: player at ordinality `pi` (1-based) gets the slice
  -- shuffled[(pi-1)*hs + 1 .. pi*hs] as their starting hand string.
  -- The board starts empty — a 25×25 = 625-char string of '.'.
  insert into monkeygram.player_boards (game_id, user_id, state)
  select
    new_id,
    pu.uid,
    jsonb_build_object(
      'board', repeat('.', 25 * 25),
      'hand', (
        select string_agg(shuffled[gidx], '' order by gidx)
          from generate_series((pu.pi - 1) * s_hand_size + 1, pu.pi * s_hand_size) as gidx
      )
    )
  from unnest(player_user_ids) with ordinality as pu(uid, pi);

  insert into monkeygram.progress (game_id, user_id, unplaced, placed, done)
  select new_id, uid, s_hand_size, 0, false
    from unnest(player_user_ids) as uid;

  return query select new_id;
end;
$$;

revoke execute on function monkeygram.create_game(text, jsonb, uuid[]) from public;
grant execute on function monkeygram.create_game(text, jsonb, uuid[]) to authenticated;

-- ============================================================
-- Register monkeygram with common.gametypes
-- ============================================================
-- One row (compete-only, single manifest). Backfill
-- clubs_gametypes for every existing club — create_club handles
-- new clubs, but any club that exists before this migration needs
-- the row so its MonkeyGram Start button surfaces.

insert into common.gametypes (gametype) values
  ('monkeygram')
on conflict do nothing;

insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'monkeygram' from common.clubs
on conflict do nothing;
