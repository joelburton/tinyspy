-- ============================================================
-- psychicnum: per-game setup config (guess budget)
-- ============================================================
--
-- Adds a `config jsonb` column on psychicnum.games and reshapes
-- create_game to accept (target_club, config) — the two-arg
-- signature replaces the one-arg signature this same file
-- drops below.
--
-- Config shape:
--   { "guesses": 3 | 5 | 7 | 9 }
--
-- One option for now: starting guess budget. 7 was the
-- hardcoded default; the dialog adds 3 (hard), 5 (medium), and
-- 9 (easy) as alternatives. Stays a discrete set rather than a
-- free integer input so the choice is "pick a difficulty,"
-- not "fiddle with a number."
--
-- The `check (guesses_remaining between 0 and 7)` constraint
-- widens to `0 and 9` so the 9-guess setting fits. Existing
-- rows are at most 7 and survive unchanged.
--
-- Why a jsonb column rather than a discrete `starting_guesses int`
-- (echoing the same call we made on the tinyspy side): the
-- mutable `guesses_remaining` counter decrements during play,
-- so by end-of-game it can't tell you what the starting budget
-- was. Persisting the original config in jsonb preserves intent
-- for game review and keeps future psychicnum options behind a
-- single column rather than per-feature column churn.
--
-- Validation is server-side: create_game rejects malformed
-- payloads (missing or out-of-range `guesses`). The FE's
-- PsychicnumConfig type is advisory only.

-- ─── The config column ──────────────────────────────────
-- Existing rows (legacy games from local dev resets, if any)
-- get '{}'::jsonb. The new RPC is the only code that reads
-- this column; legacy rows just carry an empty shape.
alter table psychicnum.games add column config jsonb not null default '{}'::jsonb;
alter table psychicnum.games alter column config drop default;

-- ─── Widen the guesses_remaining check ──────────────────
-- The anonymous inline check from the baseline is named
-- `games_guesses_remaining_check` by Postgres's default
-- (table + column + "_check"). Drop and recreate with the
-- wider bound.
alter table psychicnum.games
  drop constraint games_guesses_remaining_check;
alter table psychicnum.games
  add constraint games_guesses_remaining_check
  check (guesses_remaining between 0 and 9);

-- ─── Replace create_game ────────────────────────────────
-- Signature changes (added jsonb param), so we drop the
-- one-arg version explicitly.
drop function if exists psychicnum.create_game(uuid);

create function psychicnum.create_game(target_club uuid, config jsonb)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  new_id uuid;
  cfg_guesses int;
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

  -- No member-count check — psychic-num plays with any club size.
  -- Must agree with the `numberOfPlayers: [1, null]` declaration
  -- in src/psychicnum/manifest.ts. See docs/code-conventions.md →
  -- "Per-game player counts" for the cross-reference convention.

  -- ─── Validate config shape ────────────────────────────
  -- One option, four allowed values. We don't trust the FE for
  -- any of this — the dialog narrows TypeScript to the same set,
  -- but a curious client could send anything.
  --
  -- Missing-vs-bad-value split so each rejection has a clean
  -- message. Otherwise PL/pgSQL's % placeholder substitutes NULL
  -- as the empty string and we'd raise "...must be 3, 5, 7, or 9
  -- (got )" — readable, but confusingly empty in the parens.
  if (config->>'guesses') is null then
    raise exception 'config.guesses is required' using errcode = 'P0001';
  end if;
  cfg_guesses := (config->>'guesses')::int;
  if cfg_guesses not in (3, 5, 7, 9) then
    raise exception 'config.guesses must be 3, 5, 7, or 9 (got %)', cfg_guesses
      using errcode = 'P0001';
  end if;

  -- Insert the game row. guesses_remaining seeds from cfg;
  -- config itself is persisted for game-review surfaces. target
  -- is the random 1..10 secret, hidden by the column-level
  -- grant.
  insert into psychicnum.games (club_id, target, guesses_remaining, config)
  values (
    target_club,
    1 + floor(random() * 10)::int,
    cfg_guesses,
    config
  )
  returning games.id into new_id;

  insert into common.club_active_game (club_id, gametype, game_id, set_active_at)
  values (target_club, 'psychicnum', new_id, now())
  on conflict (club_id) do update set
    gametype = excluded.gametype,
    game_id = excluded.game_id,
    set_active_at = excluded.set_active_at;

  return query select new_id;
end;
$$;

revoke execute on function psychicnum.create_game(uuid, jsonb) from public;
grant execute on function psychicnum.create_game(uuid, jsonb) to authenticated;
