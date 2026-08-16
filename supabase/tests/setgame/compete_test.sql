-- ============================================================
-- Test: compete — ranking on sets found, ties, and the conceded rule
-- ============================================================
-- setgame compete is a BEST game with a COLLECTIVE finish: nobody finishes
-- alone, the deck running dry ends it for everyone, and the ranking is sets
-- found with no speed tiebreak. The three things worth pinning are that the
-- leader wins, that a tie leaves co-winners rather than picking one, and that
-- conceding forfeits the win without erasing what you took.

begin;
set search_path = setgame, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(12);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Set race', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

reset role;
select is(
  (select title from common.games where id = (select id from g)),
  '#' || upper(left((select id from g)::text, 6)),
  'compete titles the same way — a handle, not a score');

-- ── ada takes the whole deck ─────────────────────────────────────────
create temp table played on commit drop as
select pg_temp.sg_play_out(
  (select id from g), array['ada11111-1111-1111-1111-111111111111'::uuid]) as claims;

reset role;
select is(
  (select play_state from common.games where id = (select id from g)),
  'won_compete', 'the deck running out ends the race');
select is(
  (select status->>'winner_username' from common.games where id = (select id from g)),
  'ada', 'the player with the most sets wins');
select is(
  (select (status->>'winner_user_id')::uuid from common.games where id = (select id from g)),
  'ada11111-1111-1111-1111-111111111111'::uuid,
  'a single winner is named outright');
select ok(
  (select (result->>'won')::boolean from common.game_players
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'the winner is flagged won in her own result');
select ok(
  not (select (result->>'won')::boolean from common.game_players
        where game_id = (select id from g)
          and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'the player who claimed nothing did not win');
select is(
  (select jsonb_array_length(status->'leaderboard') from common.games where id = (select id from g)),
  2, 'the leaderboard lists every player, scorer or not');
select is(
  (select (status->'leaderboard'->0->>'sets_found')::int from common.games where id = (select id from g)),
  (select claims::int from played),
  'the leaderboard is ordered by sets found, best first');

-- ── A tie leaves CO-WINNERS ──────────────────────────────────────────
-- One claim each, then the clock. No speed tiebreak exists, so both win.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g2 on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select setgame.submit_set((select id from g2), pg_temp.sg_live((select id from g2)));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from g2), pg_temp.sg_live((select id from g2)));
select setgame.submit_timeout((select id from g2));

reset role;
select is(
  (select status->>'winner_user_id' from common.games where id = (select id from g2)),
  null, 'a tie names nobody — picking one would tell the other they lost');
select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g2) and (result->>'won')::boolean),
  2, 'both tied players are flagged winners');

-- ── Conceding forfeits the win but keeps the count ───────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table g3 on commit drop as
select * from setgame.create_game(
  (select handle from club), '{"timer": {"kind": "countdown", "seconds": 60}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete');

-- ada gets two, then drops out; bea takes one and is the only racer left.
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.concede((select id from g3));
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select setgame.submit_set((select id from g3), pg_temp.sg_live((select id from g3)));
select setgame.submit_timeout((select id from g3));

reset role;
select is(
  (select status->>'winner_username' from common.games where id = (select id from g3)),
  'bea', 'the conceder does not win, even holding more sets');
select is(
  (select (result->>'sets_found')::int from common.game_players
    where game_id = (select id from g3)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  2, 'the conceder keeps the sets she took — she just cannot be crowned');

select * from finish();
rollback;
