-- ============================================================
-- stackdown (brand: StackDown) — mahjong-style word game
-- ============================================================
-- Thirty letter tiles are stacked on a fixed geometry; only EXPOSED tiles
-- (nothing remaining covers them) are selectable. A player clears the
-- board by finding six 5-letter words in sequence: clicking exposed tiles
-- builds a word in selection ORDER — the reveal-on-select mechanic gates
-- which orders are reachable (BROAD is spellable, its anagram BOARD is
-- not) — and a completed lexicon word permanently removes its five tiles,
-- exposing the ones beneath. Codename `stackdown` everywhere in code/DB;
-- user-facing name "StackDown".
--
-- Boards are PRE-GENERATED offline (with strict no-trap validation — see
-- docs/games/stackdown.md) and stored in stackdown.boards; a game claims a
-- random one. The 30 tiles (letters + positions) are PUBLIC — there is no
-- hidden board; the only secret is the six solution words, hidden until
-- terminal (the waffle/wordle hidden-answer pattern) for the end reveal.
--
-- Sibling-manifest pair:
--   coop    — one SHARED board; the in-progress selection is shared peer-
--             to-peer (wordknit pattern); the team finds all six together.
--   compete — same starting board, played INDEPENDENTLY; the first player
--             to clear all six wins immediately (a race). Opponents show
--             only a tally ("Found words: Joel 2 · Moth 1").

create schema if not exists stackdown;
grant usage on schema stackdown to authenticated;

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
  -- The wordlist level the board was generated against (0 = the Wordle
  -- answer list; 1..6 = common.words.difficulty bands). Today every board
  -- is 0; recorded so the generator can ship other levels later, and so
  -- runtime word-acceptance pins to the same list (see _is_word).
  wordlist   int not null default 0 check (wordlist between 0 and 6),
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
  wordlist    int not null,            -- copied from the board (see boards.wordlist)
  -- Provenance only. tiles/solution/wordlist are COPIED above, so a board
  -- can be deleted to retire it without affecting games built from it —
  -- hence ON DELETE SET NULL (the game survives, just loses the back-link).
  board_id    uuid references stackdown.boards(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index stackdown_games_club_handle_idx on stackdown.games (club_handle);

-- Column grant: everything EXCEPT `solution` (its presence flips the table
-- to "only granted columns"). games_state reveals the solution post-terminal.
grant select (id, club_handle, mode, tiles, wordlist, board_id, created_at)
  on stackdown.games to authenticated;

alter table stackdown.games enable row level security;
create policy games_select on stackdown.games
  for select to authenticated
  using (common.is_club_member(club_handle));

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

grant select (game_id, user_id, found_count, solved, solved_at)
  on stackdown.players to authenticated;

alter table stackdown.players enable row level security;
create policy players_select on stackdown.players
  for select to authenticated
  using (
    exists (
      select 1 from stackdown.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- stackdown.submissions — the submission log (valid AND invalid)
-- ============================================================
-- Every completed 5-letter entry lands here (the right-panel game log
-- reads from it). `valid` = accepted (its tiles are gone from the board)
-- vs invalid (tiles returned to the grid). Mid-word RETRACTIONS are not
-- here — those are ephemeral + broadcast (coop). The board's removed set =
-- union of `tile_ids` over the VALID rows.
--
-- `seq` is the submitter's 1-based ordinal (incl. invalids); the games-row
-- `for update` lock in submit_word keeps it collision-free.
create table stackdown.submissions (
  game_id      uuid not null references stackdown.games(id) on delete cascade,
  user_id      uuid not null references common.profiles(user_id) on delete cascade,
  seq          int  not null,          -- submitter's ordinal
  word         text not null,          -- the 5 letters, spelling order (uppercase)
  tile_ids     int[] not null,         -- the 5 tiles (only valid rows count as removed)
  valid        boolean not null,
  submitted_at timestamptz not null default now(),
  primary key (game_id, user_id, seq)
);
create index stackdown_submissions_game_id_idx on stackdown.submissions (game_id);

grant select on stackdown.submissions to authenticated;

alter table stackdown.submissions enable row level security;
-- Coop: the whole log is club-readable (shared board). Compete: own rows
-- only, until the game is terminal (then opponents' words reveal). Mirrors
-- wordle.guesses' mode-aware policy.
create policy submissions_select on stackdown.submissions
  for select to authenticated
  using (
    exists (
      select 1 from stackdown.games sg
        join common.games cg on cg.id = sg.id
       where sg.id = submissions.game_id
         and common.is_club_member(sg.club_handle)
         and (sg.mode = 'coop' or submissions.user_id = auth.uid() or cg.is_terminal)
    )
  );

-- Realtime: the FE's useGame subscribes to stackdown.{games,players,submissions}.
alter publication supabase_realtime add table stackdown.games;
alter publication supabase_realtime add table stackdown.players;
alter publication supabase_realtime add table stackdown.submissions;

-- ============================================================
-- Geometry helpers + hidden-answer reveal
-- ============================================================

-- Is `tid` exposed given the set of already-gone tile ids? Exposed iff no
-- remaining (not-gone) tile covers it (higher z, within one cell in x,y).
-- Pure function of its args (the caller already holds `tiles`), so it
-- doesn't read tables and needs no special grants.
create function stackdown._is_exposed(tiles jsonb, gone int[], tid int)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1
      from jsonb_to_recordset(tiles) as b(id int, x int, y int, z int, letter text)
      join jsonb_to_recordset(tiles) as a(id int, x int, y int, z int, letter text)
        on a.id <> b.id
     where b.id = tid
       and not (a.id = any(gone))
       and a.z > b.z
       and abs(a.x - b.x) <= 1
       and abs(a.y - b.y) <= 1
  );
$$;

-- The word spelled by `ids` in order (their letters concatenated).
create function stackdown._word(tiles jsonb, ids int[])
returns text
language sql
immutable
as $$
  select string_agg(t.letter, '' order by u.ord)
    from unnest(ids) with ordinality as u(tid, ord)
    join jsonb_to_recordset(tiles) as t(id int, x int, y int, z int, letter text)
      on t.id = u.tid;
$$;

-- Is `w` an accepted word for the given wordlist level? Pins runtime
-- validation to the SAME list the board was generated against (§2.5 — using
-- a different list reintroduces forks). Level 0 = the Wordle answer list
-- (common.words.wordle); levels 1..6 use the difficulty bands — a forward
-- placeholder, since today every board is level 0.
create function stackdown._is_word(w text, wordlist int)
returns boolean
language sql
stable
as $$
  select case
    when wordlist = 0 then exists (
      select 1 from common.words where word = lower(w) and wordle and len = 5)
    else exists (
      select 1 from common.words where word = lower(w) and len = 5 and difficulty <= wordlist)
  end;
$$;

-- Reveal the solution only once the game is terminal (the end reveal).
create function stackdown._solution_for(g_id uuid)
returns text[]
language sql
stable
security definer
set search_path = stackdown, common, public, extensions
as $$
  select case when cg.is_terminal then sg.solution else null end
    from stackdown.games sg
    join common.games cg on cg.id = sg.id
   where sg.id = g_id;
$$;
revoke execute on function stackdown._solution_for(uuid) from public;
grant execute on function stackdown._solution_for(uuid) to authenticated;

create view stackdown.games_state with (security_invoker = true) as
  select sg.id,
         sg.club_handle,
         sg.mode,
         sg.tiles,
         sg.created_at,
         stackdown._solution_for(sg.id) as solution   -- NULL until terminal
    from stackdown.games sg;
grant select on stackdown.games_state to authenticated;

-- ============================================================
-- Register the gametype(s)
-- ============================================================
insert into common.gametypes (gametype, min_players) values
  ('stackdown_coop', 1),
  ('stackdown_compete', 2)
on conflict do nothing;

-- ============================================================
-- stackdown.create_game — mode is a positional arg
-- ============================================================
-- Setup shape: { "timer": (none | countup | countdown{seconds}) }.
-- `mode` ('coop' | 'compete') routes the gametype string + working-state
-- semantics. Unlike waffle, the board isn't passed in — it's claimed from
-- the pre-generated library and copied in (tiles public, words hidden).
create function stackdown.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  new_id uuid;
  b      stackdown.boards%rowtype;
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/stackdown/manifest.ts ([1,6]/[2,6]).
  perform common.require_player_count_max(player_user_ids, 6);

  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode using errcode = 'P0001';
  end if;
  perform common.validate_timer(setup->'timer');

  -- Claim a random pre-generated board from the library.
  select * into b from stackdown.boards order by random() limit 1;
  if not found then
    raise exception 'no stackdown boards available — run the board import'
      using errcode = 'P0001';
  end if;

  new_id := common.create_game(
    target_club, 'stackdown_' || mode, player_user_ids, 'StackDown', setup, setup
  );

  insert into stackdown.games (id, club_handle, mode, tiles, solution, wordlist, board_id)
  values (new_id, target_club, mode, b.tiles, b.words, b.wordlist, b.id);

  insert into stackdown.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  perform common.update_state(
    new_id, 'playing',
    jsonb_build_object('mode', mode, 'found', 0, 'total', 6)
  );

  return query select new_id;
end;
$$;
revoke execute on function stackdown.create_game(text, jsonb, uuid[], text) from public;
grant execute on function stackdown.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- stackdown.submit_word — the core move
-- ============================================================
-- Submit a 5-tile ordered selection. The server validates that the tiles
-- are present and REVEAL-RESPECTING (each exposed when selected) — an FE
-- that submits otherwise is rejected hard — then reads the word off the
-- order and checks the lexicon. EVERY submission is logged (valid or not);
-- an invalid one is a soft reject (the FE returns the tiles + logs "invalid
-- word"), a valid one removes the tiles and advances. The sixth valid word
-- ends the game (coop: won; compete: the caller wins the race).
--
-- The `for update` lock on the games row serializes concurrent coop
-- submits and keeps each submitter's `seq` collision-free.
create function stackdown.submit_word(target_game uuid, tile_ids int[])
returns jsonb
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  caller_id      uuid;
  g_row          stackdown.games%rowtype;
  cur_state      text;
  removed        int[];
  gone           int[];
  tid            int;
  w              text;
  is_word        boolean;
  next_seq       int;
  new_found      int;
  team_found     int;
  out_terminal   boolean := false;
  player_results jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Compete: a finished player can't keep submitting.
  if g_row.mode = 'compete'
     and (select solved from stackdown.players
            where game_id = target_game and user_id = caller_id) then
    raise exception 'you have already cleared the board' using errcode = 'P0001';
  end if;

  -- Removed set: coop = union over ALL valid submissions (shared board);
  -- compete = this caller's own valid submissions.
  select coalesce(array_agg(t), '{}'::int[])
    into removed
    from stackdown.submissions s, unnest(s.tile_ids) as t
   where s.game_id = target_game and s.valid
     and (g_row.mode = 'coop' or s.user_id = caller_id);

  -- ─── Validate the submitted tiles ──────────────────────────
  if array_length(tile_ids, 1) is distinct from 5
     or (select count(distinct e) from unnest(tile_ids) e) <> 5 then
    raise exception 'a word is exactly five distinct tiles' using errcode = 'P0001';
  end if;
  if tile_ids && removed then
    raise exception 'a submitted tile is already removed' using errcode = 'P0001';
  end if;
  -- Reveal-respecting: each tile must be exposed at the moment it's picked.
  gone := removed;
  foreach tid in array tile_ids loop
    if not stackdown._is_exposed(g_row.tiles, gone, tid) then
      raise exception 'tiles are not reachable in that order' using errcode = 'P0001';
    end if;
    gone := gone || tid;
  end loop;

  -- ─── Word + lexicon check ──────────────────────────────────
  w := upper(stackdown._word(g_row.tiles, tile_ids));
  is_word := stackdown._is_word(w, g_row.wordlist);

  -- Log the submission (valid or not).
  select coalesce(max(seq), 0) + 1 into next_seq
    from stackdown.submissions where game_id = target_game and user_id = caller_id;
  insert into stackdown.submissions (game_id, user_id, seq, word, tile_ids, valid)
  values (target_game, caller_id, next_seq, w, tile_ids, is_word);

  if not is_word then
    return jsonb_build_object('result', 'invalid', 'word', w, 'terminal', false);
  end if;

  -- ─── Accepted: remove tiles (implicitly, via the valid row), advance ──
  update stackdown.players
     set found_count = found_count + 1,
         solved    = case when g_row.mode = 'compete' and found_count + 1 >= 6
                          then true else solved end,
         solved_at = case when g_row.mode = 'compete' and found_count + 1 >= 6
                          then now() else solved_at end
   where game_id = target_game and user_id = caller_id
   returning found_count into new_found;

  if g_row.mode = 'coop' then
    select count(*) into team_found
      from stackdown.submissions where game_id = target_game and valid;
    if team_found >= 6 then
      out_terminal := true;
      select jsonb_object_agg(user_id::text, jsonb_build_object('won', true))
        into player_results from common.game_players where game_id = target_game;
      perform common.end_game(
        target_game, 'won',
        jsonb_build_object('mode', 'coop', 'solved', true),
        player_results
      );
    end if;
  else
    -- Compete is a RACE: the first to clear all six wins immediately.
    if new_found >= 6 then
      out_terminal := true;
      select jsonb_object_agg(
               user_id::text,
               jsonb_build_object('won', user_id = caller_id, 'found', found_count)
             )
        into player_results from stackdown.players where game_id = target_game;
      perform common.end_game(
        target_game, 'won_compete',
        jsonb_build_object('mode', 'compete', 'winner', caller_id),
        player_results
      );
    end if;
  end if;

  return jsonb_build_object('result', 'accepted', 'word', w, 'terminal', out_terminal);
end;
$$;
revoke execute on function stackdown.submit_word(uuid, int[]) from public;
grant execute on function stackdown.submit_word(uuid, int[]) to authenticated;

-- ============================================================
-- stackdown.submit_timeout — countdown-timer expiry
-- ============================================================
-- The FE fires this when a countdown hits 0. Coop: the shared board wasn't
-- cleared → lost. Compete: time's up with no winner (a winner would have
-- ended the game already via submit_word's race) → everyone loses.
-- Idempotent on the play_state check (a second caller raises P0001, which
-- the manifest swallows).
create function stackdown.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  g_row          stackdown.games%rowtype;
  cur_state      text;
  player_results jsonb;
begin
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
      into player_results from common.game_players where game_id = target_game;
    perform common.end_game(
      target_game, 'lost',
      jsonb_build_object('mode', 'coop', 'outcome', 'timeout'),
      player_results
    );
  else
    select jsonb_object_agg(user_id::text,
                            jsonb_build_object('won', false, 'found', found_count))
      into player_results from stackdown.players where game_id = target_game;
    perform common.end_game(
      target_game, 'lost_compete',
      jsonb_build_object('mode', 'compete', 'outcome', 'timeout'),
      player_results
    );
  end if;

  -- Realtime touch: common.end_game writes common.games, not stackdown.*,
  -- so a no-op self-update wakes the FE's stackdown subscription, which
  -- refetches games_state (now revealing the solution).
  update stackdown.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function stackdown.submit_timeout(uuid) from public;
grant execute on function stackdown.submit_timeout(uuid) to authenticated;

-- ============================================================
-- stackdown.end_game — manual stop (neutral terminal)
-- ============================================================
-- The friends' explicit "we're done" button, both modes. Writes the
-- uniform neutral terminal 'ended' (nobody wins/loses), distinct from the
-- intrinsic won/lost/won_compete/lost_compete terminals. Idempotent on the
-- play_state check; any game player may fire it.
create function stackdown.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = stackdown, common, public, extensions
as $$
declare
  g_row          stackdown.games%rowtype;
  cur_state      text;
  player_results jsonb;
begin
  select * into g_row from stackdown.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into player_results from common.game_players where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual', 'mode', g_row.mode),
    player_results
  );

  update stackdown.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function stackdown.end_game(uuid) from public;
grant execute on function stackdown.end_game(uuid) to authenticated;
