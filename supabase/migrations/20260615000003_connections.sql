-- ============================================================
-- connections — Connections-style word-grouping puzzle
-- ============================================================
--
-- A 4×4 board of 16 tiles split into 4 hidden categories of 4.
-- Players select 4 tiles, submit, and try to identify a category.
-- Correct guesses reveal the category as a colored band;
-- wrong/oneAway guesses cost a mistake. 4 mistakes lose; matching
-- all 4 categories wins.
--
-- "connections" is the codename for the gametype (analogous to how
-- "codenamesduet" is the codename for Codenames Duet). The user-facing
-- copy can use whatever phrasing reads best; SQL / TypeScript /
-- folder names are all `connections`.
--
-- connections ships as a coop/compete PAIR via the sibling-manifest
-- pattern (mirroring psychicnum): one schema, one folder, two
-- `common.gametypes` rows ('connections_coop' / 'connections_compete'),
-- one create_game RPC routing on `mode`.
--
-- ┌─ Compete rules (delta from coop) ───────────────────────┐
-- │ - Per-player mistake_count instead of game-level shared.│
-- │ - Per-player matched_categories — each player must      │
-- │   solve all 4 themselves; "I matched it" doesn't help   │
-- │   anyone else.                                          │
-- │ - First player to all-4 wins; everyone else loses       │
-- │   immediately. (psychicnum-style race-end.)             │
-- │ - 4 mistakes eliminates that player but the game        │
-- │   continues. All-eliminated → lost_compete.             │
-- │ - Timer expiry → lost_compete, everyone loses.          │
-- │ - Opponents see each other's mistake_count (so the      │
-- │   race has tension), NOT each other's guesses or        │
-- │   matched-rank list. RLS enforces.                      │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ The "FE-knows-the-answer" design decision ────────────┐
-- │ Unlike codenamesduet and psychicnum — where the server      │
-- │ holds a secret and validates moves against it — the    │
-- │ connections board (categories + tile order) is publicly   │
-- │ readable. The FE has the answer key and evaluates      │
-- │ guesses locally. The submit_guess RPC trusts the FE's  │
-- │ verdict (correct / oneAway / wrong + the matched       │
-- │ category's rank) and just records it, applying         │
-- │ atomicity for shared state (per-player mistake_count,   │
-- │ and one-correct-per-rank idempotency via partial       │
-- │ unique indexes on guesses).                             │
-- │                                                        │
-- │ This holds in BOTH modes. A compete player who reads   │
-- │ board.categories in devtools wins — but per CLAUDE.md  │
-- │ trust-model, we're not the gatekeeper of cheating.     │
-- │                                                        │
-- │ Why: the evaluator is a small pure function (~15 lines │
-- │ of TS), nothing on the board is genuinely secret in    │
-- │ this codebase's deployment, and the friends-only audi- │
-- │ ence per CLAUDE.md doesn't justify column-grant +      │
-- │ PL/pgSQL evaluation infrastructure. Psychic-num's      │
-- │ column-grant pattern is documented as the canonical    │
-- │ "true server-side secret" example; reading that file   │
-- │ is enough — repeating the pattern here for a non-      │
-- │ secret game would be educational noise.                │
-- │                                                        │
-- │ If this game ever ships beyond friends, the migration  │
-- │ to flip back is: hide `board` via column-level grant,  │
-- │ add a server-side evaluator in PL/pgSQL, drop the FE's │
-- │ `result` / `matched_category_rank` parameters from     │
-- │ submit_guess.                                          │
-- └────────────────────────────────────────────────────────┘
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, common MUST NOT reference connections back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists connections;
grant usage on schema connections to authenticated;

-- ============================================================
-- connections.puzzles — the source-of-truth puzzle library
-- ============================================================
-- A *puzzle* is a prewritten, replayable board shape: one date's
-- NYT Connections puzzle, imported from the Eyefyre/
-- NYT-Connections-Answers repo via the npm `connections:import`
-- script. Distinct from a *game's* `board` jsonb (below), which
-- is the per-game-instance copy plus that game's shuffled
-- `tileOrder`. Puzzles stay pristine; games copy from them.
--
-- Two unique identifiers we preserve from NYT:
--   - `source_id` — the NYT puzzle number ("1", "500"). Text
--     because it's used as a number-in-display but a future NYT
--     could publish "500-bonus" without breaking the schema.
--   - `nyt_date`  — the calendar date NYT published. Drives the
--     setup-form date picker.
--
-- `categories` is a jsonb array matching the shape of
-- `connections.games.board.categories`:
--     [{ rank: 0..3, name: text, tiles: text[4] }, …]
-- The importer normalizes the NYT shape (rank from array index,
-- name from `group`, tiles from `members`).

create table connections.puzzles (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique,
  -- Nullable on purpose. Today every puzzle comes from the NYT
  -- importer and carries the puzzle's nyt_date — the date picker
  -- + calendar widget in the setup form anchor on this column.
  -- The decision (per Joel): non-NYT puzzles MAY land later (no
  -- UI for them today; only the date picker), and they'd carry
  -- NULL here rather than competing for a calendar slot. UNIQUE
  -- still enforces "at most one puzzle per calendar date" for
  -- the dated subset; Postgres treats NULLs as distinct under
  -- UNIQUE by default, so multiple non-dated rows coexist fine.
  -- The setup form's date-picker query (`.eq('nyt_date', d)
  -- .maybeSingle()`) then trivially returns 0-or-1 row.
  nyt_date date unique,
  categories jsonb not null,
  imported_at timestamptz not null default now()
);

-- Public knowledge — puzzles aren't sensitive. The setup-form
-- date picker reads this list to render available dates; the
-- create_game RPC reads `categories` to build the board.
grant select on connections.puzzles to authenticated;

-- The puzzle-import script (supabase/scripts/import-connections-
-- puzzles.ts) connects as the service_role and needs USAGE on
-- the schema + INSERT on this table. authenticated has no INSERT
-- grant; writes go through service_role only.
grant usage on schema connections to service_role;
grant insert, select on connections.puzzles to service_role;

-- ============================================================
-- connections.games
-- ============================================================
-- One row per playthrough. `board` is jsonb with shape
--   {
--     "categories": [{rank: 0..3, name: text, tiles: text[4]}, ...4],
--     "tileOrder":  [text, text, ...16]
--   }
-- The whole board is publicly readable (see the "FE-knows" note
-- in the file header). Per-player mutable state (mistake_count,
-- matched categories) lives on connections.players + connections.guesses
-- so it can be partial-updated atomically; play_state lives on
-- common.games.
--
-- (Setup lives on common.games.setup — the canonical home for the
-- frozen-at-create-time player choices. connections's setup today is
-- just `{ "puzzleId": ..., "timer": ... }`. Server-side validated
-- in create_game.)
--
-- connections.games.id is FK'd to common.games(id) — the canonical
-- id is generated by common.create_game and passed in. ON DELETE
-- CASCADE means a row here goes away if its common.games parent
-- is deleted (e.g., the gametype is unregistered).
--
-- club_handle stays on this row (denormalized from common.games.club_handle)
-- so the RLS policy can ask is_club_member(club_handle) without a join.
-- The denormalization is safe — club_handle is set at create-game time
-- and never changes.
--
-- `mode` ('coop' | 'compete') is the per-game flavor. It's also
-- denormalized onto connections.guesses so the mode-aware partial
-- unique indexes and RLS policy can filter without a join.

create table connections.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- The puzzle this game was created from — PROVENANCE only (a SOFT FK).
  -- Everything needed to play AND identify the game is COPIED below (board +
  -- puzzle_date), so a puzzle can be retired with ON DELETE SET NULL: games
  -- built from it survive, just losing the back-link. Mirrors
  -- stackdown.games.board_id. Set at create_game time; never updated.
  puzzle_id uuid references connections.puzzles(id) on delete set null,
  -- Frozen per-game copy of the puzzle's categories + this game's shuffled
  -- tileOrder. Keeping the copy means the played board is self-contained:
  -- gameplay reads board.categories, NEVER the puzzles table, so a deleted or
  -- re-imported puzzle never affects in-flight games.
  board jsonb not null,
  -- Frozen copy of the puzzle's NYT date — its provenance ("which daily
  -- puzzle"), copied so the game stays self-describing after the puzzle is
  -- deleted. Null for a non-NYT puzzle (puzzles.nyt_date is nullable).
  puzzle_date date,
  created_at timestamptz not null default now(),
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('connections_coop' / 'connections_compete') by construction in
  -- create_game.
  mode text not null
    check (mode in ('coop', 'compete'))
);

create index connections_games_club_handle_idx on connections.games (club_handle);
create index connections_games_puzzle_id_idx on connections.games (puzzle_id);

-- ============================================================
-- connections.guesses — append-only log
-- ============================================================
-- One row per submit. `matched_category_rank` is non-null iff
-- result = 'correct' — the rank (0..3) of the category that was
-- matched. Duplicate submissions (same 4-tile set) are filtered
-- on the FE side (the client has full game state including the
-- guess log), so the RPC just records what it's told.
--
-- `mode` is denormalized from the parent game. Two reasons:
--   1. The mode-aware partial unique indexes below need to
--      filter on mode without a subquery (Postgres partial-
--      index predicates can't reference other tables).
--   2. The mode-aware RLS policy reads it from the row via
--      EXISTS — same pattern as psychicnum.guesses_select.

create table connections.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references connections.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  tiles text[] not null,
  result text not null check (result in ('correct', 'oneAway', 'wrong')),
  matched_category_rank int
    check (matched_category_rank between 0 and 3),
  guessed_at timestamptz not null default now(),
  mode text not null
    check (mode in ('coop', 'compete'))
);

create index connections_guesses_game_id_idx on connections.guesses (game_id);

-- One-correct-per-rank idempotency, mode-aware. These partial
-- unique indexes are the race-idempotency enforcers — when two
-- writers both submit a correct guess for the same category at
-- the same instant, the second INSERT raises unique_violation,
-- which submit_guess catches and treats as "already matched,
-- no-op."
--
-- The set of matched categories is fully derivable from `guesses`
-- filtered to result='correct' plus the static board, so there's
-- no separate matched-categories table — the partial indexes give
-- the same idempotency property with one fewer table to fan
-- postgres-changes events out of.

-- Coop: one correct per rank per game. Two players racing to
-- match the same category — the second INSERT raises
-- unique_violation and submit_guess catches it.
create unique index connections_guesses_one_correct_per_rank_coop
  on connections.guesses (game_id, matched_category_rank)
  where result = 'correct' and mode = 'coop';

-- Compete: one correct per rank PER PLAYER per game. Each
-- player solves the puzzle for themselves; ada can match rank-0
-- and so can bea — those are different rows. The same player
-- accidentally re-submitting the same correct match (e.g., a
-- broken UI sending the request twice) gets caught here.
create unique index connections_guesses_one_correct_per_rank_compete
  on connections.guesses (game_id, user_id, matched_category_rank)
  where result = 'correct' and mode = 'compete';

-- ============================================================
-- connections.players — per-player tracking
-- ============================================================
-- One row per player_user_ids entry, created at game-start time
-- with mistake_count seeded at 0.
--
-- Coop: every row updates in lock-step (mistake_count++ on
-- every wrong guess hits every player row). The shape is
-- symmetric across modes — a coop row's mistake_count just
-- happens to equal the next row's because they increment
-- together.
--
-- Compete: each row increments independently when its owner
-- guesses wrong. When a player's mistake_count hits 4 they're
-- eliminated; the game continues until all are eliminated OR
-- someone matches all 4 categories OR the timer expires.
--
-- Per-player win/lose outcome doesn't live here — that's
-- common.game_players.result written at terminal time via
-- common.end_game's player_results param. Same separation as
-- psychicnum.players.
create table connections.players (
  game_id uuid not null
    references connections.games(id) on delete cascade,
  user_id uuid not null
    references common.profiles(user_id) on delete cascade,
  mistake_count int not null default 0
    check (mistake_count between 0 and 4),
  -- The player's own categories-found count (their correct guesses). PUBLIC like
  -- mistake_count, so a compete opponent strip can show race progress ("Found")
  -- — the guess log itself is RLS-scoped to the caller in compete, so this row
  -- is the only public window onto an opponent's progress (mirrors
  -- psychicnum.players.secrets_found). Maintained by submit_guess on a correct
  -- guess.
  matched_count int not null default 0
    check (matched_count between 0 and 4),
  primary key (game_id, user_id)
);

create index connections_players_game_id_idx on connections.players (game_id);

-- ============================================================
-- RLS
-- ============================================================
-- Same shape as psychicnum: SELECT gated on club membership,
-- no INSERT/UPDATE/DELETE policies (writes go through the
-- security-definer RPCs).

alter table connections.games enable row level security;
alter table connections.guesses enable row level security;
alter table connections.players enable row level security;

create policy games_select on connections.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Guesses: mode-aware visibility, mirroring psychicnum.
--   coop    — every club member sees every guess.
--   compete — each player sees only their own guesses;
--             opponents' tile picks + verdicts are private (so
--             you can't reverse-engineer the answer from a peer's
--             oneAway guess + the public board).
--
-- guesses.mode is read directly from the row — denormalized
-- expressly to avoid a join on every visibility check.
create policy guesses_select on connections.guesses
  for select to authenticated
  using (
    exists (
      select 1 from connections.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (guesses.mode = 'coop' or guesses.user_id = auth.uid())
    )
  );

-- Players: club-wide visible in BOTH modes. This is what gives
-- compete players the "see opponents' mistake counts" property —
-- the column is intentionally public to the club. Same shape as
-- psychicnum.players's RLS policy.
create policy players_select on connections.players
  for select to authenticated
  using (
    exists (
      select 1 from connections.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

grant select on connections.games to authenticated;
grant select on connections.guesses to authenticated;
grant select on connections.players to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   games    status flips
--   guesses  new guess submissions (including correct ones —
--            which is how the FE learns a category was matched,
--            now that there's no separate found_groups table)
--   players  mistake_count increments — drives the opponent-
--            mistakes strip live when an opponent guesses wrong

alter publication supabase_realtime add table connections.games;
alter publication supabase_realtime add table connections.guesses;
alter publication supabase_realtime add table connections.players;

-- ============================================================
-- connections.club_game_status — calendar-coloring view
-- ============================================================
-- Joins connections.games + connections.puzzles + common.games to
-- answer the question the connections setup-form calendar asks:
-- "for this club, which puzzle-dates already have a game, and
-- in what state?" The FE reads this once on dialog-open, builds
-- a Map<nyt_date, status>, and colors each calendar square
-- accordingly (won / lost / in-progress). The `mode` column lets
-- the FE calendar filter to the current dialog's mode.
--
-- security_invoker=true so the view runs with the caller's
-- privileges — both connections.games's RLS policy and
-- common.games's RLS policy gate visibility. A non-member of
-- the club sees zero rows; the FE's `.eq('club_handle', X)` filter
-- is belt-and-braces on top.
--
-- Why a view rather than two FE queries + JS merge: the
-- connections.games -> common.games relationship is cross-schema,
-- which PostgREST's embed syntax doesn't resolve (see
-- code-conventions.md → "Cross-schema embeds"). A view does
-- the join SQL-side in one round-trip and types cleanly via
-- supabase gen types. Same shape as psychicnum.games_state.
--
-- Filtered to gametype in ('connections_coop', 'connections_compete')
-- (defensive; common.games.id ↔ connections.games.id is one-to-one
-- by FK, but the join condition doesn't say "and only connections,"
-- so the filter makes the intent visible) and nyt_date IS NOT NULL
-- (a calendar-anchored view doesn't include rows whose puzzles
-- have no date).

create view connections.club_game_status with (security_invoker = true) as
select
  cg.id          as game_id,
  cg.club_handle as club_handle,
  cg.play_state  as play_state,
  cg.is_terminal as is_terminal,
  wg.mode        as mode,
  p.nyt_date     as nyt_date
from connections.games wg
join connections.puzzles p on p.id = wg.puzzle_id
join common.games cg on cg.id = wg.id
where cg.gametype in ('connections_coop', 'connections_compete')
  and p.nyt_date is not null;

grant select on connections.club_game_status to authenticated;

-- ============================================================
-- connections.create_game — start a new game in a club
-- ============================================================
-- Validates the mode + setup shape, looks up the puzzle by id,
-- builds the per-game board (the puzzle's categories + a freshly-
-- shuffled tileOrder), then coordinates the two-write game-creation:
--
--   1. common.create_game(target_club, 'connections_<mode>',
--                          player_user_ids, title, setup)
--      — validates caller is in the club, validates every uid in
--      player_user_ids is in clubs_members, vacates any prior
--      current-view game for this club, inserts the common.games
--      header row (with is_current_view=true, play_state='playing')
--      + one common.game_players row per uid, returns the
--      canonical game id.
--   2. INSERT INTO connections.games using that id — landing the
--      gametype-specific board + puzzle reference + mode.
--   3. INSERT one connections.players row per player_user_ids entry
--      (mistake_count defaults to 0).
--
-- player_user_ids is the explicit list of who's actually playing
-- THIS game. Defaults are not enforced server-side; the FE's
-- setup dialog defaults to all current club members but lets the
-- player pick a subset. The caller does NOT have to be in
-- player_user_ids (the "Ada facilitates a game between Bea and
-- Cade" case is supported).
--
-- Setup shape:
--   {
--     "puzzleId": "<uuid>",         -- references connections.puzzles(id)
--     "timer": (
--         { "kind": "none" }
--       | { "kind": "countup" }
--       | { "kind": "countdown", "seconds": <int 1..3600> }
--     )
--   }
--
-- Title formula: "#<source_id> <nyt_date> (<TILE1>/<TILE2>)" where
-- TILE1/TILE2 are the first 2 alphabetical tiles across all 16.
-- A puzzle is hard to remember by date alone; the tiles ground it
-- in something memorable ("oh, that one with BUCKS and HAIL").

create function connections.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  new_id uuid;
  s_puzzle_id uuid;
  puzzle_row connections.puzzles%rowtype;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
  first_two_tiles text;
  game_title text;
  effective_gametype text;
begin
  -- ─── Validate mode + player-count ────────────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. The FE manifest hides the
    -- compete Start button in 1-player clubs; this guard is the
    -- server-side catch. Matches psychicnum's pattern.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/connections/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup shape ────────────────────────────────
  -- Missing-vs-bad-value split so each rejection has a clean,
  -- field-named message. The FE's date-picker can't normally
  -- produce these, but a curious client could send anything.
  if (setup->>'puzzleId') is null then
    raise exception 'setup.puzzleId is required' using errcode = 'P0001';
  end if;
  begin
    s_puzzle_id := (setup->>'puzzleId')::uuid;
  exception when invalid_text_representation then
    raise exception 'setup.puzzleId must be a uuid'
      using errcode = 'P0001';
  end;

  -- Canonical timer-shape validation. See common.validate_timer
  -- for the accepted shapes and the exact raise messages.
  perform common.validate_timer(setup->'timer');

  -- Load the puzzle. The FK on connections.games.puzzle_id would also
  -- catch a bad id at INSERT time, but a clear "puzzle not found"
  -- error is friendlier than a foreign-key violation. RLS-free
  -- read (the table has a permissive SELECT grant).
  select * into puzzle_row from connections.puzzles
   where connections.puzzles.id = s_puzzle_id;
  if not found then
    raise exception 'puzzle not found' using errcode = 'P0002';
  end if;

  board_categories := puzzle_row.categories;

  -- Extract all 16 tiles from the puzzle's categories.
  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  -- Title = "#<source_id> <nyt_date> (<TILE1>/<TILE2>)" — same
  -- formula in both modes; the puzzle's NYT identity is mode-
  -- independent, and players still want a memorable handle on the
  -- game in the club list regardless of mode. Built BEFORE the
  -- shuffle since alphabetical order is order-independent.
  select string_agg(t, '/' order by t) into first_two_tiles
    from (
      select unnest(tile_order) as t
      order by 1
      limit 2
    ) first2;
  game_title := format('#%s %s (%s)',
                       puzzle_row.source_id,
                       puzzle_row.nyt_date,
                       first_two_tiles);

  -- Fisher-Yates shuffle for the display order.
  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  -- Mode-suffixed gametype string for common.games.gametype.
  effective_gametype := 'connections_' || mode;

  -- Common-side coordination: validates auth + caller membership +
  -- player_user_ids membership, inserts common.games (with title +
  -- setup) + game_players, returns the canonical id we'll use
  -- below.
  --
  -- Saved-default arg: connections's whole setup ({puzzleId, timer})
  -- is a per-club preference. Saving puzzleId is the anchor for
  -- the future "play the next puzzle in chronological order" UX —
  -- the dialog can read it and offer the next-day puzzle. Today's
  -- dialog seeds verbatim, which means re-opening the dialog
  -- shows the same puzzle until the user picks a different date.
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids, game_title,
    setup,
    setup
  );

  -- Insert with the canonical id. Note: id NOT default-generated;
  -- it comes from common.create_game above and FKs to
  -- common.games(id). Setup lives on common.games.setup, not
  -- duplicated here.
  -- Copy the puzzle's categories AND date onto the game (board + puzzle_date),
  -- so the game is self-contained — playable + self-describing even if the
  -- puzzle is later deleted (puzzle_id is a soft, provenance-only FK).
  insert into connections.games (id, club_handle, mode, puzzle_id, puzzle_date, board)
  values (
    new_id,
    target_club,
    mode,
    s_puzzle_id,
    puzzle_row.nyt_date,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order))
  );

  -- One player row per player_user_ids entry, mistake_count=0.
  -- Coop will increment all of them in lock-step on each wrong
  -- guess; compete only the guesser's. Same seeding either way.
  insert into connections.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  return query select new_id;
end;
$$;

revoke execute on function connections.create_game(text, jsonb, uuid[], text) from public;
grant execute on function connections.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- connections._maybe_finish_compete — end the game if nobody's alive
-- ============================================================
-- A compete game ends when NO player is still alive — alive means not
-- conceded and fewer than 4 mistakes (a solve is an immediate win,
-- handled inline in submit_guess). Shared by submit_guess (a 4th
-- mistake can eliminate the last player) and connections.concede (a
-- drop-out can leave nobody alive). Ends as a collective loss (nobody
-- solved). Returns true when it ended the game.
create function connections._maybe_finish_compete(target_game uuid)
returns boolean
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  player_results jsonb;
begin
  if exists (
    select 1
      from connections.players cp
      join common.game_players gp
        on gp.game_id = cp.game_id and gp.user_id = cp.user_id
     where cp.game_id = target_game
       and not gp.conceded
       and cp.mistake_count < 4
  ) then
    return false;
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;
  perform common.end_game(
    target_game, 'lost_compete',
    jsonb_build_object('outcome', 'lost_compete_mistakes'),
    player_results
  );
  return true;
end;
$$;

revoke execute on function connections._maybe_finish_compete(uuid) from public;

-- ============================================================
-- connections.submit_guess — record a submission (mode-aware)
-- ============================================================
-- The FE-knows model: the caller has already evaluated the guess
-- (using the public `board.categories`) and tells us the result
-- and, when result='correct', the matched category's rank. We
-- validate auth + payload shape + game state, then record + branch
-- on mode.
--
-- Coop branch:
--   - correct → insert guesses row (mode=coop, partial unique
--     catches dup-race); count(*) of correct rows; 4 → solved.
--   - wrong/oneAway → insert row; UPDATE every players row
--     mistake_count++; if mistake_count >= 4 → lost.
--
-- Compete branch:
--   - reject if caller's mistake_count >= 4 (eliminated).
--   - correct → insert row (mode=compete, partial unique on
--     (game_id, user_id, rank) catches per-player dup); count
--     caller's correct rows; 4 → solved_compete, caller wins,
--     others lose. Race-end: opponents with remaining lives
--     don't get to keep trying.
--   - wrong/oneAway → insert row; UPDATE caller's players row
--     mistake_count++; if MIN(mistake_count) across all players
--     >= 4 → lost_compete, everyone loses.
--
-- Concurrency: SELECT FOR UPDATE on connections.games serializes
-- concurrent submits across both modes. Two compete players
-- racing the same correct guess: first commits with that player
-- as winner; second sees play_state != 'playing' on its read
-- and raises 'game is not in progress'.

create function connections.submit_guess(
  target_game uuid,
  tiles text[],
  result text,
  matched_category_rank int default null
)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row connections.games%rowtype;
  current_play_state text;
  caller_mistakes int;
  caller_matched int;
  matched_count int;
  player_results jsonb;
  winner_name text;
begin
  -- Lock the game row for atomic mistake_count++ and play_state
  -- flips.
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate (deferred to after the lock). See
  -- common.require_game_player — checks the caller is actually
  -- IN this game (per common.game_players), not just a club
  -- member. A club member who didn't sit down at this game can
  -- still WATCH it (club-wide RLS) but can't act.
  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Light payload validation (mode-independent) ─────────
  -- Server-side checks for shape, not for rule correctness — the
  -- FE is trusted to apply the rules under the friends-only
  -- trust model (see CLAUDE.md). These guards catch malformed
  -- payloads (lengths, enum values) so the data we persist is at
  -- least well-typed.
  if tiles is null or array_length(tiles, 1) <> 4 then
    raise exception 'must submit exactly 4 tiles (got %)',
                    coalesce(array_length(tiles, 1), 0)
      using errcode = 'P0001';
  end if;

  if result not in ('correct', 'oneAway', 'wrong') then
    raise exception 'result must be correct, oneAway, or wrong (got %)', result
      using errcode = 'P0001';
  end if;

  if result = 'correct' then
    if matched_category_rank is null
       or matched_category_rank not between 0 and 3 then
      raise exception 'matched_category_rank must be 0..3 when result is correct'
        using errcode = 'P0001';
    end if;
  end if;

  -- ─── Caller's per-player row (compete needs the elim check) ─
  select mistake_count into caller_mistakes
    from connections.players
   where game_id = target_game and user_id = caller_id;
  if caller_mistakes is null then
    -- require_game_player passed but there's no players row;
    -- shouldn't happen since create_game seeds them. Defensive.
    raise exception 'no player row for caller' using errcode = 'P0002';
  end if;

  -- Compete-only: eliminated players can't submit. (In coop the
  -- whole game would already be terminal at mistake_count=4, so
  -- the play_state guard above catches it.)
  if g_row.mode = 'compete' and caller_mistakes >= 4 then
    raise exception 'you are eliminated from this game'
      using errcode = 'P0001';
  end if;

  -- ─── Correct guess ───────────────────────────────────────
  if result = 'correct' then
    -- Insert. The mode-aware partial unique indexes catch dup
    -- races: in coop a peer beat us to this rank; in compete the
    -- same player double-submitted. Either way, no-op.
    begin
      insert into connections.guesses
        (game_id, user_id, tiles, result, matched_category_rank, mode)
      values
        (target_game, caller_id, tiles, result, matched_category_rank, g_row.mode);
    exception when unique_violation then
      return;
    end;

    -- Persist the caller's own found count to their (public) players row so a
    -- compete opponent strip can show race progress (the "Found" metric).
    -- Computed once here; the compete win check below reuses caller_matched.
    select count(*) into caller_matched
      from connections.guesses gu
     where gu.game_id = target_game
       and gu.user_id = caller_id
       and gu.result = 'correct';
    update connections.players
       set matched_count = caller_matched
     where game_id = target_game and user_id = caller_id;

    if g_row.mode = 'coop' then
      -- Coop win check: 4 correct rows total ⇒ solved.
      select count(*) into matched_count
        from connections.guesses gu
       where gu.game_id = target_game and gu.result = 'correct';

      if matched_count >= 4 then
        select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
          into player_results
          from common.game_players
         where game_id = target_game;

        perform common.end_game(
          target_game,
          'solved',
          jsonb_build_object(
            'outcome', 'solved',
            'mistake_count', caller_mistakes,
            'matched_count', 4
          ),
          player_results
        );
      else
        perform common.update_state(
          target_game,
          'playing',
          jsonb_build_object(
            'mistake_count', caller_mistakes,
            'matched_count', matched_count
          )
        );
      end if;
    else
      -- Compete win check: caller's own correct count = 4 ⇒
      -- solved_compete, caller wins, everyone else loses. The
      -- race ends instantly — opponents with remaining lives
      -- don't get to keep trying. (caller_matched computed above.)
      if caller_matched >= 4 then
        select username into winner_name
          from common.profiles where user_id = caller_id;

        select jsonb_object_agg(
                 user_id::text,
                 case when user_id = caller_id
                      then '{"won": true}'::jsonb
                      else '{"won": false}'::jsonb
                 end)
          into player_results
          from common.game_players
         where game_id = target_game;

        perform common.end_game(
          target_game,
          'solved_compete',
          jsonb_build_object(
            'outcome', 'solved_compete',
            'winner_username', winner_name
          ),
          player_results
        );
      else
        -- Mid-game compete listing-label payload is intentionally
        -- minimal — "compete · in progress" doesn't need per-
        -- player numbers, and leaking per-opponent matched_count
        -- via the listing snapshot would violate the "mistakes
        -- only" visibility decision.
        perform common.update_state(
          target_game,
          'playing',
          '{}'::jsonb
        );
      end if;
    end if;

    return;
  end if;

  -- ─── Wrong / oneAway: cost a mistake ─────────────────────
  insert into connections.guesses
    (game_id, user_id, tiles, result, matched_category_rank, mode)
  values
    (target_game, caller_id, tiles, result, null, g_row.mode);

  if g_row.mode = 'coop' then
    -- Lock-step increment across every player row. Reading any
    -- one row after this UPDATE gives the canonical shared
    -- mistake_count.
    update connections.players
       set mistake_count = mistake_count + 1
     where game_id = target_game;

    -- Pick up the post-update value from any row (they're equal).
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game
     limit 1;

    select count(*) into matched_count
      from connections.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';

    if caller_mistakes >= 4 then
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;

      perform common.end_game(
        target_game,
        'lost',
        jsonb_build_object(
          'outcome', 'lost_mistakes',
          'mistake_count', caller_mistakes,
          'matched_count', matched_count
        ),
        player_results
      );
    else
      perform common.update_state(
        target_game,
        'playing',
        jsonb_build_object(
          'mistake_count', caller_mistakes,
          'matched_count', matched_count
        )
      );
    end if;
  else
    -- Compete: only the caller's row increments.
    update connections.players
       set mistake_count = mistake_count + 1
     where game_id = target_game and user_id = caller_id;

    -- Re-read caller's count for the elimination check below.
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game and user_id = caller_id;

    -- Collective-loss check: nobody alive (every player is eliminated
    -- — mistake_count >= 4 — or conceded) and nobody won ⇒ lost_compete.
    -- Shared with connections.concede (a drop-out can be the move that
    -- leaves nobody alive). If someone's still alive the game continues;
    -- the just-eliminated caller's FE renders the spectator-with-own-
    -- reveal view from their own row.
    if not connections._maybe_finish_compete(target_game) then
      perform common.update_state(target_game, 'playing', '{}'::jsonb);
    end if;
  end if;
end;
$$;

revoke execute on function connections.submit_guess(uuid, text[], text, int) from public;
grant execute on function connections.submit_guess(uuid, text[], text, int) to authenticated;

-- ============================================================
-- connections.concede — a player drops out of a compete race
-- ============================================================
-- connections is an ELIMINATION game (a player can be out — 4 mistakes
-- — without the table ending), so it can't use the generic
-- common.concede: after flipping the shared flag it re-runs its own
-- terminal check, which counts a conceder as "not alive" alongside the
-- eliminated. Compete only (coop is a team; it ends via the shared End).
create function connections.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
begin
  if (select mode from connections.games where id = target_game) <> 'compete' then
    raise exception 'concede is only for compete games' using errcode = 'P0001';
  end if;
  perform common._set_conceded(target_game);
  perform connections._maybe_finish_compete(target_game);
end;
$$;

revoke execute on function connections.concede(uuid) from public;
grant execute on function connections.concede(uuid) to authenticated;

-- ============================================================
-- connections.submit_timeout — countdown expiry handler (mode-aware)
-- ============================================================
-- Fired by the FE when the count-down timer hits 0. Everyone loses
-- regardless of mode — in coop it's the team losing the clock; in
-- compete the race ended with nobody having all-4'd, which we
-- treat as a collective loss (psychicnum-compete does the same).
--
-- Terminal play_state values: 'lost' (coop) / 'lost_compete'
-- (compete) so the FE can render mode-appropriate copy. In coop,
-- 'lost' is the same terminal status as 4-mistakes-losing — the
-- cause doesn't change the outcome shape, just the copy in the
-- loss banner; the FE can distinguish by looking at the mistakes
-- count vs. the absence of mistakes.
--
-- Concurrency: multiple clients may fire submit_timeout at the
-- same instant because each client's local timer hits 0 around
-- the same wall-clock moment. The `SELECT ... FOR UPDATE` lock
-- serializes them; whichever transaction commits first flips
-- play_state to terminal; subsequent calls see play_state !=
-- 'playing' and raise P0001. The FE swallows that "already lost"
-- rejection silently — it just means a peer beat us to the punch,
-- and realtime will propagate the loss to all clients.
--
-- common.end_game handles the cross-cutting termination work
-- (play_state + is_terminal + status + per-player results).

create function connections.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  g_row connections.games%rowtype;
  current_play_state text;
  player_results jsonb;
  terminal_state text;
  terminal_outcome text;
  matched_count int;
  caller_mistakes int;
begin
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate. See common.require_game_player.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  if g_row.mode = 'coop' then
    terminal_state := 'lost';
    terminal_outcome := 'lost_timeout';

    -- Coop final snapshot: mistake_count + matched_count for the
    -- listing label.
    select count(*) into matched_count
      from connections.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';
    select mistake_count into caller_mistakes
      from connections.players
     where game_id = target_game
     limit 1;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'mistake_count', caller_mistakes,
        'matched_count', matched_count
      ),
      player_results
    );
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'lost_compete_timeout';

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome
      ),
      player_results
    );
  end if;
end;
$$;

revoke execute on function connections.submit_timeout(uuid) from public;
grant execute on function connections.submit_timeout(uuid) to authenticated;

-- ============================================================
-- connections.end_game — manual stop
-- ============================================================
--
-- The intrinsic connections terminals are all "decided" outcomes:
-- coop solves/loses (4 matches / 4 mistakes / timeout), compete
-- has a winner (first to 4 matches) or a no-winner timeout. There
-- is no built-in "the friends just want to quit" path — so this
-- RPC is that explicit stop, fired from the per-game menu's "End
-- game" item.
--
-- Unlike submit_timeout (which writes a "you lost" terminal),
-- end_game is deliberately NEUTRAL: nobody won, nobody lost — the
-- group agreed to stop. We encode that as:
--   - play_state = 'ended' (a terminal state the FE/labelFor learn
--     to render in green, distinct from coop's 'lost' /
--     compete's 'lost_compete')
--   - status = {outcome:'manual', mode:<coop|compete>}
--   - every player's result = {"won": false}  (no winner — but the
--     FE shows the green "Game ended" modal regardless, because
--     "ended" is a neutral terminal, not a defeat)
--
-- Distinct from suspend (which leaves play_state='playing' and is
-- the "back to club, start something else later" path): end_game
-- writes a real terminal, so the game lands in the club's
-- completed section forever and the GameOverModal pops.
--
-- Same shape as submit_timeout with three differences:
--   - one branch for both modes (the per-player result is the bare
--     {"won": false}, identical coop and compete — there's no
--     mistake_count/matched_count snapshot to take because nothing
--     was "achieved", the friends just stopped)
--   - status.outcome = 'manual' (vs submit_timeout's 'lost_timeout'
--     / 'lost_compete_timeout')
--   - an EXPLICIT Realtime touch at the tail — see the long
--     comment there; this is the one wrinkle that submit_timeout
--     doesn't need but end_game does.
create function connections.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = connections, common, public, extensions
as $$
declare
  g_row connections.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from connections.games
   where connections.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate. Same as submit_timeout: any current
  -- game player can end the game (it's a group decision, not an
  -- owner-only action), but a club outsider can't.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a click racing a timeout /
    -- a solve) raises this and the FE swallows it the same way it
    -- does for submit_timeout's "already terminal" race.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Every player gets the bare {"won": false}. Identical in coop
  -- and compete — manual end has no winner in either mode. The
  -- neutral-vs-loss distinction lives entirely in play_state
  -- ('ended', not 'lost'/'lost_compete') + status.outcome
  -- ('manual'), which is what the FE branches on for the green
  -- terminal.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object(
      'outcome', 'manual',
      'mode', g_row.mode
    ),
    player_results
  );

  -- Realtime touch — REQUIRED here, and the one place connections's
  -- termination path differs from submit_guess/submit_timeout.
  --
  -- submit_guess and submit_timeout each also write a connections
  -- table (guesses / players) on their way to common.end_game, so
  -- the FE's useGame subscription (postgres_changes on
  -- connections.{games,guesses,players}) wakes up naturally. end_game
  -- writes ONLY common.games via common.end_game — no connections-
  -- schema write — so without this touch the FE would never
  -- refetch and the GameOverModal would never pop until a reload.
  --
  -- The self-set (club_handle = club_handle, a real not-null
  -- column on connections.games) is a semantic no-op but produces a
  -- WAL entry on connections.games that Realtime delivers to the
  -- games-table subscription. Same trick spellingbee.end_game /
  -- spellingbee.submit_timeout use; see those for the bug history.
  update connections.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function connections.end_game(uuid) from public;
grant execute on function connections.end_game(uuid) to authenticated;

-- Terminal-transition cleanup happens inline: submit_guess and
-- submit_timeout call common.end_game explicitly at the moment
-- the game is decided over. Single write path keeps all the
-- termination coordination (ended_at, play_state, is_terminal,
-- status, player_results) in one place.

-- ============================================================
-- Register connections with common.gametypes
-- ============================================================
-- Two rows — the coop/compete pair (sibling-manifest pattern).
-- create_club's RPC adds clubs_gametypes rows for both modes to
-- every new club automatically.

insert into common.gametypes (gametype, min_players) values
  ('connections_coop', 1),
  ('connections_compete', 2)
on conflict do nothing;
