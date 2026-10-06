-- cs-unmet

-- ============================================================
-- scrabble: letters lowercase, a player's score their own, every scoring row
-- ============================================================
-- Four changes, settled with Joel on 2026-10-05 when scrabble's seat-view
-- conversion opened (plans/areas/scrabble.md → The conversion):
--
--   LOWERCASE   Every stored letter — the bag, the racks, the board's cells,
--               a word play's placements and its words — was uppercase; every
--               other word game keeps its letters lowercase and draws the
--               capitals. `?` is still the blank. A game's title keeps its
--               capitals: it is drawn text.
--   OWN SCORE   A coop player's `score` is their own in every mode
--               (docs/common-schema.md → A player's facts): the points from the words they
--               committed, counted off their rows in `scrabble.events`. The
--               team's score is the players' sum plus the leftovers rows, so
--               `games.coop_score` goes, and `players.score` is never null.
--   THE ROWS    Every leftover deduction and the going-out bonus is a row in
--               `scrabble.events`: `leftovers` (negative, one per rack) and
--               the new kind `went_out` (positive, for the player who emptied
--               their rack with the bag empty). Until now only a coop Stop
--               wrote one; the other endings deducted silently. An ended game
--               gets the rows it is missing, from the racks still stored on it,
--               and every player's rows must then sum to their score.
--   team_rack   `coop_rack` → `team_rack`: the page blobs name the group
--               `team`, and the old name said the mode rather than whose it is.
--
-- The page blobs are rebuilt by hand after the deploy
-- (`select scrabble._rebuild_data_cols_for_all()`), since a migration cannot
-- call what `supabase/sql/` defines.

-- The two views read the columns renamed and dropped below;
-- supabase/sql/scrabble.sql no longer creates them.
drop view if exists scrabble.games_state;
drop view if exists scrabble.players_state;

-- ─── Lowercase ─────────────────────────────────────────────
create function pg_temp.scrabble_lower(p text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(lower(t) order by o), '{}')::text[]
    from unnest(p) with ordinality as x(t, o);
$$;

create temporary table _scrabble_before on commit drop as
  select (select count(*) from scrabble.games) as n_games,
         (select coalesce(sum(cardinality(bag)), 0) from scrabble.games) as n_bag,
         (select coalesce(sum(cardinality(coop_rack)), 0) from scrabble.games) as n_team_rack,
         (select coalesce(sum(cardinality(rack)), 0) from scrabble.players) as n_rack,
         (select count(*) from scrabble.games g, jsonb_array_elements(g.board) c
           where jsonb_typeof(c) = 'object') as n_cells,
         (select count(*) from scrabble.events) as n_events,
         (select coalesce(sum(jsonb_array_length(placements)), 0) from scrabble.events
           where placements is not null) as n_placements,
         (select coalesce(sum(cardinality(words)), 0) from scrabble.events
           where words is not null) as n_words;

update scrabble.games
   set bag       = pg_temp.scrabble_lower(bag),
       coop_rack = case when coop_rack is null then null else pg_temp.scrabble_lower(coop_rack) end,
       board     = (select jsonb_agg(
                             case when jsonb_typeof(c) = 'object'
                                  then jsonb_set(c, '{l}', to_jsonb(lower(c->>'l')))
                                  else c end
                             order by o)
                      from jsonb_array_elements(board) with ordinality as x(c, o));

update scrabble.players
   set rack = pg_temp.scrabble_lower(rack)
 where rack is not null;

update scrabble.events
   set placements = (select coalesce(jsonb_agg(
                              jsonb_set(p, '{letter}', to_jsonb(lower(p->>'letter'))) order by o),
                            '[]'::jsonb)
                       from jsonb_array_elements(placements) with ordinality as x(p, o))
 where placements is not null;

update scrabble.events
   set words = pg_temp.scrabble_lower(words)
 where words is not null;

-- The same rows and the same number of tiles, cells, placements and words;
-- and every stored letter is now lowercase.
do $$
declare
  b record;
  a record;
  n_bad bigint;
begin
  select * into b from _scrabble_before;
  select (select count(*) from scrabble.games) as n_games,
         (select coalesce(sum(cardinality(bag)), 0) from scrabble.games) as n_bag,
         (select coalesce(sum(cardinality(coop_rack)), 0) from scrabble.games) as n_team_rack,
         (select coalesce(sum(cardinality(rack)), 0) from scrabble.players) as n_rack,
         (select count(*) from scrabble.games g, jsonb_array_elements(g.board) c
           where jsonb_typeof(c) = 'object') as n_cells,
         (select count(*) from scrabble.events) as n_events,
         (select coalesce(sum(jsonb_array_length(placements)), 0) from scrabble.events
           where placements is not null) as n_placements,
         (select coalesce(sum(cardinality(words)), 0) from scrabble.events
           where words is not null) as n_words
    into a;
  if a is distinct from b then
    raise exception 'scrabble lowercase: before % after %', b, a;
  end if;

  select count(*) into n_bad
    from (select unnest(bag || coalesce(coop_rack, '{}')) as t from scrabble.games
          union all
          select unnest(rack) from scrabble.players where rack is not null) x
   where t !~ '^[a-z?]$';
  if n_bad > 0 then
    raise exception 'scrabble lowercase: % tile(s) in a bag or rack not a lowercase letter or ?', n_bad;
  end if;

  select count(*) into n_bad
    from scrabble.games g, jsonb_array_elements(g.board) c
   where jsonb_typeof(c) = 'object' and (c->>'l') !~ '^[a-z]$';
  if n_bad > 0 then
    raise exception 'scrabble lowercase: % board cell(s) not a lowercase letter', n_bad;
  end if;

  select count(*) into n_bad
    from scrabble.events e, jsonb_array_elements(e.placements) p
   where (p->>'letter') !~ '^[a-z]$';
  if n_bad > 0 then
    raise exception 'scrabble lowercase: % placement(s) not a lowercase letter', n_bad;
  end if;

  select count(*) into n_bad
    from scrabble.events e, unnest(e.words) w
   where w !~ '^[a-z]+$';
  if n_bad > 0 then
    raise exception 'scrabble lowercase: % word(s) not lowercase letters', n_bad;
  end if;
end $$;

-- ─── The scoring rows ──────────────────────────────────────
alter table scrabble.events drop constraint events_kind_check;
alter table scrabble.events add constraint events_kind_check
  check (kind in ('word', 'exchange', 'pass', 'leftovers', 'went_out'));

-- A tile's points, as scrabble._tile_value scores them — mirrored here because
-- on a fresh database the migrations run before supabase/sql/ defines it.
create function pg_temp.scrabble_tile_value(p_tile text)
returns int
language sql
immutable
as $$
  select case p_tile
    when 'a' then 1 when 'e' then 1 when 'i' then 1 when 'o' then 1
    when 'u' then 1 when 'l' then 1 when 'n' then 1 when 's' then 1
    when 't' then 1 when 'r' then 1
    when 'd' then 2 when 'g' then 2
    when 'b' then 3 when 'c' then 3 when 'm' then 3 when 'p' then 3
    when 'f' then 4 when 'h' then 4 when 'v' then 4 when 'w' then 4
    when 'y' then 4
    when 'k' then 5
    when 'j' then 8 when 'x' then 8
    when 'q' then 10 when 'z' then 10
    else 0
  end;
$$;

create function pg_temp.scrabble_rack_value(p_rack text[])
returns int
language sql
immutable
as $$
  select coalesce(sum(pg_temp.scrabble_tile_value(t)), 0)::int from unnest(p_rack) t;
$$;

-- A compete game scored its leftovers on every ending but a Stop; the rows
-- are written from the final racks, dated the game's end. A game that already
-- has one is left alone. The player who went out is whose act ended the game
-- — or, where the ending recorded nobody (a game ended before common kept
-- `game_ended_by_user_id`), the one player whose rack is empty.
create temporary table _scrabble_compete_scored on commit drop as
  select g.game_id, cg.ended_at,
         cg.game_ended_reason_detail = 'complete' as went_out,
         coalesce(cg.game_ended_by_user_id,
                  (select min(p.user_id::text)::uuid from scrabble.players p
                    where p.game_id = g.game_id and cardinality(p.rack) = 0
                    having count(*) = 1)) as went_out_user_id
    from scrabble.games g
    join common.games cg on cg.id = g.game_id
   where cg.mode = 'compete'
     and cg.ended_at is not null
     and cg.game_ended_reason <> 'stopped'
     and not exists (select 1 from scrabble.events e
                      where e.game_id = g.game_id and e.kind in ('leftovers', 'went_out'));

do $$
declare n bigint;
begin
  select count(*) into n from _scrabble_compete_scored
   where went_out and went_out_user_id is null;
  if n > 0 then
    raise exception 'scrabble.events: % compete game(s) went out and name no single player who did', n;
  end if;
end $$;

insert into scrabble.events (game_id, user_id, kind, score, tile_count, took_turn, created_at)
select p.game_id, p.user_id, 'leftovers',
       -pg_temp.scrabble_rack_value(p.rack), cardinality(p.rack), false, s.ended_at
  from scrabble.players p
  join _scrabble_compete_scored s on s.game_id = p.game_id
 where pg_temp.scrabble_rack_value(p.rack) > 0;

-- The player who went out collects every other rack's leftovers; their own
-- rack is empty, so the sum over the table is the opponents'.
insert into scrabble.events (game_id, user_id, kind, score, tile_count, took_turn, created_at)
select s.game_id, s.went_out_user_id, 'went_out',
       (select sum(pg_temp.scrabble_rack_value(p.rack)) from scrabble.players p
         where p.game_id = s.game_id),
       null, false, s.ended_at
  from _scrabble_compete_scored s
 where s.went_out
   and (select sum(pg_temp.scrabble_rack_value(p.rack)) from scrabble.players p
         where p.game_id = s.game_id) > 0;

-- A coop game's leftovers were deducted on every ending and logged on a Stop
-- alone. The row's author is whose act ended the game; a coop game that needs
-- a row and recorded no one is reported rather than guessed at.
do $$
declare n bigint;
begin
  select count(*) into n
    from scrabble.games g
    join common.games cg on cg.id = g.game_id
   where cg.mode = 'coop'
     and cg.ended_at is not null
     and pg_temp.scrabble_rack_value(g.coop_rack) > 0
     and not exists (select 1 from scrabble.events e
                      where e.game_id = g.game_id and e.kind = 'leftovers')
     and cg.game_ended_by_user_id is null;
  if n > 0 then
    raise exception 'scrabble.events: % coop game(s) need a leftovers row and name nobody who ended them', n;
  end if;
end $$;

insert into scrabble.events (game_id, user_id, kind, score, tile_count, took_turn, created_at)
select g.game_id, cg.game_ended_by_user_id, 'leftovers',
       -pg_temp.scrabble_rack_value(g.coop_rack), cardinality(g.coop_rack), false, cg.ended_at
  from scrabble.games g
  join common.games cg on cg.id = g.game_id
 where cg.mode = 'coop'
   and cg.ended_at is not null
   and pg_temp.scrabble_rack_value(g.coop_rack) > 0
   and not exists (select 1 from scrabble.events e
                    where e.game_id = g.game_id and e.kind = 'leftovers');

-- ─── Own score ─────────────────────────────────────────────
create temporary table _scrabble_coop_before on commit drop as
  select g.game_id, g.coop_score
    from scrabble.games g
    join common.games cg on cg.id = g.game_id
   where cg.mode = 'coop';

update scrabble.players p
   set score = coalesce((select sum(e.score) from scrabble.events e
                          where e.game_id = p.game_id
                            and e.user_id = p.user_id
                            and e.kind = 'word'), 0)
  from common.games cg
 where cg.id = p.game_id
   and cg.mode = 'coop';

-- Every coop game's players now sum, with its leftovers rows, to the score the
-- game row carried; and every compete player's rows — words, leftovers, the
-- going-out bonus — sum to their score.
do $$
declare off_by bigint;
begin
  select count(*) into off_by
    from _scrabble_coop_before b
   where b.coop_score is distinct from (
     (select coalesce(sum(p.score), 0) from scrabble.players p where p.game_id = b.game_id)
     + (select coalesce(sum(e.score), 0) from scrabble.events e
         where e.game_id = b.game_id and e.kind = 'leftovers'));
  if off_by > 0 then
    raise exception 'scrabble.players: % coop game(s) whose players and leftovers do not sum to the team''s score', off_by;
  end if;

  select count(*) into off_by
    from scrabble.players p
    join common.games cg on cg.id = p.game_id
   where cg.mode = 'compete'
     and p.score is distinct from (
       select coalesce(sum(e.score), 0) from scrabble.events e
        where e.game_id = p.game_id and e.user_id = p.user_id
          and e.kind in ('word', 'leftovers', 'went_out'));
  if off_by > 0 then
    raise exception 'scrabble.players: % compete player(s) whose rows do not sum to their score', off_by;
  end if;
end $$;

alter table scrabble.players
  alter column score set not null,
  alter column score set default 0;

alter table scrabble.games drop column coop_score;
alter table scrabble.games rename column coop_rack to team_rack;
