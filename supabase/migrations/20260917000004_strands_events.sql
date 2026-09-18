-- cs-unmet

-- ============================================================
-- strands.events — a bigint key, took_turn, and no default kind
-- ============================================================
-- strands arrived with the name, the timestamp and the check-constrained
-- kinds. Three things left:
--
--   the KEY       uuid → bigint identity. A uuid says nothing about order,
--                 so the log's order had to be read out of `created_at` —
--                 which ties whenever two rows are written in one
--                 transaction, and a log's whole meaning is its order.
--   `took_turn`   a guess that FOUND something — a theme word, the spangram,
--                 or a valid non-theme word that earned a hint point — is a
--                 turn. A duplicate, a too-short trace and a word the
--                 dictionary does not have are misfires, not turns; the game
--                 already declines to punish them, and this records that.
--                 A hint is an ask, not a move.
--   no DEFAULT    on `kind`. Both inserts name their kind, so the default
--                 was never reached; a column that is mandatory everywhere
--                 should not be acquirable by omission anywhere.

create temporary table _strands_before on commit drop as
  select count(*) as rows,
         count(*) filter (where result in ('theme', 'spangram', 'hint_word')) as found,
         count(*) filter (where kind = 'hint') as hints
    from strands.events;

alter table strands.events alter column kind drop default;

-- ── the key: uuid → bigint identity ─────────────────────────
-- Numbered explicitly rather than by letting an identity column number rows
-- in scan order. `(created_at, id)` is the order; the `id` is only there to
-- break a tie between two rows sharing an instant, and on a uuid that
-- tie-break is ARBITRARY — stable, repeatable, and meaningless. Nothing
-- outside this table references a row's id, so replacing the key costs
-- nothing but the renumbering.
alter table strands.events add column new_id bigint;

update strands.events t
   set new_id = r.rn
  from (select id, row_number() over (order by created_at, id) as rn
          from strands.events) r
 where r.id = t.id;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from strands.events;
  if distinct_n <> n or exists (select 1 from strands.events where new_id is null) then
    raise exception 'strands.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, id) as rn
            from strands.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'strands.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table strands.events alter column new_id set not null;
alter table strands.events drop constraint events_pkey;
alter table strands.events drop column id;
alter table strands.events rename column new_id to id;
alter table strands.events alter column id add generated always as identity;
alter table strands.events add primary key (id);
select setval(pg_get_serial_sequence('strands.events', 'id'),
              coalesce((select max(id) from strands.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
-- Read off `result`, not off `kind`: every guess is a guess, and what
-- separates a turn from a misfire here is what the trace turned out to be.
alter table strands.events add column took_turn boolean;
-- `coalesce`, and it is load-bearing: a hint row's `result` is NULL, and
-- `null in (…)` is NULL rather than false — which the `set not null` below
-- caught, since a NULL took_turn is exactly the row the backfill missed.
update strands.events
   set took_turn = coalesce(result in ('theme', 'spangram', 'hint_word'), false);
alter table strands.events alter column took_turn set not null;
alter table strands.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
-- The old (game_id) index is a prefix of the new one, so it can only cost
-- writes. The partial unique index that enforces found-once is untouched.
drop index strands.strands_events_game_id_idx;
create index strands_events_game_id_id_idx on strands.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _strands_before;
  select count(*) as rows,
         count(*) filter (where took_turn) as turns,
         count(*) filter (where kind = 'hint') as hints
    into a from strands.events;

  if a.rows <> b.rows or a.hints <> b.hints then
    raise exception 'strands.events: % rows / % hints before, % / % after',
      b.rows, b.hints, a.rows, a.hints;
  end if;
  if a.turns <> b.found then
    raise exception 'strands.events: % rows found something, % marked as turns', b.found, a.turns;
  end if;
  if exists (select 1 from strands.events where took_turn and kind <> 'guess') then
    raise exception 'strands.events: a hint marked as a turn';
  end if;
end $$;
