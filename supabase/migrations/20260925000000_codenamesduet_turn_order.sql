-- cs-unmet

-- ============================================================
-- codenamesduet joins the common turn order
-- ============================================================
-- codenamesduet keeps its turn in its own state — `current_clue_giver`, and
-- whether this turn's clue is in — and until now left the common turn order
-- empty, so the page read every codenamesduet game as having no turns. It now
-- seats both players (`common.game_players.turn_seat`) and points
-- `common.games.current_turn_user_id` at whoever must act now
-- (`codenamesduet._point_turn` in `supabase/sql/codenamesduet.sql` keeps it
-- there from here on).
--
-- A DATA migration: every stored game needs its seats, and every game still
-- in progress its pointer. A migration cannot call `supabase/sql/`, so the
-- pointer's rule is written out here, the same rule `_point_turn` keeps:
--
--   playing, no clue yet this turn    → the clue-giver
--   playing, the clue is in           → the guesser
--   sudden death, one side with words → the player who still has words
--                                       (A guesses off B's key, B off A's)
--   sudden death, both with words     → nobody
--
-- A finished game gets its seats and keeps a null pointer.

-- ─── The seats: A at 0, B at 1 ─────────────────────────────
update common.game_players gp
   set turn_seat = case gp.user_id when cg.user_a_id then 0 else 1 end
  from codenamesduet.games cg
 where gp.game_id = cg.id
   and gp.user_id in (cg.user_a_id, cg.user_b_id);

-- ─── The pointer, for games still in progress ──────────────
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every codenamesduet game in
-- progress would move to the deploy's date. It is disabled around the update.
-- It is defined in `supabase/sql/`, so on a fresh `db reset` it does not exist
-- yet and the guard skips it.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

with state as (
  select
    g.id,
    g.play_state,
    cg.user_a_id,
    cg.user_b_id,
    cg.current_clue_giver,
    exists (
      select 1 from codenamesduet.events e
       where e.game_id = cg.id and e.kind = 'clue' and e.turn_number = cg.turn_number
    ) as has_clue,
    -- Seat A still has an agent unfound (so B has words to guess in sudden death).
    exists (
      select 1 from codenamesduet.words w
       where w.game_id = cg.id
         and (cg.key_card_a ->> w.position) = 'G'
         and w.revealed_as is distinct from 'G'
    ) as a_has_agents,
    exists (
      select 1 from codenamesduet.words w
       where w.game_id = cg.id
         and (cg.key_card_b ->> w.position) = 'G'
         and w.revealed_as is distinct from 'G'
    ) as b_has_agents
  from common.games g
  join codenamesduet.games cg on cg.id = g.id
  where g.play_state in ('playing', 'sudden_death')
),
actor as (
  select
    id, user_a_id, user_b_id,
    case
      when play_state = 'playing' and not has_clue then current_clue_giver
      when play_state = 'playing' then case current_clue_giver when 'A' then 'B' else 'A' end
      -- sudden death: A has words while B has agents left, and B while A has
      when b_has_agents and a_has_agents then null
      when b_has_agents then 'A'
      when a_has_agents then 'B'
    end as seat
  from state
)
update common.games g
   set current_turn_user_id = case actor.seat
     when 'A' then actor.user_a_id
     when 'B' then actor.user_b_id
   end
  from actor
 where g.id = actor.id;

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;
