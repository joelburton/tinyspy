-- ============================================================
-- Test: a game played by a SUBSET of club members
-- ============================================================
--
-- The setup dialog's player picker lets the creator start a game
-- with only some of the club's members (the moth+joel game while
-- leah's still en route). game_players holds that subset. This
-- pins the contract that makes the subset meaningful — and makes
-- spectators a free future UI:
--
--   **club membership gates VIEWING; game-playership gates ACTING.**
--
-- A club member who is NOT one of this game's players can still
-- read the game (read-RLS = is_club_member) but cannot make a move
-- (the move RPCs gate on common.require_game_player). The existing
-- gate tests use the outsider `dee`; this one uses `cade`, an
-- in-club member who simply wasn't dealt into this game.

begin;

set search_path = freebee, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(4);

-- 3-member club; the game is created for ada + bea only — cade is a
-- member but NOT a player (he arrived after the game started).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Subset club', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select * from freebee.create_game(
  (select handle from club),
  pg_temp.freebee_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.freebee_board()
);

-- Sanity: cade is NOT seated as a player.
reset role;
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g)
      and user_id = 'cade3333-3333-3333-3333-333333333333'),
  0::bigint,
  'cade (member, not picked) is not in game_players'
);

-- A player can act.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  freebee.submit_word((select id from g), 'bead')->>'result',
  'accepted',
  'a player (ada) can submit_word'
);

-- The member-non-player can VIEW (read-RLS gates on club membership).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is(
  (select count(*) from freebee.games_state where id = (select id from g)),
  1::bigint,
  'cade (member, not a player) CAN read the game — viewing is club-gated'
);

-- …but cannot ACT (move RPCs gate on require_game_player).
select throws_ok(
  format($$ select freebee.submit_word(%L::uuid, 'face') $$, (select id from g)),
  '42501',
  'not playing this game',
  'cade (member, not a player) CANNOT submit_word — acting is player-gated'
);

select * from finish();
rollback;
