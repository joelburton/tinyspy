-- cs-unmet

-- ============================================================
-- scrabble.plays → scrabble.events
-- ============================================================
--   the NAME      plays → events, with its constraints and index. The old
--                 policy is dropped rather than renamed (docs/supabase.md →
--                 Schema vs code).
--   the KEY       (game_id, seq) → a bigint identity. `seq` was already
--                 game-wide — `max(seq) + 1` over the whole game, assigned to
--                 every row — so it was the row's position in the log under
--                 another name, and `id` is that fact without a second
--                 column to keep in step.
--   the KIND      `forfeit` → `leftovers`. The row is the leftover tiles'
--                 value as a negative score, written by `end_game` when the
--                 table stops with tiles still in the rack. "Forfeit" names a
--                 punishment the row does not make: its outcome is neutral.
--   `took_turn`   a word, an exchange, a pass. Not `leftovers` — no player
--                 made that move; `end_game` wrote it.
--   `created_at`  played_at, under the name every events table uses.
--
-- `user_id` STAYS NULLABLE, alone among the ten logs: scrabble's AI seats
-- hold a seat and play like anyone else, and no profile row answers for them.
-- The events skeleton guard names this as its one exception until those seats
-- have accounts.
--
-- `pass` needs no mode branch even though the seat pointer is compete's:
-- `current_seat` is set only in create_game's compete arm, and _commit_pass
-- gates on it unconditionally, so a coop pass raises PN457 rather than
-- writing a row. Every pass in this table is a compete pass, and every one of
-- them moved the seat on.

create temporary table _scrabble_before on commit drop as
  select count(*) as rows,
         count(*) filter (where kind = 'word')     as words,
         count(*) filter (where kind = 'exchange') as exchanges,
         count(*) filter (where kind = 'pass')     as passes,
         count(*) filter (where kind = 'forfeit')  as leftovers
    from scrabble.plays;

-- ── the name ────────────────────────────────────────────────
alter table scrabble.plays rename to events;
alter table scrabble.events rename constraint plays_game_id_fkey to events_game_id_fkey;
drop policy if exists plays_select on scrabble.events;

-- ── created_at ──────────────────────────────────────────────
alter table scrabble.events rename column played_at to created_at;

-- ── the kind: leftovers ─────────────────────────────────────
alter table scrabble.events drop constraint plays_kind_check;
update scrabble.events set kind = 'leftovers' where kind = 'forfeit';
alter table scrabble.events add constraint events_kind_check
  check (kind in ('word', 'exchange', 'pass', 'leftovers'));

-- ── the key: (game_id, seq) → bigint identity ───────────────
-- `(created_at, seq)` is the order rows were written, and here the tie-break
-- is exact rather than arbitrary: `seq` is game-wide, so two rows sharing an
-- instant are still strictly ordered by it.
alter table scrabble.events add column new_id bigint;

update scrabble.events t
   set new_id = r.rn
  from (select game_id, seq,
               row_number() over (order by created_at, seq) as rn
          from scrabble.events) r
 where r.game_id = t.game_id and r.seq = t.seq;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from scrabble.events;
  if distinct_n <> n or exists (select 1 from scrabble.events where new_id is null) then
    raise exception 'scrabble.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, seq) as rn
            from scrabble.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'scrabble.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table scrabble.events alter column new_id set not null;
alter table scrabble.events drop constraint plays_pkey;
alter table scrabble.events drop column seq;
alter table scrabble.events rename column new_id to id;
alter table scrabble.events alter column id add generated always as identity;
alter table scrabble.events add primary key (id);
select setval(pg_get_serial_sequence('scrabble.events', 'id'),
              coalesce((select max(id) from scrabble.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
alter table scrabble.events add column took_turn boolean;
update scrabble.events set took_turn = (kind <> 'leftovers');
alter table scrabble.events alter column took_turn set not null;
alter table scrabble.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
drop index scrabble.scrabble_plays_game_id_idx;
create index scrabble_events_game_id_id_idx on scrabble.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _scrabble_before;
  select count(*)                                    as rows,
         count(*) filter (where kind = 'word')       as words,
         count(*) filter (where kind = 'exchange')   as exchanges,
         count(*) filter (where kind = 'pass')       as passes,
         count(*) filter (where kind = 'leftovers')  as leftovers,
         count(*) filter (where took_turn)           as turns
    into a from scrabble.events;

  if a.rows <> b.rows then
    raise exception 'scrabble.events: % rows before, % after', b.rows, a.rows;
  end if;
  if (a.words, a.exchanges, a.passes, a.leftovers)
     is distinct from (b.words, b.exchanges, b.passes, b.leftovers) then
    raise exception 'scrabble.events: the kinds did not map one for one';
  end if;
  if a.turns <> b.words + b.exchanges + b.passes then
    raise exception 'scrabble.events: % moves should be % turns, got %',
      b.words + b.exchanges + b.passes, b.words + b.exchanges + b.passes, a.turns;
  end if;
end $$;
