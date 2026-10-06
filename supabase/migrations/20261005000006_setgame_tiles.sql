-- cs-unmet

-- ============================================================
-- setgame: a tile is four digits, and the columns say "tile"
-- ============================================================
-- A tile was stored as one smallint 0..80, its four attributes packed as
-- base-3 digits. It is now stored as the four attributes written as decimal
-- digits, each 1..3, in the order count, color, fill, shape — `3121` is three
-- symbols, the first color, the second fill, the first shape — so a tile can
-- be read in a row, a log line or a `data-tile` attribute without arithmetic.
-- The junior deck keeps four digits, its fill fixed at 1 (solid), as it kept
-- shade 0 before. The set rule is unchanged: per digit, all the same or all
-- different.
--
-- Every stored tile is converted in place: the deck, the board, and each
-- event's tiles and board. Then the columns take their names: the piece on
-- the board is a tile in code (Joel, 2026-10-05: "the only place to keep
-- 'card' is user-facing text"), so `events.cards` → `tiles`; and a count is
-- `nFoo` (docs/code-conventions.md → A few words may be abbreviated), so
-- `players.sets_found` → `n_sets_found` and `hints_used` → `n_hints_used`.
--
-- The page blobs are rebuilt by hand after the deploy
-- (`select setgame._rebuild_data_cols_for_all()`), since a migration cannot
-- call what `supabase/sql/` defines.

create function pg_temp.setgame_tile(v smallint)
returns smallint
language sql
immutable
as $$
  select (((v / 27) % 3 + 1) * 1000
        + ((v /  9) % 3 + 1) *  100
        + ((v /  3) % 3 + 1) *   10
        + ( v       % 3 + 1))::smallint;
$$;

create function pg_temp.setgame_tiles(p smallint[])
returns smallint[]
language sql
immutable
as $$
  select coalesce(array_agg(pg_temp.setgame_tile(v) order by o), '{}')::smallint[]
    from unnest(p) with ordinality as x(v, o);
$$;

create temporary table _setgame_before on commit drop as
  select (select count(*) from setgame.games) as n_games,
         (select coalesce(sum(cardinality(deck)), 0) from setgame.games) as n_deck,
         (select coalesce(sum(cardinality(board)), 0) from setgame.games) as n_board,
         (select count(*) from setgame.events) as n_events,
         (select coalesce(sum(cardinality(cards)), 0) from setgame.events) as n_event_tiles,
         (select coalesce(sum(cardinality(board_after)), 0) from setgame.events) as n_event_board,
         (select count(*) from setgame.games
           where deck_kind = 'full' and (select count(distinct v) from unnest(deck) v) <> 81)
           + (select count(*) from setgame.games
               where deck_kind = 'junior' and (select count(distinct v) from unnest(deck) v) <> 27)
           as n_bad_decks;

update setgame.games
   set deck  = pg_temp.setgame_tiles(deck),
       board = pg_temp.setgame_tiles(board);

update setgame.events
   set cards       = pg_temp.setgame_tiles(cards),
       board_after = pg_temp.setgame_tiles(board_after);

-- The same rows and the same number of tiles everywhere; every deck still
-- holds its whole set of distinct tiles; and every stored tile is four
-- digits, each 1..3.
do $$
declare
  b record;
  a record;
  n_malformed bigint;
begin
  select * into b from _setgame_before;
  select (select count(*) from setgame.games) as n_games,
         (select coalesce(sum(cardinality(deck)), 0) from setgame.games) as n_deck,
         (select coalesce(sum(cardinality(board)), 0) from setgame.games) as n_board,
         (select count(*) from setgame.events) as n_events,
         (select coalesce(sum(cardinality(cards)), 0) from setgame.events) as n_event_tiles,
         (select coalesce(sum(cardinality(board_after)), 0) from setgame.events) as n_event_board,
         (select count(*) from setgame.games
           where deck_kind = 'full' and (select count(distinct v) from unnest(deck) v) <> 81)
           + (select count(*) from setgame.games
               where deck_kind = 'junior' and (select count(distinct v) from unnest(deck) v) <> 27)
           as n_bad_decks
    into a;
  if a is distinct from b then
    raise exception 'setgame tiles: before % after %', b, a;
  end if;

  select count(*) into n_malformed
    from (select unnest(deck || board) v from setgame.games
          union all
          select unnest(cards || board_after) from setgame.events) t
   where v::text !~ '^[1-3]{4}$';
  if n_malformed > 0 then
    raise exception 'setgame tiles: % stored tile(s) not four digits of 1..3', n_malformed;
  end if;

  -- The junior deck's fill is fixed at solid.
  select count(*) into n_malformed
    from setgame.games g, unnest(g.deck) v
   where g.deck_kind = 'junior' and (v / 10) % 10 <> 1;
  if n_malformed > 0 then
    raise exception 'setgame tiles: % junior tile(s) whose fill is not 1', n_malformed;
  end if;
end $$;

alter table setgame.events rename column cards to tiles;
alter table setgame.players rename column sets_found to n_sets_found;
alter table setgame.players rename column hints_used to n_hints_used;
