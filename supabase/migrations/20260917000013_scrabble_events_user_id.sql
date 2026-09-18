-- cs-unmet

-- ============================================================
-- scrabble.events.user_id — every event has an author
-- ============================================================
-- The last nullable `user_id` in any game's log, and the reason it was
-- nullable is gone: an AI seat had no user to name, and now it has a bot with
-- a profile like anyone else. Every one of the ten logs takes the skeleton in
-- full from here.
--
-- A play made before the bots were accounts has no author, and gets the one
-- the migration before this just gave its seat: `seat` is on every row, and
-- `scrabble.players` now says who holds it. The row and the seat therefore
-- agree by construction rather than by a second choice of bot.
update scrabble.events e
   set user_id = p.user_id
  from scrabble.players p
 where p.game_id = e.game_id and p.seat = e.seat
   and e.user_id is null;

-- Nothing should be left: every row's `(game_id, seat)` is a seat in the same
-- game, and every seat has a player. If one is, say what it was rather than
-- letting `set not null` report a null.
do $$
declare n bigint;
begin
  select count(*) into n from scrabble.events where user_id is null;
  if n > 0 then
    raise exception 'scrabble.events: % row(s) name a seat with no player', n
      using detail = 'an events row whose (game_id, seat) is not in scrabble.players';
  end if;
end $$;

alter table scrabble.events alter column user_id set not null;
