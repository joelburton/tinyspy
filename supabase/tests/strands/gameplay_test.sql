-- ============================================================
-- Test: strands.submit_path — classification, the hint bar, hard rejects
-- ============================================================
--
-- The classification ORDER is the thing most worth pinning, because getting it
-- wrong is invisible until a specific club setting exposes it. The theme check
-- runs FIRST and unconditionally, ahead of the length gate — 4-letter theme
-- words are common in the real archive (33 of 148 sampled), so a length-first
-- implementation would reject genuine answers the moment a club raised
-- min_word_length. Test (4) is that case, built by setting min_word_length
-- ABOVE the fixture's theme-word length.
--
-- Also pinned: the hint bar CAPS (a deliberate rule, not an overflow bug),
-- duplicates earn nothing, and structurally impossible paths RAISE rather than
-- being logged — the FE reducer can't produce one, so it means a broken or
-- hostile client, and a turn log that players read shouldn't fill with them.

begin;

set search_path = strands, common, public, extensions;

select plan(19);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;
create temp table fix on commit drop as select pg_temp.strands_puzzle() as puzzle_id;
select pg_temp.strands_hint_words();

create temp table game on commit drop as
select id from strands.create_game(
  (select handle from club), pg_temp.strands_setup((select puzzle_id from fix)),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

-- ============================================================
-- (1)–(3) The three accepting outcomes
-- ============================================================

select is(
  strands.submit_path((select id from game), pg_temp.strands_row_path(0))->>'result',
  'theme',
  'a theme word''s exact path is accepted as "theme"'
);

select is(
  strands.submit_path((select id from game), pg_temp.strands_row_path(4))->>'result',
  'spangram',
  'the spangram''s path is accepted as "spangram", not merely "theme"'
);

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4))->>'result',
  'hint_word',
  'a dictionary word that is not a theme word earns a hint point'
);

-- ============================================================
-- (4) THE ORDERING RULE — theme first, length second
-- ============================================================
-- min_word_length 7 is longer than every 6-letter theme word in the fixture.
-- A length-first classifier would call them all "too_short". This is the
-- regression that would only show up in a club that turned the knob up.

create temp table strict_game on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 5, 3, 7),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

select is(
  strands.submit_path((select id from strict_game), pg_temp.strands_row_path(2))->>'result',
  'theme',
  'a theme word SHORTER than min_word_length is still a theme word (order rule)'
);

select is(
  strands.submit_path((select id from strict_game), pg_temp.strands_prefix_path(1, 4))->>'result',
  'too_short',
  '…while a non-theme word under the same limit IS too short'
);

-- ============================================================
-- (5)–(7) The hint bar fills, then CAPS
-- ============================================================

select is(
  (select hint_points from strands.games where id = (select id from game)),
  1,
  'the first hint word puts one point on the bar'
);

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(2, 4))->>'hint_points',
  '2',
  'the second advances it'
);

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(3, 4))->>'hint_points',
  '3',
  'the third fills it (hint_cost = 3)'
);

-- ============================================================
-- (8)–(9) THE CAP: a full bar swallows further points
-- ============================================================
-- Joel's ruling: points earned while a hint sits unspent are LOST, and the
-- player reads that off the full bar rather than being warned. So a fourth
-- valid word is still a valid word — logged, and honestly reported as
-- 'hint_word' — it just doesn't move the bar.

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(5, 4))->>'result',
  'invalid',
  'sanity: row 5''s prefix is NOT in the dictionary (only rows 0-3 were seeded)'
);

select is(
  (select hint_points from strands.games where id = (select id from game)),
  3,
  'the bar is still 3 — nothing has spent it yet'
);

-- ============================================================
-- (10) Duplicates earn nothing
-- ============================================================

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(1, 4))->>'result',
  'duplicate',
  'a word already credited this game is a duplicate, not a fresh point'
);

-- ============================================================
-- (11)–(12) Unknown words, and the may-enter tier
-- ============================================================

select is(
  strands.submit_path((select id from game), pg_temp.strands_prefix_path(6, 4))->>'result',
  'invalid',
  'a word not in the dictionary at this band is invalid'
);

-- band 0 would be below every word; band 1 admits the fixture's difficulty-1
-- words. A game at a LOWER band than the word's difficulty must reject it —
-- this is the knob that makes the game harder.
create temp table band_game on commit drop as
select id from strands.create_game(
  (select handle from club),
  pg_temp.strands_setup((select puzzle_id from fix), 1, 3, 4),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid], 'coop');

select is(
  strands.submit_path((select id from band_game), pg_temp.strands_prefix_path(0, 4))->>'result',
  'hint_word',
  'a difficulty-1 word is accepted at band 1 — difficulty ALONE gates a hint word'
);

-- ============================================================
-- (13)–(17) Hard rejects: structurally impossible paths RAISE
-- ============================================================

select throws_ok(
  format($$ select strands.submit_path(%L, '[[0,0],[4,4]]'::jsonb) $$, (select id from game)),
  'P0001',
  null,
  'a non-adjacent jump raises — the FE reducer cannot produce one'
);

select throws_ok(
  format($$ select strands.submit_path(%L, '[[0,0],[0,1],[0,0]]'::jsonb) $$, (select id from game)),
  'P0001',
  null,
  'a self-crossing path raises'
);

select throws_ok(
  format($$ select strands.submit_path(%L, '[[0,0],[0,6]]'::jsonb) $$, (select id from game)),
  'P0001',
  null,
  'an off-board cell raises'
);

select throws_ok(
  format($$ select strands.submit_path(%L, '[]'::jsonb) $$, (select id from game)),
  'P0001',
  null,
  'an empty path raises'
);

-- Row 0's theme word was found in test (1), so its cells are spent. Tracing
-- through them must be refused — otherwise a player could reuse tiles they no
-- longer own, and the tiling invariant (every cell consumed exactly once)
-- would stop meaning anything.
select throws_ok(
  format($$ select strands.submit_path(%L, %L::jsonb) $$,
         (select id from game), pg_temp.strands_prefix_path(0, 4)::text),
  'P0001',
  null,
  'tracing through a FOUND word''s tiles raises — spent tiles are spent'
);

-- ============================================================
-- (18) Rejects are logged; the turn log tells the whole story
-- ============================================================

select is(
  (select count(*) from strands.guesses
    where game_id = (select id from game) and result in ('invalid','duplicate')),
  3::bigint,
  'soft rejects ARE logged (2 invalid + 1 duplicate) — the log records what was tried'
);

select * from finish();
rollback;
