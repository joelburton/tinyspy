-- ============================================================
-- Test: RLS + the column grant — the deck is the only secret
-- ============================================================
-- setgame hides exactly one thing: the order of the undealt deck. Everything
-- else about a game is face-up by nature, including who claimed what, which is
-- why claims are club-readable in both modes with no terminal gate.
--
-- The deck's shield is a plain column grant with nothing behind it — no
-- definer helper, no terminal unlock — so these assertions are the whole
-- security story for this game.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(8);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set rls', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g), pg_temp.sg_live((select id from g)));

-- ── The deck ─────────────────────────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- Postgres reports a column-level denial against the TABLE, which is what
-- makes this assertion worth spelling out: the row is readable, the column is
-- not, and the message does not say so.
select throws_ok(
  format($$ select deck from setgame.games where id = %L $$, (select id from g)),
  '42501', 'permission denied for table games',
  'a player cannot read the deck — knowing what comes next is the one edge worth having');

select lives_ok(
  format($$ select board, deck_pos from setgame.games where id = %L $$, (select id from g)),
  'the board and the deal position are readable — only the ORDER is withheld');

select is(
  (select deck_left + cardinality(board) from setgame.games_state where id = (select id from g))
    + 3 * (select count(*)::int from setgame.events
            where kind = 'claim' and game_id = (select id from g)),
  81, 'games_state answers "how many are left" without the deck itself');

select is(
  (select count(*)::int from setgame.games_state where id = (select id from g)),
  1, 'a player in the club sees the game');

-- ── Peers ────────────────────────────────────────────────────────────
-- Compete, and bea can still see ada's claim. Deliberate: the cards were
-- face-up and bea watched them leave the table.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  1, 'a rival can read a claim mid-race — nothing about the future is on it');
select is(
  (select count(*)::int from setgame.players where game_id = (select id from g)),
  2, 'a rival can read the counts, which is what the opponent strip shows');

-- ── Outsiders ────────────────────────────────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*)::int from setgame.games_state where id = (select id from g)),
  0, 'someone outside the club sees no game');
select is(
  (select count(*)::int from setgame.events where kind = 'claim' and game_id = (select id from g)),
  0, 'someone outside the club sees no claims');

select * from finish();
rollback;
