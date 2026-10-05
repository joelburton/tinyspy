-- cs-unmet

-- ============================================================
-- Test: letterboxed.submit_word / undo_word / clear_chain
-- ============================================================
--
-- The chain rulebook. submit_word is SERVER-AUTHORITATIVE (unlike the
-- trusting-commit word games): every word is re-checked against the
-- board's legal words, the cap, the dedup and — the rule that makes
-- this game what it is — the START LETTER, which must match the last
-- letter of the chain's last word.
--
-- Coverage:
--   1. Coop happy path: a word appends, its coverage is right, the
--      log records it, the page blob keeps up.
--   2. The four rejections: not playable, wrong start letter, already in
--      the chain, chain full at max_words.
--   3. undo_word pops the last word and REFUNDS against the cap — the
--      property that makes the cap a shape constraint, not a budget.
--   4. clear_chain empties it and logs the fact.
--   5. Covering all twelve wins the coop game outright.
--   6. Compete moves only the actor's chain; the page blob carries a
--      rival's count and chain alike, and withholding the chain mid-race
--      is the hook's rule.
--   7. Each of the four moves, into a game a friend just deleted, is the
--      shared race (PN485).

begin;

set search_path = letterboxed, common, public, extensions;

select plan(37);

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
  (select sides from letterboxed.games where game_id = (select id from g)),
  'abcdefghijkl'::bpchar,
  'create_game stores the twelve letters in side order'
);

select is(
  (select max_words from letterboxed.games where game_id = (select id from g)),
  5,
  'max_words comes from setup, not from a derived par'
);

select is(
  (select count(*)::int from letterboxed.players where game_id = (select id from g)),
  2,
  'a players row per participant'
);

select ok(
  pg_temp.lb_chain((select id from g), 'ada11111-1111-1111-1111-111111111111') = '{}',
  'the chain starts empty'
);

-- ── 2. A word appends ───────────────────────────────────────
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'adg'),
  '{"type":"ok","outcome":null,"message":null,"data":{"result":"accepted"}}'::jsonb,
  'submit_word answers that the word landed, with no outcome and no sentence'
);
-- How it reads is the frontend's: src/letterboxed/lib/answer.test.ts pins the
-- outcome and the words, and this pins that the envelope says neither.

select is(
  pg_temp.lb_chain((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  array['adg'],
  'the word is on the chain'
);

select ok(
  pg_temp.lb_chain((select id from g), 'bea22222-2222-2222-2222-222222222222') = array['adg'],
  'COOP MOVES EVERY ROW IN LOCK-STEP — bea has ada''s word too'
);

select is(
  (select kind || ':' || word || ':' || n_covered_letters::text
     from letterboxed.events where game_id = (select id from g)),
  'word:adg:3',
  'the move is logged with its coverage'
);

select is(
  (select game_data->'team'->>'nCoveredLetters' from common.games where id = (select id from g)),
  '3',
  'the builder writes the team''s coverage into the page blob'
);

-- ── 3. The rejections ───────────────────────────────────────
-- A FAULT: the board and the dictionary are fixed, and the frontend holds
-- the board's `words` and checks against them first, so a word this board cannot
-- play did not come from our board.
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'zzz'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN403",
    "message":"BUG: a word this board cannot play"}'::jsonb,
  'a word outside the board''s words is refused'
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
  '{"type":"ok","data":{"result":"accepted"}}'::jsonb,
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
  pg_temp.lb_chain((select id from g), 'ada11111-1111-1111-1111-111111111111'),
  array['adg'],
  'undo_word pops the last word'
);

select is(
  (select kind || ':' || word from letterboxed.events
    where game_id = (select id from g) order by id desc limit 1),
  'undo:gjb',
  'the retreat is logged rather than deleting the played row'
);

-- ── 5. clear_chain ──────────────────────────────────────────
-- No outcome, for the same reason as submit_word's.
select pg_temp.envelope_is(
  letterboxed.clear_chain((select id from g)),
  '{"type":"ok","outcome":null,"message":null,"data":{"result":"cleared"}}'::jsonb,
  'a clear answers its result alone'
);

select ok(
  pg_temp.lb_chain((select id from g), 'ada11111-1111-1111-1111-111111111111') = '{}',
  'clear_chain empties the chain'
);

select is(
  (select kind || ':' || coalesce(word, '(none)') from letterboxed.events
    where game_id = (select id from g) order by id desc limit 1),
  'clear:(none)',
  'a clear logs no word — it is about the whole chain'
);

-- Every move spends a go and neither rung does: the word, the undo (which is
-- what stops it being a free reroll) and the clear are turns; a hint and a
-- spoiler are asks.
select is(
  (select array_agg(distinct kind order by kind) from letterboxed.events
    where game_id = (select id from g) and took_turn),
  array['clear', 'undo', 'word'],
  'took_turn is the three moves, and only those'
);

-- ── 6. Covering all twelve wins it ──────────────────────────
select letterboxed.submit_word((select id from g), 'adgjbehk');

-- Captured once and asserted twice: the SOLVING word's answer is its result
-- alone — what the word did, the page reads from the blobs — with no outcome.
create temp table solve_res on commit drop as
select letterboxed.submit_word((select id from g), 'kcfil') as res;
select is((select res->'data' from solve_res), '{"result": "solved"}'::jsonb,
  'covering all twelve letters answers solved, and nothing more');
select is((select res->'outcome' from solve_res), 'null'::jsonb,
  'the solving word carries no outcome, like every accepted word');

select is(
  (select game_ended_reason || '/' || game_ended_reason_detail || '/' || game_ended_outcome
     from common.games where id = (select id from g)),
  'reached_goal/solved/won',
  'coop reaching twelve is a win for the table'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from g) and final_ranking = 1 and outcome = 'won'
      and solved_at is not null),
  2,
  'and every teammate is ranked 1, won, and solved'
);

-- The builder runs after the ending, from the chain, so the blob shows the
-- full twelve rather than the previous move's count.
select is(
  (select game_data->'team'->>'nCoveredLetters' from common.games where id = (select id from g)),
  '12',
  'the ending restates coverage rather than inheriting the last move''s'
);

select pg_temp.envelope_is(
  letterboxed.submit_word((select id from g), 'adg'),
  '{"type":"not-ok","severity":"race","dbcode":"PN486",
    "message":"Game over"}'::jsonb,
  'no further moves once it is over'
);

-- ============================================================
-- Compete: each racer's chain is their own
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
  (pg_temp.lb_player((select id from gc), 'bea22222-2222-2222-2222-222222222222') ->> 'nWordsUsed')::int,
  0,
  'COMPETE MOVES ONLY THE ACTOR''S ROW — bea''s chain is untouched'
);

-- Now look at ada's row as bea: the blob carries both her count and her words.
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');

select is(
  (pg_temp.lb_player((select id from gc), 'ada11111-1111-1111-1111-111111111111') ->> 'nWordsUsed')::int,
  1,
  'a rival''s WORD COUNT is in the blob — the number the race publishes'
);

select is(
  pg_temp.lb_chain((select id from gc), 'ada11111-1111-1111-1111-111111111111'),
  array['adg'],
  'and so is a rival''s CHAIN: withholding it mid-race is the hook''s rule'
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
--
-- No outcome, for the same reason as submit_word's.
select pg_temp.envelope_is(
  letterboxed.undo_word((select id from gt)),
  '{"type":"ok","outcome":null,"message":null,"data":{"result":"undone"}}'::jsonb,
  'undo answers that the word came off, with no outcome'
);
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from gt), 'gjb'),
  '{"type":"ok","data":{"result":"accepted"}}'::jsonb,
  'undo refunds against the cap — the slot reopens'
);

-- ============================================================
-- (7) The four moves, into a game a friend just deleted
-- ============================================================
-- The delete takes the game's rows and every membership together, so each is
-- answered by the shared race rather than by a fault, or by "You are not in
-- this game" (docs/envelopes.md → a missing game row is PN485).

reset role;
delete from common.games where id = (select id from gt);
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from gt), 'beh'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'submit_word into a deleted game is the shared race, not a fault'
);
select pg_temp.envelope_is(
  letterboxed.undo_word((select id from gt)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'undo_word into a deleted game is the shared race, not a fault'
);
select pg_temp.envelope_is(
  letterboxed.clear_chain((select id from gt)),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'clear_chain into a deleted game is the shared race, not a fault'
);
select pg_temp.envelope_is(
  letterboxed.log_hint_or_spoiler((select id from gt), 'beh', 'hint'),
  '{"type":"not-ok","severity":"race","outcome":"lost","dbcode":"PN485",
    "message":"That game was already deleted"}'::jsonb,
  'log_hint_or_spoiler into a deleted game is the shared race, not a fault'
);

select * from finish();
rollback;
