-- cs-unmet

-- ============================================================
-- psychicnum coop: each player's `guesses_used` is their own share
-- ============================================================
-- A coop game's guess budget is the team's, and every player's row used to
-- hold the team's whole count, raised in lock-step on every guess. Each row now
-- holds that player's own guesses, and the team's count is the sum of the rows
-- (plans/cross-game-consistency.md §6: a team-fact is stored as each player's
-- share). Compete rows already hold each player's own count and are untouched.
--
-- A DATA migration: the column keeps its shape. Only `submit_guess` ever raised
-- the count, one per `kind = 'guess'` row in `psychicnum.events`, and Restart
-- (`replay_board`) zeroes the count and deletes the rows together — so each
-- player's share is exactly their guess rows. A coop game whose rows do not
-- add up to its old shared count makes this raise rather than guess.

do $$
declare
  v_game_id uuid;
begin
  select pp.game_id into v_game_id
    from psychicnum.players pp
    join common.games cg on cg.id = pp.game_id
   where cg.mode = 'coop'
   group by pp.game_id
  having max(pp.guesses_used) <> (
    select count(*) from psychicnum.events e
     where e.game_id = pp.game_id and e.kind = 'guess')
   limit 1;
  if v_game_id is not null then
    raise exception 'psychicnum coop game % has guess rows that do not add up to its guesses_used', v_game_id;
  end if;
end;
$$;

update psychicnum.players pp
   set guesses_used = (
     select count(*) from psychicnum.events e
      where e.game_id = pp.game_id
        and e.user_id = pp.user_id
        and e.kind = 'guess')
  from common.games cg
 where cg.id = pp.game_id
   and cg.mode = 'coop';
