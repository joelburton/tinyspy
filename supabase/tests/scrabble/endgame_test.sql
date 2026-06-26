-- ============================================================
-- Test: scrabble endgame + final scoring
-- ============================================================
-- Going-out (bag empty + rack empty) and blocked (6 scoreless turns)
-- trigger _finish: coop is a neutral 'won' score report; compete subtracts
-- each player's leftover tiles, gives the out-player the opponents'
-- leftovers, and crowns the top score ('won_compete'), ties → co-winners.

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(17);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('Endgame', array['ada', 'bea']) as handle;
reset role;

-- ─── Coop going-out ──────────────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gco on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');
reset role;
select pg_temp.sc_coop((select id from gco), array['A','T'], '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rco on commit drop as
  select scrabble.play_word((select id from gco), 0,
    '[{"x":7,"y":7,"letter":"A","blank":false},
      {"x":8,"y":7,"letter":"T","blank":false}]'::jsonb, array['AT'], 2) as res;
reset role;
select is((select res->>'terminal' from rco), 'true', 'coop going-out ends the game');
select ok((select is_terminal from common.games where id = (select id from gco)),
  'common.games is_terminal flips true');
select is((select play_state from common.games where id = (select id from gco)),
  'won', 'coop completion is a neutral green "won"');
select is((select team_score from scrabble.games where id = (select id from gco)), 2,
  'team_score = score earned − leftover (0 here)');
select is((select status->>'outcome' from common.games where id = (select id from gco)),
  'complete', 'status.outcome is complete');

-- ─── Compete going-out + the going-out bonus ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gcp on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
select pg_temp.sc_turn((select id from gcp), 'ada11111-1111-1111-1111-111111111111');
select pg_temp.sc_rack((select id from gcp), 'ada11111-1111-1111-1111-111111111111', array['A','T']);
select pg_temp.sc_rack((select id from gcp), 'bea22222-2222-2222-2222-222222222222', array['Q','Z']);
select pg_temp.sc_bag((select id from gcp), '{}');  -- empty bag

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.play_word((select id from gcp), 0,
  '[{"x":7,"y":7,"letter":"A","blank":false},
    {"x":8,"y":7,"letter":"T","blank":false}]'::jsonb, array['AT'], 2);
reset role;
select is((select play_state from common.games where id = (select id from gcp)),
  'won_compete', 'compete going-out → won_compete');
select is((select score from scrabble.players
           where game_id = (select id from gcp) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  22, 'going-out player: 2 played − 0 own leftover + 20 (Q+Z) opponent leftover = 22');
select is((select score from scrabble.players
           where game_id = (select id from gcp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  -20, 'opponent: 0 − 20 leftover = −20');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gcp) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true', 'the higher final score wins');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gcp) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'false', 'the loser is flagged won=false');

-- ─── Compete blocked (6 scoreless) ───────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gbl on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
-- One pass away from the 6-scoreless limit; known leftovers.
update scrabble.games set consecutive_scoreless = 5,
  current_user_id = 'ada11111-1111-1111-1111-111111111111' where id = (select id from gbl);
update scrabble.players set score = 10, rack = array['A']
  where game_id = (select id from gbl) and user_id = 'ada11111-1111-1111-1111-111111111111';
update scrabble.players set score = 3, rack = array['Q']
  where game_id = (select id from gbl) and user_id = 'bea22222-2222-2222-2222-222222222222';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table rbl on commit drop as
  select scrabble.pass_turn((select id from gbl), 0) as res;
reset role;
select is((select res->>'terminal' from rbl), 'true', 'the 6th scoreless turn ends the game (blocked)');
select is((select play_state from common.games where id = (select id from gbl)),
  'won_compete', 'blocked compete still crowns the leader');
select is((select status->>'outcome' from common.games where id = (select id from gbl)),
  'blocked', 'status.outcome is blocked');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gbl) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true', 'no going-out bonus: 10−1=9 beats 3−10=−7, ada wins');

-- ─── Compete tie → co-winners ────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gtie on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"difficulty": 6, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid,
          'bea22222-2222-2222-2222-222222222222'::uuid], 'compete');
reset role;
update scrabble.games set consecutive_scoreless = 5,
  current_user_id = 'ada11111-1111-1111-1111-111111111111' where id = (select id from gtie);
update scrabble.players set score = 5, rack = '{}' where game_id = (select id from gtie);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select scrabble.pass_turn((select id from gtie), 0);
reset role;
select is((select result->>'won' from common.game_players
           where game_id = (select id from gtie) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'true', 'tie: ada is a co-winner');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gtie) and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'true', 'tie: bea is a co-winner too');
select is((select status->>'winner' from common.games where id = (select id from gtie)),
  null, 'a tie names no single winner (per-player co-win flags carry it)');

select * from finish();
rollback;
