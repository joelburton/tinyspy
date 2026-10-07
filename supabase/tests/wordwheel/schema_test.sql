-- cs-blessed-wordwheel

-- ============================================================
-- Test: wordwheel baseline schema invariants
-- ============================================================
--
-- A fork of spellingbee's schema_test. The migration laid down the
-- tables, and supabase/sql/wordwheel.sql the grants, helpers and view;
-- this file exercises the schema *directly* — inserting rows as the
-- postgres superuser (bypassing the "no INSERT grant on authenticated"
-- rule) to set up the state we want to assert about.
--
-- What this file covers:
--   1. The gametype is registered in common.gametypes.
--   2. The wordwheel.pangrams reference table is readable by
--      `authenticated` (the word list itself is common.words).
--   3. The word lists are NOT hidden: required_words + bonus_words
--      are readable directly by `authenticated` (the FE validates
--      guesses against them locally; the trust model doesn't withhold).
--   4. The games row exposes both word lists unconditionally
--      (during play and after the end) — the missed-words reveal is a
--      client-side `required − found` at the end, not a server gate.
--
-- THE FORK: word wheel is 8 outer letters (char(8)) + 1 center, so the
-- direct-insert board below uses an 8-letter outer_letters string.
--
-- RLS membership / coop-vs-compete visibility lives in rls_test.sql.

begin;

set search_path = wordwheel, common, public, extensions;

select plan(9);

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
-- Reference data — a public SELECT grant, RLS on with a permissive policy,
-- no club gating. The import script writes them; everyone reads them. The
-- word reference itself is common.words, not wordwheel's — only the
-- wordwheel-specific pangram seed pool is checked here.
reset role;
-- A duplicate-letter multiset seed ('a' ×3) — `letters` is the PK; `mask` is
-- GENERATED from it (the distinct-letter set), so it isn't in the column list.
insert into wordwheel.pangrams (letters, band, word_counts, has_rare_letters)
values ('aaabcdefg', 1, '[0,0,0,0,0,0]'::jsonb, false);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select count(*) from wordwheel.pangrams where letters = 'aaabcdefg'),
  1::bigint,
  'authenticated can SELECT from wordwheel.pangrams'
);

-- The generated mask is the distinct-letter set of `letters` — the educational
-- guard on the generated column: it must agree with the same helper that
-- powers common.words.letter_mask.
select is(
  (select mask from wordwheel.pangrams where letters = 'aaabcdefg'),
  common.word_letter_mask('abcdefg'),
  'pangrams.mask is generated as the distinct-letter set of letters'
);

-- ============================================================
-- Set up: a wordwheel game in ada+bea's club
-- ============================================================
-- Direct insert (no RPC here). A game in play that is ended partway
-- through, to show the word lists stay exposed either side of the end.

create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

reset role;

-- common.games first — the FK target.
create temp table common_g (id uuid) on commit drop;
grant select on common_g to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordwheel_coop',
    'coop',
    'E·CABDFGHI',
    '{"timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into common_g (id) select id from ins;

-- The word lists. Small synthetic lists; they only need to be present
-- + retrievable. The bands are the create_game defaults. outer_letters
-- is char(8).
insert into wordwheel.games
  (game_id, outer_letters, center_letter,
   reqd_words_score, n_reqd_words, required_words, bonus_words,
   required_band, legal_band)
values (
  (select id from common_g),
  'cabdfghi',
  'e',
  25,
  2,
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  '[{"word":"ihgfedcba","points":24,"is_pangram":true}]'::jsonb,
  3,
  5
);

-- ============================================================
-- The word lists are readable directly (nothing hidden)
-- ============================================================
-- The grant on wordwheel.games to authenticated includes
-- required_words + bonus_words — the FE needs them to validate
-- guesses locally, and the trust model doesn't withhold them.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from wordwheel.games where game_id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'authenticated CAN SELECT required_words directly (un-gated)'
);

select is(
  (select bonus_words from wordwheel.games where game_id = (select id from common_g)),
  '[{"word":"ihgfedcba","points":24,"is_pangram":true}]'::jsonb,
  'authenticated CAN SELECT bonus_words directly (un-gated)'
);

select is(
  (select outer_letters from wordwheel.games where game_id = (select id from common_g)),
  'cabdfghi'::char(8),
  'authenticated CAN SELECT the non-list columns (outer_letters) too'
);

-- ============================================================
-- the games row: both lists exposed during play
-- ============================================================
-- No end-of-game gate — required_words is present from game start (the
-- reveal is a client-side computation at the end).

select is(
  (select required_words from wordwheel.games where game_id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games.required_words is present during play (un-gated)'
);

select is(
  (select outer_letters from wordwheel.games where game_id = (select id from common_g)),
  'cabdfghi'::char(8),
  'games surfaces the non-list columns too'
);

-- ============================================================
-- the games row: still exposed once ended
-- ============================================================
-- End the game; required_words stays exposed — the ending changes
-- nothing about what the row returns.

reset role;
update common.games
   set ended_at = now(), game_ended_reason = 'stopped',
       game_ended_reason_detail = 'stopped', game_ended_outcome = 'neutral'
 where id = (select id from common_g);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

select is(
  (select required_words from wordwheel.games where game_id = (select id from common_g)),
  '[{"word":"abcdefghi","points":24,"is_pangram":true},
    {"word":"bead","points":1,"is_pangram":false}]'::jsonb,
  'games.required_words remains exposed once the game has ended'
);

-- Realtime publication membership for wordwheel.games + found_words is
-- guarded centrally in ../common/realtime_publication_test.sql (the
-- registry-driven guard for every schema's subscribed tables).

select * from finish();
rollback;
