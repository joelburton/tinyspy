-- ============================================================
-- Wordknit — Connections-style word-grouping puzzle (POC)
-- ============================================================
--
-- A 4×4 board of 16 tiles split into 4 hidden categories of 4.
-- Players select 4 tiles, submit, and try to identify a category.
-- Correct guesses reveal the category as a colored band;
-- wrong/oneAway guesses cost a mistake. 4 mistakes lose; matching
-- all 4 categories wins.
--
-- "Wordknit" is the codename for the gametype (analogous to how
-- "Tinyspy" is the codename for Codenames Duet). The user-facing
-- copy can use whatever phrasing reads best; SQL / TypeScript /
-- folder names are all `wordknit`.
--
-- ┌─ POC scope ────────────────────────────────────────────┐
-- │ - Hardcoded 4-category board (words starting with      │
-- │   A/B/C/D)                                             │
-- │ - 4-mistake-lose, oneAway feedback, dup-doesn't-count  │
-- │ - Reveal-on-loss: the FE reads board.categories        │
-- │   directly, no separate RPC needed (see "FE-knows"     │
-- │   note below)                                          │
-- │ - Realtime via Postgres Changes for games + guesses +  │
-- │   Broadcast for shared selection + Presence for "is    │
-- │   everyone here" gate                                  │
-- │ - No: hint, scratchpad, peer animations, calendar,     │
-- │   share dialog, "play next," shuffle, dup-banner stale │
-- │   detection, puzzle archive, paywall                   │
-- └────────────────────────────────────────────────────────┘
--
-- ┌─ The "FE-knows-the-answer" design decision ────────────┐
-- │ Unlike tinyspy and psychic-num — where the server      │
-- │ holds a secret and validates moves against it — the    │
-- │ wordknit board (categories + tile order) is publicly   │
-- │ readable. The FE has the answer key and evaluates      │
-- │ guesses locally. The submit_guess RPC trusts the FE's  │
-- │ verdict (correct / oneAway / wrong + the matched       │
-- │ category's rank) and just records it, applying         │
-- │ atomicity for shared state (mistake_count, and one-    │
-- │ correct-per-rank idempotency via a partial unique      │
-- │ index on guesses).                                     │
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
-- Depends on `common` (clubs, profiles, club_active_game,
-- is_club_member, gametypes). Per the removability invariant in
-- docs/common.md, common MUST NOT reference wordknit back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists wordknit;
grant usage on schema wordknit to authenticated;

-- ============================================================
-- wordknit.games
-- ============================================================
-- One row per playthrough. `board` is jsonb with shape
--   {
--     "categories": [{rank: 0..3, name: text, tiles: text[4]}, ...4],
--     "tileOrder":  [text, text, ...16]
--   }
-- The whole board is publicly readable (see the "FE-knows" note
-- in the file header). Mutable state (mistake_count, status)
-- lives in normal columns so it can be partial-updated
-- atomically.

create table wordknit.games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references common.clubs(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'solved', 'lost')),
  mistake_count int not null default 0
    check (mistake_count between 0 and 4),
  board jsonb not null,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index wordknit_games_club_id_idx on wordknit.games (club_id);

-- ============================================================
-- wordknit.guesses — append-only log
-- ============================================================
-- One row per submit. `matched_category_rank` is non-null iff
-- result = 'correct' — the rank (0..3) of the category that was
-- matched. Duplicate submissions (same 4-tile set) are filtered
-- on the FE side (the client has full game state including the
-- guess log), so the RPC just records what it's told.

create table wordknit.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references wordknit.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  tiles text[] not null,
  result text not null check (result in ('correct', 'oneAway', 'wrong')),
  matched_category_rank int
    check (matched_category_rank between 0 and 3),
  guessed_at timestamptz not null default now()
);

create index wordknit_guesses_game_id_idx on wordknit.guesses (game_id);

-- One-correct-per-rank-per-game: partial unique index over the
-- 'correct' rows of `guesses`. This is the race idempotency
-- enforcer — when two players both submit a correct guess for
-- the same category at the same instant, the second INSERT
-- raises unique_violation, which submit_guess catches and
-- treats as "already matched, no-op."
--
-- Replaces the old (game_id, level) PK on a separate
-- found_groups table. Killing that table left this constraint
-- without a home; the partial index does the same job (one row
-- per (game, rank) when result='correct') with no second table
-- to fan postgres-changes events out of.
create unique index wordknit_guesses_one_correct_per_rank
  on wordknit.guesses (game_id, matched_category_rank)
  where result = 'correct';

-- ============================================================
-- RLS
-- ============================================================
-- Same shape as psychic-num: SELECT gated on club membership,
-- no INSERT/UPDATE/DELETE policies (writes go through the
-- security-definer RPCs).

alter table wordknit.games enable row level security;
alter table wordknit.guesses enable row level security;

create policy games_select on wordknit.games
  for select to authenticated
  using (common.is_club_member(club_id));

create policy guesses_select on wordknit.guesses
  for select to authenticated
  using (
    exists (
      select 1 from wordknit.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_id)
    )
  );

grant select on wordknit.games to authenticated;
grant select on wordknit.guesses to authenticated;

-- ============================================================
-- Realtime publication
-- ============================================================
-- Two tables broadcast so the FE can subscribe to:
--   games    status flips, mistake_count increments
--   guesses  new guess submissions (including correct ones —
--            which is how the FE learns a category was matched,
--            now that there's no separate found_groups table)

alter publication supabase_realtime add table wordknit.games;
alter publication supabase_realtime add table wordknit.guesses;

-- ============================================================
-- wordknit.create_game — start a new game in a club
-- ============================================================
-- POC: builds a hardcoded 4-category board (words starting with
-- A/B/C/D, four each) and a shuffled tile order. Future work
-- will swap the body for a date-picker + puzzle-database lookup;
-- the manifest's setup dialog already gestures at this with a
-- placeholder message.

create function wordknit.create_game(target_club uuid, config jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
  board_categories jsonb;
  tile_order text[];
  j int;
  tmp text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from common.club_members
     where club_id = target_club and user_id = caller_id
  ) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  -- No member-count check — wordknit plays with any club size.
  -- Must agree with the `numberOfPlayers: [1, null]` declaration
  -- in src/wordknit/manifest.ts. See docs/code-conventions.md →
  -- "Per-game player counts" for the cross-reference convention.

  -- Hardcoded POC board. Ranks 0..3 map to NYT yellow/green/
  -- blue/purple in the FE's theme.css. The categories are obvious
  -- ("words starting with A") to keep the POC trivially solvable
  -- while we shake out the wiring.
  board_categories := $json$[
    {"rank": 0, "name": "Words starting with A",
     "tiles": ["ALPHA","ANGEL","APPLE","ARROW"]},
    {"rank": 1, "name": "Words starting with B",
     "tiles": ["BANANA","BIRCH","BREAD","BRICK"]},
    {"rank": 2, "name": "Words starting with C",
     "tiles": ["CASTLE","CIRCLE","CLOUD","CROWN"]},
    {"rank": 3, "name": "Words starting with D",
     "tiles": ["DAGGER","DELTA","DIAMOND","DRAGON"]}
  ]$json$::jsonb;

  -- Extract all 16 tiles and Fisher-Yates shuffle for the
  -- display order.
  select array_agg(t)
    into tile_order
    from jsonb_array_elements(board_categories) c,
         jsonb_array_elements_text(c->'tiles') t;

  for i in reverse 16..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tile_order[i];
    tile_order[i] := tile_order[j];
    tile_order[j] := tmp;
  end loop;

  insert into wordknit.games (club_id, board, config)
  values (
    target_club,
    jsonb_build_object('categories', board_categories,
                       'tileOrder',  to_jsonb(tile_order)),
    config
  )
  returning games.id into new_id;

  -- Upsert into club_active_game — auto-pauses any prior active
  -- game for this club by overwriting the pointer.
  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'wordknit', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function wordknit.create_game(uuid, jsonb) from public;
grant execute on function wordknit.create_game(uuid, jsonb) to authenticated;

-- ============================================================
-- wordknit.submit_guess — record a submission
-- ============================================================
-- The FE-knows model: the caller has already evaluated the guess
-- (using the public `board.categories`) and tells us the result
-- and, when result='correct', the matched category's rank. We:
--
--   1. validate authorization + game state
--   2. light-validate the payload shape (4 tiles, valid result
--      enum, rank present iff correct)
--   3. for 'correct': insert into guesses (the partial unique
--      index on (game_id, matched_category_rank) where
--      result='correct' acts as the race-idempotency check),
--      then count correct rows to detect the win
--   4. for 'wrong' / 'oneAway': record the guess,
--      mistake_count++, check loss
--
-- The SELECT FOR UPDATE on the games row serializes concurrent
-- submissions: two players both clicking Submit at the same
-- instant both land on the same row lock, the first commits,
-- the second sees the updated state (status or mistake_count)
-- before its writes.
--
-- The matched_category_rank CHECK constraint on the column
-- (0..3) already enforces a valid range, and every board has
-- exactly 4 categories ranked 0..3 by construction — so we
-- don't need a separate runtime "rank exists in board" check
-- the way the old code did when it had to look up the group_obj
-- to populate found_groups.

create function wordknit.submit_guess(
  target_game uuid,
  tiles text[],
  result text,
  matched_category_rank int default null
)
returns void
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row wordknit.games%rowtype;
  matched_count int;
  new_mistake_count int;
  new_status text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  -- Lock the game row for atomic mistake_count++ and status
  -- flips.
  select * into g_row from wordknit.games
   where wordknit.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  if not common.is_club_member(g_row.club_id) then
    raise exception 'not a member of this club' using errcode = '42501';
  end if;

  if g_row.status <> 'in_progress' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Light payload validation ─────────────────────────
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

    -- Idempotent insert: the partial unique index on
    -- (game_id, matched_category_rank) where result='correct'
    -- raises unique_violation if a peer beat us to it. We catch
    -- it and bail without erroring out to the second caller —
    -- they saw the same correct visual; recording the match
    -- once is enough. The win check is skipped on this path
    -- because the first caller's transaction already ran it.
    begin
      insert into wordknit.guesses
        (game_id, user_id, tiles, result, matched_category_rank)
      values
        (target_game, caller_id, tiles, result, matched_category_rank);
    exception when unique_violation then
      return;
    end;

    -- Win check: 4 correct guesses ⇒ all categories matched ⇒
    -- solved. The `gu` alias disambiguates `result` — the
    -- function has a parameter of the same name in scope.
    select count(*) into matched_count
      from wordknit.guesses gu
     where gu.game_id = target_game and gu.result = 'correct';
    if matched_count >= 4 then
      update wordknit.games set status = 'solved'
       where wordknit.games.id = target_game;
    end if;

    return;
  end if;

  -- Wrong / oneAway: cost a mistake.
  new_mistake_count := g_row.mistake_count + 1;
  new_status := case
    when new_mistake_count >= 4 then 'lost'
    else 'in_progress'
  end;

  insert into wordknit.guesses
    (game_id, user_id, tiles, result, matched_category_rank)
  values
    (target_game, caller_id, tiles, result, null);

  update wordknit.games
    set mistake_count = new_mistake_count,
        status = new_status
   where wordknit.games.id = target_game;
end;
$$;

revoke execute on function wordknit.submit_guess(uuid, text[], text, int) from public;
grant execute on function wordknit.submit_guess(uuid, text[], text, int) to authenticated;

-- ============================================================
-- wordknit.clear_active_on_termination — trigger function
-- ============================================================
-- Fires when wordknit.games.status flips from 'in_progress' to
-- terminal. Deletes the matching common.club_active_game row so
-- the club's UI moves the game from Active to Completed. Same
-- pattern as tinyspy / psychic-num.

create function wordknit.clear_active_on_termination()
returns trigger
language plpgsql
security definer
set search_path = wordknit, common, public, extensions
as $$
begin
  if new.status in ('solved', 'lost')
     and old.status = 'in_progress' then
    delete from common.club_active_game
     where club_id = new.club_id
       and gametype = 'wordknit'
       and game_id = new.id;
  end if;
  return new;
end;
$$;

create trigger clear_active_on_termination
  after update of status on wordknit.games
  for each row execute function wordknit.clear_active_on_termination();

-- ============================================================
-- Register the gametype with common.gametypes
-- ============================================================
-- Per the convention in 20260614000004_common_club_game_kinds.sql,
-- every gametype's baseline registers itself with an
-- ON CONFLICT DO NOTHING INSERT. handle_new_user / create_club
-- then populate club_game_kinds for new clubs with every
-- registered gametype.

insert into common.gametypes (gametype) values ('wordknit')
on conflict do nothing;
