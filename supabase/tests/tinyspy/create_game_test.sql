-- ============================================================
-- Test: tinyspy.create_game(target_club, setup)
-- ============================================================
--
-- create_game is the one entry-point RPC for starting a tinyspy
-- game: it takes a target_club + a jsonb setup + player_user_ids,
-- validates them, seats both players (user_a_id/user_b_id
-- columns), picks the 25 words, generates the Duet key card,
-- sets status='active'. The common.games row created by
-- common.create_game gets is_active=true.
--
-- Coverage:
--   - rejection: not authenticated
--   - rejection: caller is not a member of the target club
--   - rejection: club has != 2 members
--   - rejection: setup.turns out of {9, 10, 11}
--   - rejection: setup.firstClueGiverUserId not a uuid
--   - rejection: setup.firstClueGiverUserId not in club
--   - happy path: returns one row, status='active', club_id
--     correct, both seats filled, 25 words inserted,
--     common.games row created with is_active=true
--   - setup is persisted on the row (game review can see the
--     original setup)
--   - turns_remaining initialized from setup.turns (a non-9
--     test value pins the link)
--   - first-clue-giver lands in seat A (ada when she's chosen,
--     bea when she's chosen — exercises both directions)
--   - key-card distribution matches the Duet rulebook
--
-- Doubles as the pgTAP primer for the rest of the test suite —
-- the as_user helper + begin/rollback structure are introduced
-- here. Tinyspy-specific helpers (find_position, tinyspy_setup)
-- live in setup.psql, included below.

begin;

set search_path = tinyspy, common, public, extensions;

select plan(30);

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
-- Rejection paths — auth + membership (setup valid in all)
-- ============================================================
-- These check the gates that fire BEFORE setup validation, so
-- they each pass a valid setup. The point is to confirm the
-- membership gate still works when the setup is fine — if a
-- caller can't reach setup validation, the setup never matters.

select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);

select throws_ok(
  format(
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_setup(), pg_temp.tinyspy_players()) $q$,
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
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_setup(), pg_temp.tinyspy_players()) $q$,
    (select id from club2)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member is rejected'
);

-- player_user_ids size mismatch: tinyspy needs exactly 2 players.
-- Even from a 3-member club, listing 3 players is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $q$ select tinyspy.create_game(%L::uuid, pg_temp.tinyspy_setup(),
        array['ada11111-1111-1111-1111-111111111111'::uuid,
              'bea22222-2222-2222-2222-222222222222'::uuid,
              'cade3333-3333-3333-3333-333333333333'::uuid]) $q$,
    (select id from club3)
  ),
  'P0001',
  'tinyspy requires exactly 2 players (got 3)',
  'create_game: wrong-size player_user_ids is rejected with the actual count'
);

-- ============================================================
-- Rejection paths — setup validation
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
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.turns must be 9, 10, or 11 (got 7)',
  'create_game: setup.turns outside {9,10,11} is rejected'
);

-- turns missing entirely
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111'
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.turns is required',
  'create_game: missing setup.turns is rejected with its own message'
);

-- firstClueGiverUserId missing entirely
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object('turns', 9),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.firstClueGiverUserId is required',
  'create_game: missing firstClueGiverUserId is rejected with its own message'
);

-- firstClueGiverUserId not a uuid
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'not-a-uuid'
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.firstClueGiverUserId must be a uuid',
  'create_game: malformed firstClueGiverUserId is rejected'
);

-- firstClueGiverUserId is a uuid, but it's dee — who isn't in
-- player_user_ids (dee is also not in club2, but the
-- "must be one of player_user_ids" check fires first under the
-- new validation order).
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      pg_temp.tinyspy_setup(9, 'dee44444-4444-4444-4444-444444444444'::uuid),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.firstClueGiverUserId must be one of player_user_ids',
  'create_game: firstClueGiverUserId not in player_user_ids is rejected'
);

-- ============================================================
-- Timer-shape validation (via common.validate_timer)
-- ============================================================
-- The shared validator's full case grid is exercised in
-- wordknit's create_game_test. Here we only spot-check that this
-- gametype's create_game actually wires the helper up — one
-- missing-timer, one bad-kind, one missing-seconds, one
-- countup-accepted. Point: "the call is hooked up," not "re-test
-- every branch of validate_timer."

-- missing timer
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111'
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.timer is required',
  'create_game: missing setup.timer is rejected'
);

-- bogus timer.kind
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'fast')
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.timer.kind must be none, countup, or countdown (got fast)',
  'create_game: bogus timer.kind is rejected'
);

-- countdown without seconds
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countdown')
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.timer.seconds is required for countdown',
  'create_game: countdown without seconds is rejected'
);

-- countdown with out-of-range seconds
select throws_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countdown', 'seconds', 0)
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 0)',
  'create_game: countdown with seconds=0 is rejected'
);

-- countup is accepted (no seconds needed)
select lives_ok(
  format(
    $q$ select tinyspy.create_game(
      %L::uuid,
      jsonb_build_object(
        'turns', 9,
        'firstClueGiverUserId', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countup')
      ),
      pg_temp.tinyspy_players()
    ) $q$,
    (select id from club2)
  ),
  'create_game: timer.kind=countup is accepted (no seconds needed)'
);

-- ============================================================
-- Happy path — ada chooses 11 turns, ada as first clue-giver
-- ============================================================

create temp table created on commit drop as
select * from tinyspy.create_game(
  (select id from club2),
  pg_temp.tinyspy_setup(11),  -- turns=11, first_user=ada (default)
  pg_temp.tinyspy_players()
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
  'create_game: turns_remaining is initialized from setup.turns'
);

-- The setup column captures the original intent — used by
-- end-of-game review to display "this game was played with 11
-- turns" without inferring from a now-decremented counter.
select is(
  (select setup->>'turns' from common.games where id = (select id from created)),
  '11',
  'create_game: setup column persists the starting turns value'
);
select is(
  (select setup->>'firstClueGiverUserId' from common.games where id = (select id from created)),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: setup column persists firstClueGiverUserId'
);

-- Both players are recorded in common.game_players (one row each).
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from created)),
  2,
  'create_game: both players are recorded in common.game_players'
);

-- Ada is the chosen first clue-giver → seat A column. Bea → seat B
-- column. (Seats are now columns on tinyspy.games, not a side table.)
select is(
  (select user_a_id from tinyspy.games where id = (select id from created)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'create_game: chosen first-clue-giver lands as user_a_id'
);

select is(
  (select user_b_id from tinyspy.games where id = (select id from created)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'create_game: the other player lands as user_b_id'
);

select is(
  (select count(*) from tinyspy.words where game_id = (select id from created)),
  25::bigint,
  'create_game: 25 words are inserted'
);

-- ============================================================
-- common.games: the new game has is_active=true for this club
-- ============================================================

select is(
  (select id from common.games
    where club_id = (select id from club2) and is_active = true),
  (select id from created),
  'create_game: this game is the club''s active common.games row'
);

select is(
  (select gametype from common.games
    where club_id = (select id from club2) and is_active = true),
  'tinyspy',
  'create_game: active common.games row has gametype = tinyspy'
);

-- Title shape: "<seatA-username>-v-<seatB-username>: 4 words".
-- Words are randomly drawn from a 390-word pool so we can't
-- pin the exact words; assert the prefix (which is deterministic
-- — ada is first-clue-giver, bea is the other) and the comma count.
select is(
  (select substring(title from 1 for 11)
     from common.games where id = (select id from created)),
  'ada-v-bea: ',
  'create_game: title starts with "<seatA>-v-<seatB>: "'
);
select is(
  (select length(title) - length(replace(title, ', ', ''))
     from common.games where id = (select id from created)),
  6,  -- 3 commas × 2 chars each = 6 (between 4 words)
  'create_game: title body has 4 comma-separated words'
);

-- ============================================================
-- Happy path #2: ada calls but picks bea as first clue-giver
-- ============================================================
-- Verifies the seating actually depends on setup — not on
-- "caller always gets A." With bea as the chosen first
-- clue-giver, bea lands in A and ada (the caller) lands in B.

create temp table created2 on commit drop as
select * from tinyspy.create_game(
  (select id from club2),
  pg_temp.tinyspy_setup(9, 'bea22222-2222-2222-2222-222222222222'::uuid),
  pg_temp.tinyspy_players()
);

select is(
  (select user_a_id from tinyspy.games
    where id = (select id from created2)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'create_game: bea is seated as A when chosen as first clue-giver'
);

select is(
  (select user_b_id from tinyspy.games where id = (select id from created2)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
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
        (g.key_card_a ->> w.position) as a_label,
        (g.key_card_b ->> w.position) as b_label,
        count(*) as n
      from tinyspy.words w
      join tinyspy.games g on g.id = w.game_id
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
