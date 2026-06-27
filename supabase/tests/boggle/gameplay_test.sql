-- ============================================================
-- Test: boggle.submit_word + end_game + submit_timeout
-- ============================================================
-- submit_word returns jsonb { result, points }. Coverage:
--   required → 'accepted'; bonus (in common.words, not required) → 'bonus';
--   soft rejects 'tooShort' / 'invalid' / 'notAWord' / 'alreadyFound' /
--   'gameOver'; coop vs compete dedup; status refresh; end_game (manual) and
--   submit_timeout (timeout) terminal transitions + idempotency; non-player
--   rejection.

begin;
set search_path = boggle, common, public, extensions;
select plan(25);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle Club', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop', pg_temp.boggle_board());

-- ── (1) coop required happy path ──────────────────────────
create temp table cat_ret on commit drop as
select boggle.submit_word((select id from g), 'cat', 1) as ret;
select is((select ret->>'result' from cat_ret), 'accepted', 'required word → accepted');
select is((select (ret->>'points')::int from cat_ret), 1, 'return carries points (cat = 1)');

reset role; select set_config('request.jwt.claims', '', true);
select is((select count(*) from boggle.found_words where game_id = (select id from g) and word = 'cat'),
  1::bigint, 'accepted word inserts one found_words row');
select is((select (status->>'found_words_count')::int from common.games where id = (select id from g)),
  1, 'status.found_words_count refreshed to 1');
select is((select (status->>'score')::int from common.games where id = (select id from g)),
  1, 'status.score refreshed to 1');

-- ── (2) coop dedup: same word by anyone is alreadyFound ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(boggle.submit_word((select id from g), 'cat', 1)->>'result', 'alreadyFound',
  'coop: a word found by another player → alreadyFound');

-- ── (3) bonus: real word (common.words) not in required ───
reset role; select set_config('request.jwt.claims', '', true);
-- 'zydeco' is a real word, so it may already be in common.words (after
-- words:import) or not (bare db:reset); on-conflict makes the test robust either way.
insert into common.words (word, difficulty, american, british, canadian, australian, len)
  values ('zydeco', 4, true, true, true, true, 6)
  on conflict do nothing;
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
create temp table bon_ret on commit drop as
select boggle.submit_word((select id from g), 'zydeco', 3) as ret;
select is((select ret->>'result' from bon_ret), 'bonus', 'legal non-required word → bonus');
reset role; select set_config('request.jwt.claims', '', true);
select is((select is_bonus from boggle.found_words where game_id = (select id from g) and word = 'zydeco'),
  true, 'bonus word stored with is_bonus = true');
select is((select points from boggle.found_words where game_id = (select id from g) and word = 'zydeco'),
  3, 'bonus word stores FE-supplied points (3)');

-- ── (4) soft rejections (no row, no exception) ────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(boggle.submit_word((select id from g), 'ca', 1)->>'result', 'tooShort',
  'below min word length → tooShort');
select is(boggle.submit_word((select id from g), 'ca7', 1)->>'result', 'invalid',
  'non-alpha input → invalid');
select is(boggle.submit_word((select id from g), 'qwxz', 1)->>'result', 'notAWord',
  'not required and not in common.words → notAWord');
-- A word that IS in common.words but ABOVE the legal band (difficulty 6 >
-- legal_band 5) is not a legal bonus → notAWord. ('qzzxvy' is synthetic so the
-- insert deterministically sets difficulty 6 regardless of import state.)
reset role; select set_config('request.jwt.claims', '', true);
insert into common.words (word, difficulty, american, british, canadian, australian, len)
  values ('qzzxvy', 6, true, true, true, true, 6)
  on conflict do nothing;
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(boggle.submit_word((select id from g), 'qzzxvy', 1)->>'result', 'notAWord',
  'real word above the legal band → notAWord');

-- ── (5) end_game (manual) → terminal ──────────────────────
select lives_ok($$ select boggle.end_game((select id from g)) $$, 'end_game: a player can end the game');
reset role; select set_config('request.jwt.claims', '', true);
select is((select is_terminal from common.games where id = (select id from g)), true,
  'end_game sets common.games.is_terminal');
select is((select play_state from common.games where id = (select id from g)), 'ended',
  'end_game sets play_state ended');
select is((select status->>'outcome' from common.games where id = (select id from g)), 'manual',
  'end_game records outcome manual');

-- ── (6) submit after terminal → gameOver ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(boggle.submit_word((select id from g), 'arc', 1)->>'result', 'gameOver',
  'submitting after the game ends → gameOver');

-- ── (7) compete dedup: per-player, not per-team ───────────
create temp table cg on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select is(boggle.submit_word((select id from cg), 'cat', 1)->>'result', 'accepted',
  'compete: ada finds cat');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(boggle.submit_word((select id from cg), 'cat', 1)->>'result', 'accepted',
  'compete: bea independently finds the same word');
select is(boggle.submit_word((select id from cg), 'cat', 1)->>'result', 'alreadyFound',
  'compete: same player re-submitting → alreadyFound');

-- ── (8) submit_timeout → terminal, idempotent ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table tg on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.boggle_board());
select lives_ok($$ select boggle.submit_timeout((select id from tg)) $$, 'submit_timeout ends the game');
reset role; select set_config('request.jwt.claims', '', true);
select is((select status->>'outcome' from common.games where id = (select id from tg)), 'timeout',
  'submit_timeout records outcome timeout');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok($$ select boggle.submit_timeout((select id from tg)) $$,
  'submit_timeout is idempotent (no-op once terminal)');

-- ── (9) non-player rejected ───────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select throws_ok($$ select boggle.submit_word((select id from cg), 'cat', 1) $$,
  '42501', null, 'a non-player is rejected with 42501');

select * from finish();
rollback;
