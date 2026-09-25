# Cross-game consistency — the six audited games against each other

**Worked before the ten remaining games open.** Joel, 2026-09-24: before
auditing any more games, check the six that closed — psychicnum, connections,
wordle, spellingbee, codenamesduet, wordwheel — for two things:

- **Names.** Things that do the same job carry the same variable, prop,
  function, class and SQL name.
- **Placement.** Knowledge about a common or shared part lives in that
  folder's `doc.md` or the thing's docstring; a game mentions it briefly, with
  a pointer.

This plan is the survey's findings (2026-09-24) and what is left of them. The
ten remaining games are audited against the names settled here. Line numbers
are as of the survey and will rot; the file and the name are the handle.

Already consistent, and not work: the `useGame` returns (`game` / `loading` /
`failure`), the history names, `summaryRows`, `localFeedbackSlot`,
`terminalMessage`, the reveal pairs (`<noun>Shown` / `toggle<Noun>`), the
`act*` bindings and their order, every `db.ts`, and in SQL the table, view,
policy and RPC names and their parameters.

---

## 1. First step — the "I" prefix (decided 2026-09-24)

Facts about the viewing player are named both ways, sometimes in one file:
`myConceded`, `mySolved`, `myAgentsDone` beside `selfId`, `selfSolved`,
`selfWon`, `selfBudget`, `selfEliminated`, `selfRankIdx`, and codenamesduet's
`viewerFinished`. The shared `useStandardGameActions` takes both `myConceded`
and `selfSolved`. docs/playarea.md's prop list uses both, so nothing picks
one.

**The ruling: `my`, never `self`, and a preference rather than a table.**
`self` reads as "this component"; `me` is always a person. A name about the
viewing player reads clearly as being about me; a boolean reads as a yes/no
question — `is…` by default, `amI…` where that is the clearer question. Pick
the one that reads most naturally: `isMyTurn` (not `amIOnTurn`),
`isEliminated`, `myId`. The viewing player's standing reads as a set with
`isTerminal` / `isLocallyTerminal`, so it is `isConceded`, not `amIConceded`
(Joel, 2026-09-24: "hard to read") — the full set is docs/win-lose.md → Where
a player stands. A bare past participle is not a boolean name — `won` may be
a message or a winner — so a flag always carries its `is` / `amI`. How much
name is scope-sized: a small
component that shows only me takes the bare word (`solved`); state, and a
long component, or any component that also shows the other players, carries
the full name.

This goes into docs/code-conventions.md, then §4's renames are picked one
name at a time by it, not swapped in mechanically.

## 1a. Every piece of state carries a comment (Joel, 2026-09-24)

Every `useState` (and `useRef` holding state) gets a short comment above it
saying what it holds — its shape and meaning — however obvious it looks, and
a name that says the same. psychicnum's `BoardCol.tsx`:

```ts
const [picked, setPicked] = useState<string | null>(null)
```

holds the word the player has picked and not yet guessed; neither the name
nor a comment says so (`pickedWord`, perhaps). This goes into
docs/code-conventions.md, and the six games are walked for it.

## 1b. Picked, not selected (decided 2026-09-24)

A tile the player has chosen but not committed is "picked" in some places and
"selected" in others, sometimes in one file: psychicnum's `BoardCol` holds
`picked` and hands the board `selected`; `common/board-cursor` has the
"selection cursor" whose callback asks "can this piece be picked";
connections and boggle use both. (`picker` — the setup dropdowns — is a
different thing and out of this.) Replaces §4's N10.

**The goal:** reading a name like `setPicked`, never having to wonder which
of three things it is:

- **the cursor** — the blue ring the arrows move;
- **the pick** — the black frame on a thing I clicked (or reached with the
  cursor and pressed Space on) and have not submitted;
- **the move in flight** — what I sent to the server, held in state until its
  result lands (§4's N3, `inFlight…`).

**The ruling — one word each:**

- **cursor** — where the cursor is (`cursor`, `showCursor`). "Selection
  cursor" stays as the name of the kind, against the letter-grid cursor;
  inside cursor-only code (`common/board-cursor`, `<SelectionList>`) a local
  may be `selection`, since there is only the one thing there.
- **pick / picked** — the pick, and only the pick.
- **in flight** — the move sent to the server (§4's N3).
- **choice / choices** — a general choice: a setup setting, one of several
  options (`useStickyChoice`, `PuzzleChoice`), as the code already has it.

"Selected" has no job outside the cursor's own code.

## 1c. The server bounds a setup number; the form picks the menu (Joel, 2026-09-24)

Where a setup number is arbitrary — changing it forces no real change in the
game logic or the UI — `create_game` checks a sane RANGE and the setup form
owns which values are offered, so a new choice (an 8-guess game) is a
frontend edit alone. waffle already works this way: `extra_swaps` is checked
`0..15` while the form offers 3 / 5 / 8. psychicnum's `max_guesses` moved to
`1..9` (the ceiling of its `players.guesses_remaining` column check) with the
`max_guesses` rename. Real limits stay exact: the six dictionary bands, the
rank ladder, board positions, seat counts.

The survey of 2026-09-24, ruled by Joel the same day:

| game | setting | server | form offers | ruling |
|---|---|---|---|---|
| codenamesduet | `turns` | 7..15 (was exactly 9, 10, 11) | 9, 10, 11 | widened, SQL only — done |
| bananagrams | `hand_size` | exactly 15, 21 | 15, 21 | keep |
| wordle | `max_guesses` | 5..8 | 5, 6, 7, 8 | keep — a bigger budget needs a UI change, so it is not arbitrary |
| boggle | `win_percent` | 50..100, steps of 5 | 50, 55 … 100 | keep |
| letterboxed | `extra_words` | 0..8 (was 0..5) | 0 … 5 | widened — done; `max_words`'s column check went 2..7 → 2..10 (`20260924000005_letterboxed_max_words_range.sql`) |
| psychicnum | `word_count` | 5..20 | 5 … 20 | keep |

Already wider than the form, and fine: waffle `extra_swaps`, strands
`hint_cost` (1..10 vs 1–5) and `min_word_length` (3..8 vs 3–6), boggle
`min_word_length` (3..9 vs 3–5).

## 2. Open question — the renames that change stored data

Each of these renames a value stored in prod, so each needs a new migration
and a backfill. Park them, or schedule some?

- ~~**codenamesduet's loss states.**~~ Done 2026-09-24: `lost` plus the reason
  `assassin` / `turns` / `timeout`
  (`20260924000000_codenamesduet_lost_reason.sql`). "Clock" means only the
  countdown timer.
- **`status` count keys.** `found_secrets_count` (psychicnum),
  `found_words_count` (the bee games), ~~`matched_count` (connections)~~ —
  done 2026-09-24: `found_categories_count`, the `players` column and the
  status key (`20260924000002_connections_found_categories_count.sql`),
  ~~`greens_found` (codenamesduet)~~ — done 2026-09-24:
  `found_agents_count` (`20260924000001_codenamesduet_found_agents_count.sql`).
  The shape is `found_<noun>_count`, "found" even where a game's own verb
  differs.
- ~~**Setup keys for the word band.**~~ Done 2026-09-24: a band is a number,
  and its key says so — `legal_band` / `required_band`, as boggle and
  letterboxed already had it. wordle's `legal_guess` (setup and column) and
  the bee games' `legal` / `required` renamed, in stored setups and the
  clubs' saved ones (`20260924000003_word_band_setup_keys.sql`). A game with
  ONE band names it `band`: psychicnum's `difficulty` → `band`
  (`20260924000007_psychicnum_band.sql`). Owed when their areas open:
  boggle's bare `band` → `required_band`; waffle's and wordiply's
  `difficulty` → `band`. wordle's `answer_source` → `answer_band`
  (`20260924000008_wordle_answer_band.sql`): 0 — the curated list — is not a
  real band, but reads clearer as one; `answerMaxBand` in
  `src/wordle/lib/setup.ts` explains why its floor is 2.
- ~~**The guess budget.**~~ Done 2026-09-24: psychicnum's setup `guesses` →
  `max_guesses`, as wordle has it, and `totalGuesses` → `maxGuesses`
  (`20260924000004_psychicnum_max_guesses.sql`). codenamesduet's `turns` stays:
  its budget is turns. The counting direction: psychicnum counts UP like
  wordle — `players.guesses_used` and the status key `guesses_used`, against
  `setup.max_guesses`, which the club-page line reads off the row's setup
  ("3/7 guesses", coop only) (`20260924000009_psychicnum_guesses_used.sql`).
- ~~**The guessed word's column.**~~ Done 2026-09-24: `wordle.events.guess` →
  `word`, as every other event table has it
  (`20260924000006_wordle_events_word.sql`). `submit_guess`'s `guess`
  parameter stays (psychicnum's is `guess` too); the board's display rows
  `{ guess, colors }` are §4's N16.

## 3. Bugs found by the survey

Each needs a failing test before its fix.

- ~~**wordle lets a conceded racer guess.**~~ Fixed 2026-09-24: a conceder's
  guess — the target itself, in the failing test — was accepted; it now
  answers the "Already conceded" race (PN507), as the other four do
  (`wordle/concede_test.sql`).
- ~~**An ending some games' FE does not hear.**~~ Fixed 2026-09-24: the last
  concede in wordle (Reveal had no answer) and in connections, and
  connections' timeout (a race's rivals' guesses never loaded), now write
  their game row — in `wordle._finish_compete`,
  `connections._maybe_finish_compete` and `connections.submit_timeout`. The
  failing tests check the row's `ctid` moved; the rule is in
  docs/common-schema.md → Concede. Then across all sixteen games:
  `src/guards/endingTouchesGame.test.ts` (planted — removing wordle's touch
  names `wordle.concede`) found 15 more entry points in 7 games — bananagrams,
  boggle, crosswords, letterboxed, setgame, stackdown, strands — each now
  touched; no exceptions list.
- ~~**`wordle.end_game` does not lock its row**~~ Fixed 2026-09-24, and it
  was six functions: `end_game` in wordle, bananagrams, boggle and crosswords,
  and `submit_timeout` in boggle and crosswords. Unlocked, an End or timeout
  racing the winning move read `playing`, then overwrote the win with
  `ended`. Each now reads its row `for update`; `src/guards/endLock.test.ts`
  (red on the six, planted) holds it for every `end_game` and
  `submit_timeout`.
- ~~**Concede in a deleted game faults.**~~ Fixed 2026-09-24, and it was every
  game: all fifteen concedes end in `common._set_conceded`, whose missing-row
  branch raised the PN481 fault. It now raises the shared deleted-game race
  (PN485); PN481 is retired. Failing tests in `spellingbee/concede_test.sql`
  (the `common.concede` path) and `wordle/concede_test.sql` (a game's own);
  `gameDeletedFirst` now holds `_set_conceded` too.
- ~~**An empty refetch keeps the error page.**~~ Fixed 2026-09-24: psychicnum's
  and codenamesduet's `useGame` now clear the failure right after the game
  read succeeds, before the zero-rows return, as wordle and connections do —
  so a game deleted during an outage reads "not found", not the outage.
  Failing tests in each `hooks/useGame.test.ts`. The bee pair's
  `makeBeeGame` reads its header once and clears its rows' failure, so it
  cannot hit this. Owed when their areas open: the other ten games hold
  failure several ways (split header/rows failures, one-shot header reads) —
  check each for a zero-rows return ahead of its clear.
- **codenamesduet un-dims a guess before its reveal lands** (found 2026-09-24,
  in N3; not yet looked at). `inFlightPos` is cleared when `submit_guess`
  replies, but the reveal arrives separately, by realtime — so the guessed
  tile can read as untouched for a beat: the flash psychicnum's
  `submittedLanded` comment names. psychicnum and wordle hold the dim until the
  result is on the board; connections needs no such hold (the answer is local).
- **codenamesduet lets a player with no words left guess in sudden death**
  (found 2026-09-24; not yet fixed). The rulebook: *"If only one player has
  words remaining, that player guesses. If both do, you may guess in any order
  without discussing strategy"* — and a player whose partner's agents are all
  found "has no words left to guess". The doc and `submit_guess` say "either
  player may guess", with no check. The server should refuse the guess, and
  §3a step 7's `isMyTurn` keeps the board from offering it.

## 3a. Where a player stands — the formulas, applied (agreed 2026-09-24; not started)

The terms for a player's standing — terminal, locally terminal, conceded, still
playing, whose turn, read-only — were used loosely, recomputed per game under
six names (`isStillPlaying`, `showInput`, `locallyDone`, `isLocallyDone`,
`canPlay`, `interactive`), and in two places wrongly. The agreed definitions
live in docs/win-lose.md → Where a player stands, one formula per term with
what it means and what it doesn't; this is the work of making the code say
the same. N4 (may the board take a click) folds into it.

**The rules this carries** (Joel, 2026-09-24):

- **One name, one meaning.** Two close ideas get two names, never one name
  stretched over both.
- **A negation is `!isFoo`, or an `isNotFoo` that means exactly `!isFoo`** —
  written `const isNotFoo = !isFoo`, never a formula of its own, and never
  negated (`!isNotFoo`). A negated idea that needs its own formula is a new
  term, with its own definition.
- **Locally terminal is "not playing any more, for whatever reason"** —
  finished, eliminated, out of budget, or conceded. `conceded` stays the one
  separate fact that forfeits a win. No new word for either.
- **The turn pointer is a record (`turnHolderId`); `isMyTurn` is the human
  claim** — still playing, and the move is mine. Whether a game has turns at
  all is its own fact (`isTurnBased`), never read off a null pointer.
- **An interactive board is not the same as "my turn"**: scrabble lets a
  waiting player try tiles out. A board takes `isBoardInteractive`; a commit
  asks `isMyTurn`. `readOnly` is retired.

**Steps**, in order — each its own commit, each with a failing test first
where it fixes a behavior:

1. ~~**The docs.**~~ Done 2026-09-24: the formulas in docs/win-lose.md →
   Where a player stands; §1's naming preference (with `isConceded`) and the
   `isNotFoo` rule in docs/code-conventions.md → Names about the viewing
   player; docs/playarea.md and docs/naming.md read `isBoardInteractive` and
   the standing terms, not `readOnly` / `isLocallyDone`; codenamesduet's doc
   states the rulebook's sudden death. docs/games/stackdown.md's `readOnly`
   goes with its game in step 6.
2. **The database.** `common._set_conceded` also sets `locally_terminal`; one
   migration backfills `locally_terminal = true` wherever `conceded` is;
   `common._advance_turn` skips locally terminal players, not only conceded
   ones (latent today: turn order is coop-only and locally terminal is
   compete-only, so they never meet); the original migration's comment ("NOT
   a second spelling of `conceded`") gets a note naming the change. pgTAP: a
   concede sets both flags; the turn skips a locally terminal player.
   Rehearsed over a fresh prod backup (the cut from `supabase migration list
   --linked`).
3. **The shared page.** `useCommonGame` reads `turn_seat` and returns, for
   every PlayArea: `isPlayer`, `isConceded`, `isLocallyTerminal`,
   `isStillPlaying`, `turnHolderId`, `isTurnBased`, `isMyTurn` (the new
   meaning — today's `isMyTurn` is the pointer alone, and becomes
   `turnHolderId`), and `isBoardInteractive` (with `draftsOffTurn`, a new
   manifest field, true for scrabble).
   The pause roster becomes `!p.locally_terminal`. GamePage's own readers
   (the turn bell, the timer) move to the new names.
4. **The Concede bug** (found here): Concede hides only on `isTerminal ||
   myConceded` (`useStandardGameActions`), so a compete racer who has SOLVED
   can concede and forfeit a win they may have earned. It hides on
   `isTerminal || isLocallyTerminal`. Failing test first.
5. **The shared functions' parameter.** `myConceded` → `isConceded` in
   `useStandardGameActions` and `FeedbackMessage.outOfRace` — sixteen call
   sites each, a rename only.
6. **All sixteen games** (Joel: a future audit must never read an old-meaning
   `isLocallyTerminal`) — one commit per game, that game's e2e run each time.
   Each reads the page's values instead of its own: psychicnum's
   `isStillPlaying` / `canPlay`, connections' `showInput` / `locallyDone` /
   `interactive`, wordle's `isLocallyDone` / `showInput` / `readOnly`, the bee
   pair's `isLocallyDone` / `readOnly`, codenamesduet's `readOnly` /
   `cellsClickable` double flip, and the ten unaudited games' equivalents.
   Every board takes `isBoardInteractive` and a required handler (N4):
   connections' `interactive` and codenamesduet's `cellsClickable` go, and
   psychicnum and the bees stop passing `undefined` for "inert". The
   `notMyTurn` props become `!isMyTurn` (or `isNotMyTurn`) — checking per
   board that the ending's own look wins over a "teammate's move" dim, since
   `!isMyTurn` is now also true at the end and for a player who is out. Each
   unaudited game is checked for `draftsOffTurn`.
7. **codenamesduet's turns.** It keeps its turns in its own table
   (`current_clue_giver` and the phase), so the shared `isMyTurn` is always
   true there. It seats both players (`turn_seat`) and sets the shared pointer
   to whoever must act now — the clue-giver while a clue is owed, the guesser
   once it is given. In sudden death it supplies `isMyTurn` itself: the move
   belongs to whoever still has words to guess (the rulebook's, below), which
   one pointer cannot say when both do.

## 4. Naming — cheap renames (code and `supabase/sql/` only)

Most worth fixing first.

| # | today | settle on |
|---|---|---|
| ~~N1~~ | `gameOver` is the ending (`TerminalOutcome \| null`) on psychicnum / connections / wordle's `Board` and `BoardCol`; in codenamesduet it is a boolean, and its ending is `terminalOutcome` | Done 2026-09-24, the other way round: the ending is `terminalOutcome` everywhere (it says what it holds; `gameOver` reads as a yes/no), the yes/no is `isTerminal`, typed `TerminalOutcome \| null` in all four. The shared `gameOver*` CSS classes stay. `common/game-page/GamePage.tsx`'s own yes/no is `isTerminal` too, read off `is_terminal` (it was `ended_at !== null`) — the answer every PlayArea is handed. waffle's is outside the six |
| ~~N2~~ | the refused-word mark: `answered` (spellingbee `Letters`), `refused` (wordwheel `Wheel`), `reject` (wordle `Board`); the bee pair also swaps `answered` / `refused` between them | Done 2026-09-24: `refused` / `showRefused` in all three. The per-tile slice is `mark` in both bees, and the single tile's prop stays `answer` (`Letter`, `Tile`) |
| ~~N3~~ | the move still with the server: `inFlightWord` (psychicnum), `inFlightTiles` (connections), `pending` / `pendingWord` / `.inFlight` (wordle), `pendingPos` (codenamesduet) | Done 2026-09-24: `inFlight…` everywhere (`inFlightWord`, `inFlightTiles`, `inFlightPos`), and a board's per-tile/row local is `isInFlight`. psychicnum and wordle, whose result lands by realtime, share one shape in named steps: state `submittedWord` (the word I last sent), `submittedLanded` (its result is on the board), `inFlightWord = submittedLanded ? null : submittedWord` — `null`, not `''`, for nothing out. The single-flight `pending` is a different thing and stays |
| N4 | may the board take a click: `interactive` (connections), `cellsClickable` (codenamesduet), the handler left out (psychicnum, the bee games) | Folded into §3a, step 6: every board takes `isBoardInteractive` and a required handler |
| N5 | am I still in the game: `isStillPlaying` (psychicnum), `showInput` (connections, wordle — where it gates a help line) | `isStillPlaying` |
| N6 | psychicnum, the control, is the odd one: `turnHolderName` / `turnHolderColor`; `useGame` returns budget rows as `players`; the move answers `verdict` + `found_all` | `holderName` / `holderColor`; `playerBudgets`; `result` |
| N7 | the print model's `setup: SetupRow[]` (`common/pdf/eventLog.ts` and four game models) where the columns say `setupRows` | `setupRows` |
| N8 | "Game over" and "Already conceded" inside moves, written by hand at about fifteen SQL sites, none carrying `noted` (docs/envelopes.md says a race does) | one common helper each; closes wordle's missing check (§3) |
| N9 | Restart rewinds `current_turn_user_id` by hand in eight games' `replay_board`; docs/common-schema.md counts it as the common turn mechanism | move it into `common.reset_game` |
| N10 | `picked` (state) renamed `selected` on psychicnum's `Board` | §1b |
| N11 | wordle's `players: members` rename, with no stated reason (codenamesduet states one) | `players` |
| N12 | `totalGuesses` (psychicnum) vs `maxGuesses` (wordle); connections' print model `mistakes` / `maxMistakes` vs its columns' `mistakeCount` / `mistakeBudget`; codenamesduet's `turns` / `turnBudget` / `turnCap` and `turnNumber` / `currentTurn` | `maxGuesses`; `mistakeCount` / `mistakeBudget`; `turnBudget` / `turnNumber` |
| N13 | connections' `selfEliminated` recomputes the `isEliminated` its `useGame` returns | use `isEliminated` |
| N14 | codenamesduet: `DuetPrintModel` / `buildDuetPrintModel`, `PrintCell` / `drawCell`, `CodenamesduetAISuggestCompanion.tsx`, the pdf `Mark` type that clashes with common's `Mark<T>` | `CodenamesduetPrintModel` / `buildCodenamesduetPrintModel`, `PrintTile`, `AISuggestCompanion`, `KeyRole` |
| N15 | spellingbee's board is `Letters.tsx`; its glossary word is "hive" | `Hive.tsx` |
| N16 | wordle declares no `Player` type; its row types `SubmittedRow` and `HistorySnapshotRow` are one shape; `WordlePlayerState` where the house form is `PlayerRow` | `Player`, one `BoardRow`, `PlayerRow` |
| N17 | wordle has two different functions named `answerSourceLabel` (`manifest.ts`, `lib/setupSummary.ts`) | two names |
| N18 | theme tokens without the quality ending docs/tokens.md asks for (`--spellingbee-hex`, and the like in wordwheel, codenamesduet, connections, wordle) | `-fill-color` / `-ink-color` / `-edge-color` |
| N19 | `PlayArea` exported in wordle, spellingbee, wordwheel, codenamesduet; nothing imports it | unexported |
| N20 | the End / Concede / Restart section header in `PlayArea.tsx`, worded four ways (wordle's says "Replay") | psychicnum's wording |
| N21 | SQL: `wordle.submit_guess` names locals `p_…`, the prefix common keeps for parameters; codenamesduet's `submit_guess` takes `target_position` for the `guess_position` column, and its answers still use old keys (`word`, `count`, `from_ai`, `by_seat`); "You are not in this game" means two things (PN253 vs psychicnum PN271, connections PN250) | match the columns; distinct wording |
| N22 | lower: `LOSS` vs `COMPETE_LOSS`; `const mode` / `isCompete` locals in some games, inline in others; `announceOpponentProgress` vs `narrateRankClimbs`; `players.find(...)` by hand where `memberById` is already imported | settle when the file is open |

**Shared code a game copies:**

- `PuzzleAnswer` (connections, copied in strands) re-declares common's
  `NextPuzzle`.
- Flat index ↔ board position: codenamesduet names it (`positionAt` /
  `cellAt`); psychicnum and connections write the arithmetic inline. A home
  in `common/board-cursor`.
- The bee pair copies `splitCustomLetters`, `TARGET_RANK_CHOICES`,
  `NO_TARGET` and `legalError`; `shared/bee-games` exists for them. Their two
  `PlayArea.tsx` files are identical but for names, and nothing says why the
  whole component is two copies.
- The per-opponent "did their number go up" watcher is hand-written twice
  (psychicnum, the bee games) with different start-up logic; a candidate for a
  shared hook.

## 5. Placement — docs and comments

**The shared doc is wrong and the game is right.** Fix the owner:

- The `common.end_game` header in `common.sql` says status is assigned; the
  body merges it.
- `usePeerFeedback`'s docstring says delta signals "stay hand-rolled"; wordle
  sends its `solved` flag through it.
- `common/game-page/doc.md` says a game's `useGame` opens a per-tab channel;
  connections' is stable-named, on purpose.
- docs/naming.md: the list of games with a `## Vocabulary` section is stale
  (only psychicnum lacks one), and it says psychicnum's guess is a number (a
  word) and codenamesduet's `submit_guess` takes a clue and count (a
  position).
- `common/feedback/doc.md` lacks the phone header's width budget, which lives
  only in its `todo.md` and codenamesduet's `lib/answer.ts`.

**Game comments that are now wrong:**

- The `replay_board` headers in psychicnum.sql (names a `guesses` table that
  is gone) and connections.sql (says a fresh game's status is NULL;
  `create_game` seeds it). connections' `replay_board` also resets status to
  `{}` where `create_game` seeds `{matched_count: 0, mistake_count: 0}`;
  harmless on screen, since `labelFor` falls back to 0, but the two should
  agree.
- codenamesduet.sql's `end_game` comment ("flip into review mode", which is
  `useCommonGame`'s job); connections.sql's claim that `submit_timeout` writes
  a connections table; codenamesduet.sql's pointer to a no-`'active'` rule "in
  common.sql" (it is in docs/states.md).
- wordwheel `manifest.ts`: "common.concede … with NO target_rank" (status
  merges now).
- codenamesduet `Board.module.css` (says the shared `.tile` sets
  `container-type`; `.tileFace` does, and hover is a shadow and a lift) and
  `lib/terminal.ts` (says a long verdict wraps; it truncates).
- spellingbee `Letter.module.css` ("black edge"; the rule uses
  `--tile-spent-edge-color`).
- codenamesduet `db.ts` points to docs/code-conventions.md for
  `extra_search_path`; docs/supabase.md has it.
- spellingbee `db.ts`, `doc.md` and `spellingbee.sql`, and wordwheel.sql: "the
  uniform seam every game reads" — connections and codenamesduet read `games`.
  spellingbee.sql also says the word lists are gated, against its own
  "Nothing is hidden".
- spellingbee and wordle `lib/setup.ts` validators say "or `null`"; they
  return `{}`.
- psychicnum `manifest.ts` still calls a status key `outcome`.
- The concede lock-order comment (psychicnum, connections, wordle.sql) says a
  concede "reads the other's uncommitted" state; docs/common-schema.md's
  wording is the right one.

**Copies to cut to one line and a pointer:**

- Why a manual end touches a game table (the `end_game` only writes
  `common.games` reasoning): about fifteen copies across the game docs and SQL;
  the owners are docs/common-schema.md's manual-end section and
  docs/supabase.md.
- The New-game paragraph in wordle, spellingbee, wordwheel and codenamesduet
  docs; the owner is `common/actions/doc.md`.
- The binding / feedback-slot / menu blocks in every `PlayArea.tsx`; the
  owners are `common/actions`, `common/feedback` and `menu/gameMenu.ts`. The
  slot line has also drifted (the owner says the lowest-ranked message
  shows).
- connections' channel-naming paragraph; the owners are `common/realtime` and
  `common/pause-suspend`.
- The bee docs' rank computation (keep the player-facing rule; point to
  `shared/rank-ladder`) and the mark's nonce clause.
- codenamesduet's arrow-then-second-key explanation (`common/board-cursor`)
  and its board-marks list, which cites a plan id.
- The SECURITY DEFINER helper explanation repeated in wordle's doc from
  psychicnum's (docs/code-conventions.md).
- The "RETIRED" rank-ladder block in spellingbee.sql and wordwheel.sql: keep
  the `drop` and one line on why, drop the history.

**Todo items that belong elsewhere:**

- The "don't fold the pair's board CSS" ruling (wordwheel `todo.md`, copied
  in spellingbee's) moves to `shared/bee-games/todo.md`.
- spellingbee's WordList-markers item is already owed in
  `common/word-list/todo.md`; delete the game copy.
- spellingbee's struck-through Soon item is done; delete it.

**One term per common part** — to settle, then use in all six docs:

| part | variants in use |
|---|---|
| the per-player strip (`OpponentStrip`) | Found strip, Guesses strip, Rank strip, budget strip, opponent strip |
| the club-page line | club-list label, club label, club-list readout; docs/game-status-labels.md says "status line" |
| the events readout | turn log, guess log, the log, event log |
| the setup dialog | start-game dialog, setup dialog, setup form; the owner says start-a-game dialog |
| the below-board slot | below-board pill, the pill under the board, the local slot |
| teammate narration | header line, peer lines, narrated in the header |

wordle's doc also calls its channel "one room per game", which is per tab in
fact.

**psychicnum's `doc.md` lacks what the other five have:** `### Vocabulary`,
the "the end of a game is on the board" intro paragraph, the Realtime
paragraph, the FE submissions and Frontend ledes, the "what is psychicnum's
own" list, the New game paragraph, and tables in Tests. Its tree (and
connections') leaves out `CelebrationBlockingModal`, and it says a racer sees
each rival's remaining budget, which the `OpponentStrip` does not show. The
psychicnum and connections intros open paragraphs in bold where the others do
not.
