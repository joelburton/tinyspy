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
folder, mode branching at render time on `game.mode`. See
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
   one fact is what makes the help search, instant local validation, and the
   winnability guarantee nearly free.

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
`PAR` is the constant `2` in [`lib/board.ts`](../../src/letterboxed/lib/board.ts).

**The cap is waffle-style `par + extra`:** setup asks for **`extra_words`
(0..5, default 3)** — how many words *above par* the chain may run to — and
`create_game` stores it resolved as `max_words = 2 + extra_words`. It's
expressed as slack rather than a bare integer because slack is the number
players can reason about: "solve it in 5" says nothing on its own, while "par is
2, you get 3 spare" says exactly how much room there is. The info column and the
setup recap both quote it against par for the same reason.

**The cap is a shape constraint, not a bustable budget.** Undo **refunds**
against it (§5), so you can't lose by exhausting it — your chain may simply
never exceed N words. That's faithful to NYT (solo Letter Boxed has no fail
state; the satisfaction is beating par), and it's why compete's bar is "first to
cover the twelve *within* the cap" rather than "fewest words" — a freely
resettable chain makes any fewest-X metric grindable, and the equilibrium would
be everyone sitting at par with the win going to whoever waited longest.

The cap applies to **both** modes, so the two siblings teach one constraint.

---

## 3. Architecture — server-authoritative moves, an open solution, shielded compete chains

Three different trust postures coexist here, each for its own reason:

- **Moves are server-authoritative** — NOT trusting-commit like the shipped-list
  word games. `submit_word` re-validates everything and arbitrates append
  order, because chain order is real state and free-for-all coop races need an
  authority: two players submitting off the same tail must produce one winner
  and one clean "the chain moved on" rejection, not a corrupted chain. The RPC
  takes a row lock on the game to serialize appends.
- **The playable word list and the seeded solution ship to the FE openly.**
  Per CLAUDE.md's trust model this costs nothing (friends, not adversaries),
  and it buys a lot: the help search is ~40 lines of unit-testable TypeScript
  instead of the most complex plpgsql in the repo (§6), and the FE can refuse a
  bad word instantly. The solution is **display-gated, not shielded**: the
  gametype sets `hides_solution`, so the seeded pair stays covered until the
  shared terminal Reveal (`common.reveal_solution`) — a win opens it
  automatically. Gating it server-side would guard nothing, since any two-word
  solution is one BFS away from the shipped list; the seeded pair is stored
  because it's the *gettable* one (band ≤ 2 by construction), not because it's
  secret.
- **A compete rival's chain is column-shielded.** Mid-race a rival may see how
  *many* words you've played and how much you've covered — never which words.
  The column grant on `letterboxed.players` omits `chain`; it reaches the FE
  only through the `players_state` view, whose `_chain_for` definer helper
  returns it when the game is coop, the row is yours, or the game is terminal —
  and NULL otherwise. `_word_count_for` / `_covered_for` publish the two scalars
  a race may reveal (they exist because a `security_invoker` view can't read a
  column its caller can't; the arithmetic has to happen inside a definer
  function, and returning scalars rather than the array is the whole design).

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
| `games` | One row per playthrough. `sides` is the twelve letters **in side order** — positions 1–3 one side, 4–6 the next, and so on — so the partition lives *in* the string and can't drift from it. `playable_words` (jsonb) is every word playable on this board at `legal_band`, computed once by the builder and shipped to the FE. `solution` is the seeded pair, copied on so the board stays self-contained if the seed table is re-imported. `max_words` (2..7, resolved from `extra_words`), `legal_band`, denormalized `mode` + `club_handle`. |
| `players` | One row per (game, player), **one shape for both modes**: coop moves every row in lock-step (each player's row always equals the shared chain), compete moves only the actor's — the mode difference collapses to one WHERE clause, and the FE always reads its own row (strands' pattern). `chain` is **materialized** rather than folded from events on demand: every submit needs only its last element, so keeping the answer costs one array write per move; `events` stays the source of truth for the *log*, this is the cache the rules read. Plus `hints_used` (coop-only help tally), `solved` / `solved_at`. |
| `events` | The append-only game log, kinds `played` / `undone` / `cleared` / `hint` / `spoiler`. A chain can dead-end, so **undo is a first-class move, not an error path** — logging retreats (instead of deleting rows) is what lets the turn log show them and keeps the history viewer a fold (§8). `id` is an identity bigint because **order is the state**: replaying the log in id order must reproduce the chain exactly. Each row stores `letters_covered` *after* the event — derivable, but the log prints it on every line and compete's timeout ranks on exactly that number. |

### RLS

- `games` / `players` rows: club members, both modes — it's the chain **column**
  compete hides (§3), not the rows; visible rows are what let a rival read your
  word count.
- `events`: the three-arm compete shape (wordwheel's `found_words_select`) —
  coop sees everything; you always see your own; everyone sees everything at
  terminal (the reveal).
- No INSERT/UPDATE/DELETE policies — writes go through the security-definer
  RPCs.

### Realtime

**All three play tables are published** — `games`, `players`, `events` — and all
three must be: an unpublished table in a `postgres_changes` subscription
silently kills the *whole* subscription (writes still persist; a manual refresh
shows them — the worst kind of quiet). `useGame` subscribes to all three;
`replay_board`'s client wake rides the `players` UPDATE (a replay DELETEs
`events` rows, which `postgres_changes` filters don't reliably match). The
memberships are pinned by the central registry test,
`supabase/tests/common/realtime_publication_test.sql`.

### Play states

Coop: `playing` → `won` (all twelve covered) / `lost` (the clock — the roster's
"reachable end you didn't reach" test, [states.md](../states.md)) / `ended`
(manual, neutral). Compete: `won_compete` (first solve, or a timeout resolved on
coverage) / `lost_compete` (all conceded, or a timed-out race nobody scored in)
/ `ended` (manual — agreeing to stop isn't a race resolution).

---

## 5. RPCs

| RPC | job |
|---|---|
| `create_game(target_club, setup, player_user_ids, mode, board)` | Validates setup (`extra_words` 0..5 → `max_words`, `legal_band` 1..6, timer, turn-coop seating) and the board — including the **winnability invariant**: the seeded pair must chain, cover all twelve, and both appear in `playable_words`, plus a ≥ 150-word richness floor. This is the only place that checks the game is solvable at all. Title is the board itself, grouped by side: `"ABC·DEF·GHI·JKL"` — nothing on it is secret, so unlike wordle it never needs a re-sync. |
| `submit_word(target_game, submitted)` | The whole rulebook, in rejection order (each raise's wording is what the player reads): ≥ 3 letters → in `playable_words` (one membership test covers the dictionary, the board's letters AND the side rule) → cap not reached → not already in the chain → starts with the tail letter. Appends under the game row lock; covering all twelve **ends the game** (coop: everybody wins; compete: first past the bar wins outright). |
| `undo_word(target_game)` | Pops the last word and **refunds against the cap** (§2). In turn-by-turn coop it **costs the undoer's turn** — see the pricing below. |
| `clear_chain(target_game)` | Empties the chain (crosswords' "Clear board" hammer). Refused in turn-by-turn coop, and **has no FE surface at all** — see below. |
| `log_help(target_game, word_shown, kind)` | Records that help was taken (§6). The suggestion is computed on the FE; the server's only job is making the turn log agree with what happened. Coop-only — refused in compete, where either rung is a win button. |
| `submit_timeout(target_game)` | Coop → **`lost`** (one chain, it didn't reach twelve; nothing to rank). Compete → resolve on **most letters covered → fewest words → co-winners** (the wordiply comparator shape: a shared win beats an arbitrary one). Both ranking numbers were already public during the race, so the resolution reveals nothing new. |
| `end_game(target_game)` | The neutral manual stop, `ended` in **both** modes — a group agreeing to stop is agreeing not to have a result. |
| `concede(target_game)` | A one-line wrapper over `common.concede` — the generic helper is right here because letterboxed is **not** an elimination game (undo refunds, so the only way a non-conceded player stops racing is winning, which already ends the game). A conceder is out in both directions: the move RPCs refuse them, and the timeout ranking excludes them. |
| `replay_board(target_game)` | The cheapest replay on the roster — the board is immutable data, so there's nothing to rebuild: clear the chains, drop the log, rewind the turn pointer, `reset_game` a fresh status blob. Nothing is re-revealed (a loss keeps the pair covered, so a replay is a genuine second try). |

Every mid-game transition calls `_sync_status` (the wordle `_sync_title`
pattern: derived, not remembered per-writer), so the club-page label is correct
after a word, an undo, a clear, or help. Terminal transitions build their own
blob for `common.end_game` — status **merges**, so every value a terminal
asserts is restated ([status blob merges](../supabase.md)). Compete's
mid-game/terminal blobs carry a `_leaderboard` of the two public numbers, with
usernames cached in (never joined at read time).

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
never runs solo (`CoopStyleField` hides for one player).

**There is no clear-chain button in the FE**, in either mode — the RPC exists as
part of the rulebook, but the only undo surface is the **× on the chain strip's
last word** (§8), and clicking it repeatedly walks the chain back to empty, so a
bulk clear would be a second way to do the same thing.
[`PlayArea.tsx`](../../src/letterboxed/components/PlayArea.tsx) documents this at
the call site.

---

## 6. Help — two rungs, computed on the FE

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
detects **stuck** (nothing can follow the tail — "Dead end, take a word back")
and **unreachable** (words exist, but no route home from here).

Two rungs, the shared help ladder ([ui.md → button
iconography](../ui.md#button-iconography)):

1. **`hint`** — the word's length plus its **first letters**: "8 letters
   starting with DEM" (three letters; four when the word is longer than eight —
   `hintPrefix` in `lib/help.ts`, the ONE definition of the rule).
2. **`spoiler`** — the word itself.

Both call `log_help`, which bumps `hints_used` and writes an `events` row, and
the content reaches **every coop player, on three surfaces** (Joel's spec,
2026-08-05): the requester's own pill; the teammates' pills — a header line
naming the act ("● joel got a hint" / "● joel revealed a word") plus the same
content pill the requester saw, because a hint one player asks for is a hint
the whole team has; and the turn log's lasting record ("Hint: 8 letters: DEM" /
"Reveal: DEMOTIC" — the pills are transient, the log is what's given away on
the record). All three read from `lib/help.ts`'s `helpPillText`/`hintPrefix` so
they can't drift. Two event kinds, not one, because "I was told it starts with
DEM" and "I was told the word" are different admissions. **`hints_used` is tracked server-side but nothing renders
it** — the turn log's amber help rows are the record players actually read, and
a counter beside the score would read as something the game holds against you
(help is deliberately unpenalized). The per-player tally stays as the cheap
number the log would otherwise have to be folded to get.

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
  neighbours than there are sides for). So every stored seed partitions under
  *any* ordering, the builder needs no fallback path, and it's free to roll a
  **different** random partition per game.

### At game time: the `letterboxed-build-board` edge fn

The sixth of the `<codename>-build-board` family — and the one that runs
**backwards**: the others generate a board and discover what's findable on it; a
Letter Boxed board has to be *known solvable*, and random twelve letters almost
never are.

1. **Sample** a seed — `pick_seed(least(legal_band, 2))`, so the seeded pair is
   always legal in the game being built (or the guaranteed solution wouldn't be
   in `playable_words` and `create_game` would reject the board).
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

### `legal_band` — the one knob, and it runs backwards

`legal_band` (1..6, default 5) is what the server **accepts** and the band
`playable_words` was built at. **A higher band makes letterboxed *easier***:
more legal words means more escape routes off an awkward tail letter — median
playable words per board runs **280 → 850 across bands 1 → 5**, a genuine 3×
lever on how much room a player has. Same inversion strands' band has, and the
schema comment says so because it's the mistake a future reader will make. The
roster-standard clean filters apply (`crude = 0 AND slur = 0`, no slang,
`american AND british`).

---

## 8. Frontend

Folder [`src/letterboxed/`](../../src/letterboxed/), standard v3 two-column
layout, `BoardCol` / `InfoCol` decomposition per [playarea.md](../playarea.md).
Move entry is deliberately **not** `useWordSubmit` — that hook models a
found-words game (dedup against a growing set, points per word); here a
submission is a chain *append* whose legality depends on the word before it, so
validation lives in [`lib/board.ts`](../../src/letterboxed/lib/board.ts)
(`rejectReason`, ordered so the most actionable complaint wins — "Must start
with T" beats "Not a word") and the commit is a plain RPC.

**The chain strip sits ABOVE the board** (`<ChainStrip>`), not in the info
column: the chain is the game's central state — what you've played, and
therefore what letter the next word must start with — and on a phone the info
column is off-canvas, so a readout you need on every turn can't live behind a
sheet. The **last word carries an ×**, and that is the whole undo affordance
(§5). The strip keeps its height when empty, so the first word doesn't shove
the board down (layout stability).

**The locked first letter.** Once the chain has a word, the next one must start
with its last letter — so the shared `<EntryRow>` seeds itself with it and
won't let you delete it. State is only the part the player typed (`draft`); the
shown value is `seed + draft`, **derived every render**, so playing a word
re-seeds the box with no effect and no stale state. `<TypedWord>` renders the
seed in its own style ("this letter isn't yours to delete"); **Backspace stops
at the seed**. Two more entry gates: only the twelve board letters are typeable
(`charFor` swallows everything else), and an appended letter that can't legally
follow the previous one (same side) **never enters the field** — refusing the
keystroke says "wrong" immediately, instead of letting you finish typing a word
you can already see is illegal. There's no `↑` recall — a submitted word goes
into the chain, not away.

**The board** is an SVG on a 0–100 square (`lib/board.ts → layout`), the twelve
letters laid clockwise from the top-left so the four sides read as one loop.
Clicking a letter appends it to the draft; **clicking the word's current last
letter again submits** (unambiguous, since a letter can never legally follow
itself). The below-board slot is the shared reserved-height swap box: entry row
↔ own-move pill ↔ "Chain is full — remove a word" ↔ the terminal verdict. A
full chain freezes the **entry** but leaves the chain **editable** — two
different gates, deliberately, because taking a word back is then the only move
on the board.

**Turn log** (`GameTurnLog`): one `<tr>` per event in the shared `<TurnLog>`
atoms, with coverage as its own column (`7/12`) so the numbers line up. Bar
colours: a **played word is green** (landing a legal word on this board is
unambiguously progress, unlike a wordle guess), **help is amber** (matching the
Hint/Spoiler buttons), retreats are **neutral** (in turn-coop an undo is a
sacrifice made for the next player — red would misdescribe it). Every word is
click-to-define. The shared whose-moves picker applies (coop "Team" + players;
compete "All", defaulting to you; a rival's rows fill in at terminal).

**Turn-history replay** — the shared `#N` handle + `useHistoryViewer`, keyed by
**log position**. The snapshot
([`lib/history.ts`](../../src/letterboxed/lib/history.ts)) is a **fold**, which
is the payoff of the events table being append-only: a chain isn't a board that
accumulates, it's a stack that can also shrink, so `chainAt` just runs the four
rules forward — `played` push, `undone` pop, `cleared` empty, help nothing. The
boundary is **inclusive** (viewing move N shows the chain *after* it — the only
reading that makes an `undone` row show anything at all, since its whole content
is the word no longer being there). `#N` is live only when the shown rows are
the board's own sequence (`boardIsShown`); any key or click exits, per the
shared viewer contract.

**Info column**, canonical order: the `<StateLine>` (the game in two fractions —
letters covered / 12, words used / cap **with par named in the label**, since
"3/5" alone says nothing) → `TurnStatusLine` (turn-coop only) →
`OpponentStrip` (compete: `7/12 · 2w` per rival — kept at terminal too, unlike
wordiply's verdict switch: coverage is the story after a coverage race — the two public numbers, never
the words; `out` for a conceder) → the action row (coop: Hint + Spoiler + End;
compete: Concede) → the revealed solution ("Solvable in two: DEMOTIC → CRAVING",
click-to-define) → help line → setup disclosure → the log.

**Mobile** — the standard conversion (`useInfoSheet` + `<InfoSheet>` +
`shared.mobileFill`), and deliberately **no `<MobileStatusBar>`** (the adoption
rule's clearest non-adopter): the board shows which letters are covered, the
chain strip shows the words, and the cap is restated by the accepted-word pill
("APPLE — 2 words left") after every move — so `<StateLine>` renders in the
info column/sheet only. The chain strip's reserved height is **chain-aware**:
`BoardCol` estimates rows from the live chain (`lib/chainRows.ts`) and a chain
that outgrows the base reservation (2 rows / 3 on a phone) takes the extra out
of `--avail-h`, shrinking the board once rather than scrolling the page. The
`waitingTurnPill` covers whose-turn on the phone surface. See
[mobile.md](../mobile.md).

**Coop peer narration** (`useGlobalFeedback`): a teammate's word changes *my*
board, so the header pill says so — `TRACE (7/12)`, "undid TRACE" (named, so
peers know which word came off), or "cleared the chain". Help narrates on two
channels at once — the header names the act, the local slot carries the
content (see §6 Hints). Compete has no narration — the race ends on first solve and the
OpponentStrip already shows live progress (wordiply and strands are the same).

**Celebration**: confetti at the moment the board is covered — coop's win, and
compete's for whoever got there first ("All twelve! 🐍").

### Print to PDF

The **track family** (`common/pdf/columns`, three to a page): coop is one
"Team" track, compete one per player whose chain is visible — mid-race that's
just yours (`players_state` masks rivals), at terminal everyone. Each track:
the square, the standing, the numbered chain, the full move log — retreats and
help included, because "what did we try?" is most of what a finished game is
worth keeping.

A covered letter moves its encoding from colour to **weight**: a heavy black
ring + bold glyph vs a thin grey ring — it survives a photocopier, which is the
test [pdf.md](../pdf.md) sets. The solution prints **only if the players
revealed it on screen** (`pdf/model.ts` pins this) — printing it regardless
would route around the Reveal gate and hand the answer to someone still
playing. `->` not `→` (WinAnsi).

---

## 9. Modes (coop / compete)

| | coop | compete |
|---|---|---|
| chain | **one, shared** — every player's row lock-stepped; anyone submits (or turn-by-turn, opt-in) | **private per player**, same board; rivals see only letters-covered + word-count |
| help | Hint + Spoiler, unpenalized, logged | **none** — either rung is a win button |
| ends | all twelve covered (won) / timeout (lost) / manual (ended) | **first to cover all twelve within the cap — the race ends** / timeout resolves on coverage / all-conceded / manual |
| undo / clear | undo refunds; costs a turn in turn-coop; clear refused there (no FE surface anywhere) | undo your own chain freely |
| players | `[1, 6]` (solo allowed) | `[2, 6]` |

Compete's timeout comparator — most letters covered → fewest words →
**co-winners** on an exact tie — resolves from standing (the boggle / scrabble /
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
`setup.psql`): `gameplay_test.sql` — the chain rulebook. The coop happy path
(append, coverage, log, status sync), the rejections (not playable / wrong
start letter / duplicate / chain full), undo's **refund** (the property that
makes the cap a shape constraint), clear, the coop win on covering twelve,
compete's actor-only writes + the `players_state` chain mask, the conceded
exclusion, and the timeout co-winner tie. The realtime-publication memberships
are guarded centrally (`supabase/tests/common/realtime_publication_test.sql`);
the gametype registrations by `clubs_gametypes_test.sql`.

**Vitest** (`src/letterboxed/`): `lib/solve.test.ts` (the help BFS — shortest
path, the greedy tie-break, stuck vs unreachable), `lib/history.test.ts` (the
fold + the inclusive boundary), `pdf/model.test.ts` (the print model, incl. the
reveal gate).

**Edge** (`deno test`): `letterboxed-build-board/board_test.ts` — the pure
core: `partitionSides` (both seed words playable on every output; null on a
genuinely unpartitionable pair), `isPlayable`, `isOneWordSolvable`,
`letterMask` parity with `common.word_letter_mask`.

**e2e**: `letterboxed.e2e.ts` (a coop game played through),
`letterboxed-print.e2e.ts` (the PDF).

---

## Deferred

- **Rare-letter weighting for the seed pool** (wordwheel's precedent), so
  J/Q/X boards appear deliberately rather than at their natural frequency.
  Defers cleanly.

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
