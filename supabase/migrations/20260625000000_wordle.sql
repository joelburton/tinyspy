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
-- require_valid_timer). Per the removability invariant, common MUST NOT
-- reference wordle back.
--
-- See docs/games/wordle.md for the full feature picture.

-- ============================================================
-- Schema + usage grants
-- ============================================================
create schema if not exists wordle;
grant usage on schema wordle to authenticated;

-- ============================================================
-- Wordle coloring moved to common.wordle_colors
-- ============================================================
-- The per-word green/yellow/gray algorithm now lives once in
-- common.wordle_colors (shared with waffle). submit_guess calls it directly.

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
-- end-of-game reveal). `seq` is the guesser's 1-based count;
-- in coop it's the shared team count.
create table wordle.guesses (
  game_id     uuid not null references wordle.games(id) on delete cascade,
  user_id     uuid not null references common.profiles(user_id) on delete cascade,
  seq int not null,          -- 1-based; coop = shared team count
  guess       char(5) not null,
  colors      char(5) not null,      -- g/y/x per letter
  is_correct  boolean not null,
  guessed_at  timestamptz not null default now(),
  primary key (game_id, user_id, seq)
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

-- ============================================================
-- wordle._sync_title — recompute the club-list title from state
-- ============================================================
-- The title is a READOUT, not a fixed name (the scrabble/stackdown pattern):
--
--   terminal          → the answer            "SLATE"
--   coop, mid-game    → the most recent guess "CRANE"
--   coop, no guesses  → "New game"
--   compete, mid-race → "New compete"
--
-- Compete gets no mid-game readout on purpose: guesses are private until the
-- end-of-game reveal (see the guesses RLS policy above), and the title is
-- club-wide readable, so publishing the latest guess would hand a racing
-- opponent your letters. Compete holds its placeholder for the whole race —
-- and since that's the label a club list actually sits on, it says which kind
-- of game is sitting there (the same choice waffle compete makes).
--
-- Derived rather than assigned, so it's correct after ANY transition —
-- a guess, a timeout, a manual end, a concede that finishes the race, or a
-- replay that rewinds the board (which must un-tell the answer). Every one of
-- those calls this instead of remembering its own formula.
create function wordle._sync_title(g_id uuid)
returns void
language sql
security definer
set search_path = wordle, common, public, extensions
as $$
  update common.games cg
     set title = case
           when cg.is_terminal then upper(wg.target::text)
           when wg.mode = 'coop' then coalesce(
             (select upper(gx.guess::text)
                from wordle.guesses gx
               where gx.game_id = g_id
               order by gx.seq desc
               limit 1),
             'New game')
           else 'New compete'
         end
    from wordle.games wg
   where cg.id = g_id and wg.id = g_id;
$$;

revoke execute on function wordle._sync_title(uuid) from public;

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
  first_turn      uuid;
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/wordle/manifest.ts.
  perform common.require_player_count_max(player_user_ids, 6);

  perform common.require_valid_mode(mode);

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

  perform common.require_valid_timer(setup->'timer');

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
    -- The starting value of common.games.title (the club card heading); play
    -- rewrites it — see wordle._sync_title, which owns both placeholders.
    -- Compete says 'New compete' because it KEEPS the placeholder for the whole
    -- race (its guesses are private), so the label may as well say which kind
    -- of game is sitting there. The brand is shown from the FE manifest, not
    -- stored.
    -- saved_default strips first_turn_user_id (the turn-order "who goes first"
    -- pick is a per-game choice, not a per-club preference; coop_style rides).
    target_club, 'wordle_' || mode, player_user_ids,
    case mode when 'coop' then 'New game' else 'New compete' end, setup,
    setup - 'first_turn_user_id'
  );

  -- Opt-in turn-by-turn coop: when setup.coop_style='turns', seat the common
  -- rotation so submit_guess gates each guess. Free-for-all / compete leave the
  -- pointer null (inert). Runs after common.create_game seeds game_players.
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'setup.first_turn_user_id must be one of the players'
        using errcode = 'P0001';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into wordle.games (id, club_handle, mode, target, max_guesses, legal_guess)
  values (new_id, target_club, mode, v_target, s_max_guesses, s_legal_guess);

  insert into wordle.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  -- The listing-label payload. The guess COUNTERS are coop-only: compete
  -- deliberately never updates them (a live count leaks how close a racer is —
  -- see submit_guess), so seeding them there would leave a permanent 0 for a
  -- label to read as fact. Absent is honest; the label omits what isn't there.
  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object('mode', mode, 'solved', false)
      || case when mode = 'coop'
              then jsonb_build_object('max_guesses', s_max_guesses, 'guesses_used', 0)
              else '{}'::jsonb
         end
  );

  return query select new_id;
end;
$$;

revoke execute on function wordle.create_game(text, jsonb, uuid[], text) from public;
grant execute on function wordle.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- wordle._maybe_finish_compete — end the compete game if it's over
-- ============================================================
-- A compete game ends when NO player is still racing. A player is
-- racing while they're not conceded, not solved, and have guesses
-- left. Shared by submit_guess (a guess can be the last move) and
-- wordle.concede (a drop-out can be — if everyone else already
-- finished, the concede is what empties the racing set).
--
-- Winner = the player who solved in the FEWEST guesses (tie-break
-- earliest solved_at), EXCLUDING conceders — a drop-out forfeits any
-- win. NULL if nobody eligible solved → a collective loss.
--
-- Returns true when it ended the game (submit_guess surfaces this as
-- its `terminal` flag), false when someone is still racing.
create function wordle._maybe_finish_compete(target_game uuid)
returns boolean
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  winner_id      uuid;
  player_results jsonb;
  term_state     text;
  v_outcome      text;
  v_max          int;
begin
  select max_guesses into v_max from wordle.games where id = target_game;

  -- Anyone still racing? (not conceded, not solved, guesses left)
  if exists (
    select 1
      from wordle.players wp
      join common.game_players gp
        on gp.game_id = wp.game_id and gp.user_id = wp.user_id
     where wp.game_id = target_game
       and not gp.conceded
       and not wp.solved
       and wp.guesses_used < v_max
  ) then
    return false;
  end if;

  -- Everyone's done → pick the winner among solved, non-conceded players.
  select wp.user_id into winner_id
    from wordle.players wp
    join common.game_players gp
      on gp.game_id = wp.game_id and gp.user_id = wp.user_id
   where wp.game_id = target_game and wp.solved and not gp.conceded
   order by wp.guesses_used asc, wp.solved_at asc
   limit 1;

  select jsonb_object_agg(
           wp.user_id::text,
           jsonb_build_object(
             'won',     coalesce(wp.user_id = winner_id, false),
             'solved',  wp.solved,
             'guesses', wp.guesses_used
           )
         )
    into player_results
    from wordle.players wp
   where wp.game_id = target_game;

  term_state := case when winner_id is not null
                     then 'won_compete' else 'lost_compete' end;

  -- Why a no-winner race ended, for the club-list label: everyone burned their
  -- guesses without solving it, versus everyone walked away. 'conceded' only
  -- when EVERY player conceded — a mixed table (one quit, one ran out) is
  -- 'exhausted', because somebody did play it to the end.
  select case
           when winner_id is not null then 'solved'
           when not exists (select 1 from common.game_players gp
                             where gp.game_id = target_game and not gp.conceded)
             then 'conceded'
           else 'exhausted'
         end
    into v_outcome;

  perform common.end_game(
    target_game, term_state,
    jsonb_build_object('mode', 'compete', 'outcome', v_outcome,
                       'winner_user_id', winner_id,
                       'winner_username', (select username from common.profiles where user_id = winner_id),
                       -- The WINNER's own count. `guesses_used` in a compete
                       -- status is meaningless (each racer has their own, and
                       -- publishing a live one would leak how close they are),
                       -- so the club-list label needs the winning number named
                       -- separately — at terminal, when it's no longer a secret.
                       'winner_guesses', (select wp.guesses_used from wordle.players wp
                                           where wp.game_id = target_game
                                             and wp.user_id = winner_id)),
    player_results
  );
  return true;
end;
$$;

revoke execute on function wordle._maybe_finish_compete(uuid) from public;

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

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and compete; raises 'not your turn' otherwise. Placed
  -- before the soft-rejects so an out-of-turn guess is rejected outright.
  perform common._require_turn(target_game, caller_id);

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
  v_colors  := common.wordle_colors(norm, g_row.target);
  did_solve := (norm = lower(g_row.target));
  new_used  := p_used + 1;

  insert into wordle.guesses
    (game_id, user_id, seq, guess, colors, is_correct)
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
      -- Every terminal write states its `outcome` explicitly: under the
      -- merging common.end_game an omitted key inherits whatever was on the
      -- row, so "no outcome" can't mean "solved normally".
      perform common.end_game(
        target_game, term_state,
        jsonb_build_object('mode', 'coop', 'solved', did_solve,
                           'outcome', case when did_solve then 'solved' else 'exhausted' end,
                           'guesses_used', new_used, 'max_guesses', g_row.max_guesses),
        player_results
      );
    end if;

    -- Turn-order: an accepted, non-terminal coop guess hands the turn to the
    -- next player (no-op for free-for-all). Skipped when this guess ended the
    -- game (a won/lost board leaves the pointer as-is at terminal).
    if not out_terminal then
      perform common._advance_turn(target_game);
      -- Keep the club-list readout current. Only the guess COUNT moves, so
      -- that's all this states — common.update_state merges.
      --
      -- Coop only: compete's guesses are private until the end-of-game reveal
      -- and this column is club-wide readable, so a shared count would leak
      -- how close an opponent is.
      perform common.update_state(
        target_game, 'playing',
        jsonb_build_object('guesses_used', new_used));
    end if;
  else
    -- Compete: apply to the caller's own row only.
    update wordle.players
       set guesses_used = new_used,
           solved       = did_solve,
           solved_at    = case when did_solve then now() else solved_at end
     where game_id = target_game and user_id = caller_id;

    -- The game ends when EVERY player is done — solved, out of
    -- guesses, or conceded (each player plays their board out even
    -- once they can't win). Shared with wordle.concede, which also
    -- has to run this check because a drop-out can be the move that
    -- leaves nobody racing. Returns true when it ended the game.
    out_terminal := wordle._maybe_finish_compete(target_game);
  end if;

  -- Club-list title: coop now reads the guess just made; either mode that
  -- just ended now reads the answer. Runs after the terminal branches so it
  -- sees the settled is_terminal.
  perform wordle._sync_title(target_game);

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
-- wordle.concede — a player drops out of a compete race
-- ============================================================
-- The per-player quit (compete only — coop is a team, so it ends via
-- the shared End → common.end_game, never a concede). wordle is an
-- ELIMINATION game (a player can be "done" without the table ending),
-- so it can't use the generic common.concede: after flipping the
-- flag, it re-runs its own terminal check, which now counts a
-- conceder as done. The conceder takes a real loss; the others keep
-- racing (or, if this was the last racer, the game ends here).
create function wordle.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from wordle.games where id = target_game));
  perform common._set_conceded(target_game);
  perform wordle._maybe_finish_compete(target_game);
  -- A concede can be the move that empties the racing set, ending the game —
  -- in which case the title becomes the answer.
  perform wordle._sync_title(target_game);
end;
$$;

revoke execute on function wordle.concede(uuid) from public;
grant execute on function wordle.concede(uuid) to authenticated;

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
    -- Winner among solved, non-conceded players (a drop-out forfeits).
    select wp.user_id into winner_id
      from wordle.players wp
      join common.game_players gp
        on gp.game_id = wp.game_id and gp.user_id = wp.user_id
     where wp.game_id = target_game and wp.solved and not gp.conceded
     order by wp.guesses_used asc, wp.solved_at asc
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
                         'winner_user_id', winner_id, 'winner_username', (select username from common.profiles where user_id = winner_id)),
      player_results
    );
  end if;

  -- The game is over either way — the title becomes the answer.
  perform wordle._sync_title(target_game);

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

  -- Terminal now, so the title becomes the answer (see _sync_title).
  perform wordle._sync_title(target_game);

  -- Realtime touch (see submit_timeout).
  update wordle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordle.end_game(uuid) from public;
grant execute on function wordle.end_game(uuid) to authenticated;

-- ============================================================
-- wordle.reveal_answer — give up: end the game, reveal the word
-- ============================================================
-- The "Reveal answer" game-menu item, mid-game. Unlike waffle (which
-- must overwrite boards with the solution), wordle needs no state
-- rewrite: the target's reveal is intrinsic — _target_for / games_state
-- expose it the moment the game is terminal. So this is end_game with
-- the INTENT made legible: the same uniform neutral 'ended' terminal,
-- everyone {"won": false}, but status.outcome = 'revealed' (vs
-- 'manual') — which the FE keys on: a loss or a manual end no longer
-- displays the word; only a win or an explicit reveal does. Any game
-- player may fire it; idempotent on the play_state check (a second
-- click raises P0001, swallowed by the FE).
create function wordle.reveal_answer(target_game uuid)
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

  -- A give-up — nobody won.
  select jsonb_object_agg(user_id::text, jsonb_build_object('won', false))
    into player_results
    from common.game_players
   where game_id = target_game;
  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object('outcome', 'revealed'),
    player_results
  );

  -- Terminal now, so the title becomes the answer (see _sync_title) — the
  -- club list tells the same story the board just did.
  perform wordle._sync_title(target_game);

  -- Realtime touch (see submit_timeout) — wakes useGame so games_state
  -- refetches and the now-unshielded target lands on every client.
  update wordle.games set club_handle = club_handle where id = target_game;
end;
$$;

revoke execute on function wordle.reveal_answer(uuid) from public;
grant execute on function wordle.reveal_answer(uuid) to authenticated;

-- ============================================================
-- wordle.replay_board — restart this game from scratch
-- ============================================================
-- The "Replay board" game-menu item: reset the working state on the
-- SAME game row. The frozen puzzle (target / max_guesses / legal_guess
-- / mode) stays — the same word, played again; everything the players
-- did is wiped. Any game player may call it, from a finished game OR
-- mid-game (no play_state guard — it's a restart). Both modes reset
-- ALL players (a group "run it back", per the friends trust model).
--
-- Resets the wordle-specific working state (players zeroed + unsolved,
-- the guess log cleared), then hands the common-layer reset to
-- common.reset_game (un-terminal, fresh initial status matching
-- create_game's, clear per-player results + concede). The target
-- re-hides on its own: _target_for gates on common.games.is_terminal,
-- which reset_game clears.
--
-- No realtime touch needed: the players update + guesses delete wake
-- useGame (subscribed to wordle.{games,players,guesses}), and
-- reset_game's common.games write wakes useCommonGame — the board,
-- log, and terminal state all reset live for every player.
create function wordle.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = wordle, common, public, extensions
as $$
declare
  g_row wordle.games;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a move must not interleave with it (the move
  -- RPCs lock the same row), or the reset could land on a half-applied move —
  -- a stray log row in the "fresh" game, or worse, an in-flight game-ENDING
  -- move re-terminalling the board that was just reset.
  select * into g_row from wordle.games where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  update wordle.players
     set guesses_used = 0,
         solved = false,
         solved_at = null
   where game_id = target_game;

  delete from wordle.guesses where game_id = target_game;

  -- Turn-order coop: rewind to the original opener. Matches no row (so it's a
  -- no-op) in a free-for-all game, whose pointer is null.
  update common.games
     set current_turn_user_id = (
           select gp.user_id from common.game_players gp
            where gp.game_id = target_game and gp.turn_seat = 0
         )
   where id = target_game and current_turn_user_id is not null;

  -- Same shape create_game seeds (counters coop-only) — a restart must land on
  -- a status indistinguishable from a fresh game's.
  perform common.reset_game(
    target_game,
    jsonb_build_object('mode', g_row.mode, 'solved', false)
      || case when g_row.mode = 'coop'
              then jsonb_build_object('max_guesses', g_row.max_guesses, 'guesses_used', 0)
              else '{}'::jsonb
         end
  );

  -- Back to "New game": the guess log is empty and reset_game cleared
  -- is_terminal, so the title must stop advertising the answer (the whole
  -- point of a replay is that the word is a secret again).
  perform wordle._sync_title(target_game);
end;
$$;

revoke execute on function wordle.replay_board(uuid) from public;
grant execute on function wordle.replay_board(uuid) to authenticated;
