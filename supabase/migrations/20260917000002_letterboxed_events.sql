-- cs-unmet

-- ============================================================
-- letterboxed.events — the kinds get their verbs, and took_turn
-- ============================================================
-- letterboxed's log arrived in the shape the others are moving to: already
-- named `events`, already keyed by a bigint identity, already `created_at`,
-- already carrying the (game_id, id) read index. Two things are left.
--
--   the KINDS     played → word, undone → undo, cleared → clear. Every other
--                 game's kinds name the THING the row is (a guess, a hint, a
--                 spoiler, a claim), and these three named the thing that
--                 happened to it. The row is a word, an undo, a clear.
--   `took_turn`   did this event use up one of the actor's goes?
--
-- `took_turn` is true for a word, an undo AND a clear here. The undo is the
-- interesting one: costing your go is exactly what stops it being a free
-- reroll, which is why turn-by-turn coop offers it. The clear is the one no
-- rotation ever had to rule on, because it is forbidden in turn coop
-- (PN411) and so only ever happens where nothing is counting — it takes a
-- turn wherever it can be played, and turn coop is the one place it cannot.
-- Neither helper takes one: a hint names a word's shape and a spoiler hands
-- it over, and both are coop-only asks rather than moves.

create temporary table _letterboxed_before on commit drop as
  select count(*) as rows,
         count(*) filter (where kind = 'played')  as words,
         count(*) filter (where kind = 'undone')  as undos,
         count(*) filter (where kind = 'cleared') as clears,
         count(*) filter (where kind in ('hint', 'spoiler')) as helpers
    from letterboxed.events;

-- ── the kinds ───────────────────────────────────────────────
-- The old constraint comes off first (it has never heard of `word`) and the
-- new one goes on last, where adding it validates every existing row and so
-- doubles as the check that nothing was left saying `played`.
alter table letterboxed.events drop constraint events_kind_check;
update letterboxed.events set kind = case kind
    when 'played'  then 'word'
    when 'undone'  then 'undo'
    when 'cleared' then 'clear'
    else kind
  end;
alter table letterboxed.events add constraint events_kind_check
  check (kind in ('word', 'undo', 'clear', 'hint', 'spoiler'));

-- ── took_turn ───────────────────────────────────────────────
alter table letterboxed.events add column took_turn boolean;
update letterboxed.events set took_turn = (kind in ('word', 'undo', 'clear'));
alter table letterboxed.events alter column took_turn set not null;
alter table letterboxed.events alter column took_turn set default false;

-- ── did it all land? ────────────────────────────────────────
do $$
declare b record; a record;
begin
  select * into b from _letterboxed_before;
  select count(*)                                  as rows,
         count(*) filter (where kind = 'word')     as words,
         count(*) filter (where kind = 'undo')     as undos,
         count(*) filter (where kind = 'clear')    as clears,
         count(*) filter (where kind in ('hint', 'spoiler')) as helpers
    into a from letterboxed.events;

  if a.rows <> b.rows then
    raise exception 'letterboxed.events: % rows before, % after', b.rows, a.rows;
  end if;
  if (a.words, a.undos, a.clears, a.helpers) is distinct from (b.words, b.undos, b.clears, b.helpers) then
    raise exception 'letterboxed.events: the kinds did not map one for one (% % % % → % % % %)',
      b.words, b.undos, b.clears, b.helpers, a.words, a.undos, a.clears, a.helpers;
  end if;
  if exists (select 1 from letterboxed.events
              where took_turn <> (kind in ('word', 'undo', 'clear'))) then
    raise exception 'letterboxed.events: took_turn is not the moves';
  end if;
end $$;
