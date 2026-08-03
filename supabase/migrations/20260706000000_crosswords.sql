-- ============================================================
-- crosswords — CrossPlay: collaborative / competitive crossword solving.
-- ============================================================
-- Coop + compete sibling pair (one schema, `mode` column), a port of
-- **the prior crossplay app** (`~/src/crossplay`) — every "crossplay" in this
-- file means THAT source app, never the CrossPlay brand this game ships under.
-- (Same word, two referents: the brand is user-facing, the app is where the
-- match semantics below were lifted from.)
-- A *puzzle* is the immutable imported template
-- (curated library or NYT-fetched); a *board* is one playthrough — a
-- `common.games` row plus per-cell fill rows.
--
-- The solution grid is server-only (shielded via column grants); check
-- and reveal are plain SECURITY DEFINER RPCs that read it. Every keystroke
-- is one `set_cell` UPDATE (no debounce) — the FE echoes optimistically
-- and reconciles the Postgres CDC stream by a per-cell `version`.
--
-- Match semantics (solve / check / reveal) are mirrored from crossplay's
-- `ws.ts` (`fillMatchesSolution`, `isPuzzleSolved`, `applyCheck`,
-- `applyReveal`), NOT from prose — the two subtleties that bite:
--   * the bare-first-letter answer is accepted for any multi-CHARACTER
--     candidate (keyed on the candidate string's length, `length(ans) > 1`) —
--     NOT on the number of candidates. So a normal rebus ("HEART") accepts
--     "H"; a Schrödinger cell whose candidates are all single letters does not.
--     (See the `_matches` docstring below — this header used to state the
--     inverted rule the C1 remediation fixed.)
--   * *solve* does NOT skip pencil cells (a correct pencil cell counts —
--     pencil is a confidence marker); only *check* skips pencil.
-- ============================================================

create schema if not exists crosswords;

-- ── crosswords.puzzles — the curated CLI puzzle library ───────────────
-- One row per imported puzzle. `meta` is the whole immutable template
-- (PuzzleMeta + the initial grid cells — numbers, blocks, circles,
-- shading, givens); `solution` is the shielded answer grid;
-- `content_hash` dedups re-imports. `source` only ever takes 'library':
-- every row here comes from the CLI import. NYT-by-date and Guardian games
-- are SELF-CONTAINED (the puzzle rides inline on the game, no row here), so
-- the constraint says exactly that. NOT to be confused with `setup.source`
-- on the game, which DOES take 'nyt' / 'guardian' — that names how a game
-- was started, not who wrote a library row.
create table crosswords.puzzles (
  id           uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  source       text not null check (source in ('library')),
  meta         jsonb not null,
  solution     jsonb not null,
  created_at   timestamptz not null default now()
);

alter table crosswords.puzzles enable row level security;

-- ── crosswords.games — one playthrough ────────────────────────────────
-- `meta`/`solution` are COPIED from the puzzle at create time so a game
-- survives puzzle retirement (`on delete set null`, per stackdown). The
-- copied `solution` is shielded by the same column-grant trick; it's
-- revealed only at terminal, through `games_state` below.
create table crosswords.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode        text not null check (mode in ('coop', 'compete')),
  puzzle_id   uuid references crosswords.puzzles(id) on delete set null,
  meta        jsonb not null,
  solution    jsonb not null,
  created_at  timestamptz not null default now()
);

alter table crosswords.games enable row level security;

-- ── crosswords.cells — the live per-cell fills ────────────────────────
-- Only fillable, NON-given cells get a row (blocks, numbering, decorations
-- and givens are static and live in `games.meta`), so a 15×15 has ~190
-- rows and every keystroke is a pure UPDATE. `owner_id` null = the shared
-- coop grid; a user id = that player's private compete grid.
--
-- The surrogate `id` PK exists for ONE reason: this table is
-- realtime-published, and a publication that replicates UPDATEs rejects
-- every UPDATE on a table without a valid replica identity. The logical
-- key can't be the PK (nullable `owner_id`) nor a `USING INDEX` identity
-- (same reason), and we'd rather not reach for REPLICA IDENTITY FULL when
-- a plain PK works: postgres_changes delivers the full NEW row on UPDATE
-- and we never DELETE a cell, so the OLD image is never needed.
create table crosswords.cells (
  id       uuid primary key default gen_random_uuid(),
  game_id  uuid not null references crosswords.games(id) on delete cascade,
  owner_id uuid references common.profiles(user_id) on delete cascade,
  row      smallint not null,
  col      smallint not null,
  fill     text,
  pencil   boolean not null default false,
  revealed boolean not null default false,
  wrong    boolean not null default false,
  -- Cryptic edge marks (docs/games/crosswords.md): a player-drawn
  -- word-break / hyphen on the cell's right / bottom edge. Display-only
  -- (ignored by solve/check/reveal); they ride on the cell row and sync
  -- through the same useCells CDC path as fills. Only fillable cells get
  -- rows, so — by design (plan option A) — givens can't carry a mark.
  mark_right  text check (mark_right in ('break', 'hyphen')),
  mark_bottom text check (mark_bottom in ('break', 'hyphen')),
  -- Bumped by trigger on every UPDATE; the FE applies an incoming CDC
  -- event only when event.version > local.version ("newer wins").
  version  bigint not null default 0,
  -- The logical one-row-per-cell key. `owner_id` is nullable (coop's
  -- shared grid), so NULLS NOT DISTINCT (PG 15+; 17 locally) treats null
  -- as a single value — the repo's first use of the feature.
  unique nulls not distinct (game_id, owner_id, row, col)
);

alter table crosswords.cells enable row level security;

-- Realtime: the FE subscribes to the cells (fills) via useCells. It does NOT
-- subscribe to crosswords.games — useGame is a one-shot fetch and status flows
-- through common.games (useCommonGame). So crosswords.games is deliberately
-- UNpublished (and the terminal RPCs carry no "Realtime touch" self-update):
-- there is no subscriber to wake. If a future feature needs the FE to react to
-- a crosswords.games change, re-add the publication line here AND a touch in the
-- writing RPC — a subscription to an unpublished table fails silently.
-- Publication membership is pinned by tests/crosswords/publication_test.sql.
alter publication supabase_realtime add table crosswords.cells;

-- ── Gametype registration ─────────────────────────────────────────────
-- `hides_solution`: this game keeps its answer covered when a game ends without
-- a win, so a replay of the same board is a genuine second try. The players
-- open it with the terminal Reveal (common.reveal_solution). See
-- common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('crosswords_coop', 1, true),
  ('crosswords_compete', 2, true)
on conflict do nothing;
