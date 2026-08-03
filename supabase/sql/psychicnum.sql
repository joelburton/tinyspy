-- ============================================================
-- psychicnum — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for psychicnum. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`npm run sql:apply`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260615000002_psychicnum.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema psychicnum to authenticated;

-- Games: any club member sees the row. (`target` is additionally
-- column-hidden, regardless of policy.)
drop policy if exists games_select on psychicnum.games;
create policy games_select on psychicnum.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Players: club-wide visibility in BOTH modes. The compete-mode
-- requirement is "opponents see my budget but not my guesses" —
-- so the budget column on this table is intentionally public to
-- the club. Same policy shape for both modes; no branching.
drop policy if exists players_select on psychicnum.players;
create policy players_select on psychicnum.players
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- Guesses: branch on the parent game's mode.
--   coop    — every club member sees every guess (default).
--   compete — each player sees only their own guesses DURING PLAY;
--             everyone's open once the game is terminal.
--
-- The mode test reads `g.mode` from the parent psychicnum.games
-- row — denormalized expressly to avoid joining common.games on
-- every guess select. The terminal arm is what forces the join
-- back in: `is_terminal` lives on common.games and there's no
-- point denormalizing a flag that flips mid-game.
--
-- Why compete opens at terminal (2026-08-02): the turn log grew
-- the shared "whose turns?" picker, and its whole value in compete
-- is the post-game read-through — "how did moth spend their
-- budget?". Hiding an opponent's guesses DURING play is the real
-- rule (their guesses are their strategy); hiding them after the
-- game has ended just withholds the interesting part. Same shape
-- as stackdown / connections / waffle.
drop policy if exists guesses_select on psychicnum.guesses;
create policy guesses_select on psychicnum.guesses
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       join common.games cg on cg.id = g.id
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (g.mode = 'coop' or guesses.user_id = auth.uid() or cg.is_terminal)
    )
  );

-- ============================================================
-- Grants — `secrets` is column-excluded
-- ============================================================
-- Same column-level grant pattern as before: every column on
-- psychicnum.games EXCEPT `secrets`. The games_state view below
-- (via `_secrets_for`) is the only authenticated read path for
-- `secrets`.

grant select
  (id, club_handle, mode, words, created_at)
  on psychicnum.games to authenticated;

grant select on psychicnum.players to authenticated;
grant select on psychicnum.guesses to authenticated;

-- ============================================================
-- psychicnum.games_state — FE-ready read view
-- ============================================================
-- One read for "the gametype-specific fields of this game,
-- including the secrets IFF the game is terminal."
--
-- Mode-agnostic: the secrets reveal gates on
-- common.games.is_terminal, which becomes true at game-end in
-- BOTH modes. Coop end (team won/lost) and compete end (someone
-- won, or everyone lost) both write is_terminal=true via
-- common.end_game, so both surfaces flip the reveal at the
-- right moment.
--
-- play_state itself lives on common.games and is read by the FE
-- via useCommonGame — this view does NOT include it.

create or replace function psychicnum._secrets_for(g_id uuid)
returns text[]
language sql
stable
security definer
set search_path = psychicnum, common, public, extensions
as $$
  select case when c.is_terminal then p.secrets else null end
    from psychicnum.games p
    join common.games c on c.id = p.id
   where p.id = g_id
$$;

revoke execute on function psychicnum._secrets_for(uuid) from public;
grant execute on function psychicnum._secrets_for(uuid) to authenticated;

drop view if exists psychicnum.games_state;
create view psychicnum.games_state
  with (security_invoker = true)
as
  select
    id,
    club_handle,
    mode,
    words,
    created_at,
    psychicnum._secrets_for(id) as secrets
  from psychicnum.games;

grant select on psychicnum.games_state to authenticated;
revoke insert, update, delete on psychicnum.games_state from authenticated;

-- ============================================================
-- psychicnum.create_game(target_club, setup, player_user_ids, mode)
-- ============================================================
-- One RPC for both modes. The `mode` parameter:
--   - chooses which gametype string is written to common.games
--     ('psychicnum_coop' or 'psychicnum_compete')
--   - is stored on psychicnum.games.mode for RLS branching
--   - is validated by a CHECK constraint regardless
--
-- Setup shape (same in both modes):
--   { "guesses":    3 | 5 | 7 | 9,
--     "word_count": 5..20,           -- how many words on the board
--     "difficulty": 1..6,            -- dictionary band (common.words.difficulty)
--     "timer":   { "kind": "none" | "countup" }
--             |  { "kind": "countdown", "seconds": 1..3600 } }
--
-- The board is `word_count` distinct words sampled from common.words under a
-- clean + american + difficulty-≤-band filter; three of them become the
-- hidden secrets.
--
-- guesses meaning:
--   - coop: shared budget (every player row gets the same
--     initial value; decrement all on every guess).
--   - compete: per-player budget (every player row gets the
--     same initial value; only the guesser's row decrements).
--
-- Player-count check: compete needs 2+ players (one-player
-- compete is "racing yourself" — degenerate, hidden by the FE
-- manifest's numberOfPlayers range, also enforced here defensively).
-- Coop allows 1..6.

create or replace function psychicnum.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[],
  mode text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  new_id uuid;
  s_guesses int;
  s_word_count int;
  s_difficulty int;
  s_words text[];
  s_secrets text[];
  game_title text;
  effective_gametype text;
  first_turn uuid;
begin
  -- ─── Validate mode + player-count ───────────────────
  perform common.require_valid_mode(mode);

  if mode = 'compete' then
    -- Compete needs an opposing PLAYER. A solo race is just a
    -- coop game with a timer. FE manifest hides the compete
    -- button in 1-player clubs; this guard is the server-side
    -- catch.
    if coalesce(array_length(player_user_ids, 1), 0) < 2 then
      raise exception 'compete mode requires at least 2 players'
        using errcode = 'P0001';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/psychicnum/manifest.ts. See
  -- docs/code-conventions.md → "Per-game player counts".
  perform common.require_player_count_max(player_user_ids, 6);

  -- ─── Validate setup shape ────────────────────────────
  if (setup->>'guesses') is null then
    raise exception 'setup.guesses is required' using errcode = 'P0001';
  end if;
  s_guesses := (setup->>'guesses')::int;
  if s_guesses not in (3, 5, 7, 9) then
    raise exception 'setup.guesses must be 3, 5, 7, or 9 (got %)', s_guesses
      using errcode = 'P0001';
  end if;

  -- ─── Validate the board size (how many words) ──────────────
  if (setup->>'word_count') is null then
    raise exception 'setup.word_count is required' using errcode = 'P0001';
  end if;
  s_word_count := (setup->>'word_count')::int;
  if s_word_count < 5 or s_word_count > 20 then
    raise exception 'setup.word_count must be 5..20 (got %)', s_word_count
      using errcode = 'P0001';
  end if;

  -- ─── Validate the dictionary difficulty band ───────────────
  if (setup->>'difficulty') is null then
    raise exception 'setup.difficulty is required' using errcode = 'P0001';
  end if;
  s_difficulty := (setup->>'difficulty')::int;
  if s_difficulty < 1 or s_difficulty > 6 then
    raise exception 'setup.difficulty must be 1..6 (got %)', s_difficulty
      using errcode = 'P0001';
  end if;

  perform common.require_valid_timer(setup->'timer');

  -- The board: `word_count` distinct words sampled from the dictionary under a
  -- clean (no crude/slur), american, non-slang, difficulty-≤-band filter.
  -- TEMP (texture for font-sizing): all 5-letter words EXCEPT one 9-letter
  -- word, so the board shows differing word widths while we tune the font.
  -- Revert to the plain length-agnostic sample (just the 5-letter branch's
  -- filter, no `len` clause, limit s_word_count) once the font work is done.
  select array_agg(word order by random()) into s_words
    from (
      (select word from common.words
        where slur = 0 and crude = 0 and american and not slang
          and difficulty <= s_difficulty and len = 5
        order by random() limit s_word_count - 1)
      union all
      (select word from common.words
        where slur = 0 and crude = 0 and american and not slang
          and difficulty <= s_difficulty and len = 9
        order by random() limit 1)
    ) picked;

  if coalesce(array_length(s_words, 1), 0) < s_word_count then
    -- Effectively impossible (the band-1 clean set is large), but guard so a
    -- short board never silently ships.
    raise exception 'not enough words for that difficulty' using errcode = 'P0001';
  end if;

  -- Three DISTINCT secrets sampled from the board words.
  select array_agg(w) into s_secrets
    from (
      select unnest(s_words) as w
       order by random()
       limit 3
    ) picked;

  -- The title is a human-readable label for the game row: the first three
  -- BOARD words alphabetically, dash-joined ("APPLE-BERRY-CHERRY"), so a game
  -- is recognizable in the club list by what's on its board.
  --
  -- It must NOT carry the secrets (that would put them in the club-wide-
  -- readable common.games.title) — and it doesn't: the board words are shown
  -- to every player anyway, and three of them in alphabetical order says
  -- nothing about WHICH three are the secrets. The column-level grant on
  -- psychicnum.games.secrets stays the canonical "true server-side secret".
  select string_agg(upper(w), '-' order by w) into game_title
    from (
      select unnest(s_words) as w
      order by 1
      limit 3
    ) first3;

  effective_gametype := 'psychicnum_' || mode;

  -- Common-side coordination — see common.create_game for the
  -- full responsibilities (auth, membership, vacate prior
  -- current-view game, insert common.games + game_players,
  -- return canonical id).
  -- Saved-default arg strips first_turn_user_id — the turn-order "who goes
  -- first" pick is a per-game choice, not a per-club preference (same
  -- treatment codenamesduet gives first_clue_giver_user_id). The coop_style
  -- toggle itself DOES round-trip, so a club that likes turns keeps it.
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids,
    game_title,
    setup,
    setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop. When setup.coop_style='turns', seat the
  -- common rotation (seat 0 = the chosen first player, the rest shuffled)
  -- so submit_guess gates each guess on whose turn it is. Free-for-all
  -- (the default, or any compete game) leaves the pointer null — inert.
  -- The players + the pointer live on the common tables that
  -- common.create_game just populated, so this runs after it.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'setup.first_turn_user_id must be one of the players'
        using errcode = 'P0001';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  -- Insert the gametype-specific row.
  insert into psychicnum.games (id, club_handle, mode, words, secrets)
  values (new_id, target_club, mode, s_words, s_secrets);

  -- One player row per player_user_ids entry, all seeded with
  -- the same initial guess budget. Coop will decrement all of
  -- them in lock-step; compete decrements each independently.
  insert into psychicnum.players (game_id, user_id, guesses_remaining)
  select new_id, uid, s_guesses
    from unnest(player_user_ids) as uid;

  -- Seed the club-list readout, in the SAME shape submit_guess maintains.
  -- Without this `status` stays NULL until the first guess and a brand-new
  -- game reads as a bare "Playing" while every other game on the roster shows
  -- its opening state. Coop carries the shared budget + the 0/N found tally;
  -- compete carries only the SUMMED budget, because this column is club-wide
  -- readable and a shared found-count would tell you how close your opponent
  -- is (see the submit_guess writer for the same split).
  perform common.update_state(
    new_id,
    'playing',
    case when mode = 'coop'
         then jsonb_build_object(
                'guesses_remaining', s_guesses,
                'found_secrets_count', 0,
                'required_secrets_count', array_length(s_secrets, 1))
         else jsonb_build_object(
                'guesses_remaining', s_guesses * array_length(player_user_ids, 1))
    end
  );

  return query select new_id;
end;
$$;

revoke execute on function psychicnum.create_game(text, jsonb, uuid[], text) from public;
grant execute on function psychicnum.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- psychicnum.submit_guess — the only mid-game guess action
-- ============================================================
-- There are THREE secret WORDS (hidden among the board words);
-- players win by finding all three. So a correct guess no longer
-- ends the game by itself — only the guess that completes the set
-- does.
--
-- The guess must be one of the board words (the player clicks a
-- tile or types a word that's on the board). Compared case-folded.
--
-- The return value answers ONE question — did the caller's guess
-- hit a secret? — because its only consumer is the pill flashed in
-- the entry box. Returns one of:
--   'won'     — this guess found the last needed secret; the
--               caller (compete) / team (coop) wins. Terminal.
--   'correct' — found a secret. Usually the game continues; it can
--               also be the guess that empties the budget (see the
--               loss branch below), which ends the game — still
--               'correct', because the player DID find a secret.
--   'wrong'   — missed.
-- The FE flashes green for 'won'/'correct', red for 'wrong'; the
-- terminal transition itself it observes via realtime, not the
-- return value.
--
-- There is deliberately NO 'lost': the budget-exhausting guess used
-- to return it whichever way the guess went, so a correct guess that
-- happened to empty the budget flashed a red "Incorrect" for a beat
-- before the terminal verdict replaced it — the return value was
-- reporting the game's fate in a slot the FE reads as the player's.
-- Every other way this game ends (timeout, concede, a compete
-- opponent finishing) already reaches the FE via realtime; the
-- exhaustion loss now does too.
--
-- "Found all three" is scoped per mode:
--   coop    — the TEAM's distinct correct guesses (everyone's).
--   compete — the CALLER's own distinct correct guesses; each
--             racer must find all three themselves.
--
-- A correct guess bumps the caller's players.found_secrets_count (the
-- public per-player count that drives compete opponent tension).
--
-- A word already guessed (in scope) is rejected — the FE disables
-- guessed tiles, this is the server guard. Hint rows don't count,
-- so a hinted word can still be guessed.
--
-- Concurrency: SELECT FOR UPDATE on the game row serializes
-- concurrent submits. Two simultaneous set-completing guesses in
-- compete: first commits the winner; the second sees play_state
-- != 'playing' and raises 'game is not active'.

create or replace function psychicnum.submit_guess(target_game uuid, guess text)
returns text
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  w text;
  current_play_state text;
  initial_guesses int;
  is_correct boolean;
  caller_remaining int;
  total_remaining int;
  found_count int;
  required_secrets_count int;
  player_results jsonb;
  winner_name text;
  terminal_state text;
  terminal_outcome text;
begin
  -- Lock the gametype row for serialization of concurrent submits. We read it
  -- first so the board-word check can use this game's words.
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Normalize and require the guess to be one of the board words (the player
  -- can only meaningfully guess a word that's shown — the words analogue of
  -- the old 1..max range check).
  w := lower(trim(coalesce(guess, '')));
  if not (w = any(g.words)) then
    raise exception 'not a word on the board' using errcode = 'P0001';
  end if;

  -- Auth + game-player gate.
  caller_id := common.require_game_player(target_game);

  select play_state, (setup->>'guesses')::int
    into current_play_state, initial_guesses
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- games (pointer null) and solo; raises 'not your turn' when it's a
  -- turn game and someone guesses out of turn. Placed after the active
  -- check so a finished game reads "game is not active" for everyone,
  -- not "not your turn" for the non-current player.
  perform common._require_turn(target_game, caller_id);

  -- A conceded player is out of the race — no more guesses. The FE gates
  -- on myConceded, so this only fires on a race (a guess in flight when
  -- concede commits, or a stale second tab). Without it a conceder could
  -- complete the win condition and be recorded the winner.
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you have conceded' using errcode = 'P0001';
  end if;

  -- Per-mode budget check on the caller's row.
  select guesses_remaining into caller_remaining
    from psychicnum.players
   where game_id = target_game and user_id = caller_id;
  if caller_remaining is null then
    -- Shouldn't happen — require_game_player passed, so the row
    -- exists. Defensive.
    raise exception 'no budget row for caller' using errcode = 'P0002';
  end if;
  if caller_remaining <= 0 then
    raise exception 'no guesses remaining' using errcode = 'P0001';
  end if;

  -- Reject a word already taken (in scope: coop = anyone's, compete =
  -- caller's). Hint rows are excluded — a hinted word can still be guessed.
  if exists (
    select 1 from psychicnum.guesses
     where game_id = target_game and kind = 'guess' and word = w
       and (g.mode = 'coop' or user_id = caller_id)
  ) then
    raise exception 'word already guessed' using errcode = 'P0001';
  end if;

  is_correct := (w = any(g.secrets));

  insert into psychicnum.guesses (game_id, user_id, word, is_correct, kind)
  values (target_game, caller_id, w, is_correct, 'guess');

  -- ─── Budget decrement: coop = everyone, compete = caller ─
  if g.mode = 'coop' then
    update psychicnum.players
       set guesses_remaining = guesses_remaining - 1
     where game_id = target_game;
  else
    update psychicnum.players
       set guesses_remaining = guesses_remaining - 1
     where game_id = target_game and user_id = caller_id;
  end if;

  -- A correct guess found a new secret (the already-guessed guard above means
  -- it's genuinely new) — bump the caller's public found-count.
  if is_correct then
    update psychicnum.players
       set found_secrets_count = found_secrets_count + 1
     where game_id = target_game and user_id = caller_id;
  end if;

  -- Total remaining budget across the whole game (coop: N × the shared value;
  -- compete: sum of independent counters). Drives the all-exhausted loss.
  -- A CONCEDER contributes 0 — they've dropped out, so their leftover budget
  -- must not keep the game alive (coop never concedes, so this is a no-op there).
  select coalesce(sum(pp.guesses_remaining), 0) into total_remaining
    from psychicnum.players pp
    join common.game_players gp
      on gp.game_id = pp.game_id and gp.user_id = pp.user_id
   where pp.game_id = target_game and not gp.conceded;

  -- Distinct secrets found in scope (coop: the team; compete: the caller).
  -- Counting real guesses keeps this independent of the found_secrets_count tally.
  -- `guesses.is_correct` is QUALIFIED on purpose: this function also holds a
  -- local `is_correct` for the caller's own verdict, and PL/pgSQL treats an
  -- unqualified match as an error rather than picking one. (The column was
  -- `was_correct` until 2026-08-01, which is what hid the collision.)
  select count(distinct word) into found_count
    from psychicnum.guesses
   where game_id = target_game and kind = 'guess' and guesses.is_correct
     and (g.mode = 'coop' or user_id = caller_id);
  required_secrets_count := array_length(g.secrets, 1);

  -- ─── All three found: caller (compete) / team (coop) wins ─
  if found_count >= required_secrets_count then
    select username into winner_name
      from common.profiles where user_id = caller_id;

    if g.mode = 'coop' then
      -- Team win.
      select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'won';
      terminal_outcome := 'solved';
    else
      -- Compete: the caller who completed the set wins; everyone else loses.
      select jsonb_object_agg(
               user_id::text,
               case when user_id = caller_id
                    then '{"won": true}'::jsonb
                    else '{"won": false}'::jsonb
               end)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'won_compete';
      terminal_outcome := 'solved';
    end if;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'winner_username', winner_name
      ),
      player_results
    );
    return 'won';
  end if;

  -- ─── Budget exhausted before completing the set = loss ───
  -- Applies to the guess (right or wrong) that drops the last available
  -- budget anywhere in the game without the set being complete.
  if total_remaining <= 0 then
    if g.mode = 'coop' then
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'lost';
      -- The budget ran out. Named for what happened, not for the state it
      -- lands in — the label distinguishes it from the timeout loss.
      terminal_outcome := 'exhausted';
    else
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'lost_compete';
      terminal_outcome := 'exhausted';
    end if;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'guesses_used', initial_guesses
      )
      -- Restate the team's tally: this guess may itself have found a secret
      -- (a correct guess CAN be the one that empties the budget), and the
      -- mid-game update_state below is never reached on a terminal guess, so
      -- the merged-in value would otherwise be one behind.
      || case when g.mode = 'coop'
              then jsonb_build_object('found_secrets_count', found_count,
                                      'required_secrets_count', required_secrets_count)
              else '{}'::jsonb
         end,
      player_results
    );
    -- The caller's own verdict, NOT the game's — the game's fate travels by
    -- realtime (end_game above). A correct guess that empties the budget is
    -- still a correct guess to the person who made it.
    return case when is_correct then 'correct' else 'wrong' end;
  end if;

  -- ─── Game continues ──────────────────────────────────────
  -- An accepted, non-terminal guess: hand the turn to the next player
  -- (no-op for free-for-all / solo). Only reached past the win/loss
  -- returns above, so a game-ending guess never advances the pointer;
  -- and the soft-rejects above all `raise` (rolling back), so a rejected
  -- guess never advances either — the same player retries.
  perform common._advance_turn(target_game);

  -- For the listing label, surface (coop) the shared remaining value, or
  -- (compete) the caller's own remaining value.
  perform common.update_state(
    target_game,
    'playing',
    jsonb_build_object('guesses_remaining',
      case when g.mode = 'coop'
           then caller_remaining - 1
           else total_remaining
      end)
      -- How far along the team is, for the club-list readout. COOP ONLY: in
      -- compete each racer hunts the same three secrets on their own, and this
      -- column is club-wide readable, so a shared count would tell you exactly
      -- how close your opponent is. `required_secrets_count` rides along so the label
      -- can render "2/3" without knowing the rules.
      || case when g.mode = 'coop'
              then jsonb_build_object('found_secrets_count', found_count,
                                      'required_secrets_count', required_secrets_count)
              else '{}'::jsonb
         end
  );
  return case when is_correct then 'correct' else 'wrong' end;
end;
$$;

revoke execute on function psychicnum.submit_guess(uuid, text) from public;
grant execute on function psychicnum.submit_guess(uuid, text) to authenticated;

-- ============================================================
-- psychicnum.concede — a player drops out of a compete race
-- ============================================================
-- psychicnum is an ELIMINATION game: each player has an independent
-- guess budget, and the compete game ends only when EVERY player is
-- done — either someone completed the set (immediate win, handled in
-- submit_guess) or all budgets are exhausted. A conceder is done too,
-- so after flipping the shared flag we check whether any NON-conceded
-- player still has budget; if not (and nobody won — a win would have
-- ended the game already), the game ends as a collective loss.
-- Compete only (coop is a team; it ends via the shared End).
create or replace function psychicnum.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  player_results jsonb;
begin
  perform common.require_compete((select mode from psychicnum.games where id = target_game));

  -- Lock this game's psychicnum.games row FIRST so concede serializes against a
  -- concurrent submit_guess (which also locks this row before common.games).
  -- Otherwise concede locks only common.games (via _set_conceded) while the move
  -- locks psychicnum.games, they don't serialize, and each reads the other's
  -- uncommitted "still racing" state (READ COMMITTED) — both decline to end the
  -- game and it wedges in 'playing'. Same order (psychicnum.games → common.games)
  -- as the move path, so no deadlock. Mirrors scrabble.concede.
  perform 1 from psychicnum.games where id = target_game for update;

  perform common._set_conceded(target_game);

  -- Anyone still racing? (not conceded, budget left)
  if exists (
    select 1 from psychicnum.players pp
      join common.game_players gp
        on gp.game_id = pp.game_id and gp.user_id = pp.user_id
     where pp.game_id = target_game and not gp.conceded and pp.guesses_remaining > 0
  ) then
    return;
  end if;

  -- Everyone out (exhausted or conceded), nobody completed the set → loss.
  -- Which of the two it was is the club-list label's business: everyone burned
  -- their budget, versus everyone walked away. 'conceded' only when EVERY
  -- player conceded — a mixed table is 'exhausted', because somebody played
  -- theirs out.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;
  perform common.end_game(
    target_game, 'lost_compete',
    jsonb_build_object('outcome',
      case when not exists (select 1 from common.game_players gp
                             where gp.game_id = target_game and not gp.conceded)
           then 'conceded' else 'exhausted' end),
    player_results
  );

  -- Realtime touch — same as end_game/submit_timeout. common.end_game
  -- writes only common.games, so without this the psychicnum.games
  -- subscription never refetches the secrets reveal on the last-player
  -- concede terminal.
  update psychicnum.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function psychicnum.concede(uuid) from public;
grant execute on function psychicnum.concede(uuid) to authenticated;

-- ============================================================
-- psychicnum._unfound_secret — pick an as-yet-unfound secret
-- ============================================================
-- Shared by request_hint + request_reveal: a secret the player
-- (compete) / team (coop) hasn't found yet, at random. NULL when
-- all are found (shouldn't happen mid-game — the game would be
-- won — but the callers guard for it).
create or replace function psychicnum._unfound_secret(g psychicnum.games, caller_id uuid)
returns text
language sql
stable
set search_path = psychicnum, common, public, extensions
as $$
  select s
    from unnest(g.secrets) as s
   where s not in (
     select word from psychicnum.guesses
      where game_id = g.id and kind = 'guess' and is_correct
        and (g.mode = 'coop' or user_id = caller_id)
   )
   order by random()
   limit 1
$$;
revoke execute on function psychicnum._unfound_secret(psychicnum.games, uuid) from public;

-- ============================================================
-- psychicnum.request_reveal — show an answer (a secret word)
-- ============================================================
-- Reveals one of the player's (compete) / team's (coop) unfound
-- secret WORDS — the answer. Logged as a `kind = 'reveal'` row so
-- it flows into the turn log over realtime (amber), and so coop
-- teammates get a "X revealed a word" pill (in compete the guesses
-- RLS scopes the row to the caller — reveals are private there).
-- Costs nothing and does NOT find the secret: it just shows it, so
-- the player still has to guess (or doesn't bother — it's a cheat).
-- Returns the revealed word.

create or replace function psychicnum.request_reveal(target_game uuid)
returns text
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  current_play_state text;
  reveal_word text;
begin
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  reveal_word := psychicnum._unfound_secret(g, caller_id);
  if reveal_word is null then
    raise exception 'nothing left to reveal' using errcode = 'P0001';
  end if;

  insert into psychicnum.guesses (game_id, user_id, word, is_correct, kind)
  values (target_game, caller_id, reveal_word, true, 'reveal');

  return reveal_word;
end;
$$;

revoke execute on function psychicnum.request_reveal(uuid) from public;
grant execute on function psychicnum.request_reveal(uuid) to authenticated;

-- ============================================================
-- psychicnum.request_hint — show a clue for an unfound secret
-- ============================================================
-- Picks an unfound secret (like request_reveal) but logs its CLUE
-- (`common.words.hint`) rather than the word — a nudge, not the
-- answer. Many words have no clue (the hint set is roughly
-- 5-letter common words), so a missing clue logs the literal
-- "No hint available". The `kind = 'hint'` row carries the clue
-- text (NOT the secret word — a hint never leaks the answer into
-- the row). Coop teammates get a "X asked for a hint" pill;
-- compete scopes it to the caller via RLS. Returns the clue text.

create or replace function psychicnum.request_hint(target_game uuid)
returns text
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  current_play_state text;
  secret_word text;
  clue_text text;
begin
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  secret_word := psychicnum._unfound_secret(g, caller_id);
  if secret_word is null then
    raise exception 'nothing left to hint' using errcode = 'P0001';
  end if;

  -- The clue for that word, or the literal fallback when it has none.
  select coalesce(hint, 'No hint available') into clue_text
    from common.words where word = secret_word;
  clue_text := coalesce(clue_text, 'No hint available');  -- word not in dict

  insert into psychicnum.guesses (game_id, user_id, word, is_correct, kind)
  values (target_game, caller_id, clue_text, true, 'hint');

  return clue_text;
end;
$$;

revoke execute on function psychicnum.request_hint(uuid) from public;
grant execute on function psychicnum.request_hint(uuid) to authenticated;

-- ============================================================
-- psychicnum.submit_timeout — countdown expired
-- ============================================================
-- Timer expiry: everyone loses, regardless of mode. In coop it's
-- the same "team lost" message. In compete, even though players
-- were racing, the clock ran out before anyone won — collective
-- loss is the only honest outcome.
--
-- Terminal play_state is the per-mode value ('lost' for coop,
-- 'lost_compete' for compete) so the FE's terminal copy can
-- show mode-appropriate copy.
--
-- Idempotency: the `play_state <> 'playing'` guard means a
-- second concurrent fire from another tab raises P0001; the
-- FE swallows.

create or replace function psychicnum.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g psychicnum.games%rowtype;
  current_play_state text;
  initial_guesses int;
  player_results jsonb;
  terminal_state text;
  terminal_outcome text;
begin
  select * into g from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state, (setup->>'guesses')::int
    into current_play_state, initial_guesses
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  if g.mode = 'coop' then
    terminal_state := 'lost';
    terminal_outcome := 'timeout';
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'timeout';
  end if;

  perform common.end_game(
    target_game,
    terminal_state,
    jsonb_build_object(
      'outcome', terminal_outcome,
      'guesses_used', initial_guesses - (
        select coalesce(sum(guesses_remaining), 0)::int / greatest(
          (select count(*)::int from psychicnum.players where game_id = target_game),
          1)
          from psychicnum.players where game_id = target_game)
    ),
    player_results
  );

  -- Realtime touch — same as end_game. common.end_game writes only
  -- common.games, so without this no-op self-set the psychicnum.games
  -- subscription never refetches and games_state.secrets stays null on
  -- every client — BoardCol shows the fallback "Game over." instead of
  -- the "The words were …" reveal.
  update psychicnum.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function psychicnum.submit_timeout(uuid) from public;
grant execute on function psychicnum.submit_timeout(uuid) to authenticated;

-- ============================================================
-- psychicnum.end_game — manual stop
-- ============================================================
--
-- psychicnum is a deliberately minimal toy, but it carries the
-- same manual "End game" affordance every other game has, for
-- consistency: any friend in the game can decide the group is
-- done and stop it. (The Zoom-call answer to "we're bored, let's
-- move on" — see CLAUDE.md's audience note.)
--
-- Unlike submit_timeout, which uses the per-mode terminal vocab
-- ('lost' / 'lost_compete') because timing out genuinely is a
-- loss, a *manual* stop is neither a win nor a loss — the friends
-- simply agreed to stop. So this writes the UNIFORM terminal
-- play_state 'ended' (the same value spellingbee/the other games use
-- for their manual stops) with status.outcome='manual'. The FE
-- has explicit 'ended' branches that render this neutrally (green
-- "Game ended", not the red "you lost" treatment).
--
-- Per-player result is the bare `{"won": false}` for everyone —
-- psychicnum tracks no per-player score or rank, so there's
-- nothing richer to record. Nobody won; nobody is singled out.
--
-- The same shape across both modes; only g.mode is echoed into
-- status so the labelFor / modal can stay mode-aware if it wants.
--
-- The Realtime touch at the end is the same trick documented in
-- the other games' end_game: common.end_game writes to
-- common.games, but the FE's useGame subscribes to
-- psychicnum.games (filtered id=eq.gameId). A no-op self-set on
-- psychicnum.games produces a WAL entry Realtime picks up, so the
-- FE refetches and the post-terminal number reveal updates.

create or replace function psychicnum.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g_row psychicnum.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from psychicnum.games
   where psychicnum.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    -- Idempotency: a second click (or a concurrent click + a
    -- timer expiry / winning guess in another tab) raises this;
    -- the FE swallows it the same way it does for submit_timeout's
    -- "already terminal" race.
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Manual stop has no winner — every player gets {won:false}.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object('outcome', 'manual', 'mode', g_row.mode),
    player_results
  );

  -- Realtime touch — wake the psychicnum.games subscription.
  update psychicnum.games
     set club_handle = club_handle
   where id = target_game;
end;
$$;

revoke execute on function psychicnum.end_game(uuid) from public;
grant execute on function psychicnum.end_game(uuid) to authenticated;

-- ============================================================
-- psychicnum.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item / terminal-row Restart: reset the
-- working state on the SAME game row. The frozen puzzle (words /
-- secrets / mode) stays — the same board and the same three secrets,
-- hunted again; everything the players did is wiped. Any game player
-- may call it, from a finished game OR mid-game (no play_state guard —
-- it's a restart). Both modes reset ALL players (a group "run it back",
-- per the friends trust model).
--
-- The guess budget is re-read from `common.games.setup->>'guesses'`
-- rather than from `psychicnum.players` — those rows have been
-- decremented all game, so they can't say what the budget WAS. It's the
-- same value create_game seeded them with.
--
-- Turn-order coop rewinds the pointer to the player seated first
-- (`game_players.turn_seat = 0`). The rotation was assigned at create
-- time and doesn't change, so this restores the original opener without
-- re-reading `setup.first_turn_user_id`; a free-for-all game's null pointer
-- stays null.
--
-- The secrets re-hide on their own: games_state gates them on
-- common.games.is_terminal, which reset_game clears.
--
-- No realtime touch needed: the players update + guesses delete wake
-- useGame (subscribed to psychicnum.{games,players,guesses}), and
-- reset_game's common.games write wakes useCommonGame — so the board,
-- turn log, and terminal state all reset live for every player.
create or replace function psychicnum.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  g_row     psychicnum.games;
  v_guesses int;
  v_players int;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset.
  select * into g_row from psychicnum.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select (setup->>'guesses')::int into v_guesses
    from common.games where id = target_game;

  update psychicnum.players
     set guesses_remaining = v_guesses,
         found_secrets_count = 0
   where game_id = target_game;

  delete from psychicnum.guesses where game_id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row (so it's a
  -- no-op) in a free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- The club-list label: coop shows the shared remaining budget, compete the
  -- sum across players — the same two shapes submit_guess writes.
  select count(*) into v_players from psychicnum.players where game_id = target_game;
  perform common.reset_game(
    target_game,
    jsonb_build_object(
      'guesses_remaining',
      case when g_row.mode = 'coop' then v_guesses else v_guesses * v_players end
    )
  );
end;
$$;

revoke execute on function psychicnum.replay_board(uuid) from public;
grant execute on function psychicnum.replay_board(uuid) to authenticated;
