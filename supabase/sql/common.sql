-- ============================================================
-- common — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for common. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260615000000_common.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

-- Authenticated users need usage on the schema so PostgREST can
-- expose tables and RPCs under it.
grant usage on schema common to authenticated;

-- Which gametypes a freshly-created club should be enrolled in
-- (i.e. which Start buttons it should offer). Two filters:
--   - `default_enroll` — the registry's off-by-default flag (psychicnum,
--     the architecture-exercise toy). Off-by-default, not banned: the
--     club-settings games editor (set_club_gametypes) can opt back in.
--   - Solo clubs — handle prefixed '=', see common.clubs — have a single
--     member, so they only get gametypes playable by one person
--     (`min_players <= 1`); friend clubs get everything that remains.
-- Centralizing both rules here keeps claim_username, create_club, and
-- the per-game backfills from drifting apart.
-- Returns a one-column `gametype` set so callers can `select ...,
-- gametype from common.default_gametypes_for_club(handle)` directly
-- (a bare `returns setof text` would expose the column under the
-- function's name, not `gametype`).
create or replace function common.default_gametypes_for_club(target_handle text)
returns table(gametype text)
language sql
stable
set search_path = common, public, extensions
as $$
  select gametype
    from common.gametypes
   where default_enroll
     and (target_handle not like '=%' or min_players <= 1)
$$;
revoke execute on function common.default_gametypes_for_club(text) from public;

-- Keep `last_active_at` current on EVERY update to a games row, without any
-- RPC having to remember to. A BEFORE UPDATE trigger that stamps now() is
-- forget-proof in a way imperative `set last_active_at = now()` is not — the
-- prompt for this was a stackdown move path that wrote its own schema and
-- updated the games row's title (so the timestamp rode along) but had no
-- imperative bump of its own. now() (= transaction_timestamp) matches
-- started_at / ended_at, so all three read consistently within a transaction.
create or replace function common.touch_games_last_active()
returns trigger
language plpgsql
as $$
begin
  new.last_active_at := now();
  return new;
end;
$$;
revoke execute on function common.touch_games_last_active() from public;

drop trigger if exists games_touch_last_active on common.games;
create trigger games_touch_last_active
  before update on common.games
  for each row
  execute function common.touch_games_last_active();

-- Read-only to members (the FE seeds its initial display from
-- `ticks`); writes go exclusively through common.tick_timer. RLS
-- (members-of-the-game's-club) is enabled in the policy section
-- below, alongside the other tables — it gates on is_club_member,
-- which isn't defined yet here.
grant select on common.timers to authenticated;

create or replace function common.is_club_member(target_club text)
returns boolean
language sql
security definer
set search_path = common, public, extensions
stable
as $$
  select exists (
    select 1 from common.clubs_members
    where club_handle = target_club and user_id = auth.uid()
  );
$$;
-- GRANTED to authenticated: every gametype's RLS policy calls this
-- (`using (common.is_club_member(club_handle))`), and a policy runs as the
-- INVOKER — so without the grant every club-scoped select fails outright.
revoke execute on function common.is_club_member(text) from public;
grant execute on function common.is_club_member(text) to authenticated;

-- INTENTIONAL: any signed-in user can read any profile. Username
-- is public; there's no sensitive data on profiles today. Required
-- for club creation — when you type "leah" into the new-club form,
-- the FE has to be able to resolve "leah" → user_id BEFORE you
-- share a club with her, which rules out any "only people I share
-- a club with" row-tightening. The right axis is which COLUMNS
-- get exposed, not which rows.
--
-- ┌─ STANDING RULE, and the reason this is a comment and not a
-- │  deferred-register entry: it has a TRIGGER, not a due date.
-- │
-- │  ADDING A COLUMN TO THIS TABLE THAT ISN'T PUBLIC MEANS DOING
-- │  THE VIEW FIRST. All four columns today (user_id, username,
-- │  color, created_at) are public by design — username + color
-- │  ARE the player-identity vocabulary rendered to every club
-- │  member, and user_id has to be resolvable for club creation —
-- │  so a "safe columns only" view would select 4 of 4 and reduce
-- │  exposure by exactly nothing. That's why it isn't built.
-- │
-- │  The move, when a real-name / settings / email-derived column
-- │  arrives: revoke SELECT on common.profiles from authenticated,
-- │  add a `common.profiles_public` view over the genuinely public
-- │  columns, and point the FE's profile reads at it (~11 call
-- │  sites). Security-definer RPCs that need the full row keep
-- │  reading the base table, so they're unaffected.
-- └─ (Reviewed 2026-08-02: still nothing sensitive here.)
drop policy if exists profiles_select_authenticated on common.profiles;
create policy profiles_select_authenticated on common.profiles
  for select to authenticated using (true);

-- Timers: readable by members of the game's club (the FE seeds its
-- initial timer display from `ticks`). Writes go through
-- common.tick_timer only — no INSERT/UPDATE policy.
drop policy if exists timers_select on common.timers;
create policy timers_select on common.timers
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = timers.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No UPDATE policy on profiles. `username` is immutable in v1 (change
-- it by delete-and-recreate). `color` IS changeable, but only through
-- the security-definer `common.update_profile_color` RPC (caller-
-- scoped), so no direct-UPDATE policy is needed — writes go through the
-- RPC like every other mutation.

drop policy if exists clubs_select on common.clubs;
create policy clubs_select on common.clubs
  for select to authenticated
  using (common.is_club_member(handle));

-- `user_id = auth.uid()` covers your OWN membership rows in addition to
-- the club-wide roster. It's mostly redundant with is_club_member (your
-- row is in a club you're in) — except for the one case that matters for
-- the HomePage live clubs list: when you're REMOVED from a club, Realtime
-- evaluates this policy against the DELETE event as the now-ex-member, so
-- is_club_member(club_handle) is already false and you'd never see your
-- own removal. Matching on your user_id (carried in the PK / replica
-- identity) lets the DELETE through so the list updates without a refresh.
-- Seeing your own membership facts is never a leak. is_club_member is
-- SECURITY DEFINER (bypasses this policy) so there's no recursion.
drop policy if exists clubs_members_select on common.clubs_members;
create policy clubs_members_select on common.clubs_members
  for select to authenticated
  using (user_id = (select auth.uid()) or common.is_club_member(club_handle));

drop policy if exists messages_select on common.messages;
create policy messages_select on common.messages
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Permissive read on gametypes — gametype identifiers are not
-- sensitive, and the FE needs to discover them anyway (the
-- registry table mirrors what src/games.ts declares on the FE
-- side).
drop policy if exists gametypes_select on common.gametypes;
create policy gametypes_select on common.gametypes
  for select to authenticated using (true);

drop policy if exists clubs_gametypes_select on common.clubs_gametypes;
create policy clubs_gametypes_select on common.clubs_gametypes
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Game records are club-wide: any club member can see every game
-- ever played in the club, regardless of whether they were one of
-- the players themselves. "History belongs to the club." Same
-- model as messages — chat threads span game playings and aren't
-- per-game-private.
drop policy if exists games_select on common.games;
create policy games_select on common.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Game-player records inherit visibility from their parent game.
-- The EXISTS subquery mirrors the per-gametype `*_select` policy
-- shape (psychicnum.guesses, connections.guesses, etc.).
drop policy if exists game_players_select on common.game_players;
create policy game_players_select on common.game_players
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = game_players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No insert/update/delete policies on any of these tables. Writes
-- go through the security-definer RPCs defined below (create_club,
-- send_message, the create_game/end_game game-lifecycle helpers
-- called from each gametype's RPCs).

grant select on common.profiles                to authenticated;
grant select on common.clubs                   to authenticated;
grant select on common.clubs_members           to authenticated;
grant select on common.gametypes               to authenticated;
grant select on common.games                   to authenticated;
grant select on common.game_players            to authenticated;
grant select on common.clubs_gametypes         to authenticated;
grant select on common.messages                to authenticated;
grant select on common.game_scratchpads to authenticated;

create or replace function common._bump_scratchpad_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;
revoke execute on function common._bump_scratchpad_version() from public;

drop trigger if exists game_scratchpads_bump_version on common.game_scratchpads;
create trigger game_scratchpads_bump_version
  before update on common.game_scratchpads
  for each row execute function common._bump_scratchpad_version();

-- A game player reads the shared pad (owner null) + their OWN private pad;
-- never another player's private pad. Writes go through set_scratchpad
-- (definer), which bypasses RLS, so there's no write policy.
drop policy if exists game_scratchpads_select on common.game_scratchpads;
create policy game_scratchpads_select on common.game_scratchpads
  for select to authenticated
  using (
    (owner_id is null or owner_id = (select auth.uid()))
    and exists (
      select 1 from common.game_players gp
       where gp.game_id = game_scratchpads.game_id and gp.user_id = (select auth.uid())
    )
  );

-- Replace the pad body for (game, owner). The shared pad (p_owner_id null) is
-- writable by any player; a private pad only by its owner. Guarded on
-- membership + play state; the FE debounces this full-text flush (the pad is
-- small + one-writer-at-a-time, so no OT/CRDT). Returns the new version so
-- the FE adopts it and its own CDC echo is a no-op.
create or replace function common.set_scratchpad(target_game uuid, p_owner_id uuid, p_body text)
returns bigint
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_version bigint;
begin
  caller_id := common.require_game_player(target_game);
  if p_owner_id is not null and p_owner_id <> caller_id then
    raise exception 'not-your-scratchpad|' using errcode = '42501',
      detail = 'scratchpad writes are owner-only';
  end if;
  if (select play_state from common.games where id = target_game) is distinct from 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;
  if char_length(coalesce(p_body, '')) > 10000 then
    raise exception 'scratchpad-too-long|10000|' using errcode = 'P0001',
      detail = 'scratchpad body exceeds the cap';
  end if;

  insert into common.game_scratchpads (game_id, owner_id, body)
  values (target_game, p_owner_id, coalesce(p_body, ''))
  on conflict on constraint game_scratchpads_owner_key
    do update set body = excluded.body
  returning version into v_version;
  return v_version;
end;
$$;
revoke execute on function common.set_scratchpad(uuid, uuid, text) from public;
grant execute on function common.set_scratchpad(uuid, uuid, text) to authenticated;

-- ============================================================
-- common.slugify_club_name — user-typed name → URL handle
-- ============================================================
--
-- Rules:
--   - lowercase
--   - any run of non-alphanumeric characters collapses to a single '-'
--   - leading / trailing '-' stripped
--   - capped to 40 chars
--
-- The "non-alphanumeric → '-'" rule is what gives us namespace
-- separation from solo clubs. A user typing "=joel" produces the
-- handle "joel" — the '=' was treated like any other separator.
-- Solo clubs use literal '=<username>' handles set directly by the
-- new-user trigger (NOT routed through this function), so they
-- live in a slug-space user input cannot reach.
--
-- Marked `immutable` so Postgres can use it in indexed expressions
-- if we ever want a generated column or expression index.

create or replace function common.slugify_club_name(name text)
returns text
language sql
immutable
as $$
  select substr(
    regexp_replace(
      regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$', '', 'g'
    ),
    1, 40
  );
$$;
revoke execute on function common.slugify_club_name(text) from public;

-- ============================================================
-- common.color_for_username — deterministic palette pick
-- ============================================================
--
-- Maps a username to one of the 8 profile palette names by
-- hashing the string and indexing into the palette array.
-- Deterministic: the same username always yields the same color,
-- so the choice is stable across signup, db:reset, and test
-- fixtures.
--
-- The palette array MUST stay in sync with the check constraint
-- on common.profiles.color — if a new name is added, update
-- both AND consider what should happen to existing rows whose
-- old hash now maps differently. (Today's friends-only scale
-- makes "wipe and rebuild" the answer; if production data ever
-- exists, this becomes a real migration concern.)
--
-- `abs(hashtext(...))` keeps the modulo positive without
-- bringing in a CASE or COALESCE — hashtext can return negative
-- integers. The +1 shifts from PostgreSQL's 1-based array
-- indexing.
--
-- Marked `immutable` so it composes cleanly into INSERT
-- expressions (used by claim_username below).

create or replace function common.color_for_username(username text)
returns text
language sql
immutable
as $$
  select (array[
    'red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink'
  ])[(abs(hashtext(username)) % 8) + 1];
$$;
revoke execute on function common.color_for_username(text) from public;

-- ============================================================
-- Helpers for game RPCs
-- ============================================================
-- Per-game RPCs share a few load-bearing patterns: auth + club-
-- membership gating, canonical timer-setup validation, the
-- two-write coordination of "header in common.games + detail in
-- <gametype>.games" at create-game time, and the terminal-
-- transition writes at game-end. Lifting these into common keeps
-- the per-game RPCs focused on game-specific mechanics and ensures
-- the canonical error messages and behavior stay identical across
-- gametypes.
--
-- Each helper is security-definer + granted to authenticated so
-- per-game RPCs (themselves security-definer) can call them. The
-- FE has no reason to invoke them directly.
--
-- Convention: lift when N=3 callers would converge. Today the
-- three callers are codenamesduet, psychicnum, connections. A future
-- gametype follows the same pattern.

-- ─── common.require_club_member ────────────────────────
-- "Caller must be authenticated AND a member of target_club."
-- Returns the caller's user_id — the calling RPC typically
-- needs it for downstream inserts.
--
-- Raises (both 42501):
--   - 'must be authenticated'      when auth.uid() is null
--   - 'not a member of this club'  when not in common.clubs_members
--
-- security definer so the membership lookup bypasses RLS, the
-- same way is_club_member does.

create or replace function common.require_club_member(target_club text)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'not-authenticated|' using errcode = '42501',
      detail = 'auth.uid() is null';
  end if;

  if not exists (
    select 1 from common.clubs_members
    where club_handle = target_club and user_id = caller_id
  ) then
    raise exception 'not-club-member|' using errcode = '42501',
      detail = 'caller is not in common.club_members for this club';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated. SECURITY DEFINER chains (RPCs call
-- this helper) run with the helper-owner's privileges and can
-- call it; direct authenticated calls are blocked, keeping the
-- function out of PostgREST's exposed surface.
revoke execute on function common.require_club_member(text) from public;

-- ─── common.require_valid_timer ─────────────────────────────
-- Validates a jsonb timer object against the canonical shape
-- shared across games:
--
--   { "kind": "none" }
-- | { "kind": "countup" }
-- | { "kind": "countdown", "seconds": <int 1..3600> }
--
-- The argument is the timer *subobject* (typically
-- `setup->'timer'`), not the full setup blob, so games can place
-- timer wherever they want and the helper stays agnostic about
-- the surrounding key.
--
-- Raises (all P0001):
--   - 'setup.timer is required'                          when null
--   - 'setup.timer.kind must be none, countup, or countdown (got X)'
--   - 'setup.timer.seconds is required for countdown'
--   - 'setup.timer.seconds must be 1..3600 (got X)'
--
-- The error-message path uses 'setup.timer.*' because all current
-- games place timer at setup.timer. A future game with a different
-- nesting would either accept the slight message mismatch or write
-- its own validator — the canonical *shape* is the contract here,
-- not the path string in error messages.

create or replace function common.require_valid_timer(timer jsonb)
returns void
language plpgsql
immutable
as $$
declare
  timer_kind text;
  timer_seconds int;
begin
  if timer is null then
    raise exception 'missing-timer|' using errcode = 'P0001',
      detail = 'setup.timer absent';
  end if;

  timer_kind := timer->>'kind';
  -- Explicit null check: `NULL not in (...)` returns NULL, not
  -- TRUE, so without this the "missing kind" case would fall
  -- through the next check unraised. Separate "is required" vs
  -- "must be" messages give clearer FE error display.
  if timer_kind is null then
    raise exception 'missing-timer-kind|' using errcode = 'P0001',
      detail = 'setup.timer.kind absent';
  end if;
  if timer_kind not in ('none', 'countup', 'countdown') then
    raise exception 'bad-timer-kind|%|',
      timer_kind
      using errcode = 'P0001',
      detail = 'timer kind must be none, countup or countdown';
  end if;

  if timer_kind = 'countdown' then
    if (timer->>'seconds') is null then
      raise exception 'missing-timer-seconds|'
        using errcode = 'P0001',
      detail = 'countdown needs setup.timer.seconds';
    end if;
    timer_seconds := (timer->>'seconds')::int;
    if timer_seconds < 1 or timer_seconds > 3600 then
      raise exception 'bad-timer-seconds|%|',
        timer_seconds
        using errcode = 'P0001',
      detail = 'countdown seconds must be 1..3600';
    end if;
  end if;
end;
$$;

-- No grant to authenticated; internal helper (see
-- require_club_member's note).
revoke execute on function common.require_valid_timer(jsonb) from public;

-- ─── common.require_valid_mode ──────────────────────────────
-- Guard: a game's mode must be one of the two we support. Every
-- open (coop/compete) gametype's create_game repeated this exact
-- check; centralizing keeps the allowed-mode set — and the error
-- wording the pgTAP suites pin ('mode must be coop or compete
-- (got X)') — in one place. Mode is a top-level create_game
-- argument (NOT part of setup), so this takes the text directly
-- rather than a game id.
--
-- Only the sizing rules (compete needs ≥2, codenamesduet is
-- exactly-2, bananagrams is compete-only) stay per-gametype — those
-- genuinely differ; the coop-or-compete membership check does not.

create or replace function common.require_valid_mode(p_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_mode not in ('coop', 'compete') then
    raise exception 'bad-mode|%|', p_mode using errcode = 'P0001',
      detail = 'mode must be coop or compete';
  end if;
end;
$$;

revoke execute on function common.require_valid_mode(text) from public;

-- ─── common.require_compete ────────────────────────────
-- Guard: concede is a compete-only action. In coop the players are
-- a team, so a game ends via end_game (a mutual "we're done"), not
-- a per-player drop-out — conceding makes no sense. Every gametype's
-- `concede` wrapper repeated this gate with the same message
-- ('concede is only for compete games', pinned by the per-game
-- concede_test suites).
--
-- Takes the already-selected mode text rather than a game id: mode
-- lives in each gametype's own `<game>.games`, not common.games, so
-- the caller passes `(select mode from <game>.games where
-- id = target_game)`. Uses `<>` (not `is distinct from`) to preserve
-- the original inline semantics exactly — a null mode (missing game)
-- falls through unraised, as before, and the surrounding
-- existence/lock check handles that case.

create or replace function common.require_compete(p_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_mode <> 'compete' then
    raise exception 'concede-not-in-coop|' using errcode = 'P0001',
      detail = 'coop ends the whole table instead';
  end if;
end;
$$;

revoke execute on function common.require_compete(text) from public;

-- ─── common.create_game ────────────────────────────────
-- The common (header) half of starting a new game. Called by
-- every gametype's `<gametype>.create_game` first to get the
-- canonical game id; the gametype then inserts its detail row
-- using that id.
--
-- Responsibilities:
--   - Auth + caller membership in target_club (via
--     require_club_member). The caller must be a club member to
--     start a game in this club; they do NOT have to appear in
--     player_user_ids (the "Ada facilitates a game between Bea
--     and Cade" case is supported).
--   - Validate every uid in player_user_ids is a member of
--     target_club at game-create time. Players are frozen at
--     creation; later membership changes to clubs_members don't
--     affect this game's roster.
--   - Vacate any prior current-view game for this club (UPDATE
--     is_current_view = false on whichever row currently holds
--     it). This is the "auto-suspend the previous game" behavior;
--     the prior game stays in common.games but loses its
--     current-view flag.
--   - Insert the new common.games row with is_current_view = true.
--     The partial unique index on (club_handle) where is_current_view
--     = true guarantees the just-cleared step worked.
--   - Insert one common.game_players row per uid.
--   - Return the new game id.
--
-- Size constraints (exactly-2 for codenamesduet, at-least-1 for the
-- open games) live in the gametype's `<gametype>.create_game`,
-- not here — common doesn't know each gametype's rules. This
-- helper just enforces "all listed players are club members."
--
-- Raises:
--   - 42501  'must be authenticated' / 'not a member of this club'
--                                          (via require_club_member)
--   - P0001  'player_user_ids must not be empty'
--   - P0001  'player_user_ids contains non-members: X, Y'

-- ============================================================
-- common.wordle_colors — color ONE word against an answer, Wordle-style
--
-- KEEP THE NAME. It looks like a game codename in the shared layer — the one
-- thing naming.md's headline rule forbids — but it isn't: "Wordle colors" is
-- the term of art for this green/yellow/grey scheme, which NYT Wordle made
-- famous and which waffle uses because it's the recognizable convention, not
-- because it borrowed from our wordle. The name describes the OUTPUT, and a
-- reader who has seen a Wordle grid knows exactly what comes back. Ratified
-- 2026-08-02; don't "fix" it to letter_colors.
-- ============================================================
-- Returns a same-length string of 'g' (right letter, right spot), 'y' (in the
-- word, wrong spot) or 'x' (not in the word), with the standard duplicate-letter
-- accounting: a letter earns a yellow only if there's an unconsumed copy of it
-- in the answer after greens are removed. Two passes — greens first (they claim
-- their answer letter), yellows second from the leftover pool.
--
-- The single source of truth for this algorithm: wordle.submit_guess and
-- waffle.board_colors (per word) both call this instead of keeping a copy. Pinned by wordle/waffle `colors_test.sql` + the oracle-checked
-- TS port `src/waffle/lib/colors.ts` — this is exactly the kind of subtle
-- duplicated algorithm that must live in one place.
create or replace function common.wordle_colors(guess text, answer text)
returns text
language plpgsql
immutable
as $$
declare
  n    int := length(guess);
  res  text[] := array_fill('x'::text, array[n]);
  pool int[]  := array_fill(0, array[26]);   -- answer letters left after greens
  i    int;
  gc   text;
  ac   text;
  idx  int;
begin
  guess  := lower(guess);
  answer := lower(answer);

  -- Pass 1: greens. Non-green answer letters go into the pool.
  for i in 1..n loop
    gc := substr(guess, i, 1);
    ac := substr(answer, i, 1);
    if gc = ac then
      res[i] := 'g';
    else
      idx := ascii(ac) - 96;                 -- 'a' -> 1 .. 'z' -> 26
      if idx between 1 and 26 then
        pool[idx] := pool[idx] + 1;
      end if;
    end if;
  end loop;

  -- Pass 2: yellows, consuming from the pool left-to-right.
  for i in 1..n loop
    if res[i] <> 'g' then
      idx := ascii(substr(guess, i, 1)) - 96;
      if idx between 1 and 26 and pool[idx] > 0 then
        res[i]    := 'y';
        pool[idx] := pool[idx] - 1;
      end if;
    end if;
  end loop;

  return array_to_string(res, '');
end;
$$;
revoke execute on function common.wordle_colors(text, text) from public;

create or replace function common.create_game(
  target_club text,
  gametype text,
  player_user_ids uuid[],
  title text,
  setup jsonb,
  -- The savable subset of `setup` for the saved-defaults feature
  -- (see common.clubs_gametypes.default_setup). Each gametype's
  -- create_game decides what to pass: most pass `setup` verbatim;
  -- codenamesduet strips its `first_clue_giver_user_id` (per-game decision,
  -- not a per-club preference). Pass NULL to opt out of auto-save
  -- entirely for this call.
  --
  -- NAMED DELIBERATELY UNLIKE the column it feeds. Calling it `default_setup`
  -- to "match" makes the UPDATE below ambiguous — PL/pgSQL sees a parameter and
  -- a column of that name in the same statement and errors out. (Tried
  -- 2026-08-02; the whole suite went red.) The distinct name is load-bearing.
  saved_default jsonb
)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  new_id uuid;
  non_members text[];
begin
  -- Caller must be a club member (raises if not auth/not member).
  perform common.require_club_member(target_club);

  if player_user_ids is null
     or array_length(player_user_ids, 1) is null
     or array_length(player_user_ids, 1) = 0 then
    raise exception 'no-players|'
      using errcode = 'P0001',
      detail = 'player_user_ids was empty';
  end if;

  -- Identify any listed uid that isn't in clubs_members for this
  -- club. The COALESCE-to-empty-array guard keeps the IF below
  -- behaving when the result is null (no non-members).
  select coalesce(array_agg(uid::text), array[]::text[]) into non_members
  from unnest(player_user_ids) as uid
  where not exists (
    select 1 from common.clubs_members
     where club_handle = target_club and user_id = uid
  );

  if array_length(non_members, 1) > 0 then
    raise exception 'players-not-in-club|%|',
      array_to_string(non_members, ', ')
      using errcode = 'P0001',
      detail = 'every player must already be a club member';
  end if;

  -- Vacate the prior current-view game (if any) for this club —
  -- the partial unique index would reject the new
  -- is_current_view=true row otherwise. The previously-current
  -- game stays in common.games with is_current_view=false;
  -- it's now a suspended game (non-current, non-terminal). Pure
  -- pointer flip — no timer bookkeeping (see common.timers).
  update common.games
     set is_current_view = false
   where club_handle = target_club and is_current_view = true;

  -- Setup is passed in as-validated (each gametype's create_game
  -- does field-level checks + common.require_valid_timer before calling
  -- here). We just persist what we're handed. play_state defaults
  -- to 'playing'; is_terminal defaults to false. (The `gametype`
  -- on the right of VALUES resolves to the function parameter,
  -- not the column on the left — PostgreSQL knows column-list
  -- positions from value-list positions.)
  insert into common.games (club_handle, gametype, created_by, title, setup, is_current_view)
  values (target_club, gametype, auth.uid(), title, setup, true)
  returning id into new_id;

  -- Seed the additive game clock at zero. last_tick = now() so the
  -- first tick_timer call doesn't immediately jump (it needs a full
  -- real second to elapse before the first +1).
  insert into common.timers (game_id) values (new_id);

  insert into common.game_players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) as uid;

  -- Auto-save the saved subset to the (club, gametype) row in
  -- clubs_gametypes so the next setup dialog can pre-fill it.
  -- NULL opts this call out of saving (a gametype that doesn't
  -- want a saved-defaults UX passes NULL). On every successful
  -- create_game, the row's default_setup overwrites — there's
  -- no "save as default" gesture; the click on Start is the save.
  --
  -- The `create_game.gametype` qualifier (function-name, NOT
  -- schema.function-name) disambiguates the parameter from the
  -- column on the left of `=` in the WHERE clause — both are
  -- valid identifiers in scope here. Without it, PL/pgSQL would
  -- match the column.
  if saved_default is not null then
    update common.clubs_gametypes
       set default_setup = saved_default
     where club_handle = target_club
       and clubs_gametypes.gametype = create_game.gametype;
  end if;

  return new_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.create_game(text, text, uuid[], text, jsonb, jsonb) from public;

-- ─── common.require_game_player ───────────────────────
-- "Caller must be authenticated AND have a game_players row for
-- target_game." Used by mid-game RPCs (submit_guess, submit_clue,
-- etc.) where the question is "is this caller actually playing
-- this specific game" — finer than club membership, since with
-- the per-game player roster a club member who didn't sit down at
-- this game can't take actions in it (but can still watch via
-- the club-wide RLS on common.games).
--
-- Returns the caller's user_id, which mid-game RPCs use for
-- their downstream inserts.
--
-- Raises:
--   - 42501 'must be authenticated'    when auth.uid() is null
--   - 42501 'not playing this game'    when caller isn't in
--                                       common.game_players

create or replace function common.require_game_player(target_game uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'not-authenticated|' using errcode = '42501',
      detail = 'auth.uid() is null';
  end if;

  if not exists (
    select 1 from common.game_players
    where game_id = target_game and user_id = caller_id
  ) then
    raise exception 'not-a-player|' using errcode = '42501',
      detail = 'caller has no common.game_players row';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.require_game_player(uuid) from public;

-- ============================================================
-- Turn-order primitive — opt-in turn-by-turn for coop games
-- ============================================================
-- Free-for-all is the default and unchanged: common.games.current_turn_user_id
-- stays NULL and all three helpers below are inert. A coop game that opts in
-- (setup coop_style='turns') calls _assign_turn_order once at create-time to
-- seat the rotation; each ACCEPTED, non-terminal move then calls _advance_turn;
-- and each move RPC gates on _require_turn right after it locks the game row +
-- resolves the caller.
--
-- The whole rotation lives on the COMMON tables (game_players.turn_seat +
-- games.current_turn_user_id), so every gametype inherits it without a per-game
-- turn table — even wordiply, which has no players table of its own. This is
-- the common port of scrabble compete's own seat system (scrabble.games.
-- current_seat + scrabble._advance_turn); scrabble compete keeps that, coop
-- uses this, and the two coexist deliberately.

-- Seat the rotation for a freshly-created turn game. Seat 0 = the chosen
-- first player; everyone else is shuffled after them (only "who goes first"
-- is a setup choice — the rest is random, which is fine). Also sets the live
-- pointer to that first player.
create or replace function common._assign_turn_order(target_game uuid, first_user_id uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  -- row_number()-1 gives dense 0-based seats. Booleans sort false<true, so
  -- ordering by `(user_id = first_user_id) desc` puts the chosen player first
  -- (seat 0); random() orders the tail.
  update common.game_players gp
     set turn_seat = seated.seat
    from (
      select user_id,
             (row_number() over (
               order by (user_id = first_user_id) desc, random()
             ) - 1) as seat
        from common.game_players
       where game_id = target_game
    ) seated
   where gp.game_id = target_game
     and gp.user_id = seated.user_id;

  update common.games
     set current_turn_user_id = first_user_id
   where id = target_game;
end;
$$;

revoke execute on function common._assign_turn_order(uuid, uuid) from public;

-- Advance the pointer to the next player by turn_seat (wraps; skips conceded).
-- No-op when the game isn't a turn game (pointer null ⇒ no seats ⇒ nothing to
-- advance), so it's safe to call unconditionally on a game's accepted-move
-- path. skip-conceded is inert in coop (coop never concedes) — it's kept only
-- to mirror the scrabble port this is copied from, and to future-proof.
create or replace function common._advance_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  n_players int;
  cur_seat  int;
  next_seat int;
  i         int;
begin
  -- The current player's seat. Null ⇒ free-for-all (no rotation) ⇒ nothing to
  -- do. (Also null if the pointer somehow references a seatless player, which
  -- can't happen for an assigned turn game — defensive.)
  select gp.turn_seat into cur_seat
    from common.game_players gp
    join common.games g on g.id = gp.game_id
   where gp.game_id = target_game
     and gp.user_id = g.current_turn_user_id;
  if cur_seat is null then
    return;
  end if;

  select count(*) into n_players
    from common.game_players where game_id = target_game;

  -- Walk forward to the next non-conceded seat. With no conceders this is just
  -- (cur_seat + 1) % n. We never loop forever: the current player is itself a
  -- non-conceded seat, so at worst we wrap all the way back to them.
  next_seat := null;
  for i in 1..n_players loop
    select gp.turn_seat into next_seat
      from common.game_players gp
     where gp.game_id = target_game
       and gp.turn_seat = (cur_seat + i) % n_players
       and not gp.conceded;
    exit when next_seat is not null;
  end loop;

  if next_seat is not null then
    update common.games
       set current_turn_user_id = (
         select user_id from common.game_players
          where game_id = target_game and turn_seat = next_seat
       )
     where id = target_game;
  end if;
end;
$$;

revoke execute on function common._advance_turn(uuid) from public;

-- Gate a move on whose-turn-it-is. Raises P0001 'not your turn' when the game
-- is a turn game (pointer set) and the caller isn't the current player. No-op
-- for free-for-all (pointer null) and for solo (the sole player is always the
-- current player). Call it right after the move RPC locks the game row and
-- resolves the caller (common.require_game_player).
-- `_`-prefixed unlike the rest of the require_* gates, and deliberately so:
-- it belongs to the turn-order PRIMITIVES (_assign_turn_order / _advance_turn /
-- _require_turn), which share the prefix because they're the opt-in mechanism's
-- internals rather than the roster-wide gates every RPC calls.
create or replace function common._require_turn(target_game uuid, caller uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  cur uuid;
begin
  select current_turn_user_id into cur
    from common.games where id = target_game;
  if cur is not null and caller is distinct from cur then
    raise exception 'not-your-turn|' using errcode = 'P0001',
      detail = 'current_turn_user_id is another player';
  end if;
end;
$$;

revoke execute on function common._require_turn(uuid, uuid) from public;

-- ─── common.update_state ───────────────────────────────
-- The mid-game state-write helper. Per-gametype RPCs call this
-- after any state transition that's NOT a game-end — connections's
-- mistake-count bump, codenamesduet's sudden-death entry, psychicnum's
-- guesses_remaining decrement, etc. Updates `play_state` (the
-- gametype's enum value) + `status` (the listing-label jsonb) +
-- `is_terminal` (always false here by definition; the column
-- exists so the same write-pattern works for both mid-game and
-- end-game).
--
-- This is half of the "duplicate-write discipline": each
-- per-gametype RPC that mutates state writes BOTH its own
-- foo.games row (mistake_count, key_card, etc.) AND calls this
-- helper to mirror the listing-visible bits into common.games.
-- Same transaction; readers see a coherent snapshot.
--
-- Why play_state lives on common.games (not on the per-gametype
-- foo.games row): the club-page listing needs to query play_state
-- without joining to per-gametype tables. See docs/states.md →
-- "Where the two tables sit."
--
-- `status` MERGES (`||`), it does not replace. A caller passes only the
-- keys it is changing and everything else on the row survives. This is
-- forget-proofing of the same kind as the last_active_at trigger: the
-- replace-everything version silently DROPPED any key a later write
-- forgot to repeat, and it did — codenamesduet seeded `greens_found` at
-- create and the first `_end_turn` write erased it, so the club card
-- could never show how many agents were found. Merging means "add a
-- field to the listing label" is a one-line change at the one site that
-- knows the value, not an edit to every write in the gametype.
--
-- The merge is shallow (jsonb `||` replaces a key wholesale, it doesn't
-- deep-merge objects) — which is what we want: `leaderboard` arrays and
-- nested blobs are replaced as a unit.
--
-- A RESTART must not merge: a replayed game has to shed the finished
-- game's readouts entirely, so `common.reset_game` ASSIGNS the fresh
-- status rather than calling through here.

create or replace function common.update_state(
  target_game uuid,
  play_state text,
  status jsonb
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  -- last_active_at rides along automatically (games_touch_last_active).
  -- The status MERGE (see the header) — qualified as `games.status` to read
  -- the row's current value, since the bare name is the parameter.
  update common.games games
     set play_state = update_state.play_state,
         status = coalesce(games.status, '{}'::jsonb) || update_state.status,
         is_terminal = false
   where games.id = target_game;

  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.update_state(uuid, text, jsonb) from public;

-- ─── common.end_game ───────────────────────────────────
-- The terminal-transition counterpart to create_game + the
-- end-game half of the duplicate-write discipline. Called by
-- each gametype's RPC at the moment its game-specific rule says
-- "this game is over" — 4 mistakes in connections, assassin in
-- codenamesduet, last guess used in psychicnum, countdown expired,
-- etc. Writes:
--
--   - common.games.ended_at        = now()
--   - common.games.play_state      = play_state (the terminal
--                                     value: 'won', 'lost_timeout',
--                                     etc. — gametype-specific)
--   - common.games.is_terminal     = true
--   - common.games.status          = status (manifest-shaped jsonb
--                                     for the listing label)
--   - common.game_players.result for each user in player_results
--
-- Note: is_current_view is NOT cleared here. A finished game can
-- still have viewers reviewing it (the "we lost — let's look at
-- the unmatched bands" experience); the view-state lifecycle is
-- separate from terminal transition. is_current_view clears when
-- the last viewer actually leaves the page.
--
-- player_results is a jsonb object keyed by user_id string:
--
--   { "ada11111-...": {"won": true, "score": 12},
--     "bea22222-...": {"won": false} }
--
-- Each top-level value is the per-player outcome the gametype
-- defines — the helper just persists whatever jsonb it's handed.
--
-- Idempotency: a second call on an already-ended game is a no-op
-- on ended_at (left as the first call's value) and overwrites
-- status / play_state / player_results. The current pattern of
-- "termination fires once from one RPC" makes the idempotency
-- detail moot in practice.

create or replace function common.end_game(
  target_game uuid,
  play_state text,
  status jsonb,
  player_results jsonb
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  player_key text;
  player_result jsonb;
begin
  -- last_active_at rides along automatically (games_touch_last_active), so
  -- a finished game dates by its end time.
  --
  -- `status` MERGES, exactly like common.update_state (see its header for the
  -- why) — a terminal write states what the ENDING adds (the outcome, the
  -- winner, a final tally) and the mid-game readouts the last move left on the
  -- row survive underneath it. Qualified as `games.status` because the bare
  -- name is the parameter.
  update common.games games
     set ended_at = coalesce(games.ended_at, now()),
         play_state = end_game.play_state,
         is_terminal = true,
         status = coalesce(games.status, '{}'::jsonb) || end_game.status
   where games.id = target_game;

  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  -- Per-player results — iterate the jsonb object.
  if player_results is not null then
    for player_key, player_result in
      select * from jsonb_each(player_results)
    loop
      update common.game_players
         set result = player_result
       where game_id = target_game and user_id = player_key::uuid;
    end loop;
  end if;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common.end_game(uuid, text, jsonb, jsonb) from public;

-- ─── common.reveal_solution — REMOVED 2026-08-15 ───────────
-- Seeing the solution is a LOCAL, per-player display choice now, made in the FE
-- (docs/ui.md → Terminal results): a Reveal/Hide toggle each player works for
-- themselves, so one player looking doesn't open the answer on a partner who is
-- still thinking, and the board they actually finished with is always one click
-- away. Nothing is written, so there is no RPC and no flag — the whole
-- mechanism was a shared boolean this function set one way.
--
-- What the server still owes is the SHIELD, and every gametype that has one now
-- gates it on `is_terminal` (over for EVERYONE) — see waffle._solution_for et
-- al. That's the part that stops a conceded or already-finished player reading
-- the answer out to a race still running; who is LOOKING never was.
--
-- The drop is explicit because supabase/sql is re-applied, not diffed: deleting
-- the definition alone would leave the function sitting in every database that
-- ever ran it, prod included. The two COLUMNS it wrote are shape, so they go in
-- a forward migration (20260815000000_drop_solution_revealed.sql).
drop function if exists common.reveal_solution(uuid);

-- ─── common.reset_game ─────────────────────────────────────
-- The INVERSE of end_game: return a game to fresh, in-progress
-- state on the SAME row (no new game). For a gametype's "replay
-- this board" feature — the frozen puzzle/setup stays; only the
-- terminal + per-player outcome bookkeeping is undone. Writes:
--
--   - common.games.play_state  = 'playing'
--   - common.games.is_terminal = false
--   - common.games.ended_at    = null (it's in progress again)
--   - common.games.status      = status (the gametype's INITIAL
--                                 status jsonb — the same shape
--                                 create_game seeds)
--   - common.game_players.{result, conceded, conceded_at} cleared
--     for every player (undoes win/lose results + any concede)
--   - common.timers.ticks      = 0 — fresh start ⇒ fresh clock: a
--     countdown replays from the full duration, a countup from
--     0:00. (The FE's tick-merge accepts the big backward jump as
--     the deliberate reset it is — see useGameTimer.)
--
-- The gametype's OWN working-state reset (its per-game tables +
-- turn log) happens in the calling RPC; this helper only owns the
-- common-layer half, exactly as end_game does. Internal helper —
-- no grant to authenticated; the gametype's `replay_*` RPC is the
-- membership-guarded caller.
create or replace function common.reset_game(target_game uuid, status jsonb)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  -- status ASSIGNS here, deliberately — unlike common.update_state, which
  -- merges. A restart must shed every readout the finished game left behind
  -- (a final score, a winner's name, an outcome), so the caller passes the
  -- same fresh blob its create_game seeds and this overwrites wholesale.
  update common.games
     set play_state = 'playing',
         is_terminal = false,
         ended_at = null,
         status = reset_game.status
   where id = target_game;

  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  update common.game_players
     set result = null,
         conceded = false,
         conceded_at = null
   where game_id = target_game;

  -- Fresh start ⇒ fresh clock (see the header comment). last_tick renews so
  -- the next tick_timer call can't instantly advance off a stale anchor.
  update common.timers
     set ticks = 0,
         last_tick = now()
   where game_id = target_game;
end;
$$;

revoke execute on function common.reset_game(uuid, jsonb) from public;

-- ─── common._set_conceded ──────────────────────────────────
-- The shared first half of "a player concedes": guard the action
-- and flip the per-player `conceded` flag. Split out from
-- common.concede so that gametypes whose game-over rule is
-- game-specific (the ELIMINATION games — wordle, connections,
-- psychicnum, waffle — where a player can be "done" without the
-- table ending) can reuse the exact same guarded flag-flip and
-- then run their OWN terminal check + winner computation. The
-- non-elimination games (spellingbee, boggle, stackdown, scrabble,
-- bananagrams) don't need that and call common.concede below,
-- which pairs this with the generic "everyone's out" end.
--
-- Guards, in order:
--   - game exists + is locked FOR UPDATE (serialize concurrent
--     concedes / a concede racing a move that ends the game)
--   - caller is a player of this game
--   - the game isn't already over (is_terminal)
--   - the caller hasn't already conceded (idempotency: concede once)
--
-- Returns the caller's user_id (the concede RPCs use it downstream).
create or replace function common._set_conceded(target_game uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  is_over boolean;
  already boolean;
begin
  perform 1 from common.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  caller_id := common.require_game_player(target_game);

  select is_terminal into is_over from common.games where id = target_game;
  if is_over then
    raise exception 'already-ended|' using errcode = 'P0001',
      detail = 'play_state is already terminal';
  end if;

  select conceded into already
    from common.game_players
   where game_id = target_game and user_id = caller_id;
  if already then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'this player''s conceded flag is already set';
  end if;

  update common.game_players
     set conceded = true, conceded_at = now()
   where game_id = target_game and user_id = caller_id;

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper (reached via the
-- concede RPCs).
revoke execute on function common._set_conceded(uuid) from public;

-- ─── common.concede ────────────────────────────────────────
-- The player-drops-out action for compete games whose game-over
-- rule is NOT game-specific — i.e. games with no independent
-- per-player "eliminated" state, where the only reason a
-- non-conceded player isn't still racing is that they already
-- WON (which would have ended the game). For those
-- (spellingbee / boggle / stackdown / scrabble / bananagrams) the
-- active set is exactly "not conceded", so the whole game ends
-- precisely when the LAST active player concedes.
--
-- Semantics (docs/common.md → Concede): mark the caller out; if
-- anyone is still racing, return and let them finish (concede
-- NEVER ends the table for others). Only when the caller was the
-- last one standing does the game end — as a collective loss
-- (`lost_compete` for a sibling compete gametype, plain `lost` for a
-- single-mode one; everyone {"won": false}, outcome 'conceded'), the
-- same shape as a whole-table timeout. That's not "we all agreed to
-- stop": each player who wants out clicks Concede, and the final
-- click happens to be the one that ends it.
--
-- ELIMINATION games do NOT use this — they call common._set_conceded
-- and then their own terminal check (which counts conceded as
-- "done" alongside solved / out-of-guesses). See wordle.concede.
create or replace function common.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  player_results jsonb;
  lost_state text;
begin
  caller_id := common._set_conceded(target_game);

  -- Anyone still in the race? If so, the game continues for them.
  if exists (
    select 1 from common.game_players
     where game_id = target_game and not conceded
  ) then
    return;
  end if;

  -- The caller was the last active player → collective loss.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;

  -- Name the terminal in the caller's own vocabulary. A sibling compete
  -- gametype is registered as `<codename>_compete` and spells its collective
  -- loss `lost_compete` — the roster-wide suffix convention (states.md), and
  -- the same string the elimination games write from their own terminal
  -- checks. The single-mode games that borrow this RPC (bananagrams) have no
  -- suffix and no `_compete` half to their vocabulary, so they stay plain
  -- `lost`. Derived here rather than passed in by each wrapper: there's one
  -- rule, and a new game can't forget to follow it.
  select case when right(g.gametype, 8) = '_compete' then 'lost_compete' else 'lost' end
    into lost_state
    from common.games g where g.id = target_game;

  perform common.end_game(
    target_game, lost_state,
    jsonb_build_object('outcome', 'conceded'),
    player_results
  );
end;
$$;
revoke execute on function common.concede(uuid) from public;

grant execute on function common.concede(uuid) to authenticated;

-- ─── common.set_current_view ───────────────────────────────
-- Fired from the FE when the first viewer mounts a game's
-- GamePage. Sets common.games.is_current_view=true on this game
-- and clears it on any other game in the same club (the partial
-- unique index `(club_handle) where is_current_view=true` would
-- otherwise reject the new true).
--
-- Idempotent: re-mounting the already-current game writes the
-- same row's value back to true (still satisfies the index).
-- Concurrent mounts of two different games in the same club
-- serialize via the index — last writer wins, the loser's FE
-- realtime auto-nav pulls them into the winner's game.
--
-- Auth: caller must be a member of the game's club. We use
-- require_club_member rather than require_game_player so a
-- non-player club member can still view (and become the
-- current viewer of) a game they weren't seated in. Today's
-- seating model puts every club member in game_players for
-- every game, but the looser gate is the future-correct one.
--
-- Companion to unset_current_view (called when the last viewer
-- leaves). See docs/states.md → "Lifecycle: when
-- is_current_view flips" for the full story.

create or replace function common.set_current_view(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  perform common.require_club_member(target_club);

  -- Vacate any other current-view game for this club. Done first
  -- so the partial unique index doesn't reject the target's write.
  -- The `id <> target_game` clause keeps this a no-op when the
  -- target is already current.
  update common.games
     set is_current_view = false
   where club_handle = target_club
     and is_current_view = true
     and id <> target_game;

  -- Set the target current. Pure pointer flip — no timer work: the
  -- clock is the additive tick count in common.timers, which simply
  -- doesn't advance while nobody's viewing, so there's no idle
  -- window to fold here.
  update common.games
     set is_current_view = true
   where id = target_game
     and is_current_view = false;
end;
$$;

revoke execute on function common.set_current_view(uuid) from public;
grant execute on function common.set_current_view(uuid) to authenticated;

-- ─── common.unset_current_view ─────────────────────────────
-- Fired from the FE when the last viewer's tab is leaving a
-- GamePage (presence-sync sees only-me + I'm unmounting). Clears
-- is_current_view on the target game. Idempotent via the
-- `where is_current_view=true` guard: a second concurrent call
-- from another tab is a silent no-op.
--
-- Auth: same club_member gate as set_current_view — symmetry
-- matters and "you can flip your club's current pointer if
-- you're a member" is the right granularity.

create or replace function common.unset_current_view(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  perform common.require_club_member(target_club);

  -- Pure pointer flip. No timer work — the tick clock in
  -- common.timers stops advancing on its own once no one's viewing
  -- (nobody calls tick_timer), so there's no idle gap to stamp.
  update common.games
     set is_current_view = false
   where id = target_game
     and is_current_view = true;
end;
$$;

revoke execute on function common.unset_current_view(uuid) from public;
grant execute on function common.unset_current_view(uuid) to authenticated;

-- ─── common.tick_timer ─────────────────────────────────────
-- The game clock's one writer. Every actively-playing client calls
-- this once a second; it advances common.timers.ticks by AT MOST 1
-- per real second and returns the current count.
--
-- The conditional (`now() - last_tick >= 1 second`) does all the
-- work:
--   - **Dedup across players.** Three clients calling within the
--     same second: only the first passes the WHERE and advances;
--     the other two no-op and just read the value back. So the
--     clock runs at ~1 tick/sec no matter how many are driving it —
--     no leader election needed.
--   - **Pause / idle are free.** When the game is paused, or nobody
--     is viewing it, no client calls this, so last_tick stays put.
--     The first call on resume adds +1 (it's `ticks + 1`, never
--     `ticks + gap`), so a five-minute pause costs one second, not
--     five minutes. No gap tracking anywhere.
--   - **Server clock is authority.** The `now()` is the database's,
--     so a client's wall-clock skew or setInterval drift can't move
--     the count — it only triggers the attempt.
--
-- Returns the current ticks either way, so the same call the FE
-- uses to advance the clock also reads it back.
create or replace function common.tick_timer(target_game uuid)
returns int
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  current_ticks int;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;
  perform common.require_club_member(target_club);

  update common.timers
     set ticks = ticks + 1,
         last_tick = now()
   where game_id = target_game
     and now() - last_tick >= interval '1 second'
  returning ticks into current_ticks;

  -- WHERE didn't match (already ticked this second) — read current.
  if current_ticks is null then
    select ticks into current_ticks
      from common.timers where game_id = target_game;
  end if;

  return coalesce(current_ticks, 0);
end;
$$;

revoke execute on function common.tick_timer(uuid) from public;
grant execute on function common.tick_timer(uuid) to authenticated;

-- ─── common.delete_game ────────────────────────────────────
-- Permanently remove a game and everything that belongs to it.
-- Called from the FE when a club member clicks the delete
-- affordance on a game card.
--
-- Authorization: any member of the owning club can delete any
-- of the club's games. Friends-only trust model — we don't
-- attribute "who created the game" or restrict to that user
-- (no owner column today, and the social ask is "the friends
-- agreed to delete this," not "only the starter can").
--
-- Cascade: the FK chain handles cleanup:
--   - common.game_players      (game_id FK, ON DELETE CASCADE)
--   - <gametype>.games         (id FK,      ON DELETE CASCADE)
--     ⤷ which cascades to per-gametype child tables
--        (codenamesduet.words/clues, psychicnum.guesses, connections.guesses)
-- So one DELETE on common.games removes the whole subtree.
--
-- This RPC does NOT handle "tell peers viewing the game to
-- leave first." For a current-view game, the FE caller is
-- expected to broadcast a `suspend` event on the
-- `game:<uuid>` channel first so peers navigate to the club
-- page BEFORE the row vanishes — same broadcast already used
-- by the suspend-confirm dialog, so peers don't need a new
-- handler. Non-current games have no viewers by definition;
-- the FE skips the broadcast in that case.
--
-- Raises:
--   - 42501  via require_club_member (not authenticated, not
--            a member)
--   - P0002  'game not found' when target_game is unknown
--            (matches end_game / unset_current_view's
--            vocabulary for the same case)

create or replace function common.delete_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
begin
  select club_handle into target_club from common.games where id = target_game;
  if target_club is null then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for target_game';
  end if;

  perform common.require_club_member(target_club);

  delete from common.games where id = target_game;
end;
$$;

revoke execute on function common.delete_game(uuid) from public;
grant execute on function common.delete_game(uuid) to authenticated;

-- ============================================================
-- common.create_club RPC
-- ============================================================
--
-- Creates a new club + its full membership + its clubs_gametypes
-- entries in a single transaction. Returns the new club's handle
-- (the URL slug AND the PK).
--
-- Reject reasons (all P0001 unless noted):
--
--   - not authenticated (42501)
--   - club name slugifies to an empty handle ("!!!" etc.)
--   - club name slugifies to a handle that doesn't start with
--     a letter ("123 club" → "123-club", which the handle CHECK
--     would reject anyway; we surface a friendlier P0001 instead
--     of a constraint violation)
--   - one or more member_usernames don't exist (P0002)
--   - resulting membership has fewer than 2 members
--   - handle collision with an existing club (unique_violation, 23505)
--
-- Caller is automatically added if not already in member_usernames,
-- so a UI that lets the creator type only their friends doesn't
-- have to remember to also include themselves.
--
-- clubs_gametypes is seeded via common.default_gametypes_for_club:
-- a friend club (always ≥2 members) gets every default-enroll
-- gametype (psychicnum opts out — it's the architecture toy).
-- Members can edit the set afterward from the club-settings UI
-- (common.set_club_gametypes), including opting INTO the opt-outs.

create or replace function common.create_club(
  club_name text,
  member_usernames text[]
)
returns text
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  new_handle text;
  resolved_ids uuid[];
  unknown_names text[];
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'not-authenticated|' using errcode = '42501',
      detail = 'auth.uid() is null';
  end if;

  -- Length first, and as a clean P0001 like the two name errors below: the
  -- table's own CHECK would raise 23514, which CreateClubPage renders verbatim
  -- ("new row for relation \"clubs\" violates check constraint …").
  if char_length(club_name) > 20 then
    raise exception 'club-name-too-long|20|'
      using errcode = 'P0001',
      detail = 'club name length cap';
  end if;

  new_handle := common.slugify_club_name(club_name);
  if length(new_handle) = 0 then
    raise exception 'club-name-not-alnum|'
      using errcode = 'P0001',
      detail = 'club name needs at least one alphanumeric';
  end if;
  -- The handle CHECK regex requires a leading letter. Surface a
  -- clean P0001 instead of letting the constraint raise 23514,
  -- so the FE's inline error reads as a name problem ("add a
  -- letter") rather than a database error.
  if new_handle !~ '^[a-z]' then
    raise exception 'club-name-start|'
      using errcode = 'P0001',
      detail = 'club name must begin with a letter';
  end if;

  -- Resolve usernames → user_ids; collect any that didn't map.
  --
  -- The COALESCE-to-empty-array on both is load-bearing: when
  -- member_usernames is empty, the aggregate result is NULL and
  -- every subsequent NULL-in-condition (NULL > 0, NULL < 2,
  -- caller = ANY(NULL)) silently evaluates to false, letting the
  -- function fall through to create a zero-member club. Coercing
  -- to empty arrays makes the downstream checks behave.
  select
    coalesce(array_remove(array_agg(p.user_id), null), array[]::uuid[]),
    coalesce(array_remove(array_agg(case when p.user_id is null then u end), null), array[]::text[])
    into resolved_ids, unknown_names
  from unnest(member_usernames) as u
  left join common.profiles p on p.username = u;

  if array_length(unknown_names, 1) > 0 then
    raise exception 'unknown-usernames|%|', array_to_string(unknown_names, ', ')
      using errcode = 'P0002',
      detail = 'no profile matches these usernames';
  end if;

  -- Auto-add the caller if they weren't in the list.
  if not (caller_id = any(resolved_ids)) then
    resolved_ids := resolved_ids || caller_id;
  end if;

  if coalesce(array_length(resolved_ids, 1), 0) < 2 then
    raise exception 'club-too-small|2|'
      using errcode = 'P0001',
      detail = 'a club needs the creator plus one';
  end if;

  -- The PK on clubs.handle does collision enforcement; we let
  -- the exception propagate so the caller gets SQLSTATE 23505
  -- (unique_violation), surfaced by the FE as "that name is taken."
  insert into common.clubs (handle, name, created_by)
  values (new_handle, club_name, caller_id);

  insert into common.clubs_members (club_handle, user_id)
  select new_handle, member_id from unnest(resolved_ids) as member_id;

  -- Enroll the club in its default gametype set. A friend club
  -- (always ≥2 members) gets every default-enroll gametype; the
  -- helper additionally trims the set for solo clubs, which
  -- create_club never makes. We route through it anyway so both
  -- club-creation paths share one rule. Per-club edits beyond this
  -- — dropping a game, or opting into an off-by-default one — go
  -- through the club-settings UI (common.set_club_gametypes).
  insert into common.clubs_gametypes (club_handle, gametype)
  select new_handle, gametype
    from common.default_gametypes_for_club(new_handle);

  return new_handle;
end;
$$;

revoke execute on function common.create_club(text, text[]) from public;
grant execute on function common.create_club(text, text[]) to authenticated;

-- ============================================================
-- common.set_club_gametypes RPC — the club-settings "which games
-- does this club play?" editor
-- ============================================================
--
-- Replaces a club's enrolled-gametype set (the rows in
-- common.clubs_gametypes) with exactly the passed list. Backs the
-- "Edit club" dialog on ClubPage. Any club member may edit — this
-- is a friends venue, not an admin hierarchy (see CLAUDE.md → trust
-- model); the membership gate is the only check.
--
-- Deliberately does NOT re-apply the solo-club min_players filter:
-- per the FE spec, if someone wants to list a 2-player game in their
-- solo club they may, they just won't be able to start it (the Start
-- button stays disabled via numberOfPlayers). The filter only shapes
-- the *default* enrollment at club creation, not later hand-editing.
--
-- The FK on clubs_gametypes.gametype means an unknown gametype in
-- the list raises 23503; the FE only ever sends registered ones.
create or replace function common.set_club_gametypes(
  target_club text,
  gametypes text[]
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  -- Null-coalesced so an explicit "play nothing" (empty array) and
  -- a NULL argument behave the same: clear every enrollment.
  wanted text[] := coalesce(gametypes, array[]::text[]);
begin
  -- Auth + membership gate (raises 42501 on either failure).
  perform common.require_club_member(target_club);

  -- Delete-by-difference rather than truncate-and-refill so an
  -- unchanged row keeps its default_setup (the saved setup-form
  -- values for that (club, gametype) pair). Against an empty
  -- `wanted`, `<> all` is vacuously true for every row, so this
  -- clears the whole set — the "uncheck everything" case.
  delete from common.clubs_gametypes
   where club_handle = target_club
     and gametype <> all(wanted);

  -- Add the newly-checked gametypes; on conflict skip the ones the
  -- club already had (preserving their default_setup).
  insert into common.clubs_gametypes (club_handle, gametype)
  select target_club, g
    from unnest(wanted) as g
  on conflict do nothing;
end;
$$;

revoke execute on function common.set_club_gametypes(text, text[]) from public;
grant execute on function common.set_club_gametypes(text, text[]) to authenticated;

-- ============================================================
-- common.send_message RPC
-- ============================================================
--
-- Post a message to a club's chat. Authorized for any member of
-- the club. Trimmed content must be 1–1000 chars (matches the
-- check constraint on common.messages).

create or replace function common.send_message(target_club text, content text)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  trimmed text := trim(content);
begin
  -- Auth + membership gate. Raises 42501 on either fail with the
  -- canonical messages — see common.require_club_member.
  caller_id := common.require_club_member(target_club);

  if length(trimmed) = 0 then
    raise exception 'empty-message|' using errcode = 'P0001',
      detail = 'chat body was blank';
  end if;

  if length(trimmed) > 1000 then
    raise exception 'message-too-long|1000|' using errcode = 'P0001',
      detail = 'chat body over the cap';
  end if;

  insert into common.messages (club_handle, user_id, content)
  values (target_club, caller_id, trimmed);
end;
$$;

revoke execute on function common.send_message(text, text) from public;
grant execute on function common.send_message(text, text) to authenticated;

-- ============================================================
-- common.claim_username RPC
-- ============================================================
--
-- Materializes per-user state on demand: the user signs in via
-- magic-link, the FE detects they have no profile row, and
-- routes them to a "pick a handle" screen. That screen calls
-- this RPC with their chosen username. The RPC atomically:
--
--   1. Inserts the profile row (user_id := auth.uid(), the
--      chosen username, color derived deterministically).
--   2. Creates a solo club with handle '=<username>',
--      single-membered. The '=' prefix puts solo clubs in a
--      slug-space user-typed names cannot reach (slugify_club_name
--      strips '='), so there's no risk of collision with
--      friend-club handles.
--   3. clubs_gametypes rows for the solo club, covering only the
--      gametypes a single player can actually play (min_players <=
--      1, via common.default_gametypes_for_club). A solo club has
--      one member forever, so two-player games like codenamesduet would
--      never be startable there — we don't enroll the club in them.
--      The member can still add them later from the club-settings UI
--      (common.set_club_gametypes) if they want them listed.
--
-- Returns the claimed username on success.
--
-- Reject reasons:
--   - 42501  not authenticated (no auth.uid())
--   - P0001  username format invalid (doesn't match the regex)
--   - 23505  username taken (profile insert collision) OR
--            solo-club handle taken (impossible if profile
--            insert succeeded — same uniqueness scope)
--   - 23503  auth.users row gone (the FK from profiles.user_id;
--            edge case from a stale JWT after a db:reset)
--   - P0001  profile already claimed (the user_id PK rejects a
--            second claim; surfaced as a clean message instead
--            of letting 23505 propagate)
--
-- The CHECK on profiles.username would catch a bad regex too,
-- but the explicit P0001 reads cleaner in error display. Belt-
-- and-braces.

create or replace function common.claim_username(desired text, chosen_color text)
returns text
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'not-authenticated|' using errcode = '42501',
      detail = 'auth.uid() is null';
  end if;

  -- Clean P0001 if the requested handle doesn't match the regex.
  -- (The profiles CHECK would raise 23514 from the same input;
  -- this just gives the FE a friendlier error string.)
  if desired !~ '^[a-z][a-z0-9-]{2,14}$' then
    raise exception 'bad-username|'
      using errcode = 'P0001',
      detail = 'username must match ^[a-z][a-z0-9-]{2,14}$';
  end if;

  -- Block double-claim explicitly — without this, the same user
  -- re-calling would raise 23505 from the user_id PK and the FE
  -- couldn't distinguish "this user already claimed" from "this
  -- username is taken by someone else."
  if exists (select 1 from common.profiles where user_id = caller_id) then
    raise exception 'username-claimed|' using errcode = 'P0001',
      detail = 'this profile already has a username';
  end if;

  -- The player picks their color on the claim form (the FE defaults it
  -- to a simple hash of the username — see defaultColorFor — but they
  -- can change it). The DB just requires a valid one; there's no
  -- server-side default. Friendly P0001 over the raw CHECK. (Direct SQL
  -- inserts, e.g. the test personas, still supply their own color —
  -- common.color_for_username remains for that deterministic seeding.)
  if chosen_color not in
       ('red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink') then
    raise exception 'bad-color|%|', chosen_color using errcode = 'P0001',
      detail = 'color must be one of the member palette';
  end if;

  insert into common.profiles (user_id, username, color)
  values (caller_id, desired, chosen_color);

  insert into common.clubs (handle, name, created_by)
  values ('=' || desired, desired, caller_id);

  insert into common.clubs_members (club_handle, user_id)
  values ('=' || desired, caller_id);

  insert into common.clubs_gametypes (club_handle, gametype)
  select '=' || desired, gametype
    from common.default_gametypes_for_club('=' || desired);

  return desired;
end;
$$;

revoke execute on function common.claim_username(text, text) from public;
grant execute on function common.claim_username(text, text) to authenticated;

-- ============================================================
-- common.update_profile_color — change your own player color
-- ============================================================
-- The one mutable profile field today (username is still immutable in
-- v1). Security-definer + caller-scoped (only ever writes auth.uid()'s
-- own row), so there's no UPDATE policy on common.profiles — this RPC
-- is the single write path, like every other mutation in the app. The
-- FE surface is the "Edit profile" dialog off the user menu.
create or replace function common.update_profile_color(new_color text)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'not-authenticated|' using errcode = '42501',
      detail = 'auth.uid() is null';
  end if;

  -- Friendly P0001 instead of the raw 23514 the CHECK would raise. The
  -- list must match the CHECK on common.profiles.color (and the FE's
  -- MEMBER_COLORS in memberColor.ts).
  if new_color not in
       ('red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink') then
    raise exception 'bad-color|%|', new_color using errcode = 'P0001',
      detail = 'color must be one of the member palette';
  end if;

  update common.profiles set color = new_color where user_id = caller_id;
  if not found then
    raise exception 'no-profile|' using errcode = 'P0001',
      detail = 'no profiles row for the caller';
  end if;
end;
$$;

revoke execute on function common.update_profile_color(text) from public;
grant execute on function common.update_profile_color(text) to authenticated;
-- GRANTED to authenticated: read through security_invoker views (the
-- letter-mask filter the word games' pickers use), so the caller needs it.
revoke execute on function common.word_letter_mask(text) from public;
grant execute on function common.word_letter_mask(text) to authenticated;

-- Public reference data: an English dictionary isn't secret and
-- leaks no per-game answer key (a spellingbee board's legal words live
-- in the hidden spellingbee.games_state columns, not here). Readable by
-- any signed-in user; no RLS. The only write path is the lazy
-- definition fill through cache_definition (SECURITY DEFINER), so
-- authenticated gets SELECT only. The bulk seed importer connects as
-- the superuser and bypasses grants.
grant select on common.words to authenticated;

-- RLS is enabled on this table (20260813000000_rls_seed_tables.sql) so it can't
-- fail open, but the content is not secret and every authenticated player needs
-- all of it — so the policy is permissive. The GRANT above is the real gate;
-- this states the row-level answer instead of leaving it to RLS being off.
drop policy if exists words_select on common.words;
create policy words_select on common.words
  for select to authenticated
  using (true);


-- ============================================================
-- common.anagrams — the ⌥` anagram finder's search
-- ============================================================
-- The dictionary tool behind the global anagram popup: given a letters
-- pattern, return every word of EXACTLY that length the pattern can spell,
-- with its difficulty band. The pattern's syntax (the dialog teaches it):
--
--   - lowercase letter — a tile that can land anywhere ("floats")
--   - '?'              — a floating wildcard, pays any one letter
--   - UPPERCASE letter — pinned: the word must have this letter at this
--                        exact position ("Acer" finds acer + acre, not race)
--
-- All-uppercase degenerates to an exact-word check, which is a feature.
--
-- **No content filter, ruled deliberately (2026-08-07):** the player typed
-- the letters, so the whole dictionary answers — crude/slur/slang words
-- included. This is the opposite of the app-surfaces tier the scrabble AI
-- uses (docs/common.md → Which words a game may use), on purpose; a pgTAP
-- test pins it so a future cleanup doesn't quietly re-filter.
--
-- Match runs in three stages, cheapest first, over the len-exact subset:
--   1. the PIN check as a LIKE pattern (pinned letters literal, every
--      floating slot '_') — free positional filtering;
--   2. the letter_mask prefilter: distinct letters the input doesn't hold
--      at all must be payable by wildcards (bit_count ≤ k) — the same
--      subset trick the stackdown builder uses, k=0 collapsing to
--      mask & ~input_mask = 0;
--   3. the exact multiset fold (_anagram_fits) on the few survivors: each
--      UNPINNED word position consumes a floating letter or a wildcard.
--
-- Ordered difficulty then word — familiar words first, the useful order
-- when hunting a word you might actually know.

create or replace function common._anagram_fits(
  w text,
  pat text,          -- the LIKE pattern: pinned letters literal, '_' = floating slot
  floats int[],      -- 26 counts of the floating (lowercase) letters
  wilds int
)
returns boolean
language plpgsql
immutable
as $$
declare
  i   int;
  idx int;
begin
  -- Only the floating slots consume from the pool; pinned positions were
  -- already matched (and paid for) by the LIKE pattern. No leftover check
  -- needed: slots = floats + wilds exactly (same length, pins excluded),
  -- so an unconsumed float forces wilds negative before the loop ends.
  for i in 1..length(w) loop
    if substr(pat, i, 1) = '_' then
      idx := ascii(substr(w, i, 1)) - 96;
      if floats[idx] > 0 then
        floats[idx] := floats[idx] - 1;
      else
        wilds := wilds - 1;
        if wilds < 0 then
          return false;
        end if;
      end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke execute on function common._anagram_fits(text, text, int[], int) from public;

-- SECURITY DEFINER (house pattern): the internal _anagram_fits helper is
-- revoked from callers, so an invoker-rights version 403s the moment an
-- authenticated player's call reaches it.
create or replace function common.anagrams(letters text)
returns table (word text, difficulty smallint)
language plpgsql
stable
security definer
set search_path = common, public, extensions
as $$
declare
  n       int;
  k       int := 0;                                -- wildcards
  floats  int[] := array_fill(0, array[26]);       -- floating letters only
  in_mask bigint := 0;                             -- ALL input letters, pinned too
  pat     text := '';                              -- the LIKE pattern
  i   int;
  c   text;
  idx int;
begin
  if letters is null or letters !~ '^[A-Za-z?]{2,15}$' then
    raise exception 'bad-anagram-input|'
      using errcode = 'P0001',
      detail = 'anagram input must be 2-15 letters or ?';
  end if;
  n := length(letters);

  for i in 1..n loop
    c := substr(letters, i, 1);
    if c = '?' then
      k := k + 1;
      pat := pat || '_';
    -- ascii(), NOT `c between 'A' and 'Z'`: BETWEEN on text is collation-
    -- ordered, and en_US interleaves cases ('a' sorts inside A..Z) — the
    -- range test pinned every lowercase letter too. Bytes don't lie.
    elsif ascii(c) between 65 and 90 then
      c := lower(c);
      pat := pat || c;                             -- pinned: literal in the pattern
      in_mask := in_mask | (1::bigint << (ascii(c) - 97));
    else
      pat := pat || '_';
      idx := ascii(c) - 96;
      floats[idx] := floats[idx] + 1;
      in_mask := in_mask | (1::bigint << (idx - 1));
    end if;
  end loop;

  return query
  select w.word, w.difficulty
    from common.words w
   where w.len = n
     and w.word like pat
     and bit_count((w.letter_mask & ~in_mask)::bit(64)) <= k
     and common._anagram_fits(w.word, pat, floats, k)
   order by w.difficulty, w.word;
end;
$$;
revoke execute on function common.anagrams(text) from public;
grant execute on function common.anagrams(text) to authenticated;

-- ============================================================
-- Dictionary curation — update_word / delete_word / add_word
-- ============================================================
-- The in-app half of the wordlist-curation loop, gated on
-- profiles.can_edit_words (granted by hand in SQL — see the column's
-- comment). Every change applies to common.words LIVE and journals itself
-- in common.words_edits; the journal is the export artifact the upstream
-- wordlist-manager consumes (capture-first — see the table's comment for
-- the reimport caveat).
--
-- Live-apply is safe against running games, verified per-game (2026-08-08):
-- games copy their word lists at creation and nothing foreign-keys into
-- common.words. The one ordering rule it depends on: a game that validates
-- submissions against the live dictionary must check its own solution
-- FIRST (wordle.submit_guess learned this; stackdown always knew) — so a
-- re-banded answer still solves. May-enter checks (scrabble, strands
-- hint-words, bananagrams check_board) feel a band edit immediately, which
-- is the edit working, not a bug.

-- The permission gate. Returns the caller's id + username (the journal
-- caches the username — an export artifact must not dangle on user
-- deletion, hence no FK on edited_by either).
create or replace function common._require_word_editor()
returns table (editor_id uuid, editor_username text)
language plpgsql
stable
security definer
set search_path = common, public, extensions
as $$
begin
  return query
  select p.user_id, p.username
    from common.profiles p
   where p.user_id = auth.uid()
     and p.can_edit_words;
  if not found then
    raise exception 'not-word-editor|'
      using errcode = '42501',
      detail = 'profiles.can_edit_words is false';
  end if;
end;
$$;
revoke execute on function common._require_word_editor() from public;

-- The editable column set, shared by update_word and add_word. definition
-- edits also stamp definition_source = 'm' (manual — the provenance value
-- the schema reserved for exactly this). Numbers are range-checked here so
-- a typo'd band is a clean error, not a constraint explosion.
create or replace function common._validate_word_fields(fields jsonb)
returns void
language plpgsql
immutable
as $$
declare
  k text;
begin
  for k in select jsonb_object_keys(fields) loop
    if k not in ('definition', 'hint', 'difficulty', 'crude', 'slur', 'slang',
                 'american', 'british', 'canadian', 'australian') then
      raise exception 'bad-word-field|%|', k using errcode = 'P0001',
      detail = 'field is not in the editable allow-list';
    end if;
  end loop;
  if fields ? 'difficulty'
     and (fields->>'difficulty')::int not between 1 and 6 then
    raise exception 'bad-difficulty|' using errcode = 'P0001',
      detail = 'words.difficulty is 1-6';
  end if;
  if fields ? 'crude' and (fields->>'crude')::int not between 0 and 2 then
    raise exception 'bad-crude|' using errcode = 'P0001',
      detail = 'words.crude is 0-2';
  end if;
  if fields ? 'slur' and (fields->>'slur')::int not between 0 and 2 then
    raise exception 'bad-slur|' using errcode = 'P0001',
      detail = 'words.slur is 0-2';
  end if;
end;
$$;
revoke execute on function common._validate_word_fields(jsonb) from public;

-- Patch an existing word. `patch` holds ONLY the changed fields (that's
-- what the journal's `new` records); a key present with a null value
-- clears the column (definition/hint).
create or replace function common.update_word(
  target_word text,
  patch jsonb,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed  record;
  w   common.words%rowtype;
begin
  select * into ed from common._require_word_editor();
  perform common._validate_word_fields(patch);
  if patch = '{}'::jsonb then
    raise exception 'no-word-change|' using errcode = 'P0001',
      detail = 'the edit was a no-op';
  end if;

  select * into w from common.words where word = lower(target_word) for update;
  if not found then
    raise exception 'no-such-word|%|', target_word using errcode = 'P0002',
      detail = 'word absent from common.words';
  end if;

  update common.words set
    definition = case when patch ? 'definition' then patch->>'definition' else definition end,
    -- 'm' = manual, the provenance the schema reserved for hand edits.
    definition_source = case when patch ? 'definition' then 'm' else definition_source end,
    hint       = case when patch ? 'hint'       then patch->>'hint'              else hint end,
    difficulty = case when patch ? 'difficulty' then (patch->>'difficulty')::smallint else difficulty end,
    crude      = case when patch ? 'crude'      then (patch->>'crude')::smallint else crude end,
    slur       = case when patch ? 'slur'       then (patch->>'slur')::smallint  else slur end,
    slang      = case when patch ? 'slang'      then (patch->>'slang')::boolean  else slang end,
    american   = case when patch ? 'american'   then (patch->>'american')::boolean   else american end,
    british    = case when patch ? 'british'    then (patch->>'british')::boolean    else british end,
    canadian   = case when patch ? 'canadian'   then (patch->>'canadian')::boolean   else canadian end,
    australian = case when patch ? 'australian' then (patch->>'australian')::boolean else australian end
  where word = w.word;

  insert into common.words_edits (word, kind, old, new, note, edited_by, edited_by_username)
  values (w.word, 'update', to_jsonb(w), patch, note, ed.editor_id, ed.editor_username);
end;
$$;
revoke execute on function common.update_word(text, jsonb, text) from public;
grant execute on function common.update_word(text, jsonb, text) to authenticated;

-- Remove a word — a hard DELETE, deliberately (2026-08-08): nothing
-- foreign-keys into common.words, games snapshot their lists at creation,
-- and every reader (validators, board builders, the lookup + anagram
-- dialogs) naturally doesn't-see an absent row — whereas a `deleted` flag
-- would make every reader responsible for filtering it, forever. The
-- journal's `old` snapshot is the only remaining copy: it's the restore
-- path and the upstream export. (Soft edge: words.root_word is a plain
-- text pointer, so deleting a lemma leaves inflections naming a word that
-- no longer exists — a dangling STRING, harmless.)
create or replace function common.delete_word(
  target_word text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed record;
  w  common.words%rowtype;
begin
  select * into ed from common._require_word_editor();
  select * into w from common.words where word = lower(target_word) for update;
  if not found then
    raise exception 'no-such-word|%|', target_word using errcode = 'P0002',
      detail = 'word absent from common.words';
  end if;

  delete from common.words where word = w.word;

  insert into common.words_edits (word, kind, old, new, note, edited_by, edited_by_username)
  values (w.word, 'delete', to_jsonb(w), null, note, ed.editor_id, ed.editor_username);
end;
$$;
revoke execute on function common.delete_word(text, text) from public;
grant execute on function common.delete_word(text, text) to authenticated;

-- Add a word. `fields` uses the same editable set; difficulty is required
-- (there is no sensible default band), everything else defaults to the
-- import's defaults. len derives, letter_mask generates.
create or replace function common.add_word(
  new_word text,
  fields jsonb,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed record;
  w  common.words%rowtype;
begin
  select * into ed from common._require_word_editor();
  perform common._validate_word_fields(fields);

  new_word := lower(trim(coalesce(new_word, '')));
  -- 1..45 matches the dictionary's real range ('a' to the 45-letter lung
  -- disease); lowercase a-z only, like every imported word.
  if new_word !~ '^[a-z]{1,45}$' then
    raise exception 'bad-word|' using errcode = 'P0001',
      detail = 'new word must be 1-45 lowercase letters';
  end if;
  if not fields ? 'difficulty' then
    raise exception 'missing-difficulty|' using errcode = 'P0001',
      detail = 'add_word needs a difficulty';
  end if;
  if exists (select 1 from common.words cw where cw.word = new_word) then
    raise exception 'word-exists|%|', new_word using errcode = 'P0001',
      detail = 'word already present in common.words';
  end if;

  insert into common.words
    (word, difficulty, american, british, canadian, australian,
     crude, slur, slang, len, definition, definition_source, hint)
  values
    (new_word,
     (fields->>'difficulty')::smallint,
     coalesce((fields->>'american')::boolean, false),
     coalesce((fields->>'british')::boolean, false),
     coalesce((fields->>'canadian')::boolean, false),
     coalesce((fields->>'australian')::boolean, false),
     coalesce((fields->>'crude')::smallint, 0),
     coalesce((fields->>'slur')::smallint, 0),
     coalesce((fields->>'slang')::boolean, false),
     char_length(new_word),
     fields->>'definition',
     case when fields->>'definition' is not null then 'm' end,
     fields->>'hint')
  returning * into w;

  insert into common.words_edits (word, kind, old, new, note, edited_by, edited_by_username)
  values (w.word, 'add', null, to_jsonb(w), note, ed.editor_id, ed.editor_username);
end;
$$;
revoke execute on function common.add_word(text, jsonb, text) from public;
grant execute on function common.add_word(text, jsonb, text) to authenticated;

-- The journal itself: writes only through the RPCs above (SECURITY
-- DEFINER — no direct grants); readable by editors, so a future "recent
-- edits" surface is possible without a new door.
drop policy if exists words_edits_select on common.words_edits;
create policy words_edits_select on common.words_edits
  for select to authenticated
  using (exists (
    select 1 from common.profiles p
     where p.user_id = (select auth.uid()) and p.can_edit_words
  ));
grant select on common.words_edits to authenticated;

-- ============================================================
-- common.cache_definition — the lazy definition-fill write path
-- ============================================================
-- The click-to-define popover + "look up any word" shortcut read
-- `definition` straight off common.words (authenticated SELECT). When
-- a word is in the table but has no definition yet (definition_source
-- IS NULL = never looked up), the `common-define` Edge Function fetches
-- Wiktionary and writes the result back here via this RPC.
--
-- We ONLY ever fill words that are already in common.words — a lookup
-- of a word that isn't a playable word returns "unknown word" and is
-- never inserted (per the friends-only design: the word list is the
-- universe). So this is an UPDATE, never an INSERT.
--
-- The `definition is null` guard means a seeded definition (a real
-- `s`-source gloss or an `e`-source auto-gloss) is NEVER clobbered by
-- a later API write. It also lets a never-looked word (source NULL)
-- be filled, and a tombstone (source 'w' + NULL def, "looked up,
-- Wiktionary had nothing") be filled if a later fetch succeeds —
-- though the Edge Function honors tombstones and won't re-fetch them.
--
-- p_def NULL writes the negative-cache tombstone. p_source is the
-- one-char provenance code ('w' for Wiktionary — the only writer).
-- Word is lowercased so callers don't have to.
create or replace function common.cache_definition(
  p_word   text,
  p_def    text,
  p_source text
) returns void
language plpgsql
security definer
set search_path = common, public
as $$
begin
  update common.words
     set definition        = p_def,
         definition_source = p_source
   where word = lower(trim(p_word))
     and definition is null;
end;
$$;

-- service_role needs schema USAGE + EXECUTE to call this from the
-- `common-define` Edge Function. Not authenticated: letting any client cache
-- arbitrary (word, def) pairs is a junk-injection vector with no
-- upside. (The bulk word import connects as the superuser and seeds
-- definitions straight from the TSV, bypassing this path entirely.)
grant usage on schema common to service_role;
revoke execute on function common.cache_definition(text, text, text) from public;
grant execute on function common.cache_definition(text, text, text) to service_role;

-- ============================================================
-- common.require_player_count_max — player-count upper bound
-- ============================================================
-- Centralizes the "max N players" check that each open-N game's
-- create_game calls near the top (mirrors require_club_member +
-- require_valid_timer). 6 isn't a global rule — each create_game passes its
-- own cap; codenamesduet keeps its inline exactly-2 check. No grant to
-- authenticated: only callable from other SECURITY DEFINER RPCs.

create or replace function common.require_player_count_max(
  player_user_ids uuid[],
  max_count int
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  if array_length(player_user_ids, 1) > max_count then
    raise exception 'too-many-players|%|%|',
                    array_length(player_user_ids, 1), max_count
      using errcode = 'P0001',
      detail = 'player count exceeds the gametype''s max';
  end if;
end;
$$;

revoke execute on function common.require_player_count_max(uuid[], int) from public;
