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
-- create_game, save_player_board, peel, dump, submit_timeout, concede
-- (this is an alpha repo, so baselines are edited in place rather than
-- accreting per-RPC migrations; see CLAUDE.md). The intrinsic win is
-- detected inside `peel`; `concede` drops a single player out of the
-- race (the last one out ends the game as a collective loss).
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
grant usage on schema bananagrams to authenticated;

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
-- unplaced/placed tile counts + the done flag. This is what the
-- peer strip and the winner surface read — the board itself stays
-- hidden on player_boards.
--
-- `unplaced` is the race signal (count ticking toward zero).
-- save_player_board recomputes these on every snapshot; the win
-- inside peel sets done + finished_at on the winner.
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
  done boolean not null default false,
  finished_at timestamptz,
  primary key (game_id, user_id)
);

-- ============================================================
-- RLS
-- ============================================================

alter table bananagrams.games         enable row level security;
alter table bananagrams.player_boards enable row level security;
alter table bananagrams.progress      enable row level security;

-- Games: any club member sees the row (`bunch` is additionally
-- column-hidden, regardless of policy).
create policy games_select on bananagrams.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Player boards: OWNER ONLY. A club member who isn't this row's
-- owner cannot read another player's board — the competitive
-- visibility rule, enforced at the row level.
create policy player_boards_select on bananagrams.player_boards
  for select to authenticated
  using (user_id = auth.uid());

-- Progress: club-wide. Peers read each other's counts (but not
-- boards). Branches through the parent game's club_handle.
create policy progress_select on bananagrams.progress
  for select to authenticated
  using (
    exists (
      select 1 from bananagrams.games g
       where g.id = progress.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- Grants — `bunch`, `bunch_seed`, and `bag` are column-excluded
-- ============================================================
-- The whitelist omits `bunch` (live draw pile), `bunch_seed` (the initial
-- shuffled sequence), and `bag` (the out-of-play reserve) — any would let a
-- player predict upcoming draws. The FE learns their COUNTS via status instead.

grant select
  (id, club_handle, hand_size, created_at)
  on bananagrams.games to authenticated;

grant select on bananagrams.player_boards to authenticated;
grant select on bananagrams.progress to authenticated;

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
-- bananagrams.create_game(target_club, setup, player_user_ids)
-- ============================================================
-- Compete-only, single gametype 'bananagrams' (no mode parameter —
-- there's no coop sibling, like codenamesduet). Solo (1 player) is
-- allowed: a one-player race is just "finish your own tiles."
--
-- Setup shape (each field validated below):
--   { "hand_size": 15 | 21,
--     "bunch_size": 1..144 (≥ player_count × hand_size),
--     "word_check": 'off' | 'win' | 'strict', "dict_2": 2..6, "dict_3plus": 1..6
--       (the two bands required unless word_check is 'off'),
--     "dump_to_bag": bool (read at dump time, not here),
--     "timer": (none | countdown{seconds}) }
--
-- A countdown that reaches 0 ends the race as a collective loss
-- (`submit_timeout`). `word_check` gates the real-word check: 'off' = never,
-- 'win' = on the winning peel only, 'strict' = on EVERY peel (see peel +
-- _win_blockers); the dict_* bands set the obscurity ceilings it uses.
--
-- The deal: build the 144-tile Bananagrams bag, shuffle it with a
-- throwaway seed, and hand each player a contiguous slice of
-- hand_size letters as their starting `tiles` string. Everything
-- past the dealt slices becomes the `bunch` (the bunch) that peel and
-- dump later draw from. Each player's `board` starts empty.

create function bananagrams.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[]
)
returns table(id uuid)
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  new_id uuid;
  s_hand_size int;
  s_bunch_size int;
  s_word_check text;
  s_dict_2 int;
  s_dict_3plus int;
  bag_text text;
  letters text[];
  shuffled text[];
  player_count int;
  s_bunch_seed text;
  s_bag text;
  s_bunch text;
begin
  -- ─── Player count: 1..6 (solo allowed — see header) ──
  -- MUST AGREE with numberOfPlayers: [1, 6] in
  -- src/bananagrams/manifest.ts. See docs/code-conventions.md →
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

  -- bunch_size: how many tiles to draw from the 144-tile set for this game.
  -- ≤ 144 (the full Bananagrams bag); smaller = a shorter game on a random
  -- subset. MUST be ≥ player_count × hand_size or the deal can't be made —
  -- the FE disables Start on the same check (see bananagrams bunchSizeError),
  -- but the server is the authority.
  if (setup->>'bunch_size') is null then
    raise exception 'setup.bunch_size is required' using errcode = 'P0001';
  end if;
  s_bunch_size := (setup->>'bunch_size')::int;
  if s_bunch_size < 1 or s_bunch_size > 144 then
    raise exception 'setup.bunch_size must be between 1 and 144 (got %)', s_bunch_size
      using errcode = 'P0001';
  end if;
  if player_count * s_hand_size > s_bunch_size then
    raise exception 'not enough tiles: % players × % = % needed, bunch holds %',
      player_count, s_hand_size, player_count * s_hand_size, s_bunch_size
      using errcode = 'P0001';
  end if;

  -- word_check (optional, default 'off'): how strictly real words are enforced.
  --   'off'    — never (only board connectivity is checked, at win).
  --   'win'    — a WINNING peel additionally requires every word to be real.
  --   'strict' — EVERY peel requires it: you can't peel with an invalid board
  --              (see peel + _win_blockers). Connectivity is checked regardless
  --              of this. The two obscurity ceilings (common.words difficulty)
  --              are required unless 'off': dict_2 for 2-letter words (2..6 —
  --              band 1 has too few 2-letter words to be fun) and dict_3plus for
  --              longer words (1..6).
  s_word_check := coalesce(setup->>'word_check', 'off');
  if s_word_check not in ('off', 'win', 'strict') then
    raise exception 'setup.word_check must be off, win or strict (got %)', s_word_check
      using errcode = 'P0001';
  end if;
  if s_word_check <> 'off' then
    if (setup->>'dict_2') is null then
      raise exception 'setup.dict_2 is required unless word_check is off'
        using errcode = 'P0001';
    end if;
    s_dict_2 := (setup->>'dict_2')::int;
    if s_dict_2 < 2 or s_dict_2 > 6 then
      raise exception 'setup.dict_2 must be between 2 and 6 (got %)', s_dict_2
        using errcode = 'P0001';
    end if;
    if (setup->>'dict_3plus') is null then
      raise exception 'setup.dict_3plus is required unless word_check is off'
        using errcode = 'P0001';
    end if;
    s_dict_3plus := (setup->>'dict_3plus')::int;
    if s_dict_3plus < 1 or s_dict_3plus > 6 then
      raise exception 'setup.dict_3plus must be between 1 and 6 (got %)', s_dict_3plus
        using errcode = 'P0001';
    end if;
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Build the bunch: shuffle the 144-tile bag, take bunch_size ──
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
  -- double in [-1, 1].
  perform setseed(random() * 2 - 1);
  select array_agg(ch order by random()) into shuffled
    from unnest(letters) as ch;

  -- Split the shuffled 144 at bunch_size: the first bunch_size tiles are this
  -- game's BUNCH (the in-play set — hands + draw pile, recorded as bunch_seed);
  -- the rest aren't in play but aren't thrown away either — they seed the
  -- out-of-play BAG, which a dump can dip into when the bunch is short.
  s_bunch_seed := array_to_string(shuffled[1:s_bunch_size], '');
  s_bag := coalesce(array_to_string(shuffled[s_bunch_size + 1:144], ''), '');

  -- ─── Common header + gametype rows ───────────────────
  new_id := common.create_game(
    target_club, 'bananagrams', player_user_ids,
    -- Instance label for common.games.title (the club card's heading).
    -- Neutral, like stackdown/scrabble — the brand is shown from the FE
    -- manifest, never stored here.
    'New game',
    setup,
    setup
  );

  -- The bunch = every tile past the dealt slices
  -- (shuffled[player_count*hand_size + 1 .. bunch_size]). coalesce to '' for
  -- the degenerate "exact deal, nothing left over" case so NOT NULL holds.
  s_bunch := coalesce(
    (select string_agg(shuffled[gidx], '' order by gidx)
       from generate_series(player_count * s_hand_size + 1, s_bunch_size) as gidx),
    ''
  );
  insert into bananagrams.games (id, club_handle, bunch_seed, bunch, bag, hand_size)
  values (new_id, target_club, s_bunch_seed, s_bunch, s_bag, s_hand_size);

  -- Deal: player at ordinality `pi` (1-based) gets the slice
  -- shuffled[(pi-1)*hs + 1 .. pi*hs] as their starting `tiles`
  -- (everything they hold; nothing placed yet). The board starts
  -- empty — a 25×25 = 625-char string of '.'.
  insert into bananagrams.player_boards (game_id, user_id, board, tiles)
  select
    new_id,
    pu.uid,
    repeat('.', 25 * 25),
    (
      select string_agg(shuffled[gidx], '' order by gidx)
        from generate_series((pu.pi - 1) * s_hand_size + 1, pu.pi * s_hand_size) as gidx
    )
  from unnest(player_user_ids) with ordinality as pu(uid, pi);

  insert into bananagrams.progress (game_id, user_id, unplaced, placed, done)
  select new_id, uid, s_hand_size, 0, false
    from unnest(player_user_ids) as uid;

  -- Surface the bunch + bag COUNTS to the FE: `bunch`/`bag` themselves are
  -- hidden, so the counts ride on common.games.status (which the FE already
  -- reads live). peel/dump keep them current. The bag starts with the
  -- 144 − bunch_size tiles left out of the bunch (they stay in the bag).
  perform common.update_state(new_id, 'playing',
    jsonb_build_object('bunch_remaining', length(s_bunch),
                       'bag_remaining', length(s_bag)));

  return query select new_id;
end;
$$;

revoke execute on function bananagrams.create_game(text, jsonb, uuid[]) from public;
grant execute on function bananagrams.create_game(text, jsonb, uuid[]) to authenticated;

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
-- ============================================================
-- bananagrams.save_player_board — snapshot the private board
-- ============================================================
--
-- The board is high-frequency, PRIVATE scratch state (drag a tile,
-- place a letter — many times a second). It does NOT round-trip per
-- move; the FE owns it as local state and snapshots the whole grid
-- here on a debounce + when the board component unmounts (which, per
-- docs/games/bananagrams.md, is what makes pause/navigate/shelve
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
-- someone has won shouldn't clobber the final board. A CONCEDED caller
-- is also a no-op — they've dropped out, so their board is frozen (a
-- stray unmount-snapshot mustn't revive their counts).

create function bananagrams.save_player_board(target_game uuid, board text)
returns void
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  is_term boolean;
  n_tiles int;
  n_placed int;
  is_conceded boolean;
begin
  caller_id := common.require_game_player(target_game);

  select is_terminal into is_term from common.games where id = target_game;
  if is_term is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if is_term then
    return; -- harmless no-op after game-over
  end if;

  select conceded into is_conceded
    from common.game_players
   where game_id = target_game and user_id = caller_id;
  if is_conceded then
    return; -- the caller has dropped out; their board is frozen
  end if;

  if length(board) <> 25 * 25 then
    raise exception 'board must be a 625-char string' using errcode = 'P0001';
  end if;

  update bananagrams.player_boards
     set board = save_player_board.board,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  -- tiles is unchanged by this call; read it back to recompute counts.
  select length(tiles) into n_tiles
    from bananagrams.player_boards
   where game_id = target_game and user_id = caller_id;
  n_placed := length(replace(board, '.', ''));

  update bananagrams.progress
     set unplaced = greatest(n_tiles - n_placed, 0),
         placed = n_placed
   where game_id = target_game and user_id = caller_id;
end;
$$;

revoke execute on function bananagrams.save_player_board(uuid, text) from public;
grant execute on function bananagrams.save_player_board(uuid, text) to authenticated;
-- ============================================================
-- bananagrams._win_blockers — board legality
-- ============================================================
-- Returns the 0-indexed cells that block a legal win, or an empty array if the
-- board is a valid Bananagrams grid. Called on every winning peel. A board is
-- legal when:
--   1. ALWAYS: every filled tile is in ONE 4-connected mass (orthogonal only —
--      a diagonal touch does NOT connect). Geography is structural — a
--      scattered board isn't a real grid, so this holds even in trust-the-
--      friends mode.
--   2. WHEN check_words: every run of 2+ tiles (across and down) spells a real
--      word — one in common.words at difficulty ≤ the band for its LENGTH:
--      `dict_2` for 2-letter words, `dict_3plus` for longer ones (2-letter
--      words are a much thinner, separate vocabulary, so they get their own
--      band). Single tiles aren't words, so they're never checked. This is the
--      opt-in part; the bands are ignored when off.
-- The blockers are the union of: tiles NOT in the main mass (the flood-fill
-- from the top-left-most tile — so disconnected stragglers light up) and (when
-- checking words) every tile of an invalid word. The FE paints these red until
-- the player edits.
--
-- Plain `language sql` (not security definer): it reads only common.words
-- (granted to all) off the `board` text it's handed, so it runs fine inside
-- peel's definer context with nothing extra to leak.
create function bananagrams._win_blockers(board text, dict_2 int, dict_3plus int, check_words boolean)
returns int[]
language sql
stable
set search_path = bananagrams, common, public, extensions
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
     where check_words
       and not exists (
         select 1 from common.words cw
          where cw.word = lower(w.word)
            and cw.difficulty <= case when length(w.word) = 2 then dict_2 else dict_3plus end
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
-- bananagrams.peel — draw a round, or go out (Bananas!)
-- ============================================================
--
-- The heart of v2. A player who has placed every tile they hold (empty hand)
-- clicks "Peel". Two outcomes, decided by whether the bunch can refill the
-- whole table:
--
--   - Enough tiles (bunch >= players × peel_count): EVERY player draws
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
-- **Board check on a peel.** A WINNING peel (bunch can't refill) is always
-- validated for GEOGRAPHY via _win_blockers — the grid must be one connected
-- mass (a scattered board can't win, even in trust-the-friends mode). When
-- setup.word_check is 'win' or 'strict' it ALSO requires every word to be real.
-- If anything blocks, the game stays in progress and the offending cells come
-- back for the FE to paint red. A CONTINUING peel (bunch can refill) is
-- normally not validated — you're not winning yet — EXCEPT under 'strict',
-- where the same check runs on every peel (you can't peel an invalid board).
--
-- Returns jsonb so the FE can react to a blocked win:
--   { result: 'won' | 'dealt' | 'illegal', invalid_cells: int[] }
--
-- Race-safety: lock the gametype row up front so two simultaneous peels
-- serialize. The first either ends the game or advances the bunch; the second
-- then sees the new state (a non-'playing' game, or a smaller bunch) and acts on
-- it. Without the lock two peelers could both draw from the same bunch slice.

create function bananagrams.peel(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  v_board text;
  n_tiles int;
  n_placed int;
  s_peel_count int;
  s_bunch text;
  s_bag text;
  player_count int;
  needed int;
  winner_name text;
  player_results jsonb;
  v_word_check text;
  v_dict_2 int;
  v_dict_3plus int;
  v_blockers int[];
begin
  -- Serialize concurrent peels on the gametype row (see header).
  perform 1 from bananagrams.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup into current_play_state, s_setup
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- A conceded player is out of the race — they can't peel. Conceded now
  -- lives on common.game_players (the shared per-player drop-out flag).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  -- Gate: the caller's hand must be empty (every held tile placed).
  select board, length(tiles), length(replace(board, '.', ''))
    into v_board, n_tiles, n_placed
    from bananagrams.player_boards
   where game_id = target_game and user_id = caller_id;
  if v_board is null then
    raise exception 'no board for caller' using errcode = 'P0002';
  end if;
  if n_placed <> n_tiles then
    raise exception 'your hand is not empty' using errcode = 'P0001';
  end if;

  s_peel_count := greatest(coalesce((s_setup->>'peel_count')::int, 1), 1);
  -- Read bag too: peel doesn't change it, but update_state replaces the whole
  -- status blob, so the dealt-status below must re-emit bag_remaining or the
  -- FE's bag count would vanish after a peel.
  select bunch, bag into s_bunch, s_bag from bananagrams.games where id = target_game;
  -- Only ACTIVE (non-conceded) players draw on a peel — a player who has
  -- dropped out neither needs tiles nor holds up the bunch math. So the table
  -- to refill is the active count, and the winning-peel threshold below is
  -- against THAT, not the raw roster.
  select count(*)::int into player_count
    from common.game_players
   where game_id = target_game and not conceded;
  needed := player_count * s_peel_count;

  -- Word-check policy for this game (see create_game / _win_blockers):
  --   'off'    → words never checked (geography still gates a win)
  --   'win'    → words checked on the winning peel
  --   'strict' → words checked on EVERY peel (can't peel an invalid board)
  v_word_check := coalesce(s_setup->>'word_check', 'off');
  v_dict_2 := coalesce((s_setup->>'dict_2')::int, 4);
  v_dict_3plus := coalesce((s_setup->>'dict_3plus')::int, 4);

  -- ─── Not enough to refill the table → the peeler goes out (win) ───
  if length(s_bunch) < needed then
    -- A winning board is ALWAYS checked for geography (one connected mass —
    -- a scattered grid can't win), and additionally for real words when
    -- word_check is 'win' or 'strict'. If anything blocks, don't end the game —
    -- hand the FE the offending cells to paint red; the player fixes + re-peels.
    v_blockers := bananagrams._win_blockers(v_board, v_dict_2, v_dict_3plus, v_word_check <> 'off');
    if array_length(v_blockers, 1) > 0 then
      return jsonb_build_object('result', 'illegal',
                                'invalid_cells', to_jsonb(v_blockers));
    end if;

    update bananagrams.progress
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
                         'bunch_remaining', length(s_bunch)),
      player_results
    );
    return jsonb_build_object('result', 'won', 'invalid_cells', '[]'::jsonb);
  end if;

  -- ─── Strict mode: a CONTINUING peel is validated too ───
  -- In 'strict' word_check you can't peel with an invalid board: the SAME
  -- _win_blockers check (connectivity + real words) that gates a win runs on
  -- every peel, not just the winning one. Block without dealing if anything's
  -- wrong — the FE paints the cells red and shows an error. ('off' / 'win'
  -- never validate a continuing peel: you're not winning yet.)
  if v_word_check = 'strict' then
    v_blockers := bananagrams._win_blockers(v_board, v_dict_2, v_dict_3plus, true);
    if array_length(v_blockers, 1) > 0 then
      return jsonb_build_object('result', 'illegal',
                                'invalid_cells', to_jsonb(v_blockers));
    end if;
  end if;

  -- ─── Enough → every ACTIVE player draws peel_count from the bunch ───
  -- Active player at rank `pi` (1-based, stable order) takes the slice
  -- s_bunch[(pi-1)*peel_count + 1 .. peel_count]; the total drawn is `needed`.
  -- Conceded players are excluded (they don't draw), so the ranks are dense
  -- over the active set and line up with `needed` = active_count × peel_count.
  with ranked as (
    select user_id, row_number() over (order by user_id) as pi
      from common.game_players
     where game_id = target_game and not conceded
  )
  update bananagrams.player_boards pb
     set tiles = pb.tiles || substr(s_bunch, ((r.pi - 1) * s_peel_count + 1)::int, s_peel_count),
         updated_at = now()
    from ranked r
   where pb.game_id = target_game and pb.user_id = r.user_id;

  -- Each active player's unplaced count grows by what they just drew (placed is
  -- unchanged by a peel; conceded players didn't draw, so leave them be). Active
  -- = has a non-conceded common.game_players row.
  update bananagrams.progress p
     set unplaced = unplaced + s_peel_count
   where p.game_id = target_game
     and exists (
       select 1 from common.game_players gp
        where gp.game_id = p.game_id and gp.user_id = p.user_id and not gp.conceded
     );

  -- Advance the bunch past the drawn tiles.
  update bananagrams.games
     set bunch = substr(s_bunch, needed + 1)
   where id = target_game;

  -- Keep the FE's bunch count current (bag is unchanged by a peel).
  perform common.update_state(target_game, 'playing',
    jsonb_build_object('bunch_remaining', length(s_bunch) - needed,
                       'bag_remaining', length(s_bag)));

  return jsonb_build_object('result', 'dealt', 'invalid_cells', '[]'::jsonb);
end;
$$;

revoke execute on function bananagrams.peel(uuid) from public;
grant execute on function bananagrams.peel(uuid) to authenticated;
-- ============================================================
-- bananagrams.dump — swap one tile for three from the bunch
-- ============================================================
--
-- A player stuck with an awkward tile (a Q, a lone consonant) trades it: they
-- draw dump_count (default 3) in return — a net +2 to the hand, the cost of
-- getting unstuck.
--
-- What happens to the DUMPED tile depends on setup.dump_to_bag:
--   - default (false) — return-to-bunch: it goes back into the bunch (the BACK
--     of the bunch) and may be drawn again later. Tile count is conserved.
--   - true — to-the-bag: it goes to the `bag` reserve instead, so the BUNCH
--     depletes (the game ends sooner). The bag isn't dead, though — see below.
-- Either way the player still draws dump_count.
--
-- The draw: dump_count tiles from the FRONT of the bunch; if the bunch is
-- short (only possible in to-bag mode, once the bag holds tiles), the rest
-- comes from the FRONT of the bag. So you can dump as long as the bunch AND
-- bag together cover the draw.
--
-- Two guarantees from the rules:
--   - You can't dump unless bunch + bag can cover the draw. The dumped tile is
--     placed only AFTER the draw, so it can never refill its own swap.
--   - You won't draw back the SAME tile: the dumped tile lands at the BACK
--     (of the bunch for return-to-bunch, of the bag for to-bag), behind anything
--     drawn. (You might draw the same LETTER if another copy was near a front —
--     that's allowed.)
--
-- dump_count comes from setup (default 3) — a future setup option can change it
-- without touching this logic. No board/word validation (v2 trust model); the
-- only check is that the caller actually holds the tile they're dumping.
--
-- Locks the gametype row so a dump and a concurrent peel serialize on the
-- shared bunch (both draw from the front).

create function bananagrams.dump(target_game uuid, tile text)
returns void
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  caller_id uuid;
  current_play_state text;
  s_setup jsonb;
  s_dump_count int;
  s_dump_to_bag boolean;
  s_bunch text;
  s_bag text;
  from_bunch int;
  from_bag int;
  new_bunch text;
  new_bag text;
  caller_tiles text;
  drawn text;
  pos int;
begin
  -- Serialize against concurrent peels/dumps on the shared bunch.
  perform 1 from bananagrams.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state, setup into current_play_state, s_setup
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- A conceded player is out of the race — they can't drain the shared
  -- bunch via a dump. Mirrors the peel guard. The FE gates on myConceded,
  -- so this only fires on a race (a dump in flight when concede commits,
  -- or a stale second tab).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  tile := upper(tile);
  if tile !~ '^[A-Z]$' then
    raise exception 'tile must be a single letter' using errcode = 'P0001';
  end if;

  s_dump_count := greatest(coalesce((s_setup->>'dump_count')::int, 3), 1);
  s_dump_to_bag := coalesce((s_setup->>'dump_to_bag')::boolean, false);

  select bunch, bag into s_bunch, s_bag from bananagrams.games where id = target_game;
  -- You need dump_count tiles to draw. Normally that's just the bunch, but in
  -- to-bag mode the bag can top up a draw the bunch can't cover (return-to-bunch
  -- keeps the bag empty, so this reduces to "bunch < dump_count" there).
  if length(s_bunch) + length(s_bag) < s_dump_count then
    raise exception 'not enough tiles to dump' using errcode = 'P0001';
  end if;

  -- The caller must hold the tile they're dumping.
  select tiles into caller_tiles
    from bananagrams.player_boards
   where game_id = target_game and user_id = caller_id;
  pos := position(tile in caller_tiles);
  if pos = 0 then
    raise exception 'you do not hold that tile' using errcode = 'P0001';
  end if;

  -- Draw dump_count from the FRONT of the bunch first, then top up from the
  -- FRONT of the bag if the bunch is short. (The bag can hold tiles in EITHER
  -- mode now — a reduced bunch_size leaves its remainder there — so always pull
  -- the drawn tiles off both fronts.)
  from_bunch := least(length(s_bunch), s_dump_count);
  from_bag  := s_dump_count - from_bunch;
  drawn := substr(s_bunch, 1, from_bunch) || substr(s_bag, 1, from_bag);
  new_bunch := substr(s_bunch, from_bunch + 1);
  new_bag  := substr(s_bag, from_bag + 1);

  -- The dumped tile then lands at the BACK of the bunch (return-to-bunch) or the
  -- BACK of the bag (to-bag) — after the draw, so it can't refill its own swap.
  if s_dump_to_bag then
    new_bag := new_bag || tile;
  else
    new_bunch := new_bunch || tile;
  end if;

  update bananagrams.player_boards
     set tiles = overlay(caller_tiles placing '' from pos for 1) || drawn,
         updated_at = now()
   where game_id = target_game and user_id = caller_id;

  update bananagrams.games
     set bunch = new_bunch, bag = new_bag
   where id = target_game;

  -- The caller's hand math is identical either way (−1 dumped, +dump_count
  -- drawn), so unplaced grows by dump_count − 1 regardless.
  update bananagrams.progress
     set unplaced = unplaced + (s_dump_count - 1)
   where game_id = target_game and user_id = caller_id;

  perform common.update_state(target_game, 'playing',
    jsonb_build_object('bunch_remaining', length(new_bunch),
                       'bag_remaining', length(new_bag)));
end;
$$;

revoke execute on function bananagrams.dump(uuid, text) from public;
grant execute on function bananagrams.dump(uuid, text) to authenticated;
-- ============================================================
-- bananagrams.submit_timeout — countdown expiry (everyone loses)
-- ============================================================
--
-- Fired by GamePage when a chosen countdown hits 0 before anyone goes
-- out. bananagrams is a race, so time expiring with no winner is a
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
create function bananagrams.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
declare
  current_play_state text;
  player_results jsonb;
begin
  -- Lock the gametype row so the timeout and a concurrent peel-win
  -- serialize — only one of them writes the terminal state.
  perform 1 from bananagrams.games where id = target_game for update;
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

  -- Realtime touch — same trick as bananagrams.end_game: common.end_game
  -- writes common.games (wakes the terminal modal via useCommonGame), but
  -- the bananagrams channels watch player_boards / progress, so nudge
  -- progress with a no-op self-set to produce a WAL entry for them.
  update bananagrams.progress
     set unplaced = unplaced
   where game_id = target_game;
end;
$$;

revoke execute on function bananagrams.submit_timeout(uuid) from public;
grant execute on function bananagrams.submit_timeout(uuid) to authenticated;

-- ============================================================
-- bananagrams.concede — a player drops out of the race
-- ============================================================
-- bananagrams is compete-only with no per-player "eliminated" state (a
-- player is only ever done by peeling out — a win — or by conceding), so
-- concede is exactly the generic common.concede: mark the caller out;
-- while anyone's still racing the game stays 'playing' (peel already
-- counts/deals only non-conceded players); when the LAST active player
-- concedes — including a solo game, N = 1 — the whole game ends as a
-- collective loss (play_state 'lost', status.outcome 'conceded', every
-- player {"won": false}, no winner). The conceded flag now lives on
-- common.game_players (was bananagrams.progress); the FE reads it off
-- ctx.players and common.end_game wakes the terminal via useCommonGame.
-- This wrapper just keeps the FE uniform (`db.rpc('concede')`).
create function bananagrams.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = bananagrams, common, public, extensions
as $$
begin
  perform common.concede(target_game);
end;
$$;

revoke execute on function bananagrams.concede(uuid) from public;
grant execute on function bananagrams.concede(uuid) to authenticated;
