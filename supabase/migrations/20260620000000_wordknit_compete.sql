-- ============================================================
-- wordknit — add compete mode (sibling-manifest pattern)
-- ============================================================
--
-- Splits the existing single-mode wordknit gametype into a
-- coop/compete pair, mirroring psychicnum's approach: one schema,
-- one folder, two `common.gametypes` rows, one create_game RPC
-- routing on `mode`.
--
-- ┌─ Compete rules (delta from coop) ───────────────────────┐
-- │ - Per-player mistake_count instead of game-level shared.│
-- │ - Per-player matched_categories — each player must      │
-- │   solve all 4 themselves; "I matched it" doesn't help   │
-- │   anyone else.                                          │
-- │ - First player to all-4 wins; everyone else loses       │
-- │   immediately. (PsychicNum-style race-end.)             │
-- │ - 4 mistakes eliminates that player but the game        │
-- │   continues. All-eliminated → lost_compete.             │
-- │ - Timer expiry → lost_compete, everyone loses.          │
-- │ - Opponents see each other's mistake_count (so the      │
-- │   race has tension), NOT each other's guesses or        │
-- │   matched-rank list. RLS enforces.                      │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ Why a single migration ───────────────────────────────┐
-- │ The new RPCs depend on the new schema (mode columns,   │
-- │ wordknit.players, mode-aware unique indexes), so the   │
-- │ DDL + plpgsql rewrites must land together or the DB    │
-- │ is half-broken between the two halves. Same shape as   │
-- │ the psychicnum baseline migration — schema + RPCs as   │
-- │ one consistent unit.                                   │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ FE-knows stays, even in compete ──────────────────────┐
-- │ Same trust model as coop: board.categories is publicly │
-- │ readable; the FE evaluator decides correct/oneAway/    │
-- │ wrong; submit_guess records the verdict. A compete     │
-- │ player who reads board.categories in devtools wins —   │
-- │ but per CLAUDE.md trust-model, we're not the gate-     │
-- │ keeper of cheating, and the migration path to server-  │
-- │ side evaluation is documented in wordknit.md if we     │
-- │ ever ship beyond friends.                              │
-- └────────────────────────────────────────────────────────┘

-- ============================================================
-- 1. Swap the gametype registration
-- ============================================================
-- common.games.gametype FKs to common.gametypes ON DELETE CASCADE,
-- so dropping the 'wordknit' row cascades to:
--   - every common.games row with gametype='wordknit'
--   - every wordknit.games row (id FK to common.games(id) cascade)
--   - every wordknit.guesses row (game_id FK to wordknit.games cascade)
--   - every common.clubs_gametypes row with gametype='wordknit'
--
-- Per CLAUDE.md ("alpha software — break things freely"), losing
-- the dev DB's in-flight wordknit games is the accepted cost.
-- Production has nothing to lose here.

delete from common.gametypes where gametype = 'wordknit';

insert into common.gametypes (gametype) values
  ('wordknit_coop'),
  ('wordknit_compete')
on conflict do nothing;

-- Backfill clubs_gametypes for every existing club. The
-- create_club RPC handles this automatically for new clubs, but
-- the rows we just cascade-deleted need re-adding for the two new
-- gametypes. Every club gets both modes available.
insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'wordknit_coop' from common.clubs
on conflict do nothing;

insert into common.clubs_gametypes (club_handle, gametype)
select handle, 'wordknit_compete' from common.clubs
on conflict do nothing;

-- ============================================================
-- 2. Tear down what's about to be replaced
-- ============================================================
-- The new RPCs have different signatures (create_game gains a
-- `mode text` param) or depend on the new schema (submit_guess
-- reads from wordknit.players). Drop them first so we can ALTER
-- the columns they reference without resolver complaints.

drop function if exists wordknit.create_game(text, jsonb, uuid[]);
drop function if exists wordknit.submit_guess(uuid, text[], text, int);
drop function if exists wordknit.submit_timeout(uuid);

-- The single-mode guesses-select policy gets replaced by a
-- mode-aware version below. Same approach as psychicnum's policy.
drop policy if exists guesses_select on wordknit.guesses;

-- The calendar-coloring view filters on common.games.gametype.
-- Its baseline definition pins `gametype = 'wordknit'`, which now
-- matches zero rows (we just split into wordknit_coop /
-- wordknit_compete). Recreated below with a widened filter + an
-- exposed `mode` column so the FE calendar can color per-mode if
-- the SetupForm wants to.
drop view if exists wordknit.club_game_status;

-- The single-mode partial unique index (one correct per rank per
-- game) becomes two mode-aware indexes — coop keeps the game-wide
-- guarantee; compete partitions by user_id so each player can
-- independently solve every category.
drop index if exists wordknit.wordknit_guesses_one_correct_per_rank;

-- mistake_count moves off wordknit.games and onto the new
-- wordknit.players table. The shape mirrors psychicnum's coop —
-- every player row updates in lock-step. Reads come from any
-- player row (they're all equal in coop) or from the caller's
-- row (compete). The single source of truth is the players table.
alter table wordknit.games drop column mistake_count;

-- ============================================================
-- 3. Add mode columns + the players table
-- ============================================================

-- The cascade above emptied wordknit.games, so we can add a
-- not-null column without a backfill default.
alter table wordknit.games
  add column mode text not null
    check (mode in ('coop', 'compete'));

-- mode is also denormalized onto wordknit.guesses. Two reasons:
--   1. The mode-aware partial unique indexes below need to
--      filter on mode without a subquery (Postgres partial-
--      index predicates can't reference other tables).
--   2. The mode-aware RLS policy reads it from the parent game
--      via EXISTS — same pattern as psychicnum.guesses_select.
--      Could be derived via EXISTS join too, but denormalizing
--      keeps the index-filter and the policy aligned and lets
--      both run without joining at query time.
alter table wordknit.guesses
  add column mode text not null
    check (mode in ('coop', 'compete'));

-- Per-player tracking. Created at game-start time: one row per
-- player_user_ids entry, with mistake_count seeded at 0.
--
-- Coop: every row updates in lock-step (mistake_count++ on
-- every wrong guess hits every player row). The shape is
-- symmetric across modes — a coop row's mistake_count just
-- happens to equal the next row's because they increment
-- together.
--
-- Compete: each row increments independently when its owner
-- guesses wrong. When a player's mistake_count hits 4 they're
-- eliminated; the game continues until all are eliminated OR
-- someone matches all 4 categories OR the timer expires.
--
-- Per-player win/lose outcome doesn't live here — that's
-- common.game_players.result written at terminal time via
-- common.end_game's player_results param. Same separation as
-- psychicnum.players.
create table wordknit.players (
  game_id uuid not null
    references wordknit.games(id) on delete cascade,
  user_id uuid not null
    references common.profiles(user_id) on delete cascade,
  mistake_count int not null default 0
    check (mistake_count between 0 and 4),
  primary key (game_id, user_id)
);

create index wordknit_players_game_id_idx on wordknit.players (game_id);

-- ============================================================
-- 4. Mode-aware indexes + RLS
-- ============================================================

-- Coop: one correct per rank per game. Two players racing to
-- match the same category — the second INSERT raises
-- unique_violation and submit_guess catches it.
create unique index wordknit_guesses_one_correct_per_rank_coop
  on wordknit.guesses (game_id, matched_category_rank)
  where result = 'correct' and mode = 'coop';

-- Compete: one correct per rank PER PLAYER per game. Each
-- player solves the puzzle for themselves; ada can match rank-0
-- and so can bea — those are different rows. The same player
-- accidentally re-submitting the same correct match (e.g., a
-- broken UI sending the request twice) gets caught here.
create unique index wordknit_guesses_one_correct_per_rank_compete
  on wordknit.guesses (game_id, user_id, matched_category_rank)
  where result = 'correct' and mode = 'compete';

-- Players: club-wide visible in BOTH modes. This is what gives
-- compete players the "see opponents' mistake counts" property —
-- the column is intentionally public to the club. Same shape as
-- psychicnum.players's RLS policy.
alter table wordknit.players enable row level security;

create policy players_select on wordknit.players
  for select to authenticated
  using (
    exists (
      select 1 from wordknit.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

grant select on wordknit.players to authenticated;

-- Guesses: mode-aware visibility, mirroring psychicnum.
--   coop    — every club member sees every guess.
--   compete — each player sees only their own guesses;
--             opponents' tile picks + verdicts are private (so
--             you can't reverse-engineer the answer from a peer's
--             oneAway guess + the public board).
--
-- guesses.mode is read directly from the row — denormalized
-- expressly to avoid a join on every visibility check.
create policy guesses_select on wordknit.guesses
  for select to authenticated
  using (
    exists (
      select 1 from wordknit.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (guesses.mode = 'coop' or guesses.user_id = auth.uid())
    )
  );

-- Realtime: add wordknit.players so the FE's opponent-mistakes
-- strip updates live when an opponent guesses wrong. games +
-- guesses are already published from the baseline migration.
alter publication supabase_realtime add table wordknit.players;

-- ============================================================
-- Recreate club_game_status with both modes + mode column
-- ============================================================
-- Same shape as the baseline view (game_id, club_handle,
-- play_state, is_terminal, nyt_date) plus a `mode` column so the
-- FE calendar can filter to the current dialog's mode. Filter is
-- widened to include both gametypes; security_invoker keeps RLS
-- gated on the caller.

create view wordknit.club_game_status with (security_invoker = true) as
select
  cg.id          as game_id,
  cg.club_handle as club_handle,
  cg.play_state  as play_state,
  cg.is_terminal as is_terminal,
  wg.mode        as mode,
  p.nyt_date     as nyt_date
from wordknit.games wg
join wordknit.puzzles p on p.id = wg.puzzle_id
join common.games cg on cg.id = wg.id
where cg.gametype in ('wordknit_coop', 'wordknit_compete')
  and p.nyt_date is not null;

grant select on wordknit.club_game_status to authenticated;

-- ============================================================
-- 5. create_game — now takes `mode`
-- ============================================================
-- Same overall shape as the baseline version, with:
--   - new `mode text` parameter, validated against {coop, compete}
--   - compete mode enforces ≥2 players (a solo race is degenerate)
--   - inserts wordknit.games with the chosen mode
--   - inserts one wordknit.players row per player_user_ids entry
--     (mistake_count defaults to 0)
--   - writes mode-suffixed gametype string to common.games

create function wordknit.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  new_id uuid;
  s_puzzle_id uuid;
  puzzle_row wordknit.puzzles%rowtype;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  first_two_tiles text;
  game_title text;
  effective_gametype text;
begin
  -- ─── Validate mode + player-count ────────────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this guard is the
    -- server-side catch. Matches psychicnum's pattern.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/wordknit/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup shape (unchanged from baseline) ──────
  if (setup->>'puzzleId') is null then
    raise exception 'setup.puzzleId is required' using errcode = 'P0001';
  end if;
  begin
    s_puzzle_id := (setup->>'puzzleId')::uuid;
  exception when invalid_text_representation then
    raise exception 'setup.puzzleId must be a uuid'
      using errcode = 'P0001';
  end;

  perform common.validate_timer(setup->'timer');

  select * into puzzle_row from wordknit.puzzles
   where wordknit.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'puzzle not found' using errcode = 'P0002';
  end if;

  board_categories := puzzle_row.categories;

  -- Extract all 16 tiles from the puzzle's categories.
  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  -- Title = "#<source_id> <nyt_date> (<TILE1>/<TILE2>)" — same
  -- formula in both modes; the puzzle's NYT identity is mode-
  -- independent, and players still want a memorable handle on the
  -- game in the club list regardless of mode.
  select string_agg(t, '/' order by t) into first_two_tiles
    from (
      select unnest(tile_order) as t
      order by 1
      limit 2
    ) first2;
  game_title := format('#%s %s (%s)',
                       puzzle_row.source_id,
                       puzzle_row.nyt_date,
                       first_two_tiles);

  -- Fisher-Yates shuffle for display order.
  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  -- Mode-suffixed gametype string for common.games.gametype.
  effective_gametype := 'wordknit_' || mode;

  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title,
    setup,
    setup
  );

  insert into wordknit.games (id, club_handle, mode, puzzle_id, board)
  values (
    new_id,
    target_club,
    mode,
    s_puzzle_id,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order))
  );

  -- One player row per player_user_ids entry, mistake_count=0.
  -- Coop will increment all of them in lock-step on each wrong
  -- guess; compete only the guesser's. Same seeding either way.
  insert into wordknit.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  return query select new_id;
end;
$$;

revoke execute on function wordknit.create_game(text, jsonb, uuid[], text) from public;
grant execute on function wordknit.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- 6. submit_guess — mode-aware
-- ============================================================
-- Recap of the FE-knows trade: the caller has already evaluated
-- the guess against the public board and tells us the result and
-- (when correct) the matched rank. We validate auth + payload
-- shape + game state, then record + branch on mode.
--
-- Coop branch (preserves the baseline behavior, but updates the
-- players table rather than a game-level column):
--   - correct → insert guesses row (mode=coop, partial unique
--     catches dup-race); count(*) of correct rows; 4 → solved.
--   - wrong/oneAway → insert row; UPDATE every players row
--     mistake_count++; if mistake_count >= 4 → lost.
--
-- Compete branch (new):
--   - reject if caller's mistake_count >= 4 (eliminated).
--   - correct → insert row (mode=compete, partial unique on
--     (game_id, user_id, rank) catches per-player dup); count
--     caller's correct rows; 4 → solved_compete, caller wins,
--     others lose. Race-end: opponents with remaining lives
--     don't get to keep trying.
--   - wrong/oneAway → insert row; UPDATE caller's players row
--     mistake_count++; if MIN(mistake_count) across all players
--     >= 4 → lost_compete, everyone loses.
--
-- Concurrency: SELECT FOR UPDATE on wordknit.games serializes
-- concurrent submits across both modes. Two compete players
-- racing the same correct guess: first commits with that player
-- as winner; second sees play_state != 'playing' on its read
-- and raises 'game is not in progress'.

create function wordknit.submit_guess(
  target_game uuid,
  tiles text[],
  result text,
  matched_category_rank int default null
)
returns void
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordknit.games%rowtype;
  current_play_state text;
  caller_mistakes int;
  caller_matched int;
  matched_count int;
  player_results jsonb;
  min_mistakes int;
  winner_name text;
begin
  select * into g_row from wordknit.games
   where wordknit.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Light payload validation (mode-independent) ─────────
  if tiles is null or array_length(tiles, 1) <> 4 then
    raise exception 'must submit exactly 4 tiles (got %)',
                    coalesce(array_length(tiles, 1), 0)
      using errcode = 'P0001';
  end if;

  if result not in ('correct', 'oneAway', 'wrong') then
    raise exception 'result must be correct, oneAway, or wrong (got %)', result
      using errcode = 'P0001';
  end if;

  if result = 'correct' then
    if matched_category_rank is null
       or matched_category_rank not between 0 and 3 then
      raise exception 'matched_category_rank must be 0..3 when result is correct'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Caller's per-player row (compete needs the elim check) ─
  select mistake_count into caller_mistakes
    from wordknit.players
   where game_id = target_game and user_id = caller_id;
  if caller_mistakes is null then
    -- require_game_player passed but there's no players row;
    -- shouldn't happen since create_game seeds them. Defensive.
    raise exception 'no player row for caller' using errcode = 'P0002';
  end if;

  -- Compete-only: eliminated players can't submit. (In coop the
  -- whole game would already be terminal at mistake_count=4, so
  -- the play_state guard above catches it.)
  if g_row.mode = 'compete' and caller_mistakes >= 4 then
    raise exception 'you are eliminated from this game'
      using errcode = 'P0001';
  end if;

  -- ─── Correct guess ───────────────────────────────────────
  if result = 'correct' then
    -- Insert. The mode-aware partial unique indexes catch dup
    -- races: in coop a peer beat us to this rank; in compete the
    -- same player double-submitted. Either way, no-op.
    begin
      insert into wordknit.guesses
        (game_id, user_id, tiles, result, matched_category_rank, mode)
      values
        (target_game, caller_id, tiles, result, matched_category_rank, g_row.mode);
    exception when unique_violation then
      return;
    end;

    if g_row.mode = 'coop' then
      -- Coop win check: 4 correct rows total ⇒ solved.
      select count(*) into matched_count
        from wordknit.guesses gu
       where gu.game_id = target_game and gu.result = 'correct';

      if matched_count >= 4 then
        select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
          into player_results
          from common.game_players
         where game_id = target_game;

        perform common.end_game(
          target_game,
          'solved',
          jsonb_build_object(
            'outcome', 'solved',
            'mistake_count', caller_mistakes,
            'matched_count', 4
          ),
          player_results
        );
      else
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
      -- solved_compete, caller wins, everyone else loses. The
      -- race ends instantly — opponents with remaining lives
      -- don't get to keep trying.
      select count(*) into caller_matched
        from wordknit.guesses gu
       where gu.game_id = target_game
         and gu.user_id = caller_id
         and gu.result = 'correct';

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
          'solved_compete',
          jsonb_build_object(
            'outcome', 'solved_compete',
            'winner_username', winner_name
          ),
          player_results
        );
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
  insert into wordknit.guesses
    (game_id, user_id, tiles, result, matched_category_rank, mode)
  values
    (target_game, caller_id, tiles, result, null, g_row.mode);

  if g_row.mode = 'coop' then
    -- Lock-step decrement across every player row. Reading any
    -- one row after this UPDATE gives the canonical shared
    -- mistake_count.
    update wordknit.players
       set mistake_count = mistake_count + 1
     where game_id = target_game;

    -- Pick up the post-update value from any row (they're equal).
    select mistake_count into caller_mistakes
      from wordknit.players
     where game_id = target_game
     limit 1;

    select count(*) into matched_count
      from wordknit.guesses gu
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
          'outcome', 'lost_mistakes',
          'mistake_count', caller_mistakes,
          'matched_count', matched_count
        ),
        player_results
      );
    else
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
    update wordknit.players
       set mistake_count = mistake_count + 1
     where game_id = target_game and user_id = caller_id;

    -- Re-read caller's count for the elimination check below.
    select mistake_count into caller_mistakes
      from wordknit.players
     where game_id = target_game and user_id = caller_id;

    -- Collective-loss check: every player's mistake_count >= 4
    -- (nobody alive, nobody won) ⇒ lost_compete. MIN across the
    -- table is the cheap way to ask "is the lowest still alive?"
    select min(mistake_count) into min_mistakes
      from wordknit.players
     where game_id = target_game;

    if min_mistakes >= 4 then
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;

      perform common.end_game(
        target_game,
        'lost_compete',
        jsonb_build_object(
          'outcome', 'lost_compete_mistakes'
        ),
        player_results
      );
    else
      -- caller may have just been eliminated (mistake_count=4)
      -- but other players are still alive. The game continues;
      -- the eliminated player's FE will render the spectator-
      -- with-own-reveal view based on their own row.
      perform common.update_state(
        target_game,
        'playing',
        '{}'::jsonb
      );
    end if;
  end if;
end;
$$;

revoke execute on function wordknit.submit_guess(uuid, text[], text, int) from public;
grant execute on function wordknit.submit_guess(uuid, text[], text, int) to authenticated;

-- ============================================================
-- 7. submit_timeout — mode-aware terminal
-- ============================================================
-- Countdown expiry. Everyone loses regardless of mode — in coop
-- it's the team losing the clock; in compete the race ended with
-- nobody having all-4'd, which we treat as a collective loss
-- (psychicnum-compete does the same).
--
-- Terminal play_state values: 'lost' (coop) / 'lost_compete'
-- (compete) so the FE can render mode-appropriate copy.
--
-- Idempotency: the play_state != 'playing' guard means a second
-- concurrent fire from another tab raises P0001; the FE swallows.

create function wordknit.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  g_row wordknit.games%rowtype;
  current_play_state text;
  player_results jsonb;
  terminal_state text;
  terminal_outcome text;
  matched_count int;
  caller_mistakes int;
begin
  select * into g_row from wordknit.games
   where wordknit.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  if g_row.mode = 'coop' then
    terminal_state := 'lost';
    terminal_outcome := 'lost_timeout';

    -- Coop final snapshot mirrors what the baseline wrote —
    -- mistake_count + matched_count for the listing label.
    select count(*) into matched_count
      from wordknit.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';
    select mistake_count into caller_mistakes
      from wordknit.players
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
      player_results
    );
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'lost_compete_timeout';

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome
      ),
      player_results
    );
  end if;
end;
$$;

revoke execute on function wordknit.submit_timeout(uuid) from public;
grant execute on function wordknit.submit_timeout(uuid) to authenticated;
