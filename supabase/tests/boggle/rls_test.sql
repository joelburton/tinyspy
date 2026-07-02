-- ============================================================
-- Test: boggle RLS (found-word visibility + game read)
-- ============================================================
-- The load-bearing rule for compete: you see only your own finds mid-game; a
-- coop team sees everything; everyone sees everything once the game ends;
-- outsiders see nothing. Reads run under `as_user` so RLS actually applies
-- (the superuser bypasses it).

begin;
set search_path = boggle, common, public, extensions;
select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Boggle Club', array['ada', 'bea', 'cade']) as handle;

-- ── Coop: everyone in the club sees every find ────────────
create temp table g on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid,
        'cade3333-3333-3333-3333-333333333333'::uuid],
  'coop', pg_temp.boggle_board());
select boggle.submit_word((select id from g), 'cat', 1, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word((select id from g), 'car', 1, false);

select pg_temp.as_user('cade3333-3333-3333-3333-333333333333');
select is((select count(*) from boggle.found_words where game_id = (select id from g)),
  2::bigint, 'coop: a club member sees all finds');

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is((select count(*) from boggle.found_words where game_id = (select id from g)),
  0::bigint, 'outsider sees no finds');
select is((select count(*) from boggle.games where id = (select id from g)),
  0::bigint, 'outsider cannot read the game row');

-- ── Compete: own-only mid-game, all at terminal ───────────
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table cg on commit drop as
select * from boggle.create_game(
  (select handle from club), pg_temp.boggle_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete', pg_temp.boggle_board());
select boggle.submit_word((select id from cg), 'cat', 1, false);
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select boggle.submit_word((select id from cg), 'car', 1, false);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is((select count(*) from boggle.found_words where game_id = (select id from cg)),
  1::bigint, 'compete mid-game: ada sees only her own find');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is((select count(*) from boggle.found_words where game_id = (select id from cg)),
  1::bigint, 'compete mid-game: bea sees only her own find');

-- End the game; now everyone sees everything.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select boggle.end_game((select id from cg));
select is((select count(*) from boggle.found_words where game_id = (select id from cg)),
  2::bigint, 'compete post-terminal: ada sees all finds (the reveal)');

select * from finish();
rollback;
