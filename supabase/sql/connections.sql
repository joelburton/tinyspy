-- ============================================================
-- connections — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for connections. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260615000003_connections.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema connections to authenticated;

-- Public knowledge — puzzles aren't sensitive. The setup-form
-- date picker reads this list to render available dates; the
-- create_game RPC reads `categories` to build the board.
grant select on connections.puzzles to authenticated;

-- RLS is enabled on this table (20260813000000_rls_seed_tables.sql) so it can't
-- fail open, but the content is not secret and every authenticated player needs
-- all of it — so the policy is permissive. The GRANT above is the real gate;
-- this states the row-level answer instead of leaving it to RLS being off.
drop policy if exists puzzles_select on connections.puzzles;
create policy puzzles_select on connections.puzzles
  for select to authenticated
  using (true);


-- The puzzle-import script (supabase/scripts/import-connections-
-- puzzles.ts) connects as the service_role and needs USAGE on
-- the schema + INSERT on this table. authenticated has no INSERT
-- grant; writes go through service_role only.
grant usage on schema connections to service_role;
grant insert, select on connections.puzzles to service_role;

drop policy if exists games_select on connections.games;
create policy games_select on connections.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Guesses: mode-aware visibility, mirroring wordle.
--   coop    — every club member sees every guess.
--   compete — DURING PLAY each player sees only their own; opponents'
--             tile picks + verdicts are private, so you can't
--             reverse-engineer the answer from a peer's oneAway guess
--             plus the public board. That privacy is a GAME RULE, not
--             just etiquette — it's what makes the race a race.
--   compete AT TERMINAL — everyone's guesses open up (2026-08-02). The
--             rule exists to stop you learning the answer while you can
--             still use it; once the game is over there's nothing left to
--             protect, and comparing lines afterwards is most of the fun.
--             This is what backs the turn log's "whose guesses?" picker,
--             which is empty for an opponent until the game ends. Same
--             shape wordle and wordiply already use.
--
-- guesses.mode is read directly from the row — denormalized expressly to
-- avoid a join on every visibility check. The terminal arm does need the
-- common.games join (is_terminal lives there, not on the per-game row).
drop policy if exists guesses_select on connections.guesses;
create policy guesses_select on connections.guesses
  for select to authenticated
  using (
    exists (
      select 1 from connections.games g
       join common.games cg on cg.id = g.id
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (
               guesses.mode = 'coop'
            or guesses.user_id = (select auth.uid())
            or cg.is_terminal
             )
    )
  );

-- Players: club-wide visible in BOTH modes. This is what gives
-- compete players the "see opponents' mistake counts" property —
-- the column is intentionally public to the club. Same shape as
-- psychicnum.players's RLS policy.
drop policy if exists players_select on connections.players;
create policy players_select on connections.players
  for select to authenticated
  using (
    exists (
      select 1 from connections.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

grant select on connections.games to authenticated;
grant select on connections.guesses to authenticated;
grant select on connections.players to authenticated;

-- ============================================================
-- connections.club_game_status — calendar-coloring view
-- ============================================================
-- Joins connections.games + connections.puzzles + common.games to
-- answer the question the connections setup-form calendar asks:
-- "for this club, which puzzle-dates already have a game, and
-- in what state?" The FE reads this once on dialog-open, builds
-- a Map<puzzle_date, status>, and colors each calendar square
-- accordingly (won / lost / in-progress). The `mode` column lets
-- the FE calendar filter to the current dialog's mode.
--
-- security_invoker=true so the view runs with the caller's
-- privileges — both connections.games's RLS policy and
-- common.games's RLS policy gate visibility. A non-member of
-- the club sees zero rows; the FE's `.eq('club_handle', X)` filter
-- is belt-and-braces on top.
--
-- Why a view rather than two FE queries + JS merge: the
-- connections.games -> common.games relationship is cross-schema,
-- which PostgREST's embed syntax doesn't resolve (see
-- code-conventions.md → "Cross-schema embeds"). A view does
-- the join SQL-side in one round-trip and types cleanly via
-- supabase gen types. Same shape as psychicnum.games_state.
--
-- Filtered to gametype in ('connections_coop', 'connections_compete')
-- (defensive; common.games.id ↔ connections.games.id is one-to-one
-- by FK, but the join condition doesn't say "and only connections,"
-- so the filter makes the intent visible) and puzzle_date IS NOT NULL
-- (a calendar-anchored view doesn't include rows whose puzzles
-- have no date).

drop view if exists connections.club_game_status;
create view connections.club_game_status with (security_invoker = true) as
select
  cg.id          as game_id,
  cg.club_handle as club_handle,
  cg.play_state  as play_state,
  cg.is_terminal as is_terminal,
  wg.mode        as mode,
  p.puzzle_date     as puzzle_date
from connections.games wg
join connections.puzzles p on p.id = wg.puzzle_id
join common.games cg on cg.id = wg.id
where cg.gametype in ('connections_coop', 'connections_compete')
  and p.puzzle_date is not null;

grant select on connections.club_game_status to authenticated;

-- ============================================================
-- connections.next_puzzle_for_club — the only puzzle choice there is
-- ============================================================
-- The dialog used to be a calendar: 2,300 dates, and the easy mistake was
-- starting one the club had already played. For connections the DATE means
-- nothing — the archive is a queue, not a catalogue — so the picker is gone
-- and this answers the only question that was ever being asked: give us one
-- nobody here has seen.
--
-- "NOBODY HERE" IS PER-PLAYER, NOT PER-CLUB. `seen_by` is the set of people
-- about to be seated (create_game's `player_user_ids`, and the same array the
-- setup dialog passes for its preview). A puzzle is out if ANY of them has
-- ever been a player on a game of it, in ANY club. The story that drives it:
-- Joel plays #100 in his solo club, then opens a Joel+Moth game — offering
-- #100 there is no fun for him and wrecks the race. Membership would be the
-- cruder proxy (exclude anything played in any club sharing a member); using
-- game_players instead means a puzzle played by four OTHER people in a big
-- club stays available to the two of you who weren't in it.
--
-- SECURITY DEFINER, and that is the whole point rather than an oversight:
-- Moth's solo-club games are invisible to Joel under RLS, and they are
-- exactly what has to be excluded. So this reads past the caller's
-- visibility on purpose. What escapes is a puzzle id — never a club, a game
-- or a name — though a determined reader could infer roughly how far a
-- club-mate has got on their own from which puzzles they are not offered.
-- Friends, not adversaries (CLAUDE.md's trust model); it is recorded here
-- rather than pretended away.
--
-- Matching is on `puzzle_date`, NOT `puzzle_id`: the FK is soft
-- (`on delete set null`, the library-puzzle provenance rule), so a
-- re-import can orphan it, while the denormalized date on the game row is
-- the durable identity. Ascending, so a club works forward through the
-- archive in publication order.
--
-- Returns 0 rows when everyone here has played everything — create_game
-- turns that into `no-unplayed-puzzle|`, and the dialog says so up front.
create or replace function connections.next_puzzle_for_club(seen_by uuid[])
returns table(id uuid, puzzle_date date, label text)
language sql
stable
security definer
set search_path = connections, common, public, extensions
as $$
  select p.id,
         p.puzzle_date,
         -- What the dialog shows as "next up". The date leads (it is the
         -- puzzle's name, even if nobody picks by it), then the two
         -- alphabetically-first tiles as a human-readable fingerprint —
         -- enough to tell two puzzles apart, and no more of a spoiler than
         -- the sixteen you see a second later.
         p.puzzle_date::text || ': ' || coalesce(
           (select string_agg(t.tile, ', ' order by t.tile)
              from (select jsonb_array_elements_text(c -> 'tiles') as tile
                      from jsonb_array_elements(p.categories) c
                     order by 1
                     limit 2) t),
           '?')
    from connections.puzzles p
   where p.puzzle_date is not null
     and not exists (
           select 1
             from connections.games g
             join common.game_players gp on gp.game_id = g.id
            where g.puzzle_date = p.puzzle_date
              and gp.user_id = any(seen_by)
         )
   order by p.puzzle_date
   limit 1;
$$;

revoke execute on function connections.next_puzzle_for_club(uuid[]) from public;
grant execute on function connections.next_puzzle_for_club(uuid[]) to authenticated;

-- ============================================================
-- connections.puzzle_for_date — the deliberate override
-- ============================================================
-- next_puzzle_for_club answers the common case ("give us one nobody here has
-- done"). This answers the rare one: you know a date and you want THAT
-- puzzle — the friends talked about it, or you want to replay one together.
--
-- It filters NOTHING. A puzzle every player has already finished comes back
-- exactly like an untouched one, and create_game will start a second game on
-- it rather than reopening the first. That is the point of an override: the
-- picker's whole job is to stop you stumbling into a repeat, and this is the
-- door marked "yes, I mean it".
--
-- SECURITY INVOKER (unlike its sibling, which must see across clubs to
-- exclude): this reads only connections.puzzles, which is public reference
-- data with a plain select grant. Nothing about anyone's history is involved.
--
-- Same return shape as next_puzzle_for_club so the shared setup field can
-- render either without caring which it asked. Zero rows = no puzzle that
-- day, which the dialog says out loud rather than silently ignoring.
create or replace function connections.puzzle_for_date(target_date date)
returns table(id uuid, puzzle_date date, label text)
language sql
stable
set search_path = connections, common, public, extensions
as $$
  select p.id,
         p.puzzle_date,
         p.puzzle_date::text || ': ' || coalesce(
           (select string_agg(t.tile, ', ' order by t.tile)
              from (select jsonb_array_elements_text(c -> 'tiles') as tile
                      from jsonb_array_elements(p.categories) c
                     order by 1
                     limit 2) t),
           '?')
    from connections.puzzles p
   where p.puzzle_date = target_date;
$$;

revoke execute on function connections.puzzle_for_date(date) from public;
grant execute on function connections.puzzle_for_date(date) to authenticated;

-- ============================================================
-- connections.create_game — start a new game in a club
-- ============================================================
-- Validates the mode + setup shape, looks up the puzzle by id,
-- builds the per-game board (the puzzle's categories + a freshly-
-- shuffled tileOrder), then coordinates the two-write game-creation:
--
--   1. common.create_game(target_club, 'connections_<mode>',
--                          player_user_ids, title, setup)
--      — validates caller is in the club, validates every uid in
--      player_user_ids is in clubs_members, vacates any prior
--      current-view game for this club, inserts the common.games
--      header row (with is_current_view=true, play_state='playing')
--      + one common.game_players row per uid, returns the
--      canonical game id.
--   2. INSERT INTO connections.games using that id — landing the
--      gametype-specific board + puzzle reference + mode.
--   3. INSERT one connections.players row per player_user_ids entry
--      (mistake_count defaults to 0).
--
-- player_user_ids is the explicit list of who's actually playing
-- THIS game. Defaults are not enforced server-side; the FE's
-- setup dialog defaults to all current club members but lets the
-- player pick a subset. The caller does NOT have to be in
-- player_user_ids (the "Ada facilitates a game between Bea and
-- Cade" case is supported).
--
-- Setup shape:
--   {
--     "puzzleId": "<uuid>",         -- references connections.puzzles(id)
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": <int 1..3600> }
--     )
--   }
--
-- Title formula: "<puzzle_date>: <TILE1>-<TILE2>" where TILE1/TILE2
-- are the first 2 alphabetical tiles across all 16.
-- A puzzle is hard to remember by date alone; the tiles ground it
-- in something memorable ("oh, that one with BUCKS and HAIL").

create or replace function connections.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  new_id uuid;
  s_puzzle_id uuid;
  puzzle_row connections.puzzles%rowtype;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  first_two_tiles text;
  game_title text;
  effective_gametype text;
  first_turn uuid;
begin
  -- ─── Validate mode + player-count ────────────────────────
  perform common.require_valid_mode(mode);

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this guard is the
    -- server-side catch. Matches psychicnum's pattern.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'too-few-players|'
        using errcode = 'P0001',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/connections/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Which puzzle ────────────────────────────────────────
  -- ABSENT is the normal case now, and it means "you choose": the setup
  -- dialog has no picker, so the server derives the next puzzle nobody being
  -- seated has played (next_puzzle_for_club above). Deriving HERE rather
  -- than trusting a value the dialog computed is what makes the preview and
  -- the actual start impossible to disagree — if someone else starts the
  -- same puzzle while your dialog sits open, you get the genuinely-next one
  -- instead of a duplicate.
  --
  -- PRESENT still wins, and that is not a leftover: every test fixture pins
  -- a specific puzzle (the e2e helpers, pg_temp.connections_setup) because
  -- the assertions are about THAT puzzle's categories. A server that always
  -- chose would make those tests assert against whatever the fixture club
  -- happened not to have played.
  if (setup->>'puzzleId') is null then
    select n.id into s_puzzle_id
      from connections.next_puzzle_for_club(player_user_ids) n;
    if s_puzzle_id is null then
      raise exception 'no-unplayed-puzzle|' using errcode = 'P0001',
        detail = 'every imported puzzle has been played by one of these players';
    end if;
  else
    begin
      s_puzzle_id := (setup->>'puzzleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'bad-puzzle-id|'
        using errcode = 'P0001',
        detail = 'setup.puzzleId is not a uuid';
    end;
  end if;

  -- Canonical timer-shape validation. See common.require_valid_timer
  -- for the accepted shapes and the exact raise messages.
  perform common.require_valid_timer(setup->'timer');

  -- Load the puzzle. The FK on connections.games.puzzle_id would also
  -- catch a bad id at INSERT time, but a clear "puzzle not found"
  -- error is friendlier than a foreign-key violation. RLS-free
  -- read (the table has a permissive SELECT grant).
  select * into puzzle_row from connections.puzzles
   where connections.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'no-puzzle|' using errcode = 'P0002',
      detail = 'no connections.puzzles row for that id; run the puzzle import';
  end if;

  board_categories := puzzle_row.categories;

  -- Extract all 16 tiles from the puzzle's categories.
  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  -- Title = "<puzzle_date>: <TILE1>-<TILE2>" — same formula in both modes; the
  -- puzzle's NYT date is mode-independent, and players still want a memorable
  -- handle on the game in the club list regardless of mode. The two tiles are
  -- a peek at the board — a date alone says which puzzle, not what's in it.
  -- Built BEFORE the shuffle since alphabetical order is order-independent.
  select string_agg(t, '-' order by t) into first_two_tiles
    from (
      select unnest(tile_order) as t
      order by 1
      limit 2
    ) first2;
  game_title := format('%s: %s', puzzle_row.puzzle_date, first_two_tiles);

  -- Fisher-Yates shuffle for the display order.
  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  -- Mode-suffixed gametype string for common.games.gametype.
  effective_gametype := 'connections_' || mode;

  -- Common-side coordination: validates auth + caller membership +
  -- player_user_ids membership, inserts common.games (with title +
  -- setup) + game_players, returns the canonical id we'll use
  -- below.
  --
  -- Saved-default arg. `puzzleId` used to ride along, as the anchor for a
  -- "play the next puzzle in chronological order" UX that hadn't been built
  -- yet. next_puzzle_for_club IS that UX, and it derives the answer fresh
  -- every time — so a remembered puzzle is now worse than useless: it would
  -- re-pin a specific (already-played) puzzle over the derivation. Stripped
  -- explicitly rather than left to the dialog no longer sending one, so a
  -- stale default saved by an older client can't ride back in.
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title,
    setup,
    -- Also strips first_turn_user_id (a per-game "who goes first" pick, not
    -- a per-club preference; the coop_style toggle rides).
    setup - 'first_turn_user_id' - 'puzzleId'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_guess gates each guess. Free-for-all / compete leave
  -- the pointer null. Runs after common.create_game seeds game_players.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'bad-first-turn|'
        using errcode = 'P0001',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  -- Insert with the canonical id. Note: id NOT default-generated;
  -- it comes from common.create_game above and FKs to
  -- common.games(id). Setup lives on common.games.setup, not
  -- duplicated here.
  -- Copy the puzzle's categories AND date onto the game (board + puzzle_date),
  -- so the game is self-contained — playable + self-describing even if the
  -- puzzle is later deleted (puzzle_id is a soft, provenance-only FK).
  insert into connections.games (id, club_handle, mode, puzzle_id, puzzle_date, board)
  values (
    new_id,
    target_club,
    mode,
    s_puzzle_id,
    puzzle_row.puzzle_date,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order))
  );

  -- One player row per player_user_ids entry, mistake_count=0.
  -- Coop will increment all of them in lock-step on each wrong
  -- guess; compete only the guesser's. Same seeding either way.
  insert into connections.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  -- Seed the club-list readout, in the SAME shape submit_guess maintains.
  -- Without this `status` stays NULL until the first guess. Coop carries the
  -- 0/4 tallies; compete stays deliberately EMPTY — each racer's matched and
  -- mistake counts are their own, and this column is club-wide readable, so
  -- the compete writer publishes nothing either (see submit_guess).
  perform common.update_state(
    new_id,
    'playing',
    case when mode = 'coop'
         then jsonb_build_object('matched_count', 0, 'mistake_count', 0)
         else '{}'::jsonb
    end
  );

  return query select new_id;
end;
$$;

revoke execute on function connections.create_game(text, jsonb, uuid[], text) from public;
grant execute on function connections.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- connections._maybe_finish_compete — end the game if nobody's alive
-- ============================================================
-- A compete game ends when NO player is still alive — alive means not
-- conceded and fewer than 4 mistakes (a solve is an immediate win,
-- handled inline in submit_guess). Shared by submit_guess (a 4th
-- mistake can eliminate the last player) and connections.concede (a
-- drop-out can leave nobody alive). Ends as a collective loss (nobody
-- solved). Returns true when it ended the game.
create or replace function connections._maybe_finish_compete(target_game uuid)
returns boolean
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  player_results jsonb;
begin
  if exists (
    select 1
      from connections.players cp
      join common.game_players gp
        on gp.game_id = cp.game_id and gp.user_id = cp.user_id
     where cp.game_id = target_game
       and not gp.conceded
       and cp.mistake_count < 4
  ) then
    return false;
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  -- Two ways to reach here and they read very differently in the club list:
  -- every racer hit four mistakes, or everyone walked away. This used to write
  -- 'lost_compete_mistakes' unconditionally, which told a player who quit that
  -- they'd lost on mistakes they never made. 'conceded' only when EVERY player
  -- conceded — a mixed table is 'mistakes', because somebody did play it out.
  perform common.end_game(
    target_game, 'lost_compete',
    jsonb_build_object('outcome',
      case when not exists (select 1 from common.game_players gp
                             where gp.game_id = target_game and not gp.conceded)
           then 'conceded' else 'mistakes' end),
    player_results);
  return true;
end;
$$;

revoke execute on function connections._maybe_finish_compete(uuid) from public;

-- ============================================================
-- connections.submit_guess — record a submission (mode-aware)
-- ============================================================
-- The FE-knows model: the caller has already evaluated the guess
-- (using the public `board.categories`) and tells us the result
-- and, when result='correct', the matched category's rank. We
-- validate auth + payload shape + game state, then record + branch
-- on mode.
--
-- Coop branch:
--   - correct → insert guesses row (mode=coop, partial unique
--     catches dup-race); count(*) of correct rows; 4 → won.
--   - wrong/oneAway → insert row; UPDATE every players row
--     mistake_count++; if mistake_count >= 4 → lost.
--
-- Compete branch:
--   - reject if caller's mistake_count >= 4 (eliminated).
--   - correct → insert row (mode=compete, partial unique on
--     (game_id, user_id, rank) catches per-player dup); count
--     caller's correct rows; 4 → won_compete, caller wins,
--     others lose. Race-end: opponents with remaining lives
--     don't get to keep trying.
--   - wrong/oneAway → insert row; UPDATE caller's players row
--     mistake_count++; if MIN(mistake_count) across all players
--     >= 4 → lost_compete, everyone loses.
--
-- Concurrency: SELECT FOR UPDATE on connections.games serializes
-- concurrent submits across both modes. Two compete players
-- racing the same correct guess: first commits with that player
-- as winner; second sees play_state != 'playing' on its read
-- and raises 'game is not in progress'.

create or replace function connections.submit_guess(
  target_game uuid,
  tiles text[],
  result text,
  matched_category_rank int default null
)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row connections.games%rowtype;
  current_play_state text;
  caller_mistakes int;
  caller_matched int;
  matched_count int;
  player_results jsonb;
  winner_name text;
begin
  -- Lock the game row for atomic mistake_count++ and play_state
  -- flips.
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no connections.games row for target_game';
  end if;

  -- Auth + game-player gate (deferred to after the lock). See
  -- common.require_game_player — checks the caller is actually
  -- IN this game (per common.game_players), not just a club
  -- member. A club member who didn't sit down at this game can
  -- still WATCH it (club-wide RLS) but can't act.
  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- A conceded player is out of the race — no more guesses. The FE gates
  -- on myConceded, so this only fires on a race (a guess in flight when
  -- concede commits, or a stale second tab). Without it a conceder could
  -- complete the win condition and be recorded the winner.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. The
  -- turn ADVANCES only on the two coop non-terminal continue paths below
  -- (a fresh correct-but-not-won guess, a fresh wrong-but-not-lost guess)
  -- — never on the duplicate no-op `return`s, which exit before them.
  perform common._require_turn(target_game, caller_id);

  -- ─── Light payload validation (mode-independent) ─────────
  -- Server-side checks for shape, not for rule correctness — the
  -- FE is trusted to apply the rules under the friends-only
  -- trust model (see CLAUDE.md). These guards catch malformed
  -- payloads (lengths, enum values) so the data we persist is at
  -- least well-typed.
  if tiles is null or array_length(tiles, 1) <> 4 then
    raise exception 'bad-selection|%|',
                    coalesce(array_length(tiles, 1), 0)
      using errcode = 'P0001',
      detail = 'a guess is exactly 4 tile ids';
  end if;

  if result not in ('correct', 'oneAway', 'wrong') then
    raise exception 'bad-result|%|', result
      using errcode = 'P0001',
      detail = 'result must be correct, oneAway or wrong';
  end if;

  if result = 'correct' then
    if matched_category_rank is null
       or matched_category_rank not between 0 and 3 then
      raise exception 'bad-category-rank|'
        using errcode = 'P0001',
      detail = 'a correct guess must name a category rank 0..3';
    end if;
  end if;

  -- ─── Caller's per-player row (compete needs the elim check) ─
  select mistake_count into caller_mistakes
    from connections.players
   where game_id = target_game and user_id = caller_id;
  if caller_mistakes is null then
    -- require_game_player passed but there's no players row;
    -- shouldn't happen since create_game seeds them. Defensive.
    raise exception 'not-a-player|' using errcode = 'P0002',
      detail = 'no connections.players row for the caller';
  end if;

  -- Compete-only: eliminated players can't submit. (In coop the
  -- whole game would already be terminal at mistake_count=4, so
  -- the play_state guard above catches it.)
  if g_row.mode = 'compete' and caller_mistakes >= 4 then
    raise exception 'eliminated|'
      using errcode = 'P0001',
      detail = 'this player is out on mistakes';
  end if;

  -- ─── Correct guess ───────────────────────────────────────
  if result = 'correct' then
    -- Insert. The mode-aware partial unique indexes catch dup
    -- races: in coop a peer beat us to this rank; in compete the
    -- same player double-submitted. Either way, no-op.
    begin
      insert into connections.guesses
        (game_id, user_id, tiles, result, matched_category_rank, mode)
      values
        (target_game, caller_id, tiles, result, matched_category_rank, g_row.mode);
    exception when unique_violation then
      return;
    end;

    -- Persist the caller's own found count to their (public) players row so a
    -- compete opponent strip can show race progress (the "Found" metric).
    -- Computed once here; the compete win check below reuses caller_matched.
    select count(*) into caller_matched
      from connections.guesses gu
     where gu.game_id = target_game
       and gu.user_id = caller_id
       and gu.result = 'correct';
    update connections.players
       set matched_count = caller_matched
     where game_id = target_game and user_id = caller_id;

    if g_row.mode = 'coop' then
      -- Coop win check: 4 correct rows total ⇒ won.
      select count(*) into matched_count
        from connections.guesses gu
       where gu.game_id = target_game and gu.result = 'correct';

      if matched_count >= 4 then
        select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
          into player_results
          from common.game_players
         where game_id = target_game;

        -- The verdict is the roster's `won`; connections' own word for HOW it
        -- ended rides in `outcome`. Until 2026-08-01 the play_state was
        -- 'solved' too — one bit of information spelled twice, and the only
        -- place on the roster where an outcome value doubled as a play_state
        -- (docs/states.md → status.outcome names the CAUSE).
        perform common.end_game(
          target_game,
          'won',
          jsonb_build_object(
            'outcome', 'solved',
            'mistake_count', caller_mistakes,
            'matched_count', 4
          ),
          player_results);
      else
        -- Turn-order: an accepted, non-terminal coop guess (a fresh correct
        -- group that doesn't yet complete the puzzle) hands the turn on
        -- (no-op for free-for-all). Fires only here — the duplicate `return`
        -- above and the terminal win branch don't reach it.
        perform common._advance_turn(target_game);
        perform common.update_state(
          target_game,
          'playing',
          jsonb_build_object(
            'mistake_count', caller_mistakes,
            'matched_count', matched_count
          )
        );
      end if;
    else
      -- Compete win check: caller's own correct count = 4 ⇒
      -- won_compete, caller wins, everyone else loses. The
      -- race ends instantly — opponents with remaining lives
      -- don't get to keep trying. (caller_matched computed above.)
      if caller_matched >= 4 then
        select username into winner_name
          from common.profiles where user_id = caller_id;

        select jsonb_object_agg(
                 user_id::text,
                 case when user_id = caller_id
                      then '{"won": true}'::jsonb
                      else '{"won": false}'::jsonb
                 end)
          into player_results
          from common.game_players
         where game_id = target_game;

        perform common.end_game(
          target_game,
          'won_compete',
          jsonb_build_object(
            'outcome', 'solved',
            'winner_username', winner_name
          ),
          player_results);
      else
        -- Mid-game compete listing-label payload is intentionally
        -- minimal — "compete · in progress" doesn't need per-
        -- player numbers, and leaking per-opponent matched_count
        -- via the listing snapshot would violate the "mistakes
        -- only" visibility decision.
        perform common.update_state(
          target_game,
          'playing',
          '{}'::jsonb
        );
      end if;
    end if;

    return;
  end if;

  -- ─── Wrong / oneAway: cost a mistake ─────────────────────
  -- Dedup a repeat of the same (order-insensitive) tile set — the wrong/
  -- oneAway analog of the correct branch's unique-index guard. Coop's
  -- selection is a shared union, so two players can Submit the identical 4
  -- tiles at once; the games-row lock serializes us, so this SELECT sees the
  -- first transaction's committed row. Without it one wrong guess costs TWO
  -- of the four mistakes (possibly the losing one) plus a duplicate turn-log
  -- row. Scope: coop = anyone's prior guess, compete = the caller's own. The
  -- FE already blocks repeats ("You already tried that"); this is the
  -- authoritative, race-safe backstop. (Each guess is 4 distinct tiles, so
  -- mutual containment `@>`/`<@` is exact set-equality.)
  -- `submit_guess.tiles` qualifies the function PARAMETER: bare `tiles` is
  -- ambiguous against `connections.guesses.tiles` inside this query.
  if exists (
    select 1 from connections.guesses gu
     where gu.game_id = target_game
       and (g_row.mode = 'coop' or gu.user_id = caller_id)
       and gu.tiles @> submit_guess.tiles and gu.tiles <@ submit_guess.tiles
  ) then
    return;
  end if;

  insert into connections.guesses
    (game_id, user_id, tiles, result, matched_category_rank, mode)
  values
    (target_game, caller_id, tiles, result, null, g_row.mode);

  if g_row.mode = 'coop' then
    -- Lock-step increment across every player row. Reading any
    -- one row after this UPDATE gives the canonical shared
    -- mistake_count.
    update connections.players
       set mistake_count = mistake_count + 1
     where game_id = target_game;

    -- Pick up the post-update value from any row (they're equal).
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game
     limit 1;

    select count(*) into matched_count
      from connections.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';

    if caller_mistakes >= 4 then
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;

      perform common.end_game(
        target_game,
        'lost',
        jsonb_build_object(
          'outcome', 'mistakes',
          'mistake_count', caller_mistakes,
          'matched_count', matched_count
        ),
        player_results);
    else
      -- Turn-order: an accepted, non-terminal coop guess (a fresh wrong/
      -- oneAway that costs a mistake but doesn't hit the 4th) hands the turn
      -- on (no-op for free-for-all). The duplicate `return` above and the
      -- terminal lost branch don't reach it.
      perform common._advance_turn(target_game);
      perform common.update_state(
        target_game,
        'playing',
        jsonb_build_object(
          'mistake_count', caller_mistakes,
          'matched_count', matched_count
        )
      );
    end if;
  else
    -- Compete: only the caller's row increments.
    update connections.players
       set mistake_count = mistake_count + 1
     where game_id = target_game and user_id = caller_id;

    -- Re-read caller's count for the elimination check below.
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game and user_id = caller_id;

    -- Collective-loss check: nobody alive (every player is eliminated
    -- — mistake_count >= 4 — or conceded) and nobody won ⇒ lost_compete.
    -- Shared with connections.concede (a drop-out can be the move that
    -- leaves nobody alive). If someone's still alive the game continues;
    -- the just-eliminated caller's FE renders the spectator-with-own-
    -- reveal view from their own row.
    if not connections._maybe_finish_compete(target_game) then
      perform common.update_state(target_game, 'playing', '{}'::jsonb);
    end if;
  end if;
end;
$$;

revoke execute on function connections.submit_guess(uuid, text[], text, int) from public;
grant execute on function connections.submit_guess(uuid, text[], text, int) to authenticated;

-- ============================================================
-- connections.concede — a player drops out of a compete race
-- ============================================================
-- connections is an ELIMINATION game (a player can be out — 4 mistakes
-- — without the table ending), so it can't use the generic
-- common.concede: after flipping the shared flag it re-runs its own
-- terminal check, which counts a conceder as "not alive" alongside the
-- eliminated. Compete only (coop is a team; it ends via the shared End).
create or replace function connections.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from connections.games where id = target_game));
  -- Lock this game's connections.games row FIRST so concede serializes against a
  -- concurrent submit_guess (which also locks this row before common.games).
  -- Without it concede locks only common.games (via _set_conceded) and a final
  -- move locks connections.games — they don't serialize, each reads the other's
  -- uncommitted "still racing" state (READ COMMITTED), both decline to end the
  -- game, and it wedges in 'playing'. Same lock order as the move path (no
  -- deadlock). Mirrors scrabble.concede.
  perform 1 from connections.games where id = target_game for update;
  perform common._set_conceded(target_game);
  perform connections._maybe_finish_compete(target_game);
end;
$$;

revoke execute on function connections.concede(uuid) from public;
grant execute on function connections.concede(uuid) to authenticated;

-- ============================================================
-- connections.submit_timeout — countdown expiry handler (mode-aware)
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Everyone loses
-- regardless of mode — in coop it's the team losing the clock; in
-- compete the race ended with nobody having all-4'd, which we
-- treat as a collective loss (psychicnum-compete does the same).
--
-- Terminal play_state values: 'lost' (coop) / 'lost_compete'
-- (compete) so the FE can render mode-appropriate copy. In coop,
-- 'lost' is the same terminal status as 4-mistakes-losing — the
-- cause doesn't change the outcome shape, just the copy in the
-- loss banner; the FE can distinguish by looking at the mistakes
-- count vs. the absence of mistakes.
--
-- Concurrency: multiple clients may fire submit_timeout at the
-- same instant because each client's local timer hits 0 around
-- the same wall-clock moment. The `SELECT ... FOR UPDATE` lock
-- serializes them; whichever transaction commits first flips
-- play_state to terminal; subsequent calls see play_state !=
-- 'playing' and raise P0001. The FE swallows that "already lost"
-- rejection silently — it just means a peer beat us to the punch,
-- and realtime will propagate the loss to all clients.
--
-- common.end_game handles the cross-cutting termination work
-- (play_state + is_terminal + status + per-player results).

create or replace function connections.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  g_row connections.games%rowtype;
  current_play_state text;
  player_results jsonb;
  terminal_state text;
  terminal_outcome text;
  matched_count int;
  caller_mistakes int;
begin
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no connections.games row for target_game';
  end if;

  -- Auth + game-player gate. See common.require_game_player.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  if g_row.mode = 'coop' then
    terminal_state := 'lost';
    terminal_outcome := 'timeout';

    -- Coop final snapshot: mistake_count + matched_count for the
    -- listing label.
    select count(*) into matched_count
      from connections.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game
     limit 1;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'mistake_count', caller_mistakes,
        'matched_count', matched_count
      ),
      player_results);
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'timeout';

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome
      ),
      player_results);
  end if;
end;
$$;

revoke execute on function connections.submit_timeout(uuid) from public;
grant execute on function connections.submit_timeout(uuid) to authenticated;

-- ============================================================
-- connections.end_game — manual stop
-- ============================================================
--
-- The intrinsic connections terminals are all "decided" outcomes:
-- coop solves/loses (4 matches / 4 mistakes / timeout), compete
-- has a winner (first to 4 matches) or a no-winner timeout. There
-- is no built-in "the friends just want to quit" path — so this
-- RPC is that explicit stop, fired from the per-game menu's "End
-- game" item.
--
-- Unlike submit_timeout (which writes a "you lost" terminal),
-- end_game is deliberately NEUTRAL: nobody won, nobody lost — the
-- group agreed to stop. We encode that as:
--   - play_state = 'ended' (a terminal state the FE/labelFor learn
--     to render in green, distinct from coop's 'lost' /
--     compete's 'lost_compete')
--   - status = {outcome:'manual', mode:<coop|compete>}
--   - every player's result = {"won": false}  (no winner — but the
--     FE shows the green "Game ended" modal regardless, because
--     "ended" is a neutral terminal, not a defeat)
--
-- Distinct from suspend (which leaves play_state='playing' and is
-- the "back to club, start something else later" path): end_game
-- writes a real terminal, so the game lands in the club's
-- completed section forever and the terminal verdict renders.
--
-- Same shape as submit_timeout with three differences:
--   - one branch for both modes (the per-player result is the bare
--     {"won": false}, identical coop and compete — there's no
--     mistake_count/matched_count snapshot to take because nothing
--     was "achieved", the friends just stopped)
--   - status.outcome = 'manual' (vs submit_timeout's 'timeout')
--   - an EXPLICIT Realtime touch at the tail — see the long
--     comment there; this is the one wrinkle that submit_timeout
--     doesn't need but end_game does.
create or replace function connections.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  g_row connections.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no connections.games row for target_game';
  end if;

  -- Auth + game-player gate. Same as submit_timeout: any current
  -- game player can end the game (it's a group decision, not an
  -- owner-only action), but a club outsider can't.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a click racing a timeout /
    -- a solve) raises this and the FE swallows it the same way it
    -- does for submit_timeout's "already terminal" race.
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- Every player gets the bare {"won": false}. Identical in coop
  -- and compete — manual end has no winner in either mode. The
  -- neutral-vs-loss distinction lives entirely in play_state
  -- ('ended', not 'lost'/'lost_compete') + status.outcome
  -- ('manual'), which is what the FE branches on for the green
  -- terminal.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object(
      'outcome', 'manual',
      'mode', g_row.mode
    ),
    player_results);

  -- Realtime touch — REQUIRED here, and the one place connections's
  -- termination path differs from submit_guess/submit_timeout.
  --
  -- submit_guess and submit_timeout each also write a connections
  -- table (guesses / players) on their way to common.end_game, so
  -- the FE's useGame subscription (postgres_changes on
  -- connections.{games,guesses,players}) wakes up naturally. end_game
  -- writes ONLY common.games via common.end_game — no connections-
  -- schema write — so without this touch the FE would never
  -- refetch and the terminal verdict would never render until a reload.
  --
  -- The self-set (club_handle = club_handle, a real not-null
  -- column on connections.games) is a semantic no-op but produces a
  -- WAL entry on connections.games that Realtime delivers to the
  -- games-table subscription. Same trick spellingbee.end_game /
  -- spellingbee.submit_timeout use; see those for the bug history.
  update connections.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function connections.end_game(uuid) from public;
grant execute on function connections.end_game(uuid) to authenticated;

-- Terminal-transition cleanup happens inline: submit_guess and
-- submit_timeout call common.end_game explicitly at the moment
-- the game is decided over. Single write path keeps all the
-- termination coordination (ended_at, play_state, is_terminal,
-- status, player_results) in one place.

-- ============================================================
-- Register connections with common.gametypes
-- ============================================================
-- Two rows — the coop/compete pair (sibling-manifest pattern).
-- create_club's RPC adds clubs_gametypes rows for both modes to
-- every new club automatically.

-- ============================================================
-- connections.replay_board — restart this puzzle from scratch
-- ============================================================
-- The "Replay board" menu item / terminal-row Restart: reset the working
-- state on the SAME game row. The frozen puzzle (`board` — the categories
-- AND this game's shuffled tileOrder — plus `puzzle_date` / `mode`) stays,
-- so it's the same sixteen tiles in the same arrangement, solved again;
-- everything the players did is wiped. Any game player may call it, from a
-- finished game OR mid-game (no play_state guard — it's a restart). Both
-- modes reset ALL players (a group "run it back", per the friends trust
-- model).
--
-- Resets the connections-specific working state (every player's mistakes +
-- matched count zeroed; the guess log cleared, which is also what un-matches
-- the categories — a matched category IS a `result='correct'` guess row, so
-- deleting the log rebuilds the board by construction), then hands the
-- common-layer reset to common.reset_game, which writes the `status` passed
-- here. Note that's NOT identical to a brand-new game: common.create_game omits
-- `status` from its insert, so a fresh game's is NULL where a replayed one's is
-- '{}'. No behavioral difference — both `labelFor`s read `row.status ?? {}`.
--
-- Turn-order coop rewinds the pointer to the player seated first
-- (`game_players.turn_seat = 0`); a free-for-all game's null pointer stays
-- null.
--
-- No realtime touch needed: the players update + guesses delete wake useGame
-- (subscribed to connections.{games,players,guesses}), and reset_game's
-- common.games write wakes useCommonGame.
create or replace function connections.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  g_row connections.games;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray guess row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset. `g_row` is unused
  -- beyond the existence check; the LOCK is the point.
  select * into g_row from connections.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no connections.games row for target_game';
  end if;

  update connections.players
     set mistake_count = 0,
         matched_count = 0
   where game_id = target_game;

  delete from connections.guesses where game_id = target_game;

  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  perform common.reset_game(target_game, '{}'::jsonb);
end;
$$;

revoke execute on function connections.replay_board(uuid) from public;
grant execute on function connections.replay_board(uuid) to authenticated;
