-- cs-unmet

-- ============================================================
-- Test: wordiply RLS — club gating
-- ============================================================
--
-- Every wordiply policy is the club-member read: a member reads every row
-- of the club's games, in both modes, mid-game or ended. What a racer is
-- SHOWN of a rival mid-race — not their words — is the hook's rule over
-- game_data (src/wordiply/hooks/useGame.ts), not a policy's; nothing reads
-- these tables from the client.
--
-- Direct-INSERT setup (switch to postgres, write rows) so the read policy is
-- exercised in isolation from submit_guess.
--
-- Personas: ada + bea + cade in the test club; dee is the outsider.

begin;

set search_path = wordiply, common, public, extensions;

select plan(9);

\ir ../_shared/setup.psql

-- ============================================================
-- Set up: 3-member club + a COOP wordiply game + one guess per player
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
create temp table club on commit drop as
select pg_temp.create_club('Ada Bea Cade', array['ada','bea','cade']) as handle;

reset role;
-- A coop game still in play. common.games is the FK target.
create temp table coop_game (id uuid) on commit drop;
grant select on coop_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordiply_coop',
    'coop',
    'AR',
    '{"difficulty": 5, "timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into coop_game (id) select id from ins;

insert into wordiply.games
  (game_id, base, max_word_len, longest_words, legal_words)
values (
  (select id from coop_game),
  'ar', 7,
  '["hangars"]'::jsonb, '["bar","car","arc","hangars"]'::jsonb
);

-- One guess per player; each member sees ALL three.
insert into wordiply.events (game_id, user_id, kind, word, len, took_turn) values
  ((select id from coop_game), 'ada11111-1111-1111-1111-111111111111', 'guess', 'bar', 3, true),
  ((select id from coop_game), 'bea22222-2222-2222-2222-222222222222', 'guess', 'cars', 4, true),
  ((select id from coop_game), 'cade3333-3333-3333-3333-333333333333', 'guess', 'arcs', 4, true);

-- ============================================================
-- Coop mode: everyone in the club sees everyone's guesses
-- ============================================================

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.events where game_id = (select id from coop_game)),
  3::bigint,
  'coop / ada (member): sees all 3 guesses including bea''s + cade''s'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordiply.events where game_id = (select id from coop_game)),
  3::bigint,
  'coop / bea (member): sees all 3 guesses including ada''s + cade''s'
);

-- ============================================================
-- Non-member sees nothing — through games or guesses
-- ============================================================

select pg_temp.as_user('dee44444-4444-4444-4444-444444444444');

select is(
  (select count(*) from wordiply.games where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordiply.games'
);

select is(
  (select count(*) from wordiply.events where game_id = (select id from coop_game)),
  0::bigint,
  'dee (outsider): zero rows from wordiply.events'
);

-- ============================================================
-- Direct INSERT into wordiply tables is blocked at the grant layer
-- ============================================================
-- No INSERT grant for authenticated. Writes go through submit_guess. This
-- pins the grant boundary so a future migration doesn't widen it.

select throws_ok(
  format(
    $$ insert into wordiply.events (game_id, user_id, kind, word, len, took_turn)
       values (%L::uuid, 'dee44444-4444-4444-4444-444444444444', 'guess', 'sneak', 5, true) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table events',
  'direct INSERT into wordiply.events is blocked for authenticated'
);

select throws_ok(
  format(
    $$ insert into wordiply.games
         (game_id, base, max_word_len, longest_words, legal_words)
       values (%L::uuid, 'ar', 7, '["hangars"]'::jsonb, '["bar"]'::jsonb) $$,
    (select id from coop_game)
  ),
  '42501',
  'permission denied for table games',
  'direct INSERT into wordiply.games is blocked for authenticated'
);

-- ============================================================
-- Compete mode: the same member read while playing
-- ============================================================

reset role;
create temp table compete_game (id uuid) on commit drop;
grant select on compete_game to authenticated;
with ins as (
  insert into common.games (id, club_handle, gametype, mode, title, setup)
  values (
    gen_random_uuid(),
    (select handle from club),
    'wordiply_compete',
    'compete',
    'AR',
    '{"difficulty": 5, "timer": {"kind": "none"}}'::jsonb
  )
  returning id
)
insert into compete_game (id) select id from ins;

insert into wordiply.games
  (game_id, base, max_word_len, longest_words, legal_words)
values (
  (select id from compete_game),
  'ar', 7,
  '["hangars"]'::jsonb, '["bar","car","arc","hangars"]'::jsonb
);

insert into wordiply.events (game_id, user_id, kind, word, len, took_turn) values
  ((select id from compete_game), 'ada11111-1111-1111-1111-111111111111', 'guess', 'bar', 3, true),
  ((select id from compete_game), 'bea22222-2222-2222-2222-222222222222', 'guess', 'cars', 4, true),
  ((select id from compete_game), 'cade3333-3333-3333-3333-333333333333', 'guess', 'arcs', 4, true);

-- Ada reads all three rows: the policy is the member gate alone.
select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / ada (member): reads all 3 rows — the hook withholds, not the policy'
);

select pg_temp.as_user('bea22222-2222-2222-2222-222222222222');
select is(
  (select count(*) from wordiply.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete mid-game / bea (member): reads all 3 rows'
);

-- ============================================================
-- Compete mode, ended: the same read
-- ============================================================

reset role;
update common.games
   set ended_at = now(), game_ended_reason = 'stopped',
       game_ended_reason_detail = 'stopped', game_ended_outcome = 'neutral'
 where id = (select id from compete_game);

select pg_temp.as_user('ada11111-1111-1111-1111-111111111111');
select is(
  (select count(*) from wordiply.events where game_id = (select id from compete_game)),
  3::bigint,
  'compete ended / ada: reads all 3 rows'
);

-- ============================================================
select * from finish();
rollback;
