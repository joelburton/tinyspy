-- ============================================================
-- codenamesduet — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies, triggers and grants for codenamesduet. Everything
-- here is drop-and-recreate safe, so this file is **re-applied in full on
-- every deploy** (`gmake db-sql`) — it is the CURRENT definition, not a
-- delta. Edit it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260615000001_codenamesduet.sql` — tables, constraints, indexes,
-- the Realtime publication and seed rows. That one is applied once and then
-- frozen, because `alter table` cannot be re-run.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema codenamesduet to authenticated;

drop policy if exists games_select on codenamesduet.games;
create policy games_select on codenamesduet.games
  for select to authenticated
  using (common.is_club_member(club_handle));

drop policy if exists words_select on codenamesduet.words;
create policy words_select on codenamesduet.words
  for select to authenticated
  using (
    exists (
      select 1 from codenamesduet.games g
       where g.id = words.game_id
         and common.is_club_member(g.club_handle)
    )
  );

drop policy if exists clues_select on codenamesduet.clues;
create policy clues_select on codenamesduet.clues
  for select to authenticated
  using (
    exists (
      select 1 from codenamesduet.games g
       where g.id = clues.game_id
         and common.is_club_member(g.club_handle)
    )
  );

drop policy if exists guesses_select on codenamesduet.guesses;
create policy guesses_select on codenamesduet.guesses
  for select to authenticated
  using (
    exists (
      select 1 from codenamesduet.games g
       where g.id = guesses.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- No insert/update/delete policies on any table. All writes go
-- through RPCs. word_pool has no policies at all — only
-- security-definer RPCs read from it.

grant select on codenamesduet.games to authenticated;
grant select on codenamesduet.words to authenticated;
grant select on codenamesduet.clues to authenticated;
grant select on codenamesduet.guesses to authenticated;

-- ============================================================
-- codenamesduet._end_turn — internal helper
-- ============================================================
-- Advances the turn counter and swaps the clue-giver. Also handles
-- the "last turn spent → sudden death" transition. Called
-- by submit_guess (after a non-green-non-assassin reveal) and
-- pass_turn (after a clue was given but no guesses taken).
--
-- The clue-giver doesn't always strictly alternate. Per the Duet
-- rulebook: "If all 9 words that you see as green have been covered
-- by agent cards, tell your partner that he or she has no words left
-- to guess. Your partner will be the one who gives clues on all
-- remaining turns." So once a seat's agents are all contacted it gives
-- no more clues — we hand the turn to the partner only if the partner
-- still has an agent to clue, otherwise the current giver keeps it.
--
-- "Both seats done" never reaches here: _end_turn runs on a neutral or
-- a voluntary pass (never the 15th green, which wins inside
-- submit_guess before this is called), so at least one seat always
-- still has an unfound agent. The else-branch giver is therefore always
-- a seat with agents left.

create or replace function codenamesduet._end_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  remaining int;
  giver text;
  key_a jsonb;
  key_b jsonb;
  candidate text;
  partner_has_agents boolean;
  next_giver text;
  new_turn_number int;
begin
  select turns_remaining, current_clue_giver, key_card_a, key_card_b
    into remaining, giver, key_a, key_b
    from codenamesduet.games where id = target_game for update;

  -- Who would normally pick up the clue (strict alternation)…
  candidate := case giver when 'A' then 'B' else 'A' end;
  -- …but only if that seat still has a green agent the partner hasn't
  -- contacted yet. A seat's agents are the 'G' cells on its own key
  -- view; "contacted" is the global revealed_as = 'G' (green reveals
  -- are global — true for both seats the moment they happen).
  select exists (
    select 1
    from codenamesduet.words w
    where w.game_id = target_game
      and ((case candidate when 'A' then key_a else key_b end) ->> w.position) = 'G'
      and w.revealed_as is distinct from 'G'
  ) into partner_has_agents;
  next_giver := case when partner_has_agents then candidate else giver end;

  if remaining <= 1 then
    -- Last turn spent. Transition to sudden_death on common.games
    -- (the play_state authority); zero out turns_remaining + flip
    -- clue-giver on foo.games.
    update codenamesduet.games
      set turns_remaining = 0,
          turn_number = turn_number + 1,
          current_clue_giver = next_giver
      where id = target_game
      returning turn_number into new_turn_number;
    perform common.update_state(
      target_game,
      'sudden_death',
      jsonb_build_object(
        'turn_number', new_turn_number,
        'turns_remaining', 0
      )
    );
  else
    update codenamesduet.games
      set turns_remaining = remaining - 1,
          turn_number = turn_number + 1,
          current_clue_giver = next_giver
      where id = target_game
      returning turn_number into new_turn_number;
    perform common.update_state(
      target_game,
      'playing',
      jsonb_build_object(
        'turn_number', new_turn_number,
        'turns_remaining', remaining - 1
      )
    );
  end if;
end;
$$;

revoke execute on function codenamesduet._end_turn(uuid) from public;

-- ============================================================
-- codenamesduet.create_game(target_club, setup, player_user_ids)
-- ============================================================
-- Validates setup, picks 25 words, generates the Duet key-card
-- distribution, seats both players (the chosen first-clue-giver
-- as A, the other as B), inserts at play_state='playing'.
-- (NOT 'active' — see the no-'active' convention in common.sql: "active"
-- overloads view-state and play-state.)
--
-- player_user_ids must contain exactly 2 uuids — both must be
-- members of target_club (validated by common.create_game). For
-- codenamesduet this matches the 2-player-only invariant; the manifest
-- declares `numberOfPlayers: [2, 2]`. See
-- docs/code-conventions.md → "Per-game player counts".
--
-- Setup shape:
--   {
--     "turns": 9 | 10 | 11,
--     "first_clue_giver_user_id": "<uuid; must be one of player_user_ids>"
--   }
--
-- Why a jsonb setup column rather than discrete columns
-- (`starting_turns int`): the mutable counter `turns_remaining`
-- decrements during play. Looking at a finished game later, the
-- counter at 0 doesn't tell you whether the game started with 9,
-- 10, or 11. A typed-by-the-game jsonb column preserves intent
-- for end-of-game review without per-feature column churn.
--
-- Validation is server-side: this RPC inspects the jsonb shape
-- and rejects malformed payloads. The FE's CodenamesduetSetup type is
-- advisory only — a curious client could fire any payload, and
-- the server is the only thing protecting state correctness.

create or replace function codenamesduet.create_game(
  target_club text,
  setup jsonb,
  player_user_ids uuid[]
)
returns table(id uuid)
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  new_id uuid;
  picked_words text[];
  tiles jsonb[];
  a_view text[];
  b_view text[];
  j int;
  tmp jsonb;
  s_turns int;
  s_first uuid;
  seat_a uuid;
  seat_b uuid;
  game_title text;
begin
  -- ─── Validate setup shape ────────────────────────────
  -- Missing-vs-bad-value split so each rejection has its own
  -- clear message. Otherwise PL/pgSQL's % placeholder substitutes
  -- NULL as the empty string and we'd raise "...must be 9, 10, or
  -- 11 (got )" — readable, but confusingly empty in the parens.
  if (setup->>'turns') is null then
    raise exception 'setup.turns is required' using errcode = 'P0001';
  end if;
  s_turns := (setup->>'turns')::int;
  if s_turns not in (9, 10, 11) then
    raise exception 'setup.turns must be 9, 10, or 11 (got %)', s_turns
      using errcode = 'P0001';
  end if;

  if (setup->>'first_clue_giver_user_id') is null then
    raise exception 'setup.first_clue_giver_user_id is required'
      using errcode = 'P0001';
  end if;
  begin
    s_first := (setup->>'first_clue_giver_user_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'setup.first_clue_giver_user_id must be a uuid'
      using errcode = 'P0001';
  end;

  -- Timer is a per-game setup choice. Shape validation is shared
  -- across gametypes — see common.require_valid_timer for the exact
  -- message set ('setup.timer is required', 'kind must be ...',
  -- 'seconds must be 1..3600 (got X)', etc.). When kind=countdown,
  -- the FE's wall-clock timer counts down; expiry fires
  -- codenamesduet.submit_timeout (below).
  perform common.require_valid_timer(setup->'timer');

  -- ─── Validate player_user_ids size + first-clue-giver ─
  -- codenamesduet is intrinsically 2-player.
  if array_length(player_user_ids, 1) <> 2 then
    raise exception 'codenamesduet requires exactly 2 players (got %)',
      coalesce(array_length(player_user_ids, 1), 0)
      using errcode = 'P0001';
  end if;
  if s_first <> player_user_ids[1] and s_first <> player_user_ids[2] then
    raise exception 'setup.first_clue_giver_user_id must be one of player_user_ids'
      using errcode = 'P0001';
  end if;

  -- Assign A/B: first-clue-giver is A (since A always opens the
  -- game), the other is B.
  seat_a := s_first;
  seat_b := case s_first when player_user_ids[1]
                         then player_user_ids[2]
                         else player_user_ids[1] end;

  -- ─── Pick 25 words ────────────────────────────────────
  -- Pulled forward (before common.create_game) so we can use the
  -- picked words to build the title.
  select array_agg(word) into picked_words
    from (select word from codenamesduet.word_pool order by random() limit 25) sub;
  if array_length(picked_words, 1) <> 25 then
    raise exception 'word_pool must contain at least 25 words'
      using errcode = 'P0001';
  end if;

  -- ─── Build title ────────────────────────────────────
  -- Format: "WORD1-WORD2-WORD3" — the first three words IN BOARD ORDER, i.e.
  -- the top-left three cells as everyone actually sees them (position 0/1/2 map
  -- to picked_words[1..3] at the insert below).
  --
  -- Board order, not alphabetical (changed 2026-08-02): a duet board is never
  -- shuffled or rotated, so the first three cells are a stable, recognizable
  -- handle — you can glance at the grid and know which game this is. Games whose
  -- boards DO get reordered sort the title words instead, because there the
  -- on-screen first-three would drift.
  --
  -- The 25 words are on the shared board every player sees, so naming the game
  -- after three of them leaks nothing; what IS secret is the key card (who's
  -- an agent, who's the assassin), and that never touches the title.
  game_title := array_to_string(picked_words[1:3], '-');

  -- Common-side coordination: validates auth + caller club-
  -- membership + both player uids are club members, inserts
  -- common.games (with title + setup) + game_players rows,
  -- returns canonical id.
  --
  -- Saved-default arg: codenamesduet strips first_clue_giver_user_id before
  -- saving — that's a per-game decision (who opens this round),
  -- not a per-club preference. The two fields that ARE per-club
  -- preferences (turns count, timer mode) round-trip cleanly. The
  -- dialog's auto-pick logic for first_clue_giver_user_id fills the
  -- gap on next open. See docs/deferred.md → "Setup-shape
  -- evolution" for the policy on saved-shape changes.
  new_id := common.create_game(
    target_club, 'codenamesduet', player_user_ids, game_title, setup,
    setup - 'first_clue_giver_user_id'
  );

  -- ─── Duet key-card distribution ───────────────────────
  -- Joint distribution (25 cells total):
  --   G/G:3  G/N:5  G/A:1
  --   N/G:5  N/N:7  N/A:1
  --   A/G:1  A/N:1  A/A:1
  tiles := array[]::jsonb[];
  -- noinspection SqlUnused
  for i in 1..3 loop tiles := tiles || jsonb_build_object('a','G','b','G'); end loop;
  -- noinspection SqlUnused
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','G','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','G','b','A');
  -- noinspection SqlUnused
  for i in 1..5 loop tiles := tiles || jsonb_build_object('a','N','b','G'); end loop;
  -- noinspection SqlUnused
  for i in 1..7 loop tiles := tiles || jsonb_build_object('a','N','b','N'); end loop;
  tiles := tiles || jsonb_build_object('a','N','b','A');
  tiles := tiles || jsonb_build_object('a','A','b','G');
  tiles := tiles || jsonb_build_object('a','A','b','N');
  tiles := tiles || jsonb_build_object('a','A','b','A');

  -- Fisher-Yates shuffle.
  for i in reverse 25..2 loop
    j := 1 + floor(random() * i)::int;
    tmp := tiles[i];
    tiles[i] := tiles[j];
    tiles[j] := tmp;
  end loop;

  a_view := array[]::text[];
  b_view := array[]::text[];
  for i in 1..25 loop
    a_view := a_view || (tiles[i]->>'a');
    b_view := b_view || (tiles[i]->>'b');
  end loop;

  -- Insert the game row using the canonical id. Seats and key
  -- cards live here as columns now (not in a side table). Setup
  -- and play_state live on common.games (the latter defaults to
  -- 'playing'), not duplicated here.
  insert into codenamesduet.games (
    id, club_handle, current_clue_giver, turns_remaining,
    user_a_id, user_b_id, key_card_a, key_card_b
  ) values (
    new_id, target_club, 'A', s_turns,
    seat_a, seat_b, to_jsonb(a_view), to_jsonb(b_view)
  );

  -- Seed the initial status snapshot on common.games (the
  -- duplicate-write discipline: keep the listing-visible
  -- snapshot current from t=0). play_state defaults to 'playing'
  -- on the common.games insert; this writes the gametype-
  -- specific fields the listing label might want.
  perform common.update_state(
    new_id,
    'playing',
    jsonb_build_object(
      'turn_number', 1,
      'turns_remaining', s_turns,
      'greens_found', 0
    )
  );

  -- Insert the 25 words.
  for i in 0..24 loop
    insert into codenamesduet.words (game_id, position, word)
    values (new_id, i, picked_words[i+1]);
  end loop;

  return query select new_id;
end;
$$;

revoke execute on function codenamesduet.create_game(text, jsonb, uuid[]) from public;
grant execute on function codenamesduet.create_game(text, jsonb, uuid[]) to authenticated;

-- ============================================================
-- codenamesduet.submit_clue
-- ============================================================
-- Parameters are named clue_word / clue_count (not "word" / "count") to
-- avoid shadowing the codenamesduet.clues columns of those names (and, for
-- count, the SQL aggregate function). The matching columns stay "word" /
-- "count" since they're only ever referenced in column lists, never
-- ambiguously — the prefixed params keep the INSERT's VALUES unambiguous.

create or replace function codenamesduet.submit_clue(target_game uuid, clue_word text, clue_count int)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  caller_seat text;
begin
  select * into g_row from codenamesduet.games
   where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'clues only allowed during active play' using errcode = 'P0001';
  end if;

  -- Auth + game-player gate. See common.require_game_player —
  -- a club member who didn't sit down at this game can't submit
  -- clues, but can still watch via club-wide RLS.
  caller_id := common.require_game_player(target_game);

  -- Seat lookup is now a column read on codenamesduet.games.
  caller_seat := case caller_id
                   when g_row.user_a_id then 'A'
                   when g_row.user_b_id then 'B'
                 end;

  if caller_seat <> g_row.current_clue_giver then
    raise exception 'not your turn to give a clue' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from codenamesduet.clues
    where game_id = target_game and turn_number = g_row.turn_number
  ) then
    raise exception 'a clue has already been submitted this turn' using errcode = 'P0001';
  end if;

  insert into codenamesduet.clues (game_id, turn_number, by_seat, word, count)
  values (target_game, g_row.turn_number, caller_seat, clue_word, clue_count);
end;
$$;

revoke execute on function codenamesduet.submit_clue(uuid, text, int) from public;
grant execute on function codenamesduet.submit_clue(uuid, text, int) to authenticated;

-- ============================================================
-- codenamesduet.submit_guess
-- ============================================================
-- Returns the revealed label ('G' | 'N' | 'A') for caller
-- convenience. Handles all the Duet rules:
--   - whose key view labels this reveal (the clue-giver's during
--     active play; the partner's in sudden death)
--   - assassin reveal → lost_assassin
--   - non-green during sudden death → lost_clock
--   - green reveal → check win; turn continues
--   - neutral reveal during active → turn ends via _end_turn

create or replace function codenamesduet.submit_guess(target_game uuid, target_position int)
returns text
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  caller_seat text;
  key_owner_seat text;
  key_card jsonb;
  revealed_label text;
  green_total int;
  player_results jsonb;
  end_state text;
begin
  if target_position < 0 or target_position > 24 then
    raise exception 'position must be 0..24' using errcode = 'P0001';
  end if;

  select * into g_row from codenamesduet.games
   where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state not in ('playing', 'sudden_death') then
    raise exception 'game is not in a guessable state' using errcode = 'P0001';
  end if;

  caller_id := common.require_game_player(target_game);
  caller_seat := case caller_id
                   when g_row.user_a_id then 'A'
                   when g_row.user_b_id then 'B'
                 end;

  -- Whose key view labels this reveal? Most subtle rule in Duet.
  --
  -- During active play: the clue-giver's view. A green agent on
  -- the clue-giver's side counts toward the 15; a neutral on
  -- their side ends the turn; an assassin on their side ends the
  -- game. The guesser's own view does NOT matter — the guess is
  -- in response to the clue-giver's clue, so the clue-giver's
  -- labels apply.
  --
  -- In sudden death: no clue-giver, but guesses are "from memory
  -- of past clues", and those clues came from the partner. So we
  -- still use the partner's view (the seat opposite the caller).
  if current_play_state = 'playing' then
    if caller_seat = g_row.current_clue_giver then
      raise exception 'you are the clue-giver this turn' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from codenamesduet.clues
      where game_id = target_game and turn_number = g_row.turn_number
    ) then
      raise exception 'waiting for clue this turn' using errcode = 'P0001';
    end if;
    key_owner_seat := g_row.current_clue_giver;
  else
    key_owner_seat := case caller_seat when 'A' then 'B' else 'A' end;
  end if;

  -- Already resolved FOR THIS GUESSER? A word is off-limits to the caller if
  -- it's globally done (contacted as an agent, or the assassin was hit) OR this
  -- seat already hit it as a neutral. The PARTNER's neutral does not block the
  -- caller — the word may be the caller's agent in the other direction.
  if exists (
    select 1 from codenamesduet.words w
    where w.game_id = target_game and w.position = target_position
      and (w.revealed_as is not null
           or (caller_seat = 'A' and w.neutral_a)
           or (caller_seat = 'B' and w.neutral_b))
  ) then
    raise exception 'cell already revealed' using errcode = 'P0001';
  end if;

  -- Pick the key from the column matching the labeling seat.
  key_card := case key_owner_seat
                when 'A' then g_row.key_card_a
                when 'B' then g_row.key_card_b
              end;

  revealed_label := key_card ->> target_position;

  -- Log every guess (full per-guess history for the Game Log; a word can be
  -- guessed twice — once per seat).
  insert into codenamesduet.guesses (game_id, position, guesser_seat, result, turn_number)
  values (target_game, target_position, caller_seat, revealed_label, g_row.turn_number);

  -- Denormalize the board state onto codenamesduet.words. Green (agent contacted) and
  -- assassin are GLOBAL — true for both players. A neutral only marks the
  -- guesser's own seat, so the partner can still guess the word.
  if revealed_label = 'G' then
    update codenamesduet.words set revealed_as = 'G'
      where game_id = target_game and position = target_position;
  elsif revealed_label = 'A' then
    update codenamesduet.words set revealed_as = 'A'
      where game_id = target_game and position = target_position;
  elsif caller_seat = 'A' then
    update codenamesduet.words set neutral_a = true
      where game_id = target_game and position = target_position;
  else
    update codenamesduet.words set neutral_b = true
      where game_id = target_game and position = target_position;
  end if;

  -- Terminal-transition check. The three terminal cases share a
  -- common.end_game call shape — building player_results once and
  -- branching on the outcome string keeps the branches focused.
  end_state := null;

  -- Terminal-transition check. The three terminal cases share a
  -- common.end_game call shape — building player_results once and
  -- branching on the outcome string keeps the branches focused.
  -- Each branch nulls out current_clue_giver on foo.games but the
  -- play_state write goes through common.end_game.
  if revealed_label = 'A' then
    update codenamesduet.games set current_clue_giver = null
      where id = target_game;
    end_state := 'lost_assassin';
  elsif current_play_state = 'sudden_death' and revealed_label <> 'G' then
    update codenamesduet.games set current_clue_giver = null
      where id = target_game;
    end_state := 'lost_clock';
  elsif revealed_label = 'G' then
    select count(*) into green_total from codenamesduet.words
      where game_id = target_game and revealed_as = 'G';
    if green_total >= 15 then
      update codenamesduet.games set current_clue_giver = null
        where id = target_game;
      end_state := 'won';
    end if;
  end if;

  if end_state is not null then
    -- Cooperative outcome: both players share the same result.
    -- (Duet is co-op: you win together or you lose together.)
    select jsonb_object_agg(
             user_id::text,
             jsonb_build_object('won', end_state = 'won')
           )
      into player_results
      from common.game_players
     where game_id = target_game;

    -- Initial turn budget read from common.games.setup (canonical
    -- setup location) for the `turns_used` summary field.
    perform common.end_game(
      target_game,
      end_state,
      jsonb_build_object(
        -- `outcome` names the CAUSE; play_state already carries the verdict, so
        -- it must not just repeat it (docs/states.md → the outcome vocabulary).
        -- 'exhausted' is the roster's noun for a spent budget — here the Duet
        -- turn counter, the same shape as psychicnum/wordle/waffle's guesses.
        'outcome', case end_state
                     when 'lost_assassin' then 'assassin'
                     when 'lost_clock'    then 'exhausted'
                     else 'solved'
                   end,
        'turns_used',
          (select (setup->>'turns')::int
             from common.games where id = target_game)
            - g_row.turns_remaining,
        -- Stated here rather than left to the merge. This branch can BE a green
        -- reveal — the 15th agent is what wins — and it returns before the
        -- update_state below that would otherwise have bumped the count. Since
        -- common.end_game MERGES its status object, omitting this left the
        -- previous value standing and a won game listed as "14/15 agents".
        -- The other two endings (assassin, spent clock) were right only by
        -- luck, the last green having bumped it on its way past; now every
        -- terminal write states its own number, which is the convention
        -- (docs/supabase.md → the status blob).
        'greens_found',
          (select count(*) from codenamesduet.words
            where game_id = target_game and revealed_as = 'G')
      ),
      player_results
    );
    return revealed_label;
  end if;

  -- Non-terminal: if this was a green reveal, the turn continues
  -- with the same clue-giver. Otherwise (neutral in active play),
  -- end the turn.
  if revealed_label <> 'G' then
    perform codenamesduet._end_turn(target_game);
  else
    -- Green reveal mid-game: bump greens_found in the listing
    -- snapshot. play_state stays 'playing' or 'sudden_death'
    -- depending on the current state.
    perform common.update_state(
      target_game,
      current_play_state,
      jsonb_build_object(
        'turn_number', g_row.turn_number,
        'turns_remaining', g_row.turns_remaining,
        'greens_found',
          (select count(*) from codenamesduet.words
            where game_id = target_game and revealed_as = 'G')
      )
    );
  end if;

  return revealed_label;
end;
$$;

revoke execute on function codenamesduet.submit_guess(uuid, int) from public;
grant execute on function codenamesduet.submit_guess(uuid, int) to authenticated;

-- ============================================================
-- codenamesduet.submit_timeout — wall-clock countdown expired
-- ============================================================
-- The FE clock is browser-side (count-down ticks locally); when
-- it hits zero, the FE fires this. We flip the game to
-- `lost_timeout` (distinct from `lost_clock`, which is the
-- turns-exhausted Duet ending) and call common.end_game
-- with outcome='timeout' (the play_state carries the verdict;
-- the outcome names only the cause — states.md).
--
-- Idempotency: the active-state guard means a second concurrent
-- call from another tab raises P0001 'game is not active'. The
-- FE swallows that — losing once is enough.
--
-- Mirrors connections.submit_timeout / psychicnum.submit_timeout —
-- see those for the rationale on FE-driven clock + idempotent
-- server flip.

create or replace function codenamesduet.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from codenamesduet.games
   where codenamesduet.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate. See common.require_game_player.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state not in ('playing', 'sudden_death') then
    raise exception 'game is not active' using errcode = 'P0001';
  end if;

  update codenamesduet.games
     set current_clue_giver = null
   where codenamesduet.games.id = target_game;

  -- Cooperative loss: both players lose together.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  -- turns_used reads from common.games.setup (canonical setup
  -- location) minus what's left.
  perform common.end_game(
    target_game,
    'lost_timeout',
    jsonb_build_object(
      'outcome', 'timeout',
      'turns_used',
        (select (setup->>'turns')::int
           from common.games where id = target_game)
          - g_row.turns_remaining
    ),
    player_results
  );
end;
$$;

revoke execute on function codenamesduet.submit_timeout(uuid) from public;
grant execute on function codenamesduet.submit_timeout(uuid) to authenticated;

-- ============================================================
-- codenamesduet.end_game — manual stop
-- ============================================================
-- codenamesduet.replay_board — run this board back from scratch
-- ============================================================
-- The "Restart" game-menu item / terminal-row Restart: reset the working state
-- on the SAME game row. The frozen puzzle stays — the same 25 words and the
-- same two key cards — with every reveal, neutral, clue and guess wiped, the
-- turn counter back to 1 and seat A clueing again.
--
-- **This is a mulligan, not a fresh puzzle, and that's the point.** Duet was
-- the one game deliberately left without a replay, on the grounds that its
-- board IS the secret: you keep the key cards, so the second run is played
-- with knowledge of where the assassin sits. The case that overrules it is the
-- accident — a first-guess assassin ends a game nobody got to play, and "let's
-- just run it back" is what the friends actually say (2026-08-03). Under the
-- friends trust model that's a fine trade; someone who wants a genuinely blind
-- board has **New game**, one item below it in the same menu.
--
-- Any game player may call it, from a finished game OR mid-game (no play_state
-- guard — it's a restart; the FE confirms mid-game). Resets BOTH players, per
-- the whole-table restart convention.
create or replace function codenamesduet.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  s_turns int;
begin
  perform common.require_game_player(target_game);

  if not exists (select 1 from codenamesduet.games where id = target_game) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- The turn budget is re-read from setup, not from the row: turns_remaining
  -- has been decremented all game, so it can't say what the budget WAS.
  select (setup->>'turns')::int into s_turns
    from common.games where id = target_game;

  update codenamesduet.words
     set revealed_as = null, neutral_a = false, neutral_b = false
   where game_id = target_game;

  delete from codenamesduet.clues   where game_id = target_game;
  delete from codenamesduet.guesses where game_id = target_game;

  update codenamesduet.games
     set turns_remaining = s_turns,
         turn_number = 1,
         current_clue_giver = 'A'
   where id = target_game;

  perform common.reset_game(
    target_game,
    jsonb_build_object('turn_number', 1, 'turns_remaining', s_turns, 'greens_found', 0)
  );
end;
$$;

revoke execute on function codenamesduet.replay_board(uuid) from public;
grant execute on function codenamesduet.replay_board(uuid) to authenticated;

-- ============================================================
--
-- The friends' explicit "we're done here" button. codenamesduet has
-- plenty of *automatic* terminals (won / lost_assassin / lost_clock
-- / lost_timeout) — but the friends
-- may still want to abandon an in-progress game early (a clue went
-- sideways, someone has to leave the Zoom call). This RPC is that
-- escape hatch.
--
-- The FE's GamePage menu has an "End game" item (per-game, declared
-- by codenamesduet's PlayArea via ctx.menu.setGameItems) that fires this.
-- Distinct from suspend (which leaves play_state untouched and is the
-- path "back to club" + start-a-new-game takes): end_game writes a
-- terminal play_state='ended' with status.outcome='manual', so the
-- game lands in the club's "completed" section forever after and the
-- the terminal verdict reads a neutral "Ended" (not a "you lost").
--
-- Modeled on submit_timeout above — same lock / auth / active-state
-- gate / cooperative-loss player_results / Realtime-touch shape. Two
-- differences: it writes play_state='ended' + outcome='manual' (vs
-- 'lost_timeout'), and it's fired by a player's deliberate click
-- rather than the FE's timer.
--
-- Idempotency: the active-state guard means a second click (or a
-- click racing a timer/assassin terminal) raises P0001, which the FE
-- swallows the same way it does for submit_timeout's "already
-- terminal" race.

create or replace function codenamesduet.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  player_results jsonb;
begin
  select * into g_row from codenamesduet.games
   where codenamesduet.games.id = target_game
   for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  -- Auth + game-player gate. See common.require_game_player.
  perform common.require_game_player(target_game);

  select play_state into current_play_state
    from common.games where id = target_game;

  -- Both codenamesduet active states qualify — the friends can bail out
  -- mid-clue-loop or mid-sudden-death alike.
  if current_play_state not in ('playing', 'sudden_death') then
    raise exception 'game is not in progress' using errcode = 'P0001';
  end if;

  -- Cooperative game: nobody "wins" a manually-stopped game. Every
  -- player gets {won: false} — agreeing to stop is a valid outcome,
  -- not a "you lose" punishment. Same shape as submit_timeout.
  select jsonb_object_agg(user_id::text, '{"won": false}'::jsonb)
    into player_results
    from common.game_players
   where game_id = target_game;

  perform common.end_game(
    target_game,
    'ended',
    jsonb_build_object('outcome', 'manual'),
    player_results
  );

  -- Realtime touch — same trick as submit_timeout. common.end_game
  -- writes to common.games, but the FE's useGame subscription listens
  -- on the `codenamesduet` schema (codenamesduet.games), so without a write here
  -- it would never wake up to refetch and flip into review mode. The
  -- self-set (turn_number = turn_number) is a semantic no-op but
  -- produces a WAL entry Realtime picks up.
  update codenamesduet.games
     set turn_number = turn_number
   where id = target_game;
end;
$$;

revoke execute on function codenamesduet.end_game(uuid) from public;
grant execute on function codenamesduet.end_game(uuid) to authenticated;

-- ============================================================
-- codenamesduet.pass_turn
-- ============================================================
-- The guesser ends the turn without taking any more guesses,
-- spending one turn. Legal even after zero guesses on the
-- turn (e.g. "the clue makes no sense, let's just move on").

create or replace function codenamesduet.pass_turn(target_game uuid)
returns void
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  caller_seat text;
begin
  select * into g_row from codenamesduet.games
   where id = target_game for update;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state <> 'playing' then
    raise exception 'can only pass during active play' using errcode = 'P0001';
  end if;

  caller_id := common.require_game_player(target_game);
  caller_seat := case caller_id
                   when g_row.user_a_id then 'A'
                   when g_row.user_b_id then 'B'
                 end;

  if caller_seat = g_row.current_clue_giver then
    raise exception 'clue-giver cannot pass — submit a clue first' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from codenamesduet.clues
    where game_id = target_game and turn_number = g_row.turn_number
  ) then
    raise exception 'waiting for clue this turn' using errcode = 'P0001';
  end if;

  perform codenamesduet._end_turn(target_game);
end;
$$;

revoke execute on function codenamesduet.pass_turn(uuid) from public;
grant execute on function codenamesduet.pass_turn(uuid) to authenticated;

-- Terminal-transition cleanup happens inline: submit_guess
-- (and submit_timeout) call common.end_game explicitly at the
-- moment the game is decided over. No trigger-on-status-change
-- side effect — single write path keeps the termination
-- coordination (ended_at, play_state, is_terminal, status,
-- player_results) in one place.

-- ============================================================
-- codenamesduet.get_clue_context — read-only RPC for the suggester
-- ============================================================
-- Returns a jsonb object with:
--   greens:         text[]  — caller's unrevealed green agents
--   neutrals:       text[]  — caller's unrevealed neutrals (avoid)
--   assassins:      text[]  — caller's still-unrevealed assassins (avoid).
--                              A Duet key card carries THREE assassins, so
--                              this is an ARRAY of the 0..3 not-yet-revealed
--                              ones — never a single word. Empty [] once all
--                              three are revealed.
--   previous_clues: array of {word, count, by_seat, turn_number}
--
-- Authorization: caller must be the current clue-giver of an
-- active (or sudden-death) game. We do the check here so the
-- Edge Function can stay a thin orchestrator; it gets back either
-- a clean context or a clean rejection.

create or replace function codenamesduet.get_clue_context(target_game uuid)
returns jsonb
language plpgsql
security definer
set search_path = codenamesduet, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row codenamesduet.games%rowtype;
  current_play_state text;
  caller_seat text;
  caller_key jsonb;
  ctx jsonb;
begin
  select * into g_row from codenamesduet.games where id = target_game;
  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  caller_id := common.require_game_player(target_game);
  caller_seat := case caller_id
                   when g_row.user_a_id then 'A'
                   when g_row.user_b_id then 'B'
                 end;
  caller_key := case caller_seat
                  when 'A' then g_row.key_card_a
                  when 'B' then g_row.key_card_b
                end;

  select play_state into current_play_state
    from common.games where id = target_game;

  if current_play_state not in ('playing', 'sudden_death') then
    raise exception 'no suggestions outside of active play' using errcode = 'P0001';
  end if;

  if caller_seat is distinct from g_row.current_clue_giver then
    raise exception 'only the current clue-giver can request a suggestion'
      using errcode = 'P0001';
  end if;

  -- Build the context object. Each of the three category lookups
  -- uses the caller's key view (caller_key) indexed by w.position.
  -- `->>` returns the label as text ('G' | 'N' | 'A').
  select jsonb_build_object(
    'greens', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'G'
    ), '[]'::jsonb),
    'neutrals', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'N'
    ), '[]'::jsonb),
    'assassins', coalesce((
      select jsonb_agg(w.word order by w.position)
      from codenamesduet.words w
      where w.game_id = target_game
        and w.revealed_as is null
        and (caller_key->>w.position) = 'A'
    ), '[]'::jsonb),
    'previous_clues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'word', c.word,
          'count', c.count,
          'by_seat', c.by_seat,
          'turn_number', c.turn_number
        ) order by c.turn_number
      )
      from codenamesduet.clues c
      where c.game_id = target_game
    ), '[]'::jsonb)
  ) into ctx;

  return ctx;
end;
$$;

revoke execute on function codenamesduet.get_clue_context(uuid) from public;
grant execute on function codenamesduet.get_clue_context(uuid) to authenticated;
