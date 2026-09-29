-- cs-unmet

-- ============================================================
-- crosswords
-- ============================================================
-- What the frontend calls:
--
--   create_game            starts a game on a library puzzle (the NYT and
--                          upload edge functions call it with the puzzle)
--   library_for_club       the setup form's library list, colored by this
--                          club's history
--   next_nyt_date_for_club the most recent NYT daily of a weekday nobody
--                          about to play has played
--   set_cell               writes one cell's fill (one call per keystroke)
--   set_mark               writes a cryptic edge mark on one cell
--   check_cells            flags the wrong fills among the asked cells
--   reveal_cells           fills the asked cells with the answer (coop only)
--   export_solution        the whole answer grid, for a download
--   concede                a racer drops out of a compete game
--   stop_game              stops the game for everyone, with no result
--   submit_timeout         ends the game when the countdown runs out
--   replay_board           clears every grid and starts the puzzle again
--
-- What the crosswords-explain-clue edge function calls:
--
--   reveal_solved_word     a word's answer, only once the caller has it right
--
-- What is particular to crosswords (docs/games/crosswords.md has the rest):
--   - The solution is on the game row but never granted; players see it
--     through `games_state` once the game has ended.
--   - The grid is `crosswords.cells`: one shared grid in coop, one per player
--     in compete. A cell's writes (`set_cell`, `set_mark`) reach the other
--     pages through the cells subscription, so they don't rewrite the
--     statuses — except the fill that completes the grid and ends the game
--     (plans/common-tables.md → Decided).
--   - The first player (compete) or the team (coop) to complete a correct
--     grid wins at once.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema crosswords to authenticated;

-- Library browsing needs puzzle_content but never the answer. The presence of
-- ANY column grant flips the table to "only granted columns visible", so we
-- enumerate the safe columns and omit `solution`. A pgTAP test pins that
-- authenticated cannot select `solution`, so a future migration can't
-- silently regress it.
grant select (id, source, puzzle_content, created_at) on crosswords.puzzles to authenticated;

-- Any authenticated user may list puzzles (the setup-form picker); the
-- column grant above is what hides the answer, not RLS.
drop policy if exists puzzles_select on crosswords.puzzles;
create policy puzzles_select on crosswords.puzzles
  for select to authenticated
  using (true);

-- The import CLI writes puzzles as the service_role (bypasses RLS; the
-- only writer — there's no INSERT grant to authenticated). Needs schema
-- USAGE + full column access (all columns, incl. solution) to seed the
-- library. (The NYT edge function does NOT write here — it creates an
-- inline, self-contained game under the caller's own JWT.)
grant usage on schema crosswords to service_role;
grant insert, select on crosswords.puzzles to service_role;

-- Everything EXCEPT `solution`.
grant select (game_id, puzzle_id, puzzle_content)
  on crosswords.games to authenticated;

drop policy if exists games_select on crosswords.games;
create policy games_select on crosswords.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on crosswords.cells to authenticated;

-- Mode-aware visibility: coop — any club member reads the shared grid;
-- compete — you see only your own rows until the game has ended, when
-- opponents' grids open up. This gates the RLS-filtered READ, not the
-- Realtime payload — the FE's useCells also drops incoming compete events
-- whose owner_id != auth.uid(). Writes all go through the definer RPCs below,
-- which bypass RLS, so no write policy.
drop policy if exists cells_select on crosswords.cells;
create policy cells_select on crosswords.cells
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = cells.game_id
         and common._is_club_member(cg.club_handle)
         and (cg.mode = 'coop' or cells.owner_id = (select auth.uid())
              or cg.ended_at is not null)
    )
  );

-- ============================================================
-- crosswords._bump_cell_version — the cells trigger
-- ============================================================
-- Per-cell version bump. Any change (fill / check-wrong / reveal) advances
-- the counter, so every CDC event carries a strictly newer version than
-- the state it supersedes.
create or replace function crosswords._bump_cell_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke execute on function crosswords._bump_cell_version() from public;

drop trigger if exists cells_bump_version on crosswords.cells;
create trigger cells_bump_version
  before update on crosswords.cells
  for each row
  execute function crosswords._bump_cell_version();

-- ============================================================
-- crosswords._matches — is this fill an acceptable answer?
-- ============================================================
-- True iff `p_fill` is an acceptable answer for the per-cell solution
-- array `p_sols` (null for a block; length 1 normal; length > 1
-- Schrödinger — more than one acceptable candidate). Each candidate
-- accepts an exact match, and — for any multi-CHARACTER candidate (a
-- rebus answer like "HEART") — the bare first letter alone, a long-
-- standing NYT convention that saves typing on small screens. This
-- mirrors `fillMatchesSolution` (crossplay's ws.ts): the first-letter
-- shortcut is keyed on the candidate STRING's length, NOT on the number of
-- candidates. A Schrödinger cell whose candidates are all single letters
-- gets no first-letter shortcut; a normal cell with one multi-char answer
-- does.
create or replace function crosswords._matches(p_fill text, p_sols jsonb)
returns boolean
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select p_fill is not null
     and p_sols is not null
     and jsonb_typeof(p_sols) = 'array'
     and exists (
       select 1
         from jsonb_array_elements_text(p_sols) as s(ans)
        where p_fill = s.ans
           or (length(s.ans) > 1 and p_fill = left(s.ans, 1))
     );
$$;
revoke execute on function crosswords._matches(text, jsonb) from public;

drop function if exists crosswords._is_solved(uuid, uuid);

-- ============================================================
-- crosswords._is_solved — is this grid complete and correct?
-- ============================================================
-- True iff every fillable cell in `p_owner_id`'s grid (null: coop's shared
-- grid) matches the solution (`isPuzzleSolved`). An empty cell blocks the
-- solve; a pencil cell does NOT (it counts if right). Given cells aren't in
-- the table — they're author-correct by construction — so they're
-- implicitly satisfied.
create or replace function crosswords._is_solved(p_game_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
  select not exists (
    select 1
      from crosswords.cells c
      join crosswords.games g on g.game_id = c.game_id
     where c.game_id = p_game_id
       and c.owner_id is not distinct from p_owner_id
       and (c.fill is null
            or not crosswords._matches(c.fill, g.solution -> c.row::int -> c.col::int))
  );
$$;
revoke execute on function crosswords._is_solved(uuid, uuid) from public;

drop view if exists crosswords.games_state;
drop function if exists crosswords._solution_for(uuid);

-- ============================================================
-- crosswords._solution_for — the answer, once the game has ended
-- ============================================================
-- The shielded `solution` column, surfaced once the game has ended and NULL
-- before. The security_invoker view keeps auth.uid() real so the table's
-- rules still gate rows; this definer function reads the grant-hidden
-- column.
create or replace function crosswords._solution_for(p_game_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
  select case when cg.ended_at is not null then g.solution end
    from crosswords.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;
revoke execute on function crosswords._solution_for(uuid) from public;
grant execute on function crosswords._solution_for(uuid) to authenticated;

create view crosswords.games_state with (security_invoker = true) as
  select g.game_id, g.puzzle_id, g.puzzle_content,
         crosswords._solution_for(g.game_id) as solution   -- NULL until the end
    from crosswords.games g;
grant select on crosswords.games_state to authenticated;

-- ============================================================
-- crosswords._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from crosswords' own tables, assigning
-- each whole (plans/common-tables.md → The statuses). Every key is always
-- present, null when it has no value:
--
--   game_status    {} — crosswords has no info column
--   player_status  {} — and no strip
--   clubpage_info  { winner_user_id } — who completed a compete grid first
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function crosswords._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
begin
  update common.game_players
     set player_status = '{}'::jsonb
   where game_id = p_game_id;

  update common.games cg
     set game_status = '{}'::jsonb,
         clubpage_info = jsonb_build_object(
           'winner_user_id', case when cg.mode = 'compete' then (
             select user_id from common.game_players
              where game_id = p_game_id and final_ranking = 1) end),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else cg.status_changed_at end
   where cg.id = p_game_id;
end;
$$;

revoke execute on function crosswords._write_statuses(uuid, boolean) from public;

drop function if exists crosswords.next_nyt_date_for_club(uuid[], int);

-- ============================================================
-- crosswords.next_nyt_date_for_club — which NYT daily you get
-- ============================================================
-- The NYT tab picks by WEEKDAY, not by date: an NYT crossword's day IS its
-- difficulty (Monday easiest, Saturday hardest, Sunday bigger rather than
-- harder), so "give us a Tuesday" is the choice a solver actually wants to
-- make. This answers it — the most recent puzzle of weekday `p_dow` that
-- none of `p_seen_by`, the players being seated, has already played.
--
-- WHY IT GENERATES INSTEAD OF SCANNING. connections and strands hold their
-- archives in a table, so their `next_puzzle_for_club` scans one. NYT is
-- fetched on demand and never stored (`crosswords.puzzles` is the curated CLI
-- library only, `source in ('library')`), so there is no archive to scan:
-- the candidate dates are COMPUTED, every seventh day back from the most
-- recent occurrence of `p_dow`, and only the games table is consulted.
--
-- MOST RECENT FIRST, unlike its two siblings, and that difference is
-- deliberate. Their archives are finite and recent, so "earliest unplayed"
-- walks a club forward through a queue. NYT's is effectively infinite — a
-- club starting at a 2015 floor and playing weekly would reach the present in
-- about 575 games, and would never once play a puzzle anyone was talking
-- about. Recency is most of the point of a daily crossword.
--
-- The 2015 floor is the same bound the tab's date input carries: NYT's own
-- archive runs to 1993, but nobody here is going to work back that far, and
-- the series has to stop somewhere.
--
-- Per-PLAYER and across clubs (`common.game_players`), matching the other two
-- games — a crossword you solved alone is one you now know the answers to,
-- wherever you solved it. Hence SECURITY DEFINER: a club-mate's solo games
-- are invisible to the caller under RLS and still have to count.
--
-- When that weekday is used up it refuses (PN478) — reachable only by a club
-- that has played every one of ~600 Mondays, but it is a real branch and it
-- has copy.
create or replace function crosswords.next_nyt_date_for_club(p_seen_by uuid[], p_dow int)
returns jsonb
language plpgsql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_date date;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select d into v_date from (
    select d::date
        from generate_series(
               -- The most recent `p_dow` on or before today. The modulo keeps it
               -- at today when today already IS that weekday.
               current_date - ((extract(dow from current_date)::int - p_dow + 7) % 7),
               date '2015-01-01',
               interval '-7 days'
             ) d
       where not exists (
               select 1
                 from crosswords.games g
                 join common.game_players gp on gp.game_id = g.game_id
                where g.puzzle_date = d::date
                  and gp.user_id = any(p_seen_by)
             )
       limit 1
  ) q(d);

  -- A VALIDATION under `source`, the control that picks the weekday — the field
  -- a group told "you have done every Monday back to 2015" will change. Joel's
  -- words, approved 2026-08-12: two callers ask this, and the sentence belongs
  -- with the condition rather than with one of them.
  if v_date is null then
    raise exception 'You''ve played every one of those'
      using errcode = 'PN478', hint = 'form-validation', column = 'source',
      detail = format('no unplayed puzzle for dow %s back to the 2015 floor', p_dow);
  end if;

  return common._ok_envelope(jsonb_build_object(
    'result', 'found', 'puzzle_date', v_date));
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function crosswords.next_nyt_date_for_club(uuid[], int) from public;
grant execute on function crosswords.next_nyt_date_for_club(uuid[], int) to authenticated;

drop function if exists crosswords.library_for_club(text);

-- ============================================================
-- crosswords.library_for_club — the setup-form picker list
-- ============================================================
-- One row per library puzzle, plus a `status` saying whether club
-- `p_club_handle` has played it, so the picker can paint a color bar per row
-- and the club can see at a glance which crossword to do next.
--
-- Why a FUNCTION rather than a view:
--
--   * something SQL-side has to do the join either way — reaching a game's
--     ending means crosswords.games -> common.games, which is CROSS-SCHEMA,
--     and PostgREST's embed syntax doesn't resolve those
--     (code-conventions.md → "Cross-schema embeds").
--   * but a view can't do it HERE, because the join has to be OUTER and the
--     club is an input to it: an unplayed puzzle has no game in the club, and
--     filtering a view by club drops exactly the rows the picker most wants
--     to show. Hence a parameter.
--   * one round trip means the list arrives already colored, instead of
--     painting rows and recoloring them a beat later.
--
-- It returns four scalars per puzzle rather than `puzzle_content`, the whole
-- template (~12 kB for a 15×15).
--
-- SECURITY INVOKER (the default; named here because it is load-bearing):
--   * the `crosswords.puzzles` COLUMN GRANT is what hides `solution`, and a
--     DEFINER function would run straight past it (a pgTAP test pins that
--     grant, so this would be a silent way around a guarded shield);
--   * common.games's club-member RLS is what stops one club's history
--     leaking into another's picker. A non-member sees every puzzle as
--     'unplayed' rather than an error, which is the right degradation.
--
-- `status` precedence — solved beats playing beats lost:
--   'solved'   — some game in this club won it. Sticky: replaying can't
--                un-solve it.
--   'playing'  — no win, but a game is live or ended with no result (a Stop).
--   'lost'     — games exist and every one lost (timeout, or all racers
--                conceding).
--   'unplayed' — this club has no game on this puzzle.
--
-- Mode is deliberately NOT a parameter: "have we done this puzzle" is a
-- question about the club, not about coop vs compete, so a puzzle the club
-- solved cooperatively shows solved in the compete dialog too.
--
-- AN EMPTY LIBRARY IS AN `ok`, not a refusal: a club with nothing imported is
-- an ordinary state the picker draws as its empty case. It raises nothing, so
-- it needs no catch block. NO BOUND, on purpose for now: the list comes back
-- as ONE jsonb value, so PostgREST's `max_rows` cannot truncate it, but the
-- payload grows with the library (docs/games/crosswords.md → Deferred).
create or replace function crosswords.library_for_club(p_club_handle text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = crosswords, common, public, extensions
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows
    from (
      -- Every column reference is table-qualified on purpose: `common.games`
      -- has `id` and `title` columns too, so a bare name would be ambiguous or
      -- read the wrong table.
      select
        p.id,
        coalesce(nullif(btrim(p.puzzle_content ->> 'title'), ''), 'Untitled') as title,
        coalesce(btrim(p.puzzle_content ->> 'author'), '')                    as author,
        (p.puzzle_content ->> 'width')::int                                   as width,
        (p.puzzle_content ->> 'height')::int                                  as height,
        case
          when count(*) filter (where cg.game_ended_outcome = 'won') > 0 then 'solved'
          when count(*) filter (
                 where cg.id is not null
                   and cg.game_ended_outcome is distinct from 'lost'
               ) > 0 then 'playing'
          -- count(cg.id), NOT count(*): a LEFT JOIN that matched nothing still
          -- yields one row per puzzle, so count(*) is never 0 and every
          -- unplayed puzzle would report 'lost'.
          when count(cg.id) > 0 then 'lost'
          else 'unplayed'
        end as status
      from crosswords.puzzles p
      -- LEFT, and the club test rides inside the joined pair rather than a
      -- WHERE: both so that a puzzle this club has never touched keeps its
      -- row. Moving the club test into a WHERE would quietly turn this back
      -- into an inner join and hide every unplayed puzzle.
      left join (crosswords.games xg
                 join common.games cg
                   on cg.id = xg.game_id and cg.club_handle = p_club_handle)
             on xg.puzzle_id = p.id
      where p.source = 'library'
      -- Grouping by the PK lets the select + order reach p's other columns
      -- (functional dependency), so `puzzle_content` needn't be in the GROUP BY.
      group by p.id
      -- Alphabetical by title, case-insensitively — the picker is a list you
      -- scan by name. The expression is repeated rather than
      -- `order by lower(title)`, because inside an expression `title` names
      -- `common.games.title`, not this select's alias. `created_at desc`
      -- breaks ties so equal titles hold a stable, newest-first order.
      order by lower(coalesce(nullif(btrim(p.puzzle_content ->> 'title'), ''), 'Untitled')),
               p.created_at desc
    ) r;

  return common._ok_envelope(jsonb_build_object('result', 'library', 'puzzles', v_rows));
end;
$$;
revoke execute on function crosswords.library_for_club(text) from public;
grant execute on function crosswords.library_for_club(text) to authenticated;

drop function if exists crosswords._finish_coop(uuid);
drop function if exists crosswords._finish_compete(uuid, uuid);
drop function if exists crosswords._maybe_finish(uuid, uuid, text, uuid);

-- ============================================================
-- crosswords._maybe_finish — end the game on a completed grid
-- ============================================================
-- Runs the solved check for `p_owner_id`'s grid (null: coop's shared grid)
-- and, if it is complete and correct and the game is still being played,
-- ends it reached_goal / solved, `p_caller` as who ended it:
--
--   coop     the team solved it: every player ranked 1, and every player's
--            solved_at
--   compete  a race that ends when decided: the solver alone ranked 1 and
--            solved; the rest are short of the goal
--
-- The caller holds the game row's lock, so a second solver in the same moment
-- finds the game over. Returns whether the grid is solved, whoever ended the
-- game.
create or replace function crosswords._maybe_finish(
  p_game_id uuid, p_owner_id uuid, p_caller uuid
)
returns boolean
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_mode text;
  v_rankings jsonb;
begin
  if not crosswords._is_solved(p_game_id, p_owner_id) then
    return false;
  end if;

  select mode into v_mode from common.games
   where id = p_game_id and ended_at is null;
  if not found then
    return true;
  end if;

  if v_mode = 'coop' then
    update common.game_players set solved_at = now() where game_id = p_game_id;
    select jsonb_object_agg(user_id::text, 1) into v_rankings
      from common.game_players where game_id = p_game_id;
  else
    update common.game_players set solved_at = now()
     where game_id = p_game_id and user_id = p_caller;
    v_rankings := jsonb_build_object(p_caller::text, 1);
  end if;

  perform common._end_game(
    p_game_id, 'reached_goal', 'solved', p_caller,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return true;
end;
$$;
revoke execute on function crosswords._maybe_finish(uuid, uuid, uuid) from public;

drop function if exists crosswords.create_game(text, jsonb, uuid[], text, jsonb);

-- ============================================================
-- crosswords.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)
-- ============================================================
-- Two ways to source the puzzle (its content + solution):
--   * LIBRARY (`p_board` null): `setup.puzzle_id` names a crosswords.puzzles
--     row — the curated, CLI-imported library — whose content and solution
--     are copied.
--   * INLINE (`p_board` = {meta, solution}): the puzzle is passed straight
--     in, NOT stored in crosswords.puzzles. This is the NYT edge-function and
--     upload path — a self-contained game with puzzle_id null; it does NOT
--     add to the shared library.
-- Either way one cells row is pre-inserted per fillable NON-given cell (one
-- shared grid for coop; one per player for compete).
create or replace function crosswords.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text,
  p_board jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  new_id           uuid;
  v_setup          jsonb;
  v_puzzle_id      uuid;
  v_puzzle_content jsonb;
  v_solution       jsonb;
begin
  perform common._require_club_member(p_club_handle);
  perform common._require_valid_mode(p_mode);
  if p_mode = 'compete' and coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
    raise exception 'BUG: race with fewer than two players'
      using errcode = 'PN219', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
  end if;
  perform common._require_player_count_max(p_player_user_ids, 8);
  perform common._require_valid_timer(coalesce(p_setup -> 'timer', '{"kind":"none"}'::jsonb));
  -- Backstop the FE's strip: the inline puzzle rides as the separate
  -- `p_board`, so `board`/`filename` never belong in the persisted setup.
  -- Dropping them here keeps a stale upload (a parsed board left in the setup
  -- after a source tab-switch) from leaking the solution grid into the
  -- club's saved default. See docs/games/crosswords.md §5.
  v_setup := p_setup - 'board' - 'filename';

  if p_board is not null then
    -- Inline (NYT, upload): trust the caller's puzzle data; no library row.
    v_puzzle_content := p_board -> 'meta';
    v_solution := p_board -> 'solution';
    if v_puzzle_content is null or v_solution is null then
      -- FAULT: whoever built this blob — the FE's upload parser or an import
      -- edge function — already read the puzzle successfully, so a missing key
      -- is our construction, not the player's file.
      raise exception 'BUG: puzzle with no meta or solution'
        using errcode = 'PN220', hint = 'fault', column = '_',
        detail = 'the board blob needs both meta and solution';
    end if;
    v_puzzle_id := null;
  else
    v_puzzle_id := nullif(v_setup ->> 'puzzle_id', '')::uuid;
    if v_puzzle_id is null then
      raise exception 'BUG: game with no puzzle'
        using errcode = 'PN221', hint = 'fault', column = '_',
        detail = 'setup.puzzle_id absent';
    end if;
    select p.puzzle_content, p.solution into v_puzzle_content, v_solution
      from crosswords.puzzles p where p.id = v_puzzle_id;
    if not found then
      raise exception 'That puzzle is no longer in the library'
        using errcode = 'PN222', hint = 'form-validation', column = 'source',
        detail = 'no crosswords.puzzles row for that id; run the puzzle import';
    end if;
  end if;

  -- Saved-default arg. Two things are INSTANCES, not preferences, and both are
  -- stripped: `puzzle_id` (which library puzzle) and `date` (which NYT daily).
  -- Persisting either would silently re-pick one specific, probably
  -- already-played puzzle every time the dialog opened.
  --
  -- `weekday` deliberately RIDES. It is the one genuine preference here: an
  -- NYT crossword's day is its difficulty, so "we're a Wednesday club" is a
  -- standing choice, and next_nyt_date_for_club turns it into a fresh date
  -- each time.
  --
  -- Game title = the PUZZLE's own title, like crossplay names a game after
  -- the loaded puzzle — e.g. "NYT Sat 1/1/22: <theme>" or a library puzzle's
  -- embedded title. Falls back to "Crossword" for an untitled puzzle.
  new_id := common._create_game(
    p_club_handle, 'crosswords_' || p_mode, p_mode, p_player_user_ids,
    coalesce(nullif(btrim(v_puzzle_content ->> 'title'), ''), 'Crossword'), v_setup,
    v_setup - 'puzzle_id' - 'date'
  );

  -- `puzzle_date` is the NYT day this game came from, and ONLY that: the NYT
  -- tab is the only source that picks by date, and `setup.date` is the field
  -- it writes; a library / upload start leaves it absent, so this lands NULL.
  -- The cast is guarded rather than trusted — `setup` is caller-supplied.
  insert into crosswords.games (game_id, puzzle_id, puzzle_date, puzzle_content, solution)
  values (
    new_id, v_puzzle_id,
    case
      when v_setup ->> 'source' = 'nyt' and v_setup ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
      then (v_setup ->> 'date')::date
    end,
    v_puzzle_content, v_solution
  );

  -- Pre-insert the fillable, non-given cells: one shared grid (owner null)
  -- for coop, one grid per player for compete. `with ordinality` gives
  -- 1-based indices; subtract 1 for 0-based (row, col).
  --
  -- `fill` is seeded from the template cell's `fill` when present — normally
  -- NULL (a blank library / NYT template), but an uploaded PARTIALLY-SOLVED
  -- `.ipuz` carries the solver's saved fills on its non-given cells (the ipuz
  -- `saved` grid, applied into the template by the parser). Restoring them
  -- here means a half-finished puzzle imports where you left off — the
  -- crossplay behavior (its `saved` round-trip). Uppercased to match set_cell.
  --
  -- `mark_right` / `mark_bottom` are likewise seeded from the template cell's
  -- cryptic edge marks. These are normally player-drawn (set_mark), but a
  -- template can arrive WITH marks: the NYT overlay-PNG import applies
  -- author-drawn word-break bars onto the template's cells (see
  -- nytOverlay.ts). Seeding them into the live cells here is what puts them
  -- on the display path — the board + PDFs read marks from
  -- `crosswords.cells`, not from the template — so overlay bars render like
  -- any other mark. (A player can still clear one with `|`/`_`; crossplay
  -- accepts the same, an author bar is not immutable.)
  insert into crosswords.cells (game_id, owner_id, row, col, fill, mark_right, mark_bottom)
  select new_id, o.owner, (rr.ord - 1)::smallint, (cc.ord - 1)::smallint,
         upper(nullif(cc.cellval ->> 'fill', '')),
         nullif(cc.cellval ->> 'markRight', ''),
         nullif(cc.cellval ->> 'markBottom', '')
    from jsonb_array_elements(v_puzzle_content -> 'cells') with ordinality as rr(rowval, ord)
    cross join lateral jsonb_array_elements(rr.rowval) with ordinality as cc(cellval, ord)
    cross join unnest(
      case when p_mode = 'coop' then array[null::uuid] else p_player_user_ids end
    ) as o(owner)
   where cc.cellval ->> 'kind' = 'cell'
     and coalesce((cc.cellval ->> 'given')::boolean, false) = false;

  perform crosswords._write_statuses(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It is the only thing
  -- a call site can filter the `ok` on, and it reaches all three start paths —
  -- the two import edge functions relay this envelope untouched.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- The boundary. It reads the SQLSTATE, re-raises anything that isn't ours, and
-- lets the raise itself carry the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function crosswords.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function crosswords.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

drop function if exists crosswords._require_cell_write(uuid);

-- ============================================================
-- crosswords._require_cell_write — the gate every grid write shares
-- ============================================================
-- Refuses a write into a game that has ended (a teammate finished the grid,
-- or the clock ran out, mid-keystroke — a race) or from a player who has
-- conceded. Returns the grid the caller writes: null for coop's shared grid,
-- the caller's own id in compete.
create or replace function crosswords._require_cell_write(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller uuid;
  v_mode text;
  v_ended_at timestamptz;
begin
  v_caller := common._require_game_player(p_game_id);
  select mode, ended_at into v_mode, v_ended_at from common.games where id = p_game_id;
  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = v_caller) = 'conceded' then
    perform common._raise_already_conceded();
  end if;
  return case when v_mode = 'coop' then null else v_caller end;
end;
$$;
revoke execute on function crosswords._require_cell_write(uuid) from public;

drop function if exists crosswords.set_cell(uuid, int, int, text, boolean);

-- ============================================================
-- crosswords.set_cell — the hot path (one call per keystroke)
-- ============================================================
-- Writes a fill into the caller's grid (coop's shared grid, or the caller's
-- own in compete), clears `wrong`, sets `pencil`. Mirrors applyFill: given
-- cells are immutable (and have no row); a REVEALED cell IS editable and
-- keeps its `revealed` flag. Then runs the solved check, which ends the game
-- on a complete, correct grid.
--
-- Returns the new per-cell version (so the FE adopts it and its own CDC echo
-- is a no-op) and whether the caller's grid is now solved. No outcome: typing
-- a letter is not adjudicated, and the cell is already on screen
-- optimistically.
--
-- The game row is locked only for the fill that completes the grid, so that
-- two finishing fills can't both end the game; every other keystroke goes
-- straight to its cell.
create or replace function crosswords.set_cell(
  p_game_id uuid,
  p_row int,
  p_col int,
  p_fill text,
  p_pencil boolean
)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_owner     uuid;
  v_fill      text;
  v_pencil    boolean;
  v_version   bigint;
  v_solved    boolean;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  v_owner := crosswords._require_cell_write(p_game_id);

  if p_fill is null or char_length(p_fill) = 0 then
    v_fill := null;
  else
    v_fill := upper(p_fill);
    -- Mirror crossplay's `^[A-Z]{1,8}$` (ws.ts): letters only, 1–8 chars. A
    -- fault: the FE checks the same before sending, so a stray non-letter did
    -- not come from our grid. (An empty fill clears the cell — above.)
    if v_fill !~ '^[A-Z]{1,8}$' then
      raise exception 'BUG: a fill that is not letters'
        using errcode = 'PN466', hint = 'fault', column = '_',
      detail = 'a cell fill is 1 to 8 letters';
    end if;
  end if;
  v_pencil := coalesce(p_pencil, false) and v_fill is not null;

  update crosswords.cells c
     set fill = v_fill, wrong = false, pencil = v_pencil
   where c.game_id = p_game_id
     and c.owner_id is not distinct from v_owner
     and c.row = p_row and c.col = p_col
  returning c.version into v_version;
  if not found then
    -- Also a fault: the grid renders blocks and givens as non-focusable, so a
    -- write to one could not have come from a keystroke on our board.
    raise exception 'BUG: a write to a block or a given'
      using errcode = 'PN467', hint = 'fault', column = '_',
      detail = 'that cell is a block or a given';
  end if;

  v_solved := crosswords._is_solved(p_game_id, v_owner);
  if v_solved then
    perform 1 from crosswords.games where game_id = p_game_id for update;
    v_solved := crosswords._maybe_finish(p_game_id, v_owner, auth.uid());
  end if;

  return common._ok_envelope(jsonb_build_object(
    'result', 'set', 'version', v_version, 'solved', v_solved));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.set_cell(uuid, int, int, text, boolean) from public;
grant execute on function crosswords.set_cell(uuid, int, int, text, boolean) to authenticated;

drop function if exists crosswords.set_mark(uuid, int, int, text, text);

-- ============================================================
-- crosswords.set_mark — cryptic edge marks (display-only annotations)
-- ============================================================
-- Sets / clears a word-break or hyphen mark on ONE edge of the caller's
-- grid cell (coop's shared grid, or the caller's own in compete). Marks
-- are player annotations, NOT gameplay — no solve check runs. Only fillable
-- cells have rows, so a mark aimed at a given cell finds no row and is
-- rejected. The version trigger bumps `version`, so the mark syncs via the
-- same useCells CDC path as a fill; the RPC returns the new version so the
-- FE's own echo is a no-op.
create or replace function crosswords.set_mark(
  p_game_id uuid,
  p_row int,
  p_col int,
  p_side text,
  p_mark text
)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_owner     uuid;
  v_version   bigint;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  v_owner := crosswords._require_cell_write(p_game_id);
  if p_side not in ('right', 'bottom') then
    -- Both this and the mark below are faults: the value comes from the
    -- frontend's own typed union.
    raise exception 'BUG: a mark on an unknown edge'
      using errcode = 'PN470', hint = 'fault', column = '_',
      detail = 'a mark''s side must be right or bottom';
  end if;
  if p_mark is not null and p_mark not in ('break', 'hyphen') then
    raise exception 'BUG: a mark of an unknown kind'
      using errcode = 'PN471', hint = 'fault', column = '_',
      detail = 'mark must be break, hyphen or null';
  end if;

  -- Update only the targeted edge; leave the other edge's mark untouched.
  update crosswords.cells c
     set mark_right  = case when p_side = 'right'  then p_mark else c.mark_right  end,
         mark_bottom = case when p_side = 'bottom' then p_mark else c.mark_bottom end
   where c.game_id = p_game_id
     and c.owner_id is not distinct from v_owner
     and c.row = p_row and c.col = p_col
  returning c.version into v_version;
  if not found then
    raise exception 'BUG: a mark on a block or a given'
      using errcode = 'PN472', hint = 'fault', column = '_',
      detail = 'that cell is a block or a given';
  end if;

  return common._ok_envelope(jsonb_build_object('result', 'marked', 'version', v_version));
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.set_mark(uuid, int, int, text, text) from public;
grant execute on function crosswords.set_mark(uuid, int, int, text, text) to authenticated;

drop function if exists crosswords.check_cells(uuid, jsonb);

-- ============================================================
-- crosswords.check_cells — flag the wrong fills
-- ============================================================
-- The FE resolves letter/word/puzzle scope via cursor.ts and sends the target
-- coordinates as a jsonb array of {row, col}. The server never trusts the FE
-- about correctness — only about which cells were asked.
--
-- Flags/unflags `wrong` against the solution, skipping empty and pencil
-- cells (givens have no row). Available in both modes; wrong is
-- self-informative, not answer-leaking. Answers with how many it flagged, so
-- "checked, all correct" and "checked nothing" are told apart.
create or replace function crosswords.check_cells(p_game_id uuid, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_owner     uuid;
  v_wrong int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;
  v_owner := crosswords._require_cell_write(p_game_id);

  update crosswords.cells c
     set wrong = not crosswords._matches(c.fill, g.solution -> c.row::int -> c.col::int)
    from crosswords.games g
   where g.game_id = c.game_id
     and c.game_id = p_game_id
     and c.owner_id is not distinct from v_owner
     and c.fill is not null
     and c.pencil = false
     and exists (
       select 1 from jsonb_array_elements(p_cells) e
        where (e ->> 'row')::int = c.row and (e ->> 'col')::int = c.col
     );

  select count(*) into v_wrong
    from crosswords.cells c
   where c.game_id = p_game_id
     and c.owner_id is not distinct from v_owner
     and c.wrong
     and exists (
       select 1 from jsonb_array_elements(p_cells) e
        where (e ->> 'row')::int = c.row and (e ->> 'col')::int = c.col
     );

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object(
    'result', 'checked', 'wrong_count', v_wrong));
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.check_cells(uuid, jsonb) from public;
grant execute on function crosswords.check_cells(uuid, jsonb) to authenticated;

drop function if exists crosswords.reveal_cells(uuid, jsonb);

-- ============================================================
-- crosswords.reveal_cells — fill the asked cells with the answer
-- ============================================================
-- Writes the canonical answer + revealed, clears wrong/pencil. COOP ONLY
-- (reveal-all would trivially win the compete race).
--
-- Revealing can complete the grid — including "Reveal puzzle", which fills
-- the whole thing — and that ends the game as an ordinary coop solve, on
-- purpose: waffle/wordle offer Reveal only once the game is over, because
-- those are guess-economy games where the answer IS the contest. A crossword
-- isn't competitive that way — reveal is a scoped, incremental solving aid
-- (letter / word / puzzle), and there's no honest line between "revealed one
-- letter" and "gave up". So a finished grid is a finished grid
-- (docs/games/crosswords.md §9). `solved` is in the answer because a reveal
-- that completes the grid is how a crossword ends, and the call site has to
-- know whether this one did.
create or replace function crosswords.reveal_cells(p_game_id uuid, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_solved boolean;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;
  perform common._require_game_player(p_game_id);
  if (select mode from common.games where id = p_game_id) <> 'coop' then
    -- A fault: mode is fixed at create_game and the FE hides the reveal items
    -- in compete, so nothing unbroken asks.
    raise exception 'BUG: a reveal in a compete game'
      using errcode = 'PN475', hint = 'fault', column = '_',
      detail = 'revealing your own grid would trivially win a race';
  end if;
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  update crosswords.cells c
     set fill = (g.solution -> c.row::int -> c.col::int ->> 0),
         revealed = true, wrong = false, pencil = false
    from crosswords.games g
   where g.game_id = c.game_id
     and c.game_id = p_game_id
     and c.owner_id is null
     and g.solution -> c.row::int -> c.col::int is not null
     -- Skip a (degenerate) empty solution array: crossplay's revealAt does the
     -- same. `->> 0` on `[]` is null, so without this the reveal would blank
     -- the cell + flag it revealed. Never happens with real puzzles.
     and jsonb_array_length(g.solution -> c.row::int -> c.col::int) > 0
     and exists (
       select 1 from jsonb_array_elements(p_cells) e
        where (e ->> 'row')::int = c.row and (e ->> 'col')::int = c.col
     );

  v_solved := crosswords._maybe_finish(p_game_id, null, auth.uid());

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object(
    'result', 'revealed', 'solved', v_solved));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.reveal_cells(uuid, jsonb) from public;
grant execute on function crosswords.reveal_cells(uuid, jsonb) to authenticated;

drop function if exists crosswords.replay_board(uuid);

-- ============================================================
-- crosswords.replay_board — solve this puzzle again from scratch
-- ============================================================
-- The "Restart" game-menu item / terminal-row Restart, and the only
-- board-clearing action. Wipes every cell of the puzzle — fill, pencil,
-- wrong/revealed marks, and the scribbled edge marks — for EVERY owner, then
-- hands the common half to `common._reset_game`. A restart is a whole-table
-- thing in every game, so a compete restart re-opens the race for everyone.
--
-- The solution re-shields on its own: `_solution_for` shows it only once the
-- game has ended, which the reset undoes, so a replayed puzzle starts
-- covered. (The FE puts its own local reveal away too — see handleRestart —
-- because the answers it already fetched are cached client-side.)
--
-- Any game player may call it, mid-game or after the game ends (no ended
-- check — it's a restart; the FE confirms mid-game).
create or replace function crosswords.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update crosswords.cells c
     set fill = null, pencil = false, wrong = false, revealed = false,
         mark_right = null, mark_bottom = null
   where c.game_id = p_game_id;

  update common.game_players set solved_at = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.replay_board(uuid) from public;
grant execute on function crosswords.replay_board(uuid) to authenticated;

drop function if exists crosswords.reveal_solved_word(uuid, jsonb);

-- ============================================================
-- crosswords.reveal_solved_word — leak-safe answer read for "Explain clue"
-- ============================================================
-- Returns the answer for a set of cells ONLY IF the caller has already filled
-- them all in CORRECTLY (per `_matches`, honoring givens). This is the whole
-- privacy story: the AI clue-explainer needs the canonical answer, but the
-- answer is shielded — so we only ever hand back letters the caller has
-- already solved. A player probing cells they haven't solved gets `solved =
-- false` and no letters, so it leaks nothing (works in compete too: you can
-- only explain your own correctly-filled word). Also returns the puzzle note
-- (not secret — the FE has it) so the edge function can pass it to the model
-- as context in one round trip.
--
-- TWO `ok`s, because "you have solved this word" and "not yet" are different
-- answers. `unsolved` is an ordinary answer, not a refusal: the menu item is
-- live on any clue because the frontend cannot see which are solved.
create or replace function crosswords.reveal_solved_word(p_game_id uuid, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller         uuid;
  v_owner          uuid;
  v_puzzle_content jsonb;
  v_solution       jsonb;
  v_answer         text := '';
  v_solved         boolean := true;
  e                jsonb;
  r                int;
  c                int;
  v_tmpl           jsonb;
  v_sols           jsonb;
  v_given          boolean;
  v_fill           text;
  v_note           text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first: a friend may delete the game from the club list at any
  -- moment, and the delete takes the memberships with it (docs/envelopes.md →
  -- a missing game row is PN485).
  select puzzle_content, solution into v_puzzle_content, v_solution
    from crosswords.games where game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;
  v_caller := common._require_game_player(p_game_id);
  v_owner := case when (select mode from common.games where id = p_game_id) = 'coop'
                  then null else v_caller end;
  v_note := v_puzzle_content ->> 'note';

  -- Cells arrive in reading order (the FE's word-cell order); jsonb arrays
  -- preserve order, so the concatenation yields the answer left-to-right.
  for e in select value from jsonb_array_elements(p_cells) loop
    r := (e ->> 'row')::int;
    c := (e ->> 'col')::int;
    v_tmpl := v_puzzle_content -> 'cells' -> r -> c;
    v_sols := v_solution -> r -> c;
    if v_tmpl is null or v_tmpl ->> 'kind' <> 'cell' or v_sols is null then
      v_solved := false;
      continue;
    end if;
    -- Answer = the first accepted solution per cell (Schrödinger primary).
    v_answer := v_answer || upper(coalesce(v_sols ->> 0, ''));
    -- The caller's fill: given cells carry theirs on the template; fillable
    -- cells in the caller's own grid rows.
    v_given := coalesce((v_tmpl ->> 'given')::boolean, false);
    if v_given then
      v_fill := upper(coalesce(v_tmpl ->> 'fill', ''));
    else
      select upper(coalesce(cl.fill, '')) into v_fill
        from crosswords.cells cl
       where cl.game_id = p_game_id
         and cl.owner_id is not distinct from v_owner
         and cl.row = r and cl.col = c;
      v_fill := coalesce(v_fill, '');
    end if;
    if v_fill = '' or not crosswords._matches(v_fill, v_sols) then
      v_solved := false;
    end if;
  end loop;

  if v_solved then
    return common._ok_envelope(jsonb_build_object(
      'result', 'solved', 'answer', v_answer, 'solved', true, 'note', v_note));
  end if;
  return common._ok_envelope(jsonb_build_object(
    'result', 'unsolved', 'answer', null, 'solved', false, 'note', v_note));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.reveal_solved_word(uuid, jsonb) from public;
grant execute on function crosswords.reveal_solved_word(uuid, jsonb) to authenticated;

drop function if exists crosswords.export_solution(uuid);

-- ============================================================
-- crosswords.export_solution — the answer grid for a download
-- ============================================================
-- The full answer grid for the "Download as .ipuz" export and the answer-key
-- PDF.
--
-- NAMED DELIBERATELY UNLIKE `_solution_for` above. The two have OPPOSITE
-- shielding semantics — that one shows the answer only once the game has
-- ended, this one hands a member the grid at any time — so the names differ
-- at a glance.
--
-- Unlike `games_state`, export needs the whole grid at ANY time so a
-- downloaded file carries real answers. Handing the solution to the client
-- on demand relaxes the shielding, which the friends-only trust model
-- tolerates (CLAUDE.md → Trust model); it's a deliberate, member-gated
-- exception, not the solving path.
create or replace function crosswords.export_solution(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_solution jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- The row first, read by `found` rather than by the blob, so a missing game
  -- is never a null solution: a friend may delete the game from the club list
  -- at any moment, and the delete takes the memberships with it
  -- (docs/envelopes.md → a missing game row is PN485).
  select g.solution into v_solution
    from crosswords.games g where g.game_id = p_game_id;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;

  perform common._require_game_player(p_game_id);

  return common._ok_envelope(jsonb_build_object(
    'result', 'exported', 'solution', v_solution));
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.export_solution(uuid) from public;
grant execute on function crosswords.export_solution(uuid) to authenticated;

drop function if exists crosswords.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists crosswords.end_game(uuid);

-- ============================================================
-- crosswords.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, with no result (putting
-- down an unfinished crossword is normal). The solution reveals once the
-- game has ended.
--
-- Offered in BOTH modes. Coop's Stop and compete's Concede are different acts
-- — conceding is one racer's loss, stopping is the whole table agreeing there
-- is no result — and a race can want the second without the first: the
-- crossword is too hard and everyone is done.
create or replace function crosswords.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the winning fill waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- replay_board.
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;

  perform common._stop(p_game_id);

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.stop_game(uuid) from public;
grant execute on function crosswords.stop_game(uuid) to authenticated;

drop function if exists crosswords.concede(uuid);

-- ============================================================
-- crosswords.concede — a racer drops out of a compete game
-- ============================================================
-- A crossword racer can't end any other way but solving, which ends the
-- game, so `common._concede` decides it all: it records the concession, and
-- when the last racer concedes ends the game as a loss for everyone.
-- Compete only (coop ends via the shared Stop).
create or replace function crosswords.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.concede(uuid) from public;
grant execute on function crosswords.concede(uuid) to authenticated;

drop function if exists crosswords.submit_timeout(uuid);

-- ============================================================
-- crosswords.submit_timeout — countdown expiry
-- ============================================================
-- The setup form offers the shared TimerField, so a countdown can expire.
-- Fired by every connected client when it hits 0; the first ends the game,
-- the rest find it ended and answer the game-over race. Nobody completed the
-- grid, so nobody is ranked and everyone lost, in either mode. crosswords
-- has no turn order, so nobody is recorded as ending it.
create or replace function crosswords.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so the timeout and a winning fill serialize. The row check comes
  -- before the membership gate — see replay_board.
  perform 1 from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;

  perform common._require_game_player(p_game_id);
  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout', null,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform crosswords._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function crosswords.submit_timeout(uuid) from public;
grant execute on function crosswords.submit_timeout(uuid) to authenticated;
