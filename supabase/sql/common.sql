-- cs-unmet

-- ============================================================
-- common
-- ============================================================
-- What is called from outside SQL (no leading `_`):
--
--   claim_username             creates a new player's profile and solo club
--   update_profile             changes your color and sound setting
--   create_club                makes a club of named friends, the caller
--                              included
--   set_club_gametypes         sets which games a club can start
--   get_club_page              everything the club page draws, in one read
--   send_message               posts to a club's chat
--   set_current_view           makes a game the club's current game
--   unset_current_view         clears the club's current game when its last
--                              viewer leaves
--   tick_timer                 advances a game's clock by at most a second
--   delete_game                deletes a game and everything under it
--   set_scratchpad             saves a scratchpad
--   anagrams                   the dictionary words a set of letters spells
--   update_word                edits a dictionary word (word editors only)
--   delete_word                deletes a dictionary word (word editors only)
--   add_word                   adds a dictionary word (word editors only)
--   cache_definition           saves a word's definition (the definitions
--                              edge function)
--
-- What each game's own SQL calls:
--
--   _create_game               the common half of starting a game
--   _end_game                  ends a game, recording its reason and rankings
--   _reset_game                the common half of a Restart
--   _concede                   records a concession; ends the game once
--                              everyone has conceded
--   _stop                      the Stop: ends the game with no result
--   _set_player_ended          ends one player while the game plays on
--   _write_shell               writes the page's shell blob onto the game
--   _make_json_playarea        the common part of a game's playarea blob,
--                              for its builder to add its fields to
--   _make_json_players         every player as a playarea shows them, for
--                              a game's builder to join its rows to
--   _assign_turn_order         seats a turn-order game
--   _advance_turn              hands the turn to the next player still in
--   _require_turn              refuses a move out of turn
--   _require_club_member       the caller is signed in and in this club
--   _require_game_player       the caller is signed in and in this game
--   _require_valid_timer       the setup's timer is well formed
--   _require_valid_mode        the mode is coop or compete
--   _require_compete           the game is a compete game
--   _require_player_count_max  no more players than the game takes
--   _raise_game_deleted        the "That game was already deleted" race
--   _raise_game_over           the "Game over" race
--   _raise_already_conceded    the "Already conceded" race
--   _wordle_colors             colors one word against an answer,
--                              Wordle-style
--   _rank_idx                  the rank ladder, 0..6
--   _ok_envelope               builds an `ok` answer
--   _raised_envelope           builds the answer for a raise we authored
--
-- and the rest: `_is_club_member` for the security rules,
-- `_default_gametypes_for_club`, `_slugify_club_name` and `_color_for_username`
-- for making clubs and profiles, and two triggers, `_stamp_games_updated_at`
-- and `_bump_scratchpad_version`.
--
-- What is particular to common: it may never name a game. Everything a game
-- shares — the game row and its players, turn order, conceding, stopping,
-- ending, the clock, the current-view pointer — is here, and each game's
-- file calls it (docs/common-schema.md).
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

-- Authenticated users need usage on the schema so PostgREST can
-- expose tables and RPCs under it.
grant usage on schema common to authenticated;

-- The names these functions had before a leading `_` came to mean "only SQL
-- calls it" (docs/code-conventions.md → RPC functions). This file is
-- re-applied, not diffed, so each old name is dropped here. `is_club_member`
-- takes the security rules that use it with it (`cascade`): every one of them
-- is in supabase/sql/, recreated over `_is_club_member` by the file that owns
-- it later in the same apply.
drop function if exists common.create_game(text, text, text, uuid[], text, jsonb, jsonb);
drop function if exists common.end_game(uuid, text, text, uuid, boolean, jsonb);
drop function if exists common.reset_game(uuid);
drop function if exists common.require_club_member(text);
drop function if exists common.require_game_player(uuid);
drop function if exists common.require_valid_timer(jsonb);
drop function if exists common.require_valid_mode(text);
drop function if exists common.require_compete(text);
drop function if exists common.require_player_count_max(uuid[], int);
drop function if exists common.wordle_colors(text, text);
drop function if exists common.ok_envelope(jsonb, text, text, jsonb);
drop function if exists common.raised_envelope(text, text, text, text, text, text);
drop function if exists common.is_club_member(text) cascade;
drop function if exists common.default_gametypes_for_club(text);
drop function if exists common.slugify_club_name(text);
drop function if exists common.color_for_username(text);
drop trigger if exists games_stamp_updated_at on common.games;
drop function if exists common.stamp_games_updated_at();

-- ============================================================
-- The result envelope — what every RPC hands back
-- ============================================================
--
-- See docs/envelopes.md. Every FE-facing RPC returns jsonb of one shape,
-- so a caller reads `type` first and `severity`/`outcome` second, and nothing
-- ever has to be inferred from a return value's absence.
--
-- Each RPC carries its own outcomes as RAISES, and one handler at the bottom
-- turns them into the envelope. The SQLSTATE says which branch:
--
--   PA###   this raise becomes `type: ok`      — HINT carries the `outcome`
--   PN###   this raise becomes `type: not-ok`  — HINT carries the `severity`
--
-- The digits encode nothing. They are a unique id per RAISE SITE, allocated
-- max+1 within the class and NEVER reused, so a code in a bug report leads to
-- exactly one line of SQL. `P0` is PL/pgSQL's own class, which is why ours are
-- PA/PN and why nothing from Postgres can be mistaken for ours.
--
-- The handler every RPC carries, verbatim:
--
--   exception when others then
--     get stacked diagnostics
--       v_msg = message_text, v_detail = pg_exception_detail,
--       v_hint = pg_exception_hint, v_code = returned_sqlstate,
--       v_col = column_name;
--     if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
--     return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
--
-- COLUMN is the fifth channel, and it says WHICH FIELD the message is about.
-- The other four are spoken for (message/detail/errcode/hint), and packing two
-- values into one of them would rebuild the delimited mini-format this design
-- removed. PostgREST relays only {code, message, details, hint}, so COLUMN
-- would be lost on a RAW error — it doesn't need to survive that trip, because
-- the handler converts the raise to jsonb before any response is built.
--
-- **It is not a validation-only channel.** A fault can be about one control
-- too — `_require_valid_timer` is — and naming it is what puts the sentence
-- under that control once the fault modal is dismissed. What decides the value
-- is whether one field is what the message is about, not the severity.
--
-- **Every validation states its column, and '_' means "not one field".**
--
--   column = 'letters'   the message belongs under that field
--   column = '_'         deliberately not about one field — the form's own line
--   (no column)          an oversight; the guard in src/guards/raiseCodes.test.ts fails it
--
-- The marker exists because `get stacked diagnostics` cannot return null for
-- COLUMN — an absent one arrives as ''. Without '_', "the author decided this
-- isn't about a field" and "the author forgot" would be the same value, and
-- neither the guard nor a reader could tell them apart. '_' also travels
-- unchanged all the way to the form's error object as its form-level key
-- (docs/envelopes.md → The keys), so one string serves all three layers.
--
-- `when others` rather than `when sqlstate …` because WHEN SQLSTATE accepts
-- only a literal code — no patterns, no variables. Anything not ours is
-- re-raised untouched and reaches the client in Postgres's own shape, which is
-- how the frontend tells a fault WE declared from one nobody anticipated.

-- A successful result. `data` is the payload the caller asked for; `outcome`
-- is how it reads on screen (the `Outcome` vocabulary minus `error`,
-- which belongs to the not-ok branch); `message` is optional because plenty of
-- results have nothing to say.
--
-- **EVERY KEY IS PRESENT, null when it has no value.** This built
-- `jsonb_strip_nulls(...)` first, to keep an envelope down to the keys it was
-- actually using — which was the wrong trade twice over (Joel, 2026-08-28):
--
--   - *"an envelope has defined fields; it's not 'noise' to include them."*
--     The shape is the contract. A key that vanishes when it is null is not a
--     smaller envelope, it is a different one.
--   - Callers pay for it. Every read becomes "this key might be missing", which
--     is a second case to handle at each site for no gain.
--
-- It also cost the one distinction a lookup needs: `data` null and `data` absent
-- became the same JSON, so an RPC could not say "there is no next puzzle" as a
-- value. Now it can.
create or replace function common._ok_envelope(
  data jsonb default null,
  outcome text default null,
  message text default null,
  meta jsonb default null
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'type', 'ok',
    'data', data,
    'outcome', outcome,
    'severity', null,
    'message', message,
    'field', null,
    'meta', meta,
    'dbcode', null,
    'detail', null);
$$;

-- Every superseded ARITY is dropped, because `create or replace` only replaces
-- a function of the SAME signature — adding a defaulted parameter leaves the
-- shorter one behind as an overload, and then every existing call site matches
-- both and fails as ambiguous. One line per arity this function has ever had.
drop function if exists common.raised_envelope(text, text, text, text);
drop function if exists common.raised_envelope(text, text, text, text, text);

-- The envelope for a raise we authored. Called only from an exception handler,
-- with the values `get stacked diagnostics` just produced.
create or replace function common._raised_envelope(
  sqlstate_code text,
  message text,
  hint text,
  detail text default null,
  field text default null,
  outcome text default null
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'type',     case when substr(sqlstate_code, 2, 1) = 'A' then 'ok' else 'not-ok' end,
    'data',     null,
    -- HINT carries the refinement, and which vocabulary it is drawn from
    -- depends on the branch. The two are disjoint, so one field is unambiguous.
    --
    -- On the NOT-OK branch the outcome is a separate channel (the raise's
    -- CONSTRAINT), because a `not-ok` has both things to say: how bad it is, and
    -- how it reads. Null is the ordinary case and means "use the default this
    -- severity carries" — not "no appearance" (docs/envelopes.md → Appearance).
    'outcome',  case when substr(sqlstate_code, 2, 1) = 'A'
                     then hint
                     else nullif(outcome, '') end,
    'severity', case when substr(sqlstate_code, 2, 1) = 'A' then null else hint end,
    'message',  message,
    -- Which FIELD a validation is about, from the raise's COLUMN. A form puts
    -- the message under that field and turns it red; absent, it lands on the
    -- form's bottom line. A raise stops at the first failure, so a validation
    -- is always about exactly one field.
    -- `nullif` because COLUMN and DETAIL arrive as '' when absent: an empty
    -- string is PL/pgSQL saying "the raise did not set this", and null is how
    -- the envelope says the same thing. '_' is a real value and survives.
    'field',    nullif(field, ''),
    'meta',     null,
    'dbcode',   sqlstate_code,
    'detail',   nullif(detail, ''));
$$;

-- Both builders run wherever an RPC does, and not every RPC is `security
-- definer` — `connections.puzzle_for_date` filters nothing, so it has no reason
-- to be. A plain function runs as the CALLER, who must therefore be able to
-- call these. They are pure and take no arguments they do not return, so there
-- is nothing to protect.
grant execute on function common._ok_envelope(jsonb, text, text, jsonb) to authenticated;
grant execute on function common._raised_envelope(text, text, text, text, text, text) to authenticated;

revoke execute on function common._ok_envelope(jsonb, text, text, jsonb) from public;
revoke execute on function common._raised_envelope(text, text, text, text, text, text) from public;

-- Which gametypes a freshly-created club should be enrolled in
-- (i.e. which Start buttons it should offer). Two filters:
--   - `default_enroll` — the registry's off-by-default flag (psychicnum,
--     the architecture-exercise toy). Off-by-default, not banned: the
--     club-settings games editor (set_club_gametypes) can opt back in.
--   - Solo clubs (`common.clubs.is_solo`) have a single member, so they
--     only get gametypes playable by one person (`min_players <= 1`);
--     friend clubs get everything that remains. Read off the club's row,
--     so both callers insert the club before they ask.
-- Centralizing both rules here keeps claim_username, create_club, and
-- the per-game backfills from drifting apart.
-- Returns a one-column `gametype` set so callers can `select ...,
-- gametype from common._default_gametypes_for_club(handle)` directly
-- (a bare `returns setof text` would expose the column under the
-- function's name, not `gametype`).
create or replace function common._default_gametypes_for_club(target_handle text)
returns table(gametype text)
language sql
stable
set search_path = common, public, extensions
as $$
  select gt.gametype
    from common.gametypes gt
    join common.clubs c on c.handle = target_handle
   where gt.default_enroll
     and (not c.is_solo or gt.min_players <= 1)
$$;
revoke execute on function common._default_gametypes_for_club(text) from public;

drop trigger if exists games_touch_last_active on common.games;
drop function if exists common.touch_games_last_active();

-- The trigger that stamps `common.games.updated_at`: when a games row was last
-- written, by anything — a move, a builder run, the current-view pointer, a
-- data pass — so it is stamped here and nowhere else. It is not when the game
-- was last played: that is `status_changed_at`, which only the game's status
-- builder writes.
create or replace function common._stamp_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function common._stamp_games_updated_at() from public;

drop trigger if exists games_stamp_updated_at on common.games;
create trigger games_stamp_updated_at
  before update on common.games
  for each row
  execute function common._stamp_games_updated_at();

-- Read-only to members (the FE seeds its initial display from
-- `ticks`); writes go exclusively through common.tick_timer. RLS
-- (members-of-the-game's-club) is enabled in the policy section
-- below, alongside the other tables — it gates on _is_club_member,
-- which isn't defined yet here.
grant select on common.timers to authenticated;

-- Whether the caller is a member of the club: the check every security rule
-- makes. A definer, so the membership lookup bypasses RLS (a policy on
-- clubs_members calling back into itself would recurse). GRANTED to
-- authenticated: every gametype's RLS policy calls this, and a policy runs
-- as the INVOKER — so without the grant every club-scoped select fails
-- outright.
create or replace function common._is_club_member(target_club text)
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
revoke execute on function common._is_club_member(text) from public;
grant execute on function common._is_club_member(text) to authenticated;

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
-- │  THE VIEW FIRST. Every column it holds is public by design:
-- │  username and color ARE the player-identity vocabulary
-- │  rendered to every club member, user_id has to be resolvable
-- │  for club creation, theme and sounds_enabled are UI
-- │  preferences, can_edit_words is a curation flag, and
-- │  ai_member says an account is a bot — none of which says
-- │  anything about a person. So a "safe columns only" view
-- │  would select all of them and reduce exposure by exactly
-- │  nothing. That's why it isn't built.
-- │
-- │  The move, when a real-name / settings / email-derived column
-- │  arrives: revoke SELECT on common.profiles from authenticated,
-- │  add a `common.profiles_public` view over the genuinely public
-- │  columns, and point the FE's profile reads at it.
-- │  Security-definer RPCs that need the full row keep reading the
-- │  base table, so they're unaffected.
-- └─
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
         and common._is_club_member(g.club_handle)
    )
  );

-- No UPDATE policy on profiles. `username` is immutable in v1 (change
-- it by delete-and-recreate). `color` and `sounds_enabled` ARE changeable,
-- but only through the security-definer `common.update_profile` RPC
-- (caller-scoped), so no direct-UPDATE policy is needed — writes go
-- through the RPC like every other mutation.

drop policy if exists clubs_select on common.clubs;
create policy clubs_select on common.clubs
  for select to authenticated
  using (common._is_club_member(handle));

-- `user_id = auth.uid()` covers your OWN membership rows in addition to
-- the club-wide roster. It's mostly redundant with _is_club_member (your
-- row is in a club you're in) — except for the one case that matters for
-- the HomePage live clubs list: when you're REMOVED from a club, Realtime
-- evaluates this policy against the DELETE event as the now-ex-member, so
-- _is_club_member(club_handle) is already false and you'd never see your
-- own removal. Matching on your user_id (carried in the PK / replica
-- identity) lets the DELETE through so the list updates without a refresh.
-- Seeing your own membership facts is never a leak. _is_club_member is
-- SECURITY DEFINER (bypasses this policy) so there's no recursion.
drop policy if exists clubs_members_select on common.clubs_members;
create policy clubs_members_select on common.clubs_members
  for select to authenticated
  using (user_id = (select auth.uid()) or common._is_club_member(club_handle));

drop policy if exists messages_select on common.messages;
create policy messages_select on common.messages
  for select to authenticated
  using (common._is_club_member(club_handle));

-- Permissive read on gametypes — gametype identifiers are not
-- sensitive, and the FE needs to discover them anyway (the
-- registry table mirrors what src/gametypes.ts declares on the FE
-- side).
drop policy if exists gametypes_select on common.gametypes;
create policy gametypes_select on common.gametypes
  for select to authenticated using (true);

drop policy if exists clubs_gametypes_select on common.clubs_gametypes;
create policy clubs_gametypes_select on common.clubs_gametypes
  for select to authenticated
  using (common._is_club_member(club_handle));

-- Game records are club-wide: any club member can see every game
-- ever played in the club, regardless of whether they were one of
-- the players themselves. "History belongs to the club." Same
-- model as messages — chat threads span game playings and aren't
-- per-game-private.
drop policy if exists games_select on common.games;
create policy games_select on common.games
  for select to authenticated
  using (common._is_club_member(club_handle));

-- Game-player records inherit visibility from their parent game.
-- The EXISTS subquery mirrors the per-gametype `*_select` policy
-- shape (psychicnum.events, connections.events, etc.).
drop policy if exists game_players_select on common.game_players;
create policy game_players_select on common.game_players
  for select to authenticated
  using (
    exists (
      select 1 from common.games g
       where g.id = game_players.game_id
         and common._is_club_member(g.club_handle)
    )
  );

-- No insert/update/delete policies on any of these tables. Writes
-- go through the security-definer RPCs defined below (create_club,
-- send_message, the _create_game/_end_game game-lifecycle helpers
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

-- The trigger that counts a scratchpad's versions: every update bumps
-- `version` by one, which is how set_scratchpad's caller recognizes its own
-- write coming back.
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

-- Dropped, not replaced: `create or replace` cannot change a return type.
drop function if exists common.set_scratchpad(uuid, uuid, text);

-- Replace the pad body for (game, owner). The shared pad (p_owner_id null) is
-- writable by any player; a private pad only by its owner. Guarded on
-- membership only — the notes outlive the game, so a finished game's pad
-- stays writable. The FE debounces this full-text flush (the pad is small +
-- one-writer-at-a-time, so no OT/CRDT). Returns the new version so the FE
-- adopts it and its own CDC echo is a no-op.
create or replace function common.set_scratchpad(target_game uuid, p_owner_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_version bigint;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := common._require_game_player(target_game);
  -- The FE sends its own id or null (the shared pad) and has no control that
  -- offers a third value, so anything else got past us rather than past a
  -- player.
  if p_owner_id is not null and p_owner_id <> caller_id then
    raise exception 'BUG: a scratchpad write named someone else''s pad'
      using errcode = 'PN304', hint = 'fault', column = '_',
      detail = 'scratchpad writes are owner-only';
  end if;
  -- The textarea carries `maxLength={10000}`, so this is the cap being
  -- bypassed rather than a player typing too much.
  if char_length(coalesce(p_body, '')) > 10000 then
    raise exception 'BUG: a scratchpad write exceeded the 10000-character cap'
      using errcode = 'PN306', hint = 'fault', column = '_',
      detail = 'scratchpad body exceeds the cap';
  end if;

  insert into common.game_scratchpads (game_id, owner_id, body)
  values (target_game, p_owner_id, coalesce(p_body, ''))
  on conflict on constraint game_scratchpads_owner_key
    do update set body = excluded.body
  returning version into v_version;

  -- `version` rides in `data` because the caller acts on it: it keeps the
  -- highest one seen so a slow flush's reply cannot roll the pad backwards.
  return common._ok_envelope(jsonb_build_object('result', 'saved', 'version', v_version));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function common.set_scratchpad(uuid, uuid, text) from public;
grant execute on function common.set_scratchpad(uuid, uuid, text) to authenticated;

-- ============================================================
-- common._slugify_club_name — user-typed name → URL handle
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
create or replace function common._slugify_club_name(name text)
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
revoke execute on function common._slugify_club_name(text) from public;

-- ============================================================
-- common._color_for_username — deterministic palette pick
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
create or replace function common._color_for_username(username text)
returns text
language sql
immutable
as $$
  select (array[
    'red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink'
  ])[(abs(hashtext(username)) % 8) + 1];
$$;
revoke execute on function common._color_for_username(text) from public;

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

-- ─── common._require_club_member ────────────────────────
-- "Caller must be authenticated AND a member of target_club."
-- Returns the caller's user_id — the calling RPC typically
-- needs it for downstream inserts.
--
-- Raises (both faults):
--   - PN011  not signed in
--   - PN012  signed in, but not a member of this club
--
-- Both are FAULTS rather than validations: every surface that can
-- reach this already knows the answer. You are on a club page you
-- navigated to from a list of your own clubs, so a non-member
-- reaching the server means the frontend let you press something
-- it should not have — and a lapsed session needs the modal's
-- instruction, not a line on a form.
--
-- security definer so the membership lookup bypasses RLS, the
-- same way _is_club_member does.
create or replace function common._require_club_member(target_club text)
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
    raise exception 'Signed out; try refresh'
      using errcode = 'PN011', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  if not exists (
    select 1 from common.clubs_members
    where club_handle = target_club and user_id = caller_id
  ) then
    raise exception 'You are not a member of this club'
      using errcode = 'PN012', hint = 'fault', column = '_',
      detail = 'caller is not in common.club_members for this club';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated. SECURITY DEFINER chains (RPCs call
-- this helper) run with the helper-owner's privileges and can
-- call it; direct authenticated calls are blocked, keeping the
-- function out of PostgREST's exposed surface.
revoke execute on function common._require_club_member(text) from public;

-- ─── common._require_valid_timer ─────────────────────────────
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
-- PN035-PN039, and EVERY ONE IS A FAULT. The timer control cannot
-- produce any of them: the kind comes from three radios, and an
-- unparseable MM:SS never reaches the setup (the box keeps the
-- last valid seconds and complains in place, over the same
-- 1..3600 range). So arriving here means a bug, a hand-built
-- request, or a corrupt saved default — and the messages say
-- BUG: accordingly.
--
-- **They name their column anyway**: `timer`, not '_'. A fault
-- is not about no field just because it is a fault — this one is
-- about the timer, and saying so is what puts the sentence under
-- the control it is about once the fault modal is dismissed. A
-- raise says '_' when no one control is what it is about, which
-- is the ordinary case for a fault and why they mostly do.
--
-- `detail` uses the 'setup.timer.*' path because every current
-- game places the timer there. A future game nesting it elsewhere
-- would either accept the mismatch or write its own validator —
-- the canonical *shape* is the contract here, not the path.
create or replace function common._require_valid_timer(timer jsonb)
returns void
language plpgsql
immutable
as $$
declare
  timer_kind text;
  timer_seconds int;
begin
  if timer is null then
    raise exception 'BUG: game with no timer setting'
      using errcode = 'PN035', hint = 'fault', column = 'timer',
      detail = 'setup.timer absent';
  end if;

  timer_kind := timer->>'kind';
  -- Explicit null check: `NULL not in (...)` returns NULL, not
  -- TRUE, so without this the "missing kind" case would fall
  -- through the next check unraised. Separate "is required" vs
  -- "must be" messages give clearer FE error display.
  if timer_kind is null then
    raise exception 'BUG: timer with no setting'
      using errcode = 'PN036', hint = 'fault', column = 'timer',
      detail = 'setup.timer.kind absent';
  end if;
  if timer_kind not in ('none', 'countup', 'countdown') then
    raise exception 'BUG: timer setting of ''%''', timer_kind
      using errcode = 'PN037', hint = 'fault', column = 'timer',
      detail = 'timer kind must be none, countup or countdown';
  end if;

  if timer_kind = 'countdown' then
    if (timer->>'seconds') is null then
      raise exception 'BUG: countdown with no length'
        using errcode = 'PN038', hint = 'fault', column = 'timer',
      detail = 'countdown needs setup.timer.seconds';
    end if;
    timer_seconds := (timer->>'seconds')::int;
    if timer_seconds < 1 or timer_seconds > 3600 then
      raise exception 'BUG: countdown of % seconds', timer_seconds
        using errcode = 'PN039', hint = 'fault', column = 'timer',
      detail = 'countdown seconds must be 1..3600';
    end if;
  end if;
end;
$$;

-- No grant to authenticated; internal helper (see
-- _require_club_member's note).
revoke execute on function common._require_valid_timer(jsonb) from public;

-- ─── common._require_valid_mode ──────────────────────────────
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
create or replace function common._require_valid_mode(p_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_mode not in ('coop', 'compete') then
    raise exception 'BUG: game mode of ''%''', p_mode
      using errcode = 'PN040', hint = 'fault', column = '_',
      detail = 'mode must be coop or compete';
  end if;
end;
$$;

revoke execute on function common._require_valid_mode(text) from public;

-- ─── common._require_compete ────────────────────────────
-- Guard: concede is a compete-only action. In coop the players are
-- a team, so a game ends via stop_game (a mutual "we're done"), not
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
create or replace function common._require_compete(p_mode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_mode <> 'compete' then
    -- The game menu offers Concede in compete only, so reaching this means a
    -- hand-rolled call or a client that lost track of its own mode.
    raise exception 'BUG: a concede in a coop game'
      using errcode = 'PN484', hint = 'fault', column = '_',
      detail = 'coop ends the whole table instead';
  end if;
end;
$$;

revoke execute on function common._require_compete(text) from public;

-- ─── common._raise_game_deleted ────────────────────────────
-- The one sentence for "the game you are acting on is gone",
-- raised from the sixteen game RPCs that look for their own
-- `<schema>.games` row and do not find one.
--
-- **It is a RACE, not a fault.** `common.delete_game` is granted
-- to any club member for any game in the club, so a friend
-- tidying the club list while you have the page open really does
-- delete all three rows out from under you (the `<schema>.games`
-- row, `common.games`, and every `common.game_players` row —
-- cascaded from the one delete). Nothing about that is a broken
-- client.
--
-- The words and the appearance are `delete_game`'s own PN010,
-- deliberately: it is the same news, and `constraint = 'lost'`
-- earns the red a race does not otherwise get, because the game
-- being gone is a bigger thing to be told than a move not
-- landing. A SEPARATE code, though — PN010 is your own delete
-- finding nothing, this is another RPC finding the game gone
-- beneath it, and a log has to be able to tell them apart.
--
-- A raise-only helper, so the name says so (there is no check
-- here — `found` belongs to the caller's own select).
create or replace function common._raise_game_deleted(p_schema text)
returns void
language plpgsql
immutable
as $$
begin
  raise exception 'That game was already deleted'
    using errcode = 'PN485', hint = 'race', column = '_', constraint = 'lost',
    detail = format('no %I.games row for target_game', p_schema);
end;
$$;

revoke execute on function common._raise_game_deleted(text) from public;

-- ─── common._raise_game_over ───────────────────────────────
-- The one sentence for "this game is not accepting moves any
-- more", raised by every RPC that finds `ended_at` set: each
-- game's moves, `submit_timeout`, `common._stop` and
-- `common._concede`.
--
-- **A RACE**, and the ordinary one: the game ended between the
-- frontend's gate reading the game's end off the subscription and
-- the call landing — a teammate's winning move, a Stop, the
-- timer. Not a malfunction. It wears the race's own look
-- (`SEVERITY_TO_OUTCOME` in src/common/supabase/dbResult.ts): a
-- move that changed nothing is worth noticing.
--
-- ONE code for every site, like `_require_game_player`'s PN253:
-- what a code distinguishes is WHICH QUESTION failed, and this is
-- one question. The caller always knows which RPC it called.
create or replace function common._raise_game_over()
returns void
language plpgsql
immutable
as $$
begin
  raise exception 'Game over'
    using errcode = 'PN486', hint = 'race', column = '_',
    detail = 'the game has ended';
end;
$$;

revoke execute on function common._raise_game_over() from public;

-- ─── common._raise_already_conceded ────────────────────────
-- The one sentence for "you conceded, so this move is refused",
-- raised by every compete move that checks the caller's concession,
-- and by `common._concede` for a second concession.
--
-- **A RACE**, like `_raise_game_over`: the frontend hides the
-- controls once the subscription says you conceded, so reaching
-- here takes a move in flight when the concession landed, or a
-- second tab. One code for every site, for the same reason.
create or replace function common._raise_already_conceded()
returns void
language plpgsql
immutable
as $$
begin
  raise exception 'Already conceded'
    using errcode = 'PN483', hint = 'race', column = '_',
    detail = 'the caller has already conceded';
end;
$$;

revoke execute on function common._raise_already_conceded() from public;

-- ============================================================
-- common._wordle_colors — color ONE word against an answer, Wordle-style
--
-- KEEP THE NAME. It looks like a game codename in the shared layer — the one
-- thing naming.md's headline rule forbids — but it isn't: "Wordle colors" is
-- the term of art for this green/yellow/gray scheme, which NYT Wordle made
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
-- THE ONLY implementation of this algorithm, and it stays that way:
-- wordle.submit_guess and waffle._board_colors (per word) both call it instead
-- of keeping a copy, and no frontend recomputes feedback — each game reads the
-- string the server stored. Pinned by a test per caller, `colors_test.sql`
-- under both wordle/ and waffle/, on inputs that share nothing, so a change
-- here answers to twelve assertions.
--
-- A TypeScript copy of it existed once, so waffle's turn-history viewer could
-- color a past board; the two were held together by hand-copied vectors and
-- had already drifted when `waffle.events` began storing each swap's colors
-- and the copy went. The lesson is the obvious one: this is exactly the kind of
-- subtle algorithm that must live in one place.
create or replace function common._wordle_colors(guess text, answer text)
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
revoke execute on function common._wordle_colors(text, text) from public;

-- ============================================================
-- common._rank_idx — the rank ladder (0..6) as integer math
-- ============================================================
-- 7 named ranks: Start(0), Good(1), Solid(2), Nice(3), Great(4),
-- Amazing(5), Genius(6). Each unlocks at i/6 * 0.70 of the max score;
-- Genius at 70%. The formula:
--
--   threshold_i = i / 6 * 0.7
--   rank(score, total) = max i such that score >= threshold_i * total
--                      = floor(score * 6 / (total * 0.7))
--                      = floor(score * 60 / (total * 7))   (×100/×100 to clear the decimal)
--
-- LEAST(6, ...) caps the result: a full clear of the required set scores
-- well past the 70% mark, so score*60/(total*7) can reach ≈8.57.
--
-- Why integer math: this decides a compete WIN, so it has to give the same
-- answer everywhere it is computed, and integer division is bit-for-bit
-- reproducible where floating point is a promise about a platform. No
-- (score, total) is known where a float form of this expression actually
-- disagrees — 4,004,000 pairs searched, none found — so this is determinism
-- by construction rather than a fix for an observed bug. The float trap
-- `rankLadder.ts` documents is in the other direction, where `Math.ceil` over
-- a threshold of 63.00000000000001 costs a whole point.
--
-- The frontend agrees with this but does NOT run this expression: it walks
-- float thresholds (`ratio >= rankThreshold(i)`), and the integer form above
-- is the algebraic rearrangement of that comparison. `src/shared/rank-ladder/
-- rankLadder.ts` carries the derivation, and its spec pins the two together at
-- every rank boundary. Change one, walk the other.
--
-- Shared rather than per-schema because the ladder is one ladder: a game with
-- a rank target calls this instead of keeping a copy. Pinned by each caller's
-- `rank_idx_test.sql`.
-- ============================================================
create or replace function common._rank_idx(score int, total int)
returns int
language sql
immutable
set search_path = common, public, extensions
as $$
  select case
           when total <= 0 then 0
           else least(6, (score * 60) / (total * 7))
         end;
$$;

revoke execute on function common._rank_idx(int, int) from public;

drop function if exists common.create_game(text, text, uuid[], text, jsonb, jsonb);

-- ─── common._create_game ────────────────────────────────
-- The common (header) half of starting a new game. Called by
-- every gametype's `<gametype>.create_game` first to get the
-- canonical game id; the gametype then inserts its detail row
-- using that id.
--
-- Responsibilities:
--   - Auth + caller membership in p_club_handle (via
--     _require_club_member). The caller must be a club member to
--     start a game in this club.
--   - The caller is one of the players: nobody starts a game they
--     are not in, because only a player can open its page
--     (docs/common-schema.md → Only a player opens a game). The
--     setup form locks the creator's row on, so a list without
--     them is a bug.
--   - Validate every uid in p_player_user_ids is a member of
--     the club at game-create time. Players are frozen at
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
--   - Insert its common.timers row, with the timer's kind and
--     countdown length copied from `setup.timer`.
--   - Insert one common.game_players row per uid.
--   - Write the page's shell blob (`_write_shell`).
--   - Return the new game id.
--
-- Size constraints (exactly-2 for codenamesduet, at-least-1 for the
-- open games) live in the gametype's `<gametype>.create_game`,
-- not here — common doesn't know each gametype's rules. This
-- helper just enforces "all listed players are club members."
--
-- Raises:
--   - PN011 / PN012 via _require_club_member
--   - PN059 'BUG: game with no players'
--   - PN510 'BUG: caller not among the players'
--   - PN060 'BUG: player not in this club: X, Y'
create or replace function common._create_game(
  p_club_handle text,
  p_gametype text,
  -- 'coop' or 'compete', which the gametype's create_game has checked
  -- (common._require_valid_mode). Passed, never read off the gametype's name.
  p_mode text,
  p_player_user_ids uuid[],
  p_title text,
  p_setup jsonb,
  -- The savable subset of `setup` for the saved-defaults feature
  -- (see common.clubs_gametypes.default_setup). Each gametype's
  -- create_game decides what to pass: most pass `setup` verbatim;
  -- codenamesduet strips its `first_clue_giver_user_id` (per-game decision,
  -- not a per-club preference). Pass NULL to opt out of auto-save
  -- entirely for this call.
  p_default_setup jsonb
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
  perform common._require_club_member(p_club_handle);

  if p_player_user_ids is null
     or array_length(p_player_user_ids, 1) is null
     or array_length(p_player_user_ids, 1) = 0 then
    raise exception 'BUG: game with no players'
      using errcode = 'PN059', hint = 'fault', column = 'player_user_ids',
      detail = 'player_user_ids was empty';
  end if;

  -- auth.uid() is non-null here: _require_club_member has checked it.
  if not (auth.uid() = any (p_player_user_ids)) then
    raise exception 'BUG: caller not among the players'
      using errcode = 'PN510', hint = 'fault', column = '_',
      detail = 'the creator must be in player_user_ids';
  end if;

  -- Identify any listed uid that isn't in clubs_members for this
  -- club. The COALESCE-to-empty-array guard keeps the IF below
  -- behaving when the result is null (no non-members).
  --
  -- A BOT is exempt, and is the only thing that is: an AI opponent is a real
  -- account with a real profile, seated by the game that offers it, but it
  -- belongs to no human's club and must not — the club page's roster reads
  -- clubs_members, and a bot in there would show up as one of the friends.
  -- `profiles.ai_member` is the discriminator rather than the handle's shape;
  -- see docs/common.md.
  select coalesce(array_agg(uid::text), array[]::text[]) into non_members
  from unnest(p_player_user_ids) as uid
  where not exists (
    select 1 from common.clubs_members
     where club_handle = p_club_handle and user_id = uid
  )
  and not exists (
    select 1 from common.profiles p
     where p.user_id = uid and p.ai_member
  );

  if array_length(non_members, 1) > 0 then
    -- The picker only ever offers this club's members, so arriving here means
    -- the roster moved under the dialog or the client is wrong. Either way it
    -- is not something the creator can fix by changing a control.
    raise exception 'BUG: player not in this club: %', array_to_string(non_members, ', ')
      using errcode = 'PN060', hint = 'fault', column = '_',
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
   where club_handle = p_club_handle and is_current_view = true;

  -- Setup is passed in as-validated (each gametype's create_game
  -- does field-level checks + common._require_valid_timer before calling
  -- here). We just persist what we're handed; a new row has no
  -- `ended_at`, so it is being played.
  insert into common.games (club_handle, gametype, mode, created_by, title, setup, is_current_view)
  values (p_club_handle, p_gametype, p_mode, auth.uid(), p_title, p_setup, true)
  returning id into new_id;

  -- Seed the additive game clock at zero. last_tick = now() so the
  -- first tick_timer call doesn't immediately jump (it needs a full
  -- real second to elapse before the first +1). The kind and the
  -- countdown's length are the game's to read from here on, never
  -- `setup` (_require_valid_timer has checked the shape).
  insert into common.timers (game_id, kind, countdown_seconds_at_setup)
  values (
    new_id,
    p_setup -> 'timer' ->> 'kind',
    case when p_setup -> 'timer' ->> 'kind' = 'countdown'
         then (p_setup -> 'timer' ->> 'seconds')::int end
  );

  insert into common.game_players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) as uid;

  -- The page's shell, as of a game nobody has moved in; the game's status
  -- builder rewrites it once its own rows are in (see `_write_shell`).
  perform common._write_shell(new_id);

  -- Auto-save the saved subset to the (club, gametype) row in
  -- clubs_gametypes so the next setup dialog can pre-fill it.
  -- NULL opts this call out of saving (a gametype that doesn't
  -- want a saved-defaults UX passes NULL). On every successful
  -- _create_game, the row's default_setup overwrites — there's
  -- no "save as default" gesture; the click on Start is the save.
  if p_default_setup is not null then
    update common.clubs_gametypes
       set default_setup = p_default_setup
     where club_handle = p_club_handle
       and gametype = p_gametype;
  end if;

  return new_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common._create_game(text, text, text, uuid[], text, jsonb, jsonb) from public;

-- ─── common._require_game_player ───────────────────────
-- "Caller must be authenticated AND have a game_players row for
-- target_game." Used by mid-game RPCs (submit_guess, submit_clue,
-- etc.) where the question is "is this caller actually playing
-- this specific game" — finer than club membership, since with
-- the per-game player roster a club member who didn't sit down at
-- this game can't take actions in it.
--
-- Returns the caller's user_id, which mid-game RPCs use for
-- their downstream inserts.
--
-- Raises, both faults:
--   - PN252 'Signed out; try refresh'   when auth.uid() is null
--   - PN253 'You are not in this game'  when the caller isn't in
--                                        common.game_players
create or replace function common._require_game_player(target_game uuid)
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
    -- The one fault here with a remedy, so the sentence names it: a page left
    -- open overnight whose session expired.
    raise exception 'Signed out; try refresh'
      using errcode = 'PN252', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  if not exists (
    select 1 from common.game_players
    where game_id = target_game and user_id = caller_id
  ) then
    -- `_create_game` seeds a row for every player and the FE knows the roster,
    -- so a caller without one is a broken client or a hand-rolled call.
    raise exception 'You are not in this game'
      using errcode = 'PN253', hint = 'fault', column = '_',
      detail = 'caller has no common.game_players row';
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common._require_game_player(uuid) from public;

-- ============================================================
-- Turn-order primitive — opt-in turn-by-turn
-- ============================================================
-- Free-for-all is the default and unchanged: common.games.current_turn_user_id
-- stays NULL and all three helpers below are inert. A game that opts in (a coop
-- game's setup coop_style='turns', or a game that always takes turns) seats
-- the rotation once at create-time; each ACCEPTED, non-terminal move then
-- calls _advance_turn; and each move RPC gates on _require_turn right after it
-- locks the game row + resolves the caller.
--
-- The whole rotation lives on the COMMON tables (game_players.turn_seat +
-- games.current_turn_user_id), so every gametype inherits it without a per-game
-- turn table — even wordiply, which has no players table of its own.

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

drop function if exists common._advance_turn(uuid);

-- Advance the pointer to the next player by turn_seat (wraps; skips any player
-- who has ended, conceders included). No-op when the game isn't a turn game
-- (pointer null ⇒ no seats ⇒ nothing to advance), so it's safe to call
-- unconditionally on a game's accepted-move path. The skip is what steps the
-- rotation past a scrabble compete player who conceded.
create or replace function common._advance_turn(p_game_id uuid)
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
   where gp.game_id = p_game_id
     and gp.user_id = g.current_turn_user_id;
  if cur_seat is null then
    return;
  end if;

  select count(*) into n_players
    from common.game_players where game_id = p_game_id;

  -- Walk forward to the next seat still playing. With nobody out this is just
  -- (cur_seat + 1) % n. The loop is bounded by n: if everyone else is out it
  -- wraps back to the current seat, and if that player is out too, next_seat
  -- stays null and the pointer is left where it is.
  next_seat := null;
  for i in 1..n_players loop
    select gp.turn_seat into next_seat
      from common.game_players gp
     where gp.game_id = p_game_id
       and gp.turn_seat = (cur_seat + i) % n_players
       and gp.player_ended_at is null;
    exit when next_seat is not null;
  end loop;

  if next_seat is not null then
    update common.games
       set current_turn_user_id = (
         select user_id from common.game_players
          where game_id = p_game_id and turn_seat = next_seat
       )
     where id = p_game_id;
  end if;
end;
$$;

revoke execute on function common._advance_turn(uuid) from public;

-- Gate a move on whose-turn-it-is. Raises PN243 'Not your turn' when the game
-- is a turn game (pointer set) and the caller isn't the current player. No-op
-- for free-for-all (pointer null) and for solo (the sole player is always the
-- current player). Call it right after the move RPC locks the game row and
-- resolves the caller (common._require_game_player).
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
    -- A RACE, and one of the narrow ones. The FE gates hard on `isMyTurn`
    -- (connections' tiles aren't clickable, its Submit is disabled), and that
    -- gate reads `current_turn_user_id` — which arrives by realtime. So the
    -- only way here is a client whose pointer is stale: a second tab left open,
    -- or a deaf window (src/common/realtime/postgresAttached.ts).
    raise exception 'Not your turn'
      using errcode = 'PN243', hint = 'race', column = '_',
      detail = 'current_turn_user_id is another player';
  end if;
end;
$$;

revoke execute on function common._require_turn(uuid, uuid) from public;

-- ─── common.update_state — dropped ─────────────────────────
-- Every column it wrote is gone; a move's page-visible numbers are each game's
-- status builder's to write. The drop is explicit because supabase/sql is
-- re-applied, not diffed.
drop function if exists common.update_state(uuid, text, jsonb);

drop function if exists common.end_game(uuid, text, jsonb, jsonb);

-- ─── common._end_game ───────────────────────────────────
-- Ends a game. Each gametype's RPC calls it once, at the moment its own rule
-- says the game is over — connections' fourth mistake, the assassin, the
-- countdown, the Stop. Everything about the ending is the game's to decide
-- and pass in; this decides only the two outcomes (docs/win-lose.md).
--
--   p_reason, p_reason_detail  why it ended: one of the seven reasons, and
--                              the game's own word for the act ('solved',
--                              'assassin', 'mistakes', 'stopped')
--   p_ended_by_user_id         the player whose act ended it; null only for
--                              a timeout nobody's turn covers
--   p_is_no_result             the game's rule says this ending is a
--                              `no-result` or `timeout-no-result`; never
--                              stored, only turned into `neutral`
--   p_final_rankings           {"<user id>": 1, …}; a player left out is
--                              unranked
--
-- Writes the game's `ended_at`, reason pair, `game_ended_by_user_id` and
-- `game_ended_outcome`, and each player's `final_ranking` and `outcome`.
-- `solved_at` is not its business: the game writes it at the solve.
--
-- is_current_view is NOT cleared: a finished game can still have viewers
-- reviewing it, and it clears when the last viewer leaves the page.
--
-- A second call on an ended game keeps the first `ended_at` and overwrites
-- the rest; an ending fires once from one RPC, so it doesn't arise.
create or replace function common._end_game(
  p_game_id uuid,
  p_reason text,
  p_reason_detail text,
  p_ended_by_user_id uuid,
  p_is_no_result boolean,
  p_final_rankings jsonb
)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  v_rankings jsonb := coalesce(p_final_rankings, '{}'::jsonb);
  v_outcome text;
begin
  -- `won` when anyone ranked first; otherwise an ending without a result is
  -- `neutral` and the rest are `lost`.
  if exists (select 1 from jsonb_each_text(v_rankings) r where r.value::int = 1) then
    v_outcome := 'won';
  elsif p_reason = 'stopped' or p_is_no_result then
    v_outcome := 'neutral';
  else
    v_outcome := 'lost';
  end if;

  update common.games
     set ended_at = coalesce(ended_at, now()),
         game_ended_reason = p_reason,
         game_ended_reason_detail = p_reason_detail,
         game_ended_by_user_id = p_ended_by_user_id,
         game_ended_outcome = v_outcome
   where id = p_game_id;

  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for p_game_id';
  end if;

  -- Every player, ranked or not: 1 is `won`, lower is `near`; an unranked
  -- player lost if they conceded or the ending has a result, and is
  -- `neutral` otherwise.
  update common.game_players gp
     set final_ranking = ranked.final_ranking,
         outcome = case
           when ranked.final_ranking = 1 then 'won'
           when ranked.final_ranking > 1 then 'near'
           when gp.player_ended_reason = 'conceded' or v_outcome <> 'neutral' then 'lost'
           else 'neutral'
         end
    from (
      select user_id, (v_rankings ->> user_id::text)::int as final_ranking
        from common.game_players
       where game_id = p_game_id
    ) ranked
   where gp.game_id = p_game_id
     and gp.user_id = ranked.user_id;
end;
$$;

-- No grant to authenticated; internal helper.
revoke execute on function common._end_game(uuid, text, text, uuid, boolean, jsonb) from public;

-- ─── common.reveal_solution — REMOVED 2026-08-15 ───────────
-- Seeing the solution is a LOCAL, per-player display choice now, made in the FE
-- (docs/ui.md → Terminal results): a Reveal/Hide toggle each player works for
-- themselves, so one player looking doesn't open the answer on a partner who is
-- still thinking, and the board they actually finished with is always one click
-- away. Nothing is written, so there is no RPC and no flag — the whole
-- mechanism was a shared boolean this function set one way.
--
-- What the server still owes is the SHIELD, and every gametype that has one now
-- gates it on `ended_at` (over for EVERYONE) — see waffle._solution_for et
-- al. That's the part that stops a conceded or already-finished player reading
-- the answer out to a race still running; who is LOOKING never was.
--
-- The drop is explicit because supabase/sql is re-applied, not diffed: deleting
-- the definition alone would leave the function sitting in every database that
-- ever ran it, prod included. The two COLUMNS it wrote are shape, so they go in
-- a forward migration (20260815000000_drop_solution_revealed.sql).
drop function if exists common.reveal_solution(uuid);

drop function if exists common.reset_game(uuid, jsonb);

-- ─── common._reset_game ─────────────────────────────────────
-- The INVERSE of _end_game: return a game to fresh, in-progress
-- state on the SAME row (no new game). For a gametype's "replay
-- this board" feature — the frozen puzzle/setup stays; only the
-- ending and each player's bookkeeping is undone. Writes:
--
--   - common.games: `ended_at`, the reason pair, `game_ended_by_user_id`
--     and `game_ended_outcome` back to null (it's being played again),
--     and `restart_count` up by one
--   - common.game_players: `player_ended_at` and its reason pair,
--     `final_ranking`, `outcome` and `solved_at` back to null for every
--     player (undoes the results, any concession, any solve)
--   - common.timers.ticks      = 0 — fresh start ⇒ fresh clock: a
--     countdown replays from the full duration, a countup from
--     0:00. (The FE's tick-merge accepts the big backward jump as
--     the deliberate reset it is — see useGameTimer.)
--   - common.games.current_turn_user_id = the turn_seat 0 player, in a
--     turn-order game; a free-for-all game's null pointer stays null.
--     A game that opens on another seat points the turn itself after
--     this call.
--
-- The gametype's OWN working-state reset (its per-game tables +
-- event log) happens in the calling RPC; this helper only owns the
-- common-layer half, exactly as _end_game does; the statuses are the
-- game's builder's, which the caller runs after its own reset. Internal
-- helper — no grant to authenticated; the gametype's `replay_*` RPC is
-- the membership-guarded caller.
create or replace function common._reset_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
begin
  update common.games
     set ended_at = null,
         game_ended_reason = null,
         game_ended_reason_detail = null,
         game_ended_by_user_id = null,
         game_ended_outcome = null,
         -- The frontend keys its play surface on this, so every client drops
         -- the state of the run that just ended: a half-typed word, an
         -- optimistic row, a mark mid-beat, the refs inside shared hooks. It
         -- only goes up, and nothing reads its value — only that it changed.
         restart_count = restart_count + 1
   where id = p_game_id;

  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for p_game_id';
  end if;

  update common.game_players
     set player_ended_at = null,
         player_ended_reason = null,
         player_ended_reason_detail = null,
         final_ranking = null,
         outcome = null,
         solved_at = null
   where game_id = p_game_id;

  -- The turn goes back to the opener; a null pointer (free-for-all) matches
  -- no row, so it stays null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = p_game_id and gp.turn_seat = 0
         )
   where id = p_game_id and current_turn_user_id is not null;

  -- Fresh start ⇒ fresh clock (see the header comment). last_tick renews so
  -- the next tick_timer call can't instantly advance off a stale anchor.
  update common.timers
     set ticks = 0,
         last_tick = now()
   where game_id = p_game_id;
end;
$$;

revoke execute on function common._reset_game(uuid) from public;

drop function if exists common.concede(uuid);
drop function if exists common._set_conceded(uuid);

-- ─── common._concede ───────────────────────────────────────
-- The shared part of "a player concedes", called by every game's own
-- `<game>.concede` (the RPC the front end calls). That RPC has already
-- locked its game row, the row its moves lock, so a concession and a move
-- wait for each other, and has raised on a deleted game; it runs any end
-- check of its own after this, then its status builder.
--
-- Guards, in order:
--   - caller is a player of this game
--   - the game hasn't already ended
--   - the caller hasn't already conceded (idempotency: concede once)
--   - the caller hasn't otherwise ended: nothing to concede
--
-- Then it records the concession, and once EVERY player has conceded it ends
-- the game as a collective loss: reason `conceded`, nobody ranked, so the game
-- and every player come out `lost`. That holds in every game — if everyone
-- conceded, nobody solved, won or finished. A game where a player can end
-- another way (solved, out of guesses) never gets there through that
-- player, and its own check decides; it skips a game this already ended.
--
-- Returns the caller's user_id (the concede RPCs use it downstream). Not
-- granted to `authenticated`: a direct call would end a game without its
-- builder.
create or replace function common._concede(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_ended_at timestamptz;
  v_player_ended_at timestamptz;
  v_player_ended_reason text;
begin
  caller_id := common._require_game_player(p_game_id);

  select ended_at into v_ended_at from common.games where id = p_game_id;
  if v_ended_at is not null then
    -- A RACE: the last other racer finished, or a peer ended the game, between
    -- the menu opening and this click. The frontend learns the game ended from
    -- the subscription, so losing that gap is ordinary.
    perform common._raise_game_over();
  end if;

  select player_ended_at, player_ended_reason
    into v_player_ended_at, v_player_ended_reason
    from common.game_players
   where game_id = p_game_id and user_id = caller_id;
  if v_player_ended_reason = 'conceded' then
    -- Also a RACE, and for the same reason: the concession reaches the page by
    -- the subscription rather than being set locally when the call returns, so
    -- a second click — or a second tab — inside that window reaches here.
    perform common._raise_already_conceded();
  end if;
  if v_player_ended_at is not null then
    -- Ended without conceding — finished, eliminated or out of budget — so
    -- there is nothing to concede: a loss is already a loss, and a finisher
    -- would only throw away a win they may hold. The frontend hides Concede
    -- once the player has ended, fed by the same subscription, so this is a race.
    raise exception 'Already out'
      using errcode = 'PN508', hint = 'race', column = '_',
      detail = 'this player has already ended';
  end if;

  -- A concession is one of the ways a player ends (docs/win-lose.md → Where a
  -- player stands), and the one that forfeits a win: `lost` at once
  -- (docs/win-lose.md → `outcome-at-player-end`).
  update common.game_players
     set player_ended_at = now(),
         player_ended_reason = 'conceded',
         player_ended_reason_detail = 'conceded',
         outcome = 'lost'
   where game_id = p_game_id and user_id = caller_id;

  if not exists (
    select 1 from common.game_players
     where game_id = p_game_id
       and player_ended_reason is distinct from 'conceded'
  ) then
    perform common._end_game(
      p_game_id, 'conceded', 'conceded', caller_id,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  end if;

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper (reached via the
-- games' concede RPCs).
revoke execute on function common._concede(uuid) from public;

-- ─── common._stop ──────────────────────────────────────────
-- The shared part of the Stop, called by every game's own
-- `<game>.stop_game`. That RPC has already locked its game row and raised on
-- a deleted game; it adds any step of its own after this (a leftover-tiles
-- penalty, a title), then runs its status builder.
--
-- Checks the caller is a player and the game hasn't ended, then ends it:
-- reason `stopped`, the caller as who ended it, nobody ranked — so the game
-- and every player come out `neutral`.
--
-- Returns the caller's user_id.
create or replace function common._stop(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
begin
  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A RACE: a winning move, a teammate's Stop or the timer landed between
    -- the button drawing and this click.
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'stopped', 'stopped', caller_id,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  return caller_id;
end;
$$;

-- No grant to authenticated; internal helper (reached via the
-- games' stop_game RPCs).
revoke execute on function common._stop(uuid) from public;

drop function if exists common._set_locally_terminal(uuid, uuid);
-- The four-argument form, before the outcome joined it; supabase/sql is
-- re-applied, not diffed, so the old signature needs an explicit drop.
drop function if exists common._set_player_ended(uuid, uuid, text, text);

-- ─── common._set_player_ended ──────────────────────────────
-- Mark one player ended while the game plays on, for a reason that is
-- the gametype's own business (connections' fourth mistake,
-- psychicnum's spent budget, a solve in the best-style races), which
-- is why the fact has to be told to `common` rather than derived
-- here. `p_reason` is one of the player's five reasons and
-- `p_reason_detail` the game's own word for it ('mistakes',
-- 'exhausted', 'solved'). `p_outcome` is how the caller judges the
-- player came out, read off the game's card (docs/win-lose.md →
-- `outcome-at-player-end`): `lost`, `won`, or `neutral` when the game
-- cannot judge yet. The game's end rewrites it. Conceding is the one
-- reason `common` knows itself: `_concede` writes it directly.
--
-- The roster that presence-pause watches is the players who haven't
-- ended: a finished player's closed tab must not stop the game for
-- everyone still playing.
--
-- NO GUARDS, deliberately. Every caller is a gametype RPC that has
-- already locked the game, checked membership and decided the player
-- has ended; a second membership check here would be a second answer
-- to a question already settled. Idempotent — a player who has ended
-- keeps their first time, reason and outcome — so the branch that calls
-- it does not have to ask whether it already did.
create or replace function common._set_player_ended(
  p_game_id uuid,
  p_user_id uuid,
  p_reason text,
  p_reason_detail text,
  p_outcome text
)
returns void
language sql
security definer
set search_path = common, public, extensions
as $$
  update common.game_players
     set player_ended_at = now(),
         player_ended_reason = p_reason,
         player_ended_reason_detail = p_reason_detail,
         outcome = p_outcome
   where game_id = p_game_id and user_id = p_user_id
     and player_ended_at is null;
$$;

-- No grant to authenticated; internal helper (reached from the
-- gametype RPCs, which are themselves definers).
revoke execute on function common._set_player_ended(uuid, uuid, text, text, text) from public;


-- ============================================================
-- The page blobs' common parts — the shell, and what every playarea shares
-- ============================================================
-- The page is written, not assembled (plans/seat-view.md → The page is
-- written, not assembled): each blob on `common.games` is everything one reader
-- shows, in that reader's own names. Two of them have a common part, built
-- here:
--
--   shell     Everything GamePage reads, the same shape for every gametype,
--             and nothing more: the page never sees a seat or an outcome.
--             `_write_shell` assigns it whole, at create and from each game's
--             status builder after every move, so `select shell from
--             common.games` shows the page what it gets.
--
--   playarea  The game's own blob, whose game facts and player facts every
--             game shares — the mode, the turn, the ending, each player's
--             standing (docs/win-lose.md → Where a player stands, formula for
--             formula). `_make_json_playarea` builds that common part; the
--             game's builder adds its own fields and its players on top
--             (`_make_json_players` joined to the game's rows), so the shared
--             fields cannot drift between games.
--
-- A JSON null means "no value right now"; every key is always present. A
-- group that may not apply is null as a whole: `turns` in a free-for-all game,
-- `ending` while the game is played, a player's `ending` while they play.
-- Links are ids in JSON (`turns.holder`, `ending.by`, `ending.winner`); the
-- page turns them into players.
--
--   shell:
--     id, gametype, club: {handle}
--     title, restartCount, ended
--     players: [{id, username, color, ai, stillPlaying}, …]   seat order
--
--   playarea, the common part:
--     id, gametype, brand, club: {handle}
--     mode, coop, compete, oneBoard
--     title, setup
--     turns: {holder}                      null: no turn order; holder null: nobody's turn now
--     ending: {reason, detail, by, winner} null while playing; winner: the player ranked 1
--     outcome                              null until the game ends
--     players: [player, …]                 seat order; by username in a free-for-all game
--
--   player:
--     id, username, color, ai, seat        seat null in a free-for-all game
--     ending: {at, reason, detail}         null unless they ended before the game did
--     outcome, finalRanking, solvedAt      null until written
--     conceded, solved, stillPlaying, onTurn, waitingForTurn

-- The game has a turn order: its players were seated when it was created.
-- Fixed for the game's life; a free-for-all game never gains seats.
create or replace function common._is_turn_based(p_game_id uuid)
returns boolean
language sql
stable
set search_path = common, public, extensions
as $$
  select exists (
    select 1 from common.game_players
     where game_id = p_game_id and turn_seat is not null
  );
$$;

revoke execute on function common._is_turn_based(uuid) from public;

-- One player as every game's playarea shows them: the row, the profile, and
-- where they stand against the game. `p_turn_based` is passed rather than
-- asked per player, since it is one fact about the game.
create or replace function common._make_json_player(
  gp common.game_players,
  prof common.profiles,
  g common.games,
  p_turn_based boolean
)
returns jsonb
language plpgsql
immutable
set search_path = common, public, extensions
as $$
declare
  -- The standing terms, each a formula over the row and the game
  -- (docs/win-lose.md → Where a player stands).
  conceded      boolean := gp.player_ended_reason is not distinct from 'conceded';
  still_playing boolean := g.ended_at is null and gp.player_ended_at is null;
  on_turn       boolean := still_playing
                           and (not p_turn_based
                                or g.current_turn_user_id is not distinct from gp.user_id);
begin
  return jsonb_build_object(
    'id',             gp.user_id,
    'username',       prof.username,
    'color',          prof.color,
    'ai',             prof.ai_member,
    'seat',           gp.turn_seat,
    'ending',         case when gp.player_ended_at is not null then jsonb_build_object(
                        'at',     gp.player_ended_at,
                        'reason', gp.player_ended_reason,
                        'detail', gp.player_ended_reason_detail) end,
    'outcome',        gp.outcome,
    'finalRanking',   gp.final_ranking,
    'solvedAt',       gp.solved_at,
    'conceded',       conceded,
    'solved',         gp.solved_at is not null,
    'stillPlaying',   still_playing,
    'onTurn',         on_turn,
    'waitingForTurn', still_playing and not on_turn
  );
end;
$$;

revoke execute on function common._make_json_player(common.game_players, common.profiles, common.games, boolean) from public;

-- Every player of a game as its playarea shows them, in seat order — by
-- username in a free-for-all game, which has no seats. `ord` is that order,
-- for a builder that aggregates them; `id` is for joining the game's own rows:
--
--   select jsonb_agg(cp.player || jsonb_build_object(…) order by cp.ord)
--     from common._make_json_players(p_game_id) cp
--     join <game>.players pp on pp.user_id = cp.id
create or replace function common._make_json_players(p_game_id uuid)
returns table (ord int, id uuid, player jsonb)
language sql
stable
set search_path = common, public, extensions
as $$
  select row_number() over (order by gp.turn_seat, prof.username)::int,
         gp.user_id,
         common._make_json_player(gp, prof, g, common._is_turn_based(p_game_id))
    from common.game_players gp
    join common.profiles prof on prof.user_id = gp.user_id
    join common.games g on g.id = gp.game_id
   where gp.game_id = p_game_id
   order by 1;
$$;

revoke execute on function common._make_json_players(uuid) from public;

-- How the game ended, or null while it is played. `by` is the player whose act
-- ended it (null for a timeout nobody's turn covers); `winner` the player
-- ranked first, null when nobody was.
create or replace function common._make_json_ending(g common.games)
returns jsonb
language sql
stable
set search_path = common, public, extensions
as $$
  select case when g.ended_at is not null then jsonb_build_object(
    'reason', g.game_ended_reason,
    'detail', g.game_ended_reason_detail,
    'by',     g.game_ended_by_user_id,
    'winner', (select gp.user_id from common.game_players gp
                where gp.game_id = g.id and gp.final_ranking = 1
                order by gp.turn_seat, gp.user_id
                limit 1)
  ) end;
$$;

revoke execute on function common._make_json_ending(common.games) from public;

-- The common part of a game's playarea blob: the game facts every game
-- shares, and its players as `_make_json_players` shows them. A game's status
-- builder puts its own fields on top, and replaces `players` with the same
-- objects extended by its rows:
--
--   playarea = common._make_json_playarea(p_game_id) || jsonb_build_object(
--     'puzzle', …,
--     'players', (select jsonb_agg(cp.player || jsonb_build_object(…) order by cp.ord)
--                   from common._make_json_players(p_game_id) cp
--                   join <game>.players pp on pp.user_id = cp.id))
create or replace function common._make_json_playarea(p_game_id uuid)
returns jsonb
language plpgsql
stable
set search_path = common, public, extensions
as $$
declare
  g  common.games%rowtype;
  gt common.gametypes%rowtype;
begin
  select * into g from common.games where id = p_game_id;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for p_game_id';
  end if;
  select * into gt from common.gametypes where gametype = g.gametype;

  return jsonb_build_object(
    'id',       g.id,
    'gametype', g.gametype,
    'brand',    gt.brand,
    'club',     jsonb_build_object('handle', g.club_handle),
    'mode',     g.mode,
    'coop',     g.mode = 'coop',
    'compete',  g.mode = 'compete',
    'oneBoard', gt.one_board,
    'title',    g.title,
    'setup',    g.setup,
    'turns',    case when common._is_turn_based(p_game_id)
                  then jsonb_build_object('holder', g.current_turn_user_id) end,
    'ending',   common._make_json_ending(g),
    'outcome',  g.game_ended_outcome,
    'players',  (select jsonb_agg(cp.player order by cp.ord)
                   from common._make_json_players(p_game_id) cp));
end;
$$;

revoke execute on function common._make_json_playarea(uuid) from public;

-- One player as the shell shows them: who they are, and whether the pause
-- still waits for them. Picked off the playarea's player so the standing has
-- one formula.
create or replace function common._make_json_shell_player(player jsonb)
returns jsonb
language sql
immutable
set search_path = common, public, extensions
as $$
  select jsonb_build_object(
    'id',           player -> 'id',
    'username',     player -> 'username',
    'color',        player -> 'color',
    'ai',           player -> 'ai',
    'stillPlaying', player -> 'stillPlaying');
$$;

revoke execute on function common._make_json_shell_player(jsonb) from public;

-- Write the game's shell blob. Called by `_create_game` once the players are
-- seated, and by each game's status builder after every move, so the shell is
-- as fresh as the statuses beside it. Writes nothing else: `status_changed_at`
-- is the builder's, `updated_at` the trigger's.
create or replace function common._write_shell(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  g       common.games%rowtype;
  players jsonb;
begin
  select * into g from common.games where id = p_game_id;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no common.games row for p_game_id';
  end if;

  select jsonb_agg(common._make_json_shell_player(cp.player) order by cp.ord)
    into players
    from common._make_json_players(p_game_id) cp;

  update common.games
     set shell = jsonb_build_object(
           'id',           g.id,
           'gametype',     g.gametype,
           'club',         jsonb_build_object('handle', g.club_handle),
           'title',        g.title,
           'restartCount', g.restart_count,
           'ended',        g.ended_at is not null,
           'players',      players)
   where id = p_game_id;
end;
$$;

revoke execute on function common._write_shell(uuid) from public;


-- Dropped, not replaced: this returned `void` before it answered in an
-- envelope, and `create or replace` cannot change a return type. Same as its
-- twin below.
drop function if exists common.set_current_view(uuid);

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
-- _require_club_member rather than _require_game_player so a
-- non-player club member can still view (and become the
-- current viewer of) a game they weren't seated in. Today's
-- seating model puts every club member in game_players for
-- every game, but the looser gate is the future-correct one.
--
-- Companion to unset_current_view (called when the last viewer
-- leaves). See docs/states.md → "Lifecycle: when
-- is_current_view flips" for the full story.
create or replace function common.set_current_view(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select club_handle into target_club from common.games where id = target_game;
  -- PA003 — the twin of unset_current_view's PA001, and `ok` for the same
  -- reason: nothing here is anybody's action. This fires on the channel's
  -- SUBSCRIBED ack, including every reconnect, and its only caller logs.
  --
  -- The jobs are not symmetrical, though. Unset's ("leave no pointer on that
  -- game") is trivially SATISFIED by a deleted game; this one's ("make that
  -- game the club's current view") is UNACHIEVABLE. It is still `ok`, because
  -- an unachievable job is not a failure when the thing it was for is gone.
  --
  -- Reachable without any bug, which is why it is not a `BUG:` fault: the ack
  -- fires on reconnect too, so a player whose network blinks an hour after
  -- someone deleted the game lands here. Telling them their game is gone is
  -- right, but this is the wrong messenger — `useCommonGame`'s next refetch
  -- finds zero rows and GamePage says so, in the words written for it.
  if target_club is null then
    raise exception 'That game is gone'
      using errcode = 'PA003', hint = 'noted',
      detail = 'no common.games row for target_game';
  end if;

  perform common._require_club_member(target_club);

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

  return common._ok_envelope(jsonb_build_object('result', 'set'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.set_current_view(uuid) from public;
grant execute on function common.set_current_view(uuid) to authenticated;

drop function if exists common.unset_current_view(uuid);

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
--
-- Outcomes:
--   - ok           {"result": "cleared"} — the flag is false (or already was)
--   - ok / noted   PA001 — the game itself is gone
--   - not-ok/fault PN011 / PN012, from _require_club_member
--
-- The success carries a `result` rather than an empty `data`, because the two
-- `ok`s have to be told apart at the call site and only one of them can be
-- named by `dbcode`: PA001 arrives through a raise, and a raise always builds
-- `data: null`. Leaving this one empty would make "no dbcode" its identity —
-- an absence, which a second wordless `ok` added later would match too, and be
-- drawn as this one (docs/envelopes.md → Choosing which `ok` branch).
create or replace function common.unset_current_view(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select club_handle into target_club from common.games where id = target_game;
  -- PA001 — the same shape as the idempotence below, one level up: this
  -- function's job is "leave no current-view pointer on that game", and a
  -- deleted game has none. Both callers race a delete by construction — the
  -- club page's heal fires 2.5s after noticing an abandoned pointer, and a
  -- peer's unmount fires as the deleting tab is already 150ms from its DELETE.
  --
  -- Unlike delete_game's already-deleted, which is an `error` because a person
  -- pressed a button and gets an answer, nothing here is anybody's action:
  -- both call sites are housekeeping that only logs.
  if target_club is null then
    raise exception 'That game is gone'
      using errcode = 'PA001', hint = 'noted',
      detail = 'no common.games row for target_game';
  end if;

  perform common._require_club_member(target_club);

  -- Pure pointer flip. No timer work — the tick clock in
  -- common.timers stops advancing on its own once no one's viewing
  -- (nobody calls tick_timer), so there's no idle gap to stamp.
  update common.games
     set is_current_view = false
   where id = target_game
     and is_current_view = true;

  return common._ok_envelope(jsonb_build_object('result', 'cleared'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.unset_current_view(uuid) from public;
grant execute on function common.unset_current_view(uuid) to authenticated;

-- Dropped, not replaced: this returned `int` (the tick count) before it
-- answered in an envelope, and `create or replace` cannot change a return type.
drop function if exists common.tick_timer(uuid);

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
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  current_ticks int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select club_handle into target_club from common.games where id = target_game;
  -- PA004, the third of the family (set_current_view's PA003,
  -- unset_current_view's PA001): a deleted game has no clock to advance, so
  -- the job is MOOT rather than failed.
  --
  -- Moot is the whole character of this function. The clock is not a server
  -- process — it only moves while someone is looking at it, because looking IS
  -- what moves it (see the update below). So "there is nothing to tick" is a
  -- state this mechanism handles by design, not an error, and it is the same
  -- state as nobody viewing.
  if target_club is null then
    raise exception 'That game is gone'
      using errcode = 'PA004', hint = 'noted',
      detail = 'no common.games row for target_game';
  end if;
  perform common._require_club_member(target_club);

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

  -- The authoritative count. Every viewer polls once a second and the guard
  -- above lets only the first of them advance it, so three players do not make
  -- three ticks — the rest fall through to this read.
  return common._ok_envelope(jsonb_build_object('result', 'ticked', 'ticks', coalesce(current_ticks, 0)));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.tick_timer(uuid) from public;
grant execute on function common.tick_timer(uuid) to authenticated;

drop function if exists common.delete_game(uuid);

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
--        (codenamesduet.words/clues, psychicnum.events, connections.events)
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
-- Outcomes:
--   - ok               {"result": "deleted"} — the row (and its subtree) is gone
--   - not-ok / race    PN010 — it was already gone (reads red: constraint lost)
--   - not-ok/fault     PN011 / PN012, from _require_club_member — not
--                      signed in, or not a member of this club
create or replace function common.delete_game(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  target_club text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  select club_handle into target_club from common.games where id = target_game;
  -- PN010 — a RACE, and the textbook one: a friend deleted the same game a
  -- moment earlier, or this is a second click, and either way the client's list
  -- had not heard yet. Not a `fault`, which would claim a bug where two people
  -- just pressed the same button; not a `service-error`, since everything we
  -- depend on answered perfectly.
  --
  -- The CONSTRAINT overrides the appearance a race would otherwise carry.
  -- `race` defaults to orange — "we're not taking it, notice" — and this one
  -- earns red: the game is gone, which is a bigger thing to be told than a
  -- move not landing. So `lost`, the outcome for the losing side of a race.
  --
  -- A raise, not an early `return`, so every exit from this function goes
  -- through the handler below.
  if target_club is null then
    raise exception 'That game was already deleted'
      using errcode = 'PN010', hint = 'race', column = '_', constraint = 'lost',
      detail = 'no common.games row for target_game';
  end if;

  -- Raises PN011 / PN012, which the handler below turns into a fault envelope.
  perform common._require_club_member(target_club);

  delete from common.games where id = target_game;

  -- No message: the FE knows the title and composes "<title> deleted" itself.
  -- `data` still names the answer, because a bare envelope would leave the call
  -- site nothing to test but what the answer lacks (docs/envelopes.md → How SQL
  -- builds one).
  return common._ok_envelope(jsonb_build_object('result', 'deleted'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function common.delete_game(uuid) from public;
grant execute on function common.delete_game(uuid) to authenticated;

drop function if exists common.create_club(text, text[]);

-- ============================================================
-- common.create_club RPC
-- ============================================================
--
-- Creates a new club + its full membership + its clubs_gametypes
-- entries in a single transaction, and answers ok
-- {"result": "created", "handle": …} — the handle is the URL slug
-- AND the PK.
--
-- Outcomes:
--   - not-ok/fault            PN002 not signed in; PN003–PN006 a name
--                             the form's own checks would have refused
--                             (over 20 characters, no letter or digit, a
--                             handle not starting with a letter, one
--                             under 3 characters)
--   - not-ok/form-validation  PN007 an unknown username, PN008 fewer
--                             than 2 members, PN009 the handle is taken
--                             (caught from the PK's unique_violation)
--
-- Caller is automatically added if not already in member_usernames,
-- so a UI that lets the creator type only their friends doesn't
-- have to remember to also include themselves.
--
-- clubs_gametypes is seeded via common._default_gametypes_for_club:
-- a friend club (always ≥2 members) gets every default-enroll
-- gametype (psychicnum opts out — it's the architecture toy).
-- Members can edit the set afterward from the club-settings UI
-- (common.set_club_gametypes), including opting INTO the opt-outs.
create or replace function common.create_club(
  club_name text,
  member_usernames text[]
)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  new_handle text;
  resolved_ids uuid[];
  unknown_names text[];
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    -- PN002. A session can expire mid-form, so this is reachable — but there
    -- is nothing to fix in the form, and the modal is where the player is told
    -- what to do about it.
    raise exception 'Signed out; try refresh'
      using errcode = 'PN002', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  -- PN003. The form's `maxLength` makes this unreachable, so its message is
  -- written for whoever reads the fault, not for a player fixing a name. The
  -- raise still earns its place over the table's own CHECK: a named condition
  -- with a written reason and a code pointing at one line beats a 23514.
  if char_length(club_name) > 20 then
    raise exception 'BUG: club name over 20 characters'
      using errcode = 'PN003', hint = 'fault', column = '_',
      detail = 'club name length cap';
  end if;

  new_handle := common._slugify_club_name(club_name);
  -- PN004. Prevented by the form's `handleError`; see PN003 on the wording.
  if length(new_handle) = 0 then
    raise exception 'BUG: club name with no letter or digit'
      using errcode = 'PN004', hint = 'fault', column = '_',
      detail = 'club name needs at least one alphanumeric';
  end if;
  -- PN005. The handle CHECK regex requires a leading letter; the form checks
  -- the same rule first, so reaching this is a bug.
  if new_handle !~ '^[a-z]' then
    raise exception 'BUG: handle not starting with a letter'
      using errcode = 'PN005', hint = 'fault', column = '_',
      detail = 'club name must begin with a letter';
  end if;
  -- PN006. The handle CHECK's other half: 3–30 characters. The form checks the
  -- floor too, so this is a bug rather than a name problem.
  if length(new_handle) < 3 then
    raise exception 'BUG: handle under 3 characters'
      using errcode = 'PN006', hint = 'fault', column = '_',
      detail = 'derived handle needs at least 3 characters';
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

  -- PN007. The form cannot know who exists, so this is a real validation, and
  -- it belongs under the usernames box.
  if array_length(unknown_names, 1) > 0 then
    raise exception 'No such user: %', array_to_string(unknown_names, ', ')
      using errcode = 'PN007', hint = 'form-validation', column = 'member_usernames',
      detail = 'no profile matches these usernames';
  end if;

  -- Auto-add the caller if they weren't in the list.
  if not (caller_id = any(resolved_ids)) then
    resolved_ids := resolved_ids || caller_id;
  end if;

  -- PN008. The form could check this — the only unknown is whether the caller
  -- is already in the list — but it doesn't today, so it stays reachable.
  if coalesce(array_length(resolved_ids, 1), 0) < 2 then
    raise exception 'A club needs at least 2 members'
      using errcode = 'PN008', hint = 'form-validation', column = 'member_usernames',
      detail = 'a club needs the creator plus one';
  end if;

  -- PN009. The PK on clubs.handle is the referee: a pre-check `select` cannot
  -- close this race, since two callers can both see the handle free. Catching
  -- the collision and re-raising is what turns a bare 23505 into words — and it
  -- is a VALIDATION, because picking another name is exactly what fixes it. The
  -- message carries the colliding HANDLE, since two different names can
  -- slugify to one.
  --
  -- Raising from inside this handler propagates to the function's own handler
  -- below, like any other raise.
  begin
    insert into common.clubs (handle, name, created_by)
    values (new_handle, club_name, caller_id);
  exception when unique_violation then
    raise exception 'Club name taken (handle “%”)', new_handle
      using errcode = 'PN009', hint = 'form-validation', column = 'club_name',
      detail = 'a club already holds this handle';
  end;

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
    from common._default_gametypes_for_club(new_handle);

  -- `result` beside the handle, not instead of it. The handle is what the
  -- caller USES; `result` is what tells it which answer it got, and a payload
  -- that carries only a value leaves a call site matching on `ok` alone
  -- (docs/envelopes.md → Choosing which `ok` branch).
  return common._ok_envelope(
    data => jsonb_build_object('result', 'created', 'handle', new_handle));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.create_club(text, text[]) from public;
grant execute on function common.create_club(text, text[]) to authenticated;

drop function if exists common.set_club_gametypes(text, text[]);

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
-- the list raises 23503, reaching the client as a raw fault. Left
-- that way deliberately: it is a shape guard against a client
-- sending something outside the registry, and Postgres names the
-- constraint and the offending value better than a sentence would.
--
-- Outcomes:
--   - ok           {"result": "saved"} — the set is now exactly `gametypes`
--   - not-ok/fault PN011 / PN012, from _require_club_member
--   - a RAW fault  the FK above
--
-- It authors no outcome of its own; what the handler below catches is
-- _require_club_member's PN011 / PN012.
create or replace function common.set_club_gametypes(
  target_club text,
  gametypes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  -- Null-coalesced so an explicit "play nothing" (empty array) and
  -- a NULL argument behave the same: clear every enrollment.
  wanted text[] := coalesce(gametypes, array[]::text[]);
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  -- Auth + membership gate (raises PN011 / PN012 on either failure).
  perform common._require_club_member(target_club);

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

  -- No message: the dialog closes on success and says nothing. `data` still
  -- names the answer — an `ok` a call site can only match by being `ok` is one
  -- a second answer would be drawn as (docs/envelopes.md → How SQL builds one).
  return common._ok_envelope(jsonb_build_object('result', 'saved'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.set_club_gametypes(text, text[]) from public;
grant execute on function common.set_club_gametypes(text, text[]) to authenticated;

drop function if exists common.get_club_page(text);

-- ============================================================
-- common.get_club_page RPC — everything ClubPage needs to render
-- ============================================================
--
-- One call in place of the four serial reads ClubPage used to make
-- (clubs → clubs_members → profiles → clubs_gametypes). The reads
-- were serial because each failure bailed to the page's error
-- state, so a chain that short-circuits cost four round trips on
-- every successful load to save three on a miscopied URL.
--
-- It is a READ RPC, which is unusual here — writes go through RPCs
-- and reads go through PostgREST + RLS (docs/supabase.md). Three
-- things are only reachable this way:
--
--   - ONE envelope, so one fault. Four parallel reads would fail
--     together on an outage, and faults do not coalesce (each is
--     its own modal, faultStore.ts), so the player would dismiss
--     four boxes to reach the page behind them.
--   - "No such club" and "not a member" become DIFFERENT answers.
--     RLS collapses them: it hides a club you are not in, so both
--     arrive at a direct read as zero rows, and the page had to
--     say both in one sentence. A definer function sees the club
--     row and the membership row separately.
--   - The sentences are the server's. The page renders the
--     envelope with <EnvelopeErrorPage> instead of pairing up its
--     own text and diagnostics line per failure.
--
-- The caller passes `presentFaults: false` and renders every
-- not-ok as the page itself: a modal over a page that failed to
-- load would say the same sentence twice (error-page/doc.md — a
-- modal when the page behind it survives, a page when it does
-- not).
--
-- Outcomes:
--   - ok           the payload below
--   - not-ok/fault PN493 signed out · PN494 no such club ·
--                  PN495 not a member
--
-- The payload, and why each piece is in it:
--
--   club       handle, name, and `is_solo` — the generated column,
--              so the FE stops re-deriving the '=' prefix itself.
--   members    the full roster, ALPHABETICAL by username, joined to
--              profiles here rather than in a second read.
--   gametypes  the enrolled set AND each one's `default_setup`,
--              which seeds SetupGameModal with what the friends
--              played last time. One shape, because a second read
--              for the defaults is the thing this call exists to
--              avoid.
--
-- Ordered inside the function rather than left to the planner:
-- the members list is rendered in array order by the header's
-- players strip, so "unordered" meant a roster whose order could
-- change between loads.
--
-- Checks run auth → existence → membership, and that order is the
-- point: `_require_club_member` is not used here precisely because
-- it answers "not a member" for a club that does not exist, which
-- is the distinction this function was written to draw.
create or replace function common.get_club_page(target_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_club    record;
  v_members jsonb;
  v_kinds   jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := auth.uid();
  if caller_id is null then
    -- PN493. App only renders ClubPage with a session, but one can expire
    -- between mount and this call, so it is reachable — and what the player
    -- needs is the instruction to refresh, not a page about the club.
    raise exception 'Signed out; try refresh'
      using errcode = 'PN493', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  select handle, name, is_solo into v_club
  from common.clubs where handle = target_handle;

  -- PN494. A miscopied or stale URL: the handle is the PK, so there is
  -- nothing to look up under a different spelling.
  if v_club.handle is null then
    raise exception 'No club with that name'
      using errcode = 'PN494', hint = 'fault', column = '_',
      detail = format('no common.clubs row for handle=%s', target_handle);
  end if;

  -- PN495. The club exists and is somebody's, just not yours. Saying so is
  -- safe here in a way it would not be on a public venue: clubs invite by
  -- name among friends (CLAUDE.md → Audience), and the alternative is the
  -- one sentence that has to cover both cases and therefore explains neither.
  if not exists (
    select 1 from common.clubs_members
    where club_handle = target_handle and user_id = caller_id
  ) then
    -- Word for word `_require_club_member`'s PN012: the same fact, and one
    -- sentence for it wherever it is said.
    raise exception 'You are not a member of this club'
      using errcode = 'PN495', hint = 'fault', column = '_',
      detail = 'caller is not in common.clubs_members for this club';
  end if;

  -- `coalesce(..., '[]')` on both: `jsonb_agg` over no rows is NULL, and the
  -- FE reads these as arrays. Neither is reachable today — a club always
  -- seats its creator, and one with no enrolled gametypes just draws an empty
  -- start list — but an empty array says that without the caller checking.
  select coalesce(jsonb_agg(m order by m.username), '[]'::jsonb) into v_members
  from (
    select p.user_id, p.username, p.color
    from common.clubs_members cm
    join common.profiles p on p.user_id = cm.user_id
    where cm.club_handle = target_handle
  ) m;

  select coalesce(jsonb_agg(k order by k.gametype), '[]'::jsonb) into v_kinds
  from (
    select cg.gametype, cg.default_setup
    from common.clubs_gametypes cg
    where cg.club_handle = target_handle
  ) k;

  -- `result` is the one answer this RPC has, and it is here for the same
  -- reason `create_club` says 'created': a call site's ok branch asserts
  -- something POSITIVE about the payload, so an answer added later cannot sail
  -- into it on the strength of `type` alone (docs/envelopes.md → The shape).
  return common._ok_envelope(data => jsonb_build_object(
    'result', 'loaded',
    'club', jsonb_build_object(
      'handle', v_club.handle, 'name', v_club.name, 'is_solo', v_club.is_solo),
    'members', v_members,
    'gametypes', v_kinds));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.get_club_page(text) from public;
grant execute on function common.get_club_page(text) to authenticated;

drop function if exists common.send_message(text, text);

-- ============================================================
-- common.send_message RPC
-- ============================================================
--
-- Post a message to a club's chat. Authorized for any member of
-- the club. Trimmed content must be 1–1000 chars (matches the
-- check constraint on common.messages).
--
-- Outcomes:
--   - ok                     {"result": "sent"} — the row is in
--   - not-ok/fault           PN011 / PN012 (_require_club_member), PN030
--   - not-ok/form-validation PN031 — over the 1000-char cap, on `content`
create or replace function common.send_message(target_club text, content text)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  trimmed text := trim(content);
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  -- Auth + membership gate: PN011 / PN012, caught by the handler below.
  caller_id := common._require_club_member(target_club);

  -- PN030. The chat form returns early on an empty box, so this is a bug
  -- rather than an empty message.
  if length(trimmed) = 0 then
    raise exception 'BUG: blank message'
      using errcode = 'PN030', hint = 'fault', column = '_',
      detail = 'chat body was blank';
  end if;

  -- PN031. The chat input mirrors this cap with `maxLength={1000}`, which
  -- browsers apply to pastes too, so nothing from that form should reach here —
  -- this is the second lock, for a caller that isn't the form. Still a
  -- validation rather than a fault: if it ever does arrive, shortening the text
  -- is what fixes it, and that belongs under the box they typed in.
  if length(trimmed) > 1000 then
    raise exception 'Too long: max 1000 characters'
      using errcode = 'PN031', hint = 'form-validation', column = 'content',
      detail = 'chat body over the cap';
  end if;

  insert into common.messages (club_handle, user_id, content)
  values (target_club, caller_id, trimmed);

  -- No message: the sent line appears in the log, which says it better than a
  -- sentence would. `result` is still what a call site branches on
  -- (docs/envelopes.md → How SQL builds one).
  return common._ok_envelope(jsonb_build_object('result', 'sent'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.send_message(text, text) from public;
grant execute on function common.send_message(text, text) to authenticated;

drop function if exists common.claim_username(text, text);

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
--      slug-space user-typed names cannot reach (_slugify_club_name
--      strips '='), so there's no risk of collision with
--      friend-club handles.
--   3. clubs_gametypes rows for the solo club, covering only the
--      gametypes a single player can actually play (min_players <=
--      1, via common._default_gametypes_for_club). A solo club has
--      one member forever, so two-player games like codenamesduet would
--      never be startable there — we don't enroll the club in them.
--      The member can still add them later from the club-settings UI
--      (common.set_club_gametypes) if they want them listed.
--
-- Outcomes:
--   - ok               {"result": "claimed"}, and data.username is the name
--   - not-ok/form-validation  PN017 — that username is taken. The ONE thing
--                      here a player can act on, and the one the form cannot
--                      know.
--   - not-ok/service-error  PN016 — this profile already has a username
--   - not-ok/fault     PN013 not signed in · PN014 bad username format ·
--                      PN015 off-palette color · PN018 the auth.users row is
--                      gone. The first three are unreachable from the app: the
--                      screen checks the same regex before it submits and only
--                      offers the eight palette swatches, so their messages are
--                      written for whoever reads the fault.
--
-- The CHECK on profiles.username would catch a bad regex too; the explicit
-- raise earns its place by naming the condition and pointing at one line.
create or replace function common.claim_username(desired text, chosen_color text)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := auth.uid();
  -- PN013. Unreachable through PostgREST, which refuses a call to `common`
  -- before the body runs when there is no JWT — kept because the function is
  -- also called by supabase/scripts/add-user.ts, where it is the honest answer.
  if caller_id is null then
    raise exception 'Signed out; try refresh'
      using errcode = 'PN013', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  -- PN014. The claim screen tests the SAME regex before it submits, so this is
  -- a bug rather than a name problem.
  if desired !~ '^[a-z][a-z0-9-]{2,14}$' then
    raise exception 'BUG: username in the wrong format'
      using errcode = 'PN014', hint = 'fault', column = '_',
      detail = 'username must match ^[a-z][a-z0-9-]{2,14}$';
  end if;

  -- PN016. A second tab, or a double submit: the screen is only reached when
  -- the frontend saw no profile, and by now there is one. Nothing is broken and
  -- nothing is lost — but it is odd enough to say in red rather than to wave
  -- through as an `ok`, which would also claim the name they just typed is
  -- theirs when it may not be.
  --
  -- Checked explicitly so it stays distinguishable from PN017: without it the
  -- user_id PK would raise the same 23505 as a username collision.
  if exists (select 1 from common.profiles where user_id = caller_id) then
    raise exception 'You already have a username'
      using errcode = 'PN016', hint = 'service-error', column = '_',
      detail = 'this profile already has a username';
  end if;

  -- PN015. The picker offers the eight palette swatches and nothing else. (The
  -- DB requires a color and has no default; direct SQL inserts such as the test
  -- personas supply their own via common._color_for_username.)
  if chosen_color not in
       ('red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink') then
    raise exception 'BUG: color outside the palette'
      using errcode = 'PN015', hint = 'fault', column = '_',
      detail = format('color %L is not in the member palette', chosen_color);
  end if;

  -- The two conditions the constraints are the referee for, caught here and
  -- given words. A pre-check `select` could not close the username race anyway:
  -- two callers can both see the name free.
  begin
    insert into common.profiles (user_id, username, color)
    values (caller_id, desired, chosen_color);
  exception
    -- PN017. The real validation, and the only outcome here a player can do
    -- something about — the form cannot know what other people have taken.
    when unique_violation then
      raise exception 'That username is taken'
        using errcode = 'PN017', hint = 'form-validation', column = 'desired',
        detail = 'a profile already holds this username';
    -- PN018. profiles.user_id references auth.users, so this means the row
    -- behind the caller's JWT is gone — a stale token after a db:reset, or a
    -- deleted account. The claim screen reads this code and signs them out;
    -- there is nothing else to do with a token whose user no longer exists.
    when foreign_key_violation then
      raise exception 'Your session expired — signing you out.'
        using errcode = 'PN018', hint = 'fault', column = '_',
        detail = 'no auth.users row for auth.uid()';
  end;

  insert into common.clubs (handle, name, created_by)
  values ('=' || desired, desired, caller_id);

  insert into common.clubs_members (club_handle, user_id)
  values ('=' || desired, caller_id);

  insert into common.clubs_gametypes (club_handle, gametype)
  select '=' || desired, gametype
    from common._default_gametypes_for_club('=' || desired);

  -- `result` beside the username, not instead of it: the name is what a caller
  -- would USE, `result` is what says which answer this is (docs/envelopes.md →
  -- Choosing which `ok` branch).
  return common._ok_envelope(
    data => jsonb_build_object('result', 'claimed', 'username', desired));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.claim_username(text, text) from public;
grant execute on function common.claim_username(text, text) to authenticated;

-- Dropped here because this file is re-applied rather than diffed, so a
-- retired signature has to say so: `update_profile_color(text)` is the
-- color-only write this function replaced.
drop function if exists common.update_profile_color(text);
drop function if exists common.update_profile(text, boolean);

-- ============================================================
-- common.update_profile — save your own profile settings
-- ============================================================
-- The profile's editable fields, saved together: your player color and
-- whether the app plays sounds for you (username is still immutable in v1).
-- One call because the "Edit profile" dialog saves them with one button,
-- and a half-saved profile is not a state worth having to explain.
-- Security-definer + caller-scoped (only ever writes auth.uid()'s own row),
-- so there's no UPDATE policy on common.profiles — this RPC is the single
-- write path, like every other mutation in the app.
-- Outcomes: `ok` with {"result": "saved"}, or one of four faults. Nothing here
-- is a validation — the picker offers the eight palette swatches and the sound
-- setting is a checkbox, so every way this can refuse is a bug or a dead
-- session rather than a choice a player made.
create or replace function common.update_profile(new_color text, new_sounds_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  caller_id := auth.uid();
  -- PN032. Unreachable through PostgREST, which refuses a call to `common`
  -- before the body runs when there is no JWT.
  if caller_id is null then
    raise exception 'Signed out; try refresh'
      using errcode = 'PN032', hint = 'fault', column = '_',
      detail = 'auth.uid() is null';
  end if;

  -- PN033. The list must match the CHECK on common.profiles.color and the FE's
  -- MEMBER_COLORS. A named condition beats the raw 23514: the code points at
  -- one line, and the message says which value arrived.
  if new_color not in
       ('red', 'orange', 'yellow', 'green', 'brown', 'blue', 'purple', 'pink') then
    raise exception 'BUG: color outside the palette: %', new_color
      using errcode = 'PN033', hint = 'fault', column = '_',
      detail = 'color must be one of the member palette';
  end if;

  -- PN501. The checkbox always sends true or false; a null would otherwise
  -- escape as the column's raw not-null violation rather than an envelope.
  if new_sounds_enabled is null then
    raise exception 'BUG: sound setting missing'
      using errcode = 'PN501', hint = 'fault', column = '_',
      detail = 'new_sounds_enabled must be true or false';
  end if;

  update common.profiles
     set color = new_color,
         sounds_enabled = new_sounds_enabled
   where user_id = caller_id;
  -- PN034. The profile row behind this JWT is gone — a db:reset under a live
  -- tab, or a deleted account. The same condition claim_username reports as
  -- PN018, and what `useProfile` raises for itself when its read finds no row.
  if not found then
    raise exception 'Your profile is no longer on the server. Please refresh.'
      using errcode = 'PN034', hint = 'fault', column = '_',
      detail = 'no profiles row for the caller';
  end if;

  -- No message: the dialog closes and the settings take effect, which says it.
  -- `result` is what a call site branches on (docs/envelopes.md → How SQL
  -- builds one).
  return common._ok_envelope(jsonb_build_object('result', 'saved'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function common.update_profile(text, boolean) from public;
grant execute on function common.update_profile(text, boolean) to authenticated;
-- GRANTED to authenticated: read through security_invoker views (the
-- letter-mask filter the word games' pickers use), so the caller needs it.
revoke execute on function common.word_letter_mask(text) from public;
grant execute on function common.word_letter_mask(text) to authenticated;

-- Public reference data: an English dictionary isn't secret and
-- leaks no per-game answer key (a spellingbee board's legal words live
-- in the hidden spellingbee.games_state columns, not here). Readable by
-- any signed-in user, under a permissive policy (below). The only write
-- path besides curation is the lazy
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
-- common._anagram_fits
-- ============================================================
-- The last stage of `anagrams`' match: whether word `w` can be spelled from
-- the floating letters and wildcards, the pinned positions having already
-- matched through the LIKE pattern `pat`. Each unpinned position consumes a
-- floating letter or, failing that, a wildcard.
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

-- DROP first: `create or replace` cannot change a function's return type, and
-- `if exists` keeps the file re-appliable in full on every deploy.
drop function if exists common.anagrams(text);

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
-- uses (docs/word-list.md → Which words a game may use), on purpose; a pgTAP
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
--
-- SECURITY DEFINER (house pattern): the internal _anagram_fits helper is
-- revoked from callers, so an invoker-rights version 403s the moment an
-- authenticated player's call reaches it.
create or replace function common.anagrams(letters text)
returns jsonb
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
  found   jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  -- PN001. The player typed this, so it is theirs to fix — a validation, shown
  -- under the box it names. The MESSAGE is what they read, and COLUMN says
  -- which field it belongs under.
  if letters is null or letters !~ '^[A-Za-z?]{2,15}$' then
    raise exception '2–15 letters, or ?'
      using errcode = 'PN001', hint = 'form-validation', column = 'letters',
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

  -- Ordering is part of the contract (difficulty, then word), so the array is
  -- built with `jsonb_agg(... order by ...)` rather than left to the planner.
  select coalesce(jsonb_agg(jsonb_build_object('word', t.word, 'difficulty', t.difficulty)
                            order by t.difficulty, t.word), '[]'::jsonb)
    into found
    from (
      select w.word, w.difficulty
        from common.words w
       where w.len = n
         and w.word like pat
         and bit_count((w.letter_mask & ~in_mask)::bit(64)) <= k
         and common._anagram_fits(w.word, pat, floats, k)
    ) t;

  -- No matches is an ANSWER, not a failure: the letters were well-formed and
  -- the dictionary has nothing. One `ok` covers both — the dialog reads the
  -- array's length and says so itself.
  --
  -- The words sit UNDER a key rather than being `data` outright. A bare array
  -- leaves a call site nothing to assert but its shape, and `Array.isArray` is
  -- not a case (docs/envelopes.md → Choosing which `ok` branch); `result` is.
  return common._ok_envelope(
    data => jsonb_build_object('result', 'searched', 'words', found));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
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
    -- PN019. A fault: the Edit affordance only draws for a profile whose
    -- can_edit_words is true (DefinitionView), so reaching this means either a
    -- revoked flag mid-session or a hand-rolled call.
    raise exception 'You can''t edit the dictionary'
      using errcode = 'PN019', hint = 'fault', column = '_',
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
      -- PN020-PN023 are all faults: the dialog builds this object from its own
      -- named controls, so an unknown key or an out-of-range number is our bug.
      raise exception 'BUG: field outside the editable set: %', k
        using errcode = 'PN020', hint = 'fault', column = '_',
        detail = 'field is not in the editable allow-list';
    end if;
  end loop;
  if fields ? 'difficulty'
     and (fields->>'difficulty')::int not between 1 and 6 then
    raise exception 'BUG: difficulty outside 1-6'
      using errcode = 'PN021', hint = 'fault', column = '_',
      detail = 'words.difficulty is 1-6';
  end if;
  if fields ? 'crude' and (fields->>'crude')::int not between 0 and 2 then
    raise exception 'BUG: crude rating outside 0-2'
      using errcode = 'PN022', hint = 'fault', column = '_',
      detail = 'words.crude is 0-2';
  end if;
  if fields ? 'slur' and (fields->>'slur')::int not between 0 and 2 then
    raise exception 'BUG: slur rating outside 0-2'
      using errcode = 'PN023', hint = 'fault', column = '_',
      detail = 'words.slur is 0-2';
  end if;
end;
$$;
revoke execute on function common._validate_word_fields(jsonb) from public;

drop function if exists common.update_word(text, jsonb, text);

-- Patch an existing word. `patch` holds ONLY the changed fields (that's
-- what the journal's `new` records); a key present with a null value
-- clears the column (definition/hint).
create or replace function common.update_word(
  target_word text,
  patch jsonb,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed  record;
  w   common.words%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select * into ed from common._require_word_editor();
  perform common._validate_word_fields(patch);
  if patch = '{}'::jsonb then
    -- PN024. Reachable: the dialog closes itself when nothing changed AND
    -- there is no note, so this is the note-only save. A validation — change
    -- something or cancel — and it names the patch it came in on.
    raise exception 'Nothing changed'
      using errcode = 'PN024', hint = 'form-validation', column = 'patch',
      detail = 'the edit was a no-op';
  end if;

  select * into w from common.words where word = lower(target_word) for update;
  -- PN025. Another editor deleted it while this dialog was open. Nothing broke
  -- and nothing is lost, but it is unusual enough to say in red — the same
  -- reading delete_game's already-deleted gets.
  if not found then
    raise exception 'No such word: %', target_word
      using errcode = 'PN025', hint = 'service-error', column = '_',
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

  -- `result` reuses the journal's own vocabulary (`words_edits.kind`), so the
  -- answer and the row it wrote say the same word.
  return common._ok_envelope(jsonb_build_object('result', 'updated'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function common.update_word(text, jsonb, text) from public;
grant execute on function common.update_word(text, jsonb, text) to authenticated;

drop function if exists common.delete_word(text, text);

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
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed record;
  w  common.words%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select * into ed from common._require_word_editor();
  select * into w from common.words where word = lower(target_word) for update;
  if not found then
    -- PN026. The same condition as PN025 at its own site: one code per raise,
    -- so a code in a report leads to one line rather than to two.
    raise exception 'No such word: %', target_word
      using errcode = 'PN026', hint = 'service-error', column = '_',
      detail = 'word absent from common.words';
  end if;

  delete from common.words where word = w.word;

  insert into common.words_edits (word, kind, old, new, note, edited_by, edited_by_username)
  values (w.word, 'delete', to_jsonb(w), null, note, ed.editor_id, ed.editor_username);

  -- As in add_word / update_word: `result` is the journal's own `kind`.
  return common._ok_envelope(jsonb_build_object('result', 'deleted'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function common.delete_word(text, text) from public;
grant execute on function common.delete_word(text, text) to authenticated;

drop function if exists common.add_word(text, jsonb, text);

-- Add a word. `fields` uses the same editable set; difficulty is required
-- (there is no sensible default band), everything else defaults to the
-- import's defaults. len derives, letter_mask generates.
create or replace function common.add_word(
  new_word text,
  fields jsonb,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = common, public, extensions
as $$
declare
  ed record;
  w  common.words%rowtype;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
begin
  select * into ed from common._require_word_editor();
  perform common._validate_word_fields(fields);

  new_word := lower(trim(coalesce(new_word, '')));
  -- 1..45 matches the dictionary's real range ('a' to the 45-letter lung
  -- disease); lowercase a-z only, like every imported word.
  if new_word !~ '^[a-z]{1,45}$' then
    -- PN027. The add form takes the new word as free text and checks nothing,
    -- so this is a real validation about the box they typed in.
    raise exception 'A word is 1-45 lowercase letters'
      using errcode = 'PN027', hint = 'form-validation', column = 'new_word',
      detail = 'new word must be 1-45 lowercase letters';
  end if;
  if not fields ? 'difficulty' then
    -- PN028. There is no sensible default band, so the server is the first to
    -- ask. `fields` is the parameter it arrived in; the difficulty control
    -- inside it is where the message belongs once forms route by field.
    raise exception 'Pick a difficulty'
      using errcode = 'PN028', hint = 'form-validation', column = 'fields',
      detail = 'add_word needs a difficulty';
  end if;
  if exists (select 1 from common.words cw where cw.word = new_word) then
    -- PN029. The form cannot know what the dictionary holds.
    raise exception 'Already in the dictionary: %', new_word
      using errcode = 'PN029', hint = 'form-validation', column = 'new_word',
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

  -- As in update_word: the journal's `kind` is the vocabulary.
  return common._ok_envelope(jsonb_build_object('result', 'added'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
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
-- common._require_player_count_max — player-count upper bound
-- ============================================================
-- Centralizes the "max N players" check that each open-N game's
-- create_game calls near the top (mirrors _require_club_member +
-- _require_valid_timer). 6 isn't a global rule — each create_game passes its
-- own cap; codenamesduet keeps its inline exactly-2 check. No grant to
-- authenticated: only callable from other SECURITY DEFINER RPCs.
create or replace function common._require_player_count_max(
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
    raise exception 'BUG: game with % players', array_length(player_user_ids, 1)
      using errcode = 'PN041', hint = 'fault', column = '_',
      detail = 'player count exceeds the gametype''s max';
  end if;
end;
$$;

revoke execute on function common._require_player_count_max(uuid[], int) from public;
