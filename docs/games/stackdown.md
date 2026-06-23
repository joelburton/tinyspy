# StackDown (codename `stackdown`)

A mahjong-style word game. Thirty letter tiles are stacked so only "exposed"
tiles are selectable; the player clears the board by finding six 5-letter
words in sequence, each found word permanently removing its tiles and exposing
the ones beneath.

> **Brand = codename here.** User-facing name is **StackDown**; the identifier
> everywhere in code / DB / schema is `stackdown`. (Unlike SyrupSwap/`waffle`
> and WordNerd/`wordle`, the two happen to be the same word — only the casing
> differs.)

StackDown is a **coop / compete sibling pair** like the other multiplayer
games (`stackdown_coop`, `stackdown_compete`), and inherits the shared chrome
— timer (or none), chat, presence-pause, manual "End game" — through
`<GamePage>` + `useCommonGame`.

---

## 1. Rules

- The board holds **30 tiles** on a fixed geometry with a covering (stacking)
  relationship. A tile is **exposed** (selectable) iff no remaining tile covers
  it. Every tile's letter is visible from the start — there is no hidden board;
  the puzzle is figuring out the words, not uncovering letters.
- You build a word by clicking exposed tiles **one at a time, in order**. Each
  clicked tile is **removed at the moment of selection** (it leaves the board
  and joins the word-in-progress strip below), which may **expose** tiles it was
  covering — those become available for the *same* word, later in the sequence.
- **The word is the selection sequence.** Letters are read off in click order.
  This is the rule that matters: because a tile can only be reached once its
  coverers are gone, the order tiles can be reached constrains which words are
  spellable — even among anagrams (you can spell `BROAD` but not `BOARD` if the
  `A` only frees up after its covering `R` is removed). See §2.3.
- When five clicked tiles spell a word **in the lexicon**, the word is accepted:
  those five tiles are removed **permanently** and the word is logged. Play
  continues with the next word.
- A five-letter sequence that is **not** in the lexicon is rejected — the tiles
  **return to their original board positions** and "invalid word" is logged. You
  can try again.
- A word in progress can be **abandoned** before completion: clicking a tile in
  the word-in-progress strip returns it *and every tile selected after it* to
  the board (in their correct positions). Only a **completed, accepted** word is
  irreversible.
- The board is solved when all 30 tiles are cleared as **six** accepted words.

### Coop vs compete

- **Coop** — one **shared** board. Any player can click; the in-progress
  selection is shared live (the wordknit peer-selection pattern) so everyone
  watches the same word form. A word accepted by anyone advances the shared
  board. The team wins when all six words are found; the countdown expiring (if
  a timer is set) is a shared loss.
- **Compete** — every player gets the **same starting board** but plays it
  **independently**. You see nothing of opponents except their running tally —
  `Found words: Joel 2 · Moth 1`. It's a **race**: the **first** player to clear
  all six words wins immediately; if the timer expires with no winner, everyone
  loses.

---

## 2. Board model

### 2.1 Geometry (fixed)

An integer 9×9 grid: each tile occupies a cell `(x, y, z)` (`z = 0` base, higher
= raised). Neighbouring tiles are two cells apart; a raised tile sits one
diagonal step from each base tile it rests on. **Positions and the covering DAG
are a constant** — the same physical shape every puzzle (like the reference
board). Only the *letters* vary between boards. This shrinks generation to a
letter-assignment problem on a fixed DAG.

### 2.2 Covering rule

Tile **A covers B** iff `A.z > B.z` **and** `|A.x − B.x| ≤ 1 && |A.y − B.y| ≤ 1`
(the `≤ 1`, not `< 1`, is because the integer layout places overlapping tiles
exactly one cell apart diagonally). A tile is **exposed** iff no *remaining* tile
covers it. The covering relation is a DAG; exposed tiles are its sources among
the remaining tiles.

### 2.3 Sequence-as-word (the correctness crux)

A candidate word must be read off the **ordered sequence** of clicks, never the
multiset of tiles. Anagrams like `BROAD`/`BOARD` share a tile multiset but the
reveal mechanic gates *which orders are physically achievable*. A validator that
checks "do five reachable tiles anagram to a legal word?" is **wrong** — it
would accept `BOARD`. Read the word off the order.

### 2.4 The hard constraint — uniqueness *and* no traps

There is no undo once a word is *completed*, so the board must never let a
player paint themselves into a corner. The naive invariant (from the original
spec) was:

> At the start of each round, the set of words obtainable as a valid selection
> *sequence* must be exactly `{ Wi }`.

**That is necessary but NOT sufficient**, and we have the regression to prove
it. A board can satisfy it and still be unsolvable: with duplicate letters a
word has multiple tile-completions, and one completion can consume a tile a
later word needs. Real example from a generated board — after the first three
words, `BROOK` had **three** completions; only one removed the `O` whose
departure exposed `LOUSE`'s `L`. The other two stole `LOUSE`'s own `O`, leaving
the board unsolvable — even though `BROOK` was the *only reachable word*.

The invariant we actually enforce (`strictValidate`):

> At each round the only completable lexicon-word is `Wi`, **AND every
> tile-sequence that spells `Wi` leaves a board that is itself strictly valid
> for the remaining words.**

Because completed words can't be returned, *all* completions must stay solvable.
This is checked by enumerating every spelling of `Wi` and recursing (memoized on
the remaining-tile set). The lesson worth carrying: **uniqueness-of-word ≠
no-traps**; validate against *all* completions, not one.

### 2.5 One lexicon, pinned

A single word list serves as both the solution dictionary and the set of
accepted words — currently the **Wordle answer list (~2,314 words)** (this may
become configurable later; no UI for that now). The same list must be used for
**generation and runtime validation**: validating against a larger list reports
phantom forks (rejects good boards), a smaller one misses real forks. So the
runtime word-acceptance check and the generator's lexicon are the same pinned
set (`common.words`, the Wordle-answer slice).

---

## 3. Pre-generated boards (our decision)

**Boards are pre-generated offline and stored in a library table; games claim a
board from it. We are not generating live.**

Why: a board on the fixed geometry is just 30 letters + 6 words — a few hundred
bytes — so a library of thousands is a tiny table and, for a friends group,
effectively infinite (you'd never see a repeat). Live generation that's reliably
fast (~0.5 s) would need the constructive **repair loop** (relabel/swap the
offending tile and re-validate from that round, instead of restarting) — the
spec's deferred hard problem, made harder by strict validation, and the most
complex code in the project. The benefit over a big static library is ~nil, so
it isn't worth that complexity.

Generation throughput is fine for offline use: ~10 s/board under strict
validation (the strict check lowered the accept rate vs. the old weak one). An
overnight or lunch-hour run produces a year's worth. The generator is an import
script (like `words:import` / `wordknit:import`) that fills `stackdown.boards`.

---

## 4. Board-construction algorithm (strategy)

Do **not** generate random boards and test them — the strict invariant makes the
accept rate vanishingly small. Generate **constructively**, then validate:

1. **Fix the geometry** (§2.1). Only letters vary.
2. **Reverse construction** (guarantees a solution exists). Pick six target
   words `W1…W6`. Take a random topological removal order of all 30 tiles, chop
   it into six consecutive groups of five (group *i* ↔ `Wi`). Because the
   grouping respects a removal order, "play `W1`, then `W2`, …" is always
   physically legal — solvability is free.
3. **Letter assignment** (the genuinely hard step, deferred-smart). For each
   group, find a bijection (letter → tile) such that *some* reveal-respecting
   order of those tiles spells `Wi`. The current approach brute-forces the 5!
   permutations per group and keeps the first spellable one — adequate at this
   scale, explicitly a placeholder for a smarter constructive assignment.
4. **Strict validation** (§2.4). Replay forward; accept only if every round has
   `Wi` as its sole completable word **and** every completion of `Wi` leaves a
   strictly-valid remainder. Reject otherwise and try a fresh order/word-set.
5. **Word selection.** Bias toward six-word sets with low duplicate-letter
   overlap — fewer shared letters → fewer accidental forks/traps → higher accept
   rate and fairer puzzles.

Practical shape: an outer loop over random word-sets, an inner loop over random
topo-orders + assignment, accepting on the first strictly-valid board (~half of
random word-sets yield one; the rest are skipped after a bounded attempt cap).

A **prototype** validated all of this — the model, the sequence-aware validator
(BROAD-yes/BOARD-no), the generator, and a click-to-remove UI — living outside
git in `stackdown-proto/` (gitignored, like `monkeygram-ui/`).

---

## 5. Schema / RPCs / FE

*(Pending — see the build plan. This section will be filled in like the other
game docs once the design is approved: the `stackdown` schema with the board
library + per-game/per-player tables, the `submit_word` / `submit_timeout` /
`end_game` RPCs, the FE PlayArea + board/word-entry/found-words components, and
the pgTAP + Vitest tests.)*
