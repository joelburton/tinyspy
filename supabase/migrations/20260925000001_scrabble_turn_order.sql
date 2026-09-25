-- cs-unmet

-- ============================================================
-- scrabble compete joins the common turn order
-- ============================================================
-- Compete kept its turn in its own `scrabble.games.current_seat`, because a
-- seat could be held by an AI that was not a user. The bots are accounts now,
-- seated in `common.game_players` like anyone, so compete moves onto the
-- common turn order: each player's `common.game_players.turn_seat` is their
-- scrabble seat, and `common.games.current_turn_user_id` names the player
-- whose turn it is (`scrabble._seat_turn_order` and `common._advance_turn`
-- keep it from here on).
--
-- A DATA migration: every stored compete game needs its seats, and every game
-- still in progress its pointer, copied from `current_seat` before the column
-- is dropped. A finished game gets its seats and keeps a null pointer.

-- ─── The seats: the scrabble seat ──────────────────────────
update common.game_players gp
   set turn_seat = p.seat
  from scrabble.players p
  join scrabble.games sg on sg.id = p.game_id
 where sg.mode = 'compete'
   and gp.game_id = p.game_id
   and gp.user_id = p.user_id;

-- ─── The pointer, and the status blob ──────────────────────
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every compete game would move
-- to the deploy's date. It is disabled around the updates. It is defined in
-- `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the guard
-- skips it.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

update common.games g
   set current_turn_user_id = p.user_id
  from scrabble.games sg
  join scrabble.players p on p.game_id = sg.id and p.seat = sg.current_seat
 where g.id = sg.id
   and sg.mode = 'compete'
   and g.play_state = 'playing';

-- `scrabble._status` wrote the seat into the club-list status; nothing reads
-- it, and `common.update_state` merges, so the key would outlive the column.
update common.games
   set status = status - 'current_seat'
 where status ? 'current_seat';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;

-- ─── The column ────────────────────────────────────────────
-- `scrabble.games_state` selects it; `supabase/sql/scrabble.sql` recreates the
-- view without it.
drop view if exists scrabble.games_state;
alter table scrabble.games drop column current_seat;
