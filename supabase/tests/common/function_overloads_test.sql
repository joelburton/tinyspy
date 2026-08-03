-- ============================================================
-- Test: no accidental function overloads in any game schema
-- ============================================================
--
-- The guard for the one failure mode the repeatable-SQL split introduces
-- (docs/supabase.md → "Schema vs code").
--
-- Every function lives in `supabase/sql/<game>.sql`, which is re-applied in
-- full on each deploy via `create or replace function`. That is exactly as
-- idempotent as it sounds — until a SIGNATURE changes. `create or replace`
-- keys on (name, argument types), so renaming an argument, adding one without
-- a default, or changing the return type does NOT replace the old function:
-- it creates a SECOND one beside it. Both then answer to the same name.
--
-- The symptom is not a SQL error, which is what makes it worth a test: the
-- old definition sits there serving traffic, and PostgREST — which resolves
-- an RPC by name — starts failing calls with
--   "Could not choose the best candidate function between ..."
-- or, worse, silently picks the stale one when the argument shapes let it.
-- Locally you'd never see it (`db reset` builds from empty); it only appears
-- on the long-lived hosted database, which is the one place it hurts.
--
-- The fix when this fails is to add an explicit
--   drop function if exists <schema>.<name>(<OLD arg types>);
-- immediately above the `create or replace`, in the same repeatable file. Leave
-- it there — the file is applied to databases at every age, including ones that
-- still carry the old signature.
--
-- The app has NO intentional overloads today. If one is ever wanted, this test
-- is where that decision gets recorded (add it to the expected set with a
-- comment saying why) rather than discovered.

begin;
select plan(1);

set local search_path = public, extensions;

select is_empty(
  $$
    select n.nspname || '.' || p.proname || ' (' || count(*) || ' overloads: '
             || string_agg(pg_get_function_identity_arguments(p.oid), ' | '
                           order by p.oid) || ')'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in (
             'common', 'bananagrams', 'boggle', 'codenamesduet', 'connections',
             'crosswords', 'psychicnum', 'scrabble', 'spellingbee', 'stackdown',
             'waffle', 'wordiply', 'wordle', 'wordwheel')
     group by n.nspname, p.proname
    having count(*) > 1
  $$,
  'no function name in a game schema has more than one signature '
  || '(a leftover overload means a repeatable file changed a signature '
  || 'without dropping the old one — see the header)'
);

select * from finish();
rollback;
