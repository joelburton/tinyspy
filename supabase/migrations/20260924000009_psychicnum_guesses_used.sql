-- cs-unmet

-- ============================================================
-- psychicnum's budget counts UP: `guesses_remaining` becomes `guesses_used`
-- ============================================================
-- Each player's guess budget was stored as what is LEFT, counting down from
-- `setup.max_guesses`; wordle stores what is USED, counting up from 0, and
-- psychicnum's own readouts show the used count. The column, and the
-- `common.games.status` key the club page reads, now count up too. The budget
-- itself stays in `setup.max_guesses`, where the label reads it.
--
-- A DATA migration: every player row and every game's status blob holds the
-- old count. `supabase/sql/` handles the writers and readers; nothing there can
-- reach rows already written.

-- ─── The column ────────────────────────────────────────────
-- 0..9: the same ceiling the old column had, which is what bounds
-- `setup.max_guesses` in create_game.
alter table psychicnum.players
  add column guesses_used int not null default 0
    check (guesses_used between 0 and 9);

update psychicnum.players pp
   set guesses_used = (g.setup->>'max_guesses')::int - pp.guesses_remaining
  from common.games g
 where g.id = pp.game_id;

alter table psychicnum.players
  drop column guesses_remaining;

-- ─── The status key ────────────────────────────────────────
-- Coop carried the shared remaining count, compete the SUM across racers;
-- each becomes the same shape counted up, read from the backfilled column.
-- A game whose status already names `guesses_used` (a budget-exhausted or
-- timed-out ending writes it) keeps that value; the old key goes either way.
--
-- `games_touch_last_active` stamps `last_active_at` on every update, and the
-- club page sorts and dates games by it; left on, every psychicnum game would
-- move to the deploy's date. It is disabled around the update. It is defined
-- in `supabase/sql/`, so on a fresh `db reset` it does not exist yet and the
-- guard skips it.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games disable trigger games_touch_last_active;
  end if;
end $$;

update common.games cg
   set status = jsonb_build_object('guesses_used',
                  case when pg.mode = 'coop'
                       then (select max(pp.guesses_used) from psychicnum.players pp
                              where pp.game_id = cg.id)
                       else (select coalesce(sum(pp.guesses_used), 0) from psychicnum.players pp
                              where pp.game_id = cg.id)
                  end)
                || (cg.status - 'guesses_remaining')
  from psychicnum.games pg
 where pg.id = cg.id
   and cg.status ? 'guesses_remaining';

do $$
begin
  if exists (select 1 from pg_trigger
              where tgname = 'games_touch_last_active'
                and tgrelid = 'common.games'::regclass) then
    alter table common.games enable trigger games_touch_last_active;
  end if;
end $$;
