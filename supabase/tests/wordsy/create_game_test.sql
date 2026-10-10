-- cs-unmet

-- ============================================================
-- Test: wordsy.create_game(club, setup, players, mode)
-- ============================================================
--   1. the gates it inherits: signed out, the caller not among the players
--   2. its own refusals, every one a FAULT — the setup form fixes the timer
--      at none, offers the six bands and the two styles, and the club page
--      offers FlipWord in compete only and to two or more:
--        the band (PN543), the style (PN544), coop (PN545), one player
--        (PN546), a whole-game timer (PN547)
--   3. the happy path: the envelope, the deck a shuffle of all 60, round 1
--      dealt from it, the players, the title, the clock put away
--   4. the deck is withheld from a client; what was dealt is not
--   5. the First Wordsmith: named at the deal in `no-timer`, nobody in `timer`
-- ============================================================

begin;

set search_path = wordsy, common, public, extensions;

select plan(18);

\ir ../_shared/setup.psql
\ir ../_shared/envelope.psql
\ir setup.psql

create function pg_temp.setup(p_band int default 4, p_style text default 'timer',
                              p_timer jsonb default '{"kind": "none"}') returns jsonb
language sql immutable as $$
  select jsonb_build_object('timer', p_timer, 'legal_band', p_band, 'round_style', p_style)
$$;

-- ─── (1) The inherited gates ───
select set_config('request.jwt.claims', '', true);
select set_config('role', 'postgres', true);
select pg_temp.envelope_is(
  wordsy.create_game('placeholder-club', pg_temp.setup(),
    array[pg_temp.ws_uid('ada'), pg_temp.ws_uid('bea')], 'compete'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN011"}'::jsonb,
  'a signed-out caller is refused as a fault'
);

select pg_temp.as_user(pg_temp.ws_uid('ada'));
create temp table club on commit drop as
select pg_temp.ws_club(array['ada', 'bea', 'cade']) as handle;

select pg_temp.envelope_is(
  wordsy.create_game((select handle from club), pg_temp.setup(),
    array[pg_temp.ws_uid('bea'), pg_temp.ws_uid('cade')], 'compete'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN510"}'::jsonb,
  'nobody starts a game they are not in'
);

-- ─── (2) Its own refusals ───
create function pg_temp.try(p_setup jsonb, p_mode text default 'compete',
                            p_names text[] default array['ada', 'bea']) returns jsonb
language sql as $$
  select wordsy.create_game((select handle from club), p_setup,
    array(select pg_temp.ws_uid(n) from unnest(p_names) n), p_mode)
$$;

select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup() - 'legal_band'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN543"}'::jsonb,
  'a setup with no band is refused'
);
select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup(p_band => 7)),
  '{"type":"not-ok","severity":"fault","dbcode":"PN543"}'::jsonb,
  'a band past 6 is refused'
);
select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup(p_style => 'fast')),
  '{"type":"not-ok","severity":"fault","dbcode":"PN544"}'::jsonb,
  'a round style other than timer or no-timer is refused'
);
select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup(), 'coop'),
  '{"type":"not-ok","severity":"fault","dbcode":"PN545"}'::jsonb,
  'coop is refused: FlipWord is compete only'
);
select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup(), 'compete', array['ada']),
  '{"type":"not-ok","severity":"fault","dbcode":"PN546"}'::jsonb,
  'one player alone is refused'
);
select pg_temp.envelope_is(
  pg_temp.try(pg_temp.setup(p_timer => '{"kind": "countup"}')),
  '{"type":"not-ok","severity":"fault","dbcode":"PN547"}'::jsonb,
  'a whole-game timer is refused: the round timer is the game''s own'
);

-- ─── (3) The happy path ───
create temp table made on commit drop as
select pg_temp.try(pg_temp.setup()) as env;

select pg_temp.envelope_is(
  (select env from made),
  '{"type":"ok","data":{"result":"created"}}'::jsonb,
  'a game is created'
);

create function pg_temp.gid() returns uuid language sql as
  $$ select (env -> 'data' ->> 'id')::uuid from made $$;

reset role;

select is(
  (select array(select x from unnest(deck) x order by x) from wordsy.games where game_id = pg_temp.gid()),
  array(select n::smallint from generate_series(1, 60) n),
  'the deck is every card once'
);
select is(
  (select array(select x from unnest(drawn) x order by x) from wordsy.games where game_id = pg_temp.gid()),
  (select array(select x from unnest(tiles) x order by x) from wordsy.rounds where game_id = pg_temp.gid() and num = 1),
  'round 1''s eight cards are the eight drawn'
);
select is(
  (select count(*)::int from wordsy.players where game_id = pg_temp.gid()),
  2,
  'a players row each'
);
select is(
  (select title from common.games where id = pg_temp.gid()),
  'Round 1 of 7',
  'the title is the round'
);
select is(
  (select kind from common.timers where game_id = pg_temp.gid()),
  'none',
  'the clock is put away until the first submit'
);
select is(
  (select fastest_user_id from wordsy.rounds where game_id = pg_temp.gid() and num = 1),
  null,
  'a timer round has no Fastest until someone submits'
);

-- ─── (4) The deck is withheld ───
select pg_temp.as_user(pg_temp.ws_uid('bea'));
select throws_ok(
  format('select deck from wordsy.games where game_id = %L', pg_temp.gid()),
  '42501',
  null,
  'a client cannot read the deck'
);
select is(
  (select cardinality(drawn) from wordsy.games where game_id = pg_temp.gid()),
  8,
  '… but can read what was dealt'
);

-- ─── (5) The First Wordsmith in no-timer ───
select pg_temp.as_user(pg_temp.ws_uid('ada'));
create temp table made_nt on commit drop as
select pg_temp.try(pg_temp.setup(p_style => 'no-timer'), 'compete', array['ada', 'bea', 'cade']) as env;
reset role;
select ok(
  (select fastest_user_id from wordsy.rounds
    where game_id = (select (env -> 'data' ->> 'id')::uuid from made_nt) and num = 1)
    = any(array[pg_temp.ws_uid('ada'), pg_temp.ws_uid('bea'), pg_temp.ws_uid('cade')]),
  'a no-timer round 1 names a First Wordsmith from among the players'
);

select * from finish();
rollback;
