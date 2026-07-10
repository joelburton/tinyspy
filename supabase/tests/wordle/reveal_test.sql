-- ============================================================
-- Test: wordle.reveal_answer (give up: end the game, reveal the word)
-- ============================================================
-- The "Reveal answer" game-menu item, mid-game. end_game with the
-- intent made legible: the uniform neutral 'ended' terminal, everyone
-- {"won": false}, status.outcome = 'revealed' (vs 'manual') — the flag
-- the FE keys on to decide whether the word is DISPLAYED at terminal
-- (win or explicit reveal only; a loss / manual end keeps it hidden).
-- The target itself unshields via the ordinary is_terminal gate.

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql
\ir setup.psql

select plan(7);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Wordle rv', array['ada', 'bea']) as handle;
create temp table g1 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop');

select wordle.reveal_answer((select id from g1));

-- Still as ada: the target is now readable through games_state.
select isnt(
  (select target from wordle.games_state where id = (select id from g1)),
  null, 'reveal → the target unshields (is_terminal gate)');

reset role;
select is(
  (select play_state from common.games where id = (select id from g1)),
  'ended', 'reveal → the uniform neutral ended terminal');
select is(
  (select is_terminal from common.games where id = (select id from g1)),
  true, 'reveal → is_terminal set');
select is(
  (select status->>'outcome' from common.games where id = (select id from g1)),
  'revealed', 'reveal → status.outcome = revealed (vs manual)');
select is(
  (select count(*) from common.game_players
     where game_id = (select id from g1) and (result->>'won')::boolean),
  0::bigint, 'reveal → nobody recorded as won');

-- Idempotency: a second reveal (or one racing end_game) is rejected.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select throws_ok(
  format($$ select wordle.reveal_answer(%L::uuid) $$, (select id from g1)),
  'P0001', 'game is not in progress',
  'reveal on an already-ended game is rejected');

-- Non-player rejected (fresh in-progress game).
create temp table g2 on commit drop as
select * from wordle.create_game(
  (select handle from club), pg_temp.wordle_setup(5),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop');
reset role;
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok(
  format($$ select wordle.reveal_answer(%L::uuid) $$, (select id from g2)),
  NULL, NULL, 'a non-player cannot reveal the answer');

select * from finish();
rollback;
