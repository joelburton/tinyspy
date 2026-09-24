-- cs-blessed-connections

-- ============================================================
-- common.games.status: the `outcome` key becomes `reason`
-- ============================================================
-- The key held WHY a game ended — `solved` · `mistakes` · `timeout` ·
-- `conceded` · `manual` · `exhausted` · `assassin` · `target` · `cleared` ·
-- `complete` · `blocked` — and not one of those is an outcome. `outcome` is
-- the six-value appearance vocabulary (won · lost · near · warning ·
-- neutral · noted, docs/outcomes.md), guarded and spent everywhere else in the app,
-- and the envelope's own `outcome` field carries exactly those. Two different
-- facts were wearing one word, in a jsonb blob that MERGES — so an inherited
-- key read as data.
--
-- `docs/states.md` already called it the other thing: its table header reads
-- "the cause it names", and the paragraph under it asks for "a reason noun the
-- status line can drop into Lost (out of time)". The code now says what the
-- doc says.
--
-- A DATA migration, because the key lives in stored rows: every finished game
-- in prod carries it, and the label + terminal readers were renamed with the
-- writers in the same change. `supabase/sql/` handles the writers (it is
-- re-applied in full on every deploy); nothing there can reach rows already
-- written, which is what this file is for.
--
-- Idempotent and narrow: only rows that actually carry the old key are
-- touched, and `-` removes it in the same expression that adds the new one.
-- A row that has both (impossible today; a half-applied deploy tomorrow)
-- keeps the NEW value, since `||` is right-biased.
update common.games
   set status = (status - 'outcome') || jsonb_build_object('reason', status -> 'outcome')
 where status ? 'outcome';
