-- cs-unmet

-- ============================================================
-- waffle.swaps → waffle.events
-- ============================================================
--   the NAME      swaps → events, with its constraints and index. The old
--                 policy is dropped rather than renamed — a migration may
--                 only touch what migrations own (docs/supabase.md → Schema
--                 vs code) — and supabase/sql/waffle.sql creates
--                 `events_select` right after.
--   the KEY       (game_id, user_id, seq) → a bigint identity.
--   `kind`        one value, 'swap', under a check constraint.
--   `took_turn`   true on every row: a swap is the only move this game has,
--                 only an accepted one is written, and it spends one of the
--                 swapper's budget — the solving swap and the last one
--                 included.
--   `created_at`  swapped_at, under the name every events table uses.
--
-- `seq` GOES. It was the swapper's own 1-based count, doing three jobs: part
-- of the key, the read order, and the number the event log printed. The key
-- and the order are `id` now. The live count is `waffle.players.swaps_used`,
-- which is what the budget strip has always read; what the log prints becomes
-- the row's position in the list being shown, which is the same number in the
-- ordinary case and an honest one under a filter, where a per-player count
-- and a filtered list disagree.

create temporary table _waffle_before on commit drop as
  select count(*) as rows, count(distinct game_id) as games from waffle.swaps;

-- ── the name ────────────────────────────────────────────────
alter table waffle.swaps rename to events;
alter table waffle.events rename constraint swaps_game_id_fkey to events_game_id_fkey;
alter table waffle.events rename constraint swaps_user_id_fkey to events_user_id_fkey;
drop policy if exists swaps_select on waffle.events;

-- ── created_at ──────────────────────────────────────────────
alter table waffle.events rename column swapped_at to created_at;

-- ── kind ────────────────────────────────────────────────────
alter table waffle.events add column kind text;
update waffle.events set kind = 'swap';
alter table waffle.events alter column kind set not null;
alter table waffle.events add constraint events_kind_check check (kind in ('swap'));

-- ── the key: (game_id, user_id, seq) → bigint identity ──────
-- `(created_at, seq)` is the order rows were written: the timestamp first,
-- and `seq` to break a tie — the right tie-break rather than an arbitrary
-- one, since two rows sharing an instant are two players swapping at once and
-- each player's seq still says which of THEIR swaps it was.
alter table waffle.events add column new_id bigint;

update waffle.events t
   set new_id = r.rn
  from (select game_id, user_id, seq,
               row_number() over (order by created_at, seq) as rn
          from waffle.events) r
 where r.game_id = t.game_id and r.user_id = t.user_id and r.seq = t.seq;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from waffle.events;
  if distinct_n <> n or exists (select 1 from waffle.events where new_id is null) then
    raise exception 'waffle.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, seq) as rn
            from waffle.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'waffle.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table waffle.events alter column new_id set not null;
alter table waffle.events drop constraint swaps_pkey;
alter table waffle.events drop column seq;
alter table waffle.events rename column new_id to id;
alter table waffle.events alter column id add generated always as identity;
alter table waffle.events add primary key (id);
select setval(pg_get_serial_sequence('waffle.events', 'id'),
              coalesce((select max(id) from waffle.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
alter table waffle.events add column took_turn boolean;
update waffle.events set took_turn = true;
alter table waffle.events alter column took_turn set not null;
alter table waffle.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
drop index waffle.waffle_swaps_game_id_idx;
create index waffle_events_game_id_id_idx on waffle.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _waffle_before;
  select count(*) as rows, count(distinct game_id) as games into a from waffle.events;

  if a.rows <> b.rows or a.games <> b.games then
    raise exception 'waffle.events: % rows over % games before, % over % after',
      b.rows, b.games, a.rows, a.games;
  end if;
  if exists (select 1 from waffle.events where not took_turn or kind <> 'swap') then
    raise exception 'waffle.events: a row that is not a swap, or that spent no turn';
  end if;
end $$;
