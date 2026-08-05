-- ============================================================
-- letterboxed — NYT-Letter-Boxed-style word chaining (SnakeBox)
-- ============================================================
--
-- TWELVE distinct letters, three on each side of a square. A word may
-- use board letters only; NO TWO CONSECUTIVE LETTERS MAY COME FROM THE
-- SAME SIDE (every step crosses the box); and each word after the first
-- STARTS WITH THE PREVIOUS WORD'S LAST LETTER. Letters may be reused
-- freely, within a word and across words. You win by touching all
-- twelve letters within the game's word cap.
--
-- Two consequences of those rules shape this whole file:
--
--   1. A word with a DOUBLED LETTER ('bell', 'coffee') is two
--      consecutive letters on the same side by definition, so it is
--      unplayable on EVERY possible board — 24% of common.words. The
--      seed importer drops them at load; the board builder's adjacency
--      filter would drop them again, but doing it once up front is what
--      keeps the seed search honest.
--   2. Game state is ONE CHAIN OF WORDS and nothing else. Used letters
--      are the union, the next word's required first letter is the last
--      chain word's last letter, and the score is the chain's length.
--
-- "letterboxed" is the codename; the brand is SnakeBox (FE only). SQL /
-- TypeScript / folder names are all `letterboxed`.
--
-- Coop + compete ship as a sibling-manifest pair (`letterboxed_coop` +
-- `letterboxed_compete` gametypes, a denormalized `mode` column on
-- letterboxed.games, and a `mode` arg on create_game) — the pattern
-- psychicnum, connections and wordwheel follow.
--
-- Depends on `common` (clubs, profiles, games, game_players,
-- is_club_member, gametypes, create_game, update_state, end_game,
-- require_club_member, require_game_player, require_player_count_max,
-- require_valid_timer, word_letter_mask). Per the removability
-- invariant in docs/common.md, common MUST NOT reference letterboxed
-- back.
--
-- This file is SHAPE only (tables, constraints, indexes, the Realtime
-- publication, gametype registration). Behavior — the RPCs, views,
-- policies and grants — lives in supabase/sql/letterboxed.sql and is
-- re-applied in full on every deploy. See CLAUDE.md → Where a SQL
-- change goes.
--
-- See docs/letterboxed-plan.md (working) → docs/games/letterboxed.md.

create schema if not exists letterboxed;

-- ============================================================
-- letterboxed.seeds — the board-seed pool
-- ============================================================
-- A board must be KNOWN SOLVABLE, and the only affordable way to know
-- that is to build it backwards from a solution. A seed is a chained
-- word PAIR — last(word_a) = first(word_b) — whose letters union to
-- exactly twelve distinct letters. Any such pair IS a solvable board,
-- because the builder then partitions those twelve into four sides in a
-- way that keeps both words playable (see supabase/functions/
-- letterboxed-build-board).
--
-- Every row here is PARTITIONABLE BY CONSTRUCTION. About 0.2% of
-- otherwise-valid pairs are not — a long word can leave one letter
-- adjacent to so many others that no side is free for it
-- ('paradigmatic' gives its repeated 'a' six distinct neighbours) — and
-- the importer proves the partition exists before storing the row, by
-- exhaustive backtracking. So the builder never needs a fallback, and
-- it stays free to roll a DIFFERENT random partition each game: a
-- partition that exists at all exists under every ordering.
--
-- WHY NOT SEARCH AT RUNTIME: finding such a pair means, for each
-- joining letter L, testing every word ending in L against every word
-- starting with L — about 10^8 pairs for a common letter, ~780M in
-- total. That is an 18-second offline scan, not a per-game one.
--
-- WHY NOT A WHOLE-PUZZLE LIBRARY (the connections / stackdown / strands
-- shape): the expensive half is finding the pair, but the PARTITION —
-- which of the four sides each letter lands on — is cheap and is what
-- makes a puzzle feel different. One seed yields many genuinely
-- distinct boards, so we store the reusable half and re-partition per
-- game. Same division wordwheel.pangrams makes.
--
-- `letters` (the twelve SORTED, e.g. 'acdegilmnort') is the PK: a board
-- is a SET, not a multiset — Letter Boxed never repeats a letter — so
-- unlike wordwheel.pangrams the sorted string and the bitmask are
-- equivalent keys, and the string is the readable one. `mask` is kept
-- as a generated column anyway because the board builder's
-- "which words fit this board" query is a bitwise subset test
-- (`w.letter_mask & ~mask = 0`) against common.words.letter_mask.
--
-- `difficulty` is the band of the EASIEST solving pair for these twelve
-- letters — max(band of word_a, band of word_b), minimized across every
-- pair that produces this set. It is NOT a player-facing knob: the
-- importer keeps only band <= 2 seeds, so the guaranteed two-word
-- solution is always two words a person might actually think of. That
-- is spellingbee's rule (it forces a band-1 pangram so the board's own
-- target is gettable), and it leaves `legal_band` on the game as the
-- only band players choose. See docs/letterboxed-plan.md §8.
create table letterboxed.seeds (
  -- The twelve distinct letters, sorted — the canonical board key.
  -- char(12) is a width assertion: a wrong-length string raises at
  -- insert time rather than producing a silently malformed board.
  letters    char(12) primary key,
  -- Distinct-letter set of `letters`, for the builder's subset query.
  -- Generated, so it can never drift from the key; same helper that
  -- powers common.words.letter_mask, so the bit convention matches.
  mask       bigint generated always as (common.word_letter_mask(letters)) stored,
  -- The chained pair that solves this board: last(word_a) =
  -- first(word_b), and their letters union to exactly `letters`.
  -- Revealed at terminal ("solvable in 2: DEMOTIC, CRAVING") — not
  -- hidden mid-game by any grant, because the board's full playable
  -- word list ships to the FE anyway (see letterboxed.games below), so
  -- a column gate here would guard nothing.
  word_a     text not null,
  word_b     text not null,
  -- Band of the easiest pair producing these letters (1..6).
  difficulty int not null check (difficulty between 1 and 6)
);

create index letterboxed_seeds_difficulty_idx on letterboxed.seeds (difficulty);

-- ============================================================
-- letterboxed.games — one row per playthrough
-- ============================================================
-- `id` is FK to `common.games(id)` — the canonical id is generated by
-- `common.create_game` and passed in. ON DELETE CASCADE means a row
-- here goes away if its common.games parent is deleted.
--
-- club_handle is denormalized from common.games.club_handle so the RLS
-- policy can `is_club_member(club_handle)` without a join. Safe —
-- club_handle is set at create-game time and never changes.
--
-- `mode` is the sibling-manifest mode axis, denormalized onto the
-- gametype row so submit_word / undo_word / end_game and the players
-- RLS policy can read it with a single-table query instead of digging
-- into common.games.setup.
--
-- ───────────────────────────────────────────────────────────
-- There is no `par` column, and that is deliberate
-- ───────────────────────────────────────────────────────────
-- Every board this pipeline can produce has par exactly 2. The builder
-- partitions the twelve letters SO THAT both seed words stay playable,
-- and the importer keeps only seeds whose pair is legal at any band a
-- game can pick — so the chain word_a → word_b is always a two-word
-- solution, and par cannot exceed 2. (It cannot go below 2 either,
-- except on a board whose twelve letters spell a single word; the
-- builder rejects those.) A measured 2000-board sample came back par-2
-- 2000 times. So the cap is a number the players choose, not `par +
-- extra` — see docs/letterboxed-plan.md §9.1.
create table letterboxed.games (
  id uuid primary key references common.games(id) on delete cascade,
  club_handle text not null references common.clubs(handle) on delete cascade,

  -- The board: twelve lowercase letters in SIDE ORDER — positions 1-3
  -- are one side, 4-6 the next, 7-9 the next, 10-12 the last. So the
  -- side of the letter at position p is (p - 1) / 3, and two letters
  -- are on the same side iff those quotients match. Storing the
  -- partition IN the string (rather than as a separate jsonb of four
  -- arrays) keeps the board one value that cannot be internally
  -- inconsistent, and char(12) asserts the width.
  sides char(12) not null,

  -- Every word playable on this board, computed once at create time by
  -- the board builder: the words of common.words (at `legal_band`,
  -- clean, len >= 3) whose letters all appear on the board AND whose
  -- consecutive letters never share a side.
  --
  -- IT SHIPS TO THE FE, and that is the point. The FE's hint runs a
  -- breadth-first search over (letters-used, tail-letter) against this
  -- list to suggest a word ON A SHORTEST PATH to covering all twelve —
  -- ~40 lines of TypeScript. The alternative was that same search in
  -- plpgsql, which is the most complex SQL in the repo for one button.
  -- Nothing is hidden by a column grant: per CLAUDE.md's trust model
  -- these are friends, not adversaries. A jsonb array of strings.
  playable_words jsonb not null,

  -- The seeded two-word solution, copied from letterboxed.seeds so the
  -- board stays self-contained (a seed row could later be re-imported
  -- away). Shown at terminal. The FE could derive A solution from
  -- playable_words, but this is the GETTABLE one — band <= 2 by
  -- construction, where a search would happily return two obscurities.
  solution text[] not null check (cardinality(solution) = 2),

  -- The chain-length cap: cover all twelve letters in at most this many
  -- words. A direct setup choice (wordle's guess-budget field), NOT a
  -- derived par + slack — see the note above.
  max_words int not null check (max_words between 2 and 7),

  -- common.words difficulty ceiling for words this board ACCEPTS, and
  -- the band that built playable_words. NOTE THE DIRECTION: a HIGHER
  -- band makes letterboxed EASIER, because more legal words means more
  -- escape routes off an awkward tail letter. (Median playable words
  -- per board runs 280 → 850 across bands 1 → 5.) That is the same
  -- inversion strands' band has, and it is the mistake a reader makes.
  legal_band int not null check (legal_band between 1 and 6),

  created_at timestamptz not null default now(),

  -- Sibling-manifest mode axis. The gametype string
  -- ('letterboxed_coop' / 'letterboxed_compete') and this column agree
  -- by construction in create_game.
  mode text not null check (mode in ('coop', 'compete'))
);

create index letterboxed_games_club_handle_idx on letterboxed.games (club_handle);

-- ============================================================
-- letterboxed.players — the chain, per player, in both modes
-- ============================================================
-- One row per (game, player), created at create_game.
--
-- ONE SHAPE FOR BOTH MODES, and in coop the rows move in LOCK-STEP: a
-- word played by anyone lands on every row, so each player's row always
-- equals the shared chain. In compete only the actor's row moves. This
-- is exactly what strands does with its hint economy, and for the same
-- payoff — the mode difference collapses to one clause in a WHERE
-- (`and user_id = caller` in compete, omitted in coop) instead of two
-- tables and two code paths, and the FE always just reads its own row.
--
-- `chain` is MATERIALIZED rather than folded out of letterboxed.events
-- on demand. The fold is real work (a `played` is appended, an `undone`
-- pops the last survivor, a `cleared` empties the list), and every
-- submit needs only its LAST element — the letter the next word must
-- start with. Keeping the answer costs one array write per move and
-- saves reconstructing the whole history to validate a single guess.
-- events stays the source of truth for the LOG; this is the cache the
-- rules read.
create table letterboxed.players (
  game_id uuid not null references letterboxed.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,

  -- The words played so far, in order. tail = chain[cardinality(chain)];
  -- letters covered = the union of every element's letters; words used =
  -- cardinality(chain), which is what `max_words` caps.
  chain text[] not null default '{}',

  -- Hints cashed. COOP ONLY — hints are disabled in compete, where
  -- "first to meet the bar wins" would make an optimal suggestion a
  -- win button. Shown, never penalized. See docs/letterboxed-plan.md §6.
  hints_used int not null default 0 check (hints_used >= 0),

  -- Covering all twelve within max_words. In compete this ends the race
  -- (first past the bar wins outright), so at most one row is ever
  -- true; in coop it goes true on every row at once.
  solved boolean not null default false,
  solved_at timestamptz,

  primary key (game_id, user_id)
);

create index letterboxed_players_game_id_idx on letterboxed.players (game_id);

-- ============================================================
-- letterboxed.events — the append-only game log
-- ============================================================
-- Every move that happened, in order, including the retreats. A chain
-- can DEAD-END — the tail letter may have no playable continuation — so
-- undo is a first-class move rather than an error path, and logging it
-- (instead of deleting the played row) is what lets the turn log show
-- the retreat and lets the history viewer stay a FOLD over events
-- rather than a reconstruction. Same call strands makes, and the reason
-- its table is `events` and not `guesses`.
--
-- `id` is an identity bigint, not a uuid, because ORDER IS THE STATE
-- here: replaying the log in id order must reproduce the chain exactly,
-- and two words appended in the same millisecond of free-for-all coop
-- must still have a defined winner. (submit_word additionally takes a
-- row lock on the game so concurrent appends can't both build off the
-- same tail.)
create table letterboxed.events (
  id bigint generated always as identity primary key,
  game_id uuid not null references letterboxed.games(id) on delete cascade,
  user_id uuid not null references common.profiles(user_id) on delete cascade,

  -- played  — a word appended to the chain
  -- undone  — the last word taken back (in turn-coop this COSTS the
  --           undoer's turn, which is what stops it being a free reroll)
  -- cleared — the whole chain abandoned; not offered in turn-coop,
  --           where repeated undo already reaches empty one turn at a
  --           time and pricing a bulk clear at one turn would invert
  --           the cost of undoing a single word
  -- hint    — a suggestion cashed: the word's SHAPE, not the word (coop only)
  -- spoiler — the word itself handed over (coop only)
  --
  -- Two kinds, not one, because the log is the only record of help taken and
  -- "I was told it starts with DE" and "I was told the word" are different
  -- admissions. Both are coop-only: in compete, first past the bar wins, so
  -- either would be a win button.
  kind text not null check (kind in ('played', 'undone', 'cleared', 'hint', 'spoiler')),

  -- The word played, taken back, suggested, or spoiled. NULL for `cleared`,
  -- which is about the whole chain rather than any one word.
  word text,

  -- How many of the twelve letters the chain covered AFTER this event.
  -- Derivable from the chain, but stored because the turn log shows it
  -- on every line ("TRACE — +3 letters (5 left)") and compete's
  -- timeout resolution ranks on exactly this number.
  letters_covered int not null check (letters_covered between 0 and 12),

  created_at timestamptz not null default now()
);

create index letterboxed_events_game_id_idx on letterboxed.events (game_id, id);

-- ============================================================
-- RLS
-- ============================================================
-- Policies live in supabase/sql/letterboxed.sql (behavior, re-applied
-- every deploy); enabling RLS is shape and belongs here. Enabling it
-- with no policy denies everything, so the two files must ship
-- together — which they do, since a deploy applies both.

alter table letterboxed.seeds enable row level security;
alter table letterboxed.games enable row level security;
alter table letterboxed.players enable row level security;
alter table letterboxed.events enable row level security;

-- ============================================================
-- Realtime publication
-- ============================================================
-- ALL THREE play tables are published, and all three must be — useGame
-- subscribes to postgres_changes on each:
--   - players carries the live chain: every accepted word rewrites the
--     row(s) peers refetch on. Its UPDATE is also what announces a
--     replay_board (the replay's events DELETEs alone would not:
--     postgres_changes filters don't reliably match deletes).
--   - events is the turn log, appended on every move.
--   - games never changes mid-play; its binding is quiet today and kept
--     so any future write to it wakes clients rather than silently not.
--
-- Publishing games is NOT optional cleanup: Realtime authorizes a
-- channel's postgres_changes bindings at JOIN time and rejects the
-- WHOLE subscription if ANY bound table is missing from the
-- publication. So one unpublished table kills live delivery for the
-- others too — silently, since writes still persist and a manual
-- refresh shows them. All three memberships are guarded centrally in
-- tests/common/realtime_publication_test.sql (the registry-driven
-- guard for every schema's subscribed tables).

alter publication supabase_realtime add table letterboxed.games;
alter publication supabase_realtime add table letterboxed.players;
alter publication supabase_realtime add table letterboxed.events;

-- ============================================================
-- Register letterboxed with common.gametypes
-- ============================================================
-- Sibling-manifest pair: coop and compete are two distinct gametype
-- rows sharing this one schema. create_club seeds new clubs with both;
-- create_game routes to one via the mode arg.

-- `hides_solution`: this game keeps its seeded pair covered when a game
-- ends without a win, so a replay of the same board is a genuine second
-- try. Without it the answer lands on screen the moment anyone stops the
-- game, and the post-mortem — "what were you going to play next?" — is
-- over before it starts. The players open it with the terminal Reveal
-- (common.reveal_solution). See common.md → Revealing the solution.
insert into common.gametypes (gametype, min_players, hides_solution) values
  ('letterboxed_coop', 1, true),
  ('letterboxed_compete', 2, true)
on conflict do nothing;
