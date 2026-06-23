-- ============================================================
-- Test: wordle.compute_colors — the Wordle coloring algorithm
-- ============================================================
-- Pure function (no auth). Verifies greens, yellows, grays, and the
-- standard duplicate-letter accounting (a yellow only when there's an
-- unconsumed answer copy after greens are removed).

begin;
set search_path = wordle, common, public, extensions;
\ir ../_shared/setup.psql

select plan(7);

select is(wordle.compute_colors('crate', 'crate'), 'ggggg',
  'exact match → all green');

select is(wordle.compute_colors('crane', 'crate'), 'gggxg',
  'one wrong letter → gray in place');

-- 'speed' vs 'erase' (e,r,a,s,e): no greens; s,e,e are present.
select is(wordle.compute_colors('speed', 'erase'), 'yxyyx',
  'yellows pulled from the leftover pool, gray where absent');

-- 'allee' vs 'apple' (a,p,p,l,e): a green, e green; first l yellow
-- (one l in answer), second l gray (pool exhausted), the middle e gray
-- (its only answer-e was claimed by the green).
select is(wordle.compute_colors('allee', 'apple'), 'gyxxg',
  'duplicate letters: only as many yellows as the answer has copies');

-- A guessed letter not in the answer at all.
select is(wordle.compute_colors('zzzzz', 'crate'), 'xxxxx',
  'no shared letters → all gray');

-- Greens claim their answer letter before yellows are assigned: 'three'
-- has two e's; the green at the last position claims one, leaving one
-- yellow for the guess's leading e (the next e is gray).
select is(wordle.compute_colors('eerie', 'three'), 'yxgxg',
  'greens consume their answer letter first');

-- Case-insensitive (both lowered internally).
select is(wordle.compute_colors('CRATE', 'crate'), 'ggggg',
  'compute_colors lowercases its inputs');

select * from finish();
rollback;
