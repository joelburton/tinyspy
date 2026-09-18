-- cs-unmet

-- ============================================================
-- stackdown.submissions → stackdown.events
-- ============================================================
--   the NAME      submissions → events, with its constraints and index. The
--                 old policy is dropped rather than renamed (docs/supabase.md
--                 → Schema vs code).
--   the KEY       (game_id, user_id, seq) → a bigint identity. `seq` was a
--                 per-submitter counter that existed to keep that composite
--                 key collision-free under concurrent submits, and nothing
--                 else read it.
--   the KIND      `reveal` → `spoiler`. Handing over one solution word
--                 mid-game is a spoiler; `reveal` is what the whole solution
--                 at game over is called. The frontend has said "spoiler"
--                 since the two were told apart.
--   `took_turn`   a `word` — accepted OR refused — and a `spoiler`. Not a
--                 hint.
--   `created_at`  submitted_at, under the name every events table uses.
--
-- `took_turn` here could not be read out of the code, because stackdown has
-- no rotation to read: it is the one shared-board game with no turn order at
-- all, deliberately, since in-progress selections are private and teammates
-- build words in parallel rather than taking turns on one. The rule is stated
-- rather than derived — a good word and a bad word both spend a go, and so
-- does being handed one — and it is a record of turns TAKEN, which this game
-- wants whether or not anything is passing a pointer around. Every game has
-- turns; only some games rotate them.

create temporary table _stackdown_before on commit drop as
  select count(*) as rows,
         count(*) filter (where kind = 'word')   as words,
         count(*) filter (where kind = 'hint')   as hints,
         count(*) filter (where kind = 'reveal') as spoilers
    from stackdown.submissions;

-- ── the name ────────────────────────────────────────────────
alter table stackdown.submissions rename to events;
alter table stackdown.events rename constraint submissions_game_id_fkey to events_game_id_fkey;
alter table stackdown.events rename constraint submissions_user_id_fkey to events_user_id_fkey;
alter table stackdown.events rename constraint submissions_word_shape to events_word_shape;
drop policy if exists submissions_select on stackdown.events;

-- ── created_at ──────────────────────────────────────────────
alter table stackdown.events rename column submitted_at to created_at;

-- ── the kind: spoiler, and no default ───────────────────────
-- The default goes with it. stackdown's word insert was the one that leaned
-- on it, which is exactly the argument against having it: a column every
-- insert must state should not be acquirable by omission.
alter table stackdown.events drop constraint submissions_kind_check;
update stackdown.events set kind = 'spoiler' where kind = 'reveal';
alter table stackdown.events alter column kind drop default;
alter table stackdown.events add constraint events_kind_check
  check (kind in ('word', 'hint', 'spoiler'));

-- ── the key: (game_id, user_id, seq) → bigint identity ──────
-- `(created_at, seq)` is the order rows were written: the timestamp first,
-- `seq` only to break a tie between two players submitting in one instant —
-- which is the tie `seq` was invented to break in the key.
alter table stackdown.events add column new_id bigint;

update stackdown.events t
   set new_id = r.rn
  from (select game_id, user_id, seq,
               row_number() over (order by created_at, seq) as rn
          from stackdown.events) r
 where r.game_id = t.game_id and r.user_id = t.user_id and r.seq = t.seq;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from stackdown.events;
  if distinct_n <> n or exists (select 1 from stackdown.events where new_id is null) then
    raise exception 'stackdown.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, seq) as rn
            from stackdown.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'stackdown.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table stackdown.events alter column new_id set not null;
alter table stackdown.events drop constraint submissions_pkey;
alter table stackdown.events drop column seq;
alter table stackdown.events rename column new_id to id;
alter table stackdown.events alter column id add generated always as identity;
alter table stackdown.events add primary key (id);
select setval(pg_get_serial_sequence('stackdown.events', 'id'),
              coalesce((select max(id) from stackdown.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
alter table stackdown.events add column took_turn boolean;
update stackdown.events set took_turn = (kind in ('word', 'spoiler'));
alter table stackdown.events alter column took_turn set not null;
alter table stackdown.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
drop index stackdown.stackdown_submissions_game_id_idx;
create index stackdown_events_game_id_id_idx on stackdown.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _stackdown_before;
  select count(*)                                  as rows,
         count(*) filter (where kind = 'word')     as words,
         count(*) filter (where kind = 'hint')     as hints,
         count(*) filter (where kind = 'spoiler')  as spoilers,
         count(*) filter (where took_turn)         as turns
    into a from stackdown.events;

  if a.rows <> b.rows then
    raise exception 'stackdown.events: % rows before, % after', b.rows, a.rows;
  end if;
  if (a.words, a.hints, a.spoilers) is distinct from (b.words, b.hints, b.spoilers) then
    raise exception 'stackdown.events: the kinds did not map one for one (% % % → % % %)',
      b.words, b.hints, b.spoilers, a.words, a.hints, a.spoilers;
  end if;
  if a.turns <> b.words + b.spoilers then
    raise exception 'stackdown.events: % words + % spoilers should be % turns, got %',
      b.words, b.spoilers, b.words + b.spoilers, a.turns;
  end if;
end $$;
