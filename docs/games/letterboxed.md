# letterboxed (SnakeBox)

A NYT-Letter-Boxed-style word chainer: **twelve distinct letters, three on each
side of a square**. A word uses board letters only, and **no two consecutive
letters may come from the same side** — every step crosses the box. Every word
after the first **starts with the previous word's last letter**. Letters may be
reused freely, within a word and across words. You win by **touching all twelve
letters within the game's word cap**.

"letterboxed" is the codename (as "codenamesduet" is for Codenames Duet). The
user-facing brand is **SnakeBox**, which lives only in the manifest's `BRAND`
const; gametype / schema / folder are all `letterboxed`.

**Sibling pair** — `letterboxed_coop` + `letterboxed_compete`, one schema, one
folder, mode branching at render time on `gd.mode`. See
[Modes](#9-modes-coop--compete).

For the shared layer see [`common.md`](../common.md); for play-surface
conventions [`playarea.md`](../playarea.md).

---

## 1. The structural facts everything hangs off

1. **The board is tiny and immutable.** Twelve letters plus a side partition.
   Nothing mutates — letters get *marked covered*, they never leave.
2. **Game state is one chain of words.** Everything else derives from it:
   letters covered = the union of every word's letters, the next word's required
   first letter = the last word's last letter, words used = the chain's length.
   There is no other state.
3. **A word with a doubled letter is unplayable on every possible board** —
   `bell` puts two consecutive letters on the same side by definition. That's
   **24% of the dictionary** (65,239 of 270,014 clean words), filtered once at
   seed-pool load and again in `candidate_words`.
4. **The complete playable word set is computable at build time** — the indexed
   subset test spellingbee runs (`letter_mask & ~board_mask = 0`) plus the
   side-adjacency walk. A few hundred to a few thousand words per board. This
   one fact is what makes the suggestion search, instant local validation, and
   the winnability guarantee nearly free.

Where it sits on the roster: the only game where a word's **last letter**
constrains the next move (a genuinely new verb), and the only one where **move
count is the score in coop too**, not just compete.

---

## 2. Par is structurally 2 — and the cap is par + slack

**Every board this pipeline can build has par exactly 2**, by construction: the
seed is a chained word pair whose letters union to exactly twelve, and the
builder partitions the letters so both words stay playable — so the chain
`word_a → word_b` is always a two-word solution (a 2000-board sample confirmed
it 2000 times). Par can't go *below* 2 either: the builder rejects boards
solvable in one word. So there is **no `par` column and no build-time solver** —
par is the constant `2`, written once on each side:
`letterboxed._n_par_words()`, which `create_game`'s cap and the blob's
`puzzle.nParWords` read, and `PAR` in
[`lib/board.ts`](../../src/letterboxed/lib/board.ts) for the setup form, before
there is a game, and the setup rows that read it back.

**A player-typed board doesn't change this** (§7). It proves par 2 by the same
route a rolled board guarantees it — the seed table is asked for the pair that
solves those twelve letters, and that pair is checked against the partition as
typed — so a board whose par would be anything else never starts. That's what
keeps the constant a constant, and it's the reason the typed-board feature
recovers a solution rather than trusting the player for one.

**The cap is waffle-style `par + extra`:** setup asks for **`extra_words`
(0..5, default 3)** — how many words *above par* the chain may run to — and
`create_game` stores it resolved as `max_words = 2 + extra_words`. It's
expressed as slack rather than a bare integer because slack is the number
players can reason about: "solve it in 5" says nothing on its own, while "par is
2, you get 3 spare" says exactly how much room there is. The info column and the
setup rows both quote it against par for the same reason.

**The cap is a shape constraint, not a bustable budget.** Undo **refunds**
against it (§5), so you can't lose by exhausting it — your chain may simply
never exceed N words. That's faithful to NYT (solo Letter Boxed has no fail
state; the satisfaction is beating par), and it's why compete's bar is "first to
cover the twelve *within* the cap" rather than "fewest words" — a freely
resettable chain makes any fewest-X metric grindable, and the equilibrium would
be everyone sitting at par with the win going to whoever waited longest.

The cap applies to **both** modes, so the two siblings teach one constraint.

---

## 3. Architecture — server-authoritative moves, an open word list, withheld compete chains

Three different trust postures coexist here, each for its own reason:

- **Moves are server-authoritative** — NOT trusting-commit like the shipped-list
  word games. `submit_word` re-validates everything and arbitrates append
  order, because chain order is real state and free-for-all coop races need an
  authority: two players submitting off the same tail must produce one winner
  and one clean "the chain moved on" rejection, not a corrupted chain. The RPC
  takes a row lock on the game to serialize appends.
- **The board's word list ships to the page openly** (`gd.puzzle.words`). Per
  CLAUDE.md's trust model this costs nothing (friends, not adversaries), and it
  buys a lot: the suggestion search is ~40 lines of unit-testable TypeScript
  instead of the most complex plpgsql in the repo (§6), and the FE can refuse a
  bad word instantly. **The seeded pair arrives when the game ends** — the
  builder writes `puzzle.solution` null until then — and even then stays
  covered until a player presses Reveal, a local, reversible display toggle
  (docs/ui.md → Terminal results) that is **never automatic, a win included**.
  Winning is covering the twelve with *any* chain inside the cap, so unlike
  waffle (the solved grid is the answer) or wordle (you typed the target) a win
  does **not** put the seeded pair on screen. The pair is stored because it's
  the *gettable* solution (band ≤ 2 by construction), not because it's secret:
  any two-word solution is one BFS away from the word list.
- **A compete rival's chain is withheld mid-race.** A rival may see how *many*
  words you've played and how much you've covered — never which words, until
  the race ends. That is `useGame`'s seat rule over the page blob (§4 → The
  page blobs); the column grant on `letterboxed.players` omits `chain`, so no
  client read reaches it either.

The division of labor is wordwheel/spellingbee's: **the edge fn thinks, plpgsql
books, the FE interacts** — `submit_word` needs only array membership plus a
tail check, because the builder computed the playable set once at create time.

---

## 4. Schema — `letterboxed.*`

Two files, per [Schema vs code](../supabase.md#schema-vs-code):
`supabase/migrations/20260805000000_letterboxed.sql` (shape, applied once) and
`supabase/sql/letterboxed.sql` (functions/views/policies/grants, re-applied
every deploy).

| table | purpose |
|---|---|
| `seeds` | The board-seed pool (§7): a chained word **pair** — `last(word_a) = first(word_b)` — whose letters union to exactly twelve. PK is the twelve letters **sorted** (`char(12)`; the board is a set, never a multiset, so the sorted string and the bitmask are equivalent keys and the string is the readable one); `mask` is a generated column for the builder's subset query. `difficulty` is the band of the easiest solving pair; **the importer keeps only band ≤ 2 seeds**, so the guaranteed solution is always two words a person might think of. Every stored row is **partitionable by construction** (§7). |
| `games` | One row per playthrough. `sides` is the twelve letters **in side order** — positions 1–3 one side, 4–6 the next, and so on — so the partition lives *in* the string and can't drift from it. `words` (jsonb) is every word that can be played on this board — in the dictionary at `legal_band`, made of the board's letters, never two in a row from one side — computed once by the builder, whose board carries it under the same name, and shipped to the page. `solution` is the seeded pair, copied on so the board stays self-contained if the seed table is re-imported. `max_words` (2..10, resolved from `extra_words`) and `legal_band`; the mode and the club are `common.games`'. |
| `players` | One row per (game, player), **one shape for both modes**: coop moves every row in lock-step (each player's row always equals the shared chain), compete moves only the actor's — the mode difference collapses to one WHERE clause (strands' pattern). `chain` is **materialized** rather than folded from events on demand: every submit needs only its last element, so keeping the answer costs one array write per move; `events` stays the source of truth for the *log*, this is the cache the rules read. Plus `hints_used`, a tally of both rungs together that nothing reads: the page blob counts hints and spoilers apart, off the log. A solve is `common.game_players.solved_at`. |
| `events` | The append-only game log, kinds `word` / `undo` / `clear` / `hint` / `spoiler`, with `took_turn` true on the three moves and false on the two asks. A chain can dead-end, so **undo is a first-class move, not an error path** — logging retreats (instead of deleting rows) is what lets the event log show them and keeps the history viewer a fold (§8). `id` is an identity bigint because **order is the state**: replaying the log in id order must reproduce the chain exactly. Each row stores `n_covered_letters` *after* the event — derivable, but the log prints it on every line and compete's timeout ranks on exactly that number. |

### RLS

Every table needs only the membership gate (`games_select`, `players_select`,
`events_select`, through `common._is_club_member`), and the column grant hides
`players.chain`. What a racer may see of a rival mid-race is the page's rule —
`makeGameData`'s seat rule over `game_data`, below — and nothing reads the
tables from the client. No INSERT/UPDATE/DELETE policies — writes go through
the security-definer RPCs. All three tables stay in `supabase_realtime`, pinned
centrally by `supabase/tests/common/realtime_publication_test.sql`.

### The page blobs

`letterboxed._rebuild_data_cols` writes them at create, at Restart and at the
end of every move, each assigned whole
([plans/seat-view.md](../../plans/seat-view.md) → The page is written, not
assembled): `shell_data` through `common._make_json_shell_data`, and on top of
the common part of `game_data` and `summary_data` this game's own.
`letterboxed._rebuild_data_cols_for_all()` rebuilds every letterboxed game
without re-dating it. `static_game_data`, what nothing after create changes, is
written once by `_write_static_game_data`, from `create_game` and that
rebuild, never by a move ([common-schema.md → Title, statuses and the two
dates](../common-schema.md#title-statuses-and-the-two-dates)); the hook merges
it into `game_data`, each key in its place.

| blob | letterboxed's part |
|---|---|
| `static_game_data` | `puzzle: {tiles, words, uncleanWords, nParWords}` — the box as twelve `{id, letter, side}` tiles in side order, each tile's id its letter; every word the board accepts, and the few of them a hint may not offer (§7 → The two word lists); par |
| `game_data` | `puzzle: {solution}`, the seeded pair, null until the game ends. `team: {nWordsUsed, nCoveredLetters}`, the shared chain's, null in compete. `events`, every row `{id, userId, kind, word, nCoveredLetters, tookTurn, at}`. On each player `maxWords`, their own `nHintsUsed` and `nSpoilersUsed`, and `board: {words}` — their chain, the one shared chain on every seat in coop — and, on a racer only, that chain's `nWordsUsed` and `nCoveredLetters` |
| `summary_data` | `team`, as above; `maxWords`; `band` (`legal_band`); and compete's `nBestCoveredLetters` (the best chain so far), `nWinnerWords` (once a racer has solved) and `nWinnerCoveredLetters` (on a solve or a timeout) — null in coop |

**Coop's chain counts are the team's alone.** Words used and letters covered
describe the chain, not anything a player did, so in coop they live on `team`
and a coop player carries neither; a racer carries their own. Hints and spoilers
are things a player did, so they are on every player in both modes.

**The builder writes every chain and every row.** What a racer may not see yet —
a rival's chain and log rows mid-race — `useGame`'s seat rule withholds; their
two counts stay, the numbers a race publishes:

    coop                 →  shared, like the chain
    compete during play  →  your own rows only, and a rival's chain null
    compete once ended   →  everyone's, chains included

### How a game ends

The ending is `common.games`' reason, detail and outcome
([docs/win-lose.md](../win-lose.md)):

| mode | when | reason / detail | ranked |
|---|---|---|---|
| coop | all twelve covered | `reached_goal` / `solved` | everyone 1, won |
| coop | the timer | `timeout` | nobody — a loss |
| compete | the first to cover all twelve | `reached_goal` / `solved` | the solver alone; the race ends when decided |
| compete | the timer | `timeout` | by progress: each racer who didn't concede and covered anything, by letters covered then the shorter chain, ties sharing a rank |
| compete | every racer conceded | `conceded` | nobody — a loss |
| either | somebody pressed Stop | `stopped` | nobody — neutral |

---

## 5. RPCs

| RPC | job |
|---|---|
| `create_game(p_club_handle, p_setup, p_player_user_ids, p_mode, p_board)` | Validates setup (`extra_words` 0..8 → `max_words`, `legal_band` 1..6, timer, turn-coop seating) and the board — including the **winnability invariant**: the seeded pair must chain, cover all twelve, and both appear in the board's words, plus a ≥ 150-word richness floor. This is the only place that checks the game is solvable at all. Also cross-checks `setup.custom_sides` against `board.sides` when a board was typed (§7), and strips it from the club default. Title is the board itself, grouped by side: `"ABC-DEF-GHI-JKL"` — nothing on it is secret, so unlike wordle it never needs a re-sync, and the dashes are what make it a string you can paste straight back into the setup dialog. |
| `submit_word(p_game_id, p_word)` | The whole rulebook, in rejection order (each raise's wording is what the player reads): ≥ 3 letters → in the board's `words` (one membership test covers the dictionary, the board's letters AND the side rule) → cap not reached → not already in the chain → starts with the tail letter. Appends under the game row lock; covering all twelve **ends the game** (coop: everybody wins; compete: first past the bar wins outright). Answers its `result` alone (`accepted` / `solved`), as `undo_word` and `clear_chain` do: what the move did, the page reads from the blobs. Every chain move shares `_require_chain_move`: the row lock, a deleted game asked first, then membership, the ended game and a conceder. |
| `undo_word(p_game_id)` | Pops the last word and **refunds against the cap** (§2). In turn-by-turn coop it **costs the undoer's turn** — see the pricing below. |
| `clear_chain(p_game_id)` | Empties the chain (crosswords' "Clear board" hammer). Refused in turn-by-turn coop, and **has no FE surface at all** — see below. |
| `log_hint_or_spoiler(p_game_id, p_word_shown, p_kind)` | Records that a hint or a spoiler was taken (§6). The suggestion is computed on the FE; the server's only job is making the event log agree with what happened. Coop-only — refused in compete, where either rung is a win button. |
| `submit_timeout(p_game_id)` | Coop → a loss (one chain, it didn't reach twelve; nothing to rank). Compete → ranked by progress: **most letters covered → fewest words**, ties sharing a rank, so an exact tie at the top is two winners. Both ranking numbers were already public during the race, so the resolution reveals nothing new. |
| `stop_game(p_game_id)` | The neutral manual stop, through `common._stop`, in **both** modes — a group agreeing to stop is agreeing not to have a result. |
| `concede(p_game_id)` | Locks the row, then `common._concede` decides it — the generic helper is right here because letterboxed is **not** an elimination game (undo refunds, so the only way a non-conceded player stops racing is winning, which already ends the game). A conceder is out in both directions: the move RPCs refuse them, and the timeout ranking excludes them. It also refuses a coop caller (`common._require_compete`, PN484); the menu never offers Concede in coop. |
| `replay_board(p_game_id)` | The cheapest replay on the roster — the board is immutable data, so there's nothing to rebuild: clear the chains, the hint counts, `solved_at` and the log, and `_reset_game` clears the ending and rewinds the turn pointer. Nothing is re-revealed (no ending opens the pair by itself, so a replay is a genuine second try). |

**Every RPC ends by rebuilding the page blobs** (`_rebuild_data_cols`, §4) — a
word, an undo, a clear, a hint or a spoiler, and every ending.

### Undo and clear — the turn-coop pricing

The chain can **strand you**: the tail letter may have no playable continuation.
Undo is the escape, and its pricing is the mode design:

- **Free-for-all coop / compete:** undo freely (your own chain in compete).
- **Turn-by-turn coop: undo costs your turn.** A free undo makes the chain
  meaningless; no undo makes a dead end fatal; spending the turn prices it
  right. It also creates the mode's best dynamic — undoing doesn't help *you*,
  the **next** player inherits the improved position, so it reads as a
  sacrifice.
- **Clear is refused in turn-coop:** if both actions cost one turn, clearing
  four words is strictly cheaper per word than undoing one, inverting the
  pricing. Repeated undo already reaches the empty chain there, one turn at a
  time — the right speed; a group that genuinely needs to restart should feel
  it.

No deadlock risk: chain length decreases monotonically under undo, and turn-coop
never runs solo (`SetupCoopStyleSection` hides for one player).

**Nothing in the frontend calls `clear_chain`**, in either mode — the RPC exists
as part of the rulebook, but the only undo surface is the **× on the chain
strip's last word** (§8), and clicking it repeatedly walks the chain back to
empty, so a bulk clear would be a second way to do the same thing.
[`BoardCol.tsx`](../../src/letterboxed/components/BoardCol.tsx) says so at the
top.

---

## 6. Hints — two rungs, computed on the FE

**Coop only.** Under "first past the bar wins," an optimal suggestion is a
straight-up win button — whoever clicks fastest wins — so both rungs are
refused in compete, server-side too.

The search is [`lib/solve.ts`](../../src/letterboxed/lib/solve.ts) — **the whole
reason the playable list ships to the FE**. A position is fully described by
(letters covered, tail letter): 2¹² × 12 ≈ 49k states, walked exhaustively by a
BFS on every click, so the suggestion is genuinely optimal. It returns a next
word **on a shortest path to covering all twelve** within the remaining word
budget — among equal-length routes, the one covering the most new letters (the
greedier-looking move is the one a player would rather be shown). The same call
also answers with one of three refusals, and the pill says WHICH wall you hit:

| refusal | what happened | pill |
|---|---|---|
| **stuck** | No unplayed word starts with the tail letter — there's no legal move at all. Can't fire on an empty chain (no tail ⇒ every word opens). **Two sentences**, because "unplayed" is doing real work: if the chain already contains a G-word, the player can see one right there, so the pill says **"No other word starts with G"** — otherwise the bare form would read as a bug rather than as the no-repeats rule. | "No word starts with G" / "No **other** word starts with G" |
| **offPar** | A finish exists, but it's longer than the room left (`max_words − chain`). Naming its first word would walk the player into the cap, so the length is reported instead. The bar shrinks as you play: the same position is fine on move one and off par on move three. | "Best solution needs 2 words" |
| **unreachable** | Words follow, but no route from here ever covers all twelve — some letter is stranded from the tail. Nothing to do with the cap. (Bounded at 12 words by the BFS; sound in practice, since a useful word covers new ground.) | "No winning path from here" |

All three are **diagnosis only**. They used to end in "take a word back", which
is the remedy in every case and therefore worth no characters: the pill is
`nowrap` + ellipsis in a reserved-height slot, so the off-par sentence ran 74
characters and truncated mid-word on DESKTOP. The undo × is on the chain strip
either way.

### The answers (`lib/answer.ts`)

Every answer letterboxed gives, mine and a teammate's, is one of ten (`GAnswer`),
named in the move RPCs' own words, and `answerMessage(answer)` says how each
reads — its outcome and its words — and is the only place that does:

| answer | outcome | words |
|---|---|---|
| `accepted` | won | "ADG — 3 words left", restating the cap; a cap-filling word says nothing, since the chain-full note is what to read then |
| `accepted_peer` | won | "GJB (5/12)" — the word and the board covered |
| `solved` | won | none: the ending's message says it |
| `undone` | noted | none: the chain strip shows it |
| `undone_peer` | noted | "undid GJB", named, since the team's board just lost it |
| `cleared_peer` | noted | "cleared the chain" |
| `hint` | warning | "8 letters starting with DEM" |
| `hint_peer` | warning | "got a hint" |
| `spoiler` | lost | "DEMOTIC" — the word |
| `spoiler_peer` | lost | "revealed a word" |

**A played word is `won`**: landing a legal word on this board is the
achievement. **An undo and a clear are `noted`, not `neutral`**: they are news —
the chain is shorter than it was, and the player who did it is telling the
table so. A hint leaves you something to find, so it is amber; a spoiler IS the
word, so it is red.

Everything holding a log ROW asks the same file: `peerAnswerOf(row)` reads a
row's answer off its `kind`, and `eventToOutcome(row)` colors the log's bar.
The move RPCs' envelopes carry no outcome and no sentence — the frontend's
words are the only words — and both halves are tested: `lib/answer.test.ts`
pins every answer, `gameplay_test.sql` the nulls ([outcomes.md → How a game
does it](../outcomes.md#how-a-game-does-it)).

The frontend's own refusals are not answers: `rejectReason` turns a word away
before any RPC, and the hint ladder can find no word to offer — nothing is
written down, and the pill is the only surface (the board mark beside a refused
word is a shake, which carries no word).

Two rungs, the shared hint ladder ([ui.md → button
iconography](../ui.md#button-iconography)):

1. **`hint`** — the word's length plus its **first letters**: "8 letters
   starting with DEM" (three letters; four when the word is longer than eight —
   `hintPrefix` in `lib/hintOrSpoiler.ts`, the ONE definition of the rule).
2. **`spoiler`** — the word itself.

Both rungs also appear as **menu rows** ("Hint" / "Show the word") — the menu is
where their lightbulb and bare-eye glyphs get named ([ui.md → the menu is the
legend](../ui.md#button-iconography)). Row and button are the SAME action
(`act-hint` / `act-spoiler`), which is what makes them coop-only in one place:
each hides itself in compete, where the server refuses it too, so neither the
row nor the button asks about mode. The menu carries **Reveal solution**
(`act-reveal`) for the same reason: the end-of-game row's boxed-eye button had no
legend row, the only reveal-capable game missing one.

Both call `log_hint_or_spoiler`, which writes an `events` row (and bumps
`hints_used`, which nothing reads).

**A failed log is shown, not swallowed** (Joel, 2026-09-01). The slot is already
holding the hint itself when the answer arrives, so the not-ok shows over it —
and nothing is lost by that, because `log_hint_or_spoiler` can only refuse in
ways that make the hint moot: one race that fires once the game is over, and
three faults that mean a broken client. "The event log keeps the content, so
the pill is a convenience copy" is true only when the write SUCCEEDS; a failed
write is precisely the case where the log has nothing.

The content reaches **every coop player, on three surfaces** (Joel's spec,
2026-08-05): the requester's own pill; the teammates' pills — a header line
naming the act ("● joel got a hint" / "● joel revealed a word") plus the same
content pill the requester saw, because a hint one player asks for is a hint the
whole team has; and the event log's lasting record ("Hint: 8 letters: DEM" /
"Reveal: DEMOTIC" — the pills are transient, the log is what's given away on the
record). The pills read `lib/answer.ts` and the log reads `hintPrefix` beside
it, so they can't drift. Two event kinds, not
one, because "I was told it starts with DEM" and "I was told the word" are
different admissions. **Nothing renders a count of either.** The blob carries
each player's `nHintsUsed` and `nSpoilersUsed`, counted apart off the log, but
the event log's rows are the record players actually read, and a counter beside
the score would read as something the game holds against you (neither rung is
penalized).

**The text is a `hint` message, and leaves only by its ×** ([ui.md →
Feedback pill](../ui.md#feedback-pill)) — the rule for every hint, so a
keystroke can't clear a clue by accident. It sits in the **entry's slot** until
the player presses ×; the capture keyboard still takes letters meanwhile, and
the entry row comes back when the hint goes. The three diagnoses ("No word
starts with G" and its siblings) are `hint` messages too — the reply to the
same request, asked perhaps mid-word, and read the same way.

A stuck **compete** player has no detector, which is fine: undo is free and
refunds, so they can always back out — they just have to notice themselves.

Strands' *earned*-hint economy is deliberately not ported: there's no "valid
non-theme word" to earn with here, since every valid word is progress.

---

## 7. Boards — a seed table sampled and re-partitioned at game time

Neither a whole-puzzle library (connections/stackdown/strands) nor fully
on-demand (spellingbee/boggle/waffle/wordwheel/wordiply), but **wordwheel's
shape: a precomputed seed table, sampled and re-partitioned per game.** The
split follows the costs: *finding* a solvable pair is a ~780M-comparison scan
(offline, ~20s, once); choosing the **partition** — which side each letter lands
on — is microseconds, and it's what makes two games on the same twelve letters
feel different. Store the expensive half, re-roll the cheap half per game.

### Offline: `gmake g-letterboxed-seeds`

[`supabase/scripts/import-letterboxed-seeds.ts`](../../supabase/scripts/import-letterboxed-seeds.ts)
(wired into `db-data`, mirrors `g-wordwheel-pangrams`) scans `common.words` for
chained pairs whose letters union to exactly twelve, and emits
`letterboxed.seeds` keyed by the sorted twelve — deduped keeping the
easiest-band pair per key. Three load-bearing filters:

- **Doubled-letter words dropped at pool load** (24% of the dictionary —
  unplayable on any board, fact 3 in §1).
- **Band ≤ 2 seeds only.** Spellingbee's rule (it forces a band-1 pangram so
  the target is gettable): the guaranteed solution should be two words a person
  might actually think of. Decoupling the seed band from `legal_band` is the
  point — a band-5 game accepts fancy words *without* its guaranteed solution
  becoming two obscurities. Band ≤ 2 yields ~459k letter-sets, ample.
- **Partitionability proved at import** by exhaustive backtracking (~0.2% of
  otherwise-valid pairs fail — a long word can give one letter more distinct
  neighbors than there are sides for). So every stored seed partitions under
  *any* ordering, the builder needs no fallback path, and it's free to roll a
  **different** random partition per game.

### At game time: the `letterboxed-build-board` edge fn

The sixth of the `<codename>-build-board` family — and the one that runs
**backwards**: the others generate a board and discover what's findable on it; a
Letter Boxed board has to be *known solvable*, and random twelve letters almost
never are.

1. **Sample** a seed — `pick_seed(least(legal_band, 2))`, so the seeded pair is
   always legal in the game being built (or the guaranteed solution wouldn't be
   in the board's `words` and `create_game` would reject the board).
2. **Partition** the twelve into four sides of three, keeping both seed words
   playable (`partitionSides` in
   [`board.ts`](../../supabase/functions/letterboxed-build-board/board.ts) —
   randomized backtracking over the conflict graph; pure, unit-tested, the
   randomness injected). Letters shuffle *within* each side too — position on a
   side is pure display, and varying it makes two boards from one seed look
   less alike.
3. **Fetch + filter**: `candidate_words(mask, legal_band)` does the sargable
   half in SQL (the bitmask subset test + the clean filters + the
   doubled-letter drop); the TS layer applies the side-adjacency walk, which
   only it can — the rule depends on the partition it just chose.
4. **Gate**: ≥ 150 playable words (the richness floor — measured p25 is 210+ at
   every band, so this trims only the thin tail; `create_game` re-checks it),
   and **not solvable in one word** (the importer can't see the whole
   dictionary a game might accept — at `legal_band` 5 a twelve-distinct-letter
   word from a higher band can still turn up, so this is checked against the
   real playable list, per game). Re-roll on either, up to 8 attempts.
5. **Hand off** to `letterboxed.create_game`, which re-validates everything
   (§5).

No service role — the caller's JWT carries every signal, same as the siblings.

### A player-typed board (`setup.custom_sides`)

The dialog's optional **Board** field takes twelve letters and plays *exactly*
that board — the "I played an interesting one, here, try it" case. Set it and
steps 1–4 above are replaced wholesale; leave it blank and nothing changes.

The reading rules live in
[`src/letterboxed/lib/customBoard.ts`](../../src/letterboxed/lib/customBoard.ts)
and the edge function **imports that file directly** (the seam
`boggle-build-board` uses), so what the dialog accepts is what the server
parses. `cleanSides` lowercases and drops every non-letter, which is why
`ABC-DEF-GHI-JKL`, a middot title from an older game, and four space-separated
triples all mean the same board.

**The field keeps your separators; the setup stores the twelve letters.** You
paste `ABC-DEF-GHI-JKL` and the box still reads `ABC-DEF-GHI-JKL` — a board is
easier to check as four groups than as a run of twelve — while
`setup.custom_sides` holds the normalized `abcdefghijkl` that `create_game`
cross-checks against `board.sides`. The two can't be derived from each other
(normalizing is lossy about separators), so `SetupForm` keeps the raw text in
local state alongside the stored value.

That split is also why `cleanSides` does **not** truncate, unlike spellingbee's
`cleanLetters` and wordiply's `cleanBase`. Those back a field holding the
*cleaned* value, so their cap is a visible hard stop. Here a cap would be
silent — the box would read `ABC-DEF-GHI-JKLM` while the game started on the
first twelve — so length is `parseSides`' to judge, and it names the count it
actually read ("that's 13") in both directions.

**Why the letters can be typed back at all:** `sides` is already stored in the
order a person reads the board — `layout()` walks the top left→right, the right
top→bottom, the bottom **right→left**, the left **bottom→top**, a clockwise
circuit from the top-left letter. So `formatSides` is pure chunking and
`parseSides(formatSides(s)) === s`. The same string appears in three places you
can read it off: the game title, the info column's **Board** setup row, and the
PDF's Setup block (the last two from one `setupRows` array).

**The lookup, and why it isn't a quality gate.** `letterboxed.games.solution` is
`not null`, and the end-of-game reveal, the PDF and `create_game`'s winnability
invariant all read it — so a typed board still has to arrive with a pair. It
gets one from `letterboxed.seed_for(sorted_twelve)`: sorted, the twelve letters
*are* `letterboxed.seeds`' primary key, so recovering the solving pair is one
index lookup. **A board this game built is in that table by construction** (the
builder got its twelve letters from a row of it, and partitioning only reorders
them), so re-sharing cannot miss.

`seed_for` is `security definer` for the same reason `pick_seed` is: RLS is
enabled on `letterboxed.seeds` with **no select policy**, so the table's own
`grant select to authenticated` yields zero rows. A direct read would have
failed silently — every custom board rejected as unknown, on a correct client
with a correct seed table. `custom_board_test.sql` pins both halves.

Because the pair is recovered rather than assumed, **nothing downstream is
special-cased**: par is still 2, the reveal still works, the PDF still prints
"Solvable in two".

**Gates dropped, and the one kept.** The ≥150 richness floor, the
one-word-solvable re-roll and the 8-attempt loop all go: they exist to stop a
*rolled* board being a bad puzzle, and nobody asked for that board — you asked
for this one. (`create_game` relaxes its own ≥150 catch to match, keyed on
`custom_sides` being present; the two are documented as having to agree, so they
move together. Same relaxation spellingbee and wordiply make.) What survives is
solvability, because that's the promise the whole seed pipeline exists to keep.

Three rejections, all player-reachable and all unreachable for a board this game
produced:

| key | when | the fix |
|---|---|---|
| `unknown-board` | no seed for those twelve letters | check what you typed; the *set* missed, so rearranging won't help |
| `unverified-board` | the seed exists but its pair isn't playable under the sides **as typed** | right letters, wrong arrangement — two swapped between sides |
| `board-needs-band` | the pair is band 2 and the game is set to band 1 | raise the dictionary to the number in the message |

`unverified-board` is the one doing real work: without it, a board with two
letters transposed would start happily and simply not be solvable in two.

`create_game` cross-checks `setup.custom_sides` against `board.sides` and raises
`custom-board-mismatch` if they differ — the feature is "the *exact* board my
friend sent me", so a builder bug that quietly re-partitioned it would hand back
a puzzle that looks right and isn't. And `custom_sides` is stripped from the
club's `default_setup`: a board is an **instance**, not a preference, and left
in place it would silently rebuild itself on every later Start.

### `legal_band` — the one knob, and it runs backwards

`legal_band` (1..6, default 5) is what the server **accepts** and the band
the board's `words` were built at. **A higher band makes letterboxed *easier***:
more legal words means more escape routes off an awkward tail letter — median
playable words per board runs **280 → 850 across bands 1 → 5**, a genuine 3×
lever on how much room a player has. Same inversion strands' band has, and the
schema comment says so because it's the mistake a future reader will make.

### Server rejections

Every raise answers in [an envelope](../envelopes.md), writing its own sentence
at the site that knows the condition. What the four turn RPCs can say:

| | | |
|---|---|---|
| `PN400` "Must start with G" | `race` | |
| `PN401` "Chain is full" | `race` | |
| `PN402` "Already played" | `race` | |
| `PN407` "Nothing to undo" | `race` | |
| `PN486` "Game over" | `race` | the shared race (`common._raise_game_over`) |
| `PN483` "Already conceded" | `race` | the shared race (`common._raise_already_conceded`) |
| `PN243` "Not your turn" | `race` | from `common._require_turn` |
| `PN399` "BUG: a word under three letters" | `fault` | |
| `PN403` "BUG: a word this board cannot play" | `fault` | |
| `PN411` "BUG: a clear in turn-by-turn coop" | `fault` | |
| `PN414` "BUG: a hint or spoiler in a compete game" | `fault` | |
| `PN415` "BUG: a rung of an unknown kind" | `fault` | |
| `PN485` "That game was already deleted" | `race` | from `common._raise_game_deleted`, asked before the membership gate |

**The split runs through `submit_word`'s five shape checks, and it is the one
judgment worth understanding here.** `rejectReason` (`lib/board.ts`) checks all
five before every submit, so reaching any of them means the frontend's answer
and the server's differ — but *why* they differ decides the severity:

- **The word and the board are FIXED.** The frontend holds the board's `words` and
  applies the dictionary, the letters and the same-side rule itself. Nothing can
  change under it, so a disagreement is a broken client — wordiply's `fe_legal`
  ruling (PN367) arriving in another game.
- **The CHAIN is shared, and coop is free-for-all.** A teammate's word lands
  between your local check and your submit, and the three checks that read the
  chain — its length, its contents, its tail — flip underneath you. Those are
  races: a legal move that lost one.

The racing three keep `rejectReason`'s exact words ("Chain is full", "Already
played", "Must start with X"), so the same rule arriving by the other route is
not described differently. And the three ways a typed board fails
(`unknown-board`, `unverified-board`, `board-needs-band`) are still separate:
they fire at CREATE time and land on the setup dialog's error line.

### The two word lists

Band is the ONLY filter on what a player may type. `candidate_words` gates on
band, length, the board's letter set and the no-doubled-letter rule — nothing
else — so the board's `words` hold crude, slur, slang and dialect-only words too.
That's the may-enter tier ([word-list.md → the word list's filter
rule](../word-list.md#the-word-list-commonwords)): a player typing `BITCH` (band
1, `slur = 1`) chose it, and the game has no business refusing it. It used to,
until 2026-08-10.

What the game itself OFFERS is the must-reach tier — `american AND british AND
crude = 0 AND slur = 0 AND NOT slang`, the words the hint search reads. A hint
puts a word on screen and a spoiler hands it over, so neither may draw from the
wide list. Purity rides out of `candidate_words` as an `is_clean` flag
(spellingbee's `is_required` under another name) and the board builder uses it
to judge richness: **the ≥150 floor counts CLEAN words**, since a board is only
as rich as what the hint can suggest, while the one-word-solvable re-roll tests
the whole accept list (a board a player can finish in one typed word is trivial
either way).

**The blob names the exceptions.** About 95% of a board's words are clean, so
the page blob carries `words` and, beside them, `uncleanWords` — the few a hint
may not offer — rather than a second list nearly as long as the first (Joel,
2026-10-05: the stored blob should not be twice as long as it needs to be).
`makeGameData` turns the two into `gd.puzzle.words: [{word, clean}]`, the
clearest shape for the readers. `uncleanWords` is worked out at every rebuild
(`letterboxed._make_json_unclean_words`), a word the dictionary no longer holds
counting as unclean, so it tracks the dictionary: re-flag a word as a slur in
the editor and hints stop offering it on boards built months ago, at the next
move.

**The hint falls back when NO word is clean.** That isn't a board with no clean
words — it's a broken derivation: a synthetic test fixture, or a dictionary that
was never imported, leaves every word unclean, and telling a player "No words to
play" about a board holding hundreds is a lie with no remedy. So the search uses
every word in that one case (`lib/askForHintOrSpoiler.ts`). It does NOT cover a
single word going missing: a dictionary DELETION silently shrinks a live board's
hint corpus by one, which can make the search report a route as unreachable when
a route exists.

One consequence worth keeping: `stuck` ("No word starts with G") is a claim
about the RULES, so `makeNoSuggestionText` (`lib/hintOrSpoiler.ts`) re-tests it
against every word after the clean search reports it. If a crude G-word is
sitting there playable, the honest answer is "No winning path from here" — there
IS a move, just none the hint can name.

---

## 8. Frontend

Folder [`src/letterboxed/`](../../src/letterboxed/), the shape
[`docs/playarea.md`](../playarea.md) describes, on the page blobs
([plans/seat-view.md](../../plans/seat-view.md)): `useGame` is
`makeGameData(game_data, me)` — no read, no subscription — and every type the
folder exports is in [`types.ts`](../../src/letterboxed/types.ts), the `gd`
sketch at its top.

```
<PlayAreaLoader {...PlayAreaLoaderProps}>   useGame: gd from the game_data blob
  └── PlayArea                      the coordinator: picks the chain to show
        ├── BoardCol                the chain, the square and the entry; owns the move
        │     ├── ChainStrip        the words so far; the last one carries the ×
        │     ├── Board             the square and its two lines; decides each tile's marks
        │     │     └── Tile        one letter — covered, in the word, last, shaking
        │     ├── HistoryBanner ←   over the entry while a past move is open
        │     └── WordEntryArea ←   the typed word (TypedWord), or the slot's top message
        ├── InfoSheet ←             off-canvas on a phone, a flex child on desktop
        │     └── InfoCol           the readouts and the action row
        │           ├── StateLine   "Letters 7/12 · Words (par 2) 3/5"
        │           ├── TurnStatusLine ←   turn-by-turn coop only
        │           ├── OpponentStrip ←    compete only: each racer's 7/12 · 2w, or "out"
        │           ├── InfoActionsRow ←   one row, every action, in the menu's order
        │           ├── the revealed pair  "Solvable in two", once Reveal is pressed
        │           ├── SetupDisclosure ←
        │           └── GameEventLog       every row I may see
        └── CelebrationBlockingModal ←     my win, when it happens
```

`PlayArea`'s hooks: the two ending messages (`useGetGameEndingMessage`,
`useGetPlayerEndingMessage`, from `lib/gameEndingMessage.ts` and
`lib/playerEndingMessage.ts`), `useTurnStartFlash`, `useShowTeammateMoves`,
`useHistoryView` and `useActionsAndMenu`. `BoardCol`'s: `useTypedWord` (the
word being typed) and `useChainMove` (its trips to the server).

Move entry is deliberately **not** `useFoundWordSubmit` — that hook models a
found-words game (dedup against a growing set, points per word); here a
submission is a chain *append* whose legality depends on the word before it, so
validation lives in [`lib/board.ts`](../../src/letterboxed/lib/board.ts)
(`rejectReason`, ordered so the most actionable complaint wins — "Must start
with T" beats "Not a word") and the move is a plain RPC.

**One case, the data's.** The word list is lowercase, so the typed word, the
chain and every tile's letter stay lowercase, and the capitals are drawn — CSS
on the tile, the chain strip, the entry and the revealed pair; by hand only
where CSS cannot reach (the ×'s label, a pill's sentence, the PDF).

**Two paths are drawn on the board.** The word you're typing traces the accent
green; the last word of the chain on show stays behind it in a quieter line
(`--letterboxed-ghost`) — a **ghost** of where the chain just went. In coop
that's whoever played it, since the chain is shared; in compete it's your own
last word, a rival's chain being withheld mid-race (§3).

Both lines come from one derivation,
[`pathPoints`](../../src/letterboxed/lib/board.ts), so they can't disagree about
where a word goes. **No path is stored anywhere:** the board's twelve letters
are distinct, so a word determines its route uniquely — which is the fact that
makes the whole feature free of schema and RPC work. A repeated letter (ONION)
revisits its tile and the line doubles back; that's the geometry being honest.

**When the ghost clears is the deliberate part.** It survives the next word's
FIRST letter, because that letter isn't a choice — it's carried over from the
previous word's tail — and clears on the second, the moment the player commits
to a direction. That's `typedWord.length < 2`, and it's the assertion
[`letterboxed.e2e.ts`](../../e2e/letterboxed.e2e.ts) cares about most:
bracketing "appears" and "disappears" alone would pass an implementation that
cleared a keystroke too early. The turn-history viewer inherits it for nothing —
it passes no typed word with a past move's chain, so stepping back through
turns replays each word's route.

**The chain strip sits ABOVE the board** (`<ChainStrip>`), not in the info
column: the chain is the game's central state — what you've played, and
therefore what letter the next word must start with — and on a phone the info
column is off-canvas, so a readout you need on every turn can't live behind a
sheet. The **last word carries an ×**, and that is the whole undo affordance
(§5). The strip keeps its height when empty, so the first word doesn't shove
the board down (layout stability).

**The locked first letter** (`useTypedWord`). Once the chain has a word, the
next one must start with its last letter — so the entry seeds itself with it and
won't let you delete it. State is only the part the player typed (the draft);
the word is `seed + draft`, **derived every render**, so playing a word
re-seeds the box with no effect and no stale state. `<TypedWord>` renders the
seed in its own style ("this letter isn't yours to delete"); **Backspace stops
at the seed**. Two more entry gates: only the twelve board letters are typeable
(`charFor`, a lookup in `gd.puzzle.tilesById`), and an appended letter that
can't legally follow the previous one (same side) **never enters the field** —
refusing the keystroke says "wrong" immediately, instead of letting you finish
typing a word you can already see is illegal. **Neither history arrow is bound
here** — the `<WordEntryArea>` takes `hasHistory={false}`, so `↑` and `↓` are off
the key list entirely: a submitted word goes into the chain rather than away,
and `↓` could only clear back to the locked seed, which the entry refuses anyway.

**The move** (`useChainMove`). `sendWord` and `removeLast` each resolve to
whether the move landed, so the typed word empties only then — a refused word
stays to be fixed. A word the frontend can refuse never leaves: the pill says
why in the server's own words and the board shakes the word, until the next
edit. The move's own `inFlight` is the one guard against a second send.

**The board** is two layers on a 0–100 square: an SVG carrying the box and the
two lines, and the twelve `<Tile>`s laid over it at the same coordinates
(`lib/board.ts → layout`, clockwise from the top-left so the four sides read as
one loop). Each tile's `data-tile` is its id, the letter. Clicking a tile
appends its letter; **clicking the word's current last letter again submits**
(unambiguous, since a letter can never legally follow itself). A letter that
can't follow the last one ignores the click but is **not dimmed** — you plan a
whole word before you commit to it, and a board where a third of the letters are
unreadable is a board you can't plan on. The below-board slot is the shared
reserved-height swap box: the entry row, or the local feedback slot's top message
— a word result, a hint, "Chain is full — remove a word" (a standing note), the
ending's verdict. **Two gates, computed once in `BoardCol`:** `isInteractive`
(the move is mine, on the live board) gates the ×, and `isEntryOpen`
(`isInteractive` and the chain not full) gates the tiles and the entry — a full
chain freezes the entry but leaves the chain editable, because taking a word
back is then the only move on the board.

**Event log** (`GameEventLog`): one `<tr>` per event in the shared `<EventLog>`
atoms, with coverage as its own column (`7/12`) so the numbers line up. Bar
colors: a **played word is green** (landing a legal word on this board is
unambiguously progress, unlike a wordle guess), **a hint is amber** and **a
spoiler red** (it hands the word over), retreats are **blue** — `noted`, news
rather than a verdict — every word from `lib/answer.ts` (§6). Every word is
click-to-define. The shared whose-moves picker applies (coop "Team" + players;
compete "All", defaulting to you; a rival's rows fill in once the game ends).

**Turn-history replay** (`useHistoryView`) — the shared `#N` handle +
`useHistoryViewer`, addressed by the **row's own id**. The snapshot
([`lib/history.ts`](../../src/letterboxed/lib/history.ts)) is a **fold**, which
is the payoff of the events table being append-only: a chain isn't a board that
accumulates, it's a stack that can also shrink, so `historyChainAt` just runs
the four rules forward — `word` push, `undo` pop, `clear` empty, a hint or a
spoiler nothing — over the viewed row's author's rows. The boundary is
**inclusive** (viewing move N shows the chain *after* it — the only reading that
makes an `undo` row show anything at all, since its whole content is the word no
longer being there). Any key or click exits, per the shared viewer contract.

**Info column**, canonical order: the `<StateLine>` (`gd.stateLineData` — the
team's chain in coop, mine in compete — as two fractions: letters covered / 12,
words used / cap **with par named in the label**, since "3/5" alone says
nothing) → `TurnStatusLine` (turn-coop only) → `OpponentStrip` (compete:
`7/12 · 2w` per rival — kept once the game ends, unlike wordiply's verdict
switch: coverage is the story after a coverage race — the two public numbers,
never the words; `out` for any racer who has ended) → **one action row**, every
action listed once in the menu's order (Hint, Spoiler | Reveal, Restart, New
game, Concede, Stop, Back to club), each answering for itself whether it shows,
with the ending's line beside it → the help line, on my move alone → the
revealed pair ("Solvable in two", click-to-define) → setup disclosure → the log.

**Mobile** — the standard conversion (`useInfoSheet` + `<InfoSheet>` +
`shared.mobileFill`), and deliberately **no `<MobileStatusBar>`** (the adoption
rule's clearest non-adopter): the board shows which letters are covered, the
chain strip shows the words, and the cap is restated by the accepted-word result
("APPLE — 2 words left", cleared by the next keystroke) after every move — so
`<StateLine>` renders in the info column/sheet only. The chain strip's reserved
height is **chain-aware**: `BoardCol` estimates rows from the live chain
(`lib/chainRows.ts`) and a chain that outgrows the base reservation (2 rows / 3
on a phone) takes the extra out of `--avail-h`, shrinking the board once rather
than scrolling the page. The slot's "Waiting for ● moth" covers whose-turn on the
phone surface. See [mobile.md](../mobile.md).

**Teammate narration** (`useShowTeammateMoves`, coop): a teammate's word changes
*my* board, so the header says so — `● moth TRACE (7/12)`, "undid TRACE" (named,
so peers know which word came off), or "cleared the chain". A hint or a spoiler
narrates on two channels at once — the header names the act, the local slot
carries the content (see §6 Hints). Compete has no narration — the race ends on
first solve and the OpponentStrip already shows live progress (wordiply and
strands are the same).

**The turn** (`useTurnStartFlash`): in turn-by-turn coop the board frame flashes
and the bell rings the moment the move becomes mine.

**Celebration**: confetti the moment my win lands, as the server ranked it —
every teammate on a coop solve, the solver in a race, each tied racer on a
timeout ("All twelve! 🐍").

### Print to PDF

The **track family** (`common/pdf/columns`, three to a page): coop is one "Team"
track, compete one per player whose chain is visible — mid-race that's just
yours (the seat rule withholds rivals'), once the game ends everyone. Each track: the
square, the standing, the numbered chain, the full move log — retreats, hints
and spoilers included, because "what did we try?" is most of what a finished
game is worth keeping.

A covered letter moves its encoding from color to **weight**: a heavy black
ring + bold glyph vs a thin gray ring — it survives a photocopier, which is the
test [common/pdf/doc.md](../../src/common/pdf/doc.md) sets. The solution prints
**only if the players revealed it on screen** (`pdf/model.ts` pins this) —
printing it regardless would route around the Reveal gate and hand the answer to
a friend about to replay the board. `->` not `→` (WinAnsi).

---

## 9. Modes (coop / compete)

| | coop | compete |
|---|---|---|
| chain | **one, shared** — every player's row lock-stepped; anyone submits (or turn-by-turn, opt-in) | **private per player**, same board; rivals see only letters-covered + word-count |
| hints | Hint + Spoiler, unpenalized, logged | **none** — either rung is a win button |
| ends | all twelve covered (won) / timeout (lost) / Stop (neutral) | **first to cover all twelve within the cap — the race ends** / timeout resolves on coverage / all-conceded / manual |
| undo / clear | undo refunds; costs a turn in turn-coop; clear refused there (no FE surface anywhere) | undo your own chain freely |
| players | `[1, 6]` (solo allowed) | `[2, 6]` |

Compete's timeout comparator — most letters covered → fewest words, an exact
tie sharing the rank — resolves from standing (the boggle / scrabble /
wordiply family, [states.md](../states.md)): a partial chain is genuinely
rankable, so a timed race always produces an answer. A conceder forfeits: the
move RPCs refuse them and the ranking excludes them, so a stale tab can't win a
race its owner left.

Coop's opt-in turn-by-turn (`coop_style: 'turns'` + the common rotation) is the
strongest fit on the roster — the chain hands off natively ("I ended on T, you
start on T"). No passing.

---

## 10. Tests

**pgTAP** (`supabase/tests/letterboxed/`, on a synthetic fixture board in
`setup.psql`: `abcdefghijkl`, the pair `adgjbehk` → `kcfil`, and filler words the
dictionary doesn't hold; `lb_player` / `lb_chain` read a player off `game_data`):

- `game_data_test` — the page blobs: a fresh game's puzzle (the box as tiles by
  letter, the words and the unclean few, par, no solution), coop's team and
  compete's none, a coop player without chain counts and a racer with them, both
  modes' summaries; mid-game coop — a word, a hint and a spoiler in the log, the
  team's chain, one chain on every seat, hints and spoilers counted per player;
  mid-game compete — each racer's own counts and chain, the log carrying every
  racer's rows (the page withholds, not the builder); the endings — an undo in
  the log, the solution arriving, a coop solve stamping every teammate, the
  winner's numbers on a solve and on a timeout, `shell_data` rewritten; a
  Restart; a rebuild of every game without re-dating it.
- `gameplay_test` — the chain rulebook: the coop happy path, the rejections
  (not on the board / wrong start letter / duplicate / under three letters),
  undo's **refund** (the property that makes the cap a shape constraint),
  clear, the coop win on covering twelve, each move answering its `result`
  alone, compete's actor-only writes, and each move into a deleted game.
- `compete_test` — the race won: the solver ranked 1, the rival unranked, the
  summary naming the winner and their chain, the ended blob carrying it.
- `concede_timeout_test` · `timeout_test` — a conceder frozen out of every
  move and the timeout's ranking (coverage, then the shorter chain; an exact
  tie shares first); coop's timeout a loss, and a late tick changing nothing.
- `replay_test` · `turn_order_test` — Restart's five resets; turn-by-turn
  coop, where a word and an undo both spend the turn and a clear is refused.
- `rls_test` — the member gate alone: a racer reads both racers' rows, a
  non-member none.
- `custom_board_test` — the typed-board path (§7): `seed_for` reaching the pool
  RLS hides **and** the same caller getting nothing through the table (the pair
  that proves the definer wrapper is load-bearing), the dash title, the
  `custom_sides` strip from the club default, the `custom-board-mismatch`
  cross-check, and the richness floor being relaxed for a typed board **while
  still firing on a rolled one**.
- `candidate_words_test` — the two tiers, on real dictionary rows.

The realtime-publication memberships are guarded centrally
(`supabase/tests/common/realtime_publication_test.sql`); the gametype
registrations by `clubs_gametypes_test.sql`.

**Vitest**, beside the code:

| file | pins |
|---|---|
| `hooks/useGame.test` | `gd` from the blob — the links become players, the setup rows with the board, the words flagged clean or not, `tilesById`, coop's counts on the team and a racer's on the player, hints and spoilers per player, the state line's pick, the solution at the end; the seat rule mid-race and at its end; the memo on the blob |
| `lib/gameEndingMessage.test` · `lib/playerEndingMessage.test` | every ending's words and my outcome — coop's win, timeout and Stop; a race solved, lost, won or tied on a timeout, all conceded, or nobody covering anything; a conceder |
| `lib/solve.test` | the hint BFS — shortest path, the greedy tie-break, stuck vs unreachable vs off par |
| `lib/history.test` | the fold and the inclusive boundary |
| `lib/board.test` · `lib/customBoard.test` · `lib/chainRows.test` · `lib/answer.test` · `lib/setup.test` | the side rule, `rejectReason`, `layout` and `pathPoints`; the typed-board reader (`formatSides` / `parseSides` round trip); the strip's rows; every answer's outcome and words; the setup's bounds |
| `components/PlayArea.test` | the surface on the fixture: a conceder's row; the one action row mid-game and at the end; the menu as the icon legend; Reveal as a local toggle; the hint's three refusals and the two tiers; a refused undo's words; a refused word shaking, and the side rule at the keyboard; the RPCs' `p_` names; the keys, New game, Stop, Concede and Restart |
| `components/SetupForm.test` | the form's settings |
| `pdf/model.test` | the print model from `gd`: coop's one track, compete's by player, a withheld rival omitted, the reveal gate |

**Edge** (`deno test`): `letterboxed-build-board/board_test.ts` — the pure
core: `partitionSides` (both seed words playable on every output; null on a
genuinely unpartitionable pair), `isPlayable`, `isOneWordSolvable`,
`letterMask` parity with `common.word_letter_mask`.

**e2e**: `letterboxed.e2e.ts` (a coop game played through, the custom board's
round trip), `letterboxed-print.e2e.ts` (the PDF), and letterboxed's cases in
`events-realtime` and `tap-targets`.

---

## Deferred

- **Rare-letter weighting for the seed pool** (wordwheel's precedent), so
  J/Q/X boards appear deliberately rather than at their natural frequency.
  Defers cleanly.
- **Consider removing `clear_chain`** (raised 2026-09-01, converting the area
  to envelopes). It is a live, granted RPC that **nothing calls**: the
  frontend's path to it went with the PlayArea pass (2026-10-05). Its absence
  from the UI is a decision rather than an oversight (§5 → "Undo and clear"),
  which is why it was left standing — but an unreachable RPC still has to be
  designed, converted, tested and carried, and it has a raise code of its own
  (PN411). Removing it would take the function, its grant and its roster row
  together; keeping it means keeping all three.

## Won't do

- **Trimming the seed table** (ruled 2026-08-05). The full pool — 458,187
  rows, **55 MB on disk with indexes** — was measured against the constraint
  that would care: Supabase's free tier gives a 500 MB database, and the
  ENTIRE app (all fifteen games, `common.words`, every puzzle library) sits
  at ~169 MB, a third of it. Seeds never leave the server (the edge fn
  samples one pair per game), so egress is unaffected. Keep everything;
  repeats effectively never happen. Reversible in one importer re-run
  (band-1-only would save ~28 MB) if storage ever tightens — the free-tier
  limit this app would actually hit first is the inactivity pause.
