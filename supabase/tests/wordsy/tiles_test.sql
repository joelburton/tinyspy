-- cs-unmet

-- ============================================================
-- Test: the cards — wordsy._tile_letter, _tile_bonus, _slot_value
-- ============================================================
-- A card is its deck number, and the number says its letter and its bonus.
-- This pins all 60 against the rulebook's deck:
--   1. 44 common cards: B C D G L M N P R S T, four each, no bonus
--   2. 12 red cards: F H K V W Y, two each, +1
--   3. 4 blue cards: J Q X Z, one each, +2
--   4. no vowel anywhere, and the order the numbers run in
--   5. the slots' values, 5 5 4 4 3 3 2 2
-- The frontend's `lib/tiles.test.ts` pins the TypeScript half to the same list.
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir setup.psql

create temp table deck on commit drop as
select n::smallint as id, wordsy._tile_letter(n::smallint) as letter,
       wordsy._tile_bonus(n::smallint) as bonus
  from generate_series(1, 60) n;

select is(
  (select string_agg(letter || ':' || count, ' ' order by letter)
     from (select letter, count(*) from deck where bonus = 0 group by letter) c),
  'b:4 c:4 d:4 g:4 l:4 m:4 n:4 p:4 r:4 s:4 t:4',
  'the common cards: eleven letters, four each, no bonus'
);

select is(
  (select string_agg(letter || ':' || count, ' ' order by letter)
     from (select letter, count(*) from deck where bonus = 1 group by letter) c),
  'f:2 h:2 k:2 v:2 w:2 y:2',
  'the red cards: six letters, two each, +1'
);

select is(
  (select string_agg(letter || ':' || count, ' ' order by letter)
     from (select letter, count(*) from deck where bonus = 2 group by letter) c),
  'j:1 q:1 x:1 z:1',
  'the blue cards: four letters, one each, +2'
);

select is(
  (select count(*)::int from deck where letter ~ '[aeiou]' or letter is null),
  0,
  'no vowels, and every number has a letter'
);

select is(
  (select string_agg(letter, '' order by id) from deck),
  'bbbbccccddddggggllllmmmmnnnnpppprrrrssssttttffhhkkvvwwyyjqxz',
  'the numbers run B…T, then F…Y, then J Q X Z'
);

select is(
  array(select wordsy._slot_value(s) from generate_series(1, 8) s),
  array[5, 5, 4, 4, 3, 3, 2, 2],
  'slots 1–8 are worth their columns: 5 5 4 4 3 3 2 2'
);

select is(
  (select count(*)::int from deck where id between 1 and 60),
  60,
  'sixty cards'
);

select * from finish();
rollback;
