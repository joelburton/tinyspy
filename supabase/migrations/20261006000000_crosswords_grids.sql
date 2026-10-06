-- cs-unmet

-- ============================================================
-- crosswords: one jsonb per grid, and a revision on the game
-- ============================================================
-- Two changes, settled with Joel on 2026-10-06 when crosswords' seat-view
-- conversion opened (plans/areas/crosswords.md → The conversion — rulings):
--
--   GRIDS      `crosswords.grids` holds each grid as one sparse jsonb keyed
--              by place ("row,col"), holding only the cells with something in
--              them, so a blank grid is `{}`. Coop has one grid (owner null),
--              compete one per player. A cell is an object of the keys it has:
--              `fill` (uppercase), `pencil`, `wrong`, `revealed`, `markRight`,
--              `markBottom` (break / hyphen), and in coop `writer`, who last
--              filled it. A false flag or a null value is left out. Every
--              letter in `crosswords.cells` is copied across, then that table
--              goes, with its policy, its version trigger and its place in the
--              Realtime publication: the page reads the blobs on common.games
--              and subscribes to nothing else.
--   REVISION   `crosswords.games.revision`, raised by every rebuild of the
--              page blobs under the game-row lock and written into game_data,
--              so a page can tell that the blob it holds is at least as new as
--              its own write.
--
-- Past games' cells have no writer. The page blobs are rebuilt by hand after
-- the deploy (`select crosswords._rebuild_data_cols_for_all()`), since a
-- migration cannot call what `supabase/sql/` defines.

-- ─── The revision ──────────────────────────────────────────
alter table crosswords.games
  add column revision bigint not null default 0;

-- ─── The grids ─────────────────────────────────────────────
create table crosswords.grids (
  id       bigint generated always as identity primary key,
  game_id  uuid not null references crosswords.games(game_id) on delete cascade,
  -- Null: coop's shared grid. A player's id: that player's compete grid.
  owner_id uuid references common.profiles(user_id) on delete cascade,
  cells    jsonb not null default '{}'::jsonb check (jsonb_typeof(cells) = 'object'),
  -- One grid per owner per game. `owner_id` is nullable, so NULLS NOT
  -- DISTINCT makes coop's null one value.
  unique nulls not distinct (game_id, owner_id)
);

alter table crosswords.grids enable row level security;

-- One grid for every game's every owner, whether or not it has a cell row
-- with anything in it.
insert into crosswords.grids (game_id, owner_id)
select g.game_id, null
  from crosswords.games g
  join common.games cg on cg.id = g.game_id
 where cg.mode = 'coop'
union all
select g.game_id, gp.user_id
  from crosswords.games g
  join common.games cg on cg.id = g.game_id
  join common.game_players gp on gp.game_id = g.game_id
 where cg.mode = 'compete';

-- Each cells row with something in it, as the object the grid keeps.
update crosswords.grids gr
   set cells = x.cells
  from (
    select c.game_id, c.owner_id,
           jsonb_object_agg(c.row || ',' || c.col, jsonb_strip_nulls(jsonb_build_object(
             'fill',       c.fill,
             'pencil',     nullif(c.pencil, false),
             'wrong',      nullif(c.wrong, false),
             'revealed',   nullif(c.revealed, false),
             'markRight',  c.mark_right,
             'markBottom', c.mark_bottom))) as cells
      from crosswords.cells c
     where c.fill is not null or c.pencil or c.wrong or c.revealed
        or c.mark_right is not null or c.mark_bottom is not null
     group by c.game_id, c.owner_id
  ) x
 where gr.game_id = x.game_id
   and gr.owner_id is not distinct from x.owner_id;

-- Every fill, flag and mark arrived, in a grid of its own owner.
do $$
declare
  b record;
  a record;
begin
  select count(*) filter (where fill is not null) as n_fills,
         count(*) filter (where pencil) as n_pencil,
         count(*) filter (where wrong) as n_wrong,
         count(*) filter (where revealed) as n_revealed,
         count(*) filter (where mark_right is not null) as n_marks_right,
         count(*) filter (where mark_bottom is not null) as n_marks_bottom,
         coalesce(sum(length(fill)), 0) as n_letters
    into b
    from crosswords.cells;

  select count(*) filter (where v ? 'fill') as n_fills,
         count(*) filter (where v ? 'pencil') as n_pencil,
         count(*) filter (where v ? 'wrong') as n_wrong,
         count(*) filter (where v ? 'revealed') as n_revealed,
         count(*) filter (where v ? 'markRight') as n_marks_right,
         count(*) filter (where v ? 'markBottom') as n_marks_bottom,
         coalesce(sum(length(v ->> 'fill')), 0) as n_letters
    into a
    from crosswords.grids gr, jsonb_each(gr.cells) e(k, v);

  if a is distinct from b then
    raise exception 'crosswords grids: cells % grids %', b, a;
  end if;

  if exists (
    select 1 from crosswords.cells c
     where not exists (select 1 from crosswords.grids gr
                        where gr.game_id = c.game_id
                          and gr.owner_id is not distinct from c.owner_id)
  ) then
    raise exception 'crosswords grids: a cells row whose owner has no grid';
  end if;
end $$;

-- ─── The cells table ───────────────────────────────────────
-- Its policy, its version trigger and its publication membership go with it.
-- The repeatable half (supabase/sql/crosswords.sql) stopped naming it in the
-- same change, and drops the trigger's function.
drop table crosswords.cells;
