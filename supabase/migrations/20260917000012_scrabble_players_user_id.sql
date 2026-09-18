-- cs-unmet

-- ============================================================
-- scrabble.players — every seat has a player
-- ============================================================
-- The AI seats have users now, so the nullable `user_id` that let a seat have
-- nobody has nothing left to describe. Two shapes follow from that:
--
--   NOT NULL      every seat is somebody's, bot or person — the old AI seats
--                 backfilled below.
--   the KEY       (game_id, seat) → (game_id, user_id). A player is in a game
--                 once; which SEAT they hold is a fact about the game, not
--                 their identity in it. `seat` keeps its own unique
--                 constraint — it owns the rack and the display order, and
--                 two players must never share one.
--
-- A game dealt before the bots were accounts has ownerless AI seats, and they
-- are backfilled here rather than left to fail the `set not null`. A bot is a
-- bot: which one held a seat in a finished game is not a fact anyone recorded,
-- so naming one is not a guess about lost data — it is giving an anonymous seat
-- the identity the game would give it today, so the game stays readable.
--
-- One bot per seat WITHIN a game, because `(game_id, user_id)` becomes the
-- primary key below: the game's ownerless seats are numbered by `seat`, the
-- bots not already in that game are ranked by username, and the two are matched
-- rank for rank. Deterministic, and it never lands a bot in a game twice.
with seat as (
  select p.game_id, p.seat,
         row_number() over (partition by p.game_id order by p.seat) as nth
    from scrabble.players p
   where p.user_id is null
),
bot as (
  select g.game_id, b.user_id,
         row_number() over (partition by g.game_id order by b.username) as nth
    from (select distinct game_id from seat) g
   cross join common.profiles b
   where b.ai_member
     and not exists (select 1 from scrabble.players q
                      where q.game_id = g.game_id and q.user_id = b.user_id)
)
update scrabble.players p
   set user_id = bot.user_id
  from seat
  join bot on bot.game_id = seat.game_id and bot.nth = seat.nth
 where p.game_id = seat.game_id and p.seat = seat.seat;

-- Holding a seat is only half of being a player: `common.game_players` is what
-- the roster, the concede count and `end_game`'s per-player result read, and
-- create_game puts a bot there alongside the humans. A backfilled seat gets the
-- same row, with the column defaults it would have had — never conceded, no
-- result until the game writes one.
insert into common.game_players (game_id, user_id)
select p.game_id, p.user_id
  from scrabble.players p
  join common.profiles pr on pr.user_id = p.user_id and pr.ai_member
 where not exists (select 1 from common.game_players gp
                    where gp.game_id = p.game_id and gp.user_id = p.user_id);

-- What is left can only be a game with more ownerless seats than there are
-- bots to fill them, which means `gmake db-bots` has not been run on this
-- database. Say that, rather than letting `set not null` report a null.
do $$
declare n bigint;
begin
  select count(*) into n from scrabble.players where user_id is null;
  if n > 0 then
    raise exception 'scrabble.players: % seat(s) still have no player', n
      using detail = 'there are fewer common.profiles.ai_member rows than a '
                     'game has AI seats — run `gmake db-bots` first';
  end if;
end $$;

alter table scrabble.players alter column user_id set not null;

-- The unique constraint on (game_id, user_id) is already there; promote it by
-- swapping which of the two is the primary key.
alter table scrabble.players drop constraint players_pkey;
alter table scrabble.players drop constraint players_game_id_user_id_key;
alter table scrabble.players add constraint players_pkey primary key (game_id, user_id);
alter table scrabble.players add constraint players_game_id_seat_key unique (game_id, seat);
