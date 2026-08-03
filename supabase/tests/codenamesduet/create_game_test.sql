-- ============================================================
-- Test: codenamesduet.create_game(target_club, setup)
-- ============================================================
--
-- create_game is the one entry-point RPC for starting a codenamesduet
-- game: it takes a target_club + a jsonb setup + player_user_ids,
-- validates them, seats both players (user_a_id/user_b_id
-- columns), picks the 25 words, generates the Duet key card,
-- sets play_state='playing'. The common.games row created by
-- common.create_game gets is_current_view=true.
--
-- Coverage:
--   - rejection: not authenticated
--   - rejection: caller is not a member of the target club
--   - rejection: club has != 2 members
--   - rejection: setup.turns out of {9, 10, 11}
--   - rejection: setup.first_clue_giver_user_id not a uuid
--   - rejection: setup.first_clue_giver_user_id not in club
--   - happy path: returns one row, play_state='playing', club_handle
--     correct, both seats filled, 25 words inserted,
--     common.games row created with is_current_view=true
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
-- here. codenamesduet-specific helpers (find_position, codenamesduet_setup)
-- live in setup.psql, included below.

begin;

set search_path = codenamesduet, common, public, extensions;

select plan(35);

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
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

create temp table club3 on commit drop as
select common.create_club('Trio', array['ada','bea','cade']) as handle;

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
    $q$ select codenamesduet.create_game(%L, pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players()) $q$,
    (select handle from club2)
  ),
  '42501',
  'must be authenticated',
  'create_game: not authenticated raises 42501'
);

-- cade is signed in but not a member of club2 (ada+bea only).
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');

select throws_ok(
  format(
    $q$ select codenamesduet.create_game(%L, pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players()) $q$,
    (select handle from club2)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member is rejected'
);

-- player_user_ids size mismatch: codenamesduet needs exactly 2 players.
-- Even from a 3-member club, listing 3 players is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select throws_ok(
  format(
    $q$ select codenamesduet.create_game(%L, pg_temp.codenamesduet_setup(),
        array['ada11111-1111-1111-1111-111111111111'::uuid,
              'bea22222-2222-2222-2222-222222222222'::uuid,
              'cade3333-3333-3333-3333-333333333333'::uuid]) $q$,
    (select handle from club3)
  ),
  'P0001',
  'codenamesduet requires exactly 2 players (got 3)',
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
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 7,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111'
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.turns must be 9, 10, or 11 (got 7)',
  'create_game: setup.turns outside {9,10,11} is rejected'
);

-- turns missing entirely
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111'
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.turns is required',
  'create_game: missing setup.turns is rejected with its own message'
);

-- first_clue_giver_user_id missing entirely
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object('turns', 9),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.first_clue_giver_user_id is required',
  'create_game: missing first_clue_giver_user_id is rejected with its own message'
);

-- first_clue_giver_user_id not a uuid
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'not-a-uuid'
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.first_clue_giver_user_id must be a uuid',
  'create_game: malformed first_clue_giver_user_id is rejected'
);

-- first_clue_giver_user_id is a uuid, but it's dee — who isn't in
-- player_user_ids (dee is also not in club2, but the
-- "must be one of player_user_ids" check fires first under the
-- new validation order).
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      pg_temp.codenamesduet_setup(9, 'dee44444-4444-4444-4444-444444444444'::uuid),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.first_clue_giver_user_id must be one of player_user_ids',
  'create_game: first_clue_giver_user_id not in player_user_ids is rejected'
);

-- ============================================================
-- Timer-shape validation (via common.require_valid_timer)
-- ============================================================
-- The shared validator's full case grid is exercised in
-- connections's create_game_test. Here we only spot-check that this
-- gametype's create_game actually wires the helper up — one
-- missing-timer, one bad-kind, one missing-seconds, one
-- countup-accepted. Point: "the call is hooked up," not "re-test
-- every branch of require_valid_timer."

-- missing timer
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111'
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.timer is required',
  'create_game: missing setup.timer is rejected'
);

-- bogus timer.kind
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'fast')
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.timer.kind must be none, countup, or countdown (got fast)',
  'create_game: bogus timer.kind is rejected'
);

-- countdown without seconds
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countdown')
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.timer.seconds is required for countdown',
  'create_game: countdown without seconds is rejected'
);

-- countdown with out-of-range seconds
select throws_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countdown', 'seconds', 0)
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'P0001',
  'setup.timer.seconds must be 1..3600 (got 0)',
  'create_game: countdown with seconds=0 is rejected'
);

-- countup is accepted (no seconds needed)
select lives_ok(
  format(
    $q$ select codenamesduet.create_game(
      %L,
      jsonb_build_object(
        'turns', 9,
        'first_clue_giver_user_id', 'ada11111-1111-1111-1111-111111111111',
        'timer', jsonb_build_object('kind', 'countup')
      ),
      pg_temp.codenamesduet_players()
    ) $q$,
    (select handle from club2)
  ),
  'create_game: timer.kind=countup is accepted (no seconds needed)'
);

-- ============================================================
-- Happy path — ada chooses 11 turns, ada as first clue-giver
-- ============================================================

create temp table created on commit drop as
select * from codenamesduet.create_game(
  (select handle from club2),
  pg_temp.codenamesduet_setup(11),  -- turns=11, first_user=ada (default)
  pg_temp.codenamesduet_players()
);

select is(
  (select count(*) from created),
  1::bigint,
  'create_game: returns exactly one (id) row'
);

select is(
  (select play_state from common.games where id = (select id from created)),
  'playing',
  'create_game: new game starts in playing status (no lobby)'
);

select is(
  (select club_handle from codenamesduet.games where id = (select id from created)),
  (select handle from club2),
  'create_game: game is linked to the target club'
);

select is(
  (select turns_remaining from codenamesduet.games where id = (select id from created)),
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
  (select setup->>'first_clue_giver_user_id' from common.games where id = (select id from created)),
  'ada11111-1111-1111-1111-111111111111',
  'create_game: setup column persists first_clue_giver_user_id'
);

-- Both players are recorded in common.game_players (one row each).
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from created)),
  2,
  'create_game: both players are recorded in common.game_players'
);

-- Exact roster check — the game_players rows hold {ada, bea}
-- and only {ada, bea}. The count==2 assertion above catches a
-- missing or extra row; this assertion catches the subtler
-- failure of "two rows but wrong user_ids" (e.g. ada inserted
-- twice, or caller-id swapped in for one of the players). The
-- PK (game_id, user_id) makes duplicates impossible at the DB
-- layer, so a wrong-user_ids regression is the realistic risk.
select results_eq(
  format(
    $$ select user_id from common.game_players
        where game_id = %L::uuid order by user_id $$,
    (select id from created)
  ),
  $$ values
      ('ada11111-1111-1111-1111-111111111111'::uuid),
      ('bea22222-2222-2222-2222-222222222222'::uuid) $$,
  'create_game: common.game_players holds exactly ada + bea'
);

-- Ada is the chosen first clue-giver → seat A column. Bea → seat B
-- column. (Seats are now columns on codenamesduet.games, not a side table.)
select is(
  (select user_a_id from codenamesduet.games where id = (select id from created)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'create_game: chosen first-clue-giver lands as user_a_id'
);

select is(
  (select user_b_id from codenamesduet.games where id = (select id from created)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'create_game: the other player lands as user_b_id'
);

select is(
  (select count(*) from codenamesduet.words where game_id = (select id from created)),
  25::bigint,
  'create_game: 25 words are inserted'
);

-- ============================================================
-- common.games: the new game has is_current_view=true for this club
-- ============================================================

select is(
  (select id from common.games
    where club_handle = (select handle from club2) and is_current_view = true),
  (select id from created),
  'create_game: this game is the club''s current-view common.games row'
);

select is(
  (select gametype from common.games
    where club_handle = (select handle from club2) and is_current_view = true),
  'codenamesduet',
  'create_game: current-view common.games row has gametype = codenamesduet'
);

-- Title shape: "WORD1-WORD2-WORD3" — the first three words IN BOARD ORDER
-- (positions 0/1/2), i.e. the top-left three cells as everyone sees them.
-- Board order, not alphabetical (2026-08-02): a duet board is never shuffled or
-- rotated, so the first three cells are a stable handle you can match by
-- glancing at the grid. Words are randomly drawn from a 390-word pool so we
-- can't pin the exact words; assert the shape and that they're positions 0-2.
-- Three parts, two dashes, all uppercase. NOT `^[A-Z]+-[A-Z]+-[A-Z]+$`: the
-- pool holds multi-word entries ("BIG BANG", "ST.PATRICK"), so a per-part
-- letters-only pattern fails on whichever draw happens to include one.
select ok(
  (select title = upper(title)
      and length(title) - length(replace(title, '-', '')) = 2
     from common.games where id = (select id from created)),
  'create_game: title is three dash-joined uppercase words'
);
select ok(
  (select title = (
     select string_agg(w, '-' order by pos)
       from (select word as w, position as pos from codenamesduet.words
              where game_id = created.id
              order by position limit 3) first3)
     from common.games, created where common.games.id = created.id),
  'create_game: the title words are the board''s first three IN BOARD ORDER'
);

-- …and that's a real distinction, not a coincidence of the draw: a title built
-- from the alphabetical first-three would differ whenever positions 0-2 aren't
-- already sorted, which is almost always. Skip the assert on the rare draw
-- where they happen to coincide.
select ok(
  (select title <> (
     select string_agg(w, '-' order by w)
       from (select word as w from codenamesduet.words
              where game_id = created.id
              order by word limit 3) alpha)
     or (select array_agg(word order by position) = array_agg(word order by word)
           from (select word, position from codenamesduet.words
                  where game_id = created.id order by position limit 3) t)
     from common.games, created where common.games.id = created.id),
  'create_game: board order is distinguishable from alphabetical order'
);

-- ============================================================
-- Happy path #2: ada calls but picks bea as first clue-giver
-- ============================================================
-- Verifies the seating actually depends on setup — not on
-- "caller always gets A." With bea as the chosen first
-- clue-giver, bea lands in A and ada (the caller) lands in B.

create temp table created2 on commit drop as
select * from codenamesduet.create_game(
  (select handle from club2),
  pg_temp.codenamesduet_setup(9, 'bea22222-2222-2222-2222-222222222222'::uuid),
  pg_temp.codenamesduet_players()
);

select is(
  (select user_a_id from codenamesduet.games
    where id = (select id from created2)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'create_game: bea is seated as A when chosen as first clue-giver'
);

select is(
  (select user_b_id from codenamesduet.games where id = (select id from created2)),
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
      from codenamesduet.words w
      join codenamesduet.games g on g.id = w.game_id
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

-- ============================================================
-- Saved-defaults auto-save in clubs_gametypes
-- ============================================================
-- codenamesduet saves a SUBSET of setup: {turns, timer} — strips
-- first_clue_giver_user_id, which is a per-game decision (who opens
-- this round), not a per-club preference. Verify both: the
-- savable fields round-trip, and first_clue_giver_user_id is absent
-- from the saved blob (so the dialog's auto-pick logic fills
-- the gap on next open instead of inheriting a stale uid).
--
-- The most-recent successful create on club2 was `created2`,
-- which used turns=9 + bea as first clue-giver (and the
-- default timer.kind=none from codenamesduet_setup).

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select (default_setup->>'turns')::int from common.clubs_gametypes
    where club_handle = (select handle from club2) and gametype = 'codenamesduet'),
  9,
  'saved defaults: codenamesduet saves turns'
);

select is(
  (select default_setup->'timer'->>'kind' from common.clubs_gametypes
    where club_handle = (select handle from club2) and gametype = 'codenamesduet'),
  'none',
  'saved defaults: codenamesduet saves timer'
);

select is(
  (select default_setup ? 'first_clue_giver_user_id' from common.clubs_gametypes
    where club_handle = (select handle from club2) and gametype = 'codenamesduet'),
  false,
  'saved defaults: codenamesduet STRIPS first_clue_giver_user_id (per-game decision, not a per-club preference)'
);

select * from finish();
rollback;
