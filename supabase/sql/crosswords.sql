-- ============================================================
-- crosswords — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for crosswords. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260706000000_crosswords.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema crosswords to authenticated;

-- Library browsing needs meta but never the answer. The presence of ANY
-- column grant flips the table to "only granted columns visible", so we
-- enumerate the safe columns and omit `solution`. A pgTAP test pins that
-- authenticated cannot select `solution`, so a future migration can't
-- silently regress it.
grant select (id, source, meta, created_at) on crosswords.puzzles to authenticated;

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
grant select (id, club_handle, mode, puzzle_id, meta, created_at)
  on crosswords.games to authenticated;

drop policy if exists games_select on crosswords.games;
create policy games_select on crosswords.games
  for select to authenticated
  using (common.is_club_member(club_handle));

grant select on crosswords.cells to authenticated;

-- Mode-aware visibility (modeled on wordle.guesses_select): coop — any
-- club member reads the shared grid; compete — you see only your own
-- rows until the game is terminal, when opponents' grids open up. NOTE:
-- this gates the RLS-filtered READ, not the Realtime payload — the FE's
-- useCells also drops incoming compete events whose owner_id != auth.uid()
-- (this repo does not rely on Realtime to withhold rows). Writes all go
-- through the definer RPCs below, which bypass RLS, so no write policy.
drop policy if exists cells_select on crosswords.cells;
create policy cells_select on crosswords.cells
  for select to authenticated
  using (
    exists (
      select 1
        from crosswords.games cg
        join common.games g on g.id = cg.id
       where cg.id = cells.game_id
         and common.is_club_member(cg.club_handle)
         and (cg.mode = 'coop' or cells.owner_id = (select auth.uid()) or g.is_terminal)
    )
  );

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
-- Match semantics + solved detection (mirrors crossplay ws.ts)
-- ============================================================

-- True iff `p_fill` is an acceptable answer for the per-cell solution
-- array `p_sols` (null for a block; length 1 normal; length > 1
-- Schrödinger — more than one acceptable candidate). Each candidate
-- accepts an exact match, and — for any multi-CHARACTER candidate (a
-- rebus answer like "HEART") — the bare first letter alone, a long-
-- standing NYT convention that saves typing on small screens. This
-- mirrors `fillMatchesSolution` (ws.ts): the first-letter shortcut is
-- keyed on the candidate STRING's length (`sol.length > 1` per candidate,
-- i.e. `length(s.ans) > 1` here), NOT on the number of candidates. A
-- Schrödinger cell whose candidates are all single letters gets no
-- first-letter shortcut; a normal cell with one multi-char answer does.
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

-- True iff every fillable cell in `p_owner_id`'s grid matches the solution
-- (`isPuzzleSolved`). An empty cell blocks solve; a pencil cell does NOT
-- (it counts if right). Given cells aren't in the table — they're
-- author-correct by construction — so they're implicitly satisfied.
create or replace function crosswords._is_solved(target_game uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
  select not exists (
    select 1
      from crosswords.cells c
      join crosswords.games g on g.id = c.game_id
     where c.game_id = target_game
       and c.owner_id is not distinct from p_owner_id
       and (c.fill is null
            or not crosswords._matches(c.fill, g.solution -> c.row::int -> c.col::int))
  );
$$;
revoke execute on function crosswords._is_solved(uuid, uuid) from public;

-- Terminal-only answer reveal: the shielded `solution` column, surfaced
-- (as jsonb) once the game is terminal and NULL before. The
-- security_invoker view keeps auth.uid() real so base-table RLS still
-- gates rows; the definer function reads the grant-hidden column.
create or replace function crosswords._solution_for(g_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
  select case when cg.is_terminal then g.solution else null end
    from crosswords.games g
    join common.games cg on cg.id = g.id
   where g.id = g_id;
$$;
revoke execute on function crosswords._solution_for(uuid) from public;
grant execute on function crosswords._solution_for(uuid) to authenticated;

drop view if exists crosswords.games_state;
create view crosswords.games_state with (security_invoker = true) as
  select g.id, g.club_handle, g.mode, g.puzzle_id, g.meta, g.created_at,
         crosswords._solution_for(g.id) as solution   -- NULL until terminal
    from crosswords.games g;
grant select on crosswords.games_state to authenticated;

-- ============================================================
-- library_for_club — the setup-form picker list, colored by club history
-- ============================================================
-- One row per library puzzle, plus a `status` saying whether THIS club has
-- played it, so the picker can paint a color bar per row and the club can
-- see at a glance which crossword to do next.
--
-- Why a FUNCTION, when connections answers the same question with a view
-- (connections.club_game_status):
--
--   * something SQL-side has to do the join either way — reaching
--     play_state means crosswords.games -> common.games, which is
--     CROSS-SCHEMA, and PostgREST's embed syntax doesn't resolve those
--     (code-conventions.md → "Cross-schema embeds").
--   * but a view can't do it HERE, because the join has to be OUTER and
--     the club is an input to it. A view exposing club_handle from the
--     games side is inner by construction: an unplayed puzzle's row has a
--     null club_handle, so the FE's `.eq('club_handle', …)` drops exactly
--     the rows the picker most wants to show. Hence a parameter.
--     (connections escapes this because its calendar is a date grid the FE
--     builds itself — it never needs the unplayed rows back from SQL.)
--   * one round trip means the list arrives already colored, instead of
--     painting rows and recoloring them a beat later.
--
-- It also slims the picker's payload by ~200×. The query this replaced was
-- `select id, meta`, and `meta` is the whole immutable template (grid
-- cells, numbering, blocks, circles, shading, givens) — ~12 kB for a 15×15
-- — of which the row renders four scalars.
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
--   'solved'   — some game in this club won it (coop `won` / compete
--                `won_compete`). Sticky: replaying can't un-solve it.
--   'playing'  — no win, but a game is live or was ended manually
--                ('playing', 'ended', and any future non-terminal state,
--                which is why this arm is written as "not a win and not a
--                loss" rather than an allow-list that a new state escapes).
--   'lost'     — games exist and every one lost (timeout, or all racers
--                conceding).
--   'unplayed' — this club has no game on this puzzle.
--
-- Mode is deliberately NOT a parameter: "have we done this puzzle" is a
-- question about the club, not about coop vs compete, so a puzzle the club
-- solved cooperatively shows solved in the compete dialog too.
-- ============================================================
-- crosswords.next_nyt_date_for_club — which NYT daily you get
-- ============================================================
-- The NYT tab picks by WEEKDAY, not by date: an NYT crossword's day IS its
-- difficulty (Monday easiest, Saturday hardest, Sunday bigger rather than
-- harder), so "give us a Tuesday" is the choice a solver actually wants to
-- make. This answers it — the most recent puzzle of that weekday that none of
-- the players being seated has already played.
--
-- WHY IT GENERATES INSTEAD OF SCANNING. connections and strands hold their
-- archives in a table, so their `next_puzzle_for_club` scans one. NYT is
-- fetched on demand and never stored (`crosswords.puzzles` is the curated CLI
-- library only, `source in ('library')`), so there is no archive to scan:
-- the candidate dates are COMPUTED, every seventh day back from the most
-- recent occurrence of `dow`, and only the games table is consulted.
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
-- Returns NULL when that weekday is used up — the edge function turns that
-- into `no-unplayed-weekday|`. Reachable only by a club that has played every
-- one of ~600 Mondays, but it is a real branch and it has copy.
create or replace function crosswords.next_nyt_date_for_club(seen_by uuid[], dow int)
returns date
language sql
stable
security definer
set search_path = crosswords, common, public, extensions
as $$
  select d::date
    from generate_series(
           -- The most recent `dow` on or before today. The modulo keeps it at
           -- today when today already IS that weekday.
           current_date - ((extract(dow from current_date)::int - dow + 7) % 7),
           date '2015-01-01',
           interval '-7 days'
         ) d
   where not exists (
           select 1
             from crosswords.games g
             join common.game_players gp on gp.game_id = g.id
            where g.puzzle_date = d::date
              and gp.user_id = any(seen_by)
         )
   limit 1;
$$;

revoke execute on function crosswords.next_nyt_date_for_club(uuid[], int) from public;
grant execute on function crosswords.next_nyt_date_for_club(uuid[], int) to authenticated;

create or replace function crosswords.library_for_club(target_club text)
returns table (
  id     uuid,
  title  text,
  author text,
  width  int,
  height int,
  status text
)
language sql
stable
security invoker
set search_path = crosswords, common, public, extensions
as $$
  -- Every column reference is table-qualified on purpose: the OUT columns
  -- above (`id`, `title`, `status`, …) shadow unqualified names, and
  -- `common.games` really does have `id`, `title` and `status` columns.
  select
    p.id,
    coalesce(nullif(btrim(p.meta ->> 'title'), ''), 'Untitled') as title,
    coalesce(btrim(p.meta ->> 'author'), '')                    as author,
    (p.meta ->> 'width')::int                                   as width,
    (p.meta ->> 'height')::int                                  as height,
    case
      when count(*) filter (
             where cg.play_state in ('won', 'won_compete')
           ) > 0 then 'solved'
      when count(*) filter (
             where cg.play_state is not null
               and cg.play_state not in
                   ('won', 'won_compete', 'lost', 'lost_compete')
           ) > 0 then 'playing'
      -- count(cg.id), NOT count(*): a LEFT JOIN that matched nothing still
      -- yields one row per puzzle, so count(*) is never 0 and every
      -- unplayed puzzle would report 'lost'.
      when count(cg.id) > 0 then 'lost'
      else 'unplayed'
    end as status
  from crosswords.puzzles p
  -- LEFT, and the club test rides on the JOIN rather than a WHERE: both so
  -- that a puzzle this club has never touched keeps its row. Moving
  -- `club_handle` into a WHERE would quietly turn this back into an inner
  -- join and hide every unplayed puzzle.
  left join crosswords.games xg
         on xg.puzzle_id = p.id
        and xg.club_handle = target_club
  left join common.games cg on cg.id = xg.id
  where p.source = 'library'
  -- Grouping by the PK lets the select + order reach p's other columns
  -- (functional dependency), so `meta` needn't be in the GROUP BY.
  group by p.id
  -- Alphabetical by title, case-insensitively — the picker is a list you
  -- scan by name, and import order (the previous `created_at desc`) is an
  -- accident of how the files happened to land. The expression is repeated
  -- rather than `order by title`, because the OUT column of that name would
  -- shadow it. `created_at desc` breaks ties so equal titles hold a stable,
  -- newest-first order instead of whatever the plan happens to emit.
  order by lower(coalesce(nullif(btrim(p.meta ->> 'title'), ''), 'Untitled')),
           p.created_at desc;
$$;
revoke execute on function crosswords.library_for_club(text) from public;
grant execute on function crosswords.library_for_club(text) to authenticated;

-- ============================================================
-- Terminal helpers
-- ============================================================

-- Coop solved → the whole team wins.
create or replace function crosswords._finish_coop(target_game uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_results jsonb;
begin
  select jsonb_object_agg(user_id::text, jsonb_build_object('won', true))
    into v_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game, 'won',
    jsonb_build_object('mode', 'coop', 'outcome', 'solved'),
    v_results
  );
end;
$$;
revoke execute on function crosswords._finish_coop(uuid) from public;

-- Compete: the first player whose grid is fully correct wins outright.
create or replace function crosswords._finish_compete(target_game uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_results jsonb;
begin
  select jsonb_object_agg(user_id::text, jsonb_build_object('won', user_id = p_winner))
    into v_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game, 'won_compete',
    jsonb_build_object(
      'mode', 'compete',
      'winner_user_id', p_winner,
      'winner_username', (select username from common.profiles where user_id = p_winner)
    ),
    v_results
  );
end;
$$;
revoke execute on function crosswords._finish_compete(uuid, uuid) from public;

-- Run the solved-check for `p_owner_id`'s grid and, if solved, make the
-- terminal transition atomically: lock the common.games row and re-check
-- play_state under the lock so only the FIRST solver ends the game
-- (compete first-correct-wins is a race). Returns whether the caller's
-- grid is solved (regardless of who ended the game).
create or replace function crosswords._maybe_finish(
  target_game uuid, p_owner_id uuid, p_mode text, p_caller uuid
)
returns boolean
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_solved boolean;
begin
  v_solved := crosswords._is_solved(target_game, p_owner_id);
  if not v_solved then
    return false;
  end if;

  -- Re-read play_state under a row lock; the WHERE is re-evaluated after
  -- the lock is granted, so a concurrent winner that already flipped the
  -- state leaves `found` false here.
  perform 1 from common.games
   where id = target_game and play_state = 'playing'
   for update;
  if found then
    if p_mode = 'coop' then
      perform crosswords._finish_coop(target_game);
    else
      perform crosswords._finish_compete(target_game, p_caller);
    end if;
  end if;
  return true;
end;
$$;
revoke execute on function crosswords._maybe_finish(uuid, uuid, text, uuid) from public;

-- ============================================================
-- create_game
-- ============================================================
-- Two ways to source the puzzle data (meta + solution):
--   * LIBRARY (`board` null): `setup.puzzle_id` names a crosswords.puzzles
--     row — the curated, CLI-imported library — whose meta/solution we copy.
--   * INLINE (`board` = {meta, solution}): the puzzle data is passed straight
--     in, NOT stored in crosswords.puzzles. This is the NYT edge-function path
--     (like boggle's `board` arg) — an NYT import creates a self-contained
--     game with puzzle_id null; it does NOT add to the shared library.
-- Either way we pre-insert one cells row per fillable NON-given cell (one
-- shared grid for coop; one per player for compete).
create or replace function crosswords.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text,
  board jsonb default null
)
returns table(id uuid)
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  new_id      uuid;
  v_puzzle_id uuid;
  v_meta      jsonb;
  v_solution  jsonb;
begin
  perform common.require_club_member(target_club);
  perform common.require_valid_mode(mode);
  if mode = 'compete' and coalesce(array_length(player_user_ids, 1), 0) < 2 then
    raise exception 'too-few-players|' using errcode = 'P0001',
      detail = 'compete needs >= 2 players';
  end if;
  perform common.require_player_count_max(player_user_ids, 8);
  perform common.require_valid_timer(coalesce(setup -> 'timer', '{"kind":"none"}'::jsonb));
  -- Backstop the FE's strip: the inline puzzle rides as the separate `board`
  -- arg, so `board`/`filename` never belong in the persisted setup. Dropping
  -- them here keeps a stale upload (e.g. a parsed board left in the setup after
  -- a source tab-switch) from leaking the solution grid into the unshielded
  -- status jsonb and the club's saved default. See docs/games/crosswords.md §5.
  setup := setup - 'board' - 'filename';

  if board is not null then
    -- Inline (NYT): trust the caller's puzzle data; no library row.
    v_meta := board -> 'meta';
    v_solution := board -> 'solution';
    if v_meta is null or v_solution is null then
      raise exception 'bad-board|' using errcode = 'P0001',
      detail = 'the board blob needs both meta and solution';
    end if;
    v_puzzle_id := null;
  else
    -- Library: copy from crosswords.puzzles. (Alias the table: the
    -- `returns table(id uuid)` OUT column shadows an unqualified `id`.)
    v_puzzle_id := nullif(setup ->> 'puzzle_id', '')::uuid;
    if v_puzzle_id is null then
      raise exception 'missing-puzzle-id|' using errcode = 'P0001',
      detail = 'setup.puzzle_id absent';
    end if;
    select p.meta, p.solution into v_meta, v_solution
      from crosswords.puzzles p where p.id = v_puzzle_id;
    if not found then
      raise exception 'no-puzzle|%|', v_puzzle_id using errcode = 'P0001',
      detail = 'no crosswords.puzzles row for that id; run the puzzle import';
    end if;
  end if;

  -- Saved-default arg. Two things are INSTANCES, not preferences, and both are
  -- stripped: `puzzle_id` (which library puzzle) and `date` (which NYT daily).
  -- Persisting either would silently re-pick one specific, probably
  -- already-played puzzle every time the dialog opened — `date` did exactly
  -- that until 2026-08-13.
  --
  -- `weekday` deliberately RIDES. It is the one genuine preference here: an
  -- NYT crossword's day is its difficulty, so "we're a Wednesday club" is a
  -- standing choice, and next_nyt_date_for_club turns it into a fresh date
  -- each time.
  -- Game title = the PUZZLE's own title (from its meta), like crossplay names a
  -- game after the loaded puzzle — e.g. "NYT Sat 1/1/22: <theme>" or a library
  -- puzzle's embedded title — instead of a generic "New crossword". Falls back to
  -- "Crossword" for an untitled puzzle. Shown in the club game list + the header.
  new_id := common.create_game(
    target_club, 'crosswords_' || mode, player_user_ids,
    coalesce(nullif(btrim(v_meta ->> 'title'), ''), 'Crossword'), setup,
    setup - 'puzzle_id' - 'date'
  );

  -- `puzzle_date` is the NYT day this game came from, and ONLY that: it is
  -- what the setup dialog's calendar colours by (club_nyt_status below), and
  -- the NYT tab is the only source that picks by date. `setup.date` is the
  -- field that tab writes; a library / upload / Guardian start leaves it
  -- absent, so this lands NULL and the calendar never sees the row. The cast
  -- is guarded rather than trusted — `setup` is caller-supplied jsonb.
  insert into crosswords.games (id, club_handle, mode, puzzle_id, puzzle_date, meta, solution)
  values (
    new_id, target_club, mode, v_puzzle_id,
    case
      when setup ->> 'source' = 'nyt' and setup ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
      then (setup ->> 'date')::date
    end,
    v_meta, v_solution
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
  -- author-drawn word-break bars onto `meta.cells` (see nytOverlay.ts). Seeding
  -- them into the live cells here is what puts them on the display path — the
  -- board + PDFs read marks from `crosswords.cells`, not from the template — so
  -- overlay bars render like any other mark. (A player can still clear one with
  -- `|`/`_`; crossplay accepts the same, an author bar is not immutable.)
  insert into crosswords.cells (game_id, owner_id, row, col, fill, mark_right, mark_bottom)
  select new_id, o.owner, (rr.ord - 1)::smallint, (cc.ord - 1)::smallint,
         upper(nullif(cc.cellval ->> 'fill', '')),
         nullif(cc.cellval ->> 'markRight', ''),
         nullif(cc.cellval ->> 'markBottom', '')
    from jsonb_array_elements(v_meta -> 'cells') with ordinality as rr(rowval, ord)
    cross join lateral jsonb_array_elements(rr.rowval) with ordinality as cc(cellval, ord)
    cross join unnest(
      case when mode = 'coop' then array[null::uuid] else player_user_ids end
    ) as o(owner)
   where cc.cellval ->> 'kind' = 'cell'
     and coalesce((cc.cellval ->> 'given')::boolean, false) = false;

  perform common.update_state(
    new_id, 'playing',
    jsonb_build_object('mode', mode, 'title', coalesce(v_meta ->> 'title', 'Crossword'))
  );

  return query select new_id;
end;
$$;
revoke execute on function crosswords.create_game(text, jsonb, uuid[], text, jsonb) from public;
grant execute on function crosswords.create_game(text, jsonb, uuid[], text, jsonb) to authenticated;

-- ============================================================
-- set_cell — the hot path (one call per keystroke)
-- ============================================================
-- Writes a fill into the caller's grid (coop's shared grid, or the
-- caller's own in compete), clears `wrong`, sets `pencil`. Mirrors
-- applyFill: given cells are immutable (and have no row); a REVEALED cell
-- IS editable and keeps its `revealed` flag. Then runs solved detection.
-- Returns the new per-cell version (so the FE adopts it and its own CDC
-- echo is a no-op) and whether the caller's grid is now solved.
create or replace function crosswords.set_cell(
  target_game uuid,
  p_row int,
  p_col int,
  p_fill text,
  p_pencil boolean
)
returns table(version bigint, solved boolean)
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller    uuid;
  v_mode      text;
  v_playstate text;
  v_owner     uuid;
  v_fill      text;
  v_pencil    boolean;
  v_version   bigint;
  v_solved    boolean;
begin
  v_caller := common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;
  if (select conceded from common.game_players
        where game_id = target_game and user_id = v_caller) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;
  v_owner := case when v_mode = 'coop' then null else v_caller end;

  if p_fill is null or char_length(p_fill) = 0 then
    v_fill := null;
  else
    v_fill := upper(p_fill);
    -- Mirror crossplay's `^[A-Z]{1,8}$` (ws.ts): letters only, 1–8 chars.
    -- Rejects a stray non-letter fill (e.g. "1") that upper() + a length
    -- check alone would persist. (An empty fill clears the cell — handled
    -- by the branch above.)
    if v_fill !~ '^[A-Z]{1,8}$' then
      raise exception 'bad-fill|' using errcode = 'P0001',
      detail = 'a cell fill is 1 to 8 letters';
    end if;
  end if;
  v_pencil := coalesce(p_pencil, false) and v_fill is not null;

  -- Alias the table: the `returns table(version …)` OUT column shadows an
  -- unqualified `version` in RETURNING.
  update crosswords.cells c
     set fill = v_fill, wrong = false, pencil = v_pencil
   where c.game_id = target_game
     and c.owner_id is not distinct from v_owner
     and c.row = p_row and c.col = p_col
  returning c.version into v_version;
  if not found then
    raise exception 'cell-not-editable|' using errcode = 'P0001',
      detail = 'that cell is a block or a given';
  end if;

  v_solved := crosswords._maybe_finish(target_game, v_owner, v_mode, v_caller);
  return query select v_version, v_solved;
end;
$$;
revoke execute on function crosswords.set_cell(uuid, int, int, text, boolean) from public;
grant execute on function crosswords.set_cell(uuid, int, int, text, boolean) to authenticated;

-- ============================================================
-- set_mark — cryptic edge marks (display-only annotations)
-- ============================================================
-- Sets / clears a word-break or hyphen mark on ONE edge of the caller's
-- grid cell (coop's shared grid, or the caller's own in compete). Marks
-- are player annotations, NOT gameplay — no solve check runs. Same guards
-- as set_cell (membership, play state, not conceded). Only fillable cells
-- have rows, so a mark aimed at a given cell finds no row and is rejected
-- (plan option A — marks live on fillable cells only). The version trigger
-- bumps `version`, so the mark syncs via the same useCells CDC path as a
-- fill; the RPC returns the new version so the FE's own echo is a no-op.
create or replace function crosswords.set_mark(
  target_game uuid,
  p_row int,
  p_col int,
  p_side text,
  p_mark text
)
returns table(version bigint)
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller    uuid;
  v_mode      text;
  v_playstate text;
  v_owner     uuid;
  v_version   bigint;
begin
  v_caller := common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;
  if (select conceded from common.game_players
        where game_id = target_game and user_id = v_caller) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;
  if p_side not in ('right', 'bottom') then
    raise exception 'bad-side|' using errcode = 'P0001',
      detail = 'a mark''s side must be right or bottom';
  end if;
  if p_mark is not null and p_mark not in ('break', 'hyphen') then
    raise exception 'bad-mark|' using errcode = 'P0001',
      detail = 'mark must be break, hyphen or null';
  end if;
  v_owner := case when v_mode = 'coop' then null else v_caller end;

  -- Update only the targeted edge; leave the other edge's mark untouched.
  update crosswords.cells c
     set mark_right  = case when p_side = 'right'  then p_mark else c.mark_right  end,
         mark_bottom = case when p_side = 'bottom' then p_mark else c.mark_bottom end
   where c.game_id = target_game
     and c.owner_id is not distinct from v_owner
     and c.row = p_row and c.col = p_col
  returning c.version into v_version;
  if not found then
    raise exception 'cell-not-editable|' using errcode = 'P0001',
      detail = 'that cell is a block or a given';
  end if;

  return query select v_version;
end;
$$;
revoke execute on function crosswords.set_mark(uuid, int, int, text, text) from public;
grant execute on function crosswords.set_mark(uuid, int, int, text, text) to authenticated;

-- ============================================================
-- check_cells / reveal_cells
-- ============================================================
-- check_cells / reveal_cells
-- ============================================================
-- The FE resolves letter/word/puzzle scope via cursor.ts and sends the
-- target coordinates as a jsonb array of {row, col}. The server never
-- trusts the FE about correctness — only about which cells were asked.

-- Check: flag/unflag `wrong` against the solution, skipping empty and
-- pencil cells (givens have no row). Available in both modes; wrong is
-- self-informative, not answer-leaking.
create or replace function crosswords.check_cells(target_game uuid, p_cells jsonb)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller    uuid;
  v_mode      text;
  v_playstate text;
  v_owner     uuid;
begin
  v_caller := common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;
  -- A conceded compete player is out — no checking their (frozen) grid, same
  -- guard set_cell has (reveal_cells is coop-only, where nobody concedes).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = v_caller) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;
  v_owner := case when v_mode = 'coop' then null else v_caller end;

  update crosswords.cells c
     set wrong = not crosswords._matches(c.fill, g.solution -> c.row::int -> c.col::int)
    from crosswords.games g
   where g.id = c.game_id
     and c.game_id = target_game
     and c.owner_id is not distinct from v_owner
     and c.fill is not null
     and c.pencil = false
     and exists (
       select 1 from jsonb_array_elements(p_cells) e
        where (e ->> 'row')::int = c.row and (e ->> 'col')::int = c.col
     );
end;
$$;
revoke execute on function crosswords.check_cells(uuid, jsonb) from public;
grant execute on function crosswords.check_cells(uuid, jsonb) to authenticated;

-- Reveal: write the canonical answer + revealed, clear wrong/pencil.
-- COOP ONLY (reveal-all would trivially win the compete race). Revealing
-- the last cell can complete the grid, so run solved detection after.
create or replace function crosswords.reveal_cells(target_game uuid, p_cells jsonb)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_mode      text;
  v_playstate text;
begin
  perform common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  if v_mode <> 'coop' then
    raise exception 'reveal-not-in-compete|' using errcode = 'P0001',
      detail = 'revealing your own grid would trivially win a race';
  end if;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  update crosswords.cells c
     set fill = (g.solution -> c.row::int -> c.col::int ->> 0),
         revealed = true, wrong = false, pencil = false
    from crosswords.games g
   where g.id = c.game_id
     and c.game_id = target_game
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

  -- Revealing can complete the grid — including "Reveal puzzle", which fills
  -- the whole thing. That lands the ordinary coop `won` terminal, and that is
  -- DELIBERATE (2026-08-01): waffle/wordle treat their reveal-answer gesture as
  -- a give-up (`ended` + outcome 'revealed') because those are guess-economy
  -- games where the answer IS the contest. A crossword isn't competitive that
  -- way — reveal is a scoped, incremental solving aid (letter / word / puzzle),
  -- and there's no honest line between "revealed one letter" and "gave up". So
  -- a finished grid is a finished grid. See docs/games/crosswords.md §9.
  perform crosswords._maybe_finish(target_game, null, 'coop', null);
end;
$$;
revoke execute on function crosswords.reveal_cells(uuid, jsonb) from public;
grant execute on function crosswords.reveal_cells(uuid, jsonb) to authenticated;


-- ============================================================
-- crosswords.replay_board — solve this puzzle again from scratch
-- ============================================================
-- The "Restart" game-menu item / terminal-row Restart, and the ONLY board-
-- clearing action: it replaced a separate `clear_board` (2026-08-03), which did
-- the same job under a different name and couldn't un-terminal a finished game.
-- One name, one path, the same as the other twelve games.
--
-- Wipes every cell of the puzzle — fill, pencil, wrong/revealed marks, and the
-- scribbled edge marks — for EVERY owner, then hands the common half to
-- `common.reset_game` (un-terminal, fresh status, results + concede cleared,
-- clock zeroed). Note the widening from `clear_board`: that cleared only the
-- CALLER's grid in compete, because it was a mid-race convenience. A restart is
-- a whole-table thing in every game, so a compete restart re-opens the race for
-- everyone.
--
-- The solution re-shields on its own: `_solution_for` gates on `is_terminal`,
-- which the reset clears — and `reset_game` puts `solution_revealed` back to
-- false, so a replayed puzzle starts covered.
--
-- Any game player may call it, from a finished game OR mid-game (no play_state
-- guard — it's a restart; the FE confirms mid-game).
create or replace function crosswords.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_mode  text;
  v_title text;
begin
  perform common.require_game_player(target_game);

  select mode into v_mode from crosswords.games where id = target_game;
  if v_mode is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no crosswords.games row for target_game';
  end if;
  -- The status blob create_game seeds, rebuilt: `reset_game` ASSIGNS status, so
  -- anything the listing label reads has to be restated here or it's lost.
  select status ->> 'title' into v_title from common.games where id = target_game;

  update crosswords.cells c
     set fill = null, pencil = false, wrong = false, revealed = false,
         mark_right = null, mark_bottom = null
   where c.game_id = target_game;

  perform common.reset_game(
    target_game,
    jsonb_build_object('mode', v_mode, 'title', coalesce(v_title, 'Crossword'))
  );
end;
$$;
revoke execute on function crosswords.replay_board(uuid) from public;
grant execute on function crosswords.replay_board(uuid) to authenticated;

-- ============================================================
-- reveal_solved_word — leak-safe answer read for the "Explain clue" feature
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
create or replace function crosswords.reveal_solved_word(target_game uuid, p_cells jsonb)
returns table(answer text, solved boolean, note text)
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_caller   uuid;
  v_mode     text;
  v_owner    uuid;
  v_meta     jsonb;
  v_solution jsonb;
  v_answer   text := '';
  v_solved   boolean := true;
  e          jsonb;
  r          int;
  c          int;
  v_tmpl     jsonb;
  v_sols     jsonb;
  v_given    boolean;
  v_fill     text;
begin
  v_caller := common.require_game_player(target_game);
  select mode, meta, solution into v_mode, v_meta, v_solution
    from crosswords.games where id = target_game;
  v_owner := case when v_mode = 'coop' then null else v_caller end;
  note := v_meta ->> 'note';

  -- Cells arrive in reading order (the FE's word-cell order); jsonb arrays
  -- preserve order, so the concatenation yields the answer left-to-right.
  for e in select value from jsonb_array_elements(p_cells) loop
    r := (e ->> 'row')::int;
    c := (e ->> 'col')::int;
    v_tmpl := v_meta -> 'cells' -> r -> c;
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
       where cl.game_id = target_game
         and cl.owner_id is not distinct from v_owner
         and cl.row = r and cl.col = c;
      v_fill := coalesce(v_fill, '');
    end if;
    if v_fill = '' or not crosswords._matches(v_fill, v_sols) then
      v_solved := false;
    end if;
  end loop;

  answer := case when v_solved then v_answer else null end;
  solved := v_solved;
  return next;
end;
$$;
revoke execute on function crosswords.reveal_solved_word(uuid, jsonb) from public;
grant execute on function crosswords.reveal_solved_word(uuid, jsonb) to authenticated;

-- export_solution — the full answer grid for the "Download as .ipuz" export
-- and the answer-key PDF.
--
-- NAMED DELIBERATELY UNLIKE `_solution_for` above, which it sat one underscore
-- away from until 2026-08-02. The two have OPPOSITE shielding semantics — that
-- one is the terminal-gated view shim (the roster-wide name, shared with
-- waffle / wordle / stackdown), this one hands a member the grid at any time —
-- and both are granted to `authenticated`, so a one-character typo swapped a
-- gate for no gate. The names now differ at a glance.
--
-- Unlike `games_state` (which gates the solution to terminal),
-- export needs the whole grid at ANY time so a downloaded file carries real
-- answers. Handing the solution to the client on demand relaxes the shielding,
-- which the friends-only trust model tolerates (see CLAUDE.md → trust model);
-- it's a deliberate, member-gated exception, not the solving path.
create or replace function crosswords.export_solution(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
begin
  perform common.require_game_player(target_game);
  return (select solution from crosswords.games where id = target_game);
end;
$$;
revoke execute on function crosswords.export_solution(uuid) from public;
grant execute on function crosswords.export_solution(uuid) to authenticated;

-- ============================================================
-- end_game (coop manual give-up) / concede (compete) / submit_timeout
-- ============================================================

-- Coop mutual give-up ends NEUTRALLY ('ended' + outcome 'manual') — not a
-- loss (putting down an unfinished crossword is normal). The solution
-- reveals in the terminal view (games_state) once is_terminal flips.
create or replace function crosswords.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_mode      text;
  v_playstate text;
  v_results   jsonb;
begin
  perform common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  if v_mode <> 'coop' then
    raise exception 'end-not-in-compete|'
      using errcode = 'P0001',
      detail = 'compete drops out per player via concede';
  end if;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    return;
  end if;

  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into v_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('mode', 'coop', 'outcome', 'manual'),
    v_results
  );
end;
$$;
revoke execute on function crosswords.end_game(uuid) from public;
grant execute on function crosswords.end_game(uuid) to authenticated;

-- Per-player concede (compete): dropping out never ends the table for the
-- others; the last active conceder → collective loss. Fully handled by
-- common.concede; this is the thin compete gate (non-elimination, like
-- stackdown — a crossword player can't be individually eliminated).
create or replace function crosswords.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from crosswords.games where id = target_game));
  perform common.concede(target_game);
end;
$$;
revoke execute on function crosswords.concede(uuid) from public;
grant execute on function crosswords.concede(uuid) to authenticated;

-- Standard manifest requirement, and a live path: the setup form offers the
-- shared TimerField, so a countdown can expire (timeout_test.sql exercises
-- it). Coop → lost, compete → lost_compete; outcome 'timeout' both ways.
create or replace function crosswords.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_mode      text;
  v_playstate text;
  v_results   jsonb;
begin
  perform common.require_game_player(target_game);
  select mode into v_mode from crosswords.games where id = target_game;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    return;
  end if;

  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into v_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    case when v_mode = 'coop' then 'lost' else 'lost_compete' end,
    jsonb_build_object('mode', v_mode, 'outcome', 'timeout'),
    v_results
  );
end;
$$;
revoke execute on function crosswords.submit_timeout(uuid) from public;
grant execute on function crosswords.submit_timeout(uuid) to authenticated;
