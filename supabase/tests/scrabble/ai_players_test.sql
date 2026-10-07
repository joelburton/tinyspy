-- cs-unmet

-- ============================================================
-- Test: compete AI players (docs/games/scrabble.md)
-- ============================================================
-- An AI player is a real player: the bot holds a `common.profiles` row marked
-- `ai_member`, a `common.game_players` row (seated in the turn order after the
-- people), and a `scrabble.players` row that carries its rack and the game's
-- `ai_level`. Every player, bot or person, is a user id.
--
-- The suite carries its own bot — `abe-bot`, a persona in `_shared/setup.psql`
-- alongside ada and bea. These tests name the bot by `ai_member` and
-- alphabetical order rather than by uuid, which is how create_game picks, so
-- they read the same on a database where `gmake db-bots` has also provisioned
-- the environment's three.
-- Covers:
--   - create_game seats the AI (ai_count + ai_level), and rejects a dictionary
--     narrower than the AI's band / bad counts / coop
--   - get_ai_context is the definer door to the bot's hidden rack + bands
--     (member-gated, bot-only, its-turn-only)
--   - ai_play_word / ai_pass_turn drive the bot through the shared commit core
--   - _finish ranks an AI winner by score, like any other winner
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

-- A compete game: ada (human, turn seat 0) + one best AI (turn seat 1), full
-- dictionary.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cl on commit drop as
  select pg_temp.create_club('AI scrabble', array['ada', 'bea']) as handle;
create temp table gai on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;

-- The bot create_game picks: the first ai_member by username.
create temp table bot on commit drop as
  select user_id as id from common.profiles where ai_member order by username limit 1;
grant select on bot to authenticated;

-- ─── Seating ──────────────────────────────────────────────
select is((select count(*)::int from scrabble.players where game_id = (select id from gai)),
  2, 'one human + one AI player');
select is((select ai_level from scrabble.players
            where game_id = (select id from gai) and user_id = (select id from bot)),
  'best', 'the bot''s row carries its level');
select is(pg_temp.sc_seat_user((select id from gai), 1), (select id from bot),
  'the first bot in alphabetical order is seated after the people (turn seat 1)');
select is((select count(*)::int from common.game_players
            where game_id = (select id from gai)),
  2, 'the bot is seated in common.game_players like any player');
select is((select count(*)::int from common.clubs_members cm
            join common.profiles p on p.user_id = cm.user_id
           where cm.club_handle = (select handle from cl) and p.ai_member),
  0, 'and is in no human''s club — create_game exempts a bot from that gate');
select is((select ai_level from scrabble.players
            where game_id = (select id from gai) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null, 'the human player has no ai_level');

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
select pg_temp.sc_turn((select id from gai), (select id from bot));
update scrabble.players set rack = array['c','a','t','s','e','r','d']
  where game_id = (select id from gai) and user_id = (select id from bot);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table ctx on commit drop as
  select scrabble.get_ai_context((select id from gai)) -> 'data' as c;
reset role;
select is((select jsonb_array_length(c->'rack') from ctx), 7, 'context returns the bot''s rack');
select is((select c->>'ai_level' from ctx), 'best', 'context carries the level');
select is((select (c->>'user_id')::uuid from ctx), (select id from bot), 'context names the bot holding the turn');

-- A person holds the turn → the bot has nothing to do (done, not an error).
select pg_temp.sc_turn_seat((select id from gai), 0);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is((select scrabble.get_ai_context((select id from gai)) -> 'data' ->> 'result'), 'done',
  'get_ai_context returns done when a human holds the turn');
reset role;

-- ─── ai_play_word ─────────────────────────────────────────
select pg_temp.sc_turn((select id from gai), (select id from bot));
select pg_temp.sc_bag((select id from gai), array['x','y','z']);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table aiw on commit drop as
  select scrabble.ai_play_word((select id from gai), (select id from bot), 0,
    '[{"x":7,"y":7,"letter":"c","blank":false},
      {"x":8,"y":7,"letter":"a","blank":false},
      {"x":9,"y":7,"letter":"t","blank":false}]'::jsonb, array['cat'], 10) as res;
reset role;
select is((select res -> 'data' ->> 'result' from aiw), 'accepted', 'the bot can commit a word');
select is(pg_temp.sc_current_user((select id from gai)), 'ada11111-1111-1111-1111-111111111111'::uuid,
  'the turn advances to the person');
select is((select score from scrabble.players
            where game_id = (select id from gai) and user_id = (select id from bot)),
  10, 'the bot banks its score');
select is((select coalesce(array_length(rack, 1), 0) from scrabble.players
            where game_id = (select id from gai) and user_id = (select id from bot)),
  7, 'the bot draws back to seven from the bag');
select is((select user_id from scrabble.events where game_id = (select id from gai) order by id limit 1),
  (select id from bot),
  'an AI play is attributed to the bot that made it');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  scrabble.ai_play_word((select id from gai), 'ada11111-1111-1111-1111-111111111111', 1,
    '[]'::jsonb, array['at'], 2),
  '{"type":"not-ok","severity":"fault","dbcode":"PN444",
    "message":"BUG: an AI move for a player who is not a bot"}'::jsonb,
  'ai_play_word for a person is rejected');
reset role;

-- ─── ai_pass_turn ──────────────────────────────────────────────
select pg_temp.sc_turn((select id from gai), (select id from bot));
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table aip on commit drop as
  select scrabble.ai_pass_turn((select id from gai), (select id from bot),
    (select version from scrabble.games where game_id = (select id from gai))) as res;
reset role;
select is((select res -> 'data' ->> 'result' from aip), 'passed', 'the bot can pass');
select is(pg_temp.sc_current_seat((select id from gai)), 0,
  'the AI pass advances the turn');

-- ─── _finish ranks an AI winner ───────────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gwin on commit drop as
  select (scrabble.create_game((select handle from cl),
    '{"dict_2": 6, "dict_3plus": 6, "ai_count": 1, "ai_level": "best", "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid], 'compete')->'data'->>'id')::uuid as id;
reset role;
-- Empty racks (no leftover subtraction); the bot leads, and goes out.
update scrabble.players set rack = '{}', score = 10
  where game_id = (select id from gwin) and user_id = 'ada11111-1111-1111-1111-111111111111';
update scrabble.players set rack = '{}', score = 50
  where game_id = (select id from gwin) and user_id = (select id from bot);
-- Each played a word (`_finish` ranks only players who did), worth their score.
insert into scrabble.events (game_id, user_id, kind, score, took_turn)
values ((select id from gwin), 'ada11111-1111-1111-1111-111111111111', 'word', 10, true),
       ((select id from gwin), (select id from bot), 'word', 50, true);
select scrabble._finish((select id from gwin), 'resource_exhausted', 'complete',
  (select id from bot), (select id from bot));
select scrabble._rebuild_data_cols((select id from gwin), true);

select is((select pg_temp.winner_ids(summary_data) from common.games where id = (select id from gwin)),
  jsonb_build_array((select id from bot)),
  'a bot winner is ranked first by uuid like any other winner');
select is((select (summary_data->>'winnerScore')::int from common.games where id = (select id from gwin)),
  50, 'the club line carries the bot winner''s score');
select is((select game_ended_by_user_id from common.games where id = (select id from gwin)),
  (select id from bot), 'the bot going out ended the game');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gwin) and user_id = (select id from bot)),
  '1/won', 'a bot''s win counts — it is ranked like anyone');
select is((select final_ranking || '/' || outcome from common.game_players
           where game_id = (select id from gwin) and user_id = 'ada11111-1111-1111-1111-111111111111'),
  '2/near', 'the out-scored person is ranked second, near');
select is((select game_ended_outcome from common.games where id = (select id from gwin)),
  'won', 'an AI win still crowns a winner');

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
  scrabble.ai_play_word((select id from gdel), (select id from bot), 0,
    '[{"x":7,"y":7,"letter":"c","blank":false}]'::jsonb, array['c'], 1),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_play_word into a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.ai_exchange_tiles((select id from gdel), (select id from bot), 0, array['a']),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_exchange_tiles into a deleted game is the shared race (PN485)');
select pg_temp.envelope_is(
  scrabble.ai_pass_turn((select id from gdel), (select id from bot), 0),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'ai_pass_turn into a deleted game is the shared race (PN485)');

select * from finish();
rollback;
