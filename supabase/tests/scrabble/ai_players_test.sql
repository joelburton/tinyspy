-- cs-unmet

-- ============================================================
-- Test: compete AI players (docs/scrabble-ai-strength.md)
-- ============================================================
-- An AI seat is a real player: the bot holds a `common.profiles` row marked
-- `ai_member`, a `common.game_players` row, and a `scrabble.players` row that
-- carries both its user_id and the game's `ai_level`. What is still
-- scrabble-local is the SEAT — turns are seat-based in compete.
--
-- The suite carries its own bot — `abe-bot`, a persona in `_shared/setup.psql`
-- alongside ada and bea. These tests name the seat's holder by `ai_member` and
-- alphabetical order rather than by uuid, which is how create_game picks, so
-- they read the same on a database where `gmake db-bots` has also provisioned
-- the environment's three.
-- Covers:
--   - create_game seats the AI (ai_count + ai_level), and rejects a dictionary
--     narrower than the AI's band / bad counts / coop
--   - get_ai_context is the definer door to the AI seat's hidden rack + bands
--     (member-gated, AI-seat-only, its-turn-only)
--   - ai_play_word / ai_pass_turn drive the AI seat through the shared commit core
--   - _finish crowns an AI winner by uuid and handle, like any other winner
--   - each AI move, and get_ai_context, into a deleted game is the shared race
-- ============================================================

begin;
set search_path = scrabble, common, public, extensions;
\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- `throws_ok` took a SQL STRING because the call had to be deferred; an
-- envelope is a VALUE, and these build their SQL with `format` (the club
-- handle is only known at run time). This runs one and returns what it gave.
create function pg_temp.envelope_of(sql text) returns jsonb as $envfn$
declare result jsonb;
begin execute sql into result; return result; end;
$envfn$ language plpgsql;
\ir setup.psql

select plan(31);

-- A compete game: ada (human, seat 0) + one best AI (seat 1), full dictionary.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('AI scrabble', array['ada', 'bea']) as handle;
create temp table gai on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;

-- ─── Seating ──────────────────────────────────────────────
select is((select count(*)::int from scrabble.players where game_id = (select id from gai)),
  2, 'one human + one AI seat');
select is((select ai_level from scrabble.players where game_id = (select id from gai) and seat = 1),
  'best', 'the AI seat carries its level');
select is((select user_id from scrabble.players where game_id = (select id from gai) and seat = 1),
  (select user_id from common.profiles where ai_member order by username limit 1),
  'the AI seat is held by the first bot in alphabetical order');
select is((select count(*)::int from common.game_players
            where game_id = (select id from gai)),
  2, 'the bot is seated in common.game_players like any player');
select is((select count(*)::int from common.clubs_members cm
            join common.profiles p on p.user_id = cm.user_id
           where cm.club_handle = (select handle from cl) and p.ai_member),
  0, 'and is in no human''s club — create_game exempts a bot from that gate');
select is((select ai_level from scrabble.players where game_id = (select id from gai) and seat = 0),
  null, 'the human seat has no ai_level');

-- ─── create_game validation ───────────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  pg_temp.envelope_of(format($$ select scrabble.create_game(%L,
    '{"dict_2": 3, "dict_3plus": 3, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')$$, (select handle from cl))),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN083"}'::jsonb,
  'a best AI needs the full dictionary (bands < 6 rejected)');
select pg_temp.envelope_is(
  pg_temp.envelope_of(format($$ select scrabble.create_game(%L,
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 4, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')$$, (select handle from cl))),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN080"}'::jsonb,
  'ai_count > 3 is rejected');
select pg_temp.envelope_is(
  pg_temp.envelope_of(format($$ select scrabble.create_game(%L,
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'coop')$$, (select handle from cl))),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN081"}'::jsonb,
  'AI players are rejected in coop');
reset role;

-- ─── get_ai_context ───────────────────────────────────────
-- Force the AI's turn + a known rack.
select pg_temp.sc_turn_seat((select id from gai), 1);
update scrabble.players set rack = array['C','A','T','S','E','R','D']
  where game_id = (select id from gai) and seat = 1;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ctx on commit drop as
  select scrabble.get_ai_context((select id from gai)) -> 'data' as c;
reset role;
select is((select jsonb_array_length(c->'rack') from ctx), 7, 'context returns the current AI seat rack');
select is((select c->>'ai_level' from ctx), 'best', 'context carries the level');
select is((select (c->>'seat')::int from ctx), 1, 'context names the current AI seat');

-- A human seat holds the turn → the bot has nothing to do (done, not an error).
select pg_temp.sc_turn_seat((select id from gai), 0);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is((select scrabble.get_ai_context((select id from gai)) -> 'data' ->> 'done'), 'true',
  'get_ai_context returns done when a human holds the turn');
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
select is((select res -> 'data' ->> 'result' from aiw), 'accepted', 'the AI seat can commit a word');
select is((select current_seat from scrabble.games where id = (select id from gai)), 0,
  'the turn advances to the human seat');
select is((select score from scrabble.players where game_id = (select id from gai) and seat = 1),
  10, 'the AI seat banks its score');
select is((select seat from scrabble.events where game_id = (select id from gai) order by id limit 1),
  1, 'the play is attributed to the AI seat');
select is((select user_id from scrabble.events where game_id = (select id from gai) order by id limit 1),
  (select user_id from common.profiles where ai_member order by username limit 1),
  'an AI play is attributed to the bot that made it');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.ai_play_word((select id from gai), 0, 1, '[]'::jsonb, array['AT'], 2),
  '{"type":"not-ok","severity":"fault","dbcode":"PN444",
    "message":"BUG: an AI move on a human seat"}'::jsonb,
  'ai_play_word on a human seat is rejected');
reset role;

-- ─── ai_pass_turn ──────────────────────────────────────────────
select pg_temp.sc_turn_seat((select id from gai), 1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table aip on commit drop as
  select scrabble.ai_pass_turn((select id from gai), 1,
    (select version from scrabble.games where id = (select id from gai))) as res;
reset role;
select is((select res -> 'data' ->> 'result' from aip), 'passed', 'the AI seat can pass');
select is((select current_seat from scrabble.games where id = (select id from gai)), 0,
  'the AI pass advances the turn');

-- ─── _finish crowns an AI winner ──────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gwin on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
-- Empty racks (no leftover subtraction); AI leads.
update scrabble.players set rack = '{}', score = 10
  where game_id = (select id from gwin) and seat = 0;
update scrabble.players set rack = '{}', score = 50
  where game_id = (select id from gwin) and seat = 1;
select scrabble._finish((select id from gwin), 'complete', null);

select is((select status->>'winner_user_id' from common.games where id = (select id from gwin)),
  (select user_id::text from common.profiles where ai_member order by username limit 1),
  'a bot winner is named by uuid like any other winner');
select is((select status->>'winner_seat' from common.games where id = (select id from gwin)),
  '1', 'the winning seat is the AI seat');
select is((select status->>'winner_username' from common.games where id = (select id from gwin)),
  (select username from common.profiles where ai_member order by username limit 1),
  'the bot winner is labeled by its handle');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gwin)
             and user_id = (select user_id from common.profiles where ai_member
                             order by username limit 1)),
  'true', 'a bot''s win counts — it has a game_players result like anyone');
select is((select result->>'won' from common.game_players
           where game_id = (select id from gwin) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'false', 'the out-scored human is recorded a loss');
select is((select play_state from common.games where id = (select id from gwin)),
  'won_compete', 'an AI win still crowns a winner (won_compete)');

-- ─── A move into a game a friend just deleted ────────────
-- The delete takes the game's rows and every membership together, so the move
-- is answered by the shared race rather than by a fault, or by "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gdel on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
delete from common.games where id = (select id from gdel);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.get_ai_context((select id from gdel)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'get_ai_context on a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.ai_play_word((select id from gdel), 1, 0,
    '[{"x":7,"y":7,"letter":"C","blank":false}]'::jsonb, array['C'], 1),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_play_word into a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.ai_exchange_tiles((select id from gdel), 1, 0, array['A']),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_exchange_tiles into a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.ai_pass_turn((select id from gdel), 1, 0),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_pass_turn into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
