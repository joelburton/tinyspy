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
--   monkeygram.games          club-readable header (pool hidden)
--   monkeygram.player_boards  the private grid — OWNER-ONLY read
--   monkeygram.progress       the public projection — club read
--
-- Within player_boards, a second split (board = FE-owned, tiles =
-- server-owned, hand = derived) is what lets peel/dump grow every
-- player's holdings without colliding with live FE placement — see
-- that table's comment.
--
-- The board is NOT mutated per drag through an RPC; it's FE scratch
-- state snapshotted to player_boards.board (save_player_board).
-- This baseline deals the starter hands, materializes the bunch, and
-- stands up the schema; the snapshot, peel, dump, and declare_done
-- RPCs land in their own migrations.
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
-- `pool` is the live "bunch": every tile not currently held by a
-- player. It starts as the undealt remainder of the shuffled
-- 144-tile bag and MUTATES during play — PEEL draws from it (one
-- tile per player), DUMP swaps with it (return one, draw three).
-- It is SENSITIVE: the contents/order are the upcoming draws, so
-- the column-level grant below EXCLUDES `pool` from authenticated
-- SELECT (same hidden-column pattern as psychicnum.games.target).
-- RPCs run SECURITY DEFINER and read it freely; the FE only ever
-- learns the pool's COUNT (surfaced via the live status the
-- peel/dump RPCs write).
--
-- The deal shuffles the bag with a throwaway seed; once `pool` is
-- materialized it's the sole authority (dump returns tiles into it,
-- so a fixed seed could no longer describe it), so the seed isn't
-- stored.
--
-- club_handle is denormalized from common.games.club_handle so
-- the RLS policies (and progress's policy) can call
-- is_club_member(club_handle) without joining common.games.

create table monkeygram.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  pool text not null,
  hand_size int not null check (hand_size between 1 and 30),
  created_at timestamptz not null default now()
);

create index monkeygram_games_club_handle_idx on monkeygram.games (club_handle);

-- ============================================================
-- monkeygram.player_boards — the private player board
-- ============================================================
-- One row per player, split by WHO OWNS each piece of state — the
-- key idea that lets PEEL hand a tile to every player at once
-- without write-conflicts (see docs/games/monkeygram.md → "The
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

create table monkeygram.player_boards (
  game_id uuid not null references monkeygram.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  board text not null,
  tiles text not null,
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

-- Games: any club member sees the row (`pool` is additionally
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
-- Grants — `pool` is column-excluded
-- ============================================================

grant select
  (id, club_handle, hand_size, created_at)
  on monkeygram.games to authenticated;

grant select on monkeygram.player_boards to authenticated;
grant select on monkeygram.progress to authenticated;

-- ============================================================
-- Realtime publication — progress + player_boards
-- ============================================================
-- progress broadcasts to the whole club: peers watch each other's
-- unplaced counts + the winner flag. player_boards broadcasts only
-- to its owner (owner-only RLS scopes the stream): the FE listens to
-- its own row so a peel/dump's `tiles` change reaches it. games is
-- immutable to the FE (its `pool` mutates, but that's hidden and the
-- count rides on common.games.status instead).

alter publication supabase_realtime add table monkeygram.progress;
alter publication supabase_realtime add table monkeygram.player_boards;

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
-- The deal: build the 144-tile Bananagrams bag, shuffle it with a
-- throwaway seed, and hand each player a contiguous slice of
-- hand_size letters as their starting `tiles` string. Everything
-- past the dealt slices becomes the `pool` (the bunch) that peel and
-- dump later draw from. Each player's `board` starts empty.

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
  bag_text text;
  letters text[];
  shuffled text[];
  player_count int;
  s_pool text;
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

  -- ─── Shuffle the bag (throwaway seed) ────────────────
  -- A fresh seed makes the shuffle order unpredictable; we don't
  -- store it (the materialized `pool` below is the authority, and
  -- dump mutates it past anything a seed could describe). setseed
  -- wants a double in [-1, 1].
  perform setseed(random() * 2 - 1);
  select array_agg(ch order by random()) into shuffled
    from unnest(letters) as ch;

  -- ─── Common header + gametype rows ───────────────────
  new_id := common.create_game(
    target_club, 'monkeygram', player_user_ids,
    'MonkeyGram',
    setup,
    setup
  );

  -- The bunch = every tile past the dealt slices
  -- (shuffled[player_count*hand_size + 1 ..]). coalesce to '' for the
  -- degenerate "exact deal, nothing left over" case so NOT NULL holds.
  s_pool := coalesce(
    (select string_agg(shuffled[gidx], '' order by gidx)
       from generate_series(player_count * s_hand_size + 1,
                            array_length(shuffled, 1)) as gidx),
    ''
  );
  insert into monkeygram.games (id, club_handle, pool, hand_size)
  values (new_id, target_club, s_pool, s_hand_size);

  -- Deal: player at ordinality `pi` (1-based) gets the slice
  -- shuffled[(pi-1)*hs + 1 .. pi*hs] as their starting `tiles`
  -- (everything they hold; nothing placed yet). The board starts
  -- empty — a 25×25 = 625-char string of '.'.
  insert into monkeygram.player_boards (game_id, user_id, board, tiles)
  select
    new_id,
    pu.uid,
    repeat('.', 25 * 25),
    (
      select string_agg(shuffled[gidx], '' order by gidx)
        from generate_series((pu.pi - 1) * s_hand_size + 1, pu.pi * s_hand_size) as gidx
    )
  from unnest(player_user_ids) with ordinality as pu(uid, pi);

  insert into monkeygram.progress (game_id, user_id, unplaced, placed, done)
  select new_id, uid, s_hand_size, 0, false
    from unnest(player_user_ids) as uid;

  -- Surface the bunch COUNT to the FE: `pool` itself is hidden, so the count
  -- rides on common.games.status (which the FE already reads live). peel/dump
  -- keep it current as the bunch shrinks.
  perform common.update_state(new_id, 'playing',
    jsonb_build_object('pool_remaining', length(s_pool)));

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
-- ============================================================
-- monkeygram.save_player_board — snapshot the private board
-- ============================================================
--
-- The board is high-frequency, PRIVATE scratch state (drag a tile,
-- place a letter — many times a second). It does NOT round-trip per
-- move; the FE owns it as local state and snapshots the whole grid
-- here on a debounce + when the board component unmounts (which, per
-- docs/games/monkeygram.md, is what makes pause/navigate/shelve
-- durable — PauseBoundary UNMOUNTS the play area, so an un-snapshotted
-- board would be lost).
--
-- Only `board` is sent. The player's `tiles` (everything they hold)
-- is SERVER-owned — set at the deal, grown by peel, swapped by dump —
-- and the snapshot never touches it. The hand the player sees is
-- derived FE-side as `tiles − placed`; here we just recompute the
-- public `progress` counts peers watch from the same relationship:
--   placed   = filled (non-'.') board cells
--   unplaced = held tiles not yet placed = length(tiles) − placed
--
-- Trust model: the board is private and unvalidated in v1, so we
-- persist it as-handed. We do NOT check the placed letters are a
-- subset of `tiles` (no injected/relettered tiles) — friends-alpha.
-- `unplaced` is clamped at 0 so a buggy/cheating client can't show a
-- negative count.
--
-- Terminal games are a no-op: a late unmount-snapshot arriving after
-- someone has won shouldn't clobber the final board.

create function monkeygram.save_player_board(target_game uuid, board text)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  is_term boolean;
  n_tiles int;
  n_placed int;
begin
  caller_id := common.require_game_player(target_game);

  select is_terminal into is_term from common.games where id = target_game;
  if is_term is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if is_term then
    return; -- harmless no-op after game-over
  end if;

  if length(board) <> 25 * 25 then
    raise exception 'board must be a 625-char string' using errcode = 'P0001';
  end if;

  update monkeygram.player_boards
     set board = save_player_board.board,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  -- tiles is unchanged by this call; read it back to recompute counts.
  select length(tiles) into n_tiles
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  n_placed := length(replace(board, '.', ''));

  update monkeygram.progress
     set unplaced = greatest(n_tiles - n_placed, 0),
         placed = n_placed
   where game_id = target_game and user_id = caller_id;
end;
$$;

revoke execute on function monkeygram.save_player_board(uuid, text) from public;
grant execute on function monkeygram.save_player_board(uuid, text) to authenticated;
-- ============================================================
-- monkeygram.peel — draw a round, or go out (Bananas!)
-- ============================================================
--
-- The heart of v2. A player who has placed every tile they hold (empty hand)
-- clicks "Peel". Two outcomes, decided by whether the bunch can refill the
-- whole table:
--
--   - Enough tiles (pool >= players × peel_count): EVERY player draws
--     peel_count from the bunch and the game continues. (Yes — everyone draws,
--     not just the peeler; that's the threshold's shape.)
--   - Not enough: the peeler goes out and WINS — the Bananagrams endgame.
--
-- v1's declare_done is gone: "place your last tile and the bunch is dry" IS
-- the win condition now, so peel subsumes it.
--
-- peel_count comes from setup (default 1) — a future setup option can make it
-- 2 without touching this logic. There is NO board/word validation in v2; the
-- only gate is "hand empty" (placed == length(tiles)), trusting the FE flushed
-- its latest board first.
--
-- Race-safety: lock the gametype row up front so two simultaneous peels
-- serialize. The first either ends the game or advances the pool; the second
-- then sees the new state (a non-'playing' game, or a smaller pool) and acts on
-- it. Without the lock two peelers could both draw from the same pool slice.

create function monkeygram.peel(target_game uuid)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  n_tiles int;
  n_placed int;
  s_peel_count int;
  s_pool text;
  player_count int;
  needed int;
  winner_name text;
  player_results jsonb;
begin
  -- Serialize concurrent peels on the gametype row (see header).
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup into current_play_state, s_setup
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- Gate: the caller's hand must be empty (every held tile placed).
  select length(tiles), length(replace(board, '.', ''))
    into n_tiles, n_placed
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  if n_tiles is null then
    raise exception 'no board for caller' using errcode = 'P0002';
  end if;
  if n_placed <> n_tiles then
    raise exception 'your hand is not empty' using errcode = 'P0001';
  end if;

  s_peel_count := greatest(coalesce((s_setup->>'peel_count')::int, 1), 1);
  select pool into s_pool from monkeygram.games where id = target_game;
  select count(*)::int into player_count
    from common.game_players where game_id = target_game;
  needed := player_count * s_peel_count;

  -- ─── Not enough to refill the table → the peeler goes out (win) ───
  if length(s_pool) < needed then
    update monkeygram.progress
       set done = true, finished_at = now()
     where game_id = target_game and user_id = caller_id;

    select username into winner_name
      from common.profiles where user_id = caller_id;

    select jsonb_object_agg(
             user_id::text,
             case when user_id = caller_id
                  then '{"won": true}'::jsonb
                  else '{"won": false}'::jsonb
             end)
      into player_results
      from common.game_players where game_id = target_game;

    perform common.end_game(
      target_game,
      'won',
      jsonb_build_object('outcome', 'won', 'winner_username', winner_name,
                         'pool_remaining', length(s_pool)),
      player_results
    );
    return;
  end if;

  -- ─── Enough → every player draws peel_count from the front of the bunch ───
  -- Player at rank `pi` (1-based, stable order) takes the slice
  -- s_pool[(pi-1)*peel_count + 1 .. peel_count]; the total drawn is `needed`.
  with ranked as (
    select user_id, row_number() over (order by user_id) as pi
      from common.game_players where game_id = target_game
  )
  update monkeygram.player_boards pb
     set tiles = pb.tiles || substr(s_pool, ((r.pi - 1) * s_peel_count + 1)::int, s_peel_count),
         updated_at = now()
    from ranked r
   where pb.game_id = target_game and pb.user_id = r.user_id;

  -- Each player's unplaced count grows by what they just drew (placed is
  -- unchanged by a peel).
  update monkeygram.progress
     set unplaced = unplaced + s_peel_count
   where game_id = target_game;

  -- Advance the bunch past the drawn tiles.
  update monkeygram.games
     set pool = substr(s_pool, needed + 1)
   where id = target_game;

  -- Keep the FE's bunch count current.
  perform common.update_state(target_game, 'playing',
    jsonb_build_object('pool_remaining', length(s_pool) - needed));
end;
$$;

revoke execute on function monkeygram.peel(uuid) from public;
grant execute on function monkeygram.peel(uuid) to authenticated;
-- ============================================================
-- monkeygram.dump — swap one tile for three from the bunch
-- ============================================================
--
-- A player stuck with an awkward tile (a Q, a lone consonant) trades it: the
-- dumped tile goes back into the bunch and they draw dump_count (default 3) in
-- return — a net +2 to the hand, the cost of getting unstuck.
--
-- Two guarantees from the rules:
--   - You can't dump if the bunch can't cover the draw (length(pool) <
--     dump_count). The dumped tile is returned only AFTER the draw, so it can
--     never refill its own swap.
--   - You won't draw back the SAME tile: we draw from the FRONT of the pool and
--     append the dumped tile to the BACK. (You might draw the same LETTER if
--     another copy was near the front — that's allowed.)
--
-- dump_count comes from setup (default 3) — a future setup option can change it
-- without touching this logic. No board/word validation (v2 trust model); the
-- only check is that the caller actually holds the tile they're dumping.
--
-- Locks the gametype row so a dump and a concurrent peel serialize on the
-- shared pool (both draw from the front).

create function monkeygram.dump(target_game uuid, tile text)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  s_dump_count int;
  s_pool text;
  caller_tiles text;
  drawn text;
  pos int;
begin
  -- Serialize against concurrent peels/dumps on the shared pool.
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup into current_play_state, s_setup
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  tile := upper(tile);
  if tile !~ '^[A-Z]$' then
    raise exception 'tile must be a single letter' using errcode = 'P0001';
  end if;

  s_dump_count := greatest(coalesce((s_setup->>'dump_count')::int, 3), 1);

  select pool into s_pool from monkeygram.games where id = target_game;
  if length(s_pool) < s_dump_count then
    raise exception 'not enough tiles in the bunch to dump' using errcode = 'P0001';
  end if;

  -- The caller must hold the tile they're dumping.
  select tiles into caller_tiles
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  pos := position(tile in caller_tiles);
  if pos = 0 then
    raise exception 'you do not hold that tile' using errcode = 'P0001';
  end if;

  -- Draw dump_count from the FRONT; the dumped tile returns to the BACK.
  drawn := substr(s_pool, 1, s_dump_count);

  update monkeygram.player_boards
     set tiles = overlay(caller_tiles placing '' from pos for 1) || drawn,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  update monkeygram.games
     set pool = substr(s_pool, s_dump_count + 1) || tile
   where id = target_game;

  -- Held grew by dump_count − 1 (placed unchanged), so unplaced does too.
  update monkeygram.progress
     set unplaced = unplaced + (s_dump_count - 1)
   where game_id = target_game and user_id = caller_id;

  -- Pool net change: −dump_count drawn + 1 returned.
  perform common.update_state(target_game, 'playing',
    jsonb_build_object('pool_remaining', length(s_pool) - s_dump_count + 1));
end;
$$;

revoke execute on function monkeygram.dump(uuid, text) from public;
grant execute on function monkeygram.dump(uuid, text) to authenticated;
