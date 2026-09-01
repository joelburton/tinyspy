-- cs-unmet

-- ============================================================
-- Test: boggle.submit_word + end_game + submit_timeout
-- ============================================================
-- submit_word is trusting-commit: the FE validated the word against the board's
-- shipped legal list and scored it, so the RPC trusts word + points + is_bonus
-- and only enforces the live-game check, dedups, records, and refreshes status.
-- It does NOT validate word content (no tooShort/invalid/notAWord). Coverage:
--   is_bonus false → 'accepted'; is_bonus true → 'bonus' (stores the flag + the
--   FE points); 'alreadyFound' (coop = per-team, compete = per-player); 'gameOver'
--   after terminal; status refresh; end_game / submit_timeout transitions +
--   idempotency; non-player rejection.

begin;
set search_path = boggle, common, public, extensions;
select plan(22);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Boggle Club', array['ada', 'bea', 'cade']) as handle;

create temp table g on commit drop as
select (boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop', pg_temp.boggle_board())->'data'->>'id')::uuid as id;

-- ── (1) coop required happy path ──────────────────────────
create temp table cat_ret on commit drop as
select boggle.submit_word((select id from g), 'cat', 1, false) as ret;
select is((select ret->'data'->>'result' from cat_ret), 'accepted',
  'required word (is_bonus false) → accepted');
select is((select (ret->'data'->>'points')::int from cat_ret), 1,
  'return carries the FE-supplied points (cat = 1)');

reset role; select set_config('request.jwt.claims', '', true);
select is((select count(*) from boggle.found_words where game_id = (select id from g) and word = 'cat'),
  1::bigint, 'accepted word inserts one found_words row');
select is((select (status->>'found_words_count')::int from common.games where id = (select id from g)),
  1, 'status.found_words_count refreshed to 1');
select is((select (status->>'found_words_score')::int from common.games where id = (select id from g)),
  1, 'status.found_words_score refreshed to 1');

-- ── (2) coop dedup: same word by anyone is alreadyFound ───
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  boggle.submit_word((select id from g), 'cat', 1, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN359","message":"CAT — already found"}'::jsonb,
  'coop: a word found by another player → alreadyFound');

-- ── (3) bonus: trusted from the FE (is_bonus true), no dictionary check ───
select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select pg_temp.envelope_is(
  boggle.submit_word((select id from g), 'zydeco', 3, true),
  '{"type":"ok","data":{"result":"bonus"}}'::jsonb,
  'is_bonus true → bonus (no server dictionary check)');
reset role; select set_config('request.jwt.claims', '', true);
select is((select is_bonus from boggle.found_words where game_id = (select id from g) and word = 'zydeco'),
  true, 'bonus word stored with is_bonus = true');
select is((select points from boggle.found_words where game_id = (select id from g) and word = 'zydeco'),
  3, 'bonus word stores FE-supplied points (3)');

-- ── (4) end_game (manual) → terminal ──────────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok($$ select boggle.end_game((select id from g)) $$, 'end_game: a player can end the game');
reset role; select set_config('request.jwt.claims', '', true);
select is((select is_terminal from common.games where id = (select id from g)), true,
  'end_game sets common.games.is_terminal');
select is((select play_state from common.games where id = (select id from g)), 'ended',
  'end_game sets play_state ended');
select is((select status->>'outcome' from common.games where id = (select id from g)), 'manual',
  'end_game records outcome manual');

-- ── (5) submit after terminal → gameOver ──────────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
-- A RACE: the game can end while a submission is in flight, and the word is
-- not recorded — so it refuses rather than answering.
select pg_temp.envelope_is(
  boggle.submit_word((select id from g), 'arc', 1, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN368","message":"Game over"}'::jsonb,
  'submitting after the game ends is refused');

-- ── (6) compete dedup: per-player, not per-team ───────────
create temp table cg on commit drop as
select (boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board())->'data'->>'id')::uuid as id;
select pg_temp.envelope_is(
  boggle.submit_word((select id from cg), 'cat', 1, false),
  '{"type":"ok","data":{"result":"accepted"}}'::jsonb,
  'compete: ada finds cat');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select pg_temp.envelope_is(
  boggle.submit_word((select id from cg), 'cat', 1, false),
  '{"type":"ok","data":{"result":"accepted"}}'::jsonb,
  'compete: bea independently finds the same word');
select pg_temp.envelope_is(
  boggle.submit_word((select id from cg), 'cat', 1, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN359","message":"CAT — already found"}'::jsonb,
  'compete: same player re-submitting → alreadyFound');

-- ── (6b) a conceded player is out of the race ─────────────
-- A RACE, not a bug: the FE gates on myConceded, so this only fires on a
-- submit in flight when concede commits, or a stale second tab. ada keeps
-- racing, so the game stays live.
select boggle.concede((select id from cg));
select pg_temp.envelope_is(
  boggle.submit_word((select id from cg), 'car', 1, false),
  '{"type":"not-ok","severity":"race","field":"_","dbcode":"PN352","message":"Already conceded"}'::jsonb,
  'compete: a conceded player cannot submit');

-- ── (7) submit_timeout → terminal, idempotent ─────────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table tg on commit drop as
select (boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop', pg_temp.boggle_board())->'data'->>'id')::uuid as id;
select lives_ok($$ select boggle.submit_timeout((select id from tg)) $$, 'submit_timeout ends the game');
reset role; select set_config('request.jwt.claims', '', true);
select is((select status->>'outcome' from common.games where id = (select id from tg)), 'timeout',
  'submit_timeout records outcome timeout');
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select lives_ok($$ select boggle.submit_timeout((select id from tg)) $$,
  'submit_timeout is idempotent (no-op once terminal)');

-- ── (8) non-player rejected ───────────────────────────────
select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select pg_temp.envelope_is(
  boggle.submit_word((select id from cg), 'cat', 1, false),
  '{"type":"not-ok","severity":"fault","field":"_","dbcode":"PN253"}'::jsonb,
  'a non-player is rejected');

select * from finish();
rollback;
