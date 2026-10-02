-- cs-unmet

-- ============================================================
-- The three page blobs, named for what they hold
-- ============================================================
-- 20261001000000 added them as `clubpage`, `shell` and `playarea`: the names of
-- the components that read them. A column is named for what it holds, not for
-- today's reader (plans/seat-view.md → The page is written, not assembled):
--
--   summary_data  the game summed up in a line — how it stands while it is
--                 played, the verdict once it has ended. The club page's list
--                 is its one reader today; a page of "my games" across clubs
--                 would read the same column, and nothing about it would
--                 change. `clubpage` would have been wrong the day that page
--                 appeared.
--   game_data     everything the play surface shows: the game's own blob, on
--                 the common part every game shares. It becomes `gd`.
--   shell_data    everything GamePage shows: the same shape for every game.
--                 It becomes `cg`.
--
-- The `_data` says what the three are to a reader of the table: jsonb a game's
-- status builder writes whole, beside the real columns SQL owns. Each builder
-- function bears its column's name (`_make_json_shell_data`,
-- `_make_json_game_data`, `_make_json_summary_data`).

alter table common.games rename column clubpage to summary_data;
alter table common.games rename column playarea to game_data;
alter table common.games rename column shell    to shell_data;

comment on column common.games.summary_data is
  'The game summed up in a line, written whole by the game''s status builder: how it stands, or how it ended. Read by the club page''s list today; a fact about the game, not about that page.';
comment on column common.games.game_data is
  'Everything the play surface shows, written whole by the game''s status builder: the common part every game shares (common._make_json_game_data) with the game''s own on top. The page hands it to the game, whose useGame makes gd of it.';
comment on column common.games.shell_data is
  'Everything GamePage shows, the same shape for every game, built whole by common._make_json_shell_data and written at create and after every move. The page reads it as cg.';
