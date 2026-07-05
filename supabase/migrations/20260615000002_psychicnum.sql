-- ============================================================
-- psychicnum schema — baseline
-- ============================================================
--
-- psychicnum is a tiny word-guessing game: the board shows N
-- words (N = 5..20, chosen at setup) drawn from a dictionary at a
-- chosen difficulty; THREE of them are secret, and players win by
-- finding all three (by clicking a word or typing it). Two helper
-- affordances: "reveal" shows an unfound secret WORD (the answer);
-- "hint" shows its CLUE (common.words.hint). Two modes:
--
--   psychicnum_coop    — players share a single guess budget and
--                        a single board, see each other's guesses
--                        live, win OR lose together. Find all
--                        three (as a team) = team wins. Budget
--                        exhausted first = team loses.
--
--   psychicnum_compete — players each have their own guess
--                        budget + private board, and race to find
--                        all three themselves. Opponents see each
--                        other's remaining budget AND a count of
--                        how many secrets each has found (for
--                        tension) — but NOT the guesses, results,
--                        or which words. First to all three
--                        wins; everyone else loses. All-exhausted
--                        or timer-expired = everyone loses.
--
-- Both modes share this one schema. The mode is denormalized onto
-- psychicnum.games.mode so RLS can branch without joining to
-- common.games every check. Schema-side gametype registration
-- inserts BOTH 'psychicnum_coop' and 'psychicnum_compete' rows
-- in common.gametypes.
--
-- The "family pair sharing a schema" pattern is canonical here.
-- See manifest.baseGametype + manifest.mode in src/common/lib/games.ts
-- for the FE side of the same idea. A future game that adds a
-- compete sibling (connections, spellingbee) follows this template:
--   - one schema, one folder
--   - two `common.gametypes` rows ('<base>_coop', '<base>_compete')
--   - mode-denormalized column on the game row for RLS branching
--   - one create_game RPC taking a `mode text` parameter
--
-- Educationally minimal: psychicnum is a deliberately tiny game,
-- and its coop/compete split is the smallest possible surface to
-- learn the pattern. Connections + spellingbee adoption can crib from
-- here directly.
--
-- What this still exercises that codenamesduet doesn't:
--   - N-player, no turns (anyone-acts-any-time)
--   - Genuine server-side secrets (the three words), hidden
--     from the client even with devtools open via a column-level
--     grant that excludes `secrets` from authenticated SELECT
--   - The hidden-wordlist-style reveal pattern (secrets column
--     gated through a SECURITY DEFINER helper called inside a
--     security_invoker view)
--   - A public per-player progress counter (players.secrets_found)
--     that leaks the COUNT but not the values — the smallest
--     "show opponents your progress, not your answers" surface
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes). Per the removability invariant,
-- common MUST NOT reference psychicnum back.

-- ============================================================
-- Schema + usage grant
-- ============================================================

create schema if not exists psychicnum;
grant usage on schema psychicnum to authenticated;

-- ============================================================
-- psychicnum.games — one row per playing
-- ============================================================
-- `secrets` holds the three secret words; column-grant excludes
-- it from authenticated SELECT (see grants below) while `words`
-- (the public board) is granted. RPCs run as postgres under
-- SECURITY DEFINER and read `secrets` freely; the FE only learns
-- it once the game is terminal, via the `psychicnum.games_state`
-- view + `_secrets_for` helper pattern.
--
-- `mode` is denormalized from `common.games.gametype`
-- ('psychicnum_coop' → mode='coop', etc.). The column lets the
-- RLS policy on `psychicnum.guesses` branch on mode without
-- joining to common.games on every visibility check. Read-only
-- after insert; no UPDATE policy.
--
-- Per-player guess budget lives on `psychicnum.players` (below).
-- The shared budget (coop) is "every player row has the same
-- value, and we decrement them all in lock-step"; the per-player
-- budget (compete) is "each row decrements independently." Same
-- shape, different RPC mechanics — see submit_guess.
--
-- club_handle stays on this row (denormalized from
-- common.games.club_handle) so the RLS policies can ask
-- is_club_member(club_handle) without a join.

create table psychicnum.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  -- The board: 5..20 distinct words drawn from common.words at create-game
  -- time under a clean, american, difficulty-≤-band filter (see create_game).
  -- PUBLIC — players see and click these to guess. The count is the setup's
  -- "how many words" choice.
  words text[] not null check (array_length(words, 1) between 5 and 20),
  -- The THREE secret words, distinct, a subset of `words`. The column-grant
  -- below excludes this from authenticated SELECT; it's revealed only
  -- post-terminal via games_state. Players win by finding all three (coop: as
  -- a team; compete: each on their own). The CHECK only asserts the count;
  -- distinctness + the subset property come from construction (create_game
  -- samples three of the board words) — a CHECK can't hold a subquery.
  secrets text[] not null check (array_length(secrets, 1) = 3),
  created_at timestamptz not null default now()
);

create index psychicnum_games_club_handle_idx on psychicnum.games (club_handle);

-- ============================================================
-- psychicnum.players — per-player budget tracking
-- ============================================================
-- Created at game-start time: one row per player_user_ids entry,
-- with `guesses_remaining` seeded from `setup.guesses`.
--
-- In coop mode: every row shares the same value (and decrements
-- in lock-step with every guess). The shape is symmetric across
-- modes — a coop row's "remaining" just happens to equal the
-- next row's "remaining" because they decrement together.
--
-- In compete mode: each row decrements independently when its
-- owner submits.
--
-- Per-player outcome (won/lost) doesn't live here — it's
-- written to `common.game_players.result` at game-end (via
-- common.end_game's player_results param), which already has
-- the right shape for "all gametypes need a per-player outcome
-- jsonb." Storing it twice (here + game_players) would just be
-- duplicate writes. The FE reads game_players.result.

create table psychicnum.players (
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  guesses_remaining int not null
    check (guesses_remaining between 0 and 9),
  -- How many distinct secrets THIS player has found (0..3). Public to the
  -- club (like guesses_remaining) — it's the count, never the numbers. In
  -- compete it's what powers opponent tension: the FE watches an opponent's
  -- count tick up and announces "X guessed a secret number" without leaking
  -- which one. (In coop it's incidental — coop shows the actual guesses.)
  secrets_found int not null default 0
    check (secrets_found between 0 and 3),
  primary key (game_id, user_id)
);

create index psychicnum_players_game_id_idx on psychicnum.players (game_id);

-- ============================================================
-- psychicnum.guesses — append-only log
-- ============================================================
-- Used both for "show the history" in the UI and for tests'
-- post-condition checks. The per-player budget update happens on
-- psychicnum.players directly (not derived from a count(*) over
-- this table) so submit_guess stays cheap.

create table psychicnum.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references psychicnum.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,
  -- The text this row carries. For 'guess' / 'reveal' rows it's a board word
  -- (lowercase). For 'hint' rows it's the CLUE text (a sentence, or
  -- "No hint available") — NOT the secret word, so a hint never leaks the
  -- answer into the row data.
  word text not null,
  was_correct boolean not null,
  -- 'guess'  = a real guess (counts toward finding the secrets, colors the
  --            board tile green/red, can't be repeated).
  -- 'reveal' = the player asked to reveal an answer: request_reveal picks an
  --            unfound secret and logs the WORD here (shown in the turn log).
  -- 'hint'   = the player asked for a hint: request_hint picks an unfound
  --            secret and logs its CLUE (from common.words.hint) here.
  -- Neither helper finds the secret, colors a tile, or blocks re-guessing —
  -- they're log entries; everything that computes from real guesses filters
  -- `kind = 'guess'`.
  kind text not null default 'guess' check (kind in ('guess', 'hint', 'reveal')),
  guessed_at timestamptz not null default now()
);

create index psychicnum_guesses_game_id_idx on psychicnum.guesses (game_id);

-- ============================================================
-- RLS
-- ============================================================

alter table psychicnum.games   enable row level security;
alter table psychicnum.players enable row level security;
alter table psychicnum.guesses enable row level security;

-- Games: any club member sees the row. (`target` is additionally
-- column-hidden, regardless of policy.)
create policy games_select on psychicnum.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- Players: club-wide visibility in BOTH modes. The compete-mode
-- requirement is "opponents see my budget but not my guesses" —
-- so the budget column on this table is intentionally public to
-- the club. Same policy shape for both modes; no branching.
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
--   compete — each player sees only their own guesses; opponents'
--             guess values + correctness are private.
--
-- The branching reads `g.mode` from the parent psychicnum.games
-- row — denormalized expressly to avoid joining common.games on
-- every guess select.
create policy guesses_select on psychicnum.guesses
  for select to authenticated
  using (
    exists (
      select 1 from psychicnum.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
         and (g.mode = 'coop' or guesses.user_id = auth.uid())
    )
  );

-- ============================================================
-- Grants — `target` is column-excluded
-- ============================================================
-- Same column-level grant pattern as before: every column on
-- psychicnum.games EXCEPT `target`. The hidden-target view
-- below is the only authenticated read path for `target`.

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

create function psychicnum._secrets_for(g_id uuid)
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
-- Realtime publication
-- ============================================================
-- Three tables broadcast so the FE can subscribe to:
--   - games   — terminal-state flip (used to re-fetch the view
--                with secrets now revealed)
--   - players — guesses_remaining decrement (drives the budget
--                strip's live update + own-budget UI in compete)
--   - guesses — new entry (in coop everyone sees; in compete
--                the receiver's RLS hides others' entries, but
--                the postgres-changes payload still arrives —
--                FE filters defensively too)

alter publication supabase_realtime add table psychicnum.games;
alter publication supabase_realtime add table psychicnum.players;
alter publication supabase_realtime add table psychicnum.guesses;

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

create function psychicnum.create_game(
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
begin
  -- ─── Validate mode + player-count ───────────────────
  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

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

  perform common.validate_timer(setup->'timer');

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

  -- The title is purely a human-readable label for the game row;
  -- it must NOT carry the secrets (that would put them in the
  -- club-wide-readable common.games.title). Use a random short
  -- numeric id so games are distinguishable in lists without
  -- leaking anything. The column-level grant on
  -- psychicnum.games.secrets stays the canonical "true server-side
  -- secret" — title is just a label.
  game_title := '#' || lpad((floor(random() * 1000000))::int::text, 6, '0');

  effective_gametype := 'psychicnum_' || mode;

  -- Common-side coordination — see common.create_game for the
  -- full responsibilities (auth, membership, vacate prior
  -- current-view game, insert common.games + game_players,
  -- return canonical id).
  new_id := common.create_game(
    target_club, effective_gametype, player_user_ids,
    game_title,
    setup,
    setup
  );

  -- Insert the gametype-specific row.
  insert into psychicnum.games (id, club_handle, mode, words, secrets)
  values (new_id, target_club, mode, s_words, s_secrets);

  -- One player row per player_user_ids entry, all seeded with
  -- the same initial guess budget. Coop will decrement all of
  -- them in lock-step; compete decrements each independently.
  insert into psychicnum.players (game_id, user_id, guesses_remaining)
  select new_id, uid, s_guesses
    from unnest(player_user_ids) as uid;

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
-- Returns one of:
--   'won'     — this guess found the last needed secret; the
--               caller (compete) / team (coop) wins. Terminal.
--   'correct' — found a secret, but more remain. Game continues.
--   'wrong'   — missed. Game continues.
--   'lost'    — the guess (right or wrong) that exhausted the
--               last available budget without completing the
--               set. Collective loss. Terminal.
-- The FE flashes green for 'won'/'correct', red for 'wrong'; the
-- terminal transition itself it observes via realtime, not the
-- return value.
--
-- "Found all three" is scoped per mode:
--   coop    — the TEAM's distinct correct guesses (everyone's).
--   compete — the CALLER's own distinct correct guesses; each
--             racer must find all three themselves.
--
-- A correct guess bumps the caller's players.secrets_found (the
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

create function psychicnum.submit_guess(target_game uuid, guess text)
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
  total_secrets int;
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

  insert into psychicnum.guesses (game_id, user_id, word, was_correct, kind)
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
       set secrets_found = secrets_found + 1
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
  -- Counting real guesses keeps this independent of the secrets_found tally.
  select count(distinct word) into found_count
    from psychicnum.guesses
   where game_id = target_game and kind = 'guess' and was_correct
     and (g.mode = 'coop' or user_id = caller_id);
  total_secrets := array_length(g.secrets, 1);

  -- ─── All three found: caller (compete) / team (coop) wins ─
  if found_count >= total_secrets then
    select username into winner_name
      from common.profiles where user_id = caller_id;

    if g.mode = 'coop' then
      -- Team win.
      select jsonb_object_agg(user_id::text, '{"won": true}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'won';
      terminal_outcome := 'won';
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
      terminal_outcome := 'won_compete';
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
      terminal_outcome := 'lost';
    else
      select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
        into player_results
        from common.game_players
       where game_id = target_game;
      terminal_state := 'lost_compete';
      terminal_outcome := 'lost_compete';
    end if;

    perform common.end_game(
      target_game,
      terminal_state,
      jsonb_build_object(
        'outcome', terminal_outcome,
        'guesses_used', initial_guesses
      ),
      player_results
    );
    return 'lost';
  end if;

  -- ─── Game continues ──────────────────────────────────────
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
create function psychicnum.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = psychicnum, common, public, extensions
as $$
declare
  player_results jsonb;
begin
  if (select mode from psychicnum.games where id = target_game) <> 'compete' then
    raise exception 'concede is only for compete games' using errcode = 'P0001';
  end if;

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
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players where game_id = target_game;
  perform common.end_game(
    target_game, 'lost_compete',
    jsonb_build_object('outcome', 'lost_compete'),
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
create function psychicnum._unfound_secret(g psychicnum.games, caller_id uuid)
returns text
language sql
stable
set search_path = psychicnum, common, public, extensions
as $$
  select s
    from unnest(g.secrets) as s
   where s not in (
     select word from psychicnum.guesses
      where game_id = g.id and kind = 'guess' and was_correct
        and (g.mode = 'coop' or user_id = caller_id)
   )
   order by random()
   limit 1
$$;

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

create function psychicnum.request_reveal(target_game uuid)
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

  insert into psychicnum.guesses (game_id, user_id, word, was_correct, kind)
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

create function psychicnum.request_hint(target_game uuid)
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

  insert into psychicnum.guesses (game_id, user_id, word, was_correct, kind)
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
-- 'lost_compete' for compete) so the FE's GameOverModal can
-- show mode-appropriate copy.
--
-- Idempotency: the `play_state <> 'playing'` guard means a
-- second concurrent fire from another tab raises P0001; the
-- FE swallows.

create function psychicnum.submit_timeout(target_game uuid)
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
    terminal_outcome := 'lost_timeout';
  else
    terminal_state := 'lost_compete';
    terminal_outcome := 'lost_compete_timeout';
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

create function psychicnum.end_game(target_game uuid)
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
-- Register psychicnum with common.gametypes — both modes
-- ============================================================
-- Two rows: coop and compete. Same schema serves both; the FE
-- manifests carry the per-mode display + behavior; the
-- create_game RPC routes on mode.

insert into common.gametypes (gametype, min_players) values
  ('psychicnum_coop', 1),
  ('psychicnum_compete', 2)
on conflict do nothing;
