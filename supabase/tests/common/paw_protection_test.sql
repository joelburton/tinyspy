-- cs-unmet

-- ============================================================
-- Test: paw protection — a club's daily cap per gametype
-- ============================================================
--
-- Coverage (docs/common-schema.md → Paw protection):
--   1. The cap is met in `_create_game`: the first starts land, the one
--      past the cap is a fault (PN514), and `clubs_gametypes_today`'s
--      `used_today` counts them.
--   2. The count is a COUNTER: deleting a game refunds nothing, and a
--      Restart creates no row, so it counts nothing.
--   3. A new UTC day zeroes the counter; a cap of 0 refuses every start;
--      a null cap is no limit.
--   4. A gametype the club does not list is refused (PN513), listed or
--      missing alike.
--   5. The edit gate: `clubs.can_edit_settings` off makes
--      `set_club_gametypes` a fault (PN515) and `get_club_page` says so.
--   6. `set_club_gametypes`'s own refusals: a cap that is not a whole
--      number ≥ 0 is a form validation naming the dialog's control
--      (PN517); a gametype the registry lacks is a fault (PN516).
--   7. RLS: the view shows a club's rows to a member and to nobody else.
--
-- psychicnum is the game started throughout — the canary every shared
-- shape is settled on first. See `codenamesduet/create_game_test.sql`
-- for the pgTAP / auth-simulation primer.

begin;

set search_path = common, public, extensions;

select plan(27);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql

-- Cast: ada + bea are the club. The fixture's club lists every gametype.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Paw', array['ada','bea']) as handle;

-- Start a psychicnum game in the club, as whoever the session is, with a
-- complete valid setup. The envelope comes back whole, so a test can assert
-- the start or the refusal.
create function pg_temp.start_game(p_mode text) returns jsonb
language sql
as $$
  select psychicnum.create_game(
    (select handle from club),
    '{"max_guesses": 7, "word_count": 10, "band": 3, "timer": {"kind": "none"}}'::jsonb,
    array['ada11111-1111-1111-1111-111111111111'::uuid, 'bea22222-2222-2222-2222-222222222222'::uuid],
    p_mode);
$$;

-- Today's count for a gametype, off the view — what the frontend reads.
create function pg_temp.used_today(p_gametype text) returns int
language sql
as $$
  select used_today from common.clubs_gametypes_today
   where club_handle = (select handle from club) and gametype = p_gametype;
$$;

-- ============================================================
-- (1) The cap is met
-- ============================================================

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_coop", "max_daily_games": 2}]'::jsonb),
  '{"type": "ok", "data": {"result": "saved"}}'::jsonb,
  'a cap of 2 on psychicnum_coop is saved');

create temp table first_game on commit drop as
select pg_temp.start_game('coop') as env;

select pg_temp.envelope_is(
  (select env from first_game),
  '{"type": "ok", "data": {"result": "created"}}'::jsonb,
  'the first start of the day lands');

create temp table second_game on commit drop as
select pg_temp.start_game('coop') as env;

select pg_temp.envelope_is(
  (select env from second_game),
  '{"type": "ok", "data": {"result": "created"}}'::jsonb,
  'the second lands — the cap is 2');

select is(pg_temp.used_today('psychicnum_coop'), 2,
  'the view counts the two starts as used_today');

select pg_temp.envelope_is(
  pg_temp.start_game('coop'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN514"}'::jsonb,
  'the third is refused as a fault: the frontend asks before it starts');

-- A refused start wrote nothing: no third game, no third count.
select is(
  (select count(*) from common.games
    where club_handle = (select handle from club) and gametype = 'psychicnum_coop'),
  2::bigint,
  'the refused start inserted no game');

select is(pg_temp.used_today('psychicnum_coop'), 2,
  'the refused start counted nothing');

-- ============================================================
-- (2) A counter, not a count
-- ============================================================

select pg_temp.envelope_is(
  common.delete_game(((select env from first_game) -> 'data' ->> 'id')::uuid),
  '{"type": "ok"}'::jsonb,
  'the first game is deleted');

select is(pg_temp.used_today('psychicnum_coop'), 2,
  'deleting a game refunds nothing');

select pg_temp.envelope_is(
  pg_temp.start_game('coop'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN514"}'::jsonb,
  'and a start after the delete is still refused');

-- The surviving game, restarted: no row is created, so nothing is counted.
select pg_temp.envelope_is(
  psychicnum.replay_board(((select env from second_game) -> 'data' ->> 'id')::uuid),
  '{"type": "ok"}'::jsonb,
  'a Restart is accepted');

select is(pg_temp.used_today('psychicnum_coop'), 2,
  'a Restart counts nothing');

-- ============================================================
-- (3) A new day, a cap of zero, and no cap
-- ============================================================

-- Yesterday's counter, by hand: the view and `_create_game` both read the
-- day off `started_on`, so this is the one knob a test has.
reset role;
update common.clubs_gametypes
   set started_on = started_on - 1
 where club_handle = (select handle from club) and gametype = 'psychicnum_coop';

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(pg_temp.used_today('psychicnum_coop'), 0,
  'a counter from another day reads as zero');

select pg_temp.envelope_is(
  pg_temp.start_game('coop'),
  '{"type": "ok", "data": {"result": "created"}}'::jsonb,
  'the new day admits a start');

select is(pg_temp.used_today('psychicnum_coop'), 1,
  'which starts today''s count at one');

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_compete", "max_daily_games": 0}]'::jsonb),
  '{"type": "ok"}'::jsonb,
  'a cap of 0 on psychicnum_compete is saved');

select pg_temp.envelope_is(
  pg_temp.start_game('compete'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN514"}'::jsonb,
  'a cap of 0 refuses every start — listed, never startable');

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_coop", "max_daily_games": null}]'::jsonb),
  '{"type": "ok"}'::jsonb,
  'the cap on psychicnum_coop is cleared');

select pg_temp.envelope_is(
  pg_temp.start_game('coop'),
  '{"type": "ok", "data": {"result": "created"}}'::jsonb,
  'no cap is no limit: a start past the old cap lands');

-- ============================================================
-- (4) A gametype the club does not list
-- ============================================================

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_coop", "is_enabled": false}]'::jsonb),
  '{"type": "ok"}'::jsonb,
  'psychicnum_coop is unlisted');

select pg_temp.envelope_is(
  pg_temp.start_game('coop'),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN513"}'::jsonb,
  'an unlisted gametype cannot be started: the server says what the club page shows');

-- ============================================================
-- (5) The edit gate
-- ============================================================

reset role;
update common.clubs set can_edit_settings = false where handle = (select handle from club);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "psychicnum_coop", "is_enabled": true}]'::jsonb),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN515"}'::jsonb,
  'with can_edit_settings off, the editor refuses as a fault — its action is hidden');

select is(
  (common.get_club_page((select handle from club)) -> 'data' -> 'club' ->> 'can_edit_settings')::boolean,
  false,
  'get_club_page carries the gate, so the page can hide the action');

reset role;
update common.clubs set can_edit_settings = true where handle = (select handle from club);

-- ============================================================
-- (6) set_club_gametypes refuses a bad cap and an unknown gametype
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "wordle_coop", "max_daily_games": 1.5}]'::jsonb),
  '{"type": "not-ok", "severity": "form-validation", "dbcode": "PN517",
    "field": "max_daily_games.wordle_coop"}'::jsonb,
  'a fractional cap is a validation naming the dialog''s control for that row');

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "wordle_coop", "max_daily_games": -1}]'::jsonb),
  '{"type": "not-ok", "severity": "form-validation", "dbcode": "PN517"}'::jsonb,
  'a negative cap is refused the same way');

select pg_temp.envelope_is(
  common.set_club_gametypes(
    (select handle from club),
    '[{"gametype": "gametype_from_the_future", "is_enabled": true}]'::jsonb),
  '{"type": "not-ok", "severity": "fault", "dbcode": "PN516"}'::jsonb,
  'a gametype the registry lacks is a fault — the dialog lists the registry');

-- ============================================================
-- (7) The view's rows are the club's members' to read
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');
select is(
  (select count(*) from common.clubs_gametypes_today where club_handle = (select handle from club)),
  0::bigint,
  'dee (non-member) sees none of the club''s rows through the view');

select * from finish();
rollback;
