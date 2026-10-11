-- cs-unmet

-- ============================================================
-- wordsy — the round clock's seconds, a setup choice
-- ============================================================
--
-- `timer_seconds` is how long the round's clock runs once the first word is
-- in, 1–120; 30 is the rulebook's. The creator types it (plans/wordsy.md,
-- decision 26). Under the `no-timer` style it is stored and unread.
--
-- Every existing game ran the rulebook's 30, so the default is its value, and
-- its setup — which the setup rows read back — and a club's saved default gain
-- the key with it.

alter table wordsy.games
  add column timer_seconds int not null default 30
    check (timer_seconds between 1 and 120);

update common.games
   set setup = setup || '{"timer_seconds": 30}'::jsonb
 where gametype like 'wordsy\_%'
   and not (setup ? 'timer_seconds');

update common.clubs_gametypes
   set default_setup = default_setup || '{"timer_seconds": 30}'::jsonb
 where gametype like 'wordsy\_%'
   and default_setup is not null
   and not (default_setup ? 'timer_seconds');
