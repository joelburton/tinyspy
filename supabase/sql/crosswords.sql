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
--   - The solution is on the game row but never granted; the page blobs carry
--     it once the game has ended.
--   - A grid is one row of `crosswords.grids`, a sparse jsonb keyed by place:
--     one shared grid in coop, one per player in compete. Every write to a
--     grid locks the game row first and rebuilds the page blobs, so the
--     builds serialize and none misses another's letter.
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

-- `crosswords.grids` has no grant to authenticated: the page reads the grids
-- through the blobs on common.games, and every write is a definer RPC below.

-- The trigger that bumped a per-cell version on the table the grids replaced;
-- supabase/sql is re-applied, not diffed.
drop function if exists crosswords._bump_cell_version();

-- ============================================================
-- crosswords._cell_key — a cell's key in a grid
-- ============================================================
-- "row,col", the key a grid's `cells` object stores a cell under and the id
-- the page gives it.
create or replace function crosswords._cell_key(p_row int, p_col int)
returns text
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select p_row || ',' || p_col;
$$;
revoke execute on function crosswords._cell_key(int, int) from public;

-- ============================================================
-- crosswords._fillable_cells — the cells a player writes
-- ============================================================
-- Every open, non-given cell of a puzzle's template, with its place. A given
-- is the author's and has no place in a grid; a block is no cell at all.
create or replace function crosswords._fillable_cells(p_puzzle_content jsonb)
returns table ("row" int, col int, key text)
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select (rr.ord - 1)::int, (cc.ord - 1)::int,
         crosswords._cell_key((rr.ord - 1)::int, (cc.ord - 1)::int)
    from jsonb_array_elements(p_puzzle_content -> 'cells') with ordinality as rr(rowval, ord)
    cross join lateral jsonb_array_elements(rr.rowval) with ordinality as cc(cellval, ord)
   where cc.cellval ->> 'kind' = 'cell'
     and coalesce((cc.cellval ->> 'given')::boolean, false) = false;
$$;
revoke execute on function crosswords._fillable_cells(jsonb) from public;

-- ============================================================
-- crosswords._make_starting_cells — a grid as the template starts it
-- ============================================================
-- The cells a grid starts with, which `create_game` writes and `replay_board`
-- writes again, so a Restart starts exactly where the game did.
--
-- A cell's `fill` comes from the template cell's `fill` when present —
-- normally absent (a blank library / NYT template), but an uploaded
-- PARTIALLY-SOLVED `.ipuz` carries the solver's saved fills on its non-given
-- cells (the ipuz `saved` grid, applied into the template by the parser), so
-- a half-finished puzzle imports where you left off — the crossplay behavior
-- (its `saved` round-trip). Uppercased to match set_cell.
--
-- `markRight` / `markBottom` come from the template cell's cryptic edge
-- marks. These are normally player-drawn (set_mark), but a template can
-- arrive WITH marks: the NYT overlay-PNG import applies author-drawn
-- word-break bars onto the template's cells (see nytOverlay.ts). Seeding them
-- into the grid is what puts them on the display path — the board and the
-- PDFs read marks from the grid, not from the template — so overlay bars
-- render like any other mark. (A player can still clear one with `|`/`_`;
-- crossplay accepts the same, an author bar is not immutable.)
create or replace function crosswords._make_starting_cells(p_puzzle_content jsonb)
returns jsonb
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select coalesce(jsonb_object_agg(f.key, seeded), '{}'::jsonb)
    from crosswords._fillable_cells(p_puzzle_content) f
    cross join lateral (select jsonb_strip_nulls(jsonb_build_object(
           'fill',       upper(nullif(p_puzzle_content -> 'cells' -> f.row -> f.col ->> 'fill', '')),
           'markRight',  nullif(p_puzzle_content -> 'cells' -> f.row -> f.col ->> 'markRight', ''),
           'markBottom', nullif(p_puzzle_content -> 'cells' -> f.row -> f.col ->> 'markBottom', '')
         )) as seeded) s
   where seeded <> '{}'::jsonb;
$$;
revoke execute on function crosswords._make_starting_cells(jsonb) from public;

-- ============================================================
-- crosswords._merge_cell — a grid with one cell's keys changed
-- ============================================================
-- `p_changes` holds the keys to set, and a key set to null is removed. A cell
-- left with no keys leaves the grid, so a blank grid stays `{}`. Called inside
-- the one `update … set cells = …` that writes a grid, never read into a
-- variable and written back.
create or replace function crosswords._merge_cell(p_cells jsonb, p_key text, p_changes jsonb)
returns jsonb
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select case when merged = '{}'::jsonb then p_cells - p_key
              else jsonb_set(p_cells, array[p_key], merged) end
    from (select jsonb_strip_nulls(coalesce(p_cells -> p_key, '{}'::jsonb) || p_changes) as merged) m;
$$;
revoke execute on function crosswords._merge_cell(jsonb, text, jsonb) from public;

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
-- solve; a pencil cell does NOT (it counts if right). Given cells have no
-- place in a grid — they're author-correct by construction — so they're
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
      from crosswords.games g
      join crosswords.grids gr on gr.game_id = g.game_id
                              and gr.owner_id is not distinct from p_owner_id
      cross join lateral crosswords._fillable_cells(g.puzzle_content) f
     where g.game_id = p_game_id
       and not crosswords._matches(gr.cells -> f.key ->> 'fill', g.solution -> f.row -> f.col)
  );
$$;
revoke execute on function crosswords._is_solved(uuid, uuid) from public;

-- The view and its definer that showed the solution once the game had ended;
-- the page blobs carry it now (`_make_json_puzzle`). supabase/sql is
-- re-applied, not diffed.
drop view if exists crosswords.games_state;
drop function if exists crosswords._solution_for(uuid);

-- The statuses' writer, replaced by the page blobs below.
drop function if exists crosswords._write_statuses(uuid, boolean);

-- ============================================================
-- The page blobs — what the page shows, written by this game's builder
-- ============================================================
-- `_rebuild_data_cols` writes everything a page shows onto `common.games` after
-- every move (plans/seat-view.md → The page is written, not assembled):
-- `shell_data` through `common._make_json_shell_data`, and these two of
-- crosswords' own, each builder bearing its column's name. `game_data` is the
-- common part (supabase/sql/common.sql → The page blobs' common parts) with
-- crosswords' facts on top; the pieces below build each part, so `select
-- game_data from common.games` shows the page what it gets.
--
--   game_data, crosswords' part:
--     puzzle                       the template as the parsers write it (id,
--                                  title, author, copyright, note, width,
--                                  height, clues, cells), frozen at create,
--                                  plus `solution`, null until the game ends
--     revision                     raised by every rebuild; set_cell and
--                                  set_mark answer the one their rebuild wrote
--     team: {board}                coop's one grid; null in compete
--     players: [player, …]         the common player, plus:
--       board                      the racer's own grid in compete; null in
--                                  coop, whose grid is the team's
--
--   a board, packed, since it is rebuilt on every keystroke:
--     fills                        flat, row by row: one string per cell, ""
--                                  when empty, a given or a block; a penciled
--                                  letter lowercase
--     wrong, revealed              flat cell indices (row × width + col)
--     breaksRight, hyphensRight,
--     breaksBottom, hyphensBottom  flat cell indices
--     writers                      coop: one digit per cell, 0 nobody, else
--                                  the writer's 1-based place in `players`;
--                                  null in compete
--
--   summary_data, crosswords' part (the common part names and dates the game
--   and carries its ending; the winner is `ending.winner`):
--     nCells                       the cells a player fills
--     team: {nFilledCells}         coop's filled cells; null in compete

-- One grid, packed. `p_writer_ids` is the players in their order in
-- `players`, for the writer digits; null in compete, which writes none.
create or replace function crosswords._make_json_board(
  p_puzzle_content jsonb,
  p_cells jsonb,
  p_writer_ids uuid[]
)
returns jsonb
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  with places as (
    select i, cell
      from generate_series(
             0, (p_puzzle_content ->> 'width')::int * (p_puzzle_content ->> 'height')::int - 1) i
      cross join lateral (select p_cells -> crosswords._cell_key(
                                   i / (p_puzzle_content ->> 'width')::int,
                                   i % (p_puzzle_content ->> 'width')::int) as cell) c
  )
  select jsonb_build_object(
    'fills',         jsonb_agg(case when cell ->> 'fill' is null then ''
                                    when (cell ->> 'pencil')::boolean then lower(cell ->> 'fill')
                                    else cell ->> 'fill' end order by i),
    'wrong',         coalesce(jsonb_agg(i order by i) filter (where (cell ->> 'wrong')::boolean), '[]'::jsonb),
    'revealed',      coalesce(jsonb_agg(i order by i) filter (where (cell ->> 'revealed')::boolean), '[]'::jsonb),
    'breaksRight',   coalesce(jsonb_agg(i order by i) filter (where cell ->> 'markRight' = 'break'), '[]'::jsonb),
    'hyphensRight',  coalesce(jsonb_agg(i order by i) filter (where cell ->> 'markRight' = 'hyphen'), '[]'::jsonb),
    'breaksBottom',  coalesce(jsonb_agg(i order by i) filter (where cell ->> 'markBottom' = 'break'), '[]'::jsonb),
    'hyphensBottom', coalesce(jsonb_agg(i order by i) filter (where cell ->> 'markBottom' = 'hyphen'), '[]'::jsonb),
    'writers',       case when p_writer_ids is not null then
                       string_agg(coalesce(array_position(p_writer_ids, (cell ->> 'writer')::uuid), 0)::text,
                                  '' order by i) end)
    from places;
$$;

revoke execute on function crosswords._make_json_board(jsonb, jsonb, uuid[]) from public;

-- The template, and the solution once the game has ended (wordle's rule; the
-- column grant keeps it from any client read).
create or replace function crosswords._make_json_puzzle(g crosswords.games, p_ended boolean)
returns jsonb
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select g.puzzle_content || jsonb_build_object(
    'solution', case when p_ended then g.solution end);
$$;

revoke execute on function crosswords._make_json_puzzle(crosswords.games, boolean) from public;

-- The players' ids in their order in `players`, for the writer digits.
create or replace function crosswords._writer_ids(p_game_id uuid)
returns uuid[]
language sql
stable
set search_path = crosswords, common, public, extensions
as $$
  select array_agg(cp.id order by cp.ord) from common._make_json_players(p_game_id) cp;
$$;

revoke execute on function crosswords._writer_ids(uuid) from public;

-- What the team shares: coop's one grid. Null in compete, where there is no
-- team (plans/team-facts.md).
create or replace function crosswords._make_json_team(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = crosswords, common, public, extensions
as $$
  select case when cg.mode = 'coop' then jsonb_build_object(
           'board', crosswords._make_json_board(
                      g.puzzle_content, gr.cells, crosswords._writer_ids(p_game_id)))
         end
    from crosswords.games g
    join common.games cg on cg.id = g.game_id
    left join crosswords.grids gr on gr.game_id = g.game_id and gr.owner_id is null
   where g.game_id = p_game_id;
$$;

revoke execute on function crosswords._make_json_team(uuid) from public;

-- Every player as crosswords' game_data shows them: the common player, with
-- their own grid in compete. In coop the grid is the team's, and `board` is
-- null here.
create or replace function crosswords._make_json_players(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = crosswords, common, public, extensions
as $$
  select jsonb_agg(
           cp.player || jsonb_build_object(
             'board', case when gr.id is not null
                        then crosswords._make_json_board(g.puzzle_content, gr.cells, null) end)
           order by cp.ord)
    from common._make_json_players(p_game_id) cp
    join crosswords.games g on g.game_id = p_game_id
    left join crosswords.grids gr on gr.game_id = p_game_id and gr.owner_id = cp.id;
$$;

revoke execute on function crosswords._make_json_players(uuid) from public;

-- The whole game_data blob: the common part, with crosswords' puzzle,
-- revision, team and players on top.
create or replace function crosswords._make_json_game_data(p_game_id uuid)
returns jsonb
language sql
stable
set search_path = crosswords, common, public, extensions
as $$
  select common._make_json_game_data(p_game_id) || jsonb_build_object(
           'puzzle',   crosswords._make_json_puzzle(g, cg.ended_at is not null),
           'revision', g.revision,
           'team',     crosswords._make_json_team(p_game_id),
           'players',  crosswords._make_json_players(p_game_id))
    from crosswords.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function crosswords._make_json_game_data(uuid) from public;

-- The game summed up: how much of coop's grid is filled, so the club list can
-- say "60% filled". A racer's grid is their own, so compete has no team count.
create or replace function crosswords._make_json_summary_data(
  p_game_id uuid,
  p_status_changed_at timestamptz
)
returns jsonb
language sql
stable
set search_path = crosswords, common, public, extensions
as $$
  select common._make_json_summary_data(p_game_id, p_status_changed_at) || jsonb_build_object(
    'nCells', (select count(*) from crosswords._fillable_cells(g.puzzle_content)),
    'team',   case when cg.mode = 'coop' then jsonb_build_object(
                'nFilledCells', (select count(*)
                                   from crosswords.grids gr, jsonb_each(gr.cells) e(k, v)
                                  where gr.game_id = p_game_id and gr.owner_id is null
                                    and v ? 'fill'))
              end)
    from crosswords.games g
    join common.games cg on cg.id = g.game_id
   where g.game_id = p_game_id;
$$;

revoke execute on function crosswords._make_json_summary_data(uuid, timestamptz) from public;

-- ============================================================
-- crosswords._rebuild_data_cols — one game's data columns, rebuilt
-- ============================================================
-- Raises the game's revision, then rebuilds the page blobs (`game_data`,
-- `summary_data`, and `shell_data` through `common._make_json_shell_data`)
-- from crosswords' own tables, assigning each whole. Every RPC calls it after
-- a move, holding the game row's lock, so revisions follow the order the moves
-- commit in; it is also the repair for one game by hand. Every key is always
-- present, null when it has no value; the shapes are drawn above.
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function crosswords._rebuild_data_cols(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_status_changed_at timestamptz;
begin
  update crosswords.games set revision = revision + 1 where game_id = p_game_id;

  -- One instant for the column and the blob's copy of it.
  select case when p_update_status_changed_at then now() else status_changed_at end
    into v_status_changed_at
    from common.games where id = p_game_id;

  update common.games
     set game_data = crosswords._make_json_game_data(p_game_id),
         summary_data = crosswords._make_json_summary_data(p_game_id, v_status_changed_at),
         shell_data = common._make_json_shell_data(p_game_id),
         status_changed_at = v_status_changed_at
   where id = p_game_id;
end;
$$;

revoke execute on function crosswords._rebuild_data_cols(uuid, boolean) from public;

-- ============================================================
-- crosswords._rebuild_data_cols_for_all — every crosswords game's, rebuilt
-- ============================================================
-- For a shape change, or a game created before its builder knew the blobs:
-- `_rebuild_data_cols` over every crosswords game without re-dating any, and
-- answers how many it rewrote. Run by hand as postgres (`gmake db-psql`); no
-- client calls it, so it has no grant and wears the `_`.
create or replace function crosswords._rebuild_data_cols_for_all()
returns int
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_count int := 0;
  v_game_id uuid;
begin
  for v_game_id in
    select id from common.games where gametype in ('crosswords_coop', 'crosswords_compete')
  loop
    perform crosswords._rebuild_data_cols(v_game_id, p_update_status_changed_at => false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function crosswords._rebuild_data_cols_for_all() from public;

-- ============================================================
-- crosswords._lock_game — the game row, locked, before any write
-- ============================================================
-- Every RPC that writes takes the game row's lock first, so its rebuild of the
-- page blobs reads every grid write committed before it, and the revisions
-- follow the order of the writes. A missing row is the shared race: a friend
-- deleted the game from the club list. Asked before the membership gate, since
-- the delete takes the memberships with it (docs/envelopes.md → a missing
-- game row is PN485). Returns the row.
create or replace function crosswords._lock_game(p_game_id uuid)
returns crosswords.games
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  g crosswords.games;
begin
  select * into g from crosswords.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('crosswords');
  end if;
  return g;
end;
$$;
revoke execute on function crosswords._lock_game(uuid) from public;

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
-- finds the game over, and rebuilds the page blobs after. Returns whether the
-- grid is solved, whoever ended the game.
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
-- Either way one grid is inserted (one shared grid for coop; one per player
-- for compete).
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

  -- One grid per owner: one shared grid (owner null) for coop, one per player
  -- for compete, each holding what the template starts it with (an upload's
  -- saved fills, an NYT overlay's bars; see `_make_starting_cells`).
  insert into crosswords.grids (game_id, owner_id, cells)
  select new_id, o.owner, crosswords._make_starting_cells(v_puzzle_content)
    from unnest(
      case when p_mode = 'coop' then array[null::uuid] else p_player_user_ids end
    ) as o(owner);

  perform crosswords._rebuild_data_cols(new_id, p_update_status_changed_at => true);

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

-- ============================================================
-- crosswords._is_fillable — may a player write this cell?
-- ============================================================
-- True iff (`p_row`, `p_col`) is an open, non-given cell of the template. The
-- bounds are asked first: a negative jsonb index counts from the end.
create or replace function crosswords._is_fillable(p_puzzle_content jsonb, p_row int, p_col int)
returns boolean
language sql
immutable
set search_path = crosswords, common, public, extensions
as $$
  select coalesce(
    p_row >= 0 and p_col >= 0
    and p_puzzle_content -> 'cells' -> p_row -> p_col ->> 'kind' = 'cell'
    and coalesce((p_puzzle_content -> 'cells' -> p_row -> p_col ->> 'given')::boolean, false) = false,
    false);
$$;
revoke execute on function crosswords._is_fillable(jsonb, int, int) from public;

drop function if exists crosswords.set_cell(uuid, int, int, text, boolean);

-- ============================================================
-- crosswords.set_cell — the hot path (one call per keystroke)
-- ============================================================
-- Writes a fill into the caller's grid (coop's shared grid, or the caller's
-- own in compete), clears `wrong`, sets `pencil`, and in coop names the
-- caller its writer. Mirrors applyFill: given cells are immutable (and have
-- no place in a grid); a REVEALED cell IS editable and keeps its `revealed`
-- flag. Then runs the solved check, which ends the game on a complete,
-- correct grid, and rebuilds the page blobs.
--
-- Answers the revision its rebuild wrote, so the page knows when a blob it
-- reads carries this letter, and whether the caller's grid is now solved. No
-- outcome: typing a letter is not adjudicated, and the cell is already on
-- screen.
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
  g           crosswords.games;
  v_owner     uuid;
  v_fill      text;
  v_pencil    boolean;
  v_solved    boolean;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := crosswords._lock_game(p_game_id);
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

  if not crosswords._is_fillable(g.puzzle_content, p_row, p_col) then
    -- Also a fault: the grid renders blocks and givens as non-focusable, so a
    -- write to one could not have come from a keystroke on our board.
    raise exception 'BUG: a write to a block or a given'
      using errcode = 'PN467', hint = 'fault', column = '_',
      detail = 'that cell is a block or a given';
  end if;

  update crosswords.grids gr
     set cells = crosswords._merge_cell(gr.cells, crosswords._cell_key(p_row, p_col), jsonb_build_object(
           'fill',   v_fill,
           'pencil', nullif(v_pencil, false),
           'wrong',  null,
           -- coop only: a racer's grid has one writer, its owner
           'writer', case when v_owner is null and v_fill is not null then auth.uid() end))
   where gr.game_id = p_game_id
     and gr.owner_id is not distinct from v_owner;

  v_solved := crosswords._maybe_finish(p_game_id, v_owner, auth.uid());

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object(
    'result', 'set',
    'revision', (select revision from crosswords.games where game_id = p_game_id),
    'solved', v_solved));

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
-- cells have a place in a grid, so a mark aimed at a given cell is refused.
-- Answers the revision its rebuild of the page blobs wrote, as set_cell does.
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
  g           crosswords.games;
  v_owner     uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := crosswords._lock_game(p_game_id);
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

  if not crosswords._is_fillable(g.puzzle_content, p_row, p_col) then
    raise exception 'BUG: a mark on a block or a given'
      using errcode = 'PN472', hint = 'fault', column = '_',
      detail = 'that cell is a block or a given';
  end if;

  -- Only the targeted edge's key; the other edge's mark is left as it is.
  update crosswords.grids gr
     set cells = crosswords._merge_cell(gr.cells, crosswords._cell_key(p_row, p_col),
           jsonb_build_object(case when p_side = 'right' then 'markRight' else 'markBottom' end, p_mark))
   where gr.game_id = p_game_id
     and gr.owner_id is not distinct from v_owner;

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object(
    'result', 'marked',
    'revision', (select revision from crosswords.games where game_id = p_game_id)));
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
-- cells (givens have no place in a grid). Available in both modes; wrong is
-- self-informative, not answer-leaking. Answers with how many it flagged, so
-- "checked, all correct" and "checked nothing" are told apart.
create or replace function crosswords.check_cells(p_game_id uuid, p_cells jsonb)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  g           crosswords.games;
  v_owner     uuid;
  v_wrong int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := crosswords._lock_game(p_game_id);
  v_owner := crosswords._require_cell_write(p_game_id);

  -- Every asked cell that holds a letter in pen, its `wrong` set or cleared.
  -- Each such cell has a fill, so none is left empty and the merge is a plain
  -- `||` of the checked cells over the grid.
  update crosswords.grids gr
     set cells = gr.cells || coalesce((
           select jsonb_object_agg(a.key, jsonb_strip_nulls((gr.cells -> a.key) || jsonb_build_object(
                    'wrong', nullif(not crosswords._matches(gr.cells -> a.key ->> 'fill',
                                                            g.solution -> a.row -> a.col), false))))
             from (select distinct (e ->> 'row')::int as row, (e ->> 'col')::int as col,
                          crosswords._cell_key((e ->> 'row')::int, (e ->> 'col')::int) as key
                     from jsonb_array_elements(p_cells) e) a
            where gr.cells -> a.key ->> 'fill' is not null
              and not coalesce((gr.cells -> a.key ->> 'pencil')::boolean, false)), '{}'::jsonb)
   where gr.game_id = p_game_id
     and gr.owner_id is not distinct from v_owner;

  select count(*) into v_wrong
    from crosswords.grids gr
    cross join lateral (select distinct crosswords._cell_key((e ->> 'row')::int, (e ->> 'col')::int) as key
                          from jsonb_array_elements(p_cells) e) a
   where gr.game_id = p_game_id
     and gr.owner_id is not distinct from v_owner
     and coalesce((gr.cells -> a.key ->> 'wrong')::boolean, false);

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
  g        crosswords.games;
  v_solved boolean;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  g := crosswords._lock_game(p_game_id);
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

  -- Every asked fillable cell takes the answer, `revealed`, and the revealer
  -- as its writer, its `wrong` and `pencil` cleared; its marks stay. Each has
  -- a fill now, so the merge is a plain `||` over the grid.
  update crosswords.grids gr
     set cells = gr.cells || coalesce((
           select jsonb_object_agg(a.key, jsonb_strip_nulls(coalesce(gr.cells -> a.key, '{}'::jsonb)
                    || jsonb_build_object(
                         'fill',     g.solution -> a.row -> a.col ->> 0,
                         'revealed', true,
                         'wrong',    null,
                         'pencil',   null,
                         'writer',   auth.uid())))
             from (select distinct (e ->> 'row')::int as row, (e ->> 'col')::int as col,
                          crosswords._cell_key((e ->> 'row')::int, (e ->> 'col')::int) as key
                     from jsonb_array_elements(p_cells) e) a
            where crosswords._is_fillable(g.puzzle_content, a.row, a.col)
              -- Skip a (degenerate) empty solution array: crossplay's revealAt
              -- does the same. `->> 0` on `[]` is null, so without this the
              -- reveal would flag a blank cell revealed. Never happens with
              -- real puzzles.
              and coalesce(jsonb_array_length(g.solution -> a.row -> a.col), 0) > 0), '{}'::jsonb)
   where gr.game_id = p_game_id
     and gr.owner_id is null;

  v_solved := crosswords._maybe_finish(p_game_id, null, auth.uid());

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
-- board-clearing action. Puts EVERY owner's grid back exactly as the game
-- started it (`_make_starting_cells`: an upload's saved fills and an NYT
-- overlay's bars come back; everything the players did goes), then hands the
-- common half to `common._reset_game`. A restart is a whole-table thing in
-- every game, so a compete restart re-opens the race for everyone.
--
-- The solution re-shields on its own: the page blobs carry it only once the
-- game has ended, which the reset undoes, so a replayed puzzle starts
-- covered.
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

  update crosswords.grids gr
     set cells = crosswords._make_starting_cells(g.puzzle_content)
    from crosswords.games g
   where g.game_id = gr.game_id
     and gr.game_id = p_game_id;

  update common.game_players set solved_at = null where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
    -- cells in the caller's own grid.
    v_given := coalesce((v_tmpl ->> 'given')::boolean, false);
    if v_given then
      v_fill := upper(coalesce(v_tmpl ->> 'fill', ''));
    else
      select upper(gr.cells -> crosswords._cell_key(r, c) ->> 'fill') into v_fill
        from crosswords.grids gr
       where gr.game_id = p_game_id
         and gr.owner_id is not distinct from v_owner;
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
-- Unlike the page blobs, which carry the solution only once the game has
-- ended, export needs the whole grid at ANY time so a downloaded file
-- carries real answers. Handing the solution to the client
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

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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

  perform crosswords._rebuild_data_cols(p_game_id, p_update_status_changed_at => true);
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
