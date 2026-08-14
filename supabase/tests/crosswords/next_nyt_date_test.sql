-- ============================================================
-- Test: crosswords.next_nyt_date_for_club — the NYT weekday walk
-- ============================================================
--
-- The NYT tab picks a WEEKDAY, and this turns it into a date. It has no
-- archive to scan — an NYT daily isn't stored anywhere until it's fetched —
-- so it GENERATES candidates every seventh day back from the most recent
-- occurrence and consults only the games table.
--
-- Four properties, each of which would be silently wrong in a different way:
--
--   1. It returns that weekday. An off-by-one in the modulo gives Sundays for
--      Mondays, and nothing else would notice.
--   2. MOST RECENT first — deliberately opposite to connections' and strands'
--      "earliest unplayed". Their archives are finite and recent; NYT's is
--      effectively infinite, and a club walking forward from 2015 would never
--      play a puzzle anyone was talking about.
--   3. It skips what the SEATED PLAYERS have played, across clubs — the same
--      per-player rule the other two use.
--   4. Exhaustion returns NULL rather than a wrong date.
--
-- Dates here are computed from `current_date` rather than written down: the
-- function is anchored on today, so a fixed date would rot within a week.

begin;

set search_path = crosswords, common, public, extensions;

select plan(7);

\ir ../_shared/setup.psql
\ir setup.psql

create temp table ids on commit drop as
select 'ada11111-1111-1111-1111-111111111111'::uuid as ada,
       'bea22222-2222-2222-2222-222222222222'::uuid as bea;
grant select on ids to public;

-- The most recent Monday (dow 1) on or before today — what an untouched
-- player is owed, by the same arithmetic the function uses.
create temp table expect on commit drop as
select (current_date - ((extract(dow from current_date)::int - 1 + 7) % 7))::date as monday;
grant select on expect to public;

-- ============================================================
-- (1)-(3) Shape: the right weekday, the recent end, per weekday
-- ============================================================

select is(
  crosswords.next_nyt_date_for_club(array[(select ada from ids)], 1),
  (select monday from expect),
  'an untouched player gets the MOST RECENT Monday, not the earliest'
);

select is(
  extract(dow from crosswords.next_nyt_date_for_club(array[(select ada from ids)], 4))::int,
  4,
  'asking for Thursday returns a Thursday'
);

select ok(
  crosswords.next_nyt_date_for_club(array[(select ada from ids)], 6) <= current_date,
  'the date is never in the future — an unpublished puzzle cannot be fetched'
);

-- ============================================================
-- (4)-(6) Exclusion: per-player, across clubs
-- ============================================================
-- ada plays that Monday in her SOLO club. The NYT path normally goes through
-- the edge function; here we call create_game directly with the inline board
-- the way the edge function does, and with the same `setup.source`/`date`
-- that stamps games.puzzle_date.

select pg_temp.as_user((select ada from ids));

create temp table g1 on commit drop as
select id from crosswords.create_game(
  '=ada',
  jsonb_build_object('timer', jsonb_build_object('kind', 'none'),
                     'source', 'nyt',
                     'date', (select monday from expect)::text),
  array[(select ada from ids)],
  'coop',
  -- The inline `board` arg, the way the NYT edge function passes it: an NYT
  -- game is self-contained (no crosswords.puzzles row), which is exactly why
  -- games.puzzle_date had to exist for this walk to have anything to exclude on.
  jsonb_build_object('meta', pg_temp.xw_meta_2x2(), 'solution', pg_temp.xw_sol_2x2()));

-- Back to the superuser to read `puzzle_date`: it is deliberately NOT in
-- crosswords.games's column grant. Nothing client-side needs it — the walk is
-- a definer function, and the colour overlay that used to read it went with
-- the calendar — so the grant stays as tight as it was.
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select puzzle_date from crosswords.games where id = (select id from g1)),
  (select monday from expect),
  'create_game stamps games.puzzle_date from setup.date — the column the walk excludes on'
);

select is(
  crosswords.next_nyt_date_for_club(array[(select ada from ids)], 1),
  (select monday - 7 from expect),
  'having played it, ada is walked back to the Monday before'
);

-- ada's SOLO game must count in a game with bea, whose club never touched it.
select is(
  crosswords.next_nyt_date_for_club(
    array[(select ada from ids), (select bea from ids)], 1),
  (select monday - 7 from expect),
  'an ada+bea game skips it too — the exclusion crosses clubs, per-player'
);

-- ...but bea alone is still owed it.
select is(
  crosswords.next_nyt_date_for_club(array[(select bea from ids)], 1),
  (select monday from expect),
  'bea, who has played nothing, still gets it — exclusion is PER-PLAYER'
);

select * from finish();
rollback;
