-- ============================================================
-- monkeygram schema — baseline (squashed)
-- ============================================================
--
-- MonkeyGram is a Bananagrams clone: a real-time, competitive
-- word-tile race. Each player builds their own **player board**
-- (a private crossword) from a hand of letter tiles, drawing more
-- from a shared bank as they go:
--
--   - Each player is dealt a STARTER HAND at game start; the
--     leftover bag is the shared "bunch" (games.pool, hidden).
--   - Players build privately; peers see only an unplaced-tile
--     COUNT, never each other's boards.
--   - When your hand empties you PEEL: everyone draws a round, or
--     — if the bunch can't refill the table — you go out and win.
--     DUMP swaps one awkward tile for three from the bunch. There
--     is NO word/connectivity validation (we trust the friends).
--
-- All RPCs live INLINE in this one squashed baseline file —
-- create_game, save_player_board, peel, dump, end_game (this is
-- an alpha repo, so baselines are edited in place rather than
-- accreting per-RPC migrations; see CLAUDE.md). The intrinsic
-- win is detected inside `peel`; `end_game` is the manual stop.
--
-- See docs/games/monkeygram.md for the full plan, the keyboard
-- rules, and the bank loop.
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
-- This single file stands up the schema and ALL its RPCs: create_game
-- deals the starter hands and materializes the bunch; save_player_board
-- snapshots the board; peel draws a round / goes out to win; dump swaps
-- a tile; end_game is the manual stop.
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
  -- `bag` is the IMMUTABLE record of the shuffled bag this game was dealt
  -- from: the full tile sequence (length = the chosen bag size, ≤ 144),
  -- hands-then-bunch in deal order. Set once at create_game and never
  -- written again. `pool` (below) is the live remainder that mutates; this
  -- is what a future "restart game" re-deals from. Hidden from the FE for
  -- the same reason as `pool` — it carries the bunch order, which would let
  -- a player predict peels (the column grant below omits it).
  bag text not null,
  -- `pool` is the live "bunch": every tile not currently held by a player.
  -- Starts as the undealt suffix of `bag` and MUTATES during play.
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
-- save_player_board recomputes these on every snapshot; the win
-- inside peel sets done + finished_at on the winner.
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
-- Grants — `pool` and `bag` are column-excluded
-- ============================================================
-- The whitelist omits both `pool` (live bunch) and `bag` (the initial
-- shuffled sequence) — either would let a player predict upcoming peels.

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
  s_bag_size int;
  s_check_legal boolean;
  s_dictionary int;
  bag_text text;
  letters text[];
  shuffled text[];
  player_count int;
  s_bag text;
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

  -- bag_size: how many tiles to draw from the 144-tile set for this game.
  -- ≤ 144 (the full Bananagrams bag); smaller = a shorter game on a random
  -- subset. MUST be ≥ player_count × hand_size or the deal can't be made —
  -- the FE disables Start on the same check (see monkeygram bagSizeError),
  -- but the server is the authority.
  if (setup->>'bag_size') is null then
    raise exception 'setup.bag_size is required' using errcode = 'P0001';
  end if;
  s_bag_size := (setup->>'bag_size')::int;
  if s_bag_size < 1 or s_bag_size > 144 then
    raise exception 'setup.bag_size must be between 1 and 144 (got %)', s_bag_size
      using errcode = 'P0001';
  end if;
  if player_count * s_hand_size > s_bag_size then
    raise exception 'not enough tiles: % players × % = % needed, bag holds %',
      player_count, s_hand_size, player_count * s_hand_size, s_bag_size
      using errcode = 'P0001';
  end if;

  -- check_legal (optional, default off): when on, a winning peel validates the
  -- board against the dictionary (see peel + _win_blockers). dictionary is the
  -- obscurity ceiling, 2..6 (common.words difficulty), required only when the
  -- check is on.
  s_check_legal := coalesce((setup->>'check_legal')::boolean, false);
  if s_check_legal then
    if (setup->>'dictionary') is null then
      raise exception 'setup.dictionary is required when check_legal is on'
        using errcode = 'P0001';
    end if;
    s_dictionary := (setup->>'dictionary')::int;
    if s_dictionary < 2 or s_dictionary > 6 then
      raise exception 'setup.dictionary must be between 2 and 6 (got %)', s_dictionary
        using errcode = 'P0001';
    end if;
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Build the bag: shuffle the 144-tile set, take bag_size ──
  -- Standard Bananagrams letter distribution. string_to_array(_, NULL)
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

  -- A fresh seed makes the shuffle order unpredictable. setseed wants a
  -- double in [-1, 1]. Truncating the shuffled 144 to bag_size yields a
  -- uniformly random subset (and a random order) for the smaller game.
  perform setseed(random() * 2 - 1);
  select array_agg(ch order by random()) into shuffled
    from unnest(letters) as ch;
  shuffled := shuffled[1:s_bag_size];

  -- The immutable bag of record (hands-then-bunch, in deal order). A future
  -- "restart" re-deals from this exact sequence.
  s_bag := array_to_string(shuffled, '');

  -- ─── Common header + gametype rows ───────────────────
  new_id := common.create_game(
    target_club, 'monkeygram', player_user_ids,
    'MonkeyGram',
    setup,
    setup
  );

  -- The bunch = every tile past the dealt slices
  -- (shuffled[player_count*hand_size + 1 .. bag_size]). coalesce to '' for
  -- the degenerate "exact deal, nothing left over" case so NOT NULL holds.
  s_pool := coalesce(
    (select string_agg(shuffled[gidx], '' order by gidx)
       from generate_series(player_count * s_hand_size + 1, s_bag_size) as gidx),
    ''
  );
  insert into monkeygram.games (id, club_handle, bag, pool, hand_size)
  values (new_id, target_club, s_bag, s_pool, s_hand_size);

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

insert into common.gametypes (gametype, min_players) values
  ('monkeygram', 1)
on conflict do nothing;

-- monkeygram is solo-playable (min_players 1), so every club —
-- solo clubs included — gets the row.
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
-- monkeygram._win_blockers — board legality (optional, opt-in)
-- ============================================================
-- Returns the 0-indexed cells that block a legal win, or an empty array if the
-- board is a valid Bananagrams grid. Used by peel ONLY when the game's setup
-- has check_legal on. A board is legal when:
--   1. every filled tile is in ONE 4-connected mass (orthogonal only — a
--      diagonal touch does NOT connect), and
--   2. every run of 2+ tiles (across and down) spells a real word — one in
--      common.words at difficulty ≤ max_difficulty. Single tiles aren't words,
--      so they're never checked against the dictionary.
-- The blockers are the union of: tiles NOT in the main mass (the flood-fill
-- from the top-left-most tile — so disconnected stragglers light up) and every
-- tile of an invalid word. The FE paints these red until the player edits.
--
-- Plain `language sql` (not security definer): it reads only common.words
-- (granted to all) off the `board` text it's handed, so it runs fine inside
-- peel's definer context with nothing extra to leak.
create function monkeygram._win_blockers(board text, max_difficulty int)
returns int[]
language sql
stable
set search_path = monkeygram, common, public, extensions
as $$
  with recursive filled as (
    select i - 1 as cidx, (i - 1) / 25 as r, (i - 1) % 25 as c
      from generate_series(1, 625) as i
     where substr(board, i, 1) <> '.'
  ),
  -- Flood-fill the connected mass from the lowest-index tile (4-adjacency:
  -- Manhattan distance 1 — never diagonal).
  flood as (
    select cidx, r, c from filled where cidx = (select min(cidx) from filled)
    union
    select f.cidx, f.r, f.c
      from filled f
      join flood fl on abs(f.r - fl.r) + abs(f.c - fl.c) = 1
  ),
  disconnected as (
    select cidx from filled
    except
    select cidx from flood
  ),
  -- Words across: group consecutive cells in a row (gaps-and-islands on
  -- c − row_number()); a group of 2+ is a word.
  hgroups as (
    select cidx, c, substr(board, cidx + 1, 1) as ch,
           c - row_number() over (partition by r order by c) as grp, r
      from filled
  ),
  hwords as (
    select array_agg(cidx order by c) as cells, string_agg(ch, '' order by c) as word
      from hgroups group by r, grp having count(*) >= 2
  ),
  -- Words down: same trick, partitioned by column.
  vgroups as (
    select cidx, r, substr(board, cidx + 1, 1) as ch,
           r - row_number() over (partition by c order by r) as grp, c
      from filled
  ),
  vwords as (
    select array_agg(cidx order by r) as cells, string_agg(ch, '' order by r) as word
      from vgroups group by c, grp having count(*) >= 2
  ),
  bad_word_cells as (
    select unnest(cells) as cidx
      from (select cells, word from hwords union all select cells, word from vwords) w
     where not exists (
       select 1 from common.words cw
        where cw.word = lower(w.word) and cw.difficulty <= max_difficulty
     )
  )
  select coalesce(
    (select array_agg(distinct cidx order by cidx)
       from (select cidx from disconnected
             union
             select cidx from bad_word_cells) u),
    '{}'::int[]
  );
$$;

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
-- This is the game's only intrinsic terminal: "place your last tile and the
-- bunch is dry" IS the win condition, detected right here in peel (there is no
-- separate "declare done" move — only the manual end_game stop below).
--
-- peel_count comes from setup (default 1) — a future setup option can make it
-- 2 without touching this logic. The base gate is "hand empty" (placed ==
-- length(tiles)), trusting the FE flushed its latest board first.
--
-- **Optional word check.** If setup.check_legal is on, a WINNING peel (bunch
-- can't refill) additionally validates the board via _win_blockers: it only
-- ends the game if the grid is one connected mass of real words. Otherwise it
-- leaves the game in progress and returns the offending cells so the FE can
-- paint them red. (A continuing peel — bunch can refill — is never validated;
-- you're not winning yet.) Off → the classic trust-the-friends behavior.
--
-- Returns jsonb so the FE can react to a blocked win:
--   { result: 'won' | 'dealt' | 'illegal', invalid_cells: int[] }
--
-- Race-safety: lock the gametype row up front so two simultaneous peels
-- serialize. The first either ends the game or advances the pool; the second
-- then sees the new state (a non-'playing' game, or a smaller pool) and acts on
-- it. Without the lock two peelers could both draw from the same pool slice.

create function monkeygram.peel(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  v_board text;
  n_tiles int;
  n_placed int;
  s_peel_count int;
  s_pool text;
  player_count int;
  needed int;
  winner_name text;
  player_results jsonb;
  v_check_legal boolean;
  v_dictionary int;
  v_blockers int[];
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
  select board, length(tiles), length(replace(board, '.', ''))
    into v_board, n_tiles, n_placed
    from monkeygram.player_boards
   where game_id = target_game and user_id = caller_id;
  if v_board is null then
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
    -- Optional word check: only the WINNING peel is validated. If the board
    -- isn't a legal Bananagrams grid, don't end the game — hand the FE the
    -- offending cells to paint red and let the player fix + re-peel.
    v_check_legal := coalesce((s_setup->>'check_legal')::boolean, false);
    if v_check_legal then
      v_dictionary := coalesce((s_setup->>'dictionary')::int, 4);
      v_blockers := monkeygram._win_blockers(v_board, v_dictionary);
      if array_length(v_blockers, 1) > 0 then
        return jsonb_build_object('result', 'illegal',
                                  'invalid_cells', to_jsonb(v_blockers));
      end if;
    end if;

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
    return jsonb_build_object('result', 'won', 'invalid_cells', '[]'::jsonb);
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

  return jsonb_build_object('result', 'dealt', 'invalid_cells', '[]'::jsonb);
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
-- ============================================================
-- monkeygram.submit_timeout — countdown expiry (everyone loses)
-- ============================================================
--
-- Fired by GamePage when a chosen countdown hits 0 before anyone goes
-- out. MonkeyGram is a race, so time expiring with no winner is a
-- COLLECTIVE loss: every player's result is {"won": false}, same shape
-- as the manual end_game stop but framed as a loss, not a neutral quit.
-- Modeled on stackdown.submit_timeout's compete branch.
--
-- Shape vs. the other terminals:
--   - play_state 'lost' — everyone lost (distinct from 'won' = a
--     peel-win, and 'ended' = the neutral manual stop)
--   - status.outcome 'timeout'; NO winner_username, so the PlayArea
--     renders a no-winner "Time's up" loss for all
--
-- Idempotent on the in-progress check: a second caller, or a click
-- racing a real peel-win, raises P0001 — which the manifest swallows.
create function monkeygram.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  current_play_state text;
  player_results jsonb;
begin
  -- Lock the gametype row so the timeout and a concurrent peel-win
  -- serialize — only one of them writes the terminal state.
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Everyone {"won": false}: time ran out with nobody going out.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'lost',
    jsonb_build_object('outcome', 'timeout'),
    player_results
  );

  -- Realtime touch — same trick as monkeygram.end_game: common.end_game
  -- writes common.games (wakes the terminal modal via useCommonGame), but
  -- the monkeygram channels watch player_boards / progress, so nudge
  -- progress with a no-op self-set to produce a WAL entry for them.
  update monkeygram.progress
     set unplaced = unplaced
   where game_id = target_game;
end;
$$;

revoke execute on function monkeygram.submit_timeout(uuid) from public;
grant execute on function monkeygram.submit_timeout(uuid) to authenticated;

-- ============================================================
-- monkeygram.end_game — manual stop
-- ============================================================
--
-- MonkeyGram's automatic terminals are the win inside `peel` (a player
-- goes out when the bunch can't refill the table) and — if a countdown
-- was chosen — the collective loss in `monkeygram.submit_timeout` above
-- (time's up, nobody out). This is the third terminal: a manual stop,
-- for when the friends want to quit a stale race before either fires.
-- Modeled on `freebee.end_game`'s COMPETE branch.
--
-- Shape vs. the `peel` win:
--   - play_state 'ended' (not 'won') — nobody went out
--   - status.outcome 'manual' (not 'won'); NO winner_username, so
--     the FE must NOT try to compute a winner from it (see PlayArea)
--   - EVERY player's result is `{"won": false}` — agreeing to stop is
--     a valid outcome, not a loss for anyone
--
-- Any game player can fire it (the friends decide together; the
-- server just needs the caller to be in the game). Idempotent: a
-- second call (or a click racing a real peel-win) raises P0001, which
-- the FE swallows the same way it does any "already terminal" race.
create function monkeygram.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = monkeygram, common, public, extensions
as $$
declare
  current_play_state text;
  player_results jsonb;
begin
  -- Lock the gametype row so a manual end and a concurrent peel-win
  -- serialize — only one of them gets to write the terminal state.
  perform 1 from monkeygram.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- All players {"won": false} — no winner. MonkeyGram's per-player
  -- result is bare {"won": bool} (no score; unlike freebee there's no
  -- running point total to report).
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual'),
    player_results
  );

  -- Realtime touch — same trick as freebee.end_game / submit_timeout.
  -- `common.end_game` writes to common.games, which wakes the terminal
  -- modal via useCommonGame's common.games subscription. But the FE's
  -- monkeygram channels subscribe to monkeygram.player_boards (useGame)
  -- and monkeygram.progress (useProgress) — neither sees that write. A
  -- self-set on progress's `unplaced` is a semantic no-op that still
  -- produces a WAL entry, nudging those subscribers belt-and-suspenders.
  update monkeygram.progress
     set unplaced = unplaced
   where game_id = target_game;
end;
$$;

revoke execute on function monkeygram.end_game(uuid) from public;
grant execute on function monkeygram.end_game(uuid) to authenticated;
