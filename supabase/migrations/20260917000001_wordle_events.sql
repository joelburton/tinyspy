-- cs-met-wordle

-- ============================================================
-- wordle.guesses → wordle.events
-- ============================================================
-- The same skeleton psychicnum took, and two moves psychicnum did not need:
-- a `kind` column where there was none, and the end of a `seq` that was also
-- half the primary key.
--
--   the NAME      guesses → events, with its constraints and index. The old
--                 policy is DROPPED rather than renamed — a migration may
--                 only touch what migrations own, and a policy belongs to
--                 supabase/sql/wordle.sql, which creates `events_select`
--                 right after (docs/supabase.md → Schema vs code).
--   the KEY       (game_id, user_id, seq) → a bigint identity. A composite
--                 key that ends in a counter makes every reader reconstruct
--                 the order of play out of two columns, and gives the
--                 frontend no stable way to name one row.
--   `kind`        every row here is a guess and there is no second kind
--                 today — the check constraint is what keeps that a fact
--                 about the table rather than a habit of the one RPC that
--                 writes it.
--   `took_turn`   an accepted guess spends one of the guesser's goes, the
--                 solving one included. Nothing else is in this table: a
--                 duplicate or a non-word is refused without a row.
--   `created_at`  guessed_at, under the name every events table uses.
--
-- `seq` GOES, and three things were reading it. It was the guesser's 1-based
-- count, which `wordle.players.guesses_used` holds live and is the authority
-- for; it was the read order, which is `id`; and it was half the key. Its
-- fourth reader is in the repeatable half — the club-list subtitle picks the
-- latest guess with `order by … desc limit 1` — and moves to `id` there.

create temporary table _wordle_before on commit drop as
  select count(*) as rows, count(distinct game_id) as games from wordle.guesses;

-- ── the name ────────────────────────────────────────────────
alter table wordle.guesses rename to events;
alter table wordle.events rename constraint guesses_game_id_fkey to events_game_id_fkey;
alter table wordle.events rename constraint guesses_user_id_fkey to events_user_id_fkey;
drop policy if exists guesses_select on wordle.events;

-- ── created_at ──────────────────────────────────────────────
alter table wordle.events rename column guessed_at to created_at;

-- ── kind ────────────────────────────────────────────────────
-- Added, filled, then pinned — rather than `not null default 'guess'`, which
-- would make the one value arrive by omission at every future insert.
alter table wordle.events add column kind text;
update wordle.events set kind = 'guess';
alter table wordle.events alter column kind set not null;
alter table wordle.events add constraint events_kind_check check (kind in ('guess'));

-- ── the key: (game_id, user_id, seq) → bigint identity ──────
-- Numbered explicitly, in the order the rows were written, because an
-- identity column added to an existing table numbers rows in SCAN order and
-- a log's whole meaning is its order. `(created_at, seq)` is that order:
-- the timestamp first, and `seq` to break a tie — which is the right
-- tie-break rather than an arbitrary one, since two rows sharing an instant
-- are two players moving at once in coop, where `seq` is the shared team
-- count and so still says which came first.
alter table wordle.events add column new_id bigint;

update wordle.events t
   set new_id = r.rn
  from (select game_id, user_id, seq,
               row_number() over (order by created_at, seq) as rn
          from wordle.events) r
 where r.game_id = t.game_id and r.user_id = t.user_id and r.seq = t.seq;

do $$
declare n bigint; distinct_n bigint; out_of_order bigint;
begin
  select count(*), count(distinct new_id) into n, distinct_n from wordle.events;
  if distinct_n <> n or exists (select 1 from wordle.events where new_id is null) then
    raise exception 'wordle.events: the new key is not one dense number per row (% rows, % distinct)', n, distinct_n;
  end if;
  select count(*) into out_of_order
    from (select new_id, row_number() over (order by created_at, seq) as rn
            from wordle.events) x
   where x.new_id <> x.rn;
  if out_of_order > 0 then
    raise exception 'wordle.events: % row(s) numbered out of the order they were written', out_of_order;
  end if;
end $$;

alter table wordle.events alter column new_id set not null;
alter table wordle.events drop constraint guesses_pkey;
alter table wordle.events drop column seq;
alter table wordle.events rename column new_id to id;
alter table wordle.events alter column id add generated always as identity;
alter table wordle.events add primary key (id);
select setval(pg_get_serial_sequence('wordle.events', 'id'),
              coalesce((select max(id) from wordle.events), 0) + 1,
              false);

-- ── took_turn ───────────────────────────────────────────────
-- True on every row, and that is not the same as "always true": this table
-- holds accepted guesses only, and an accepted guess is a go spent — in
-- compete, in coop, and on the guess that wins.
alter table wordle.events add column took_turn boolean;
update wordle.events set took_turn = true;
alter table wordle.events alter column took_turn set not null;
alter table wordle.events alter column took_turn set default false;

-- ── the read index ──────────────────────────────────────────
drop index wordle.wordle_guesses_game_id_idx;
create index wordle_events_game_id_id_idx on wordle.events (game_id, id);

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _wordle_before;
  select count(*) as rows, count(distinct game_id) as games into a from wordle.events;

  if a.rows <> b.rows or a.games <> b.games then
    raise exception 'wordle.events: % rows over % games before, % over % after',
      b.rows, b.games, a.rows, a.games;
  end if;
  if exists (select 1 from wordle.events where not took_turn or kind <> 'guess') then
    raise exception 'wordle.events: a row that is not a guess, or that spent no turn';
  end if;
end $$;
