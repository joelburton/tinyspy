-- cs-unmet

-- ============================================================
-- Test: wordsy._score_word — a word against a table
-- ============================================================
-- The rulebook's examples, against the planted table (setup.psql):
--
--   slot   1    2    3    4    5    6    7    8
--   card   F    B    C    D    L    C    Q    R
--   worth  6    5    4    4    3    3    4    2
--
--   1. a letter scores its card's column value
--   2. a red card adds +1, a blue +2
--   3. two Bs against one B card score one B
--   4. one C against two C cards scores the better C; two Cs score both
--   5. a letter with no card scores nothing; a word of them scores 0
--   6. '' scores 0
-- The frontend's `scoreWord` test pins the TypeScript half to the same list.
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql
\ir setup.psql

create function pg_temp.score(w text) returns int language sql as $$
  select wordsy._score_word(w, pg_temp.ws_table())
$$;

select is(pg_temp.score('dr'), 6, 'D in the 4 column and R in the 2 column: 4 + 2');
select is(pg_temp.score('elf'), 9, 'F is red: 5 + 1, and L 3');
select is(pg_temp.score('quell'), 7, 'Q is blue: 2 + 2, and one L card for two Ls: 3');
select is(pg_temp.score('bob'), 5, 'two Bs against one B card score one B');
select is(pg_temp.score('cab'), 9, 'one C against two C cards scores the better, 4, and B 5');
select is(pg_temp.score('accept'), 7, 'two Cs against two C cards score both: 4 + 3');
select is(pg_temp.score('ghost'), 0, 'letters with no card score nothing');
select is(pg_temp.score('aeiou'), 0, 'vowels are never cards');
select is(pg_temp.score(''), 0, 'no word scores 0');

select * from finish();
rollback;
