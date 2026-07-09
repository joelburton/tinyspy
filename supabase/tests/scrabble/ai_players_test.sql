-- ============================================================
-- Test: compete AI players (docs/scrabble-ai-strength.md)
-- ============================================================
-- AI seats are scrabble-local: rows in scrabble.players with a null user_id +
-- an ai_level, NOT in common.game_players / profiles. Turns are seat-based.
-- Covers:
--   - create_game seats the AI (ai_count + ai_level), and rejects a dictionary
--     narrower than the AI's band / bad counts / coop
--   - get_ai_context is the definer door to the AI seat's hidden rack + bands
--     (member-gated, AI-seat-only, its-turn-only)
--   - ai_play_word / ai_pass drive the AI seat through the shared commit core
--   - _finish crowns an AI winner (winner_seat + "AI 1", no human uuid)
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(24);

-- A compete game: ada (human, seat 0) + one best AI (seat 1), full dictionary.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select common.create_club('AI scrabble', array['ada', 'bea']) as handle;
create temp table gai on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete');
reset role;

-- ─── Seating ──────────────────────────────────────────────
select is((select count(*)::int from scrabble.players where game_id = (select id from gai)),
  2, 'one human + one AI seat');
select is((select ai_level from scrabble.players where game_id = (select id from gai) and seat = 1),
  'best', 'the AI seat carries its level');
select is((select user_id from scrabble.players where game_id = (select id from gai) and seat = 1),
  null, 'the AI seat has no user_id');
select is((select ai_level from scrabble.players where game_id = (select id from gai) and seat = 0),
  null, 'the human seat has no ai_level');

-- ─── create_game validation ───────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select scrabble.create_game(%L,
    '{"dict_2": 3, "dict_3plus": 3, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete') $$, (select handle from cl)),
  'P0001', NULL, 'a best AI needs the full dictionary (bands < 6 rejected)');
select throws_ok(
  format($$ select scrabble.create_game(%L,
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 4, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete') $$, (select handle from cl)),
  'P0001', NULL, 'ai_count > 3 is rejected');
select throws_ok(
  format($$ select scrabble.create_game(%L,
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop') $$, (select handle from cl)),
  'P0001', NULL, 'AI players are rejected in coop');
reset role;

-- ─── get_ai_context ───────────────────────────────────────
-- Force the AI's turn + a known rack.
select pg_temp.sc_turn_seat((select id from gai), 1);
update scrabble.players set rack = array['C','A','T','S','E','R','D']
  where game_id = (select id from gai) and seat = 1;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ctx on commit drop as
  select scrabble.get_ai_context((select id from gai), 1) as c;
reset role;
select is((select jsonb_array_length(c->'rack') from ctx), 7, 'context returns the AI seat rack');
select is((select c->>'ai_level' from ctx), 'best', 'context carries the level');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select scrabble.get_ai_context(%L, 0) $$, (select id from gai)),
  'P0001', NULL, 'get_ai_context on a human seat is rejected');
-- Not the AI's turn (hand it to the human seat) → rejected.
reset role;
select pg_temp.sc_turn_seat((select id from gai), 0);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select scrabble.get_ai_context(%L, 1) $$, (select id from gai)),
  'P0001', NULL, 'get_ai_context off-turn is rejected');
reset role;

-- ─── ai_play_word ─────────────────────────────────────────
select pg_temp.sc_turn_seat((select id from gai), 1);
select pg_temp.sc_bag((select id from gai), array['X','Y','Z']);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table aiw on commit drop as
  select scrabble.ai_play_word((select id from gai), 1, 0,
    '[{"x":7,"y":7,"letter":"C","blank":false},
      {"x":8,"y":7,"letter":"A","blank":false},
      {"x":9,"y":7,"letter":"T","blank":false}]'::jsonb, array['CAT'], 10) as res;
reset role;
select is((select res->>'result' from aiw), 'accepted', 'the AI seat can commit a word');
select is((select current_seat from scrabble.games where id = (select id from gai)), 0,
  'the turn advances to the human seat');
select is((select score from scrabble.players where game_id = (select id from gai) and seat = 1),
  10, 'the AI seat banks its score');
select is((select seat from scrabble.plays where game_id = (select id from gai) and seq = 1),
  1, 'the play is attributed to the AI seat');
select is((select user_id from scrabble.plays where game_id = (select id from gai) and seq = 1),
  null, 'an AI play has a null user_id');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select scrabble.ai_play_word(%L, 0, 1, '[]'::jsonb, array['AT'], 2) $$, (select id from gai)),
  'P0001', NULL, 'ai_play_word on a human seat is rejected');
reset role;

-- ─── ai_pass ──────────────────────────────────────────────
select pg_temp.sc_turn_seat((select id from gai), 1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table aip on commit drop as
  select scrabble.ai_pass((select id from gai), 1,
    (select version from scrabble.games where id = (select id from gai))) as res;
reset role;
select is((select res->>'result' from aip), 'passed', 'the AI seat can pass');
select is((select current_seat from scrabble.games where id = (select id from gai)), 0,
  'the AI pass advances the turn');

-- ─── _finish crowns an AI winner ──────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gwin on commit drop as
  select id from scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete');
reset role;
-- Empty racks (no leftover subtraction); AI leads.
update scrabble.players set rack = '{}', score = 10
  where game_id = (select id from gwin) and seat = 0;
update scrabble.players set rack = '{}', score = 50
  where game_id = (select id from gwin) and seat = 1;
select scrabble._finish((select id from gwin), 'complete', null);

select is((select status->>'winner' from common.games where id = (select id from gwin)),
  null, 'no human winner uuid when the AI wins');
select is((select status->>'winner_seat' from common.games where id = (select id from gwin)),
  '1', 'the winning seat is the AI seat');
select is((select status->>'winner_username' from common.games where id = (select id from gwin)),
  'AI 1', 'the AI winner is labelled "AI 1"');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gwin) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false', 'the out-scored human is recorded a loss');
select is((select play_state from common.games where id = (select id from gwin)),
  'won_compete', 'an AI win still crowns a winner (won_compete)');

select * from finish();
rollback;
