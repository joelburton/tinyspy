-- cs-unmet

-- ============================================================
-- Test: codenamesduet's page blobs — game_data and summary_data
-- ============================================================
-- `codenamesduet._rebuild_data_cols` writes everything a page shows onto
-- `common.games` after every move (supabase/sql/codenamesduet.sql → The page
-- blobs). This file pins what the page gets:
--
--   1. A fresh game: the deal — 25 tiles by position, each with both
--      players' keys — a board nobody has touched, open to both, no team
--      progress, the opener holding the clue and the move, an empty log
--   2. Mid-game: the turn's clue while it is guessed; an agent shown to both
--      and guessable by neither; a bystander pointing at its guesser and
--      still open to the partner; the turn moving on with the clue seat
--   3. A hint is logged and rebuilds the page, re-dating it
--   4. The partner's bystander on the same tile points at both, and closes it
--   5. The assassin ends the game, and the turn it ended on counts as used
--   6. Sudden death: the flag, and the used turns stop at the budget
--   7. A Restart empties the board, the log and the turn
--   8. `_rebuild_data_cols_for_all` rewrites every game without re-dating it
--
-- Every key card is random, so a tile is found by its letter on both keys
-- (`cell`).
-- ============================================================

begin;
set search_path = codenamesduet, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(30);

-- The first board position that is `p_on_a` on seat A's key and `p_on_b` on
-- seat B's.
create function pg_temp.cell(p_game_id uuid, p_on_a text, p_on_b text) returns int
language sql as $$
  select (ord - 1)::int
    from codenamesduet.games gm,
         jsonb_array_elements_text(gm.key_card_a) with ordinality as a(key, ord)
   where gm.game_id = p_game_id and a.key = p_on_a
     and gm.key_card_b ->> (ord - 1)::int = p_on_b
   limit 1
$$;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Duet pages', array['ada', 'bea']) as handle;

-- Two games: the one this file plays, and one to put in sudden death.
create temp table g on commit drop as
select name, (codenamesduet.create_game(
  (select handle from club), pg_temp.codenamesduet_setup(), pg_temp.codenamesduet_players()
)->'data'->>'id')::uuid as id
  from unnest(array['played', 'late']) as name;
reset role;
select set_config('request.jwt.claims', '', true);
grant select on g to authenticated;

-- Shorthands: the played game's id and blobs, a board tile, a player.
create function pg_temp.gid() returns uuid language sql as
  $$ select id from g where name = 'played' $$;
create function pg_temp.gd() returns jsonb language sql as
  $$ select game_data from common.games where id = pg_temp.gid() $$;
create function pg_temp.tile(pos int) returns jsonb language sql as
  $$ select pg_temp.gd() -> 'team' -> 'board' -> 'tiles' -> pos $$;
create function pg_temp.player(uid text) returns jsonb language sql as
  $$ select p from jsonb_array_elements(pg_temp.gd() -> 'players') p where p ->> 'id' = uid $$;

create temp table ids on commit drop as
select 'ada11111-1111-1111-1111-111111111111' as ada,
       'bea22222-2222-2222-2222-222222222222' as bea;
grant select on ids to authenticated;

-- The two tiles this file plays: an agent on ada's key, and a bystander on
-- both keys.
create temp table pos on commit drop as
select pg_temp.cell(pg_temp.gid(), 'G', 'N') as agent,
       pg_temp.cell(pg_temp.gid(), 'N', 'N') as bystander;
grant select on pos to authenticated;

-- ============================================================
-- (1) A fresh game
-- ============================================================

select is(
  (select jsonb_agg(t -> 'id') from jsonb_array_elements(pg_temp.gd() -> 'puzzle' -> 'tiles') t),
  (select jsonb_agg(to_jsonb(i::text) order by i) from generate_series(0, 24) i),
  'the puzzle is the 25 tiles, by position');

select is(
  (select bool_and(
            t -> 'word' = to_jsonb(w.word)
            and t -> 'key' = jsonb_build_object(
                  (select ada from ids), gm.key_card_a -> w.position,
                  (select bea from ids), gm.key_card_b -> w.position))
     from jsonb_array_elements(pg_temp.gd() -> 'puzzle' -> 'tiles') t
     join codenamesduet.words w on w.game_id = pg_temp.gid() and w.position = (t ->> 'id')::int
     join codenamesduet.games gm on gm.game_id = pg_temp.gid()),
  true,
  'each puzzle tile carries its word and both players'' keys');

select is(
  (select jsonb_agg(distinct t - 'id') from jsonb_array_elements(pg_temp.gd() -> 'team' -> 'board' -> 'tiles') t),
  jsonb_build_array(jsonb_build_object('revealed', null,
    'guessableBy', jsonb_build_array((select ada from ids), (select bea from ids)))),
  'every board tile is unrevealed and open to both');

select is(
  (pg_temp.gd() -> 'team') - 'board',
  '{"nFoundAgents": 0, "nTurnsUsed": 0, "maxTurns": 9, "suddenDeath": false}'::jsonb,
  'the team starts with no agents and no turn used');

select is(
  pg_temp.gd() -> 'turns',
  jsonb_build_object('holder', (select ada from ids), 'num', 1, 'currClue', null),
  'the opener holds the move on turn 1, with no clue yet');

select is(
  array[(pg_temp.player((select ada from ids)) -> 'clueGiver')::text,
        (pg_temp.player((select bea from ids)) -> 'clueGiver')::text,
        (pg_temp.player((select ada from ids)) -> 'allAgentsFound')::text,
        (pg_temp.player((select bea from ids)) -> 'allAgentsFound')::text],
  array['true', 'false', 'false', 'false'],
  'the opener gives the clue, and nobody''s agents are found');

select is(pg_temp.gd() -> 'events', '[]'::jsonb, 'the log starts empty');

select is(
  (select summary_data -> 'team' from common.games where id = pg_temp.gid()),
  '{"nFoundAgents": 0, "nTurnsUsed": 0, "maxTurns": 9, "suddenDeath": false}'::jsonb,
  'the summary carries the same team, without the board');

-- ============================================================
-- (2) Mid-game: ada clues; bea finds an agent, then a bystander
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.submit_clue(pg_temp.gid(), 'ONE', 1);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.gd() -> 'turns',
  jsonb_build_object('holder', (select bea from ids), 'num', 1,
    'currClue', jsonb_build_object('word', 'ONE', 'count', 1, 'fromAi', false,
                                   'userId', (select ada from ids))),
  'the clue is the turn''s while bea guesses, and the move is hers');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_guess(pg_temp.gid(), (select agent from pos));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.tile((select agent from pos)),
  jsonb_build_object('id', (select agent from pos)::text,
    'revealed', '{"as": "G", "arrows": []}'::jsonb, 'guessableBy', '[]'::jsonb),
  'a contacted agent shows to both, points at nobody, and is closed to both');

select is((pg_temp.gd() -> 'team' ->> 'nFoundAgents')::int, 1, 'the team counts the agent');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_guess(pg_temp.gid(), (select bystander from pos));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.tile((select bystander from pos)),
  jsonb_build_object('id', (select bystander from pos)::text,
    'revealed', jsonb_build_object('as', 'N', 'arrows', jsonb_build_array((select bea from ids))),
    'guessableBy', jsonb_build_array((select ada from ids))),
  'a bystander points at its guesser and stays open to her partner');

select is(
  pg_temp.gd() -> 'turns',
  jsonb_build_object('holder', (select bea from ids), 'num', 2, 'currClue', null),
  'the bystander ends the turn: turn 2, no clue yet, bea to clue');

select is(
  array[(pg_temp.player((select ada from ids)) ->> 'clueGiver'),
        (pg_temp.player((select bea from ids)) ->> 'clueGiver'),
        (pg_temp.gd() -> 'team' ->> 'nTurnsUsed')],
  array['false', 'true', '1'],
  'the clue seat moves to bea, and one turn is used');

select is(
  (select jsonb_agg(e -> 'kind') from jsonb_array_elements(pg_temp.gd() -> 'events') e),
  '["clue", "guess", "guess"]'::jsonb,
  'the log holds the clue and both guesses, in order');

select is(
  (pg_temp.gd() -> 'events' -> 2) - 'id' - 'at',
  jsonb_build_object('userId', (select bea from ids), 'kind', 'guess', 'turnNum', 1,
    'tookTurn', true, 'clueWord', null, 'clueCount', null, 'clueFromAi', null,
    'tileId', (select bystander from pos)::text, 'result', 'N'),
  'a guess carries its tile and its result');

-- ============================================================
-- (3) A hint is logged and rebuilds the page
-- ============================================================

update common.games set status_changed_at = '2026-01-01' where id = pg_temp.gid();
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.log_hint(pg_temp.gid());
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.gd() -> 'events' -> -1 ->> 'kind', 'hint', 'the hint is in the log');
select isnt(
  (select status_changed_at from common.games where id = pg_temp.gid()),
  '2026-01-01'::timestamptz,
  'a hint re-dates the page, which is how the partner hears of it');

-- ============================================================
-- (4) ada turns over the same bystander, from bea's key
-- ============================================================

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_clue(pg_temp.gid(), 'TWO', 1);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.submit_guess(pg_temp.gid(), (select bystander from pos));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  pg_temp.tile((select bystander from pos)) -> 'revealed',
  jsonb_build_object('as', 'N', 'arrows', jsonb_build_array((select ada from ids), (select bea from ids))),
  'both bystanders point at both, in seat order');
select is(
  pg_temp.tile((select bystander from pos)) -> 'guessableBy',
  '[]'::jsonb,
  'both markers close the tile to both');
select is((pg_temp.gd() -> 'team' ->> 'nTurnsUsed')::int, 2, 'a second turn is used');

-- ============================================================
-- (5) The assassin ends the game on turn 3
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.submit_clue(pg_temp.gid(), 'THREE', 1);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select codenamesduet.submit_guess(pg_temp.gid(), pg_temp.find_position(pg_temp.gid(), 'A', 'A'));
reset role;
select set_config('request.jwt.claims', '', true);

select is(pg_temp.gd() ->> 'ended', 'true', 'precondition: the assassin ended the game');
select is(
  (pg_temp.gd() -> 'team' ->> 'nTurnsUsed')::int,
  3,
  'the turn the game ended on counts as used');
select is(
  pg_temp.tile(pg_temp.find_position(pg_temp.gid(), 'A', 'A')) -> 'revealed',
  '{"as": "A", "arrows": []}'::jsonb,
  'the assassin shows to both and points at nobody');
select is(
  array[(pg_temp.player((select ada from ids)) ->> 'clueGiver'),
        (pg_temp.player((select bea from ids)) ->> 'clueGiver')],
  array['false', 'false'],
  'nobody holds the clue seat once the game has ended');

-- ============================================================
-- (6) Sudden death
-- ============================================================
-- The turn number is set by hand past the budget, and the page rebuilt.

update codenamesduet.games set turn_number = 12, current_clue_giver = null
 where game_id = (select id from g where name = 'late');
select codenamesduet._rebuild_data_cols((select id from g where name = 'late'), p_update_status_changed_at => false);

select is(
  (select (game_data -> 'team') - 'board' from common.games where id = (select id from g where name = 'late')),
  '{"nFoundAgents": 0, "nTurnsUsed": 9, "maxTurns": 9, "suddenDeath": true}'::jsonb,
  'past the budget is sudden death, and the used turns stop at the budget');

-- ============================================================
-- (7) A Restart empties the board, the log and the turn
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select codenamesduet.replay_board(pg_temp.gid());
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from jsonb_array_elements(pg_temp.gd() -> 'team' -> 'board' -> 'tiles') t
    where t -> 'revealed' <> 'null'::jsonb),
  0,
  'a Restart leaves no tile revealed');
select is(
  jsonb_build_array(pg_temp.gd() -> 'events', pg_temp.gd() -> 'turns' -> 'num',
                    pg_temp.gd() -> 'team' -> 'nTurnsUsed'),
  '[[], 1, 0]'::jsonb,
  'a Restart empties the log and starts turn 1 with none used');

-- ============================================================
-- (8) The rebuild over every game
-- ============================================================

update common.games set status_changed_at = '2026-01-01', game_data = '{}'::jsonb
 where id = pg_temp.gid();
select cmp_ok(codenamesduet._rebuild_data_cols_for_all(), '>=', 2,
  '_rebuild_data_cols_for_all rewrites every codenamesduet game');
select is(
  array[(select status_changed_at from common.games where id = pg_temp.gid())::text,
        pg_temp.gd() ->> 'gametype'],
  array['2026-01-01 00:00:00+00', 'codenamesduet'],
  'it rewrites the blob and leaves the date alone');

select * from finish();
rollback;
