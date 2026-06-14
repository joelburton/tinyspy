-- ============================================================
-- Test: tinyspy.create_game(target_club)
-- ============================================================
--
-- create_game is the one entry-point RPC for starting a tinyspy
-- game: it takes a target_club, seats both members, picks the
-- 25 words, generates the Duet key card, sets status='active',
-- and upserts common.club_active_game. There is no lobby state
-- and no second-player "join with code" step.
--
-- Coverage:
--   - rejection: not authenticated
--   - rejection: caller is not a member of the target club
--   - rejection: club has != 2 members (1 → solo club; 3+ would be
--     a future N-player game, not tinyspy)
--   - happy path: returns one row, game row has status='active' and
--     the correct club_id, both seats are filled, 25 words inserted
--   - common.club_active_game is upserted so the new game becomes
--     the club's active game
--   - key-card distribution: exactly matches the Duet rulebook
--     (G/G:3, G/N:5, G/A:1, N/G:5, N/N:7, N/A:1, A/G:1, A/N:1,
--     A/A:1).
--
-- Doubles as the pgTAP primer for the rest of the test suite —
-- the as_user helper, find_position lookups, and begin/rollback
-- structure are all introduced here.

begin;

set search_path = tinyspy, common, public, extensions;

select plan(13);

-- Cast: ada + bea form the 2-member club used for the happy
-- path. cade is the in-club third member for the wrong-size
-- (3-member) rejection. dee is the non-member outsider.

\ir ../_shared/setup.psql

-- ada creates a 2-member club (ada+bea) and a 3-member club
-- (ada+bea+cade). The 3-member one exercises the wrong-size
-- rejection.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club2 on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

create temp table club3 on commit drop as
select * from common.create_club('Trio', array['ada','bea','cade']);

-- ============================================================
-- Rejection paths
-- ============================================================

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format($q$ select tinyspy.create_game(%L::uuid) $q$, (select id from club2)),
  '42501',
  'must be authenticated',
  'create_game: not authenticated raises 42501'
);

-- cade is signed in but not a member of club2 (ada+bea only).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');

select throws_ok(
  format($q$ select tinyspy.create_game(%L::uuid) $q$, (select id from club2)),
  '42501',
  'not a member of this club',
  'create_game: non-member is rejected'
);

-- ada tries to start a tinyspy game in the 3-member club.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format($q$ select tinyspy.create_game(%L::uuid) $q$, (select id from club3)),
  'P0001',
  'tinyspy requires a 2-member club (this club has 3)',
  'create_game: wrong-size club is rejected with the actual member count'
);

-- ============================================================
-- Happy path
-- ============================================================

create temp table created on commit drop as
select * from tinyspy.create_game((select id from club2));

select is(
  (select count(*) from created),
  1::bigint,
  'create_game: returns exactly one (id) row'
);

select is(
  (select status from tinyspy.games where id = (select id from created)),
  'active',
  'create_game: new game starts in active status (no lobby)'
);

select is(
  (select club_id from tinyspy.games where id = (select id from created)),
  (select id from club2),
  'create_game: game is linked to the target club'
);

select is(
  (select count(*) from tinyspy.game_players where game_id = (select id from created)),
  2::bigint,
  'create_game: both club members are seated'
);

-- Caller (ada) is seat A; the other member (bea) is seat B.
select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created) and seat = 'A'),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: caller is placed in seat A'
);

select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created) and seat = 'B'),
  'bea22222-2222-2222-2222-222222222222',
  'create_game: other club member is placed in seat B'
);

select is(
  (select count(*) from tinyspy.words where game_id = (select id from created)),
  25::bigint,
  'create_game: 25 words are inserted'
);

-- ============================================================
-- club_active_game: this new game is now the club's active game
-- ============================================================

select is(
  (select game_id from common.club_active_game where club_id = (select id from club2)),
  (select id from created),
  'create_game: club_active_game points at the new game'
);

select is(
  (select gametype from common.club_active_game where club_id = (select id from club2)),
  'tinyspy',
  'create_game: gametype is recorded as tinyspy'
);

-- ============================================================
-- Key-card distribution (moved from the old start_game_test)
-- ============================================================
-- Joint distribution per the Duet rulebook:
--   G/G:3  G/N:5  G/A:1
--   N/G:5  N/N:7  N/A:1
--   A/G:1  A/N:1  A/A:1
-- Sums to 25 = full board.

select is(
  (
    with joint as (
      select
        (gpa.key_card ->> w.position) as a_label,
        (gpb.key_card ->> w.position) as b_label,
        count(*) as n
      from tinyspy.words w
      join tinyspy.game_players gpa
        on gpa.game_id = w.game_id and gpa.seat = 'A'
      join tinyspy.game_players gpb
        on gpb.game_id = w.game_id and gpb.seat = 'B'
      where w.game_id = (select id from created)
      group by 1, 2
    )
    -- Sort by explicit columns so the array order is deterministic.
    -- (`order by 1` inside array_agg parses as ORDER BY the constant
    -- integer 1, not as a SELECT-list position — so it's a no-op,
    -- leaving the rows in whatever order the GROUP BY produced.
    -- That happened to match the expected array before; explicit
    -- a_label/b_label ordering makes the test deterministic.)
    select array_agg(format('%s%s:%s', a_label, b_label, n)
                     order by a_label, b_label)
    from joint
  ),
  array[
    'AA:1','AG:1','AN:1',
    'GA:1','GG:3','GN:5',
    'NA:1','NG:5','NN:7'
  ],
  'create_game: joint key-card distribution matches the Duet rulebook'
);

select * from finish();
rollback;
