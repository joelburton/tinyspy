-- ============================================================
-- setgame — the REPEATABLE half
-- ============================================================
-- Functions, views, RLS policies and grants for setgame. Everything here is
-- drop-and-recreate safe, so this file is **re-applied in full on every
-- deploy** (`gmake db-sql`) — it is the CURRENT definition, not a delta. Edit
-- it in place forever; it never becomes a migration.
--
-- Its other half is the one-shot schema migration
-- `supabase/migrations/20260816000000_setgame.sql` — tables, constraints,
-- indexes, the Realtime publication and gametype registration.
--
-- Order is load-bearing: a policy can only reference a function that already
-- exists, so statements stay in the order they were written. See
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema setgame to authenticated;

-- Column grant: everything EXCEPT `deck` (its presence flips the table to
-- "only granted columns"). The undealt order is the one secret in this game,
-- and unlike every other shielded column on the roster NOTHING ever reveals
-- it — there is no terminal unlock, because the leftover order is of no
-- interest once the game is over. `deck_pos` IS granted: paired with the
-- public `deck_kind` it gives "how many cards are left" without saying which.
grant select (id, club_handle, mode, deck_kind, deck_pos, board, created_at)
  on setgame.games to authenticated;
drop policy if exists games_select on setgame.games;
create policy games_select on setgame.games
  for select to authenticated
  using (common.is_club_member(club_handle));

grant select on setgame.players to authenticated;
drop policy if exists players_select on setgame.players;
create policy players_select on setgame.players
  for select to authenticated
  using (
    exists (
      select 1 from setgame.games g
       where g.id = players.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- Events are club-readable in BOTH modes, with no terminal gate — see the
-- table comment in the migration. The cards were face-up and everyone watched
-- them leave; a rival's claim history says nothing about what is coming, and a
-- hint row says only that someone asked.
grant select on setgame.events to authenticated;
drop policy if exists events_select on setgame.events;
create policy events_select on setgame.events
  for select to authenticated
  using (
    exists (
      select 1 from setgame.games g
       where g.id = events.game_id
         and common.is_club_member(g.club_handle)
    )
  );

-- ============================================================
-- The algebra
-- ============================================================

-- The one card that completes a set with `a` and `b`.
--
-- Per base-3 digit the third value is whatever makes the three sum to 0 mod 3,
-- which is `(6 - x - y) % 3` — one expression covering both cases, since two
-- equal digits give back the same digit and two different ones give the
-- remaining value. (`src/setgame/lib/cards.ts` writes the same rule as an
-- explicit same/different branch, which reads better in the place a person
-- goes to LEARN the rule; the two agree on all 6561 pairs and the TS suite
-- checks exactly that.)
create or replace function setgame._third(a smallint, b smallint)
returns smallint
language sql
immutable
as $$
  select (((6 - (a / 27) % 3 - (b / 27) % 3) % 3) * 27
        + ((6 - (a /  9) % 3 - (b /  9) % 3) % 3) *  9
        + ((6 - (a /  3) % 3 - (b /  3) % 3) % 3) *  3
        + ((6 -  a       % 3 -  b       % 3) % 3)     )::smallint;
$$;
revoke execute on function setgame._third(smallint, smallint) from public;

-- Are these three cards a set? Assumes three DISTINCT cards; submit_set
-- checks distinctness before it gets here.
create or replace function setgame._is_set(a smallint, b smallint, c smallint)
returns boolean
language sql
immutable
as $$
  select setgame._third(a, b) = c;
$$;
revoke execute on function setgame._is_set(smallint, smallint, smallint) from public;

-- The first set on `cards`, or NULL if it holds none — the question behind
-- both "deal three more" and the coop hint.
--
-- Pairs, not triples: every pair names its completing card outright, so this
-- asks "is that card also here?" instead of testing every combination. At the
-- largest board that can exist (21) it is 210 iterations.
create or replace function setgame._find_set(cards smallint[])
returns smallint[]
language plpgsql
immutable
as $$
declare
  n int := coalesce(cardinality(cards), 0);
  i int;
  j int;
  t smallint;
begin
  for i in 1 .. n - 1 loop
    for j in i + 1 .. n loop
      t := setgame._third(cards[i], cards[j]);
      -- A pair of DISTINCT cards can never be completed by either of itself;
      -- the guard is for a malformed board with a duplicate, which would
      -- otherwise report a set that isn't one.
      if t <> cards[i] and t <> cards[j] and t = any(cards) then
        return array[cards[i], cards[j], t]::smallint[];
      end if;
    end loop;
  end loop;
  return null;
end;
$$;
revoke execute on function setgame._find_set(smallint[]) from public;

-- The first set on `cards` that USES `card`, or NULL. Only the hint needs
-- this: a second hint press must ring another card of the set the first press
-- pointed at, not of some other set.
create or replace function setgame._find_set_with(cards smallint[], card smallint)
returns smallint[]
language plpgsql
immutable
as $$
declare
  other smallint;
  t     smallint;
begin
  if not (card = any(cards)) then
    return null;
  end if;
  foreach other in array cards loop
    if other = card then
      continue;
    end if;
    t := setgame._third(card, other);
    if t <> card and t <> other and t = any(cards) then
      return array[card, other, t]::smallint[];
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function setgame._find_set_with(smallint[], smallint) from public;

-- Cards in a deck. Junior drops shading, so it is a third of the full deck.
create or replace function setgame._deck_size(deck_kind text)
returns int
language sql
immutable
as $$
  select case deck_kind when 'junior' then 27 else 81 end;
$$;
revoke execute on function setgame._deck_size(text) from public;
-- Granted, unlike the other helpers here, because games_state is a
-- security_invoker view and computes `deck_left` with it — the view body runs
-- as the reader, so the reader needs EXECUTE. Safe: it takes a string and
-- returns a constant, touching no table.
grant execute on function setgame._deck_size(text) to authenticated;

-- The floor a board is topped back up to after a claim. Junior deals nine,
-- which is the same "three rows" shape one column narrower.
create or replace function setgame._board_min(deck_kind text)
returns int
language sql
immutable
as $$
  select case deck_kind when 'junior' then 9 else 12 end;
$$;
revoke execute on function setgame._board_min(text) from public;

-- ============================================================
-- setgame._deal_to_playable — the deal-three rule, run to a fixpoint
-- ============================================================
-- Append three cards at a time until the board is both big enough AND has a
-- set to find, or the deck runs out. Both halves of the rule live here:
-- "fewer than twelve" and "no set present" are the same loop.
--
-- Running to a FIXPOINT rather than dealing once matters: three fresh cards
-- can leave the board still set-free (rare, but the whole reason 15- and
-- 18-card boards exist), and a single pass would hand the players a dead
-- table. Termination is guaranteed twice over — the deck is finite, and a
-- board of 21 always contains a set, so the loop cannot even reach the deck's
-- end on the "no set" branch.
--
-- Cards appended here go on the END of the board, which is what makes a
-- growing board add a column on the right instead of disturbing the cards
-- already on the table. (Refilling the HOLES left by a claim is submit_set's
-- job, and deliberately different — see there.)
create or replace function setgame._deal_to_playable(
  inout board    smallint[],
  inout deck_pos int,
  deck           smallint[],
  deck_kind      text
)
language plpgsql
immutable
as $$
declare
  deck_size int := setgame._deck_size(deck_kind);
  board_min int := setgame._board_min(deck_kind);
begin
  loop
    exit when deck_pos >= deck_size;
    exit when cardinality(board) >= board_min and setgame._find_set(board) is not null;
    board := board || deck[deck_pos + 1 : deck_pos + 3];
    deck_pos := deck_pos + 3;
  end loop;
end;
$$;
revoke execute on function setgame._deal_to_playable(smallint[], int, smallint[], text) from public;

-- ============================================================
-- setgame.games_state — what the FE reads
-- ============================================================
-- Everything the board needs, and no `deck`. `deck_left` is computed from the
-- two public columns rather than from the deck itself, which is what lets this
-- stay a plain security_invoker view with no definer helper behind it: the
-- shield is the column grant, full stop.
drop view if exists setgame.games_state;
create view setgame.games_state with (security_invoker = true) as
  select g.id,
         g.club_handle,
         g.mode,
         g.deck_kind,
         g.board,
         setgame._deck_size(g.deck_kind) - g.deck_pos as deck_left,
         g.created_at
    from setgame.games g;
grant select on setgame.games_state to authenticated;

-- ============================================================
-- setgame.create_game — mode is a positional arg
-- ============================================================
-- Setup shape: { "timer": (none | countup | countdown{seconds}),
--                "deck":  'full' | 'junior',
--                "coop_style": 'free-for-all' | 'turns',
--                "first_turn_user_id": uuid (turn-coop only) }.
--
-- Only 'turns' is tested for below, so anything else — including the key being
-- absent, which is what a game created before the knob existed looks like —
-- reads as free-for-all. That is the shared CoopStyleField's own convention.
--
-- The board is built INLINE — no puzzle library, no edge function — because a
-- board is just a shuffle. The only work beyond dealing is running the
-- deal-three rule before anyone sees the table, so the opening board is never
-- one of the ~3% that come out set-free.
create or replace function setgame.create_game(
  target_club     text,
  setup           jsonb,
  player_user_ids uuid[],
  mode            text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  new_id       uuid;
  v_deck_kind  text;
  v_deck       smallint[];
  v_board      smallint[];
  v_deck_pos   int;
  first_turn   uuid;
begin
  perform common.require_club_member(target_club);
  -- Must agree with numberOfPlayers in src/setgame/manifest.ts ([1,6]/[2,6]).
  perform common.require_player_count_max(player_user_ids, 6);

  perform common.require_valid_mode(mode);
  perform common.require_valid_timer(setup->'timer');

  v_deck_kind := coalesce(setup->>'deck', 'full');
  if v_deck_kind not in ('full', 'junior') then
    raise exception 'bad-deck|%|', v_deck_kind
      using errcode = 'P0001',
      detail = 'setup deck must be full or junior';
  end if;

  -- The shuffle. Junior keeps only the solid cards, which is digit 0 in the
  -- shade place — the same filter src/setgame/lib/cards.ts applies.
  select array_agg(c order by random())::smallint[]
    into v_deck
    from generate_series(0, 80) as g(c)
   where v_deck_kind = 'full' or (c / 3) % 3 = 0;

  -- Deal the opening board, then run the deal-three rule until it holds a set.
  v_deck_pos := setgame._board_min(v_deck_kind);
  v_board    := v_deck[1 : v_deck_pos];
  select * into v_board, v_deck_pos
    from setgame._deal_to_playable(v_board, v_deck_pos, v_deck, v_deck_kind);

  new_id := common.create_game(
    target_club, 'setgame_' || mode, player_user_ids,
    -- Placeholder: the real title needs the game's id, which only exists once
    -- common.create_game has inserted the row (rewritten just below).
    'New game',
    setup,
    -- saved_default strips first_turn_user_id: who goes first is a per-game
    -- pick, not a club preference. coop_style rides along.
    setup - 'first_turn_user_id'
  );

  -- Instance label for common.games.title (the club card's heading), the same
  -- pure IDENTIFIER bananagrams uses: the first six hex digits of the game's
  -- own uuid, like a short commit hash.
  --
  -- A title is normally meant to name a game after its CONTENT, and this one
  -- could — the sets found are public in both modes, so "25 sets found" was
  -- both legal and true. It is the wrong thing to want, though: a title that
  -- counts is a readout the status line already carries, and it changes every
  -- few seconds, so it cannot be used to REFER to a game. A handle that never
  -- moves can: "look at #A3F19C" is something one player can say to another,
  -- and something to search the club list (or the database) for.
  --
  -- Aliased: this function `returns table(id uuid)`, so a bare `id` in the
  -- where clause is ambiguous between that OUT parameter and the column.
  update common.games cg
     set title = '#' || upper(left(new_id::text, 6))
   where cg.id = new_id;

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_set gates
  -- each claim. Free-for-all and compete leave the pointer null (inert).
  if mode = 'coop' and setup->>'coop_style' = 'turns' then
    first_turn := (setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(player_user_ids)) then
      raise exception 'bad-first-turn|'
        using errcode = 'P0001',
        detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into setgame.games (id, club_handle, mode, deck_kind, deck, deck_pos, board)
  values (new_id, target_club, mode, v_deck_kind, v_deck, v_deck_pos, v_board);

  insert into setgame.players (game_id, user_id)
  select new_id, uid from unnest(player_user_ids) uid;

  perform common.update_state(
    new_id, 'playing',
    jsonb_build_object(
      'mode', mode,
      'sets_found', 0,
      'deck_left', setgame._deck_size(v_deck_kind) - v_deck_pos
    )
  );

  return query select new_id;
end;
$$;
revoke execute on function setgame.create_game(text, jsonb, uuid[], text) from public;
grant execute on function setgame.create_game(text, jsonb, uuid[], text) to authenticated;

-- ============================================================
-- setgame._finish — the collective terminal, both modes
-- ============================================================
-- setgame has no per-player finish line: the deck running dry ends the game
-- for everyone at once. So there is one terminal path, reached either by the
-- last claim or by the clock, and `outcome` is all that differs.
--
-- COOP wins by CLEARING THE DECK — meaning no sets left to find, NOT using
-- every card. Stranding six or nine cards is the normal ending (a full clear
-- happens in about 2% of games), so grading on leftovers would turn an
-- ordinary finish into a near-miss, so nothing reports it — see buildOver in
-- src/setgame/components/PlayArea.tsx.
--
-- Nor is it recorded. At the natural end the deck is spent, so every card is
-- either claimed or still on the table and the count is exactly
-- `deck size - 3 * sets_found` — derivable by anyone holding the two numbers
-- already in `status`, and stale the moment a replay re-deals the board.
--
-- COMPETE ranks on SETS FOUND, full stop, and A TIE IS A TIE — every player on
-- the top count is a co-winner. No speed tiebreak: the roster's usual
-- quality-then-speed ordering exists to separate players who crossed the same
-- finish line, but here the count IS the whole result, and breaking a 9-9 on
-- who grabbed their last set first would crown reflexes the score deliberately
-- does not measure. wordiply's co-winner convention is the one copied —
-- `winner_user_id` goes NULL when there is more than one winner, since naming
-- an arbitrary tied player would tell the others they lost.
--
-- Conceded players are ranked out: they can't win, but they keep the sets they
-- took (the roster-wide "no survival wins" rule, from the other direction).
create or replace function setgame._finish(target_game uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  g_row          setgame.games%rowtype;
  team_found     int;
  best           int;
  winner_uid     uuid;
  leaderboard    jsonb;
  player_results jsonb;
begin
  select * into g_row from setgame.games where id = target_game;

  select count(*) into team_found
    from setgame.events where game_id = target_game and kind = 'claim';

  if g_row.mode = 'coop' then
    -- The per-player breakdown lands HERE and only here: coop shows one team
    -- number while the game runs, and who found what once it is over.
    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object('won', outcome <> 'timeout', 'sets_found', p.sets_found))
      into player_results
      from setgame.players p
     where p.game_id = target_game;

    perform common.end_game(
      target_game,
      case when outcome = 'timeout' then 'lost' else 'won' end,
      jsonb_build_object(
        'mode', 'coop',
        'outcome', outcome,
        'sets_found', team_found
      ),
      player_results
    );
  else
    -- Best score among players still in the race.
    select coalesce(max(p.sets_found), 0)
      into best
      from setgame.players p
      join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = target_game and not gp.conceded;

    select jsonb_agg(row order by row->>'sets_found' desc)
      into leaderboard
      from (
        select jsonb_build_object(
                 'user_id', p.user_id,
                 'username', pr.username,
                 'sets_found', p.sets_found,
                 'won', best > 0 and p.sets_found = best and not gp.conceded
               ) as row,
               p.sets_found
          from setgame.players p
          join common.game_players gp
            on gp.game_id = p.game_id and gp.user_id = p.user_id
          join common.profiles pr on pr.user_id = p.user_id
         where p.game_id = target_game
         order by p.sets_found desc
      ) ranked;

    -- Exactly one winner names them; co-winners leave it null and the FE reads
    -- each player's own `won` flag instead.
    -- array_agg rather than min(): uuid has no min aggregate, and the
    -- count(*) = 1 guard means the single element is the whole answer.
    select case when count(*) = 1 then (array_agg(p.user_id))[1] end
      into winner_uid
      from setgame.players p
      join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = target_game and p.sets_found = best and not gp.conceded and best > 0;

    select jsonb_object_agg(
             p.user_id::text,
             jsonb_build_object(
               'won', best > 0 and p.sets_found = best and not gp.conceded,
               'sets_found', p.sets_found))
      into player_results
      from setgame.players p
      join common.game_players gp
        on gp.game_id = p.game_id and gp.user_id = p.user_id
     where p.game_id = target_game;

    perform common.end_game(
      target_game,
      -- A game nobody scored in has no one to crown, whatever ended it.
      case when best > 0 then 'won_compete' else 'lost_compete' end,
      jsonb_build_object(
        'mode', 'compete',
        'outcome', outcome,
        'sets_found', team_found,
        'winner_user_id', winner_uid,
        'winner_username', (select username from common.profiles where user_id = winner_uid),
        'leaderboard', coalesce(leaderboard, '[]'::jsonb)
      ),
      player_results
    );
  end if;
end;
$$;
revoke execute on function setgame._finish(uuid, text) from public;

-- ============================================================
-- setgame.submit_set — the only mid-game move
-- ============================================================
-- Claim three cards. The server re-checks everything the board already
-- checked, because the board is not the authority — but note that an INVALID
-- selection normally never gets here at all: every card is face-up, so the FE
-- knows the rule and rejects a non-set before it leaves the client. That is
-- also why there is no wrong-guess penalty to design. The one rejection that
-- happens in real play is `cards-gone`: a rival claimed a card out from under
-- this selection.
--
-- The `for update` lock on the games row is what makes that rejection safe
-- rather than a race — two players claiming overlapping sets serialize, the
-- first commits, and the second finds a card missing from the board.
create or replace function setgame.submit_set(target_game uuid, cards smallint[])
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id    uuid;
  g_row        setgame.games%rowtype;
  cur_state    text;
  board_min    int;
  deck_size    int;
  n            int;
  positions    int[] := '{}';
  p            int;
  card         smallint;
  new_board    smallint[];
  new_pos      int;
  head_holes   int[] := '{}';
  tail_cards   smallint[] := '{}';
  k            int;
  out_terminal boolean := false;
begin
  caller_id := common.require_game_player(target_game);

  select * into g_row from setgame.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no setgame.games row for target_game';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- A conceded player is out of the race. The FE gates on this too, so it only
  -- fires on a genuine race (a claim in flight when concede commits).
  if (select conceded from common.game_players
        where game_id = target_game and user_id = caller_id) then
    raise exception 'you-conceded|' using errcode = 'P0001',
      detail = 'caller already dropped out of this compete race';
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and for compete.
  perform common._require_turn(target_game, caller_id);

  -- ─── Validate the selection ────────────────────────────────
  if cardinality(cards) is distinct from 3
     or (select count(distinct e) from unnest(cards) e) <> 3 then
    raise exception 'bad-claim|' using errcode = 'P0001',
      detail = 'a claim is exactly three distinct cards';
  end if;

  -- Every card must still be on the board. This is the contention check, and
  -- the error the FE turns into "gone — someone got there first".
  n := cardinality(g_row.board);
  foreach card in array cards loop
    p := array_position(g_row.board, card);
    if p is null then
      raise exception 'cards-gone|' using errcode = 'P0001',
        detail = 'a claimed card is no longer on the board';
    end if;
    positions := positions || p;
  end loop;

  if not setgame._is_set(cards[1], cards[2], cards[3]) then
    raise exception 'not-a-set|' using errcode = 'P0001',
      detail = 'those three cards are not a set';
  end if;

  -- ─── Take the cards off the board ──────────────────────────
  board_min := setgame._board_min(g_row.deck_kind);
  deck_size := setgame._deck_size(g_row.deck_kind);
  new_pos   := g_row.deck_pos;

  if n - 3 < board_min and new_pos < deck_size then
    -- The ordinary case: replace the claimed cards IN PLACE. Every other card
    -- keeps its slot, its screen position and its keyboard letter, so a claim
    -- never disturbs a scan someone else is in the middle of.
    new_board := g_row.board;
    for k in 1 .. 3 loop
      new_board[positions[k]] := g_row.deck[new_pos + k];
    end loop;
    new_pos := new_pos + 3;
  else
    -- The board is coming DOWN (it was above the floor, or the deck is spent),
    -- so three slots have to disappear. Rather than closing the whole board up
    -- — which would shift every card after the first hole — drop the last
    -- three slots and move their survivors into the holes left behind. At most
    -- three cards move, and they are the ones at the end of the layout.
    for k in 1 .. 3 loop
      if positions[k] <= n - 3 then
        head_holes := head_holes || positions[k];
      end if;
    end loop;
    for k in n - 2 .. n loop
      if not (k = any(positions)) then
        tail_cards := tail_cards || g_row.board[k];
      end if;
    end loop;
    new_board := g_row.board[1 : n - 3];
    for k in 1 .. coalesce(cardinality(head_holes), 0) loop
      new_board[head_holes[k]] := tail_cards[k];
    end loop;
  end if;

  -- Then the deal-three rule: top back up to the floor, and keep dealing while
  -- the table has no set to find. Appends on the right.
  select * into new_board, new_pos
    from setgame._deal_to_playable(new_board, new_pos, g_row.deck, g_row.deck_kind);

  update setgame.games
     set board = new_board,
         deck_pos = new_pos
   where id = target_game;

  -- `board_after` is what makes the history viewer a lookup rather than a
  -- replay of the deal rule — see the events table comment in the migration.
  insert into setgame.events (game_id, user_id, kind, cards, board_after)
  values (target_game, caller_id, 'claim', cards, new_board);

  update setgame.players
     set sets_found = sets_found + 1
   where game_id = target_game and user_id = caller_id;

  -- ─── Is that the end? ──────────────────────────────────────
  -- The deck is spent AND the table is dead. Both halves matter: a board with
  -- no set is refilled while cards remain, and a spent deck is only the end
  -- once the leftovers hold nothing.
  if new_pos >= deck_size and setgame._find_set(new_board) is null then
    out_terminal := true;
    perform setgame._finish(target_game, 'cleared');
  else
    -- Turn-order: an accepted, non-terminal coop claim hands the turn on
    -- (no-op for free-for-all).
    perform common._advance_turn(target_game);
    perform common.update_state(
      target_game, 'playing',
      jsonb_build_object(
        'sets_found', (select count(*) from setgame.events
        where game_id = target_game and kind = 'claim'),
        'deck_left', deck_size - new_pos
      )
    );
  end if;

  return jsonb_build_object('result', 'claimed', 'terminal', out_terminal);
end;
$$;
revoke execute on function setgame.submit_set(uuid, smallint[]) from public;
grant execute on function setgame.submit_set(uuid, smallint[]) to authenticated;

-- ============================================================
-- setgame.record_hint — the tally, not the hint
-- ============================================================
-- The hint itself is computed ON THE CLIENT and never stored. It can be: the
-- board is face-up and `src/setgame/lib/cards.ts` holds the same algebra this
-- file does, so there is nothing to look up. That buys two things — the ring
-- appears on the keystroke instead of after a round trip (it also SELECTS the
-- cards, so a lag would be felt), and there is no private column to mask,
-- which is why this game still has no per-peer masking anywhere.
--
-- What is recorded is the EVENT: who asked, and what they were shown. The ring
-- on the board is transient UI; the asking is history, and belongs in the turn
-- log next to the claims.
--
-- `cards` comes from the client, so it is CHECKED — one to three cards, all on
-- the board, and a genuine partial set. Not for cheating (the trust model
-- answers that, and a hint costs nothing anyway) but to keep a nonsense row out
-- of a log people read.
--
-- BANNED IN COMPETE, per the priced-help rule: help must be banned, earned,
-- scored into the ranking, or free only when self-informative. A hint here is
-- free and generative, so in a race it is a win button.
create or replace function setgame.record_hint(target_game uuid, cards smallint[])
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id uuid;
  g_row     setgame.games%rowtype;
  cur_state text;
  card      smallint;
begin
  caller_id := common.require_game_player(target_game);

  -- FOR UPDATE, even though nothing here writes the games row.
  --
  -- It is the LOCK ORDER that matters. This function updates a players row and
  -- then inserts an event, and that insert takes a share lock on the games row
  -- through its foreign key. submit_set goes the other way: it holds the games
  -- row FOR UPDATE from the start and updates the same players row later. Two
  -- transactions, the same two locks, opposite orders — a textbook deadlock,
  -- and a real one: the third hint claims the set, so both statements fire for
  -- the same player at the same instant and Postgres killed one of them
  -- ("deadlock detected", 40P01).
  --
  -- Taking the games row FIRST here makes every writer acquire these locks in
  -- the same order, so the cycle cannot form regardless of what the client
  -- fires concurrently. (The client also awaits this call before claiming —
  -- belt and braces, and the causal order anyway.)
  select * into g_row from setgame.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no setgame.games row for target_game';
  end if;

  if g_row.mode <> 'coop' then
    raise exception 'hint-in-compete|' using errcode = 'P0001',
      detail = 'hints are coop-only; free generative help would decide a race';
  end if;

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  -- In turn-by-turn coop a hint is part of YOUR TURN: you may ask, then claim,
  -- and the turn only passes when a claim lands (see submit_set). So this is
  -- gated but never advances — asking three times is how a stuck player
  -- finishes their own turn rather than a way to spend someone else's.
  --
  -- Gated on the server as well as in the FE (which hides the button off-turn)
  -- because `hints_used` is shared state and the count is what the table sees.
  -- No-op for free-for-all, where the pointer is null.
  perform common._require_turn(target_game, caller_id);

  if cardinality(cards) not between 1 and 3
     or (select count(distinct e) from unnest(cards) e) <> cardinality(cards) then
    raise exception 'bad-hint|' using errcode = 'P0001',
      detail = 'a hint is one to three distinct cards';
  end if;

  foreach card in array cards loop
    if not (card = any(g_row.board)) then
      raise exception 'bad-hint|' using errcode = 'P0001',
        detail = 'a hinted card is not on the board';
    end if;
  end loop;

  -- Two cards must belong to one set, and three must BE one. A single card
  -- can't be wrong on its own, so it is taken as given.
  if cardinality(cards) = 3 and not setgame._is_set(cards[1], cards[2], cards[3]) then
    raise exception 'bad-hint|' using errcode = 'P0001',
      detail = 'a three-card hint must be a set';
  elsif cardinality(cards) = 2
        and not (setgame._third(cards[1], cards[2]) = any(g_row.board)) then
    raise exception 'bad-hint|' using errcode = 'P0001',
      detail = 'a two-card hint must be part of a set that is on the board';
  end if;

  update setgame.players
     set hints_used = hints_used + 1
   where game_id = target_game and user_id = caller_id;

  insert into setgame.events (game_id, user_id, kind, cards, board_after)
  values (target_game, caller_id, 'hint', cards, g_row.board);
end;
$$;
revoke execute on function setgame.record_hint(uuid, smallint[]) from public;
grant execute on function setgame.record_hint(uuid, smallint[]) to authenticated;

-- ============================================================
-- setgame.submit_timeout — countdown-timer expiry
-- ============================================================
-- Coop: the deck wasn't cleared in time → lost. There was a reachable end and
-- the table didn't reach it, which is the reachable-end rule.
--
-- Compete: RANK THE STANDINGS — the leader (or leaders) at the whistle win.
-- This is a deliberate departure from scrabble-compete, the other game whose
-- finish is collective rather than per-player, which all-loses on timeout. The
-- difference is that scrabble has no meaningful partial result to rank, while
-- here the count of sets taken IS the complete result at every instant: the
-- clock is simply how the session stops. Nobody scoring at all is still a
-- collective loss — there is no one to crown.
--
-- Idempotent on the play_state check (a second caller raises P0001, which the
-- manifest swallows).
create or replace function setgame.submit_timeout(target_game uuid)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  g_row     setgame.games%rowtype;
  cur_state text;
begin
  select * into g_row from setgame.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no setgame.games row for target_game';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  perform setgame._finish(target_game, 'timeout');

  -- Realtime touch: common.end_game writes common.games, not setgame.*, so a
  -- no-op self-update wakes the FE's setgame subscription.
  update setgame.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function setgame.submit_timeout(uuid) from public;
grant execute on function setgame.submit_timeout(uuid) to authenticated;

-- ============================================================
-- setgame.end_game — manual stop (neutral terminal)
-- ============================================================
-- The friends' explicit "we're done" button, both modes. Writes the uniform
-- neutral terminal 'ended' — nobody wins or loses, distinct from the intrinsic
-- won/lost/won_compete/lost_compete terminals. Deliberately NOT _finish: a
-- table that stopped early has standings, but stopping early is not a result,
-- and crowning the leader would make "End" a button worth pressing while
-- ahead. Idempotent on the play_state check; any game player may fire it.
create or replace function setgame.end_game(target_game uuid)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  g_row          setgame.games%rowtype;
  cur_state      text;
  player_results jsonb;
begin
  select * into g_row from setgame.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no setgame.games row for target_game';
  end if;

  perform common.require_game_player(target_game);

  select play_state into cur_state from common.games where id = target_game;
  if cur_state <> 'playing' then
    raise exception 'game-not-in-play|' using errcode = 'P0001',
      detail = 'play_state is not an active state';
  end if;

  select jsonb_object_agg(
           p.user_id::text,
           jsonb_build_object('won', false, 'sets_found', p.sets_found))
    into player_results
    from setgame.players p
   where p.game_id = target_game;

  perform common.end_game(
    target_game, 'ended',
    jsonb_build_object(
      'mode', g_row.mode,
      'outcome', 'manual',
      'sets_found', (select count(*) from setgame.events
        where game_id = target_game and kind = 'claim')
    ),
    player_results
  );

  update setgame.games set club_handle = club_handle where id = target_game;
end;
$$;
revoke execute on function setgame.end_game(uuid) from public;
grant execute on function setgame.end_game(uuid) to authenticated;

-- ============================================================
-- setgame.concede — a player drops out of a compete race
-- ============================================================
-- No per-player elimination state exists here, so the active set is exactly
-- "not conceded" and the generic common.concede handles it: mark the caller
-- out, and if that was the last racer, end as a collective loss. The wrapper
-- keeps the FE uniform and gates concede to compete (coop ends via End).
--
-- A conceder keeps the sets they took — they appear in the leaderboard with
-- their count — but cannot win. Outliving never crowns anyone.
create or replace function setgame.concede(target_game uuid)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
begin
  perform common.require_compete((select mode from setgame.games where id = target_game));
  perform common.concede(target_game);
end;
$$;
revoke execute on function setgame.concede(uuid) from public;
grant execute on function setgame.concede(uuid) to authenticated;

-- ============================================================
-- setgame.replay_board — run the same deck back
-- ============================================================
-- The "Restart" game-menu item: reset the working state on the SAME game row.
-- The DECK IS KEPT and merely rewound, so the cards come out in exactly the
-- order they did the first time — the same game, played again. (That is why
-- the deck is stored whole and frozen rather than drawn lazily: a reshuffle
-- would make Restart just another New game.)
--
-- Any game player may call it, mid-game or from a finished game — it is a
-- restart, so there is no play_state guard. Both modes reset ALL players, per
-- the friends trust model.
--
create or replace function setgame.replay_board(target_game uuid)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  g_row     setgame.games%rowtype;
  v_board   smallint[];
  v_pos     int;
begin
  perform common.require_game_player(target_game);
  -- FOR UPDATE: a replay racing a claim must not interleave with it (submit_set
  -- locks the same row), or the reset could land on a half-applied move.
  select * into g_row from setgame.games where id = target_game for update;
  if not found then
    raise exception 'game-not-found|' using errcode = 'P0002',
      detail = 'no setgame.games row for target_game';
  end if;

  -- Re-deal from the top of the same deck, including the opening deal-three
  -- fixpoint, so the board matches the one create_game produced exactly.
  v_pos   := setgame._board_min(g_row.deck_kind);
  v_board := g_row.deck[1 : v_pos];
  select * into v_board, v_pos
    from setgame._deal_to_playable(v_board, v_pos, g_row.deck, g_row.deck_kind);

  update setgame.games
     set board = v_board,
         deck_pos = v_pos
   where id = target_game;

  delete from setgame.events where game_id = target_game;

  update setgame.players set sets_found = 0, hints_used = 0 where game_id = target_game;

  -- No title to restore: it is the game's own id, which a replay does not
  -- change. (The games that rewrite their title from play have to put it back
  -- here, or a replayed game keeps advertising the last run's result.)
  perform common.reset_game(
    target_game,
    jsonb_build_object(
      'mode', g_row.mode,
      'sets_found', 0,
      'deck_left', setgame._deck_size(g_row.deck_kind) - v_pos
    )
  );
end;
$$;
revoke execute on function setgame.replay_board(uuid) from public;
grant execute on function setgame.replay_board(uuid) to authenticated;
