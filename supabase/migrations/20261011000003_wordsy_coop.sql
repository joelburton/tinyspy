-- cs-unmet

-- ============================================================
-- wordsy — the coop sibling: solo and the team, on the solo card
-- ============================================================
--
-- `wordsy_coop` plays the back of the rulebook's No Flip card (plans/wordsy.md
-- → Solo and coop): one word a round for the whole table, a clock from the
-- deal, and a three-band card the timer moves along — a word of 15 or more
-- that beat the clock earns a bonus, a round under 20 moves the band down,
-- off the bottom is a penalty. One to six players; the team writes
-- free-for-all or turn-by-turn. The behavior is supabase/sql/wordsy.sql's;
-- this is the shape it keeps.

-- The card's state, one per game: the band the timer sits on and the
-- penalties taken. Null in a compete game, which has no card.
alter table wordsy.games
  add column band        smallint check (band between 1 and 3),
  add column n_penalties int      check (n_penalties >= 0);

-- What the round's word did against the card, kept on the reveal row so the
-- scoresheets can show it: whether it beat the clock, and the band it was
-- scored on. Null in a compete game.
alter table wordsy.events
  add column beat_clock boolean,
  add column band       smallint check (band between 1 and 3);

-- ============================================================
-- Register the gametype
-- ============================================================
-- Beside `wordsy_compete`, on the family `wordsy`; a solo game is one player,
-- so `min_players` is 1 and a solo club lists it.
insert into common.gametypes (gametype, min_players, brand) values
  ('wordsy_coop', 1, 'FlipWord')
on conflict do nothing;

-- Every existing club gets a row, since a missing `clubs_gametypes` row is a
-- disabled game (20261007000002_paw_protection). Enabled by
-- `common._default_gametypes_for_club`'s rule, written out here because a
-- migration cannot call supabase/sql/: a default-enrolled gametype, except
-- one that needs two players in a solo club — which this one does not.
insert into common.clubs_gametypes (club_handle, gametype, is_enabled)
select c.handle,
       g.gametype,
       g.default_enroll and (not c.is_solo or g.min_players <= 1)
  from common.clubs c
 cross join common.gametypes g
 where g.gametype = 'wordsy_coop'
on conflict (club_handle, gametype) do nothing;
