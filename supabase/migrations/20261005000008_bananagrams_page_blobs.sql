-- cs-unmet

-- ============================================================
-- bananagrams: letters lowercase, a log, and the counts table gone
-- ============================================================
-- Three changes, settled with Joel on 2026-10-05 when bananagrams' seat-view
-- conversion opened (plans/areas/bananagrams.md → The conversion):
--
--   LOWERCASE   Every stored letter — the deal, the two piles, each board's
--               cells and the tiles each player holds — was uppercase; every
--               other word game keeps its letters lowercase and draws the
--               capitals. A game's title keeps its capitals: it is drawn text.
--   THE LOG     `bananagrams.events`, the one shape every game's log has
--               (docs/supabase.md → Every game's log is `<game>.events`):
--               a `peel`, a `dump` (with the letter), or going out. Written
--               from here on by `peel` and `dump`; past games have no rows.
--               Not in the `supabase_realtime` publication: the page reads the
--               blobs on common.games and subscribes to nothing else.
--   progress    Dropped. Its two columns were projections of `player_boards`
--               (`unplaced_count` = the tiles held minus the board's main
--               block, `placed` = the filled cells) kept club-readable while
--               the boards were owner-only. The page blobs carry the count
--               now, computed by `_make_json_players` at build time. The drop
--               takes the table out of the publication with it.
--
-- The page blobs are rebuilt by hand after the deploy
-- (`select bananagrams._rebuild_data_cols_for_all()`), since a migration
-- cannot call what `supabase/sql/` defines.

-- ─── Lowercase ─────────────────────────────────────────────
create temporary table _bananagrams_before on commit drop as
  select (select count(*) from bananagrams.games) as n_games,
         (select coalesce(sum(length(bunch_at_setup)), 0) from bananagrams.games) as n_dealt,
         (select coalesce(sum(length(bunch)), 0) from bananagrams.games) as n_bunch,
         (select coalesce(sum(length(bag)), 0) from bananagrams.games) as n_bag,
         (select count(*) from bananagrams.player_boards) as n_boards,
         (select coalesce(sum(length(replace(board, '.', ''))), 0) from bananagrams.player_boards) as n_placed,
         (select coalesce(sum(length(tiles)), 0) from bananagrams.player_boards) as n_tiles;

update bananagrams.games
   set bunch_at_setup = lower(bunch_at_setup),
       bunch          = lower(bunch),
       bag            = lower(bag);

update bananagrams.player_boards
   set board = lower(board),
       tiles = lower(tiles);

-- The same rows and the same number of letters everywhere; and every stored
-- letter is now lowercase.
do $$
declare
  b record;
  a record;
  n_bad bigint;
begin
  select * into b from _bananagrams_before;
  select (select count(*) from bananagrams.games) as n_games,
         (select coalesce(sum(length(bunch_at_setup)), 0) from bananagrams.games) as n_dealt,
         (select coalesce(sum(length(bunch)), 0) from bananagrams.games) as n_bunch,
         (select coalesce(sum(length(bag)), 0) from bananagrams.games) as n_bag,
         (select count(*) from bananagrams.player_boards) as n_boards,
         (select coalesce(sum(length(replace(board, '.', ''))), 0) from bananagrams.player_boards) as n_placed,
         (select coalesce(sum(length(tiles)), 0) from bananagrams.player_boards) as n_tiles
    into a;
  if a is distinct from b then
    raise exception 'bananagrams lowercase: before % after %', b, a;
  end if;

  select count(*) into n_bad
    from bananagrams.games
   where bunch_at_setup !~ '^[a-z]*$' or bunch !~ '^[a-z]*$' or bag !~ '^[a-z]*$';
  if n_bad > 0 then
    raise exception 'bananagrams lowercase: % game(s) with a pile that is not all lowercase letters', n_bad;
  end if;

  select count(*) into n_bad
    from bananagrams.player_boards
   where tiles !~ '^[a-z]*$' or board !~ '^[a-z.]*$';
  if n_bad > 0 then
    raise exception 'bananagrams lowercase: % board(s) whose tiles or cells are not lowercase letters', n_bad;
  end if;
end $$;

-- ─── The log ───────────────────────────────────────────────
create table bananagrams.events (
  -- the skeleton
  id         bigint generated always as identity primary key,
  game_id    uuid not null references bananagrams.games(game_id) on delete cascade,
  user_id    uuid not null references common.profiles(user_id) on delete cascade,
  kind       text not null check (kind in ('peel', 'dump', 'went_out')),
  -- bananagrams has no turns, so nothing is ever a go used up.
  took_turn  boolean not null default false,
  created_at timestamptz not null default now(),

  -- this game's payload
  -- The letter dumped; a peel and going out dump nothing.
  tile       text check (tile ~ '^[a-z]$'),
  -- How many tiles the act dealt its author: 1 on a peel, 3 on a dump, 0 on
  -- going out. A number rather than a rule, so a table that one day chooses
  -- its own draw sizes writes what it drew.
  n_drawn    int not null check (n_drawn >= 0),

  constraint events_payload_by_kind check (
    case kind
      when 'dump' then tile is not null
      else             tile is null
    end
  )
);

-- Every read of the log is "this game's rows, in order".
create index bananagrams_events_game_id_id_idx on bananagrams.events (game_id, id);

alter table bananagrams.events enable row level security;

-- ─── The counts table ──────────────────────────────────────
-- Its policy and its publication membership go with it. The repeatable half
-- (supabase/sql/bananagrams.sql) stopped naming it in the same change.
drop table bananagrams.progress;
