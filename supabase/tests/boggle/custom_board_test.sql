-- ============================================================
-- Test: boggle.create_game — a custom (player-typed) board
-- ============================================================
--
-- The optional custom-board path: setup carries `custom_board`, the tiles the
-- player typed into the dialog ("ABQuD EFGH IJKL MNOP" — see
-- src/boggle/lib/customBoard.ts). The edge function solves exactly that board
-- instead of rolling one. What this file pins in the RPC:
--   1. A custom board is accepted and stored like any other.
--   2. The one-off `custom_board` is STRIPPED from the club's saved default
--      (clubs_gametypes.default_setup) — the next game rolls again — while the
--      rest of the setup (timer, dice set) is preserved.
--   3. A custom board with ZERO required words is rejected: `win_percent` is a
--      share of the required-words score, so a board with none would put the
--      threshold at 0 and hand the win to the first bonus word.
--   4. A ROLLED board (no custom_board) with zero required words is NOT
--      rejected here — the roll loop's constraints are the player's to set,
--      including none, so the floor is deliberately custom-only.
--
-- See ./create_game_test.sql for the base board/setup fixtures.

begin;

set search_path = boggle, common, public, extensions;

select plan(6);

\ir ../_shared/setup.psql
\ir setup.psql

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select common.create_club('Custom Board', array['ada','bea']) as handle;

-- A custom setup = the default coop setup + the typed board. The string is the
-- WRITTEN form (what the recap prints and the dialog takes back); the RPC only
-- cares that it's non-empty, since the edge function did the parsing.
create temp table cset on commit drop as
select pg_temp.boggle_setup()
       || jsonb_build_object('custom_board', 'CATR SEXO TMPL NGDB') as s;

-- ── (1) A custom board is accepted ──────────────────────────
create temp table g on commit drop as
select * from boggle.create_game(
  (select handle from club),
  (select s from cset),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.boggle_board()
);
select isnt((select id from g), null, 'a custom board is accepted');
select is(
  (select board from boggle.games where id = (select id from g)),
  'CATRSEXOTMPLNGDB', 'the custom board is stored as the game''s board');

-- ── (2) Saved default strips the one-off board ──────────────
select is(
  (select default_setup ? 'custom_board'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'boggle_coop'),
  false, 'saved default drops custom_board (the next game rolls)');
select is(
  (select default_setup ->> 'dice_set'
     from common.clubs_gametypes
    where club_handle = (select handle from club) and gametype = 'boggle_coop'),
  '4', 'saved default still keeps the rest of the setup (dice set)');

-- ── (3) A custom board with ZERO required words is rejected ─
select throws_ok(
  format(
    $$ select boggle.create_game(%L,
                                 pg_temp.boggle_setup()
                                   || '{"custom_board":"CATR SEXO TMPL NGDB"}'::jsonb,
                                 array['ada11111-1111-1111-1111-111111111111'::uuid,
                                       'bea22222-2222-2222-2222-222222222222'::uuid],
                                 'coop',
                                 pg_temp.boggle_board()
                                   || '{"required_words":[],"required_words_count":0,
                                        "required_words_score":0}'::jsonb) $$,
    (select handle from club)
  ),
  'P0001', NULL,
  'a custom board with ZERO required words is rejected (win_percent floor)');

-- ── (4) The floor is custom-only — a rolled board is untouched ─
select isnt(
  (select id from boggle.create_game(
     (select handle from club),
     pg_temp.boggle_setup(),
     array['ada11111-1111-1111-1111-111111111111'::uuid,
           'bea22222-2222-2222-2222-222222222222'::uuid],
     'coop',
     pg_temp.boggle_board()
       || '{"required_words":[],"required_words_count":0,
            "required_words_score":0}'::jsonb)),
  null, 'a ROLLED board with no required words is still accepted (floor is custom-only)');

select * from finish();
rollback;
