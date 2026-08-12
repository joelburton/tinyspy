-- ============================================================
-- Test: letterboxed's player-typed board (setup.custom_sides)
-- ============================================================
--
-- The optional custom-board path: setup carries `custom_sides`, the twelve
-- letters the player typed into the dialog, in side order — "play the board my
-- friend sent me". The edge function looks those twelve up in
-- letterboxed.seeds to recover the pair that solves them, and passes the board
-- through untouched instead of partitioning a sampled seed.
--
-- What this file pins, in the two SQL pieces the edge function leans on:
--
--   1. `seed_for` is readable by an authenticated caller AT ALL. RLS is enabled
--      on letterboxed.seeds with no select policy, so the table's own grant
--      yields nothing and the lookup HAS to be security definer. This is the
--      bug the feature would otherwise have shipped with: every custom board
--      rejected as unknown, on a correct client, with a correct seed table.
--   2. A custom board is accepted and stored like any other, and its title is
--      the dash-separated board.
--   3. The one-off `custom_sides` is STRIPPED from the club's saved default
--      (clubs_gametypes.default_setup) — the next game rolls again — while the
--      rest of the setup survives.
--   4. A board that does NOT match what the player typed is rejected. The whole
--      feature is "the exact board my friend sent me", so a builder that
--      quietly re-partitioned it would hand back a puzzle that looks right and
--      isn't.
--   5. The >= 150 richness floor does not apply to a custom board — you chose
--      it, so how rich it is, is your business...
--   6. ...and DOES still apply to a rolled one. Without this pair, #5 would
--      pass just as well if the floor had been deleted outright.
--
-- See ./setup.psql for the synthetic board + setup fixtures.

begin;

set search_path = letterboxed, common, public, extensions;

\ir ../_shared/setup.psql
\ir setup.psql

select plan(11);

-- ============================================================
-- 1. seed_for reaches the pool that RLS hides
-- ============================================================
-- Planted as the superuser (which bypasses RLS), then read back as ada. The
-- twelve letters are the fixture board's own, sorted — which is exactly the
-- key the edge function computes from a typed board.
-- `on conflict` because the real importer may already hold these twelve: the
-- fixture has to be deterministic whether or not `gmake g-letterboxed-seeds`
-- has run against this database.
insert into letterboxed.seeds (letters, word_a, word_b, difficulty)
values ('abcdefghijkl', 'adgjbehk', 'kcfil', 2)
on conflict (letters) do update
  set word_a = excluded.word_a,
      word_b = excluded.word_b,
      difficulty = excluded.difficulty;

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select word_a from letterboxed.seed_for('abcdefghijkl')),
  'adgjbehk',
  'seed_for hands an authenticated caller the pair for a known letter set'
);

-- The counter-proof, and the reason seed_for exists: the SAME caller reading
-- the SAME row through the table gets nothing, because RLS is on and there is
-- no select policy. If this ever returns a row, the definer wrapper has
-- stopped being load-bearing and the reason for it should be re-read.
select is(
  (select count(*) from letterboxed.seeds where letters = 'abcdefghijkl'),
  0::bigint,
  'the same caller reading letterboxed.seeds directly gets nothing (RLS)'
);

-- Sorted (the shape the edge function always passes) and vowel-free, so no
-- real seed can exist for it however the pool was built.
select is(
  (select count(*) from letterboxed.seed_for('bfgjkpqvwxyz')),
  0::bigint,
  'seed_for returns nothing for letters with no seed'
);

-- ============================================================
-- 2 + 3. A custom board is accepted, titled, and not saved as a default
-- ============================================================
create temp table club on commit drop as
select common.create_club('LB custom', array['ada', 'bea']) as handle;

-- The typed board IS the fixture board's sides, which is the case that matters:
-- a board the game itself produced, read off the screen and typed back in.
create temp table cset on commit drop as
select pg_temp.lb_setup() || '{"custom_sides":"abcdefghijkl"}'::jsonb as s;

create temp table g on commit drop as
select * from letterboxed.create_game(
  (select handle from club),
  (select s from cset),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
);

select is(
  (select sides from letterboxed.games where id = (select id from g)),
  'abcdefghijkl',
  'a custom board is stored exactly as typed'
);

select is(
  (select title from common.games where id = (select id from g)),
  'ABC-DEF-GHI-JKL',
  'the title is the board, dash-separated'
);

-- Par is untouched: the seeded pair still solves it, so the cap is 2 + 3.
select is(
  (select max_words from letterboxed.games where id = (select id from g)),
  5,
  'a custom board is still par 2 — the cap is par + extra_words'
);

select ok(
  (select default_setup->'custom_sides' is null
     from common.clubs_gametypes
    where club_handle = (select handle from club)
      and gametype = 'letterboxed_coop'),
  'custom_sides is stripped from the club default — a one-off, not a baseline'
);

select is(
  (select default_setup->>'legal_band'
     from common.clubs_gametypes
    where club_handle = (select handle from club)
      and gametype = 'letterboxed_coop'),
  '5',
  'the rest of the setup IS saved as the club default'
);

-- ============================================================
-- 4. The board must be the board that was typed
-- ============================================================
-- A fresh club: common.games' is_current_view index allows one live game per
-- club, so each scenario below gets its own room.
create temp table club2 on commit drop as
select common.create_club('LB mismatch', array['ada', 'bea']) as handle;

select throws_ok(
  format(
    $$ select letterboxed.create_game(%L,
                                      pg_temp.lb_setup()
                                        || '{"custom_sides":"lkjihgfedcba"}'::jsonb,
                                      array['ada11111-1111-1111-1111-111111111111'::uuid,
                                            'bea22222-2222-2222-2222-222222222222'::uuid],
                                      'coop',
                                      pg_temp.lb_board()) $$,
    (select handle from club2)
  ),
  'P0001',
  'custom-board-mismatch|lkjihgfedcba|abcdefghijkl|',
  'a board that is not the one typed is refused'
);

-- ============================================================
-- 5 + 6. The richness floor is custom-only
-- ============================================================
-- The same board stripped to just its two solution words: well-formed and
-- winnable, but far under the >= 150 floor a rolled board must clear.
create function pg_temp.lb_thin_board()
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'sides', 'abcdefghijkl',
    'solution', jsonb_build_array('adgjbehk', 'kcfil'),
    'playable_words', jsonb_build_array('adgjbehk', 'kcfil')
  );
$$;

create temp table club3 on commit drop as
select common.create_club('LB thin custom', array['ada', 'bea']) as handle;

select lives_ok(
  format(
    $$ select letterboxed.create_game(%L,
                                      pg_temp.lb_setup()
                                        || '{"custom_sides":"abcdefghijkl"}'::jsonb,
                                      array['ada11111-1111-1111-1111-111111111111'::uuid,
                                            'bea22222-2222-2222-2222-222222222222'::uuid],
                                      'coop',
                                      pg_temp.lb_thin_board()) $$,
    (select handle from club3)
  ),
  'a thin CUSTOM board is allowed — you chose it'
);

create temp table club4 on commit drop as
select common.create_club('LB thin rolled', array['ada', 'bea']) as handle;

select throws_ok(
  format(
    $$ select letterboxed.create_game(%L,
                                      pg_temp.lb_setup(),
                                      array['ada11111-1111-1111-1111-111111111111'::uuid,
                                            'bea22222-2222-2222-2222-222222222222'::uuid],
                                      'coop',
                                      pg_temp.lb_thin_board()) $$,
    (select handle from club4)
  ),
  'P0001',
  'too-few-playable-words|2|',
  'the same thin board is still refused when nobody typed it'
);

select * from finish();
rollback;
