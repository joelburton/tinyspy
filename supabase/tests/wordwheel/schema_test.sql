-- ============================================================
-- Test: wordwheel baseline schema invariants
-- ============================================================
--
-- A fork of spellingbee's schema_test. The migration laid down the
-- tables, grants, helpers, and view; this file exercises the schema
-- *directly* — inserting rows as the postgres superuser (bypassing
-- the "no INSERT grant on authenticated" rule) to set up the state
-- we want to assert about.
--
-- What this file covers:
--   1. The gametype is registered in common.gametypes.
--   2. The wordwheel.pangrams reference table is readable by
--      `authenticated` (the word list itself is common.words).
--   3. The word lists are NOT hidden: required_words + bonus_words
--      are readable directly by `authenticated` (the FE validates
--      guesses against them locally; the trust model doesn't withhold).
--   4. The games_state view exposes both word lists unconditionally
--      (during play and at terminal) — the missed-words reveal is a
--      client-side `required − found` at terminal, not a server gate.
--
-- THE FORK: word wheel is 8 outer letters (char(8)) + 1 center, so the
-- direct-insert board below uses an 8-letter outer_letters string.
--
-- RLS membership / coop-vs-compete visibility lives in rls_test.sql.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(8);

\ir ../_shared/setup.psql

-- ============================================================
-- Gametype registration
-- ============================================================

select is(
  (
    select array_agg(gametype order by gametype)
      from common.gametypes where gametype like 'wordwheel%'
  ),
  array['wordwheel_compete', 'wordwheel_coop'],
  'wordwheel_coop + wordwheel_compete both registered in common.gametypes'
);

-- ============================================================
-- Public reference tables readable as authenticated
-- ============================================================
-- Reference data — public SELECT, no RLS, no club gating. The import
-- script writes them; everyone reads them. The word reference itself
-- now lives in common.words, not wordwheel — only the wordwheel-specific
-- pangram seed pool is checked here.
reset role;
insert into wordwheel.pangrams (mask, difficulty, word_counts, has_rare_letters)
values (1::bigint, 1, '[0,0,0,0,0,0]'::jsonb, false);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select count(*) from wordwheel.pangrams where mask = 1::bigint),
  1::bigint,
  'authenticated can SELECT from wordwheel.pangrams'
);

-- ============================================================
-- Set up: a wordwheel game in ada+bea's club
-- ============================================================
-- Direct insert (no RPC here). A non-terminal game we'll later flip
-- terminal to exercise the conditional-exposure case.

create temp table club on commit drop as
select common.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;

-- common.games first — the FK target.
create temp table common_g (id uuid) on commit drop;
grant select on common_g to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, title, setup, play_state, is_terminal)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_coop',
    'E·CABDFGHI',
    '{"timer": {"kind": "none"}}'::jsonb,
    'playing',
    false
  )
  returning id
)
insert into common_g (id) select id from ins;

-- The word lists. Small synthetic lists; they only need to be present
-- + retrievable. mode column locked to 'coop' to match the
-- common.games gametype above. outer_letters is char(8) now.
insert into wordwheel.games
  (id, club_handle, mode, outer_letters, center_letter,
   required_words_score, required_words_count, required_words, bonus_words)
values (
  (select id from common_g),
  (select handle from club),
  'coop',
  'cabdfghi',
  'e',
  25,
  2,
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  '[{"word":"ihgfedcba","points":24,"is_pangram":true}]'::jsonb
);

-- ============================================================
-- The word lists are readable directly (no longer hidden)
-- ============================================================
-- The grant on wordwheel.games to authenticated includes
-- required_words + bonus_words — the FE needs them to validate
-- guesses locally, and the trust model doesn't withhold them.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from wordwheel.games where id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'authenticated CAN SELECT required_words directly (un-gated)'
);

select is(
  (select bonus_words from wordwheel.games where id = (select id from common_g)),
  '[{"word":"ihgfedcba","points":24,"is_pangram":true}]'::jsonb,
  'authenticated CAN SELECT bonus_words directly (un-gated)'
);

select is(
  (select outer_letters from wordwheel.games where id = (select id from common_g)),
  'cabdfghi'::char(8),
  'authenticated CAN SELECT the non-list columns (outer_letters) too'
);

-- ============================================================
-- games_state view: exposes both lists during play
-- ============================================================
-- No terminal gate — required_words is present from game start (the
-- reveal is a client-side computation at terminal).

select is(
  (select required_words from wordwheel.games_state where id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games_state.required_words is present during play (un-gated)'
);

select is(
  (select outer_letters from wordwheel.games_state where id = (select id from common_g)),
  'cabdfghi'::char(8),
  'games_state surfaces the non-list columns too'
);

-- ============================================================
-- games_state view: still exposed at terminal
-- ============================================================
-- Flip is_terminal true; required_words stays exposed (it always was).

reset role;
update common.games set is_terminal = true, play_state = 'ended'
 where id = (select id from common_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from wordwheel.games_state where id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games_state.required_words remains exposed post-terminal'
);

-- ============================================================
select * from finish();
rollback;
