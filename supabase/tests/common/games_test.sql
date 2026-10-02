-- cs-unmet

-- ============================================================
-- Test: common.games + common.game_players + the 3 new helpers
-- ============================================================
--
-- Covers Phase 1 of the common.games architectural shift:
--
--   - common.games: RLS (club members see all club games), base
--     shape
--   - common.game_players: RLS via parent games, base shape
--   - common._create_game: caller membership, player-uid
--     membership, both rows landed
--   - common._require_game_player: auth + game-player gate
--   - common._end_game: ended_at, the reason pair, who ended it, the
--     game's outcome, and each player's final_ranking + outcome;
--     is_current_view left alone
--   - updated_at stamped by trigger on every update; status_changed_at
--     left alone by the current-view pointer
--
-- Per-game tests (codenamesduet/psychicnum/connections) exercise these
-- helpers indirectly through their own create_game RPCs; this
-- file pins the contract directly.
--
-- "Which game is the current view for this club" is now derived
-- from common.games.is_current_view (with a partial unique index
-- enforcing one-current-view-per-club). The separate
-- club_active_game pointer table is gone.
--
-- See ../codenamesduet/create_game_test.sql for the pgTAP / personas
-- primer, and helpers_test.sql for the "as_jwt_only" trick we
-- reuse here to call security-revoked helpers as postgres while
-- still simulating an authenticated caller's auth.uid().

begin;

set search_path = common, public, extensions;

select plan(50);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Set JWT claims (so auth.uid() returns a real uuid) WITHOUT
-- switching role away from postgres — keeps execute privilege on
-- the security-revoked helpers.
create function pg_temp.as_jwt_only(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', uid::text, 'role', 'authenticated')::text,
                     true);
end;
$$;

-- ============================================================
-- Set up a club
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- common._create_game — happy path
-- ============================================================
-- Caller is ada; players are [ada, bea]; gametype 'connections_coop'.
-- The new game_id goes into session-config so we can read it
-- back across role switches (temp tables are role-bound).

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');

-- Pass saved_default=NULL on this happy-path call — the
-- clubs_gametypes.default_setup auto-save is exercised in a
-- dedicated block further down (it doesn't matter for the
-- assertions in *this* section).
select set_config(
  'test.created_game_id',
  (common._create_game(
    (select handle from club),
    'connections_coop',
    'coop',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);

select isnt(
  current_setting('test.created_game_id')::uuid,
  null,
  'create_game: returns a non-null uuid'
);

select is(
  (select gametype from common.games where id = current_setting('test.created_game_id')::uuid),
  'connections_coop',
  'create_game: common.games row has the right gametype'
);

select is(
  (select club_handle from common.games where id = current_setting('test.created_game_id')::uuid),
  (select handle from club),
  'create_game: common.games row has the right club_handle'
);

select is(
  (select created_by from common.games where id = current_setting('test.created_game_id')::uuid),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'create_game: records the caller as created_by (drives the join-invite "X added you")'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'create_game: 2 game_players rows landed (one per uid in player_user_ids)'
);

-- ============================================================
-- common._create_game — rejects on caller not a club member
-- ============================================================
-- Dee tries to start a game in ada+bea's club.

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common._create_game(%L, 'connections_coop', 'coop',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid],
       'test-title', '{"timer": {"kind": "none"}}'::jsonb, null) $$,
    (select handle from club)
  ),
  'PN012',
  'You are not a member of this club',
  'create_game: non-member caller is rejected (via _require_club_member)'
);

-- ============================================================
-- common._create_game — rejects on empty player_user_ids
-- ============================================================

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select common._create_game(%L, 'connections_coop', 'coop', array[]::uuid[], 'test-title', '{"timer": {"kind": "none"}}'::jsonb, null) $$,
    (select handle from club)
  ),
  'PN059',
  'BUG: game with no players',
  'create_game: empty player_user_ids is rejected'
);

-- ============================================================
-- common._create_game — rejects when the caller is not a player
-- ============================================================
-- ada starts a game for bea alone. Nobody starts a game they are not in: only
-- a player can open its page, and the setup form locks the creator's row on.

select throws_ok(
  format(
    $$ select common._create_game(%L, 'connections_coop', 'coop',
       array['bea22222-2222-2222-2222-222222222222'::uuid],
       'test-title', '{"timer": {"kind": "none"}}'::jsonb, null) $$,
    (select handle from club)
  ),
  'PN510',
  'BUG: caller not among the players',
  'create_game: a player list without the caller is rejected'
);

-- ============================================================
-- common._create_game — rejects when a listed uid isn't a club member
-- ============================================================
-- ada lists dee (an outsider) as a player.

select throws_ok(
  format(
    $$ select common._create_game(%L, 'connections_coop', 'coop',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'dee44444-4444-4444-4444-444444444444'::uuid],
       'test-title', '{"timer": {"kind": "none"}}'::jsonb, null) $$,
    (select handle from club)
  ),
  'PN060',
  'BUG: player not in this club: dee44444-4444-4444-4444-444444444444',
  'create_game: rejects when a listed uid isn''t in clubs_members'
);

-- ============================================================
-- common.games / game_players RLS
-- ============================================================
-- ada (member) sees the game; dee (outsider) doesn't. game_players
-- visibility inherits from the parent game via the EXISTS
-- subquery in the policy.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  1,
  'games RLS: club member sees the game they created'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'game_players RLS: club member sees the player rows'
);

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  0,
  'games RLS: outsider sees zero rows'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  0,
  'game_players RLS: outsider sees zero rows'
);

-- ============================================================
-- common._require_game_player
-- ============================================================

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  format(
    $$ select common._require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  'PN252',
  'Signed out; try refresh',
  '_require_game_player: null auth.uid() raises 42501'
);

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common._require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  'PN253',
  'You are not in this game',
  '_require_game_player: outsider raises 42501'
);

select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select is(
  (select common._require_game_player(current_setting('test.created_game_id')::uuid)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  '_require_game_player: in-game player gets back their caller_id'
);

-- ============================================================
-- common._end_game
-- ============================================================
-- Precondition: common._create_game left this row in is_current_view=true
-- (the create_game RPC's transition). end_game writes the ending and
-- each player's result; is_current_view stays true until the FE
-- explicitly closes the post-game review. So this test pins what
-- end_game *does* write.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'precondition: game starts is_current_view=true after create_game'
);

-- Now end the game: a reason, the game's own word for it, who ended it, and
-- the rankings (ada 1, bea 2). The detail string is DELIBERATELY fake:
-- common._end_game doesn't validate the game's own word (each gametype owns
-- its own), and a real one here would read as if it did. The two outcomes
-- are end_game's to decide from the rankings.
select common._end_game(
  current_setting('test.created_game_id')::uuid,
  'reached_goal',
  'test_detail',
  'ada11111-1111-1111-1111-111111111111',
  p_is_no_result => false,
  p_final_rankings => format(
    '{"%s": 1, "%s": 2}',
    'ada11111-1111-1111-1111-111111111111',
    'bea22222-2222-2222-2222-222222222222'
  )::jsonb
);

select isnt(
  (select ended_at from common.games
    where id = current_setting('test.created_game_id')::uuid),
  null,
  'end_game: ended_at is set'
);

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'reached_goal/test_detail',
  'end_game: the reason and the game''s own word persisted'
);

select is(
  (select game_ended_outcome from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'won',
  'end_game: someone ranked 1 makes the game won'
);

select is(
  (select game_ended_by_user_id from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'end_game: who ended it persisted'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '1/won',
  'end_game: ada, ranked 1, won'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '2/near',
  'end_game: bea, ranked 2, near'
);

-- ============================================================
-- common._end_game — unknown game
-- ============================================================

select throws_ok(
  $$ select common._end_game('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
                            'stopped', 'stopped', null, false, '{}'::jsonb) $$,
  'P0002',
  'game-not-found|',
  'end_game: unknown game raises P0002'
);

-- ============================================================
-- common.set_current_view / common.unset_current_view
-- ============================================================
-- Mount-time and last-leaver-time view-state writes. Pinned
-- together here because they're the matching halves of one
-- contract; the integration with FE presence lives in
-- useCommonGame. See docs/states.md → "Lifecycle: when
-- is_current_view flips".
--
-- The game from the create_game block above has ended now
-- (end_game ran). is_current_view stays true (end_game leaves
-- it alone). Start a second game in the same club to exercise
-- the "vacate prior current" behavior.

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.second_game_id',
  (common._create_game(
    (select handle from club),
    'connections_coop',
    'coop',
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'second',
    '{"timer": {"kind": "none"}}'::jsonb,
    null
  ))::text,
  true
);

reset role;
select set_config('request.jwt.claims', '', true);

-- create_game auto-vacated the first game's current-view flag
-- as part of its insert path. The new game is now current.
select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  false,
  'precondition: create_game auto-vacated the first game'
);
select is(
  (select is_current_view from common.games
    where id = current_setting('test.second_game_id')::uuid),
  true,
  'precondition: the second game is the current view'
);

-- set_current_view back on the first game flips it to current
-- and vacates the second (the partial unique index would
-- reject otherwise).
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common.set_current_view(current_setting('test.created_game_id')::uuid);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'set_current_view: target game becomes the current view'
);
select is(
  (select is_current_view from common.games
    where id = current_setting('test.second_game_id')::uuid),
  false,
  'set_current_view: the prior current-view game is vacated'
);

-- Re-mount idempotency: set_current_view on the already-current
-- game is a no-op. The index would reject a true→true rewrite if
-- we did it naively; the WHERE clause `and is_current_view = false`
-- in set_current_view's body is what keeps it a no-op.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_current_view(current_setting('test.created_game_id')::uuid),
  '{"type": "ok", "data": {"result": "set"}}'::jsonb,
  'set_current_view: re-mount on the already-current game answers ok/set'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'set_current_view: re-mount left current-view = true'
);

-- unset_current_view clears the target's flag. Idempotent on
-- the `is_current_view = true` guard.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.unset_current_view(current_setting('test.created_game_id')::uuid),
  '{"type": "ok", "data": {"result": "cleared"}}'::jsonb,
  'unset_current_view: clearing a real pointer answers ok/cleared'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  false,
  'unset_current_view: target is no longer current'
);

-- Non-member rejected on both helpers.
select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  common.set_current_view(current_setting('test.second_game_id')::uuid),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN012",
    "message": "You are not a member of this club"}'::jsonb,
  'set_current_view: a non-member gets a declared fault'
);
select pg_temp.envelope_is(
  common.unset_current_view(current_setting('test.second_game_id')::uuid),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN012",
    "message": "You are not a member of this club"}'::jsonb,
  'unset_current_view: a non-member gets a declared fault'
);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
-- Both halves answer a deleted game as an `ok`, and for the same reason:
-- nothing here is anybody's action. Both fire from housekeeping — this one on
-- the channel's SUBSCRIBED ack, including every reconnect — so a player whose
-- network blinks an hour after someone deleted the game reaches it without any
-- bug being involved.
--
-- The JOBS are not symmetrical, which is the interesting part. Unset's ("leave
-- no pointer on that game") is trivially satisfied by a deleted game; set's
-- ("make that game the club's current view") is unachievable. Still `ok`: an
-- unachievable job is not a failure when the thing it was for is gone.
select pg_temp.envelope_is(
  common.set_current_view('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  '{"type": "ok", "outcome": "noted", "dbcode": "PA003",
    "message": "That game is gone"}'::jsonb,
  'set_current_view: a deleted game is ok/noted, not a fault'
);

select pg_temp.envelope_is(
  common.unset_current_view('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  '{"type": "ok", "outcome": "noted", "dbcode": "PA001",
    "message": "That game is gone"}'::jsonb,
  'unset_current_view: a deleted game is ok/noted, not a fault'
);

-- Restore the precondition for the partial-unique-index test
-- below: created_game must be the current view again (the unset
-- test above cleared it). set_current_view's vacate-first step
-- guarantees it's the ONLY current row for the club.
--
-- (There is no idle-accounting block any more: the timer is an
-- additive tick count in common.timers, advanced only during
-- active play, so "nobody viewing" simply doesn't tick — no
-- idle_since / total_idle_seconds to fold. See tick_timer_test.sql
-- for the clock's contract.)
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common.set_current_view(current_setting('test.created_game_id')::uuid);

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- Partial unique index: one current-view game per club, enforced
-- at the storage layer (not just by the RPC's vacate-first step)
-- ============================================================
-- The set_current_view RPC vacates any prior current-view game
-- *before* setting the target current, so the RPC itself never
-- trips the index. But the index is the DB-level invariant that
-- makes the FE's "auto-nav into the current game" semantics
-- coherent: if two backends raced and both tried to set a
-- different game current for the same club, the partial unique
-- index (`unique (club_handle) where is_current_view`) would reject
-- the second write with a unique_violation.
--
-- Test the index directly by bypassing the RPC: as postgres,
-- try to flip a second game's is_current_view to true while one
-- is already current. The expectation is a unique violation —
-- the DB-side check that the RPC's vacate-first step relies on.
--
-- Precondition coming out of the idle-accounting block above:
-- created_game_id is the current view; second_game_id is not.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'precondition: first game is the current view'
);

select throws_ok(
  format(
    $$ update common.games set is_current_view = true where id = %L::uuid $$,
    current_setting('test.second_game_id')::uuid
  ),
  '23505',
  null,
  'partial unique index: a second is_current_view=true for the same club is rejected (23505)'
);

-- ============================================================
-- Saved-defaults auto-save: clubs_gametypes.default_setup
-- ============================================================
-- common._create_game's `saved_default` parameter overwrites the
-- (club, gametype) row in clubs_gametypes on every successful
-- call. The contract: non-NULL writes; NULL skips (the gametype
-- opted out for this call). The intent is "next time the setup
-- dialog opens, it pre-fills from this row."
--
-- Up to this point the test has been passing default_setup=NULL
-- everywhere, so the m2m row's default_setup is still NULL
-- (its post-create_club state). Verify that first, then make a
-- non-null call and verify the write.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'connections_coop'),
  null,
  'saved defaults: starts NULL (handle_new_user / create_club leave it unset)'
);

-- Issue a third create_game with a non-null default_setup. This
-- exercises the auto-save path. The shape is intentionally
-- different from a real connections setup to make the test self-
-- evident: we're checking the plumbing, not the semantic.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common._create_game(
  (select handle from club),
  'connections_coop',
  'coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'third',
  '{"timer": {"kind": "none"}, "puzzle_id": "marker-1"}'::jsonb,
  '{"timer": {"kind": "none"}, "puzzle_id": "marker-1"}'::jsonb
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup->>'puzzle_id' from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'connections_coop'),
  'marker-1',
  'saved defaults: a non-null default_setup writes to clubs_gametypes.default_setup'
);

-- Overwrite-on-each-call: a second call with a different
-- default_setup replaces the row. There's no "first write wins"
-- or "must equal previous" semantics — the FE owns the policy
-- of when to call create_game; the DB just records the latest.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common._create_game(
  (select handle from club),
  'connections_coop',
  'coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'fourth',
  '{"timer": {"kind": "none"}, "puzzle_id": "marker-2"}'::jsonb,
  '{"timer": {"kind": "none"}, "puzzle_id": "marker-2"}'::jsonb
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup->>'puzzle_id' from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'connections_coop'),
  'marker-2',
  'saved defaults: a subsequent non-null default_setup overwrites the row'
);

-- ============================================================
-- common.delete_game — happy path + cascade verification
-- ============================================================
-- The RPC permanently removes a game and lets the FK chain
-- handle cleanup (game_players via the cascading FK on game_id;
-- per-gametype rows via id-FK chains). Pin both the row removal
-- and the cascade.
--
-- The created_game_id row from the earlier block is still in
-- common.games at this point (we only ended + flipped its view
-- state — never deleted it). Use it as the target.

-- Precondition: game exists and has 2 game_players rows.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  1,
  'precondition: target game exists in common.games before delete'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'precondition: target game has 2 game_players rows before delete'
);

-- Delete as ada (club member).
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.delete_game(current_setting('test.created_game_id')::uuid),
  '{"type": "ok", "data": {"result": "deleted"}}'::jsonb,
  'delete_game: a member deleting a real game answers ok/deleted'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from common.games
    where id = current_setting('test.created_game_id')::uuid),
  0,
  'delete_game: removed the common.games row'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  0,
  'delete_game: cascaded to common.game_players (FK on delete cascade)'
);

-- ============================================================
-- delete_game — authorization + bad input
-- ============================================================
-- Non-member rejected (RLS-equivalent gate via _require_club_member);
-- an unknown game comes back as a not-ok/error envelope.
--
-- The non-member case still THROWS, and deliberately so: 42501 comes
-- from common._require_club_member, a shared helper with no handler of its
-- own (docs/envelopes.md → How SQL builds one), so
-- it fails delete_game's ownership test and is re-raised untouched.

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  common.delete_game(current_setting('test.second_game_id')::uuid),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN012",
    "message": "You are not a member of this club"}'::jsonb,
  'delete_game: a non-member gets a declared fault'
);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.delete_game('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  '{"type": "not-ok", "severity": "race", "dbcode": "PN010", "outcome": "lost",
    "message": "That game was already deleted"}'::jsonb,
  'delete_game: an already-gone game is a race that reads as lost'
);

-- ============================================================
-- games_stamp_updated_at trigger: every UPDATE stamps now()
-- ============================================================
-- updated_at is maintained by a BEFORE UPDATE trigger, not by hand —
-- so no write can forget it. Prove it the blunt way: write an ancient
-- timestamp directly and watch the trigger override it to now(). (now()
-- is the transaction clock — "this test run" — which is comfortably
-- after 2020.) That the column comes back recent, despite the UPDATE
-- explicitly setting it to 2000, is the whole guarantee: the trigger
-- fires on the row write regardless of what was set.
--
-- second_game_id is still live here (only created_game_id was deleted).
reset role;
select set_config('request.jwt.claims', '', true);

update common.games
   set updated_at = '2000-01-01T00:00:00Z'
 where id = current_setting('test.second_game_id')::uuid;

select ok(
  (select updated_at from common.games
     where id = current_setting('test.second_game_id')::uuid)
    > '2020-01-01T00:00:00Z'::timestamptz,
  'games_stamp_updated_at: an UPDATE that sets an old updated_at is overridden to now() (forget-proof)'
);

-- …and status_changed_at is NOT the trigger's: it is when the game was last
-- played, which only the game's status builder writes. Opening a game (the
-- current-view pointer) writes the row but plays nothing, so it stays put.
update common.games
   set status_changed_at = '2000-01-01T00:00:00Z'
 where id = current_setting('test.second_game_id')::uuid;
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common.set_current_view(current_setting('test.second_game_id')::uuid);
select set_config('request.jwt.claims', '', true);

select is(
  (select status_changed_at from common.games
     where id = current_setting('test.second_game_id')::uuid),
  '2000-01-01T00:00:00Z'::timestamptz,
  'set_current_view: opening a game leaves status_changed_at alone'
);

-- ============================================================
select * from finish();
rollback;
