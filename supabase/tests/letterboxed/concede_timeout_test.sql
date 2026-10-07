-- cs-unmet

-- ============================================================
-- Test: conceded players are OUT; timeout ranks the racers
-- ============================================================
--
-- The two rulings this file pins (the FE gates concede, and so does the
-- server):
--
--   1. A conceded player's chain is FROZEN server-side: submit_word /
--      undo_word / clear_chain all refuse, so a stale tab (or a submit
--      in flight when the concede commits) can't keep racing — or cover
--      the twelve and be crowned by submit_word's solve branch.
--   2. submit_timeout ranks NON-conceded players only (a drop-out
--      forfeits, whatever they had covered — the wordiply ruling: their
--      coverage still shows, but they can't win), and exact ties share a
--      rank: both ranked 1, and the page blob shows both as won.

begin;

set search_path = letterboxed, common, public, extensions;

select plan(11);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

-- ============================================================
-- Set up: ada + bea club, compete game, ada leads then concedes
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada and Bea', array['ada','bea']) as handle;

create temp table ga on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

-- ada covers eight of the twelve; bea only three. On coverage alone ada
-- would win the timeout — the concede below is what must undo that.
select letterboxed.submit_word((select id from ga), 'adgjbehk');

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from ga), 'adg');

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select letterboxed.concede((select id from ga));

-- ── 1. The frozen chain ─────────────────────────────────────
select pg_temp.envelope_is(
  letterboxed.submit_word((select id from ga), 'kcf'),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'a conceded player cannot submit a word'
);

select pg_temp.envelope_is(
  letterboxed.undo_word((select id from ga)),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'a conceded player cannot undo'
);

select pg_temp.envelope_is(
  letterboxed.clear_chain((select id from ga)),
  '{"type":"not-ok","severity":"race","dbcode":"PN483",
    "message":"Already conceded"}'::jsonb,
  'a conceded player cannot clear'
);

-- ── 2. Timeout crowns the racer, not the drop-out ───────────
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_timeout((select id from ga));

select is(
  (select game_ended_reason || '/' || game_ended_outcome from common.games where id = (select id from ga)),
  'timeout/won',
  'a timed-out race still resolves to a winner'
);

select is(
  (select final_ranking || '/' || outcome from common.game_players
    where game_id = (select id from ga)
      and user_id = 'bea22222-2222-2222-2222-222222222222'),
  '1/won',
  'the remaining racer wins on coverage among NON-conceded players'
);

select is(
  (select coalesce(final_ranking::text, 'unranked') || '/' || outcome from common.game_players
    where game_id = (select id from ga)
      and user_id = 'ada11111-1111-1111-1111-111111111111'),
  'unranked/lost',
  'the conceded leader does NOT win, despite the higher coverage'
);

-- ada's own count still shows her coverage (8 > bea's 3) — which is exactly
-- why a reader must go by the ranking, not by the best coverage.
select is(
  (select (p->>'nCoveredLetters') || '/' || (p->'ending'->>'reason')
     from (select pg_temp.lb_player((select id from ga), 'ada11111-1111-1111-1111-111111111111') p) x),
  '8/conceded',
  'the conceded player''s coverage still shows, beside her concession'
);

select is(
  (select pg_temp.winner_ids(summary_data) from common.games
    where id = (select id from ga)),
  '["bea22222-2222-2222-2222-222222222222"]'::jsonb,
  '…and the summary ranks the racer first, not the best coverage'
);

-- ============================================================
-- Exact ties share a rank
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table gb on commit drop as
select (letterboxed.create_game(
  (select handle from club),
  pg_temp.lb_setup(),
  array['ada11111-1111-1111-1111-111111111111'::uuid,
        'bea22222-2222-2222-2222-222222222222'::uuid],
  'compete',
  pg_temp.lb_board()
)->'data'->>'id')::uuid as id;

-- Both play the same word on their own chains: identical coverage AND
-- word count, the exact tie submit_timeout refuses to break arbitrarily.
select letterboxed.submit_word((select id from gb), 'adg');
select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select letterboxed.submit_word((select id from gb), 'adg');

select letterboxed.submit_timeout((select id from gb));

select is(
  (select game_ended_outcome from common.games where id = (select id from gb)),
  'won',
  'a tied timeout still resolves'
);

select is(
  (select count(*)::int from common.game_players
    where game_id = (select id from gb) and final_ranking = 1 and outcome = 'won'),
  2,
  'an exact tie shares the rank — every tied player is ranked 1, won'
);

select is(
  (select count(*)::int
     from jsonb_array_elements((select game_data->'players' from common.games where id = (select id from gb))) p
    where p->>'outcome' = 'won'),
  2,
  'and the page blob shows both tied racers as won'
);

select * from finish();
rollback;
