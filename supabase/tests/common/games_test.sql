-- ============================================================
-- Test: common.games + common.game_players + the 3 new helpers
-- ============================================================
--
-- Covers Phase 1 of the common.games architectural shift:
--
--   - common.games: RLS (club members see all club games), base
--     shape
--   - common.game_players: RLS via parent games, base shape
--   - common.create_game: caller membership, player-uid
--     membership, both rows landed
--   - common.require_game_player: auth + game-player gate
--   - common.end_game: ended_at + play_state + is_terminal + status +
--     per-player results + is_current_view flipped to false
--
-- Per-game tests (tinyspy/psychicnum/wordknit) exercise these
-- helpers indirectly through their own create_game RPCs; this
-- file pins the contract directly.
--
-- "Which game is the current view for this club" is now derived
-- from common.games.is_current_view (with a partial unique index
-- enforcing one-current-view-per-club). The separate
-- club_active_game pointer table is gone.
--
-- See ../tinyspy/create_game_test.sql for the pgTAP / personas
-- primer, and helpers_test.sql for the "as_jwt_only" trick we
-- reuse here to call security-revoked helpers as postgres while
-- still simulating an authenticated caller's auth.uid().

begin;

set search_path = common, public, extensions;

select plan(43);

\ir ../_shared/setup.psql

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
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;
select set_config('request.jwt.claims', '', true);

-- ============================================================
-- common.create_game — happy path
-- ============================================================
-- Caller is ada; players are [ada, bea]; gametype 'wordknit_coop'.
-- The new game_id goes into session-config so we can read it
-- back across role switches (temp tables are role-bound).

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');

-- Pass saved_default=NULL on this happy-path call — the
-- clubs_gametypes.default_setup auto-save is exercised in a
-- dedicated block further down (it doesn't matter for the
-- assertions in *this* section).
select set_config(
  'test.created_game_id',
  (common.create_game(
    (select handle from club),
    'wordknit_coop',
    array[
      'ada11111-1111-1111-1111-111111111111'::uuid,
      'bea22222-2222-2222-2222-222222222222'::uuid
    ],
    'test-title',
    '{}'::jsonb,
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
  'wordknit_coop',
  'create_game: common.games row has the right gametype'
);

select is(
  (select club_handle from common.games where id = current_setting('test.created_game_id')::uuid),
  (select handle from club),
  'create_game: common.games row has the right club_handle'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid),
  2,
  'create_game: 2 game_players rows landed (one per uid in player_user_ids)'
);

-- ============================================================
-- common.create_game — rejects on caller not a club member
-- ============================================================
-- Dee tries to start a game in ada+bea's club.

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.create_game(%L, 'wordknit_coop',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'bea22222-2222-2222-2222-222222222222'::uuid],
       'test-title', '{}'::jsonb, null) $$,
    (select handle from club)
  ),
  '42501',
  'not a member of this club',
  'create_game: non-member caller is rejected (via require_club_member)'
);

-- ============================================================
-- common.create_game — rejects on empty player_user_ids
-- ============================================================

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format(
    $$ select common.create_game(%L, 'wordknit_coop', array[]::uuid[], 'test-title', '{}'::jsonb, null) $$,
    (select handle from club)
  ),
  'P0001',
  'player_user_ids must not be empty',
  'create_game: empty player_user_ids is rejected'
);

-- ============================================================
-- common.create_game — rejects when a listed uid isn't a club member
-- ============================================================
-- ada lists dee (an outsider) as a player.

select throws_ok(
  format(
    $$ select common.create_game(%L, 'wordknit_coop',
       array['ada11111-1111-1111-1111-111111111111'::uuid,
             'dee44444-4444-4444-4444-444444444444'::uuid],
       'test-title', '{}'::jsonb, null) $$,
    (select handle from club)
  ),
  'P0001',
  'player_user_ids contains non-members: dee44444-4444-4444-4444-444444444444',
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
-- common.require_game_player
-- ============================================================

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  format(
    $$ select common.require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  '42501',
  'must be authenticated',
  'require_game_player: null auth.uid() raises 42501'
);

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.require_game_player(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  '42501',
  'not playing this game',
  'require_game_player: outsider raises 42501'
);

select pg_temp.as_jwt_only('bea22222-2222-2222-2222-222222222222');
select is(
  (select common.require_game_player(current_setting('test.created_game_id')::uuid)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'require_game_player: in-game player gets back their caller_id'
);

-- ============================================================
-- common.end_game
-- ============================================================
-- Precondition: common.create_game left this row in is_current_view=true
-- (the create_game RPC's transition). end_game should flip it off
-- only indirectly — actually, end_game only flips play_state /
-- is_terminal / ended_at / status; is_current_view stays true
-- until the FE explicitly closes the post-game review. So this
-- test pins what end_game *does* write.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select is_current_view from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'precondition: game starts is_current_view=true after create_game'
);

-- Now end the game with play_state + status + per-player results.
-- The new signature is (target_game, play_state, status, player_results).
select common.end_game(
  current_setting('test.created_game_id')::uuid,
  'solved',
  '{"outcome": "solved", "matched": 4, "mistakes": 1}'::jsonb,
  format(
    '{"%s": {"won": true}, "%s": {"won": true}}',
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
  (select status->>'outcome' from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'solved',
  'end_game: status persisted'
);

select is(
  (select play_state from common.games
    where id = current_setting('test.created_game_id')::uuid),
  'solved',
  'end_game: play_state written from the new 2nd arg'
);

select is(
  (select is_terminal from common.games
    where id = current_setting('test.created_game_id')::uuid),
  true,
  'end_game: is_terminal flipped to true'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true',
  'end_game: ada''s per-player result persisted'
);

select is(
  (select result->>'won' from common.game_players
    where game_id = current_setting('test.created_game_id')::uuid
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true',
  'end_game: bea''s per-player result persisted'
);

-- ============================================================
-- common.end_game — unknown game
-- ============================================================

select throws_ok(
  $$ select common.end_game('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
                            'won', '{}'::jsonb, '{}'::jsonb) $$,
  'P0002',
  'game not found',
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
-- The game from the create_game block above is terminal now
-- (end_game ran). is_current_view stays true (end_game leaves
-- it alone). Start a second game in the same club to exercise
-- the "vacate prior current" behavior.

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select set_config(
  'test.second_game_id',
  (common.create_game(
    (select handle from club),
    'wordknit_coop',
    array['ada11111-1111-1111-1111-111111111111'::uuid],
    'second',
    '{}'::jsonb,
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
select lives_ok(
  format(
    $$ select common.set_current_view(%L::uuid) $$,
    current_setting('test.created_game_id')::uuid
  ),
  'set_current_view: re-mount on the already-current game is a no-op'
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
select common.unset_current_view(current_setting('test.created_game_id')::uuid);

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
select throws_ok(
  format(
    $$ select common.set_current_view(%L::uuid) $$,
    current_setting('test.second_game_id')::uuid
  ),
  '42501',
  'not a member of this club',
  'set_current_view: non-member is rejected'
);
select throws_ok(
  format(
    $$ select common.unset_current_view(%L::uuid) $$,
    current_setting('test.second_game_id')::uuid
  ),
  '42501',
  'not a member of this club',
  'unset_current_view: non-member is rejected'
);

-- Unknown game raises P0002 (matches end_game's vocabulary).
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select common.set_current_view('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'P0002',
  'game not found',
  'set_current_view: unknown game raises P0002'
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
-- common.create_game's `saved_default` parameter overwrites the
-- (club, gametype) row in clubs_gametypes on every successful
-- call. The contract: non-NULL writes; NULL skips (the gametype
-- opted out for this call). The intent is "next time the setup
-- dialog opens, it pre-fills from this row."
--
-- Up to this point the test has been passing saved_default=NULL
-- everywhere, so the m2m row's default_setup is still NULL
-- (its post-create_club state). Verify that first, then make a
-- non-null call and verify the write.

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'wordknit_coop'),
  null,
  'saved defaults: starts NULL (handle_new_user / create_club leave it unset)'
);

-- Issue a third create_game with a non-null saved_default. This
-- exercises the auto-save path. The shape is intentionally
-- different from a real wordknit setup to make the test self-
-- evident: we're checking the plumbing, not the semantic.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common.create_game(
  (select handle from club),
  'wordknit_coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'third',
  '{"timer": {"kind": "none"}, "puzzleId": "marker-1"}'::jsonb,
  '{"timer": {"kind": "none"}, "puzzleId": "marker-1"}'::jsonb
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup->>'puzzleId' from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'wordknit_coop'),
  'marker-1',
  'saved defaults: a non-null saved_default writes to clubs_gametypes.default_setup'
);

-- Overwrite-on-each-call: a second call with a different
-- saved_default replaces the row. There's no "first write wins"
-- or "must equal previous" semantics — the FE owns the policy
-- of when to call create_game; the DB just records the latest.
select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select common.create_game(
  (select handle from club),
  'wordknit_coop',
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'fourth',
  '{"timer": {"kind": "none"}, "puzzleId": "marker-2"}'::jsonb,
  '{"timer": {"kind": "none"}, "puzzleId": "marker-2"}'::jsonb
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select default_setup->>'puzzleId' from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'wordknit_coop'),
  'marker-2',
  'saved defaults: a subsequent non-null saved_default overwrites the row'
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
select common.delete_game(current_setting('test.created_game_id')::uuid);

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
-- Non-member rejected (RLS-equivalent gate via require_club_member);
-- unknown game raises the same P0002 every other game-id-or-die
-- RPC uses.

select pg_temp.as_jwt_only('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format(
    $$ select common.delete_game(%L::uuid) $$,
    current_setting('test.second_game_id')::uuid
  ),
  '42501',
  'not a member of this club',
  'delete_game: non-member is rejected'
);

select pg_temp.as_jwt_only('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  $$ select common.delete_game('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'P0002',
  'game not found',
  'delete_game: unknown game raises P0002'
);

-- ============================================================
select * from finish();
rollback;
