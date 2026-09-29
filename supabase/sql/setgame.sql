-- cs-unmet

-- ============================================================
-- setgame
-- ============================================================
-- What the frontend calls:
--
--   create_game     deals a new game
--   submit_set      claims three cards
--   record_hint     records a coop hint the page computed and showed
--   concede         a racer drops out of a compete game
--   stop_game       stops the game for everyone, with no result
--   submit_timeout  ends the game when the countdown runs out
--   replay_board    the same deck, dealt again from the top
--
-- What is particular to setgame (docs/games/setgame.md has the rest):
--   - A card is a smallint 0..80, four base-3 digits; three cards are a set
--     when every digit is all-same or all-different, and the SQL algebra
--     (_third) mirrors src/setgame/lib/cards.ts.
--   - One board, contended by everyone: a claim takes cards off it, the deck
--     tops it back up, and the deal-three rule keeps a set on the table.
--   - The deck running dry ends the game for everyone at once; nobody
--     finishes alone.
--   - The undealt deck order is the one secret, and nothing ever reveals it.
--
-- How this file relates to the migrations, and why it is full of drops:
-- docs/supabase.md → Schema vs code.
-- ============================================================

grant usage on schema setgame to authenticated;

-- Column grant: everything EXCEPT `deck` (its presence flips the table to
-- "only granted columns"). The undealt order is the one secret in this game,
-- and unlike every other shielded column on the roster NOTHING ever reveals
-- it — there is no end-of-game unlock, because the leftover order is of no
-- interest once the game is over. `deck_pos` IS granted: paired with the
-- public `deck_kind` it gives "how many cards are left" without saying which.
grant select (game_id, deck_kind, palette, deck_pos, board)
  on setgame.games to authenticated;
drop policy if exists games_select on setgame.games;
create policy games_select on setgame.games
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = games.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

grant select on setgame.players to authenticated;
drop policy if exists players_select on setgame.players;
create policy players_select on setgame.players
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = players.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

-- Events are club-readable in BOTH modes, with no end-of-game gate — see the
-- table comment in the migration. The cards were face-up and everyone watched
-- them leave; a rival's claim history says nothing about what is coming, and a
-- hint row says only that someone asked.
grant select on setgame.events to authenticated;
drop policy if exists events_select on setgame.events;
create policy events_select on setgame.events
  for select to authenticated
  using (
    exists (
      select 1 from common.games cg
       where cg.id = events.game_id
         and common._is_club_member(cg.club_handle)
    )
  );

drop view if exists setgame.games_state;

-- ============================================================
-- setgame._third — the algebra
-- ============================================================
-- The one card that completes a set with `p_a` and `p_b`.
--
-- Per base-3 digit the third value is whatever makes the three sum to 0 mod 3,
-- which is `(6 - x - y) % 3` — one expression covering both cases, since two
-- equal digits give back the same digit and two different ones give the
-- remaining value. (`src/setgame/lib/cards.ts` writes the same rule as an
-- explicit same/different branch, which reads better in the place a person
-- goes to LEARN the rule; the two agree on all 6561 pairs and the TS suite
-- checks exactly that.)
drop function if exists setgame._third(smallint, smallint);
create or replace function setgame._third(p_a smallint, p_b smallint)
returns smallint
language sql
immutable
as $$
  select (((6 - (p_a / 27) % 3 - (p_b / 27) % 3) % 3) * 27
        + ((6 - (p_a /  9) % 3 - (p_b /  9) % 3) % 3) *  9
        + ((6 - (p_a /  3) % 3 - (p_b /  3) % 3) % 3) *  3
        + ((6 -  p_a       % 3 -  p_b       % 3) % 3)     )::smallint;
$$;
revoke execute on function setgame._third(smallint, smallint) from public;

-- ============================================================
-- setgame._is_set — are these three cards a set?
-- ============================================================
-- Assumes three DISTINCT cards; submit_set checks distinctness before it
-- gets here.
drop function if exists setgame._is_set(smallint, smallint, smallint);
create or replace function setgame._is_set(p_a smallint, p_b smallint, p_c smallint)
returns boolean
language sql
immutable
as $$
  select setgame._third(p_a, p_b) = p_c;
$$;
revoke execute on function setgame._is_set(smallint, smallint, smallint) from public;

-- ============================================================
-- setgame._find_set — the first set on the board
-- ============================================================
-- The first set on `p_cards`, or NULL if it holds none — the question behind
-- both "deal three more" and the coop hint.
--
-- Pairs, not triples: every pair names its completing card outright, so this
-- asks "is that card also here?" instead of testing every combination. At the
-- largest board that can exist (21) it is 210 iterations.
drop function if exists setgame._find_set(smallint[]);
create or replace function setgame._find_set(p_cards smallint[])
returns smallint[]
language plpgsql
immutable
as $$
declare
  cards smallint[] := p_cards;
  n int := coalesce(cardinality(p_cards), 0);
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

-- ============================================================
-- setgame._find_set_with — the first set using one card
-- ============================================================
-- The first set on `p_cards` that USES `p_card`, or NULL. Only the hint needs
-- this: a second hint press must ring another card of the set the first press
-- pointed at, not of some other set.
drop function if exists setgame._find_set_with(smallint[], smallint);
create or replace function setgame._find_set_with(p_cards smallint[], p_card smallint)
returns smallint[]
language plpgsql
immutable
as $$
declare
  cards smallint[] := p_cards;
  card  smallint := p_card;
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

-- ============================================================
-- setgame._deck_size / _board_min — the deck's two numbers
-- ============================================================
-- Cards in a deck: junior drops shading, so it is a third of the full deck.
-- And the floor a board is topped back up to after a claim: junior deals
-- nine, the same "three rows" shape one column narrower.
drop function if exists setgame._deck_size(text);
create or replace function setgame._deck_size(p_deck_kind text)
returns int
language sql
immutable
as $$
  select case p_deck_kind when 'junior' then 27 else 81 end;
$$;
revoke execute on function setgame._deck_size(text) from public;
-- Granted, unlike the other helpers here, because games_state is a
-- security_invoker view and computes `deck_left` with it — the view body runs
-- as the reader, so the reader needs EXECUTE. Safe: it takes a string and
-- returns a constant, touching no table.
grant execute on function setgame._deck_size(text) to authenticated;

drop function if exists setgame._board_min(text);
create or replace function setgame._board_min(p_deck_kind text)
returns int
language sql
immutable
as $$
  select case p_deck_kind when 'junior' then 9 else 12 end;
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
drop function if exists setgame._deal_to_playable(smallint[], int, smallint[], text);
create or replace function setgame._deal_to_playable(
  inout p_board    smallint[],
  inout p_deck_pos int,
  p_deck           smallint[],
  p_deck_kind      text
)
language plpgsql
immutable
as $$
declare
  deck_size int := setgame._deck_size(p_deck_kind);
  board_min int := setgame._board_min(p_deck_kind);
begin
  loop
    exit when p_deck_pos >= deck_size;
    exit when cardinality(p_board) >= board_min and setgame._find_set(p_board) is not null;
    p_board := p_board || p_deck[p_deck_pos + 1 : p_deck_pos + 3];
    p_deck_pos := p_deck_pos + 3;
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
create view setgame.games_state with (security_invoker = true) as
  select g.game_id,
         g.deck_kind,
         g.palette,
         g.board,
         setgame._deck_size(g.deck_kind) - g.deck_pos as deck_left
    from setgame.games g;
grant select on setgame.games_state to authenticated;

-- ============================================================
-- setgame._write_statuses — the page's copies of the game
-- ============================================================
-- Writes `common.games.game_status`, every `common.game_players.player_status`
-- and `common.games.clubpage_info` from setgame's own tables, assigning each
-- whole (plans/common-tables.md → The statuses). Every key is always present,
-- null when it has no value:
--
--   game_status    { deck_remaining_count } — the cards still to be dealt
--   player_status  { found_sets_count, hints_count, player_ended_reason }
--                  — that player's own claims and hints (a coop page sums
--                  them for the team)
--   clubpage_info  { found_sets_count, deck_remaining_count, deck_kind,
--                    winner_user_ids, winner_found_sets_count }
--                  — the table's sets found (the sum of every player's),
--                  what is left in the deck and which deck it is; compete's
--                  winners once there are any, one or more (a tie is an
--                  ordinary result here, and the club line names each), and
--                  the count they share
--
-- `p_update_status_changed_at` is true from create, Restart and every move,
-- false from a rebuild (the pass over every game, a repair by hand), so a
-- rebuild never re-dates a game.
create or replace function setgame._write_statuses(
  p_game_id uuid,
  p_update_status_changed_at boolean
)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  g setgame.games%rowtype;
  v_mode text;
  v_winners jsonb;
begin
  select * into g from setgame.games where game_id = p_game_id;
  select mode into v_mode from common.games where id = p_game_id;

  update common.game_players gp
     set player_status = jsonb_build_object(
           'found_sets_count', p.sets_found,
           'hints_count', p.hints_used,
           'player_ended_reason', gp.player_ended_reason)
    from setgame.players p
   where gp.game_id = p_game_id
     and p.game_id = gp.game_id
     and p.user_id = gp.user_id;

  select jsonb_agg(user_id order by user_id)
    into v_winners
    from common.game_players
   where game_id = p_game_id and final_ranking = 1;

  update common.games
     set game_status = jsonb_build_object(
           'deck_remaining_count', setgame._deck_size(g.deck_kind) - g.deck_pos),
         clubpage_info = jsonb_build_object(
           'found_sets_count', (select coalesce(sum(sets_found), 0)::int
                                  from setgame.players where game_id = p_game_id),
           'deck_remaining_count', setgame._deck_size(g.deck_kind) - g.deck_pos,
           'deck_kind', g.deck_kind,
           'winner_user_ids', case when v_mode = 'compete' then v_winners end,
           'winner_found_sets_count', case when v_mode = 'compete' then (
             select max(p.sets_found) from setgame.players p
               join common.game_players gp
                 on gp.game_id = p.game_id and gp.user_id = p.user_id
              where p.game_id = p_game_id and gp.final_ranking = 1) end),
         status_changed_at = case when p_update_status_changed_at
                                  then now() else status_changed_at end
   where id = p_game_id;
end;
$$;

revoke execute on function setgame._write_statuses(uuid, boolean) from public;

drop function if exists setgame.create_game(text, jsonb, uuid[], text);

-- ============================================================
-- setgame.create_game(p_club_handle, p_setup, p_player_user_ids, p_mode)
-- ============================================================
-- Setup shape: { "timer": (none | countup | countdown{seconds}),
--                "deck":  'full' | 'junior',
--                "palette": 'traditional' | 'colorblind',
--                "coop_style": 'free-for-all' | 'turns',
--                "first_turn_user_id": uuid (turn-coop only) }.
--
-- Only 'turns' is tested for below, so anything else — including the key being
-- absent — reads as free-for-all. That is the shared CoopStyleField's own
-- convention. `deck` and `palette` are copied to their columns (`full` and
-- `traditional` when absent, as paletteOf does).
--
-- The board is built INLINE — no puzzle library, no edge function — because a
-- board is just a shuffle. The only work beyond dealing is running the
-- deal-three rule before anyone sees the table, so the opening board is never
-- one of the ~3% that come out set-free.
create or replace function setgame.create_game(
  p_club_handle     text,
  p_setup           jsonb,
  p_player_user_ids uuid[],
  p_mode            text
)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  new_id       uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text;
  v_deck_kind  text;
  v_palette    text;
  v_deck       smallint[];
  v_board      smallint[];
  v_deck_pos   int;
  first_turn   uuid;
begin
  perform common._require_club_member(p_club_handle);
  -- Must agree with numberOfPlayers in src/setgame/manifest.ts ([1,6]/[2,6]).
  perform common._require_player_count_max(p_player_user_ids, 6);

  perform common._require_valid_mode(p_mode);
  perform common._require_valid_timer(p_setup->'timer');

  v_deck_kind := coalesce(p_setup->>'deck', 'full');
  if v_deck_kind not in ('full', 'junior') then
    raise exception 'BUG: deck of ''%''', v_deck_kind
      using errcode = 'PN075', hint = 'fault', column = '_',
      detail = 'setup deck must be full or junior';
  end if;
  -- The palette's own check constraint catches anything else; the form offers
  -- only these two.
  v_palette := coalesce(p_setup->>'palette', 'traditional');

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

  -- The saved default strips first_turn_user_id: who goes first is a per-game
  -- pick, not a club preference. coop_style rides along.
  new_id := common._create_game(
    p_club_handle, 'setgame_' || p_mode, p_mode, p_player_user_ids,
    -- Placeholder: the real title needs the game's id, which only exists once
    -- common._create_game has inserted the row (rewritten just below).
    'New game',
    p_setup,
    p_setup - 'first_turn_user_id'
  );

  -- The title (the club card's heading), the same pure IDENTIFIER bananagrams
  -- uses: the first six hex digits of the game's own uuid, like a short commit
  -- hash. A title that counted sets would change every few seconds and could
  -- not be used to REFER to a game; a handle that never moves can: "look at
  -- #A3F19C" is something one player can say to another, and something to
  -- search the club list (or the database) for.
  update common.games cg
     set title = '#' || upper(left(new_id::text, 6))
   where cg.id = new_id;

  -- Opt-in turn-by-turn coop: seat the common rotation so submit_set gates
  -- each claim. Free-for-all and compete leave the pointer null (inert).
  if p_mode = 'coop' and p_setup->>'coop_style' = 'turns' then
    first_turn := (p_setup->>'first_turn_user_id')::uuid;
    if first_turn is null or not (first_turn = any(p_player_user_ids)) then
      raise exception 'BUG: first player who is not in the game'
        using errcode = 'PN076', hint = 'fault', column = '_',
        detail = 'setup.first_turn_user_id must be one of the players';
    end if;
    perform common._assign_turn_order(new_id, first_turn);
  end if;

  insert into setgame.games (game_id, deck_kind, palette, deck, deck_pos, board)
  values (new_id, v_deck_kind, v_palette, v_deck, v_deck_pos, v_board);

  insert into setgame.players (game_id, user_id)
  select new_id, uid from unnest(p_player_user_ids) uid;

  perform setgame._write_statuses(new_id, p_update_status_changed_at => true);

  -- `result` NAMES the answer; `id` is the game to go to. The name is here even
  -- though this is the only `ok` — a call site cannot assert a case the payload
  -- does not carry.
  return common._ok_envelope(jsonb_build_object('result', 'created', 'id', new_id));

-- The boundary. It reads the SQLSTATE, re-raises anything that isn't ours, and
-- lets the raise itself carry the message, the kind and the field.
exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col);
end;
$$;
revoke execute on function setgame.create_game(text, jsonb, uuid[], text) from public;
grant execute on function setgame.create_game(text, jsonb, uuid[], text) to authenticated;

drop function if exists setgame._finish(uuid, text);

-- ============================================================
-- setgame._finish — the collective ending, both modes
-- ============================================================
-- setgame has no per-player finish line: the deck running dry ends the game
-- for everyone at once. So there is one ending path, reached either by the
-- last claim (`p_reason_detail` 'cleared', ended by `p_ended_by_user_id`) or
-- by the clock ('timeout'). Rankings (docs/win-lose.md):
--
--   coop, cleared     reached_goal: the team, every player ranked 1. Clearing
--                     means no sets left to find, NOT using every card —
--                     stranding six or nine cards is the normal ending (a full
--                     clear happens in about 2% of games), so nothing grades
--                     the leftovers
--   coop, timeout     nobody ranked — a loss
--   compete, either   resource_exhausted (cleared) or timeout, ranked on SETS
--                     FOUND among the players who didn't concede and found at
--                     least one, and A TIE IS A TIE: ties share the rank. No
--                     speed tiebreak — the count IS the whole result, and
--                     breaking a 9-9 on who grabbed their last set first would
--                     crown reflexes the score deliberately does not measure.
--                     A conceder keeps the sets they took but can't win;
--                     nobody scoring ranks nobody
create or replace function setgame._finish(
  p_game_id uuid,
  p_reason_detail text,
  p_ended_by_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_mode text;
  v_rankings jsonb := '{}'::jsonb;
begin
  select mode into v_mode from common.games where id = p_game_id;

  if v_mode = 'coop' then
    if p_reason_detail = 'cleared' then
      select jsonb_object_agg(user_id::text, 1) into v_rankings
        from common.game_players where game_id = p_game_id;
    end if;
  else
    select coalesce(jsonb_object_agg(user_id::text, ranking), '{}'::jsonb)
      into v_rankings
      from (
        select p.user_id, rank() over (order by p.sets_found desc) as ranking
          from setgame.players p
          join common.game_players gp
            on gp.game_id = p.game_id and gp.user_id = p.user_id
         where p.game_id = p_game_id
           and gp.player_ended_reason is distinct from 'conceded'
           and p.sets_found > 0
      ) ranked;
  end if;

  perform common._end_game(
    p_game_id,
    case when p_reason_detail = 'timeout' then 'timeout'
         when v_mode = 'coop' then 'reached_goal'
         else 'resource_exhausted' end,
    p_reason_detail, p_ended_by_user_id,
    p_is_no_result => false,
    p_final_rankings => v_rankings
  );
end;
$$;
revoke execute on function setgame._finish(uuid, text, uuid) from public;

drop function if exists setgame.submit_set(uuid, smallint[]);

-- ============================================================
-- setgame.submit_set — claim three cards
-- ============================================================
-- The server re-checks everything the board already checked, because the
-- board is not the authority — but an INVALID selection normally never gets
-- here at all: every card is face-up, so the FE knows the rule and rejects a
-- non-set before it leaves the client. That is also why there is no
-- wrong-guess penalty to design. The one rejection that happens in real play
-- is PN277: a rival claimed a card out from under this selection.
--
-- The `for update` lock on the games row is what makes that rejection safe
-- rather than a race — two players claiming overlapping sets serialize, the
-- first commits, and the second finds a card missing from the board.
--
-- The claim that leaves the deck spent AND the table without a set ends the
-- game ('cleared'), the claimer as who ended it.
create or replace function setgame.submit_set(p_game_id uuid, p_cards smallint[])
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id    uuid;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g            setgame.games%rowtype;
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
  -- The row first, before the membership gate: a friend deleting the game
  -- takes every membership with it (docs/envelopes.md → a missing game row
  -- is PN485).
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: a teammate ended the game, or the countdown expired, while this
    -- claim was in flight.
    perform common._raise_game_over();
  end if;

  -- A conceded player is out of the race. The FE gates on this too, so it only
  -- fires on a genuine race (a claim in flight when the concession commits).
  if (select player_ended_reason from common.game_players
        where game_id = p_game_id and user_id = caller_id) = 'conceded' then
    perform common._raise_already_conceded();
  end if;

  -- Turn-order gate (opt-in turn-by-turn coop). No-op for free-for-all
  -- (pointer null) and for compete.
  perform common._require_turn(p_game_id, caller_id);

  -- ─── Validate the selection ────────────────────────────────
  if cardinality(p_cards) is distinct from 3
     or (select count(distinct e) from unnest(p_cards) e) <> 3 then
    raise exception 'BUG: claim that was not three different cards'
      using errcode = 'PN276', hint = 'fault', column = '_',
      detail = 'a claim is exactly three distinct cards';
  end if;

  -- Every card must still be on the board. This is the contention check, and
  -- the error the FE turns into "gone — someone got there first".
  n := cardinality(g.board);
  foreach card in array p_cards loop
    p := array_position(g.board, card);
    if p is null then
      -- THE contention race, and the only one on the roster that is ordinary
      -- rather than exotic: one table, everyone claiming off it, so a rival's
      -- claim lands between your click and your submit. No local gate can see
      -- it — the cards leave the board by realtime.
      raise exception 'Someone got there first'
        using errcode = 'PN277', hint = 'race', column = '_',
        detail = 'a claimed card is no longer on the board';
    end if;
    positions := positions || p;
  end loop;

  if not setgame._is_set(p_cards[1], p_cards[2], p_cards[3]) then
    -- The whole board is face-up and the FE runs the same algebra before it
    -- submits (src/setgame/lib/cards.ts), so a non-set arriving is a bug.
    raise exception 'BUG: bad set'
      using errcode = 'PN278', hint = 'fault', column = '_',
      detail = 'those three cards are not a set';
  end if;

  -- ─── Take the cards off the board ──────────────────────────
  board_min := setgame._board_min(g.deck_kind);
  deck_size := setgame._deck_size(g.deck_kind);
  new_pos   := g.deck_pos;

  if n - 3 < board_min and new_pos < deck_size then
    -- The ordinary case: replace the claimed cards IN PLACE. Every other card
    -- keeps its slot, its screen position and its keyboard letter, so a claim
    -- never disturbs a scan someone else is in the middle of.
    new_board := g.board;
    for k in 1 .. 3 loop
      new_board[positions[k]] := g.deck[new_pos + k];
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
        tail_cards := tail_cards || g.board[k];
      end if;
    end loop;
    new_board := g.board[1 : n - 3];
    for k in 1 .. coalesce(cardinality(head_holes), 0) loop
      new_board[head_holes[k]] := tail_cards[k];
    end loop;
  end if;

  -- Then the deal-three rule: top back up to the floor, and keep dealing while
  -- the table has no set to find. Appends on the right.
  select * into new_board, new_pos
    from setgame._deal_to_playable(new_board, new_pos, g.deck, g.deck_kind);

  update setgame.games
     set board = new_board,
         deck_pos = new_pos
   where game_id = p_game_id;

  -- `board_after` is what makes the history viewer a lookup rather than a
  -- replay of the deal rule — see the events table comment in the migration.
  -- A claim is the move here, so it spends a go — the one that empties the
  -- deck included.
  insert into setgame.events (game_id, user_id, kind, cards, board_after, took_turn)
  values (p_game_id, caller_id, 'claim', p_cards, new_board, true);

  update setgame.players
     set sets_found = sets_found + 1
   where game_id = p_game_id and user_id = caller_id;

  -- ─── Is that the end? ──────────────────────────────────────
  -- The deck is spent AND the table is dead. Both halves matter: a board with
  -- no set is refilled while cards remain, and a spent deck is only the end
  -- once the leftovers hold nothing.
  if new_pos >= deck_size and setgame._find_set(new_board) is null then
    out_terminal := true;
    perform setgame._finish(p_game_id, 'cleared', caller_id);
  else
    -- Turn-order: an accepted, non-final coop claim hands the turn on (no-op
    -- for free-for-all).
    perform common._advance_turn(p_game_id);
  end if;

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);

  -- No message: a claim that lands shows itself, in the cards leaving the
  -- board.
  return common._ok_envelope(
    jsonb_build_object('result', 'claimed', 'terminal', out_terminal), 'won');

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function setgame.submit_set(uuid, smallint[]) from public;
grant execute on function setgame.submit_set(uuid, smallint[]) to authenticated;

drop function if exists setgame.record_hint(uuid, smallint[]);

-- ============================================================
-- setgame.record_hint — the tally, not the hint
-- ============================================================
-- The hint itself is computed ON THE CLIENT and never stored. It can be: the
-- board is face-up and `src/setgame/lib/cards.ts` holds the same algebra this
-- file does, so there is nothing to look up. That buys two things — the ring
-- appears on the keystroke instead of after a round trip (it also SELECTS the
-- cards, so a lag would be felt), and there is no private column to mask.
--
-- What is recorded is the EVENT: who asked, and what they were shown
-- (`p_cards`). The ring on the board is transient UI; the asking is history,
-- and belongs in the turn log next to the claims.
--
-- `p_cards` comes from the client, so it is CHECKED — one to three cards, all
-- on the board, and a genuine partial set. Not for cheating (the trust model
-- answers that, and a hint costs nothing anyway) but to keep a nonsense row
-- out of a log people read.
--
-- BANNED IN COMPETE, per the priced-hint rule: a hint must be banned, earned,
-- scored into the ranking, or free only when self-informative. A hint here is
-- free and generative, so in a race it is a win button.
--
-- No message and no outcome: asking for a hint shows itself, in the ring the
-- client already drew. `hints_used` is the count this call just moved.
create or replace function setgame.record_hint(p_game_id uuid, p_cards smallint[])
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  caller_id uuid;
  g         setgame.games%rowtype;
  card      smallint;
  v_used    int;
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- FOR UPDATE, even though nothing here writes the games row: it is the LOCK
  -- ORDER that matters. This function updates a players row and then inserts
  -- an event, and that insert takes a share lock on the games row through its
  -- foreign key. submit_set goes the other way: it holds the games row FOR
  -- UPDATE from the start and updates the same players row later. Two
  -- transactions, the same two locks, opposite orders — a real deadlock
  -- ("deadlock detected", 40P01), since the third hint claims the set and both
  -- statements fire for the same player at the same instant. Taking the games
  -- row FIRST here makes every writer acquire these locks in the same order.
  --
  -- And the row before the membership gate: a friend deleting the game takes
  -- every membership with it (docs/envelopes.md → a missing game row is PN485).
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  caller_id := common._require_game_player(p_game_id);

  if (select mode from common.games where id = p_game_id) <> 'coop' then
    -- Mode is fixed at create_game and never changes, so no unbroken client
    -- would ask: the compete board offers no hint button at all.
    raise exception 'BUG: hint request in a race'
      using errcode = 'PN280', hint = 'fault', column = '_',
      detail = 'hints are coop-only; a free generative hint would decide a race';
  end if;

  if (select ended_at from common.games where id = p_game_id) is not null then
    -- A race: the game ended under you while the hint request was in flight.
    perform common._raise_game_over();
  end if;

  -- In turn-by-turn coop a hint is part of YOUR TURN: you may ask, then claim,
  -- and the turn only passes when a claim lands (see submit_set). So this is
  -- gated but never advances — asking three times is how a stuck player
  -- finishes their own turn rather than a way to spend someone else's. Gated
  -- on the server as well as in the FE (which hides the button off-turn)
  -- because `hints_used` is shared state and the count is what the table sees.
  -- No-op for free-for-all, where the pointer is null.
  perform common._require_turn(p_game_id, caller_id);

  if cardinality(p_cards) not between 1 and 3
     or (select count(distinct e) from unnest(p_cards) e) <> cardinality(p_cards) then
    raise exception 'BUG: hint that was not one to three cards'
      using errcode = 'PN282', hint = 'fault', column = '_',
      detail = 'a hint is one to three distinct cards';
  end if;

  foreach card in array p_cards loop
    if not (card = any(g.board)) then
      raise exception 'BUG: hint naming a card that is not on the board'
        using errcode = 'PN283', hint = 'fault', column = '_',
        detail = 'a hinted card is not on the board';
    end if;
  end loop;

  -- Two cards must belong to one set, and three must BE one. A single card
  -- can't be wrong on its own, so it is taken as given.
  if cardinality(p_cards) = 3 and not setgame._is_set(p_cards[1], p_cards[2], p_cards[3]) then
    raise exception 'BUG: three-card hint that is not a set'
      using errcode = 'PN284', hint = 'fault', column = '_',
      detail = 'a three-card hint must be a set';
  elsif cardinality(p_cards) = 2
        and not (setgame._third(p_cards[1], p_cards[2]) = any(g.board)) then
    raise exception 'BUG: two-card hint with no third card on the board'
      using errcode = 'PN285', hint = 'fault', column = '_',
      detail = 'a two-card hint must be part of a set that is on the board';
  end if;

  update setgame.players
     set hints_used = hints_used + 1
   where game_id = p_game_id and user_id = caller_id
  returning hints_used into v_used;

  -- A hint is part of the asker's turn rather than one of its own.
  insert into setgame.events (game_id, user_id, kind, cards, board_after, took_turn)
  values (p_game_id, caller_id, 'hint', p_cards, g.board, false);

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);

  return common._ok_envelope(
    jsonb_build_object('result', 'recorded', 'hints_used', v_used));

exception when others then
  get stacked diagnostics
    v_msg = message_text, v_detail = pg_exception_detail,
    v_hint = pg_exception_hint, v_code = returned_sqlstate,
    v_col = column_name, v_out = constraint_name;
  if v_code !~ '^P[AN][0-9]{3}$' then raise; end if;
  return common._raised_envelope(v_code, v_msg, v_hint, v_detail, v_col, v_out);
end;
$$;
revoke execute on function setgame.record_hint(uuid, smallint[]) from public;
grant execute on function setgame.record_hint(uuid, smallint[]) to authenticated;

drop function if exists setgame.submit_timeout(uuid);

-- ============================================================
-- setgame.submit_timeout — countdown-timer expiry
-- ============================================================
-- Fired by every connected client when a countdown hits 0; the first ends the
-- game (_finish, 'timeout'), the rest find it ended and answer the game-over
-- race. Coop: the deck wasn't cleared in time — a loss. Compete: the leaders
-- at the whistle win, since the count of sets taken IS the complete result at
-- every instant; the clock is simply how the session stops. Ended by whoever
-- held the turn (turn-by-turn coop), else nobody.
create or replace function setgame.submit_timeout(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._require_game_player(p_game_id);

  if (select ended_at from common.games where id = p_game_id) is not null then
    perform common._raise_game_over();
  end if;

  perform setgame._finish(p_game_id, 'timeout',
    (select current_turn_user_id from common.games where id = p_game_id));

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.submit_timeout(uuid) from public;
grant execute on function setgame.submit_timeout(uuid) to authenticated;

drop function if exists setgame.stop_game(uuid);
-- stop_game's old name; supabase/sql is re-applied, not diffed, so it needs an explicit drop.
drop function if exists setgame.end_game(uuid);

-- ============================================================
-- setgame.stop_game — the Stop
-- ============================================================
-- The friends' explicit "we're done" button, both modes, with no result
-- (docs/common-schema.md → Stop). Deliberately NOT _finish: a table that
-- stopped early has a leaderboard, but stopping early is not a result, and
-- crowning the leader would make "Stop" a button worth pressing while ahead.
create or replace function setgame.stop_game(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked, so a Stop racing the last claim waits for it and then reads the
  -- game as over. The row check comes before the membership gate — see
  -- replay_board.
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._stop(p_game_id);

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.stop_game(uuid) from public;
grant execute on function setgame.stop_game(uuid) to authenticated;

drop function if exists setgame.concede(uuid);

-- ============================================================
-- setgame.concede — a player drops out of a compete race
-- ============================================================
-- No player finishes alone here — the deck running dry ends the game for
-- everyone — so `common._concede` decides it all: it marks the caller out, and
-- when that was the last racer, ends the game as a loss for everyone. A
-- conceder keeps the sets they took but cannot win. Compete only (coop ends
-- via Stop).
create or replace function setgame.concede(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
begin
  -- Locked like every move, so every game's concede has one shape
  -- (docs/common-schema.md → Concede).
  perform 1 from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  perform common._require_compete((select mode from common.games where id = p_game_id));

  perform common._concede(p_game_id);

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.concede(uuid) from public;
grant execute on function setgame.concede(uuid) to authenticated;

drop function if exists setgame.replay_board(uuid);

-- ============================================================
-- setgame.replay_board — run the same deck back
-- ============================================================
-- The "Restart" game-menu item: reset the working state on the SAME game row.
-- The DECK IS KEPT and merely rewound, so the cards come out in exactly the
-- order they did the first time — the same game, played again. (That is why
-- the deck is stored whole and frozen rather than drawn lazily: a reshuffle
-- would make Restart just another New game.) No title to restore: it is the
-- game's own id, which a replay does not change.
--
-- Any game player may call it, mid-game or after the game ends — it is a
-- restart, so there is no ended check. Both modes reset ALL players.
create or replace function setgame.replay_board(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = setgame, common, public, extensions
as $$
declare
  v_msg text; v_detail text; v_hint text; v_code text; v_col text; v_out text;
  g         setgame.games%rowtype;
  v_board   smallint[];
  v_pos     int;
begin
  -- FOR UPDATE: a replay racing a claim must not interleave with it (submit_set
  -- locks the same row), or the reset could land on a half-applied move.
  select * into g from setgame.games where game_id = p_game_id for update;
  if not found then
    perform common._raise_game_deleted('setgame');
  end if;

  -- The row check comes BEFORE the membership gate: `delete_game` takes this
  -- row, `common.games` and every `game_players` row together, so a caller
  -- whose game was just deleted has no membership left either, and would be
  -- told "You are not in this game" — they WERE in it; it is gone.
  perform common._require_game_player(p_game_id);

  -- Re-deal from the top of the same deck, including the opening deal-three
  -- fixpoint, so the board matches the one create_game produced exactly.
  v_pos   := setgame._board_min(g.deck_kind);
  v_board := g.deck[1 : v_pos];
  select * into v_board, v_pos
    from setgame._deal_to_playable(v_board, v_pos, g.deck, g.deck_kind);

  update setgame.games
     set board = v_board,
         deck_pos = v_pos
   where game_id = p_game_id;

  delete from setgame.events where game_id = p_game_id;

  update setgame.players set sets_found = 0, hints_used = 0 where game_id = p_game_id;

  perform common._reset_game(p_game_id);

  perform setgame._write_statuses(p_game_id, p_update_status_changed_at => true);
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
revoke execute on function setgame.replay_board(uuid) from public;
grant execute on function setgame.replay_board(uuid) to authenticated;
