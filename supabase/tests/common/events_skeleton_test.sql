-- cs-unmet

-- ============================================================
-- Test: the `<game>.events` skeleton — one shape for every log
-- ============================================================
--
-- Every game with a log keeps a chronological one of what happened in a
-- game, and the shape of that log is a convention rather than anything the
-- type system can hold: a table named `events`, keyed by a `bigint identity` whose
-- order IS the order of play, carrying the game, the actor, what kind of
-- event it was, whether it used up one of the actor's goes, and when. The
-- game's own payload columns sit beside those six and are its business.
--
-- The convention decays silently. Nothing breaks the day a new game's log
-- keys on a uuid or spells its timestamp `guessed_at`; it just stops being
-- the same table as the others, and the next thing that wants to read
-- all of them has to special-case it. So the skeleton is asserted here,
-- once, over a roster.
--
-- THE ROSTER is the temp table below: one row per game with a log, naming
-- where that log lives today and whether it has been brought to the
-- skeleton. A game's row flips to `converted = true` in the same change
-- that reshapes its table — that flip is what puts the game under every
-- assertion in this file, and assertion 1 is bidirectional, so a table
-- reshaped without the flip fails just as loudly as a flip without the
-- reshape.
--
-- Deliberately NOT here:
--   spellingbee · boggle · wordwheel   `found_words` is a SET, not a log
--   bananagrams · crosswords           no log at all
--
-- The companion guard is realtime_publication_test.sql, which names every
-- log table by schema and name: between them, a table cannot be renamed
-- without both files agreeing about what it is now called.

begin;

set search_path = common, public, extensions;

select plan(7);

-- The roster. `log_table` is where the game's log lives TODAY; `converted`
-- is whether that table matches the skeleton. The two are separate facts:
-- strands, letterboxed and setgame arrived at the name first and the shape
-- later.
create temporary table roster (schema text, log_table text, converted boolean);
insert into roster values
  ('psychicnum',  'events',      true),
  ('wordle',      'events',      true),
  ('connections', 'events',      true),
  ('waffle',      'events',      true),
  ('wordiply',    'events',      true),
  ('stackdown',   'events',      true),
  ('scrabble',    'events',      true),
  ('strands',     'events',      true),
  ('letterboxed', 'events',      true),
  ('setgame',     'events',      true),
  ('codenamesduet', 'events',    true);

-- 1. The six columns, with the right types. Bidirectional: a game that
--    grows the skeleton without flipping its roster row shows up as an
--    extra, and a flipped row whose table is still the old shape as a
--    missing one.
select set_eq(
  $$
    select c.table_schema::text, c.table_name::text
      from information_schema.columns c
     where c.table_name = 'events'
       and c.table_schema in (select schema from roster)
       and (c.column_name, c.data_type) in (
             ('id',         'bigint'),
             ('game_id',    'uuid'),
             ('user_id',    'uuid'),
             ('kind',       'text'),
             ('took_turn',  'boolean'),
             ('created_at', 'timestamp with time zone'))
     group by 1, 2
    having count(*) = 6
  $$,
  $$ select schema, log_table from roster where converted $$,
  'every converted log is <game>.events with the six skeleton columns — and nothing else is'
);

-- 2. None of the six is nullable. Every one of them is a fact the row
--    cannot be missing: which game, who, what they did, whether it cost
--    them a go, when. scrabble was the exception while its AI seats had no
--    user to name; they are accounts now, so there is none.
select is_empty(
  $$
    select r.schema || '.' || c.column_name
      from roster r
      join information_schema.columns c
        on c.table_schema = r.schema and c.table_name = r.log_table
     where r.converted
       and c.column_name in ('id', 'game_id', 'user_id', 'kind', 'took_turn', 'created_at')
       and c.is_nullable = 'YES'
  $$,
  'no skeleton column is nullable'
);

-- 3. `id` is the whole primary key, and it is an identity column — the
--    two halves of "the key is a number the database hands out in order".
--    A composite key would put the read order back in the frontend's
--    hands, which is what this shape exists to stop.
select set_eq(
  $$
    select r.schema, r.log_table
      from roster r
      join pg_namespace n on n.nspname = r.schema
      join pg_class t on t.relnamespace = n.oid and t.relname = r.log_table
      join pg_attribute a on a.attrelid = t.oid and a.attname = 'id'
      join pg_constraint pk on pk.conrelid = t.oid and pk.contype = 'p'
      join information_schema.columns c
        on c.table_schema = r.schema and c.table_name = r.log_table
       and c.column_name = 'id'
     where r.converted
       and pk.conkey = array[a.attnum]
       and c.is_identity = 'YES'
  $$,
  $$ select schema, log_table from roster where converted $$,
  'the primary key is exactly (id), and id is an identity column'
);

-- 4. The read index. Every read of a log is "this game's rows, in order",
--    and `(game_id, id)` is the index that answers it without a sort.
select set_eq(
  $$
    select r.schema, r.log_table
      from roster r
      join pg_namespace n on n.nspname = r.schema
      join pg_class t on t.relnamespace = n.oid and t.relname = r.log_table
      join pg_index i on i.indrelid = t.oid and not i.indisprimary
     where r.converted
       and i.indnkeyatts = 2
       and (select array_agg(a.attname::text order by k.ord)
              from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
             where k.ord <= 2) = array['game_id', 'id']
  $$,
  $$ select schema, log_table from roster where converted $$,
  'each converted log carries the (game_id, id) read index'
);

-- 5. `kind` is check-constrained, even where a game has only one kind
--    today. The check is what makes the vocabulary a fact about the table
--    rather than a habit of the RPCs that write it.
select set_eq(
  $$
    select r.schema, r.log_table
      from roster r
      join pg_namespace n on n.nspname = r.schema
      join pg_class t on t.relnamespace = n.oid and t.relname = r.log_table
      join pg_attribute a on a.attrelid = t.oid and a.attname = 'kind'
      join pg_constraint c on c.conrelid = t.oid and c.contype = 'c'
                          and c.conkey @> array[a.attnum]
     where r.converted
  $$,
  $$ select schema, log_table from roster where converted $$,
  'kind is check-constrained on every converted log'
);

-- 6. …and has no DEFAULT. A column that every insert must state is one no
--    insert should be able to acquire by omission — a defaulted `kind` is
--    how a row ends up saying something nobody wrote.
select is_empty(
  $$
    select r.schema || '.kind'
      from roster r
      join information_schema.columns c
        on c.table_schema = r.schema and c.table_name = r.log_table
     where r.converted
       and c.column_name = 'kind'
       and c.column_default is not null
  $$,
  'kind has no default anywhere — every insert names its own'
);

-- 7. The roster itself is honest: every game's log table exists where the
--    roster says it does. This is what makes a rename impossible to do
--    quietly — the table moves to `events`, and until this file says so
--    the suite is red.
select set_eq(
  $$
    select r.schema, r.log_table
      from roster r
      join information_schema.tables t
        on t.table_schema = r.schema and t.table_name = r.log_table
       and t.table_type = 'BASE TABLE'
  $$,
  $$ select schema, log_table from roster $$,
  'every rostered log table exists under the name the roster records'
);

select * from finish();
rollback;
