-- cs-unmet

-- ============================================================
-- Test: scrabble.concede(target_game)  (turn-based concede)
-- ============================================================
-- scrabble is turn-based, so concede is more than a record: the conceder
-- is removed from the turn order (_advance_turn skips them), forfeits any
-- win (_finish ranks only players who didn't concede), and if it was their
-- turn the turn hands off. When the last person concedes the game ends.
-- Covers:
--   1. A concede ends the caller + keeps the game going; the current
--      turn is always a player who hasn't conceded afterward (handoff / skip)
--   2. Both conceding ends the game with NO winner (forfeit), everyone
--      lost
--   3. The last person conceding ends it even with a bot still seated, and
--      the bot is ranked
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql

select plan(11);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Scrabble concede', array['ada', 'bea']) as handle;
create temp table g on commit drop as
select (scrabble.create_game(
  (select handle from club),
  '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete')->'data'->>'id')::uuid as id;

-- (1) ada concedes; bea still plays → game continues, and the current
-- turn is bea (either ada was current and handed off, or bea already was).
select lives_ok(
  format($$ select scrabble.concede(%L) $$, (select id from g)),
  'a compete player can concede');
select is(
  (select player_ended_reason from common.game_players
    where game_id = (select id from g) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'conceded', 'the conceder ends, conceded');
select is(
  (select ended_at from common.games where id = (select id from g)),
  null, 'the game continues while bea plays');
select is(
  (select current_turn_user_id from common.games where id = (select id from g)),
  'bea22222-2222-2222-2222-222222222222'::uuid,
  'the turn is a player who hasn''t conceded (conceder skipped / handed off)');

-- (2) bea (the last one in) concedes → game ends, nobody eligible to win.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select scrabble.concede((select id from g));
reset role;
select set_config('request.jwt.claims', '', true);
select is(
  (select pg_temp.winner_ids(summary_data) from common.games where id = (select id from g)),
  '[]'::jsonb, 'no winner when everyone conceded (a conceder forfeits)');
select is(
  (select count(*) from common.game_players
    where game_id = (select id from g) and outcome = 'lost' and final_ranking is null),
  2::bigint, 'nobody is ranked; everyone lost');
select is(
  (select game_ended_outcome from common.games where id = (select id from g)),
  'lost', 'the game ends lost');
select is(
  (select game_ended_reason || '/' || game_ended_reason_detail from common.games where id = (select id from g)),
  'conceded/conceded', 'the reason names the cause');

-- ── (3) The last PERSON conceding ends it, even against a bot ──
-- A bot holds a common.game_players row, and a bot never concedes, so the
-- all-conceded check counts people: counting seats would never reach zero
-- here and the table would never end.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
  select (scrabble.create_game((select handle from club),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
-- The bot has played a word: `_finish` ranks only players who did.
insert into scrabble.events (game_id, user_id, kind, score, took_turn)
select (select id from gb), gp.user_id, 'word', 8, true
  from common.game_players gp
  join common.profiles pr on pr.user_id = gp.user_id
 where gp.game_id = (select id from gb) and pr.ai_member;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.concede((select id from gb));
reset role;

select isnt(
  (select ended_at from common.games where id = (select id from gb)), null,
  'the last person conceding ends the game, though the bot is still seated');
select is(
  (select final_ranking || '/' || outcome from common.game_players gp
     join common.profiles pr on pr.user_id = gp.user_id
    where gp.game_id = (select id from gb) and pr.ai_member),
  '1/won', 'the bot, the one player left, is ranked 1');

-- ── (4) Coop has no concede ──
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gc on commit drop as
  select (scrabble.create_game((select handle from club),
    '{"dict_2": 6, "dict_3plus": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop')->'data'->>'id')::uuid as id;
select is(
  scrabble.concede((select id from gc)) ->> 'dbcode',
  'PN484', 'a coop concede is refused');
reset role;

select * from finish();
rollback;
