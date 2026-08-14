-- ============================================================
-- crosswords.games.puzzle_date — what the NYT calendar colours by
-- ============================================================
-- The setup dialog's NYT tab becomes a drawn calendar showing which dates
-- this club has already played (the shape connections + strands use), and
-- that needs a date to join on. There wasn't one.
--
-- WHY A COLUMN AND NOT A DERIVATION. NYT and Guardian games ride INLINE —
-- the fetched puzzle never becomes a `crosswords.puzzles` row (that table is
-- the curated CLI library, `source in ('library')`) — so `puzzle_id` is NULL
-- for exactly the games the calendar cares about. The only other trace of
-- the date is `meta ->> 'id'`, which the converter sets to the publication
-- date but falls back to the literal string 'nyt' when the response has no
-- `publicationDate`, and which for a LIBRARY puzzle is that puzzle's own
-- source id. Keying a feature to a field with two other meanings is how you
-- get a calendar that quietly mis-colours. connections.games and
-- strands.games both denormalize `puzzle_date` for this same reason.
--
-- WHY A FORWARD MIGRATION rather than an edit to 20260706000000_crosswords
-- (the convention in CLAUDE.md). That migration is already applied on prod,
-- and `supabase db push` SKIPS applied migrations — so an in-place edit
-- would never create the column there, while `supabase/sql/crosswords.sql`
-- (re-applied in full every deploy) would immediately start inserting into
-- it. The deploy would fail partway through crosswords' SQL. The convention
-- costs a prod reset to preserve, and prod is carrying live games.

alter table crosswords.games
  add column if not exists puzzle_date date;

comment on column crosswords.games.puzzle_date is
  'NYT publication date this game was imported from; NULL for library, upload and Guardian starts. Set by crosswords.create_game from setup.date. Read by crosswords.club_nyt_status to colour the setup calendar.';

-- The calendar's read is "this club's games, by date", so the club leads.
-- Partial: only NYT games carry a date, and they are the minority of rows.
create index if not exists games_club_date_idx
  on crosswords.games (club_handle, puzzle_date)
  where puzzle_date is not null;

-- Backfill the games created before the column existed — all NYT imports,
-- whose `meta ->> 'id'` the converter set to the publication date. The shape
-- test is the guard, not an optimization: a library puzzle's meta.id is its
-- own source id and an NYT response missing publicationDate falls back to
-- 'nyt', and neither casts to a date. Idempotent, and a no-op on a fresh
-- database.
update crosswords.games
   set puzzle_date = (meta ->> 'id')::date
 where puzzle_date is null
   and meta ->> 'id' ~ '^\d{4}-\d{2}-\d{2}$';
