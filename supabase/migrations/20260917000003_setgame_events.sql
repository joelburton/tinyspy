-- cs-unmet

-- ============================================================
-- setgame.events — took_turn, and nothing else
-- ============================================================
-- setgame's log is already the shape: named `events`, keyed by a bigint
-- identity, `created_at`, a check-constrained `kind` with no default, and the
-- (game_id, id) read index. The one column it cannot have had is the answer
-- to "did this event use up one of the actor's goes?".
--
-- A claim is a turn; a hint is not. The rotation says so where it runs —
-- `claim_set` hands the turn on, `record_hint` is gated by `_require_turn`
-- and deliberately never advances, its comment calling a hint "part of YOUR
-- TURN": asking three times is how a stuck player finishes their own turn
-- rather than a way to spend someone else's. The gate is not evidence of a
-- turn, and a reader of the backfill should not take it for one.
--
-- The claim that ENDS the game is a turn like any other. The rotation stops
-- advancing at terminal in every game, which makes "it advanced the pointer"
-- the wrong test: it would write false on the winning move and leave a reader
-- unable to tell "this wasn't a turn" from "this was the last one".

create temporary table _setgame_before on commit drop as
  select count(*) as rows,
         count(*) filter (where kind = 'claim') as claims,
         count(*) filter (where kind = 'hint')  as hints
    from setgame.events;

alter table setgame.events add column took_turn boolean;
update setgame.events set took_turn = (kind = 'claim');
alter table setgame.events alter column took_turn set not null;
alter table setgame.events alter column took_turn set default false;

do $$
declare b record; a record;
begin
  select * into b from _setgame_before;
  select count(*) as rows,
         count(*) filter (where took_turn) as turns,
         count(*) filter (where not took_turn) as asks
    into a from setgame.events;

  if a.rows <> b.rows then
    raise exception 'setgame.events: % rows before, % after', b.rows, a.rows;
  end if;
  if a.turns <> b.claims or a.asks <> b.hints then
    raise exception 'setgame.events: took_turn is not the claims (% claims / % hints → % true / % false)',
      b.claims, b.hints, a.turns, a.asks;
  end if;
end $$;
