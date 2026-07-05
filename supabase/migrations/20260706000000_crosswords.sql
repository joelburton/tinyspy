-- ============================================================
-- crosswords — CrossPlay: collaborative / competitive crossword solving.
-- ============================================================
-- Coop + compete sibling pair (one schema, `mode` column), a port of
-- Joel's crossplay app. A *puzzle* is the immutable imported template
-- (curated library or NYT-fetched); a *board* is one playthrough — a
-- `common.games` row plus per-cell fill rows.
--
-- The solution grid is server-only (shielded via column grants); check
-- and reveal are plain SECURITY DEFINER RPCs that read it. Every keystroke
-- is one `set_cell` UPDATE (no debounce) — the FE echoes optimistically
-- and reconciles the Postgres CDC stream by a per-cell `version`.
--
-- Match semantics (solve / check / reveal) are mirrored from crossplay's
-- `ws.ts` (`fillMatchesSolution`, `isPuzzleSolved`, `applyCheck`,
-- `applyReveal`), NOT from prose — the two subtleties that bite:
--   * the bare-first-letter answer is accepted ONLY for Schrödinger cells
--     (a solution array of length > 1); a normal rebus needs the full string.
--   * *solve* does NOT skip pencil cells (a correct pencil cell counts —
--     pencil is a confidence marker); only *check* skips pencil.
-- ============================================================

create schema if not exists crosswords;
grant usage on schema crosswords to authenticated;

-- ── crosswords.puzzles — the curated / NYT puzzle library ─────────────
-- One row per imported puzzle. `meta` is the whole immutable template
-- (PuzzleMeta + the initial grid cells — numbers, blocks, circles,
-- shading, givens); `solution` is the shielded answer grid. `source`
-- keeps NYT-fetched puzzles out of the library listing (the FE filters
-- source = 'library'); `content_hash` dedups re-imports.
create table crosswords.puzzles (
  id           uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source       text not null check (source in ('library', 'nyt')),
  meta         jsonb not null,
  solution     jsonb not null,
  created_at   timestamptz not null default now()
);

alter table crosswords.puzzles enable row level security;

-- Library browsing needs meta but never the answer. The presence of ANY
-- column grant flips the table to "only granted columns visible", so we
-- enumerate the safe columns and omit `solution`. A pgTAP test pins that
-- authenticated cannot select `solution`, so a future migration can't
-- silently regress it.
grant select (id, source, meta, created_at) on crosswords.puzzles to authenticated;

-- Any authenticated user may list puzzles (the setup-form picker); the
-- column grant above is what hides the answer, not RLS.
create policy puzzles_select on crosswords.puzzles
  for select to authenticated
  using (true);

-- The import CLI + the NYT edge function write puzzles as the service_role
-- (bypasses RLS; the only writers — there's no INSERT grant to
-- authenticated). Needs schema USAGE + full column access (all columns,
-- incl. solution) to seed the library.
grant usage on schema crosswords to service_role;
grant insert, select on crosswords.puzzles to service_role;

-- ── crosswords.games — one playthrough ────────────────────────────────
-- `meta`/`solution` are COPIED from the puzzle at create time so a game
-- survives puzzle retirement (`on delete set null`, per stackdown). The
-- copied `solution` is shielded by the same column-grant trick; it's
-- revealed only at terminal, through `games_state` below.
create table crosswords.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode        text not null check (mode in ('coop', 'compete')),
  puzzle_id   uuid references crosswords.puzzles(id) on delete set null,
  meta        jsonb not null,
  solution    jsonb not null,
  created_at  timestamptz not null default now()
);

alter table crosswords.games enable row level security;

-- Everything EXCEPT `solution`.
grant select (id, club_handle, mode, puzzle_id, meta, created_at)
  on crosswords.games to authenticated;

create policy games_select on crosswords.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ── crosswords.cells — the live per-cell fills ────────────────────────
-- Only fillable, NON-given cells get a row (blocks, numbering, decorations
-- and givens are static and live in `games.meta`), so a 15×15 has ~190
-- rows and every keystroke is a pure UPDATE. `owner_id` null = the shared
-- coop grid; a user id = that player's private compete grid.
--
-- The surrogate `id` PK exists for ONE reason: this table is
-- realtime-published, and a publication that replicates UPDATEs rejects
-- every UPDATE on a table without a valid replica identity. The logical
-- key can't be the PK (nullable `owner_id`) nor a `USING INDEX` identity
-- (same reason), and we'd rather not reach for REPLICA IDENTITY FULL when
-- a plain PK works: postgres_changes delivers the full NEW row on UPDATE
-- and we never DELETE a cell, so the OLD image is never needed.
create table crosswords.cells (
  id       uuid primary key default gen_random_uuid(),
  game_id  uuid not null references crosswords.games(id) on delete cascade,
  owner_id uuid references common.profiles(user_id) on delete cascade,
  row      smallint not null,
  col      smallint not null,
  fill     text,
  pencil   boolean not null default false,
  revealed boolean not null default false,
  wrong    boolean not null default false,
  -- Bumped by trigger on every UPDATE; the FE applies an incoming CDC
  -- event only when event.version > local.version ("newer wins").
  version  bigint not null default 0,
  -- The logical one-row-per-cell key. `owner_id` is nullable (coop's
  -- shared grid), so NULLS NOT DISTINCT (PG 15+; 17 locally) treats null
  -- as a single value — the repo's first use of the feature.
  unique nulls not distinct (game_id, owner_id, row, col)
);

alter table crosswords.cells enable row level security;

grant select on crosswords.cells to authenticated;

-- Mode-aware visibility (modeled on wordle.guesses_select): coop — any
-- club member reads the shared grid; compete — you see only your own
-- rows until the game is terminal, when opponents' grids open up. NOTE:
-- this gates the RLS-filtered READ, not the Realtime payload — the FE's
-- useCells also drops incoming compete events whose owner_id != auth.uid()
-- (this repo does not rely on Realtime to withhold rows). Writes all go
-- through the definer RPCs below, which bypass RLS, so no write policy.
create policy cells_select on crosswords.cells
  for select to authenticated
  using (
    exists (
      select 1
        from crosswords.games cg
        join common.games g on g.id = cg.id
       where cg.id = cells.game_id
         and common.is_club_member(cg.club_handle)
         and (cg.mode = 'coop' or cells.owner_id = auth.uid() or g.is_terminal)
    )
  );

-- Per-cell version bump. Any change (fill / check-wrong / reveal) advances
-- the counter, so every CDC event carries a strictly newer version than
-- the state it supersedes.
create function crosswords._bump_cell_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger cells_bump_version
  before update on crosswords.cells
  for each row
  execute function crosswords._bump_cell_version();

-- Realtime: FE subscribes to the game row (status) and the cells (fills).
-- Missing this line fails silently (no error, no events).
alter publication supabase_realtime add table crosswords.games;
alter publication supabase_realtime add table crosswords.cells;

-- ── Gametype registration ─────────────────────────────────────────────
insert into common.gametypes (gametype, min_players) values
  ('crosswords_coop', 1),
  ('crosswords_compete', 2)
on conflict do nothing;

-- ============================================================
-- Match semantics + solved detection (mirrors crossplay ws.ts)
-- ============================================================

-- True iff `p_fill` is an acceptable answer for the per-cell solution
-- array `p_sols` (null for a block; length 1 normal; length > 1
-- Schrödinger). Each candidate accepts an exact match, and — ONLY for
-- Schrödinger cells (more than one candidate) — the bare first letter
-- (`fillMatchesSolution`, ws.ts). A normal rebus needs the full string.
create function crosswords._matches(p_fill text, p_sols jsonb)
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
           or (jsonb_array_length(p_sols) > 1 and p_fill = left(s.ans, 1))
     );
$$;
revoke execute on function crosswords._matches(text, jsonb) from public;

-- True iff every fillable cell in `p_owner`'s grid matches the solution
-- (`isPuzzleSolved`). An empty cell blocks solve; a pencil cell does NOT
-- (it counts if right). Given cells aren't in the table — they're
-- author-correct by construction — so they're implicitly satisfied.
create function crosswords._is_solved(target_game uuid, p_owner uuid)
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
       and c.owner_id is not distinct from p_owner
       and (c.fill is null
            or not crosswords._matches(c.fill, g.solution -> c.row::int -> c.col::int))
  );
$$;
revoke execute on function crosswords._is_solved(uuid, uuid) from public;

-- Terminal-only answer reveal: the shielded `solution` column, surfaced
-- (as jsonb) once the game is terminal and NULL before. The
-- security_invoker view keeps auth.uid() real so base-table RLS still
-- gates rows; the definer function reads the grant-hidden column.
create function crosswords._solution_for(g_id uuid)
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

create view crosswords.games_state with (security_invoker = true) as
  select g.id, g.club_handle, g.mode, g.puzzle_id, g.meta, g.created_at,
         crosswords._solution_for(g.id) as solution   -- NULL until terminal
    from crosswords.games g;
grant select on crosswords.games_state to authenticated;

-- ============================================================
-- Terminal helpers
-- ============================================================

-- Coop solved → the whole team wins.
create function crosswords._finish_coop_won(target_game uuid)
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
  -- Realtime touch: common.end_game writes common.games, not our table;
  -- a no-op self-update wakes FE subscribers of crosswords.games.
  update crosswords.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function crosswords._finish_coop_won(uuid) from public;

-- Compete: the first player whose grid is fully correct wins outright.
create function crosswords._finish_compete_won(target_game uuid, p_winner uuid)
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
      'winner', p_winner,
      'winner_username', (select username from common.profiles where user_id = p_winner)
    ),
    v_results
  );
  update crosswords.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function crosswords._finish_compete_won(uuid, uuid) from public;

-- Run the solved-check for `p_owner`'s grid and, if solved, make the
-- terminal transition atomically: lock the common.games row and re-check
-- play_state under the lock so only the FIRST solver ends the game
-- (compete first-correct-wins is a race). Returns whether the caller's
-- grid is solved (regardless of who ended the game).
create function crosswords._maybe_finish(
  target_game uuid, p_owner uuid, p_mode text, p_caller uuid
)
returns boolean
language plpgsql
security definer
set search_path = crosswords, common, public, extensions
as $$
declare
  v_solved boolean;
begin
  v_solved := crosswords._is_solved(target_game, p_owner);
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
      perform crosswords._finish_coop_won(target_game);
    else
      perform crosswords._finish_compete_won(target_game, p_caller);
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
create function crosswords.create_game(
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
  perform common.validate_mode(mode);
  if mode = 'compete' and coalesce(array_length(player_user_ids, 1), 0) < 2 then
    raise exception 'compete needs at least 2 players' using errcode = 'P0001';
  end if;
  perform common.require_player_count_max(player_user_ids, 8);
  perform common.validate_timer(coalesce(setup -> 'timer', '{"kind":"none"}'::jsonb));
  if setup ? 'mode' then
    raise exception 'mode is a top-level arg, not a setup field' using errcode = 'P0001';
  end if;

  if board is not null then
    -- Inline (NYT): trust the caller's puzzle data; no library row.
    v_meta := board -> 'meta';
    v_solution := board -> 'solution';
    if v_meta is null or v_solution is null then
      raise exception 'board must carry meta + solution' using errcode = 'P0001';
    end if;
    v_puzzle_id := null;
  else
    -- Library: copy from crosswords.puzzles. (Alias the table: the
    -- `returns table(id uuid)` OUT column shadows an unqualified `id`.)
    v_puzzle_id := nullif(setup ->> 'puzzle_id', '')::uuid;
    if v_puzzle_id is null then
      raise exception 'setup.puzzle_id is required' using errcode = 'P0001';
    end if;
    select p.meta, p.solution into v_meta, v_solution
      from crosswords.puzzles p where p.id = v_puzzle_id;
    if not found then
      raise exception 'puzzle % not found', v_puzzle_id using errcode = 'P0001';
    end if;
  end if;

  new_id := common.create_game(
    target_club, 'crosswords_' || mode, player_user_ids, 'New crossword', setup, setup
  );

  insert into crosswords.games (id, club_handle, mode, puzzle_id, meta, solution)
  values (new_id, target_club, mode, v_puzzle_id, v_meta, v_solution);

  -- Pre-insert the fillable, non-given cells: one shared grid (owner null)
  -- for coop, one grid per player for compete. `with ordinality` gives
  -- 1-based indices; subtract 1 for 0-based (row, col).
  insert into crosswords.cells (game_id, owner_id, row, col)
  select new_id, o.owner, (rr.ord - 1)::smallint, (cc.ord - 1)::smallint
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
create function crosswords.set_cell(
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
    raise exception 'game is not in play' using errcode = 'P0001';
  end if;
  if (select conceded from common.game_players
        where game_id = target_game and user_id = v_caller) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;
  v_owner := case when v_mode = 'coop' then null else v_caller end;

  if p_fill is null or char_length(p_fill) = 0 then
    v_fill := null;
  else
    v_fill := upper(p_fill);
    if char_length(v_fill) > 8 then
      raise exception 'fill over 8 characters' using errcode = 'P0001';
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
    raise exception 'not an editable cell' using errcode = 'P0001';
  end if;

  v_solved := crosswords._maybe_finish(target_game, v_owner, v_mode, v_caller);
  return query select v_version, v_solved;
end;
$$;
revoke execute on function crosswords.set_cell(uuid, int, int, text, boolean) from public;
grant execute on function crosswords.set_cell(uuid, int, int, text, boolean) to authenticated;

-- ============================================================
-- check_cells / reveal_cells
-- ============================================================
-- The FE resolves letter/word/puzzle scope via cursor.ts and sends the
-- target coordinates as a jsonb array of {row, col}. The server never
-- trusts the FE about correctness — only about which cells were asked.

-- Check: flag/unflag `wrong` against the solution, skipping empty and
-- pencil cells (givens have no row). Available in both modes; wrong is
-- self-informative, not answer-leaking.
create function crosswords.check_cells(target_game uuid, p_cells jsonb)
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
    raise exception 'game is not in play' using errcode = 'P0001';
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
create function crosswords.reveal_cells(target_game uuid, p_cells jsonb)
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
    raise exception 'reveal is coop-only' using errcode = 'P0001';
  end if;
  select play_state into v_playstate from common.games where id = target_game;
  if v_playstate is distinct from 'playing' then
    raise exception 'game is not in play' using errcode = 'P0001';
  end if;

  update crosswords.cells c
     set fill = (g.solution -> c.row::int -> c.col::int ->> 0),
         revealed = true, wrong = false, pencil = false
    from crosswords.games g
   where g.id = c.game_id
     and c.game_id = target_game
     and c.owner_id is null
     and g.solution -> c.row::int -> c.col::int is not null
     and exists (
       select 1 from jsonb_array_elements(p_cells) e
        where (e ->> 'row')::int = c.row and (e ->> 'col')::int = c.col
     );

  perform crosswords._maybe_finish(target_game, null, 'coop', null);
end;
$$;
revoke execute on function crosswords.reveal_cells(uuid, jsonb) from public;
grant execute on function crosswords.reveal_cells(uuid, jsonb) to authenticated;

-- ============================================================
-- end_game (coop manual give-up) / concede (compete) / submit_timeout
-- ============================================================

-- Coop mutual give-up ends as a NEUTRAL "finished" — not a loss (putting
-- down an unfinished crossword is normal). The solution reveals in the
-- terminal view (games_state) once is_terminal flips.
create function crosswords.end_game(target_game uuid)
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
    raise exception 'end_game is coop-only (compete drops out via concede)'
      using errcode = 'P0001';
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
    jsonb_build_object('mode', 'coop', 'outcome', 'finished'),
    v_results
  );
  update crosswords.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function crosswords.end_game(uuid) from public;
grant execute on function crosswords.end_game(uuid) to authenticated;

-- Per-player concede (compete): dropping out never ends the table for the
-- others; the last active conceder → collective loss. Fully handled by
-- common.concede; this is the thin compete gate (non-elimination, like
-- stackdown — a crossword player can't be individually eliminated).
create function crosswords.concede(target_game uuid)
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

-- Standard manifest requirement. Crosswords has NO timer (timerMode
-- 'none'), so this is never invoked in practice; implemented for the
-- dispatcher interface. If ever called: coop → lost, compete → lost_compete.
create function crosswords.submit_timeout(target_game uuid)
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
  update crosswords.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function crosswords.submit_timeout(uuid) from public;
grant execute on function crosswords.submit_timeout(uuid) to authenticated;
