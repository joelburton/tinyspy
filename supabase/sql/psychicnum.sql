-- cs-blessed-psychicnum

-- ============================================================
-- psychicnum
-- ============================================================
-- What the frontend calls:
--
--   create_game      deals a board of words hiding three secrets, and starts
--                    the game
--   submit_guess     guesses a board word; the guess that finds the last
--                    secret wins, the one that spends the last budget loses
--   request_hint     logs the dictionary clue for one unfound secret
--   request_spoiler  hands over one unfound secret word
--   concede          a player drops out of a compete game
--   stop_game        stops the game for everyone, with no result
--   submit_timeout   ends the game when the countdown runs out
--   replay_board     restarts the same board from scratch
--
-- and the view `games_state`, the game row with the secrets once it has ended.
--
-- What is particular to psychicnum (src/psychicnum/doc.md has the rest):
--   - The secrets are hidden by a column grant, not a policy: no client can
--     select `secrets`, and `games_state` hands them over only once the game
--     has ended.
--   - The guess budget is shared in coop and each player's own in compete. A
--     guess counts up only the guesser's row, in both modes, so coop's spent
--     budget is the sum of the rows.
--   - A compete race ends when decided: the first to find all three wins, and
--     the others are short of the goal and unranked. Its timeout ranks nobody.
--   - Guesses are the one mode-aware read: coop sees everyone's, compete only
--     your own until the game ends.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema psychicnum to authenticated;

-- Games: any club member sees the row. (`secrets` is additionally
-- column-hidden, regardless of policy — see the games_state view.)
drop policy if exists games_select on psychicnum.games;
create policy games_select on psychicnum.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Players: club-wide visibility in BOTH modes. The compete-mode
-- requirement is "opponents see my budget but not my guesses" —
-- so the budget column on this table is intentionally public to
-- the club. Same policy shape for both modes; no branching.
drop policy if exists players_select on psychicnum.players;
create policy players_select on psychicnum.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Guesses: branch on the game's mode.
--   coop    — every club member sees every guess (default).
--   compete — each player sees only their own guesses DURING PLAY;
--             everyone's open once the game has ended.
--
-- Why compete opens at the end (2026-08-02): the event log grew
-- the shared "whose turns?" picker, and its whole value in compete
-- is the post-game read-through — "how did moth spend their
-- budget?". Hiding an opponent's guesses DURING play is the real
-- rule (their guesses are their strategy); hiding them after the
-- game has ended just withholds the interesting part. Same shape
-- as stackdown / connections / waffle.
drop policy if exists events_select on psychicnum.events;
create policy events_select on psychicnum.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
         and (cg.mode = 'coop' or events.user_id = (select auth.uid()) or cg.ended_at is not null)
    )
  );

-- Grants: every column on psychicnum.games EXCEPT `secrets`. The games_state
-- view below (via `_secrets_for`) is the only authenticated read path for
-- `secrets`.
grant select
  (game_id, words, max_guesses)
  on psychicnum.games to authenticated;

grant select on psychicnum.players to authenticated;
grant select on psychicnum.events to authenticated;

drop view if exists psychicnum.games_state;
drop function if exists psychicnum._secrets_for(uuid);

-- ============================================================
-- psychicnum._secrets_for
-- ============================================================
-- The game's three secrets once it has ended, in either mode; null while it
-- is played. A definer, so it can read the column no client is granted; the
-- games_state view is its one caller.
create or replace function psychicnum._secrets_for(p_game_id uuid)
returns text[]
language sql
stable
security definer
set search_path = psychicnum, common, public, extensions
as $$
  select case when c.ended_at is not null then p.secrets else null end
    from psychicnum.games p
    join common.games c on c.id = p.game_id
   where p.game_id = p_game_id
$$;

revoke execute on function psychicnum._secrets_for(uuid) from public;
grant execute on function psychicnum._secrets_for(uuid) to authenticated;

-- ============================================================
-- psychicnum.games_state — the game row the frontend reads
-- ============================================================
-- Every readable column of psychicnum.games, plus the secrets through
-- `_secrets_for`, so they arrive the moment the game ends.
create view psychicnum.games_state with (security_invoker = true) as
  select
    game_id,
    words,
    max_guesses,
    psychicnum._secrets_for(game_id) as secrets
  from psychicnum.games;

grant select on psychicnum.games_state to authenticated;
revoke insert, update, delete on psychicnum.games_state from authenticated;

-- ============================================================
-- psychicnum._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from psychicnum's own tables, assigning
-- each whole (plans/common-tables.md → The statuses). Every key is always
-- present, null when it has no value:
--
--   game_status    { required_secrets_count, max_guesses }
--   player_status  { found_secrets_count, guesses_used, player_ended_reason }
--                  — each count is that player's own, in both modes; coop's
--                  team numbers are the sums over the players
--   clubpage_info  { found_secrets_count, required_secrets_count,
--                    guesses_used, max_guesses, winner_user_id }
--                  — the found and used counts are the team's in coop and
--                  null in compete, whose club line shows no progress; the
--                  winner is compete's, null until the end
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function psychicnum._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  v_mode text;
  v_max_guesses int;
  v_required_secrets_count int;
  v_team_found int;
  v_team_used int;
begin
  select cg.mode, pg.max_guesses, array_length(pg.secrets, 1)
    into v_mode, v_max_guesses, v_required_secrets_count
    from psychicnum.games pg
    join common.games cg on cg.id = pg.game_id
   where pg.game_id = p_game_id;

  update common.game_players gp
     set player_status = jsonb_build_object(
           'found_secrets_count', pp.found_secrets_count,
           'guesses_used', pp.guesses_used,
           'player_ended_reason', gp.player_ended_reason)
    from psychicnum.players pp
   where gp.game_id = p_game_id
     and pp.game_id = gp.game_id
     and pp.user_id = gp.user_id;

  -- Coop's team numbers: each player's row holds their own share (each correct
  -- guess is one player's, and no secret can be found twice), so the team's
  -- finds and the team's spent budget are both sums.
  if v_mode = 'coop' then
    select sum(found_secrets_count), sum(guesses_used)
      into v_team_found, v_team_used
      from psychicnum.players
     where game_id = p_game_id;
  end if;

  update common.games
     set game_status = jsonb_build_object(
           'required_secrets_count', v_required_secrets_count,
           'max_guesses', v_max_guesses),
         clubpage_info = jsonb_build_object(
           'found_secrets_count', v_team_found,
           'required_secrets_count', v_required_secrets_count,
           'guesses_used', v_team_used,
           'max_guesses', v_max_guesses,
           'winner_user_id', case when v_mode = 'compete' then (
             select user_id from common.game_players
              where game_id = p_game_id and final_ranking = 1
              limit 1) end),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else status_changed_at end
   where id = p_game_id;
end;
$$;

revoke execute on function psychicnum._write_statuses(uuid, boolean) from public;

drop function if exists psychicnum.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- psychicnum.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Deals a game and starts it. One RPC for both modes: `p_mode` chooses which
-- gametype string is written to common.games ('psychicnum_coop' or
-- 'psychicnum_compete') and is stored as `common.games.mode`.
--
-- Setup shape (same in both modes):
--   { "max_guesses": 1..9,
--     "word_count": 5..20,           -- how many words on the board
--     "band": 1..6,                  -- dictionary band (common.words.difficulty)
--     "timer":   { "kind": "none" | "countup" }
--             |  { "kind": "countdown", "seconds": 1..3600 } }
--
-- The board is `word_count` distinct words sampled from common.words under a
-- clean + american + difficulty-≤-band filter — five-letter words and one
-- nine-letter word; three of them become the hidden secrets.
--
-- max_guesses meaning, copied to `psychicnum.games.max_guesses`:
--   - coop: the team's shared budget, spent by the SUM of every
--     player row's `guesses_used` (each row counts its own guesses).
--   - compete: per-player budget, spent by that player's own row.
--   In both modes a guess counts up only the guesser's row.
--
-- Player-count check: compete needs 2+ players (one-player
-- compete is "racing yourself" — degenerate, hidden by the FE
-- manifest's numberOfPlayers range, also enforced here defensively).
-- Coop allows 1..6.
create or replace function psychicnum.create_game(
  p_club_handle text,
  p_setup jsonb,
  p_player_user_ids uuid[],
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  new_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  s_guesses int;
  s_word_count int;
  s_band int;
  s_words text[];
  s_secrets text[];
  game_title text;
  first_turn uuid;
begin
  -- ─── Validate mode + player-count ───────────────────
  perform common._require_valid_mode(p_mode);

  if p_mode = 'compete' then
    -- Compete needs an opposing PLAYER. A solo race is just a
    -- coop game with a timer. FE manifest hides the compete
    -- button in 1-player clubs; this guard is the server-side
    -- catch.
    if coalesce(array_length(p_player_user_ids, 1), 0) < 2 then
      raise exception 'BUG: race with fewer than two players'
        using errcode = 'PN042', hint = 'fault', column = '_',
      detail = 'compete needs >= 2 players';
    end if;
  end if;

  -- Player-count upper bound. Must agree with the
  -- `numberOfPlayers: [1, 6]` (coop) / `[2, 6]` (compete)
  -- declarations in src/psychicnum/manifest.ts. See
  -- docs/code-conventions.md → "Per-game player counts".
  perform common._require_player_count_max(p_player_user_ids, 6);

  -- ─── Validate setup shape ────────────────────────────
  if (p_setup->>'max_guesses') is null then
    raise exception 'BUG: game with no guess budget'
      using errcode = 'PN043', hint = 'fault', column = '_',
      detail = 'setup.max_guesses absent';
  end if;
  s_guesses := (p_setup->>'max_guesses')::int;
  -- A sane range, not the form's menu: which budgets are offered is the setup
  -- form's choice (GUESS_OPTIONS). 9 is the ceiling of the
  -- `players.guesses_used` column check.
  if s_guesses not between 1 and 9 then
    raise exception 'BUG: guess budget of %', s_guesses
      using errcode = 'PN044', hint = 'fault', column = '_',
      detail = 'setup.max_guesses must be 1..9';
  end if;

  -- ─── Validate the board size (how many words) ──────────────
  if (p_setup->>'word_count') is null then
    raise exception 'BUG: game with no board size'
      using errcode = 'PN045', hint = 'fault', column = '_',
      detail = 'setup.word_count absent';
  end if;
  s_word_count := (p_setup->>'word_count')::int;
  if s_word_count < 5 or s_word_count > 20 then
    raise exception 'BUG: board size of %', s_word_count
      using errcode = 'PN046', hint = 'fault', column = '_',
      detail = 'setup.word_count must be 5..20';
  end if;

  -- ─── Validate the dictionary difficulty band ───────────────
  if (p_setup->>'band') is null then
    raise exception 'BUG: game with no word difficulty'
      using errcode = 'PN047', hint = 'fault', column = '_',
      detail = 'setup.band absent';
  end if;
  s_band := (p_setup->>'band')::int;
  if s_band < 1 or s_band > 6 then
    raise exception 'BUG: word difficulty of %', s_band
      using errcode = 'PN048', hint = 'fault', column = '_',
      detail = 'setup.band must be 1..6';
  end if;

  perform common._require_valid_timer(p_setup->'timer');

  -- The board: `word_count` distinct words sampled from the dictionary under a
  -- clean (no crude/slur), american, non-slang, difficulty-≤-band filter —
  -- five-letter words, plus exactly ONE nine-letter word. The odd one out is
  -- the board's texture: one tile whose word is visibly longer than the rest.
  select array_agg(word order by random()) into s_words
    from (
      (select word from common.words
        where slur = 0 and crude = 0 and american and not slang
          and difficulty <= s_band and len = 5
        order by random() limit s_word_count - 1)
      union all
      (select word from common.words
        where slur = 0 and crude = 0 and american and not slang
          and difficulty <= s_band and len = 9
        order by random() limit 1)
    ) picked;

  if coalesce(array_length(s_words, 1), 0) < s_word_count then
    -- FAULT: can't build a board because not enough clean words in PG. No
    -- `band` empties the pool on its own — band 1 is the smallest and
    -- still holds thousands, against a `word_count` capped at 20 — so reaching
    -- here means the word import never ran.
    raise exception 'BUG: Too few words on server to build a board'
      using errcode = 'PN049', hint = 'fault', column = '_',
      detail = 'common.words has fewer clean words than word_count at that band; run gmake all-words';
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

  -- Common-side coordination — see common._create_game for the
  -- full responsibilities (auth, membership, vacate prior
  -- current-view game, insert common.games + game_players,
  -- return canonical id).
  -- Saved-default arg strips first_turn_user_id — the turn-order "who goes
  -- first" pick is a per-game choice, not a per-club preference (same
  -- treatment codenamesduet gives first_clue_giver_user_id). The coop_style
  -- toggle itself DOES round-trip, so a club that likes turns keeps it.
  new_id := common._create_game(
    p_club_handle, 'psychicnum_' || p_mode, p_mode, p_player_user_ids,
    game_title,
    p_setup,
    p_setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop. When setup.coop_style='turns', seat the
  -- common rotation (seat 0 = the chosen first player, the rest shuffled)
  -- so submit_guess gates each guess on whose turn it is. Free-for-all
  -- (the default, or any compete game) leaves the pointer null — inert.
  -- The players + the pointer live on the common tables that
  -- common._create_game just populated, so this runs after it.
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN050', hint = 'fault', column = '_',
      detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  -- Insert the gametype-specific row.
  insert into psychicnum.games (game_id, words, secrets, max_guesses)
  values (new_id, s_words, s_secrets, s_guesses);

  -- One player row per player, each with no guesses used yet (the column's
  -- default). Each counts its own player's guesses; coop spends the team's
  -- budget by their sum, compete each player's by their own.
  insert into psychicnum.players (game_id, user_id)
  select new_id, uid
    from unnest(p_player_user_ids) as uid;

  perform psychicnum._write_statuses(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. It is the only thing a
  -- call site can filter the `ok` on — without it the branch would match by
  -- merely being `ok` and would draw a second answer as this one.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;

revoke execute on function psychicnum.create_game(text, jsonb, uuid[], text) from public;
grant execute on function psychicnum.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists psychicnum.submit_guess(uuid, text);

-- ============================================================
-- psychicnum.submit_guess — the only mid-game guess action
-- ============================================================
-- There are THREE secret WORDS hidden among the board words, and
-- players win by finding all three — so a correct guess does not
-- end the game by itself; only the one that completes the set does.
--
-- The guess must be one of the board words (the player clicks a
-- tile or types a word that's on the board). Compared case-folded.
--
-- The envelope answers ONE question — did the caller's guess hit a
-- secret? — because its only consumer is the pill flashed in the
-- entry box. Its `data` carries two facts, so neither has to be
-- decoded out of the other:
--   'result'     — 'hit' or 'miss'.
--   'found_all'  — true only on the guess that completes the set;
--                  the caller (compete) / team (coop) wins.
-- The envelope carries NO outcome and NO message: `result` is the
-- fact, and how a fact reads is the frontend's, in one place
-- (src/psychicnum/lib/answer.ts). A word already in the log is
-- PN497, a `race` — the board refuses a repeat itself, so the
-- server seeing one means the FE's map was stale. The game's ending
-- the FE observes via realtime, not the envelope.
--
-- `result` is the CALLER's, never the game's fate: a correct guess
-- that happens to empty the budget still says `hit`, and the loss
-- reaches the FE over realtime like every other way this game ends
-- (timeout, concede, a compete opponent finishing).
--
-- "Found all three" is scoped per mode:
--   coop    — the TEAM's distinct correct guesses (everyone's).
--   compete — the CALLER's own distinct correct guesses; each
--             player must find all three themselves.
--
-- The endings it can reach (docs/win-lose.md): all three found is
-- `reached_goal`/'solved' — the whole team ranked 1 in coop, the caller
-- alone in compete, since a race that ends when decided leaves everyone
-- else short of the goal; every budget spent is
-- `resource_exhausted`/'exhausted', nobody ranked.
--
-- A word already guessed (in scope) is rejected. Hint rows don't
-- count, so a hinted word can still be guessed.
--
-- Concurrency: SELECT FOR UPDATE on the game row serializes
-- concurrent submits. Two simultaneous set-completing guesses in
-- compete: first commits the winner; the second finds the game ended
-- and raises 'Game over'.
create or replace function psychicnum.submit_guess(p_game_id uuid, p_guess text)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  g psychicnum.games%rowtype;
  v_mode text;
  v_ended_at timestamptz;
  w text;
  is_correct boolean;
  caller_used int;
  v_guesses_used int;
  players_with_guesses_left int;
  found_count int;
  required_secrets_count int;
  v_rankings jsonb;
  v_answer jsonb;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock the gametype row for serialization of concurrent submits. We read it
  -- first so the board-word check can use this game's words.
  select * into g from psychicnum.games
   where psychicnum.games.game_id = p_game_id
   for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  -- Normalize, and require the guess to be one of the board words: the board
  -- is face-up, so a word not on it is not a guess anyone could mean.
  w := lower(trim(coalesce(p_guess, '')));
  if not (w = any(g.words)) then
    raise exception 'BUG: guess that is not on the board'
      using errcode = 'PN268', hint = 'fault', column = '_',
      detail = 'the guess is not one of the board''s words';
  end if;

  -- Auth + game-player gate.
  caller_id := common._require_game_player(p_game_id);

  select ended_at, mode into v_ended_at, v_mode
    from common.games where id = p_game_id;

  if v_ended_at is not null then
    -- A race: a teammate ended it, or the clock ran out, while this guess was
    -- in flight.
    perform common._raise_game_over();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- games (pointer null) and solo; raises 'not your turn' when it's a
  -- turn game and someone guesses out of turn. Placed after the active
  -- check so a finished game reads "Game over" for everyone,
  -- not "Not your turn" for the non-current player.
  perform common._require_turn(p_game_id, caller_id);

  -- A conceded player is out of the race — no more guesses. The FE hides the
  -- board from a conceder, so this only fires on a race (a guess in flight
  -- when the concession commits, or a stale second tab). Without it a
  -- conceder could complete the win condition and be recorded the winner.
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- The caller's own count, from their row.
  select guesses_used into caller_used
    from psychicnum.players
   where game_id = p_game_id and user_id = caller_id;
  if caller_used is null then
    -- Shouldn't happen — _require_game_player passed, so the row
    -- exists. Defensive.
    raise exception 'BUG: you are not in this game'
      using errcode = 'PN271', hint = 'fault', column = '_',
      detail = 'no psychicnum.players budget row for the caller';
  end if;

  -- The guesses used so far against the budget: the team's in coop, the sum
  -- of every player's own count; the caller's own in compete.
  if v_mode = 'coop' then
    select sum(guesses_used) into v_guesses_used
      from psychicnum.players
     where game_id = p_game_id;
  else
    v_guesses_used := caller_used;
  end if;
  if v_guesses_used >= g.max_guesses then
    -- The FE knows your budget, so reaching this is a bug rather than a bad
    -- move.
    raise exception 'No guesses left'
      using errcode = 'PN272', hint = 'fault', column = '_',
      detail = 'the guess budget is spent';
  end if;

  -- Reject a word already taken (in scope: coop = anyone's, compete =
  -- caller's). Hint rows are excluded — a hinted word can still be guessed.
  if exists (
    select 1 from psychicnum.events
     where game_id = p_game_id and kind = 'guess' and word = w
       and (v_mode = 'coop' or user_id = caller_id)
  ) then
    -- A RACE. The board refuses a repeat itself (`BoardCol.submitGuess` checks
    -- `results` before calling), so reaching here means that map was stale — a
    -- teammate took the word between the render and the submit, or the caller's
    -- own row had not landed. The same test the four word games answer to
    -- (docs/envelopes.md → "was anything local consulted first?").
    --
    -- The FE says the same words for the case it catches locally, so the two
    -- routes cannot read differently.
    raise exception 'Already guessed'
      using errcode = 'PN497', hint = 'race', column = '_',
      detail = 'that word is already in the guess log';
  end if;

  is_correct := (w = any(g.secrets));

  insert into psychicnum.events (game_id, user_id, word, is_correct, kind, took_turn)
  values (p_game_id, caller_id, w, is_correct, 'guess', true);

  -- ─── Count the guess on the guesser's own row, in both modes ──
  update psychicnum.players
     set guesses_used = guesses_used + 1
   where game_id = p_game_id and user_id = caller_id;

  -- A compete player whose budget is gone has ended while the others play on, so the
  -- common roster has to hear about it: a player nothing is waiting for must
  -- not hold the presence-pause open. (Coop's budget is the team's, so a spent
  -- one ends the game below instead.)
  if v_mode = 'compete' and caller_used + 1 >= g.max_guesses then
    perform common._set_player_ended(p_game_id, caller_id, 'resource_exhausted', 'exhausted');
  end if;

  -- A correct guess found a new secret (the already-guessed guard above means
  -- it's genuinely new) — bump the caller's public found-count.
  if is_correct then
    update psychicnum.players
       set found_secrets_count = found_secrets_count + 1
     where game_id = p_game_id and user_id = caller_id;
  end if;

  -- How many players can still guess: not ended (conceded, or spent in
  -- compete) and with guesses left — the team's in coop, their own in
  -- compete. Drives the all-exhausted loss.
  if v_mode = 'coop' then
    select case when sum(pp.guesses_used) < g.max_guesses
                then count(*) filter (where gp.player_ended_at is null)
                else 0 end
      into players_with_guesses_left
      from psychicnum.players pp
      join common.game_players gp
        on gp.game_id = pp.game_id and gp.user_id = pp.user_id
     where pp.game_id = p_game_id;
  else
    select count(*) into players_with_guesses_left
      from psychicnum.players pp
      join common.game_players gp
        on gp.game_id = pp.game_id and gp.user_id = pp.user_id
     where pp.game_id = p_game_id and gp.player_ended_at is null
       and pp.guesses_used < g.max_guesses;
  end if;

  -- Distinct secrets found in scope (coop: the team; compete: the caller).
  -- Counting real guesses keeps this independent of the found_secrets_count tally.
  -- `events.is_correct` is QUALIFIED on purpose: this function also holds a
  -- local `is_correct` for the caller's own result, and PL/pgSQL treats an
  -- unqualified match as an error rather than picking one.
  select count(distinct word) into found_count
    from psychicnum.events
   where game_id = p_game_id and kind = 'guess' and events.is_correct
     and (v_mode = 'coop' or user_id = caller_id);
  required_secrets_count := array_length(g.secrets, 1);

  -- The caller's own result, NOT the game's: a correct guess that empties the
  -- budget is still a correct guess to the person who made it, and the game's
  -- fate travels by realtime.
  v_answer := jsonb_build_object(
    'result', case when is_correct then 'hit' else 'miss' end,
    'found_all', found_count >= required_secrets_count);

  if found_count >= required_secrets_count then
    -- ─── All three found: the team (coop) / the caller (compete) wins ─
    -- The solve is the moment of this guess, for every teammate in coop.
    update common.game_players
       set solved_at = now()
     where game_id = p_game_id
       and (v_mode = 'coop' or user_id = caller_id);

    if v_mode = 'coop' then
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    else
      v_rankings := jsonb_build_object(caller_id::text, 1);
    end if;

    perform common._end_game(
      p_game_id, 'reached_goal', 'solved', caller_id,
      p_is_no_result => false,
      p_final_rankings => v_rankings
    );
  elsif players_with_guesses_left = 0 then
    -- ─── Every budget spent before the set was complete: a loss ───
    perform common._end_game(
      p_game_id, 'resource_exhausted', 'exhausted', caller_id,
      p_is_no_result => false,
      p_final_rankings => '{}'::jsonb
    );
  else
    -- ─── Game continues ──────────────────────────────────────
    -- An accepted guess that didn't end the game: hand the turn to the next
    -- player (no-op for free-for-all / solo). The soft-rejects above all
    -- `raise` (rolling back), so a rejected guess never advances either — the
    -- same player retries.
    perform common._advance_turn(p_game_id);
  end if;

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(v_answer);

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.submit_guess(uuid, text) from public;
grant execute on function psychicnum.submit_guess(uuid, text) to authenticated;

drop function if exists psychicnum._maybe_finish_compete(uuid);

-- ============================================================
-- psychicnum._maybe_finish_compete — nobody left racing?
-- ============================================================
-- The collective-loss check after a concession, named as the other five
-- elimination games name theirs: when no player who hasn't ended has budget
-- left — some spent, some conceded — the game ends `resource_exhausted`,
-- nobody ranked. Everyone conceding is `common._concede`'s ending, so this
-- skips a game that has already ended.
--
-- MUST be called with this game's psychicnum.games row already locked — see
-- the caller. Returns whether it ended the game.
create or replace function psychicnum._maybe_finish_compete(
  p_game_id uuid,
  p_ended_by_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
begin
  if (select ended_at from common.games where id = p_game_id) is not null then
    return false;
  end if;

  if exists (
    select 1 from psychicnum.players pp
      join common.game_players gp
        on gp.game_id = pp.game_id and gp.user_id = pp.user_id
      join psychicnum.games pg on pg.game_id = pp.game_id
     where pp.game_id = p_game_id and gp.player_ended_at is null
       and pp.guesses_used < pg.max_guesses
  ) then
    return false;
  end if;

  perform common._end_game(
    p_game_id, 'resource_exhausted', 'exhausted', p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );
  return true;
end;
$$;

revoke execute on function psychicnum._maybe_finish_compete(uuid, uuid) from public;

drop function if exists psychicnum.concede(uuid);

-- ============================================================
-- psychicnum.concede — a player drops out of a compete game
-- ============================================================
-- Each player has an independent guess budget. The compete game ends
-- when someone completes the set (immediate win, handled in
-- submit_guess) or when every player is out — budget spent or
-- conceded. `common._concede` records the concession and ends the game
-- if everyone has conceded; `_maybe_finish_compete` ends it if the rest
-- are spent. Compete only (coop is a team; it ends via the shared Stop).
create or replace function psychicnum.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Lock this game's psychicnum.games row FIRST, as submit_guess does, so a
  -- concession and a final guess serialize: both ask "is anyone still
  -- racing?" of psychicnum.players and common.game_players, and without the
  -- shared lock each reads the other's uncommitted state (READ COMMITTED),
  -- both decline to end the game, and it wedges. Same order as the move path
  -- (psychicnum.games → common.games), so no deadlock.
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  caller_id := common._concede(p_game_id);
  perform psychicnum._maybe_finish_compete(p_game_id, caller_id);

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'conceded'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.concede(uuid) from public;
grant execute on function psychicnum.concede(uuid) to authenticated;

drop function if exists psychicnum._unfound_secret(psychicnum.games, uuid);

-- ============================================================
-- psychicnum._unfound_secret — pick an as-yet-unfound secret
-- ============================================================
-- Shared by request_hint + request_spoiler: a secret the player
-- (compete) / team (coop) hasn't found yet, at random. NULL when
-- all are found (shouldn't happen mid-game — the game would be
-- won — but the callers guard for it).
create or replace function psychicnum._unfound_secret(p_game_id uuid, p_user_id uuid)
returns text
language sql
stable
set search_path = psychicnum, common, public, extensions
as $$
  select s
    from psychicnum.games pg
    join common.games cg on cg.id = pg.game_id,
         unnest(pg.secrets) as s
   where pg.game_id = p_game_id
     and s not in (
       select word from psychicnum.events e
        where e.game_id = p_game_id and e.kind = 'guess' and e.is_correct
          and (cg.mode = 'coop' or e.user_id = p_user_id)
     )
   order by random()
   limit 1
$$;
revoke execute on function psychicnum._unfound_secret(uuid, uuid) from public;

drop function if exists psychicnum.request_spoiler(uuid);
-- A name this RPC once had. The drop stays here for good: this file is the
-- whole definition of what psychicnum's schema contains, so a database that
-- still carries that function has nothing else that would ever remove it.
drop function if exists psychicnum.request_reveal(uuid);

-- ============================================================
-- psychicnum.request_spoiler — hand over an answer (a secret word)
-- ============================================================
-- Reveals one of the player's (compete) / team's (coop) unfound
-- secret WORDS — the answer. Logged as a `kind = 'spoiler'` row so
-- it flows into the event log over realtime (red), and so coop
-- teammates get a "got spoiler" line in the header (in compete the
-- events RLS scopes the row to the caller — spoilers are private there).
-- Costs no budget and does NOT find the secret: it just shows it, so
-- the player still has to guess (or doesn't bother — it's a cheat).
--
-- ONE `ok`, carrying the revealed word. No outcome and no message: how a
-- spoiler reads is the frontend's, in src/psychicnum/lib/answer.ts, which is
-- also what colors the row this writes. Its twin is
-- stackdown.reveal_next_word.
create or replace function psychicnum.request_spoiler(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  secret_word text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: in coop a teammate ended the game, or the clock ran out, while
    -- the button was still on screen.
    perform common._raise_game_over();
  end if;

  secret_word := psychicnum._unfound_secret(p_game_id, caller_id);
  if secret_word is null then
    -- UNREACHABLE, which is what makes it a fault rather than a refusal.
    -- `_unfound_secret` comes back null only when every secret this caller can
    -- still find HAS been found, and submit_guess ends the game the moment
    -- that happens — in both modes, since finding all your own secrets is how
    -- a compete player wins. So the ended check above fires first, and
    -- getting here means `secrets` was empty when the game was created.
    -- stackdown's PN298 is the same condition with the same verdict.
    raise exception 'BUG: a spoiler with every secret already found'
      using errcode = 'PN395', hint = 'fault', column = '_',
      detail = 'psychicnum._unfound_secret found no unfound secret for this caller';
  end if;

  insert into psychicnum.events (game_id, user_id, word, is_correct, kind, took_turn)
  values (p_game_id, caller_id, secret_word, true, 'spoiler', false);

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(
    jsonb_build_object('result', 'spoiler', 'word', secret_word));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.request_spoiler(uuid) from public;
grant execute on function psychicnum.request_spoiler(uuid) to authenticated;

drop function if exists psychicnum.request_hint(uuid);

-- ============================================================
-- psychicnum.request_hint — show a clue for an unfound secret
-- ============================================================
-- Picks an unfound secret (like request_spoiler) but logs its CLUE
-- (`common.words.hint`) rather than the word — a nudge, not the
-- answer. Many words have no clue (the hint set is roughly
-- 5-letter common words), so a missing clue logs the literal
-- "No hint available". The `kind = 'hint'` row carries the clue
-- text (NOT the secret word — a hint never leaks the answer into
-- the row). Coop teammates get a "got hint" line in the header;
-- compete scopes it to the caller via RLS.
--
-- TWO `ok`s, because "here is a clue" and "this word has no clue" are
-- different answers. Both log a row and both carry that row's text in `hint`,
-- so only `result` tells them apart — which is what keeps a call site from
-- having to match on the prose.
--
-- No outcome and no message on either: how a hint reads is the
-- frontend's, in src/psychicnum/lib/answer.ts. stackdown.reveal_next_hint is
-- the same feature in another game.
create or replace function psychicnum.request_hint(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  caller_id uuid;
  secret_word text;
  clue_text text;
  dict_hint text;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: in coop a teammate ended the game, or the clock ran out, while
    -- the button was still on screen.
    perform common._raise_game_over();
  end if;

  secret_word := psychicnum._unfound_secret(p_game_id, caller_id);
  if secret_word is null then
    -- UNREACHABLE — see the same check in request_spoiler (PN395) for why the
    -- ending in submit_guess always gets here first.
    raise exception 'BUG: a hint with every secret already found'
      using errcode = 'PN392', hint = 'fault', column = '_',
      detail = 'psychicnum._unfound_secret found no unfound secret for this caller';
  end if;

  -- The clue for that word. NULL twice over: the word may not be in
  -- `common.words` at all (no row, so no assignment), or be there with no
  -- hint — the hint set is roughly 5-letter common words. Both mean the same
  -- thing to the player, so both take the fallback, and the answer NAMES the
  -- case rather than leaving the call site to recognize the sentence.
  select hint into dict_hint from common.words where word = secret_word;
  clue_text := coalesce(dict_hint, 'No hint available');

  insert into psychicnum.events (game_id, user_id, word, is_correct, kind, took_turn)
  values (p_game_id, caller_id, clue_text, true, 'hint', false);

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(
    jsonb_build_object(
      'result', case when dict_hint is null then 'no-hint' else 'hint' end,
      'hint', clue_text));

-- One block, and it has never heard of any specific condition: it reads the
-- SQLSTATE, re-raises anything that isn't ours, and lets the raise itself carry
-- the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.request_hint(uuid) from public;
grant execute on function psychicnum.request_hint(uuid) to authenticated;

drop function if exists psychicnum.submit_timeout(uuid);

-- ============================================================
-- psychicnum.submit_timeout — countdown expired
-- ============================================================
-- Timer expiry: everyone loses, regardless of mode. psychicnum's race ends
-- when decided, so nobody is at the goal when the clock runs out, and its
-- timeout ranks by goal (docs/win-lose.md → What a timeout does): nobody is
-- ranked, and the game and every player come out `lost`. Who ended it is
-- the turn-holder in a turn-order game, nobody otherwise.
--
-- Idempotency: the ended check means a second concurrent fire from another
-- tab is refused as the shared game-over race (`_raise_game_over`), which
-- the frontend shows as a race pill.
create or replace function psychicnum.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  v_ended_at timestamptz;
  v_turn_holder uuid;
begin
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  perform common._require_game_player(p_game_id);

  select ended_at, current_turn_user_id into v_ended_at, v_turn_holder
    from common.games where id = p_game_id;

  if v_ended_at is not null then
    perform common._raise_game_over();
  end if;

  perform common._end_game(
    p_game_id, 'timeout', 'timeout', v_turn_holder,
    p_is_no_result => false,
    p_final_rankings => '{}'::jsonb
  );

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.submit_timeout(uuid) from public;
grant execute on function psychicnum.submit_timeout(uuid) to authenticated;

drop function if exists psychicnum.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists psychicnum.end_game(uuid);

-- ============================================================
-- psychicnum.stop_game — the Stop
-- ============================================================
-- Any player stops the game for the whole table, in either mode. It is
-- neutral: nobody won, nobody lost (docs/common-schema.md → Stop). The
-- Zoom-call answer to "we're bored, let's move on" — see CLAUDE.md's
-- audience note.
create or replace function psychicnum.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  perform common._stop(p_game_id);

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'ended'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.stop_game(uuid) from public;
grant execute on function psychicnum.stop_game(uuid) to authenticated;

drop function if exists psychicnum.replay_board(uuid);

-- ============================================================
-- psychicnum.replay_board — restart this board from scratch
-- ============================================================
-- The "Replay board" game-menu item / terminal-row Restart: reset the
-- working state on the SAME game row. The frozen puzzle (words /
-- secrets / budget) stays — the same board and the same three secrets,
-- hunted again; everything the players did is wiped. Any game player
-- may call it, from a finished game OR mid-game (no ended check —
-- it's a restart). Both modes reset ALL players (a group "run it back",
-- per the friends trust model).
--
-- Turn-order coop goes back to the player seated first; common._reset_game
-- rewinds the pointer.
--
-- The secrets re-hide on their own: games_state gates them on
-- common.games.ended_at, which reset_game clears.
create or replace function psychicnum.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move ending the board that was just reset.
  perform 1 from psychicnum.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('psychicnum');
  end if;

  -- The row check comes BEFORE the membership gate, and the order is the whole
  -- point: `delete_game` takes this row, `common.games` and every
  -- `game_players` row together, so a caller whose game was just deleted has no
  -- membership left either. Gate-first told them "You are not in this game",
  -- which is both wrong and unhelpful — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  update psychicnum.players
     set guesses_used = 0,
         found_secrets_count = 0
   where game_id = p_game_id;

  delete from psychicnum.events where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform psychicnum._write_statuses(p_game_id, p_update_status_changed_at => true);
  return common._ok_envelope(jsonb_build_object('result', 'replayed'));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;

revoke execute on function psychicnum.replay_board(uuid) from public;
grant execute on function psychicnum.replay_board(uuid) to authenticated;
