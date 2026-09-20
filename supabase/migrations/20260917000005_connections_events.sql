-- cs-blessed-connections

-- ============================================================
-- connections.guesses → connections.events
-- ============================================================
--   the NAME      guesses → events, with the constraints and both partial
--                 unique indexes that were named after it. The old policy is
--                 dropped rather than renamed — a migration may only touch
--                 what migrations own, and a policy belongs to
--                 supabase/sql/connections.sql (docs/supabase.md → Schema vs
--                 code), which creates `events_select` right after.
--   the KEY       uuid → bigint identity. A uuid says nothing about order.
--   `kind`        one value, 'guess', and a check constraint so that stays a
--                 fact about the table rather than a habit of the two RPCs
--                 that write it.
--   `took_turn`   true on every row, because this table holds accepted
--                 guesses only: a repeat of a tile set already tried is
--                 refused before any insert, and the two branches that DO
--                 write — a correct match and a wrong-or-one-away miss — are
--                 both the player having a go. The fourth group and the
--                 fourth mistake are turns like any other.
--   `created_at`  guessed_at, under the name every events table uses.
--
-- `mode` STAYS, and it is not the denormalization it looks like: the two
-- partial unique indexes below filter on it, and a partial index predicate
-- cannot contain a subquery — so the mode has to be on the row for those
-- indexes to exist at all. They are what makes a race a no-op rather than a
-- double-counted category, which is why this game needs no matched-categories
-- table.

create temporary table _connections_before on commit drop as
  select count(*) as rows,
         count(*) filter (where result = 'correct') as correct,
         count(distinct game_id) as games
    from connections.guesses;

-- ── the name ────────────────────────────────────────────────
alter table connections.guesses rename to events;
alter table connections.events rename constraint guesses_game_id_fkey to events_game_id_fkey;
alter table connections.events rename constraint guesses_user_id_fkey to events_user_id_fkey;
alter table connections.events rename constraint guesses_result_check to events_result_check;
alter table connections.events rename constraint guesses_mode_check to events_mode_check;
alter table connections.events rename constraint guesses_matched_category_rank_check
  to events_matched_category_rank_check;
alter index connections.connections_guesses_one_correct_per_rank_coop
  rename to connections_events_one_correct_per_rank_coop;
alter index connections.connections_guesses_one_correct_per_rank_compete
  rename to connections_events_one_correct_per_rank_compete;
drop policy if exists guesses_select on connections.events;

-- ── created_at ──────────────────────────────────────────────
alter table connections.events rename column guessed_at to created_at;

-- ── kind ────────────────────────────────────────────────────
alter table connections.events add column kind text;
update connections.events set kind = 'guess';
alter table connections.events alter column kind set not null;
alter table connections.events add constraint events_kind_check check (kind in ('guess'));

-- ── the key: uuid → bigint identity ─────────────────────────
-- Numbered explicitly, in the order the rows were written: an identity
-- column added to an existing table numbers rows in SCAN order, and a log's
-- whole meaning is its order. The `id` in the ordering only breaks a tie
-- between two rows sharing an instant, and on a uuid that tie-break is
-- ARBITRARY — stable and repeatable, but meaningless.
alter table connections.events add column new_id bigint;

update connections.events t
   set new_id = r.rn
  from (select id, row_number() over (order by created_at, id) as rn
          from connections.events) r
 where r.id = t.id;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from connections.events;
  if distinct_n <> n or exists (select 1 from connections.events where new_id is null) then
    raise exception 'connections.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, id) as rn
            from connections.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'connections.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table connections.events alter column new_id set not null;
alter table connections.events drop constraint guesses_pkey;
alter table connections.events drop column id;
alter table connections.events rename column new_id to id;
alter table connections.events alter column id add generated always as identity;
alter table connections.events add primary key (id);
select setval(pg_get_serial_sequence('connections.events', 'id'),
              coalesce((select max(id) from connections.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
alter table connections.events add column took_turn boolean;
update connections.events set took_turn = true;
alter table connections.events alter column took_turn set not null;
alter table connections.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
drop index connections.connections_guesses_game_id_idx;
create index connections_events_game_id_id_idx on connections.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _connections_before;
  select count(*) as rows,
         count(*) filter (where result = 'correct') as correct,
         count(distinct game_id) as games
    into a from connections.events;

  if a.rows <> b.rows or a.games <> b.games or a.correct <> b.correct then
    raise exception 'connections.events: % rows / % correct / % games before, % / % / % after',
      b.rows, b.correct, b.games, a.rows, a.correct, a.games;
  end if;
  if exists (select 1 from connections.events where not took_turn or kind <> 'guess') then
    raise exception 'connections.events: a row that is not a guess, or that spent no turn';
  end if;
end $$;
