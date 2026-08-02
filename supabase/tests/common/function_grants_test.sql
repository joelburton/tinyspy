-- ============================================================
-- Test: no app function is executable by PUBLIC — ALL schemas
-- ============================================================
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, so a
-- helper is world-callable unless its migration says otherwise. The repo's
-- convention is the explicit pair right after each definition:
--
--   revoke execute on function <schema>.<fn>(<types>) from public;
--   grant  execute on function <schema>.<fn>(<types>) to authenticated;  -- iff needed
--
-- The grant is only for functions the CALLER runs: player-facing RPCs, plus
-- the handful of helpers reached through an RLS policy or a security_invoker
-- view (a policy runs as the invoker, so `common.is_club_member` genuinely
-- needs it). Everything else is reached from inside a SECURITY DEFINER
-- function, which runs as the owner and needs no grant at all.
--
-- This isn't a live exposure under RLS + friends-only — most of these helpers
-- are pure math, and the ones that mutate are still gated by the RLS on the
-- tables they touch. It's a defence-in-depth convention, and the reason to
-- pin it is that the default is BACKWARDS: forgetting the revoke silently
-- widens the surface, and nothing else in the suite would notice. 27 helpers
-- had drifted this way by 2026-08-02, including `scrabble._finish`, which
-- unconditionally terminates a game.
--
-- If this fails, the fix is a revoke line next to the new function — not an
-- exception here.
-- ============================================================

begin;

set search_path = common, public, extensions;

\ir ../_shared/setup.psql

select plan(1);

select is(
  (select coalesce(
            string_agg(n.nspname || '.' || p.proname || '(' ||
                       pg_get_function_identity_arguments(p.oid) || ')',
                       E'\n' order by n.nspname, p.proname),
            '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in (select gametype_schema from (
            values ('common'), ('codenamesduet'), ('psychicnum'), ('connections'),
                   ('bananagrams'), ('waffle'), ('wordle'), ('stackdown'),
                   ('scrabble'), ('spellingbee'), ('boggle'), ('crosswords'),
                   ('wordwheel'), ('wordiply')
          ) as s(gametype_schema))
      and has_function_privilege('public', p.oid, 'EXECUTE')),
  '',
  'no function in an app schema is executable by PUBLIC (add a revoke next to the definition)'
);

select * from finish();
rollback;
