-- ============================================================
-- Test: tinyspy.create_game(target_club, config)
-- ============================================================
--
-- create_game is the one entry-point RPC for starting a tinyspy
-- game: it takes a target_club + a jsonb config, validates
-- both, seats both members, picks the 25 words, generates the
-- Duet key card, sets status='active', and upserts
-- common.club_active_game.
--
-- Coverage:
--   - rejection: not authenticated
--   - rejection: caller is not a member of the target club
--   - rejection: club has != 2 members
--   - rejection: config.turns out of {9, 10, 11}
--   - rejection: config.firstClueGiverUserId not a uuid
--   - rejection: config.firstClueGiverUserId not in club
--   - happy path: returns one row, status='active', club_id
--     correct, both seats filled, 25 words inserted,
--     club_active_game upserted
--   - config is persisted on the row (game review can see the
--     original setup)
--   - turns_remaining initialized from config.turns (a non-9
--     test value pins the link)
--   - first-clue-giver lands in seat A (ada when she's chosen,
--     bea when she's chosen — exercises both directions)
--   - key-card distribution matches the Duet rulebook
--
-- Doubles as the pgTAP primer for the rest of the test suite —
-- the as_user helper + begin/rollback structure are introduced
-- here. Tinyspy-specific helpers (find_position, tinyspy_cfg)
-- live in setup.psql, included below.

begin;

set search_path = tinyspy, common, public, extensions;

select plan(21);

-- Cast: ada + bea form the 2-member club used for the happy
-- path. cade is the in-club third member for the wrong-size
-- (3-member) rejection. dee is the non-member outsider.

\ir ../_shared/setup.psql
\ir setup.psql

-- ada creates a 2-member club (ada+bea) and a 3-member club
-- (ada+bea+cade). The 3-member one exercises the wrong-size
-- rejection.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table club2 on commit drop as
select * from common.create_club('Ada and Bea', array['ada','bea']);

create temp table club3 on commit drop as
select * from common.create_club('Trio', array['ada','bea','cade']);

-- ============================================================
-- Rejection paths — auth + membership (config valid in all)
-- ============================================================
-- These check the gates that fire BEFORE config validation, so
-- they each pass a valid config. The point is to confirm the
-- membership gate still works when the config is fine — if a
-- caller can't reach config validation, the config never matters.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format(
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_cfg()) $q$,
    (select id from club2)
  ),
  '42501',
  'must be authenticated',
  'create_game: not authenticated raises 42501'
);

-- cade is signed in but not a member of club2 (ada+bea only).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');

select throws_ok(
  format(
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_cfg()) $q$,
    (select id from club2)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member is rejected'
);

-- ada in the 3-member club: rejected on size before config is
-- even looked at.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_cfg()) $q$,
    (select id from club3)
  ),
  'P0001',
  'tinyspy requires a 2-member club (this club has 3)',
  'create_game: wrong-size club is rejected with the actual member count'
);

-- ============================================================
-- Rejection paths — config validation
-- ============================================================
-- These fire after auth + membership pass. Use club2 (ada+bea)
-- as ada throughout.

-- turns out of range
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 7,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111'
      )
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'config.turns must be 9, 10, or 11 (got 7)',
  'create_game: config.turns outside {9,10,11} is rejected'
);

-- firstClueGiverUserId not a uuid
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'not-a-uuid'
      )
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'config.firstClueGiverUserId must be a uuid',
  'create_game: malformed firstClueGiverUserId is rejected'
);

-- firstClueGiverUserId is a uuid, but it's dee — who isn't in club2.
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      pg_temp.tinyspy_cfg(9, 'dee44444-4444-4444-4444-444444444444'::uuid)
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'config.firstClueGiverUserId must be a club member',
  'create_game: firstClueGiverUserId not in the club is rejected'
);

-- ============================================================
-- Happy path — ada chooses 11 turns, ada as first clue-giver
-- ============================================================

create temp table created on commit drop as
select * from tinyspy.create_game(
  (select id from club2),
  pg_temp.tinyspy_cfg(11)  -- turns=11, first_user=ada (default)
);

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
  (select turns_remaining from tinyspy.games where id = (select id from created)),
  11,
  'create_game: turns_remaining is initialized from config.turns'
);

-- The config column captures the original intent — used by
-- end-of-game review to display "this game was played with 11
-- turns" without inferring from a now-decremented counter.
select is(
  (select config->>'turns' from tinyspy.games where id = (select id from created)),
  '11',
  'create_game: config column persists the starting turns value'
);
select is(
  (select config->>'firstClueGiverUserId' from tinyspy.games where id = (select id from created)),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: config column persists firstClueGiverUserId'
);

select is(
  (select count(*) from tinyspy.game_players where game_id = (select id from created)),
  2::bigint,
  'create_game: both club members are seated'
);

-- Ada is the chosen first clue-giver → seat A. Bea → seat B.
select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created) and seat = 'A'),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: chosen first-clue-giver lands in seat A'
);

select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created) and seat = 'B'),
  'bea22222-2222-2222-2222-222222222222',
  'create_game: the other player gets seat B'
);

select is(
  (select count(*) from tinyspy.words where game_id = (select id from created)),
  25::bigint,
  'create_game: 25 words are inserted'
);

-- ============================================================
-- club_active_game: the new game is the club's active game
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
-- Happy path #2: ada calls but picks bea as first clue-giver
-- ============================================================
-- Verifies the seating actually depends on config — not on
-- "caller always gets A." With bea as the chosen first
-- clue-giver, bea lands in A and ada (the caller) lands in B.

create temp table created2 on commit drop as
select * from tinyspy.create_game(
  (select id from club2),
  pg_temp.tinyspy_cfg(9, 'bea22222-2222-2222-2222-222222222222'::uuid)
);

select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created2) and seat = 'A'),
  'bea22222-2222-2222-2222-222222222222',
  'create_game: bea is seated as A when chosen as first clue-giver'
);

select is(
  (select user_id from tinyspy.game_players
    where game_id = (select id from created2) and seat = 'B'),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: ada is seated as B when bea is chosen as first clue-giver'
);

-- ============================================================
-- Key-card distribution (against the first created game)
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
    -- integer 1 — a no-op. Explicit columns are the only reliable form.)
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
