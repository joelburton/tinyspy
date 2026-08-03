-- ============================================================
-- boggle — MothCubes: find words by tracing adjacent letter tiles.
-- ============================================================
-- Coop + compete sibling pair (one schema, mode column). Modeled on
-- spellingbee, with two deliberate simplifications (see docs/games/boggle.md):
--
--   1. NO hidden-solution view. The required-word list is shipped to the FE
--      (the trust model doesn't withhold it for anti-cheat), so `required_words`
--      is a normal readable column — no column-grant exclusion, no
--      `games_state` security_invoker view, no `_required_words_for`. The
--      missed-words reveal is computed client-side (`required − found`).
--   2. Trusting-commit submit. The board ships to the FE with BOTH its required
--      and bonus word lists (`required_words` + `bonus_words`), so the FE alone
--      validates a guess (membership in the legal list = traceable + real) and
--      scores it. `submit_word` trusts the word + points + is_bonus it's handed
--      and only dedups + records (scrabble precedent) — it does NOT re-check the
--      word against `common.words`. The shared `useWordSubmit` hook drives this
--      for both boggle + spellingbee.
--
-- The board is generated on demand by the `boggle-build-board` edge function
-- (pure-TS trie solver, see src/boggle/lib/), which calls create_game here.

create schema if not exists boggle;

-- ============================================================
-- boggle.games — one row per game, FK'd to the common.games header.
-- ============================================================
create table boggle.games (
  id uuid primary key references common.games(id) on delete cascade,
  -- Denormalized from common.games so RLS policies check membership without a
  -- join, and so the FE reads the whole board in one schema('boggle') query.
  club_handle text not null references common.clubs(handle) on delete cascade,
  mode text not null check (mode in ('coop', 'compete')),
  -- The rolled board: a row-major raw-face string (A–Z, a multiface digit 1–6,
  -- or 0 for a blank tile) of length n². The FE expands faces for display.
  board text not null,
  n int not null check (n between 4 and 6),
  -- Denormalized setup bits the submit RPC needs (rest of setup lives in
  -- common.games.setup): the minimum length a guess must reach, and the
  -- difficulty band for LEGAL (bonus) guesses. A typed word counts as a bonus
  -- when it's in common.words at difficulty <= legal_band — with NO
  -- dialect/slur/crude/slang filter (legal words filter on difficulty ONLY).
  -- Distinct from the *required* band: required words are the clean,
  -- difficulty<=band words the board generator guarantees are findable; the
  -- legal band is the (usually wider) net of what else a player may discover.
  min_word_length int not null,
  -- The bonus difficulty ceiling this board was enumerated against (band..6).
  -- Retained for reference; the bonus words it produced are stored below, so
  -- submit_word no longer needs it at guess time.
  legal_band int not null check (legal_band between 1 and 6),
  -- The two word lists shipped to the FE, both jsonb arrays of
  -- { "word": text, "points": int }. READABLE by club members (not hidden) — the
  -- FE validates + scores guesses against required ∪ bonus locally.
  --   required_words: the set the board is judged against (constraints, the
  --     "X / Y words" goal, and the missed-words reveal — reveal is required-only).
  --   bonus_words: legal-band words traceable on this board but outside the
  --     required set (enumerated once at build time by boggle-build-board). Empty
  --     when legal_band == band.
  required_words jsonb not null,
  bonus_words jsonb not null default '[]'::jsonb,
  required_words_count int not null,
  required_words_score int not null,
  -- Win-on-target: the percent of `required_words_score` a player (compete) or
  -- the team (coop) must reach to WIN — 50..100 — or NULL for "no target" (the
  -- game only ends on manual End / timer). Denormalized from setup so submit_word
  -- can check the threshold without re-reading common.games.setup. The %5 step is
  -- a create_game / FE concern; the column just bounds the range.
  win_percent int check (win_percent is null or win_percent between 50 and 100),
  created_at timestamptz not null default now()
);

create index boggle_games_club_handle_idx on boggle.games (club_handle);

-- ============================================================
-- boggle.found_words — append-only log of accepted submissions.
-- ============================================================
-- PK (game_id, user_id, word): coop dedups on (game_id, word) so the team
-- finds each word once; compete dedups on (game_id, user_id, word) so two
-- players can independently claim the same word. The branching is in
-- submit_word; the PK supports both.
create table boggle.found_words (
  game_id  uuid not null references boggle.games(id) on delete cascade,
  user_id  uuid not null references common.profiles(user_id) on delete cascade,
  word     text not null,
  points   int not null,
  is_bonus boolean not null,        -- legal but outside the required set; shown with a dot
  found_at timestamptz not null default now(),
  primary key (game_id, user_id, word)
);

create index boggle_found_words_game_id_idx on boggle.found_words (game_id);

-- ============================================================
-- RLS
-- ============================================================
alter table boggle.games enable row level security;
alter table boggle.found_words enable row level security;

-- No INSERT/UPDATE/DELETE policies — writes go through the security-definer
-- RPCs below.

-- ============================================================
-- Gametype registration + realtime
-- ============================================================
insert into common.gametypes (gametype, min_players) values
  ('boggle_coop', 1),
  ('boggle_compete', 2)
on conflict do nothing;

alter publication supabase_realtime add table boggle.games;
alter publication supabase_realtime add table boggle.found_words;
