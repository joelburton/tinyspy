-- cs-unmet

-- ============================================================
-- Paw protection — a club's daily cap on starting a gametype
-- ============================================================
-- A club can cap how many games of a gametype are started each UTC day
-- (docs/common-schema.md → Paw protection). The cap and its counter live on
-- the club's row for that gametype in `common.clubs_gametypes`, which from
-- here on exists for EVERY registered gametype, enabled or not: the cap and
-- the saved setup both live on the row, and a row has to exist before either
-- can. Until now a club "had" a gametype by the row existing, and unchecking a
-- game in the edit dialog deleted its row and the saved setup with it.
--
--   is_enabled        the edit dialog's checkbox: the game is listed on the
--                     club page. Replaces "the row exists".
--   max_daily_games   the cap; null is no limit, 0 is listed but never
--                     startable.
--   n_started_today   the counter `common._create_game` increments. A counter
--                     rather than a count of games rows, so deleting a game
--                     refunds nothing.
--   started_on        the UTC day the counter is for; a different day means
--                     the counter is zero.
--
-- `can_edit_settings` on the club gates the edit dialog: off, and the Edit
-- club action is hidden and `set_club_gametypes` refuses. Nothing in the app
-- sets it; it is flipped by hand in psql.

alter table common.clubs
  add column can_edit_settings boolean not null default true;

alter table common.clubs_gametypes
  add column is_enabled boolean not null default true,
  add column max_daily_games smallint
    check (max_daily_games is null or max_daily_games >= 0),
  add column n_started_today smallint not null default 0
    check (n_started_today >= 0),
  add column started_on date;

-- Backfill: every club gets a DISABLED row for each gametype it has none for,
-- so the table is complete. The rows that exist are the club's listed games
-- and keep the default, enabled. `common._create_game` reads a missing row as
-- disabled too, so a club a later migration forgets stays closed rather than
-- open.
--
-- In the migration rather than supabase/sql/, which is re-applied on every
-- deploy: the same statement there would be harmless today (`on conflict do
-- nothing`) and a trap the day a column default changes.
insert into common.clubs_gametypes (club_handle, gametype, is_enabled)
select c.handle, g.gametype, false
  from common.clubs c
 cross join common.gametypes g
on conflict (club_handle, gametype) do nothing;
