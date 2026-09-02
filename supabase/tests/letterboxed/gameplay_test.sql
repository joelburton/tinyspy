-- cs-unmet

-- ============================================================
-- Test: letterboxed.submit_word / undo_word / clear_chain
-- ============================================================
--
-- The chain rulebook. submit_word is SERVER-AUTHORITATIVE (unlike the
-- trusting-commit word games): every word is re-checked against the
-- board's playable list, the cap, the dedup and — the rule that makes
-- this game what it is — the START LETTER, which must match the last
-- letter of the chain's last word.
--
-- Coverage:
--   1. Coop happy path: a word appends, letters_covered is right, the
--      log records it, the club-page status keeps up.
--   2. The four rejections: not playable, wrong start letter, already in
--      the chain, chain full at max_words.
--   3. undo_word pops the last word and REFUNDS against the cap — the
--      property that makes the cap a shape constraint, not a budget.
--   4. clear_chain empties it and logs the fact.
--   5. Covering all twelve wins the coop game outright.
--   6. Compete moves only the actor's chain, and a rival's chain is
--      hidden through players_state while their word count is not.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(30);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea + cade club, coop game in progress
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

-- The whole envelope is kept, not just the id: `data.result` is the field both
-- call sites filter the `ok` on, and it reaches them through
-- `letterboxed-build-board` untouched.
create temp table created on commit drop as
select letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'coop',
  pg_temp.lb_board()
) as env;
create temp table g on commit drop as
select (env->'data'->>'id')::uuid as id from created;

select pg_temp.envelope_is(
  (select env from created),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'the answer names itself, so a call site has a case to assert');

-- ── 1. The board landed as specified ────────────────────────
select is(
  (select sides from letterboxed.games where id = (select id from g)),
  'abcdefghijkl'::bpchar,
  'create_game stores the twelve letters in side order'
);

select is(
  (select max_words from letterboxed.games where id = (select id from g)),
  5,
  'max_words comes from setup, not from a derived par'
);

select is(
  (select count(*)::int from letterboxed.players where game_id = (select id from g)),
  2,
  'a players row per participant'
);

select ok(
  (select chain = '{}' from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'the chain starts empty'
);

-- ── 2. A word appends ───────────────────────────────────────
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'adg'),
  '{"type":"ok","outcome":"won","data":{"result":"accepted",
    "accepted":true,"letters_covered":3,"solved":false}}'::jsonb,
  'submit_word reports the letters the chain now covers'
);

select is(
  (select chain from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['adg'],
  'the word is on the chain'
);

select ok(
  (select chain = array['adg'] from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  'COOP MOVES EVERY ROW IN LOCK-STEP — bea has ada''s word too'
);

select is(
  (select kind || ':' || word || ':' || letters_covered::text
     from letterboxed.events where game_id = (select id from g)),
  'played:adg:3',
  'the move is logged with its coverage'
);

select is(
  (select status->>'letters_covered' from common.games where id = (select id from g)),
  '3',
  '_sync_status mirrors coverage onto the club-page label'
);

-- ── 3. The rejections ───────────────────────────────────────
-- A FAULT: the board and the dictionary are fixed, and the frontend holds
-- `playable_words` and checks against it first, so a word this board cannot
-- play did not come from our board.
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'zzz'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN403",
    "message":"BUG: a word this board cannot play"}'::jsonb,
  'a word outside playable_words is refused'
);

-- A RACE, where the two above are faults: coop's chain is SHARED and
-- free-for-all, so a teammate's word can change the tail between the
-- frontend's own check and this call. The words are `rejectReason`'s, verbatim.
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'ila'),
  '{"type":"not-ok","severity":"race","dbcode":"PN400",
    "message":"Must start with G"}'::jsonb,
  'THE CHAIN RULE: the next word must start with the tail letter'
);

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'ad'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN399",
    "message":"BUG: a word under three letters"}'::jsonb,
  'two letters is below the floor'
);

-- 'gjb' legally follows 'adg'; replaying 'adg' does not.
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'gjb'),
  '{"type":"ok","data":{"result":"accepted","solved":false}}'::jsonb,
  'a word starting with the tail letter is accepted'
);

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'gjb'),
  '{"type":"not-ok","severity":"race","dbcode":"PN402",
    "message":"Already played"}'::jsonb,
  'a repeat is a no-op loop and is refused'
);

-- ── 4. undo refunds ─────────────────────────────────────────
select letterboxed.undo_word((select id from g));

select is(
  (select chain from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  array['adg'],
  'undo_word pops the last word'
);

select is(
  (select kind || ':' || word from letterboxed.events
    where game_id = (select id from g) order by id desc limit 1),
  'undone:gjb',
  'the retreat is logged rather than deleting the played row'
);

-- ── 5. clear_chain ──────────────────────────────────────────
select letterboxed.clear_chain((select id from g));

select ok(
  (select chain = '{}' from letterboxed.players_state
    where game_id = (select id from g)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'clear_chain empties the chain'
);

select is(
  (select kind || ':' || coalesce(word, '(none)') from letterboxed.events
    where game_id = (select id from g) order by id desc limit 1),
  'cleared:(none)',
  'a clear logs no word — it is about the whole chain'
);

-- ── 6. Covering all twelve wins it ──────────────────────────
select letterboxed.submit_word((select id from g), 'adgjbehk');

select is(
  (letterboxed.submit_word((select id from g), 'kcfil'))->'data'->>'solved',
  'true',
  'covering all twelve letters solves the board'
);

select is(
  (select play_state from common.games where id = (select id from g)),
  'won',
  'coop reaching twelve is a win for the table'
);

select ok(
  (select is_terminal from common.games where id = (select id from g)),
  'and the game is terminal'
);

-- REGRESSION: common.games.status MERGES on a terminal write, so a win blob
-- that omits letters_covered leaves the PREVIOUS move's count showing under
-- it. A live game shipped 'letters_covered: 7' on a fully covered board.
select is(
  (select status->>'letters_covered' from common.games where id = (select id from g)),
  '12',
  'the terminal restates coverage rather than inheriting the last move''s'
);

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'adg'),
  '{"type":"not-ok","severity":"race","dbcode":"PN397",
    "message":"Game over"}'::jsonb,
  'no further moves once it is over'
);

-- ============================================================
-- Compete: chains are private, word counts are not
-- ============================================================

create temp table gc on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

select letterboxed.submit_word((select id from gc), 'adg');

select is(
  (select word_count from letterboxed.players_state
    where game_id = (select id from gc)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  0,
  'COMPETE MOVES ONLY THE ACTOR''S ROW — bea''s chain is untouched'
);

-- Now look at ada's row as bea: the count shows, the words do not.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (select word_count from letterboxed.players_state
    where game_id = (select id from gc)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  1,
  'a rival''s WORD COUNT is public — the one number the race publishes'
);

select is(
  (select chain from letterboxed.players_state
    where game_id = (select id from gc)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  null,
  'but a rival''s CHAIN is hidden mid-race'
);

-- ============================================================
-- The cap: chain full at max_words
-- ============================================================
-- A cap-of-two game (extra_words 0 → par exactly), so the cap is
-- reachable without covering the board: two short words hit it with
-- seven letters still missing.

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');

create temp table gt on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup() || jsonb_build_object('extra_words', 0),
  array['ada11111-1111-1111-1111-111111111111'::uuid],
  'coop',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

select letterboxed.submit_word((select id from gt), 'adg');
select letterboxed.submit_word((select id from gt), 'gjb');

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from gt), 'beh'),
  '{"type":"not-ok","severity":"race","dbcode":"PN401",
    "message":"Chain is full"}'::jsonb,
  'a full chain refuses a further word'
);

-- The refund property AT the cap: taking a word back reopens the slot —
-- and an undone word is no longer "already in the chain", so it may return.
-- Undo NAMES the word it popped, which is the fact that makes the next line
-- meaningful rather than coincidental.
select pg_temp.envelope_is(
  letterboxed.undo_word((select id from gt)),
  '{"type":"ok","outcome":"neutral","data":{"result":"undone","word":"gjb"}}'::jsonb,
  'undo answers with the word it took back'
);
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from gt), 'gjb'),
  '{"type":"ok","data":{"result":"accepted"}}'::jsonb,
  'undo refunds against the cap — the slot reopens'
);

select * from finish();
rollback;
