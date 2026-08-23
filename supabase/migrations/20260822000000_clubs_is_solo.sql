-- cs-unmet

-- ============================================================
-- common.clubs.is_solo — the `=` prefix, said once, in the DB
-- ============================================================
-- A club is SOLO when its handle starts with `=` (docs/common.md → Solo clubs):
-- `claim_username` materializes one per profile as `=<username>`, and the `=`
-- lives in a slug-space user-typed names can't reach, because
-- `slugify_club_name` strips it. So the prefix is a reliable test — it is just
-- a test the whole app was repeating by hand, in TypeScript and in SQL both.
--
-- The prefix is a database convention, so knowing it is the database's job. A
-- generated column makes solo-ness a fact ON the row: readers ask for it
-- instead of re-deriving it, and nothing outside this file needs to know what
-- shape a solo handle has.
--
-- What it immediately buys, beyond the tidiness: PostgREST can ORDER by it.
-- Solo clubs sort to the top of the home list, which the frontend used to do
-- by partitioning the array after the fact — two names for one list, and a
-- second sort order living where nobody would look for one. Now it is
-- `order=is_solo.desc,created_at.desc` (in Postgres `false < true`, so DESC
-- puts solo first) and the frontend renders what it is handed.
--
-- STORED, not VIRTUAL: virtual generated columns arrive in PG18 and this is
-- PG17, but stored is the right choice here anyway — `handle` is a primary key
-- and never updated, so the column is computed once per club, forever.
--
-- `like '=%'` is immutable with a constant pattern, which is what a generated
-- expression requires.

alter table common.clubs
  add column is_solo boolean not null generated always as (handle like '=%') stored;

-- Ordering the home list means sorting by (is_solo desc, created_at desc) over
-- the handful of clubs one person belongs to — rows PostgREST has already
-- filtered by RLS. Nothing to index: the set is tiny and the filter, not the
-- sort, is what selects it.
