-- ============================================================
-- wordle — NYT-Wordle-style guess-the-word game
-- ============================================================
--
-- A hidden 5-letter target; players type 5-letter guesses and get
-- per-letter feedback — green (right letter, right spot), yellow (in
-- the word, wrong spot), gray (not in the word). Win by guessing the
-- word within the budget (5–8 guesses, default 6).
--
-- "wordle" is the codename used in SQL, TypeScript, and folder names.
-- The user-facing brand lives only in the FE manifest (see
-- docs/naming.md for the codename-vs-brand split).
--
-- Coop + compete ship as a sibling-manifest pair (`wordle_coop` +
-- `wordle_compete` gametypes, a denormalized `mode` column on
-- wordle.games, and a `mode` arg on create_game) — same pattern
-- waffle/spellingbee/connections/psychicnum follow.
--   - Coop: ONE shared board. Either player guesses; the guess (and its
--     colors) is visible to all once submitted. The guess budget is
--     shared by the team.
--   - Compete: same target, independent boards. Players don't see each
--     other's guesses until the game ends. Winner = fewest guesses,
--     tie-break earliest solve.
--
-- The structure is waffle's hidden-answer pattern (a HIDDEN `target`,
-- revealed post-terminal via games_state) plus spellingbee's per-guess log
-- with mode-aware RLS (compete hides opponents' guesses). The target is
-- drawn per the chosen `answer_source` (0 = the curated Wordle answer
-- list, 1..6 = a difficulty band of common.words); guesses are validated
-- against the `legal_guess` band (1..6, default 4). Boards aren't
-- pre-generated.
--
-- Depends on `common` (clubs, profiles, games, game_players, words,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- validate_timer). Per the removability invariant, common MUST NOT
-- reference wordle back.
--
-- See docs/games/wordle.md for the full feature picture.

-- ============================================================
-- Schema + usage grants
-- ============================================================
create schema if not exists wordle;
grant usage on schema wordle to authenticated;

-- ============================================================
-- wordle.compute_colors — color ONE 5-letter guess, Wordle-style
-- ============================================================
-- Returns a same-length string of 'g' (right letter, right spot),
-- 'y' (in the word, wrong spot) or 'x' (not in the word), with the
-- standard duplicate-letter accounting: a letter only earns a yellow
-- if there's an unconsumed copy of it in the answer after greens are
-- removed. Two passes — greens first (so they claim their answer
-- letter), yellows second from the leftover pool. This is the single
-- source of truth for feedback; submit_guess returns it and stores it
-- on the guess row, reading the hidden target server-side so the FE
-- never holds the answer. (Mirrors waffle._wordle_colors; the
-- removability invariant forbids reaching into another game's schema,
-- so the small algorithm is duplicated here.)
create function wordle.compute_colors(guess text, answer text)
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

-- ============================================================
-- wordle.games — one row per playthrough
-- ============================================================
-- `target` is the answer key — HIDDEN via a column-level grant and
-- revealed only post-terminal through games_state (the
-- waffle/spellingbee/psychicnum hidden-answer pattern). `max_guesses` is
-- the budget; in coop it's shared by the team, in compete it's each
-- player's own.
create table wordle.games (
  id          uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,
  -- Sibling-manifest mode axis; agrees with the gametype string
  -- ('wordle_coop' / 'wordle_compete') by construction in create_game.
  mode        text not null check (mode in ('coop', 'compete')),
  target      char(5) not null,    -- HIDDEN answer key
  max_guesses int not null,        -- guess budget (5..8)
  -- A guess is legal iff it's a real 5-letter word of difficulty ≤ this band
  -- (setup.legal_guess, 1..6). Stored here so submit_guess reads it off the
  -- locked games row. (answer_source isn't kept — it's only used to pick the
  -- target at create time.)
  legal_guess int not null default 4,
  created_at  timestamptz not null default now()
);

create index wordle_games_club_handle_idx on wordle.games (club_handle);

-- Column-level grant: everything EXCEPT `target`. The presence of any
-- column grant flips the table from "all columns visible" to "only
-- granted columns," so we enumerate the safe ones. games_state exposes
-- the target conditionally via a SECURITY DEFINER helper.
grant select
  (id, club_handle, mode, max_guesses, created_at)
  on wordle.games to authenticated;

alter table wordle.games enable row level security;
-- Read gating: any club member can read any of the club's games
-- (viewing is club-gated; acting is player-gated in the RPCs).
create policy games_select on wordle.games
  for select to authenticated
  using (common.is_club_member(club_handle));

-- ============================================================
-- wordle.players — per-player working state
-- ============================================================
-- One row per player. In COOP every row is kept identical and updated
-- in lock-step on each guess (shared budget + shared solved flag);
-- in COMPETE each row moves independently. `solved` / `solved_at` drive
-- the compete fewest-guesses + earliest-time tie-break.
create table wordle.players (
  game_id      uuid not null references wordle.games(id) on delete cascade,
  user_id      uuid not null references common.profiles(user_id) on delete cascade,
  guesses_used int not null default 0,
  solved       boolean not null default false,
  solved_at    timestamptz,
  primary key (game_id, user_id)
);

create index wordle_players_game_id_idx on wordle.players (game_id);

grant select on wordle.players to authenticated;

alter table wordle.players enable row level security;
-- Club-member-wide read: an opponent's guesses_used / solved is visible
-- (the compete progress strip), but their actual guesses are gated on
-- the wordle.guesses table below.
create policy players_select on wordle.players
  for select to authenticated
  using (
    exists (
      select 1 from wordle.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- wordle.guesses — the per-guess log
-- ============================================================
-- One row per accepted (valid, non-duplicate) guess. `colors` is the
-- 5-char g/y/x feedback computed at submit time. Coop: a shared
-- sequence — every member sees every guess. Compete: per-player; the
-- RLS policy hides opponents' rows until the game is terminal (the
-- end-of-game reveal). `guess_index` is the guesser's 1-based count;
-- in coop it's the shared team count.
create table wordle.guesses (
  game_id     uuid not null references wordle.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  guess_index int not null,          -- 1-based; coop = shared team count
  guess       char(5) not null,
  colors      char(5) not null,      -- g/y/x per letter
  is_correct  boolean not null,
  guessed_at  timestamptz not null default now(),
  primary key (game_id, user_id, guess_index)
);

create index wordle_guesses_game_id_idx on wordle.guesses (game_id);

grant select on wordle.guesses to authenticated;

alter table wordle.guesses enable row level security;
-- Visibility (mirrors spellingbee.found_words): club membership is the
-- outer gate; inside, coop shows everyone's guesses, you always see
-- your own, and once the game ends everyone sees everyone's (the
-- compete reveal).
create policy guesses_select on wordle.guesses
  for select to authenticated
  using (
    exists (
      select 1 from wordle.games wg
       join common.games cg on cg.id = wg.id
       where wg.id = guesses.game_id
         and common.is_club_member(wg.club_handle)
         and (
               wg.mode = 'coop'
            or guesses.user_id = auth.uid()
            or cg.is_terminal
             )
    )
  );

-- No INSERT/UPDATE/DELETE policies anywhere — writes go through the
-- security-definer RPCs below.

-- Realtime: coop sees the shared board update live; compete sees the
-- opponent progress strip (players) tick. Subscription is on
-- wordle.{games, players, guesses}.
alter publication supabase_realtime add table wordle.games;
alter publication supabase_realtime add table wordle.players;
alter publication supabase_realtime add table wordle.guesses;

-- ============================================================
-- Hidden-answer helper (SECURITY DEFINER) + read view
-- ============================================================
-- _target_for reveals the target only once the game is terminal (the
-- end-of-game reveal). Runs as definer so it can read the
-- grant-hidden `target` column; the security_invoker view calls it as
-- the caller (so auth.uid() is real) and base-table RLS gates rows.
create function wordle._target_for(g_id uuid)
returns text
language sql
stable
security definer
set search_path = wordle, common, public, extensions
as $$
  select case when cg.is_terminal then wg.target::text else null end
    from wordle.games wg
    join common.games cg on cg.id = wg.id
   where wg.id = g_id;
$$;

revoke execute on function wordle._target_for(uuid) from public;
grant execute on function wordle._target_for(uuid) to authenticated;

create view wordle.games_state with (security_invoker = true) as
  select wg.id,
         wg.club_handle,
         wg.mode,
         wg.max_guesses,
         wg.created_at,
         wordle._target_for(wg.id) as target   -- NULL until terminal
    from wordle.games wg;

grant select on wordle.games_state to authenticated;

-- ============================================================
-- Register the gametype(s)
-- ============================================================
-- The sibling-manifest pair: coop (shared board, solo allowed) and
-- compete (own board each, fewest-guesses winner — needs ≥2).
insert into common.gametypes (gametype, min_players) values
  ('wordle_coop', 1),
  ('wordle_compete', 2)
on conflict do nothing;

-- ============================================================
-- wordle.create_game — mode is a positional arg
-- ============================================================
-- Setup shape (server validates):
--   { "max_guesses": 5..8 (default 6),
--     "answer_source": 0..6 (0 = curated Wordle answer list; 1..6 =
--       that difficulty band of common.words),
--     "legal_guess": 1..6 (the band a typed guess must exist in to
--       count; default 4; must reach the answer's hardest band),
--     "timer": (none | countup | countdown{seconds}) }
-- `mode` ('coop' | 'compete') routes the gametype string and the
-- working-state semantics. Picks a hidden target per `answer_source`
-- (minus slurs) and seeds one players row per player.
create function wordle.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  new_id          uuid;
  s_max_guesses   int;
  s_answer_source int;
  s_legal_guess   int;
  s_answer_max    int;
  v_target        char(5);
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/wordle/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  if mode not in ('coop', 'compete') then
    raise exception 'mode must be coop or compete (got %)', mode
      using errcode = 'P0001';
  end if;

  -- ─── Validate setup.max_guesses ──────────────────────────
  s_max_guesses := coalesce((setup->>'max_guesses')::int, 6);
  if s_max_guesses < 5 or s_max_guesses > 8 then
    raise exception 'setup.max_guesses must be 5..8 (got %)', s_max_guesses
      using errcode = 'P0001';
  end if;

  -- ─── Validate the word bands ─────────────────────────────
  -- answer_source: 0 = the curated Wordle list, 1..6 = a difficulty band.
  -- legal_guess: 1..6. A guess must be able to spell any possible answer, so
  -- legal_guess must reach the answer's hardest band — 2 for the Wordle list
  -- (it tops out at band 2), else answer_source.
  s_answer_source := coalesce((setup->>'answer_source')::int, 0);
  if s_answer_source < 0 or s_answer_source > 6 then
    raise exception 'setup.answer_source must be 0..6 (got %)', s_answer_source
      using errcode = 'P0001';
  end if;
  s_legal_guess := coalesce((setup->>'legal_guess')::int, 4);
  if s_legal_guess < 1 or s_legal_guess > 6 then
    raise exception 'setup.legal_guess must be 1..6 (got %)', s_legal_guess
      using errcode = 'P0001';
  end if;
  s_answer_max := case when s_answer_source = 0 then 2 else s_answer_source end;
  if s_legal_guess < s_answer_max then
    raise exception 'setup.legal_guess (%) must reach the answer band (%)',
      s_legal_guess, s_answer_max using errcode = 'P0001';
  end if;

  perform common.validate_timer(setup->'timer');

  -- ─── Pick a random target ────────────────────────────────
  -- answer_source 0: the curated 5-letter NYT answers (any crude/slur level —
  -- wordle stays permissive, like the original). 1..6: any clean 5-letter
  -- word of that band or easier (a higher band can be obscure).
  if s_answer_source = 0 then
    select word into v_target
      from common.words where wordle and len = 5
     order by random() limit 1;
  else
    select word into v_target
      from common.words
     where len = 5 and difficulty <= s_answer_source and slur = 0 and crude = 0
     order by random() limit 1;
  end if;
  if v_target is null then
    raise exception 'no answer words for that band — run words:import'
      using errcode = 'P0002';
  end if;

  new_id := common.create_game(
    -- 'New game' is the instance label for common.games.title (the club
    -- card heading); the brand is shown from the FE manifest, not stored.
    target_club, 'wordle_' || mode, player_user_ids, 'New game', setup,
    setup
  );

  insert into wordle.games (id, club_handle, mode, target, max_guesses, legal_guess)
  values (new_id, target_club, mode, v_target, s_max_guesses, s_legal_guess);

  insert into wordle.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object(
      'mode', mode,
      'max_guesses', s_max_guesses,
      'guesses_used', 0,
      'solved', false
    )
  );

  return query select new_id;
end;
$$;

revoke execute on function wordle.create_game(text, jsonb, uuid[], text) from public;
grant execute on function wordle.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- wordle.submit_guess — the core move
-- ============================================================
-- Submit a 5-letter guess. Soft rejections (no guess consumed, no row
-- written): a malformed entry ('invalid'), a word not in the legal
-- slice ('notAWord'), or one already guessed on this board
-- ('duplicate'). A valid, fresh word is colored, logged, and counts
-- against the budget. Hard rejections (raised): not a player, game not
-- playing, the caller already solved, or out of guesses.
--
-- The `for update` lock on the games row serializes concurrent coop
-- guesses against the shared budget.
--
-- Returns jsonb { result, colors, guesses_used, solved, terminal }.
-- `result` ∈ correct | incorrect | notAWord | duplicate | invalid.
create function wordle.submit_guess(
  target_game uuid,
  guess       text
)
returns jsonb
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  caller_id          uuid;
  g_row              wordle.games%rowtype;
  current_play_state text;
  norm               text;
  p_used             int;
  p_solved           boolean;
  is_dup             boolean;
  v_colors           char(5);
  did_solve          boolean;
  new_used           int;
  out_terminal       boolean := false;
  term_state         text;
  winner_id          uuid;
  player_results     jsonb;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from wordle.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- ─── Soft reject: malformed entry (no burn) ──────────────
  norm := lower(trim(coalesce(guess, '')));
  if norm !~ '^[a-z]{5}$' then
    return jsonb_build_object('result', 'invalid', 'guesses_used', null,
                              'solved', false, 'terminal', false);
  end if;

  -- The caller's working state (coop rows are identical; compete is the
  -- caller's own).
  select guesses_used, solved into p_used, p_solved
    from wordle.players
   where game_id = target_game and user_id = caller_id;
  if p_solved then
    raise exception 'you have already solved this puzzle' using errcode = 'P0001';
  end if;
  if p_used >= g_row.max_guesses then
    raise exception 'no guesses remaining' using errcode = 'P0001';
  end if;

  -- ─── Soft reject: duplicate (no burn) ────────────────────
  -- Coop: anyone's earlier guess on the shared board. Compete: the
  -- caller's own earlier guesses.
  -- Alias the table: the `guess` function parameter would otherwise be
  -- ambiguous with the `guess` column.
  if g_row.mode = 'coop' then
    select exists (
      select 1 from wordle.guesses gx
       where gx.game_id = target_game and gx.guess = norm
    ) into is_dup;
  else
    select exists (
      select 1 from wordle.guesses gx
       where gx.game_id = target_game and gx.user_id = caller_id and gx.guess = norm
    ) into is_dup;
  end if;
  if is_dup then
    return jsonb_build_object('result', 'duplicate', 'guesses_used', p_used,
                              'solved', false, 'terminal', false);
  end if;

  -- ─── Soft reject: not in the legal word slice (no burn) ──
  -- Legal guess = a real 5-letter word of difficulty ≤ the game's legal_guess
  -- band (setup choice). No dialect / slur / slang filter (Wordle is permissive
  -- on guesses — only the difficulty band gates them).
  if not exists (
    select 1 from common.words
     where word = norm and len = 5 and difficulty <= g_row.legal_guess
  ) then
    return jsonb_build_object('result', 'notAWord', 'guesses_used', p_used,
                              'solved', false, 'terminal', false);
  end if;

  -- ─── Accept: color, log, count, resolve ──────────────────
  v_colors  := wordle.compute_colors(norm, g_row.target);
  did_solve := (norm = lower(g_row.target));
  new_used  := p_used + 1;

  insert into wordle.guesses
    (game_id, user_id, guess_index, guess, colors, is_correct)
  values
    (target_game, caller_id, new_used, norm, v_colors, did_solve);

  if g_row.mode = 'coop' then
    -- Lock-step: every player's row mirrors the shared count + solved.
    update wordle.players
       set guesses_used = new_used,
           solved       = did_solve,
           solved_at    = case when did_solve then now() else solved_at end
     where game_id = target_game;

    if did_solve then
      term_state := 'won';
      out_terminal := true;
    elsif new_used >= g_row.max_guesses then
      term_state := 'lost';
      out_terminal := true;
    end if;

    if out_terminal then
      select jsonb_object_agg(user_id::text, jsonb_build_object('won', did_solve))
        into player_results
        from common.game_players
       where game_id = target_game;
      perform common.end_game(
        target_game, term_state,
        jsonb_build_object('mode', 'coop', 'solved', did_solve,
                           'guesses_used', new_used, 'max_guesses', g_row.max_guesses),
        player_results
      );
    end if;
  else
    -- Compete: apply to the caller's own row only.
    update wordle.players
       set guesses_used = new_used,
           solved       = did_solve,
           solved_at    = case when did_solve then now() else solved_at end
     where game_id = target_game and user_id = caller_id;

    -- The game ends when EVERY player is done — solved, or out of
    -- guesses (each player plays their board out even once they can't
    -- win). The finite budget guarantees this happens.
    if not exists (
      select 1 from wordle.players
       where game_id = target_game
         and not solved
         and guesses_used < g_row.max_guesses
    ) then
      out_terminal := true;
      -- Winner = solved with the FEWEST guesses; tie-break the earliest
      -- solved_at (fastest). NULL if nobody solved.
      select user_id into winner_id
        from wordle.players
       where game_id = target_game and solved
       order by guesses_used asc, solved_at asc
       limit 1;

      select jsonb_object_agg(
               user_id::text,
               jsonb_build_object(
                 'won',     coalesce(user_id = winner_id, false),
                 'solved',  solved,
                 'guesses', guesses_used
               )
             )
        into player_results
        from wordle.players
       where game_id = target_game;

      term_state := case when winner_id is not null
                         then 'won_compete' else 'lost_compete' end;
      perform common.end_game(
        target_game, term_state,
        jsonb_build_object('mode', 'compete', 'winner', winner_id),
        player_results
      );
    end if;
  end if;

  return jsonb_build_object(
    'result',       case when did_solve then 'correct' else 'incorrect' end,
    'colors',       v_colors,
    'guesses_used', new_used,
    'solved',       did_solve,
    'terminal',     out_terminal
  );
end;
$$;

revoke execute on function wordle.submit_guess(uuid, text) from public;
grant execute on function wordle.submit_guess(uuid, text) to authenticated;

-- ============================================================
-- wordle.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by the FE when a countdown hits 0 (every player races to call
-- it). Idempotent on the play_state check. Coop: not solved → lost.
-- Compete: time's up — the winner is whoever solved in the fewest
-- guesses (same rule as a natural finish); nobody solved →
-- lost_compete.
create function wordle.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  g_row              wordle.games%rowtype;
  current_play_state text;
  winner_id          uuid;
  term_state         text;
  player_results     jsonb;
begin
  select * into g_row from wordle.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  if g_row.mode = 'coop' then
    select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
      into player_results
      from common.game_players
     where game_id = target_game;
    perform common.end_game(
      target_game, 'lost',
      jsonb_build_object('mode', 'coop', 'solved', false, 'outcome', 'timeout'),
      player_results
    );
  else
    select user_id into winner_id
      from wordle.players
     where game_id = target_game and solved
     order by guesses_used asc, solved_at asc
     limit 1;
    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object(
               'won',     coalesce(user_id = winner_id, false),
               'solved',  solved,
               'guesses', guesses_used
             )
           )
      into player_results
      from wordle.players
     where game_id = target_game;
    term_state := case when winner_id is not null
                       then 'won_compete' else 'lost_compete' end;
    perform common.end_game(
      target_game, term_state,
      jsonb_build_object('mode', 'compete', 'outcome', 'timeout',
                         'winner', winner_id),
      player_results
    );
  end if;

  -- Realtime touch — common.end_game writes common.games, not wordle.*,
  -- so the FE's wordle.{games,...} subscription would never wake. A
  -- no-op self-update produces a WAL entry it picks up, refetching
  -- games_state (now revealing the target).
  update wordle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordle.submit_timeout(uuid) from public;
grant execute on function wordle.submit_timeout(uuid) to authenticated;

-- ============================================================
-- wordle.end_game — manual stop
-- ============================================================
-- The friends' explicit "we're done" action, in BOTH modes. Writes the
-- uniform neutral terminal 'ended' (nobody wins or loses), everyone
-- {"won": false}, status.outcome = 'manual'. Any game player may fire
-- it; idempotent on the play_state check (a second click / a race with
-- submit_timeout raises P0001, which the manifest swallows).
create function wordle.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  current_play_state text;
  player_results     jsonb;
begin
  if not exists (select 1 from wordle.games where id = target_game) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;
  if current_play_state <> 'playing' then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into player_results
    from common.game_players
   where game_id = target_game;
  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'manual'),
    player_results
  );

  -- Realtime touch (see submit_timeout).
  update wordle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordle.end_game(uuid) from public;
grant execute on function wordle.end_game(uuid) to authenticated;
