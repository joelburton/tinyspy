-- cs-unmet

-- ============================================================
-- wordleone: a guess's verdict, the generator's scores, and the ratings
-- ============================================================
--
-- Three shape changes for the puzzle-feedback survey (plans/wordleone.md →
-- The ratings), which is temporary: when it goes, `ratings` and the two score
-- columns go with it, and `verdict` stays.
--
-- 1. `events.verdict`. A guess outside the legal band is now logged too, so
--    the log can show what was tried, and "not correct" no longer means "a
--    miss". The verdict names which of three a guess was; `is_correct` stays,
--    worked out from it, so the readers that ask only "was it the answer?"
--    are untouched. Every existing row is a solve or a miss.
--
-- 2. `games.positive_space` and `games.load_bearing`: the generator's scores
--    for the puzzle it built, kept so a rating can be compared with them.
--    Null for a game created before this.
--
-- 3. `ratings`: a player's rating of a puzzle, or one typed in from a
--    printout. It copies the puzzle rather than referencing its game, so a
--    rating outlives a deleted game, and a printout's row has no game at all.

-- ─── 1. events.verdict ───────────────────────────────────────
alter table wordleone.events
  add column verdict text;

update wordleone.events
   set verdict = case when is_correct then 'correct' else 'miss' end;

alter table wordleone.events
  drop constraint events_check,
  drop column is_correct;

alter table wordleone.events
  alter column verdict set not null,
  add constraint events_verdict_check
    check (verdict in ('correct', 'miss', 'not_a_word')),
  -- Only the solve has colors; a miss and a non-word are logged without.
  add constraint events_colors_check
    check ((verdict = 'correct') = (colors is not null)
           and (verdict <> 'correct' or colors = 'ggggg')),
  add column is_correct boolean generated always as (verdict = 'correct') stored;

-- ─── 2. The generator's scores ───────────────────────────────
alter table wordleone.games
  add column positive_space int,
  add column load_bearing   int;

-- ─── 3. ratings ──────────────────────────────────────────────
create table wordleone.ratings (
  id               bigint generated always as identity primary key,
  created_at       timestamptz not null default now(),

  -- Who and where; both null for a row typed in from a printout. No foreign
  -- key on the game: a rating outlives its game.
  user_id          uuid references common.profiles (user_id) on delete set null,
  game_id          uuid,

  -- The puzzle.
  starter          char(5) not null,
  starter_colors   char(5) not null check (starter_colors ~ '^[gyx]{5}$'),
  answer           char(5) not null,
  legal_band       int not null check (legal_band between 1 and 6),
  -- The answer's band in `common.words` when it was rated — copied, since a
  -- band can be moved later. Null for a printout's row if nobody looks it up.
  answer_band      int check (answer_band between 1 and 6),

  -- What the generator made of it.
  difficulty_asked text check (difficulty_asked in ('easy', 'medium', 'hard', 'any')),
  greens           int generated always as
                     (5 - length(replace(starter_colors, 'g', ''))) stored,
  positive_space   int,
  load_bearing     int,

  -- What the player said.
  rated_difficulty smallint check (rated_difficulty between 1 and 7),
  -- The band the player thinks the answer belongs in. Beside `answer_band`,
  -- it feeds the banding, and it tells a puzzle that was hard from an answer
  -- that was obscure.
  suggested_band   smallint check (suggested_band between 1 and 6),
  seconds_reported int check (seconds_reported >= 0),
  comment          text check (length(comment) between 1 and 1000),

  -- What the play showed; null for a printout, except what is typed in.
  solved_at        timestamptz,
  seconds_measured int check (seconds_measured >= 0),
  n_misses         int check (n_misses >= 0),
  n_submits        int check (n_submits >= 0)
);

alter table wordleone.ratings enable row level security;
