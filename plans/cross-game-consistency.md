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

**The order of what is left** is in [common-tables.md → The
path](common-tables.md#the-path): §3a step 6, 7c and §4 first; then
common-tables, which builds step 7; then §5.

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

**The names** (Joel, 2026-09-27; built in §4's pass): connections'
`SelectionMap` / `selections` → `PickMap` / `picks`; the shared `.tile.selected`
and `--tile-selected-edge-width` / `-color` → `.tile.picked` and
`--tile-picked-edge-…`; `act-clear-selection` "Clear selection" →
`act-clear-picks` "Clear picks"; `selected` → `picked` in psychicnum's
`Board`, setgame, and scrabble (`setPicked`, `togglePick`, "Swap N picked").

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
- **The Stop's `reason`.** A Stop writes `status.reason = 'manual'` in every
  game but letterboxed (which writes a `stopped` flag); the term is
  `stopped`, so `'stopped'`. And stackdown's coop win
  writes `'cleared'` where the other games write `'solved'` (its todo). The
  words themselves are step 7's (plans/game-cards.md → After the cards).
- ~~**The guessed word's column.**~~ Done 2026-09-24: `wordle.events.guess` →
  `word`, as every other event table has it
  (`20260924000006_wordle_events_word.sql`). `submit_guess`'s `guess`
  parameter stays (psychicnum's is `guess` too); the board's display rows
  `{ guess, colors }` are §4's N16.

## 3. Bugs found by the survey

Each needs a failing test before its fix.

- ~~**wordle lets a conceded racer guess.**~~ Fixed 2026-09-24: a conceder's
  guess — the target itself, in the failing test — was accepted; it now
  answers the "Already conceded" race (PN483, the shared helper), as the other four do
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
- ~~**codenamesduet un-dims a guess before its reveal lands**~~ Fixed
  2026-09-25: psychicnum's shape — state `submittedPos`, derived
  `submittedLanded` (the tile is no longer guessable for me: every accepted
  guess writes it) and `inFlightPos`; a tile click and Enter wait for the
  reveal too, since the gap also let a second guess out. Failing test first
  (`PlayArea.test`). Found 2026-09-24, in N3: `inFlightPos` was cleared when `submit_guess`
  replies, but the reveal arrives separately, by realtime — so the guessed
  tile can read as untouched for a beat: the flash psychicnum's
  `submittedLanded` comment names. psychicnum and wordle hold the dim until the
  result is on the board; connections needs no such hold (the answer is local).
- ~~**codenamesduet lets a player with no words left guess in sudden death**~~
  Fixed 2026-09-25, with §3a step 7: `submit_guess` refuses them ("No words
  left to guess", PN509, a race), and their board is inert and dimmed; failing
  pgTAP first in `supabase/tests/codenamesduet/turn_pointer_test.sql`. Found
  2026-09-24: The rulebook: *"If only one player has
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
2. ~~**The database.**~~ Done 2026-09-24: `common._set_conceded` also sets
   `locally_terminal`; `20260924000010_conceded_is_locally_terminal.sql`
   backfills it wherever `conceded` is; `common._advance_turn` skips a
   locally terminal seat (latent: turn order is coop-only); the 2026-09-19
   migration's comment names the change; docs/common-schema.md says so.
   Failing pgTAP first in `common/concede_test.sql` and
   `common/turn_order_test.sql`. Rehearsed over the 2026-09-24 22:35 prod
   backup — which holds no conceded rows, so the backfill is a no-op there
   today; drift none. Not yet deployed.
3. ~~**The shared page.**~~ Done 2026-09-24: `useCommonGame` reads
   `turn_seat` and returns the eight standing terms, and `GamePageCtx` hands
   them to every PlayArea; `isMyTurn` has the new meaning, and the pointer is
   `turnHolderId` everywhere (`currentTurnUserId` renamed in all sixteen games
   and `TurnStatusLine`, nothing else changed in them). `draftsOffTurn` is an
   optional manifest field, true in both scrabble manifests (its `canPlace`
   ignores the turn in coop too). The pause roster is `!p.locally_terminal`.
   The bell rings on `isTurnBased && isMyTurn` — it used to ring for everyone
   when a free-for-all game restarted (failing test first, in
   `GamePage.test.tsx`); the timer never read the turn. Every game still reads
   a null `turnHolderId` as "no turns" and ignores the new terms; step 6
   moves them.
4. ~~**The Concede bug.**~~ Done 2026-09-24. Only waffle, wordle and strands
   told the hook a solver was out (`selfSolved`, which grayed Concede), so a
   racer out any other way — wordiply's fifth guess (ranked, may win),
   waffle's and wordle's spent budget, psychicnum's spent budget,
   connections' elimination — could still concede. Joel's rulings: nobody out
   has a reason to concede (a loss is already a loss; a finisher would only
   throw away a win, and ends nothing sooner), anyone may End for all, and
   there is only ever ONE flag, never a disabled one. So
   `useStandardGameActions` takes `isLocallyTerminal` (not `myConceded` /
   `selfSolved`): Concede hides on `isTerminal || isLocallyTerminal`, and End
   comes out on its own for a racer who is out. The server agrees:
   `common._set_conceded` refuses a locally terminal caller ("Already out",
   PN508, a race). Failing tests first (the hook's, with a one-flag invariant
   over every state; `common/concede_test.sql`). strands' `conceded_test`
   encoded the old solve-then-concede forfeit and now tests the refusal.
5. ~~**The shared functions' parameter.**~~ Done 2026-09-24:
   `FeedbackMessage.outOfRace` takes `isConceded`, and `useSingleFlight`'s
   docstring names `isLocallyTerminal`. No shared code says `myConceded` now;
   each game's own `myConceded` local goes in step 6.
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
   `notMyTurn` props become the page's `isWaitingForTurn` (still playing, and
   the move is someone else's — Joel, 2026-09-24: the audited boards dim only
   for that, never at the end or for a player who is out), and a board dims on
   `isWaitingForTurn && !isBoardInteractive`, so scrabble's live board does
   not. The waiting message and `TurnStatusLine` show on `isTurnBased` /
   `isWaitingForTurn`, never on a null `turnHolderId`. Each unaudited game is
   checked for `draftsOffTurn`. scrabble's commit follows step 8.
   A game's tests build their ctx through `whereIStand` (common/game-page,
   the page's own formulas), setting the facts — the roster's flags,
   `isTerminal`, `isTurnBased`, `turnHolderId` — and never a hand-written
   answer; a fixture that concedes sets `locally_terminal` too, as the server
   does.
   **Progress:** psychicnum done 2026-09-24 (its own `myConceded` /
   `isStillPlaying` / `canPlay` / `waiting` gone; pick vs commit gated
   separately; unit + its 8 e2e + the cross-game specs green). connections
   done 2026-09-25 (`myConceded` / `locallyDone` / `showInput` / `interactive`
   / `waiting` gone; `selfEliminated` reads `useGame`'s `isEliminated` — N13;
   unit + its 9 e2e + the cross-game specs green). Noticed, not changed:
   connections shows its help line while I wait my turn, psychicnum hides it.
   wordle done 2026-09-25 (`myConceded` / `isLocallyDone` / `showInput` /
   `readOnly` / `waiting` gone; `mySolved` stays, its own fact; unit + its 5
   e2e + the cross-game specs green). Its test "a racer who is done sees …
   Concede" had kept passing since step 4 only because its hand-set context
   said the racer was not out; built through `whereIStand`, it failed and now
   asserts End. Expect the same in each game's tests as it converts.
   spellingbee done 2026-09-25 (`myConceded` / `isLocallyDone` / `readOnly`
   gone; the hive takes `isBoardInteractive` and a required `onLetterClick`).
   The shared word engine's gate `useFoundWordSubmit({ isTerminal })` — which
   no caller passed the game's end — is `isMyTurn` (a commit asks it); boggle
   and wordiply pass the page's, and wordwheel bridges `!readOnly` until its
   own commit. Unit + spellingbee's, boggle's and wordiply's e2e + the
   cross-game specs green. wordwheel done 2026-09-25 (the same shape as
   spellingbee's; the Wheel takes `isBoardInteractive` and a required
   `onLetterClick`; unit + its 6 e2e + the cross-game specs, `concede`
   among them, green). Five of the six audited games are done;
   codenamesduet's `readOnly` / `cellsClickable` go with its step 7, since
   its turn is what decides them. The ten unaudited games are next, one
   commit each. waffle done 2026-09-25 (`myConceded` / `selfDone` / `readOnly`
   / `waiting` / its own `isPlayer` gone — `selfDone` was exactly
   `isLocallyTerminal`; `selfSolved` stays, its own fact; the Board takes
   `isBoardInteractive` for its `disabled` and adds the history viewer
   itself; the two comments still describing a gray Concede corrected; unit +
   its 9 e2e + the cross-game specs green). strands done 2026-09-25
   (`myConceded` / `isLocallyDone` / `waiting` gone; `boardDisabled` is
   `!isBoardInteractive || busy`, a word in flight staying its own; the hint
   stays un-turn-gated on `isStillPlaying`; unit + its 11 e2e + the
   cross-game specs green).
   **A bug it found, and four more games have it:** the out-of-the-race row
   of the action row places only Concede, which hides there — so the row
   has NO flag, End surviving only in the menu. For a conceder this has been
   so since End began coming back out for conceders (2026-09-04); step 4
   added strands' solvers to it. strands' row now places both exits (failing
   test first). The same row, Concede alone, is in wordiply, stackdown,
   letterboxed and crosswords — each gets the fix and a failing test in its
   own commit.
   wordiply done 2026-09-25 (`myConceded` / `isLocallyDone` / `active` /
   `waiting` gone; the entry freezes on `!isBoardInteractive`; its
   conceder's row now places End — failing test first. wordiply marks the
   CONCEDER alone: a racer who has spent five guesses is locally terminal too
   but keeps the playing row, which shows End since step 4 — kept, as the
   game's own choice; unit + its 4 e2e + the cross-game specs green).
   stackdown done 2026-09-25 (`myConceded` / `canPlay` / `canAskHint` /
   `isLocallyDone` gone; BoardCol's `readOnly` — the retired `viewing ||
   !canPlay` — is `isBoardInteractive` plus the history viewer and
   `submitting`, a word in flight; the hint pair keys on `isStillPlaying`;
   the conceder's row places End — failing test first; unit + its 9 e2e +
   the cross-game specs green). letterboxed done 2026-09-25 (`myConceded` /
   `isLocallyDone` / `chainEditable` / `waiting` / its own `isTurnGame` gone;
   the chain's × takes a word back, a move sent to the server, so it asks
   `isMyTurn`, and the entry freezes on `!isBoardInteractive || chainFull`;
   the conceder's row places End — failing test first; unit + its 15 e2e +
   the cross-game specs green). crosswords done 2026-09-25 (`myConceded` /
   `isPlayable` / `isLocallyDone` gone; `useGridKeyboard`'s own `readOnly`
   — navigable but not writable — is `isBoardInteractive`, the right way
   round; the conceder's row places End — failing test first; unit + its 14
   e2e + the cross-game specs green). **Correction:** the survey that found
   five games with the End-less row cut its output short. A check of every
   "You conceded" row finds FOUR more: boggle, setgame and scrabble place
   Concede alone, and bananagrams' row places no button at all (its comment,
   "No Concede button to carry", predates End coming back out). Each is fixed
   with a failing test in its own commit. boggle done 2026-09-25
   (`myConceded` — the verdict builder's parameter included — /
   `isLocallyDone` / BoardCol's `readOnly` gone; the conceder's row places
   End — failing test first; unit + its 7 e2e + the cross-game specs green).
   setgame done 2026-09-25 (`myConceded` / `active` / `isTurnGame` /
   `waiting` / `isLocallyDone` gone — `isTurnGame` read a null pointer as "no
   turns", and so did the peer narration's gate, both now `isTurnBased`; the
   your-move prompt is `isTurnBased && isMyTurn`; the board fades on
   `isWaitingForTurn && disabled`, its deliberate rule that only waiting
   fades; the conceder's row places End — failing test first; unit + its 9
   e2e + the cross-game spec green). bananagrams done 2026-09-25: its own
   `isConceded` meant "conceded AND the game still on" — the page's name
   with another meaning — and PlayerBoard, `usePlayerBoard` and HandCard
   took it as "my board is frozen" (`frozen = isConceded || isTerminal`),
   which is `!isBoardInteractive`: the three take `isBoardInteractive` now,
   and `isTerminal` left them with it. The conceder's row, which placed no
   button at all, places the two exits — failing test first (the old test
   read End off its binding, never off the page). Its comment claimed the row
   "keeps Club alone"; it never placed Club, and the comment now says what
   the row does. Unit + its 11 e2e + the cross-game specs, `concede` among
   them, green. scrabble done 2026-09-25, after step 8 (`myConceded` /
   `myTurn` / `isLocallyDone` gone; BoardCol's `canPlace` is
   `isBoardInteractive && !submitting` and `canCommit` is
   `isMyTurn && !submitting`; the coop TurnStatusLine shows on `isTurnBased`,
   the coop waiting note on `isWaitingForTurn`; the conceder's row places End
   — failing test first; unit + its 9 e2e + the cross-game specs green).
   **Step 6 is done for all sixteen.**
   **Step 6 renames only the standing terms** (Joel, 2026-09-25). A game's
   other names that the plan has already settled are owed when its audit
   area opens — the names below, found while converting, with the games
   that still use them (2026-09-25):
   - `over` — the ending's `TerminalMessage | null` — is `terminalMessage`
     (the six audited games, N1); where it is asked a yes/no
     (`{!over && …}`), that is `isTerminal`. bananagrams, boggle,
     crosswords, letterboxed, scrabble, setgame, stackdown, strands, waffle,
     wordiply.
   - `busy` — my move is with the server, set around the move RPC — is
     `submitting`, as psychicnum, connections and wordle name it (the move
     itself is `inFlight…`, N3). codenamesduet, crosswords, letterboxed,
     strands.
   - waffle's Board prop `gameOver` is `terminalOutcome` (N1).
   - The solved flag: `mySolved` (wordle), `iSolved` (strands),
     `selfSolved` (stackdown, waffle) — one name, settled with §3b's
     `hasSolved`.
7. ~~**codenamesduet's turns.**~~ Done 2026-09-25, as below: the SQL helper
   `_point_turn` writes the pointer from the game's own state at every change
   (`create_game`, `submit_clue`, `_end_turn`, a sudden-death agent,
   `replay_board`); `create_game` seats both; migration
   `20260925000000_codenamesduet_turn_order.sql` seats every stored game and
   points the ones in progress. The front end's `derivePhase` supplies
   `isMyTurn` / `isWaitingForTurn` / `isBoardInteractive` (the board takes a
   guess only — the clue-giver's move is the clue form); `readOnly` /
   `cellsClickable` / `partnersTurn` gone. The bell is the page's, on the
   pointer (Joel's pick): the one player with words left in sudden death hears
   it as sudden death begins; with words on both sides, nobody does. Failing
   tests first (pgTAP `turn_pointer_test`, `phase.test`).
   It keeps its turns in its own table
   (`current_clue_giver` and the phase), so the shared `isMyTurn` is always
   true there. It moves onto the common turn order: both players seated
   (`turn_seat`), and the shared pointer names whoever must act now — the
   clue-giver while a clue is owed, the guesser once it is given, and in
   sudden death the one player who still has words to guess. The ONE
   exception is sudden death with both players holding words: the rulebook
   lets either guess, which one pointer cannot say, so only there does the
   game supply `isMyTurn` (true for both) itself. The partner with nothing
   left to guess is then `isWaitingForTurn`, and their board dims.
8. ~~**scrabble compete joins the common turn order.**~~ Done 2026-09-25.
   Each player's `turn_seat` is their scrabble seat, so the turn walks the
   opponent strip as before (Joel's pick over `_assign_turn_order`'s shuffle):
   `scrabble._seat_turn_order` seats it and points a random opener, at create
   and restart. `_require_turn` gates word, swap and pass in both modes — the
   three out-of-turn faults (PN438 / PN448 / PN457) retire into the shared
   PN243 race, since the pointer reaches a client apart from `version` — and
   `_advance_turn` hands the turn on; `_advance_seat` is dropped. The blocked
   end counts `not locally_terminal`, the set the rotation walks.
   `get_ai_context` and the `PlayArea` poke find the bot through the pointer.
   Migration `20260925000001_scrabble_turn_order.sql` seats every compete
   game, points the ones in progress, strips `current_seat` from the stored
   status, and drops the column (Joel's pick). The front end reads the page's
   `isMyTurn`, and its own bell is gone (the page's rings on the pointer).
   Nothing visible changes: compete keeps its "Turn: ● name" line, and its
   board does not dim (`draftsOffTurn`). pgTAP `compete_turn_order_test`.
   **scrabble's waiting note stays coop-only** (Joel, 2026-09-25): the local
   slot has little room beside the rack, and compete's InfoCol state line
   already names the player. Step 6 keeps it as it is; where the note belongs
   is `src/scrabble/todo.md`'s, for the scrabble audit.

## 3b. How it ended for me — won, lost, conceded, no result, solved (not started)

Joel, 2026-09-24: "did a conceding player lose?" has no single answer today.
The words live in three places that don't agree: `common.games.play_state`
(the game's ending, in its own words), `common.game_players.result.won` (per
player), and `terminalOutcomeVerb` (the strip's Won › Quit › Lost). Worked
after §3a, as formulas beside docs/win-lose.md → Where a player stands.

**The terms are agreed** (docs/win-lose.md → How a game ends — the terms), and
[game-cards.md](game-cards.md) is each game's ending written in them — read
before anything below.

**The draft names** — the code names for the terms, by §1's rules (`my`, a
boolean as `is…`). Once built, they join the formulas in docs/win-lose.md →
Where a player stands.

- `isSolved` — I completed the puzzle (`solved`), goal or not.
- `hasReachedGoal` — I met the goal (`reached-goal`). **Neither is "won"**: a
  wordle solver can be beaten by a rival's fewer guesses (wordle, waffle and
  strands rank solvers), and a ranking by progress crowns someone who never
  reached the goal (scrabble, setgame, wordiply, letterboxed's timeout).
  `has…` rather than `is…` because "is goal reached" reads worse.
- `myFinalRanking` — my `final-ranking`: null until the game is over and for
  a player not ranked, else the number (1, 1, 3). Read off `result`. `won`
  is `myFinalRanking === 1`.
- `myOutcome` — my `EndOutcome` (today `TerminalOutcome`), null until the
  game is over: `'won'` (ranked 1), `'near'` (ranked, not first — shown
  "2nd"), `'lost'` (not ranked, in a game that ended with a result),
  `'neutral'` (neither: a Stop, `timeout-no-result`, `no-result`). The
  outcome vocabulary already says which way something went: a move's outcome
  is any `Outcome`, a player's or team's at the end is an `EndOutcome`, so
  there is no separate
  "verdict" layer and no color mapping. HOW it went is not in it — see the
  discussion below. A conceder can never win, and conceding is a way of
  losing (`'lost'`), never a value beside it.

**Decided while naming** (Joel, 2026-09-26) — the outcome and reason design,
built in step 7 with the rest:

- **Decided: a ranking below first is `near`; `lost` means failed** (Joel,
  2026-09-26). `won` is ranked first. `near` is ranked, not first: the
  player cleared the game's bar for being ranked (met the goal where the
  game ranks by goal; made progress where it ranks by progress) and someone
  did better. `lost` is not ranked, in a game that ended with a result: fell
  short of the goal, eliminated, or conceded — failed, never merely "didn't
  win". In wordle, the slower solver is `near` and the player who never
  solved is `lost`. In a game that ends when decided (psychicnum,
  connections, crosswords, stackdown, bananagrams), the first finish ends it
  and only the winner is ranked, so everyone else `lost`: who was ahead is a
  memory, not a ranking — `near` never occurs there. The terms change in
  step 7 with the rest: `final-ranking`'s "any other ranking is `lost`"
  becomes `near`; `lost` drops "someone else `won`" for "not ranked";
  `near` and `neutral` join as a player's end outcome, pointing at
  docs/outcomes.md. The decided `near` item below then simplifies: `near` is
  the outcome, not a display of `lost`.
- **Why the game ended: a category and a detail.** The category is one
  fixed list across games, for shared code and reports ("games by why they
  ended"); the detail is the game's own word, always written, so a second
  way to reach the same category (another fatal move in codenamesduet) just
  gets its own detail word. The category never stands in for the detail.
  Names: `game_ended_reason` / `game_ended_reason_detail`, on the
  `GameEnded` stem (below). The stem says what kind of reason it is, so the
  bare `reason` stops being generic; "ended by" read as who, not why. Both
  are written only when the game ends (today's `status.reason` already is,
  so "game ended" is true of it). Today's `status.reason` values become the
  detail; the category is backfilled from them (stored data: §2).
  codenamesduet's guess answer carries the same two names; wordiply's refused
  guess, whose `reason` means why a guess was refused, becomes
  `reject_reason`.
- **Why a player stopped playing: the per-player pair.** Columns on
  `common.game_players` (common-tables, 2026-09-27; this bullet first said
  keys in `result`, which that plan drops): `player_ended_reason` / its
  `_detail`, on the `PlayerEnded` stem (below), never "stopped" (the Stop's
  term). Written `null` for a player still playing when the game ended —
  they never ended on their own, and their story is the game's
  `game_ended_reason`; old rows are null too, which is right, since prod
  holds no player who ended on their own. Beside them `outcome` (the
  `EndOutcome`), `final_ranking` and `solved`: `outcome` is derivable, but a
  question across games reads it off one column.
- **Agreed: one reason list, sliced per level** (Joel, 2026-09-26). A
  superset of every reason either level needs; the game's and a player's
  lists are slices of it, using the same word wherever it fits both ("everyone
  conceded" and "I conceded" are both `conceded` — the level makes the
  difference clear). Built from what the words mean, not from today's games:
  a setgame with a deck per player would end a player's play at a natural
  finish, and the list already has the word. The superset:

  | value | the game's slice: the act that ended the game was… | a player's slice |
  |---|---|---|
  | `reached_goal` | a player meeting the goal | I met the goal |
  | `resource_exhausted` | a resource running out (the bag, the deck, the last player's budget) | my own resource ran out (my guesses, my deck) |
  | `all_passed` | every active player passing in a row (scrabble compete) | — |
  | `fatal_move` | a move that ends it for everyone (the assassin) | a move ended only me (none today) |
  | `conceded` | a concession | I conceded |
  | `timeout` | the shared timer | my own timer, only if a player timer is built |
  | `stopped` | someone pressing Stop | — |

  The game's reason is never a result: it doesn't say who won or whether
  everyone lost. That is the outcome, worked out from the players' facts. A
  `conceded` game may have a winner (one player solved, the last one out
  conceded).

  **The reason says how play ended; the outcome says whether it lost.** A
  `resource_exhausted` is neutral about the result (docs/win-lose.md →
  `resource-exhausted`: "the last guess spent"): running out of guesses is
  `lost` in wordle, and the end of play, ranked, in wordiply. So
  `eliminated` is not a reason: it is a `resource_exhausted` whose outcome is
  `lost`, and stays a term and a worked-out fact (`isEliminated`). A player
  still playing when the game ends has no reason of their own (null; see
  above).
- **Decided: Terminal → Ended** (Joel, 2026-09-26). "Terminal" and
  "locally terminal" are awkward and needlessly long, and `ended` is already
  the term for `isTerminal` — so code says one word and prose another for
  one thing. What it takes:
  - the stems **`GameEnded`** and **`PlayerEnded`** (not "done", which is
    everywhere for "done sending a request"): `isGameEnded` (`isTerminal`
    retired), `isPlayerEnded` (`isLocallyTerminal` retired);
    `locally-terminal` becomes the term `player-ended`; the reason keys
    follow (`game_ended_reason`, `player_ended_reason`);
  - the supersets drop "terminal" too, so it survives nowhere: `EndOutcome`
    (today's `TerminalOutcome`) and `EndReason`, with slices such as
    `GameEndedOutcome` and `PlayerEndedReason`;
  - docs/win-lose.md's terms and formulas change with the code (step 7), so
    the doc never names a column the database doesn't have;
  - the cost: `common.games.is_terminal` and `common.game_players.locally_terminal`
    are columns — dropped, not renamed, by common-tables (`ended_at` and
    `player_ended_at` carry the facts), and every function in
    `supabase/sql/`, the generated types, `whereIStand`, `useCommonGame`,
    the PlayAreas and the tests follow — one pass, in step 7.

- **Decided from the naming pass** (Joel, 2026-09-26): `hasReachedGoal`, a
  noted exception to §1's `is…`; N23 renames the `end_game` RPC to
  `stop_game` too — Stop names only, nothing else that says "end"; §2's
  stored `'manual'` becomes `'stopped'`.

**Step 7 is built by [common-tables.md](common-tables.md) → The path**
(Joel, 2026-09-27), except its Stop names, which come first. The old 7a, 7b
and 7d changed the columns that plan reshapes — renaming `is_terminal` and
`locally_terminal` it drops, writing the reason pair and a player's end into
`status` and `result` it replaces — so they are its stages now, and the
reason map moved there with them. What stays here:

- ~~**7c. Stop names (N23) and N24**~~ Done 2026-09-27: N23 and N24 below,
  plus (Joel) the two confirms' wording ("Stop this game?", "Concede, or stop
  the game?", "Stop for all"), `CONCEDE_OR_STOP_GAME_CONFIRM`,
  `manifest.stopGame`, `stopGameForAll`, the gallery's `stopGame.ts` and the
  pgTAP `stop_game_test.sql` files. Docs, todos and comments follow;
  `plans/areas/` records do not. A name says "stop game", never a bare
  "stop" (Joel): `act-stop-game`, `actStopGame`; a flag would be
  `isGameStopped`, never `isStopped`.
  **Left alone as unsure, to judge with Joel** (not yet worked):
  1. `docs/games/stackdown.md` (the coop title paragraph): "(`end_game`
     doesn't touch the title)" — `common.end_game` or `stackdown.stop_game`.
  2. `docs/games/wordiply.md`: "`common.concede` / `end_game` / timers" —
     probably `common.end_game`.
  3. `e2e/gallery/verdict.ts` (header): "where every `end_game` writes its
     per-player verdict" — probably `common.end_game`, the only writer.
  4. `docs/games/letterboxed.md` (the `_end_game` wrapper paragraph): "the
     shared `end_game`" — probably `common.end_game`.
  5. `src/common/club/useClubGames.ts` (two comments) and
     `src/common/game-page/useCommonGame.test.ts` (the bot test): "end_game
     wrote a terminal play_state" / "writes it a result" — only
     `common.end_game` writes those.
  6. Ten games' `todo.md` quote the ruling "you cannot end a game that has
     ended" — possibly about Stop; a quote, so unchanged.
  7. `src/bananagrams/todo.md`: "A conceded racer's Stop game has no
     button" — the "You conceded" row now places `actStopGame`, so it may be
     done.
  8. Lowercase "quit" for a concession in prose: a boggle PlayArea test ("I
     quit, the game continues…"), `src/crosswords/manifest.ts`,
     `src/wordle/lib/terminal.ts` — not the strip's label.
  9. Rewordings chosen in SQL comments: spellingbee's and wordwheel's "Manual
     End is NEUTRAL" → "Stop is NEUTRAL"; crosswords' "ending is the whole
     table agreeing" → "stopping is…", "a compete end" → "a compete Stop".
  10. docs/common-schema.md's heading "Manual end — every gametype's
      `stop_game(target_game)`": "Manual end" waits for stage 2's `'manual'`
      → `'stopped'`.
  11. `GamePage.tsx`: the pause overlay's local is now
      `stopTheGameFromTheOverlay`.
- **The questions below** — the decisions common-tables builds on.

**What step 7 changes.** A name changes in step 7 when a common or shared
name forces it: a column, a common function, a shared type or component, a
status key every game writes, an RPC the shared front end calls by name. Every
game's call sites move with it, in the same pass. A game's own word — "race"
(N25), "clock" (N26), strands' `isLocallyDone` (N27) — is step 8's, listed
per game and changed at its audit. "Terminal" is the exception: it goes
everywhere (question 1).

**Questions for Joel:**

1. **Decided** (Joel, 2026-09-26): **everywhere** — "it is worse to not do
   it everywhere than not do it at all." Every identifier, key and comment,
   game-local ones included, and the docs' prose, with the columns
   (common-tables → The path); an exception to the step-8 rule above. The
   options were:
   - **Decision names only:** the columns, `isTerminal`, `isLocallyTerminal`,
     `TerminalOutcome`, `terminalOutcomeVerb`, `_set_locally_terminal`, and
     the docs' terms.
   - **Plus shared code** (recommended): also every common name carrying
     it — what `src/common/terminal/` exports (`terminalMessage` /
     `TerminalMessage`, about 200 uses; `buildTerminalMessage`,
     `gameEndedTerminalMessage`) and the folder; `src/common/feedback`'s
     `terminalVerdict` kind (`showTerminalVerdict` in 16 PlayAreas); the
     info sheet's `.terminalActions` / `.terminalExtra` classes; the
     outcome palette's `terminalFrame` variant
     (`--outcomes-won-terminalFrame-color` and its siblings). Game-local
     names (SQL's `out_terminal` / `terminal_state` / `terminal_reason` /
     `v_terminal`, the `terminal` key in seven games' move answers and the
     fields that read it) go to step 8, with the comments and doc prose that
     use the word on their own.
   - **Everywhere:** every identifier and comment; the word appears about
     2,000 times outside the tests.
2. ~~**Where the player's end goes.**~~ **Decided** (Joel, 2026-09-26): with
   the game's end, in one pass — the player's facts and `near` are one design
   (`outcome` needs `final_ranking` to tell `won` from `near`), and the
   game's reason pair already opens every game's end paths. They are
   `common.game_players` columns now, not `result` keys (common-tables).
3. ~~**How the pair is written.**~~ **Decided** (Joel, 2026-09-26):
   required parameters on `common.end_game`. A call without them fails when
   it runs, and a misspelled category is refused there, in one place.
4. **Compete games that end when every player is done** (wordle, waffle,
   strands: `ends-when-all-done`). **Decided** (Joel, 2026-09-27): the
   game's reason is the last player's act — their last guess spent
   (`resource_exhausted`), their solve (`reached_goal`), or their concession
   (`conceded`) — as docs/win-lose.md → `resource-exhausted` says: "it is the
   act that ended the game that counts". The game's `conceded` means a
   concession ended it, not that everyone conceded; whether anyone won is
   the outcome's, worked out from the players. The backfill has no such rows:
   prod holds one compete game, a scrabble one (common-tables-survey →
   Prod).

**Found while drafting** (a survey of every `ended` path, 2026-09-24):

- `play_state = 'ended'` never carries a winner, but it is not only a Stop:
  it is also a coop word hunt's timeout with no target (boggle, spellingbee,
  wordwheel), and today the normal finish of scrabble coop and wordiply coop
  (both ruled to become wins: their todos). So `myEnding` can't read
  `'stopped'` or `'noResult'` off `play_state` alone; the status `reason`
  says which.
- **Not a bug** (Joel, 2026-09-25): a Stop stays neutral in every game, a
  `score-only-contest` included. The scores stay readable on the ended game, so a
  table that wants "play until we stop, then see who's ahead" sets a long
  countdown and stops early. The one game nothing could crown goes by the
  rule below.
- **Bug**: `result.won` is not written everywhere — boggle coop writes no
  per-player result on any ending (a win included), and wordiply coop writes
  `{finished: true}` with no `won` key. Stored data: a migration and backfill.
- `terminalOutcomeVerb`'s docstring says a conceder can hold a winning result
  ("conceded a race someone had already ended"); no path reaches that now.

**Decided, to do: a ranking below first shows as `near`, never "Lost"**
(Joel, 2026-09-25). A player whose `final-ranking` is 2, 3 … reads as the
ranking ("2nd"), in the `near` outcome. "Lost", in `lost`, is left for a
player not ranked: `eliminated`, `conceded`, or short of the goal. Every
ranking below first is still not `won`. Two-player games too: a player who
solved and was beaten reads "2nd", not the "Lost" of one who never solved —
the ranking never depends on how many played. It takes:

- `TerminalOutcome` gains `near`, and `docs/outcomes.md` rewrites the reason
  it gives for the terminal set ("won, lost, or stopped"; `near` and `warning`
  judge a move) and widens `near` to "ranked, not first".
- `docs/win-lose.md` → How a game ends: `final-ranking` and `lost` say every
  ranking below first is `lost`; they gain the rule that it is shown by its
  number, in `near`.
- Every surface that shows a player's ending (the pill, the action row's line,
  the player strip) shows the ranking.
- **Audit every check written for a two-way world** (Joel, 2026-09-26).
  Code that reads `TerminalOutcome` (to be `EndOutcome`) was written when a
  player's end was won or lost, so `!== 'won'`, `=== 'lost'`, a ternary on
  `'won'`, and a `switch` with no `near` case may each mean "lost" and now
  catch `near` too, or miss it. A first grep finds about fifteen such
  comparisons outside the tests. Read each, make the best guess at what it
  meant, and bring the uncertain ones to Joel before changing them.

**Decided, to do: a compete word hunt needs a target, a countdown, or both**
(Joel, 2026-09-25) — something must be able to crown a winner. With no
target, the countdown crowns the top score (and nobody, if nobody scored).
spellingbee and wordwheel gain compete with no target when a countdown is
set, for "best score in ten minutes"; boggle loses the untimed compete game
with no target, which nobody could win. Each game's `todo.md` carries its
half. `docs/win-lose.md`'s `score-only-contest` rule already counts a countdown.

**Decided, to do: one leaderboard per compete game, built in one place**
(Joel, 2026-09-26). **Where it is stored is decided by common-tables
(Joel, 2026-09-27):** a `leaderboard` column on `common.games` (common-tables
→ The model), not a key in `status`; `final_ranking` and `solved` are
`common.game_players` columns, not `result` keys, so an entry carries
`user_id` and the game's own numbers and the front end joins the end facts
from the players' rows. The rest below — one builder per game, the entry
keys, a ranking by number and never by order, no username, private rows
totaled by a definer — holds, read with those two changes; built in
common-tables' stage 3. Today seven games write a `leaderboard` array into
`common.games.status`, each with its own code: some live on every move, some
only at the end, some twice in two places. The strips read it in four games
and a per-player SQL table in the rest, and no entry says who conceded or
where anyone finished. The target:

- **Every compete game keeps a live `status.leaderboard`.** A JSON array, one
  entry per player. setgame, which writes it only at the end, gains a live
  one; wordle, waffle, stackdown, psychicnum, connections and strands, which
  write none, gain one. The strip and the club page read only this.
- **One builder per game: `<game>._leaderboard(target_game uuid)`.** It
  returns the array, and `'[]'` for a coop game (no game shows a coop
  leaderboard; if one ever does, the coop guard goes). Every RPC that
  changes a player's numbers calls it — the moves, `concede`, the timeout,
  Stop and the ending — so the live and the final leaderboard can't drift
  apart, and the move RPCs don't grow. A guard in `src/guards/` checks every
  compete game has one.
- **Each entry's keys.** Every game: `user_id`, `conceded`, and at the end
  `final_ranking` — the player's ranking, ties sharing it and the next one
  skipping (1, 1, 3), null when not ranked. The ranking is that number,
  never the entries' order: an order cannot show a tie. There is no `won`
  key: `won` is `final_ranking` of 1 (docs/win-lose.md → `final-ranking`).
  This also ranks beaten solvers, where wordle, waffle and strands today
  record only the winner (their cards' `final-ranking` BUG notes).
  Beside those, the game's own numbers, each named exactly what the game
  already calls it in its SQL columns, views and variables — no synonyms.
  One breaks that today: letterboxed's `words_used` is `word_count`
  everywhere else. Where a game hides a number until the end (wordiply's
  scores), the entry gains it then.
- **Order.** The array is stored in `final_ranking` order, unranked last.
  Each front end sorts or filters as it likes — co-winners grouped,
  conceders hidden. This answers the game cards' ruling idea that a
  leaderboard sorts conceders in among the ranked players, as wordiply's,
  scrabble's and setgame's do.
- **Private rows stay private.** The builder runs inside `security definer`
  RPCs, so it can total rows a rival may not read (the bee games' compete
  found words, whose policy keeps each player's list their own before the
  end) and publish only the numbers.
- **`common.game_players.result` gains `final_ranking` and `solved`** for
  every player in every game, coop included — a coop team is all 1 or all
  null. `result` is where a question across games reads ("my solve rate in
  wordle"), in either mode. `solved` is left out where it means nothing
  (scrabble), so such a game never counts toward anyone's solve rate. This
  answers open question 3 below: every game writes the result. Past games
  keep the `won` they hold (prod data); whether a migration backfills
  `final_ranking` from it (`won` → 1, else null) is decided when it is
  written.
- **No `username` on an entry** (Joel, 2026-09-26). Some games copy it in
  today; the front end has every member's name, and the club page has
  `winner_username`, so a copy per entry is one more thing to go stale.

**Decided, to do: a speed step always resolves; no `co-winners` after it**
(Joel, 2026-09-27). `solved_at` is the transaction's start time at
microsecond resolution, so two solves cannot be level after it, and a
`co-winners` step behind one is dead. Two games change, cards already
updated:

- **strands** ranks by fewest hints, then the earlier solve. Its
  `_maybe_finish_compete` takes every solver at the best hint count whose
  `solved_at` is the minimum; it takes one row, as wordle and waffle do.
- **wordiply** ranks by the best score, then the earlier last guess —
  always, not only "with a `timer`". `_finish_compete`'s `timed` flag (read
  off `setup.timer.kind`, and true for a countup) goes, and with it the
  untimed `co-winners`. This also removes the one SQL read of the timer's
  kind (common-tables → Review, question 7).

**Answered** (the open questions this section carried):

1. A coop word hunt with no target: a Stop is `'stopped'`, its timeout
   `'noResult'` (`timeout-no-result`).
2. scrabble coop's bag played out and wordiply coop's five guesses spent are
   wins once their rulings are built (going out; five words), so no fifth
   ending.
3. The missing `result.won` writers: every game writes `result` with
   `final_ranking` (the leaderboard item above), and `'won'` reads off it.

## 4. Naming — cheap renames (code and `supabase/sql/` only)

Most worth fixing first.

**Built 2026-09-27:** N6, N7, N9, N10 (§1b's names), N11, N12, N14, N15,
N16, N19, N20, N21, N22 and the shared-code decisions below, as each row
says. **N8 built 2026-09-27** as its row says. §4 has nothing left.

| # | today | settle on |
|---|---|---|
| ~~N1~~ | `gameOver` is the ending (`TerminalOutcome \| null`) on psychicnum / connections / wordle's `Board` and `BoardCol`; in codenamesduet it is a boolean, and its ending is `terminalOutcome` | Done 2026-09-24, the other way round: the ending is `terminalOutcome` everywhere (it says what it holds; `gameOver` reads as a yes/no), the yes/no is `isTerminal`, typed `TerminalOutcome \| null` in all four. The shared `gameOver*` CSS classes stay. `common/game-page/GamePage.tsx`'s own yes/no is `isTerminal` too, read off `is_terminal` (it was `ended_at !== null`) — the answer every PlayArea is handed. waffle's is outside the six |
| ~~N2~~ | the refused-word mark: `answered` (spellingbee `Letters`), `refused` (wordwheel `Wheel`), `reject` (wordle `Board`); the bee pair also swaps `answered` / `refused` between them | Done 2026-09-24: `refused` / `showRefused` in all three. The per-tile slice is `mark` in both bees, and the single tile's prop stays `answer` (`Letter`, `Tile`) |
| ~~N3~~ | the move still with the server: `inFlightWord` (psychicnum), `inFlightTiles` (connections), `pending` / `pendingWord` / `.inFlight` (wordle), `pendingPos` (codenamesduet) | Done 2026-09-24: `inFlight…` everywhere (`inFlightWord`, `inFlightTiles`, `inFlightPos`), and a board's per-tile/row local is `isInFlight`. psychicnum and wordle, whose result lands by realtime, share one shape in named steps: state `submittedWord` (the word I last sent), `submittedLanded` (its result is on the board), `inFlightWord = submittedLanded ? null : submittedWord` — `null`, not `''`, for nothing out. The single-flight `pending` is a different thing and stays |
| N4 | may the board take a click: `interactive` (connections), `cellsClickable` (codenamesduet), the handler left out (psychicnum, the bee games) | Folded into §3a, step 6: every board takes `isBoardInteractive` and a required handler |
| ~~N5~~ | am I still in the game: `isStillPlaying` (psychicnum), `showInput` (connections, wordle — where it gates a help line) | Done (verified 2026-09-27): `isStillPlaying` everywhere, `showInput` gone |
| N6 | psychicnum, the control, is the odd one: `turnHolderName` / `turnHolderColor`; `useGame` returns budget rows as `players`; the move answers `verdict` + `found_all` | `holderName` / `holderColor`; `useGame` returns `playerBudgets`; the answer is `{ result: 'hit' \| 'miss', found_all }` — `found_all` stays (Joel, 2026-09-27) |
| N7 | the print model's `setup: SetupRow[]` (`common/pdf/eventLog.ts` and four game models) where the columns say `setupRows` | `setupRows` |
| N8 | "Game over" and "Already conceded" inside moves, written by hand at 55 SQL sites (35 and 20) in the sixteen games, each with its own code; `common._raise_game_over()` exists but only Stop and the timeout call it. wordle's missing check is closed (§3) | **Its own item, after §4's renames** (Joel, 2026-09-27). Every site calls a common helper: `common._raise_game_over()`, and a new `common._raise_already_conceded()`; the per-site codes go (players never see a code). **Every race is one color**: `race`'s default, `warning`, from `SEVERITY_TO_OUTCOME` in `src/common/supabase/dbResult.ts` — a move that changed nothing warns, it is not a note. So no race raise sets a `constraint`: the four `noted` in `common.sql` (`_raise_game_over`, and `_set_conceded`'s PN482 / PN483 / PN508) go. The one exception, kept (Joel): a deleted game is `lost` (red) — `delete_game`'s PN010 and `common._raise_game_deleted`'s PN485. docs/envelopes.md stops giving colors (its Appearance table, and "a race that is news … takes `noted`") and points at the map in code |
| N9 | Restart rewinds `current_turn_user_id` by hand in eight games' `replay_board`; docs/common-schema.md counts it as the common turn mechanism | move it into `common.reset_game`, **in this pass** (Joel, 2026-09-27); the eight copies go. codenamesduet's `_point_turn` still runs after it and always writes while `playing`, so its turn is unchanged |
| N10 | `picked` (state) renamed `selected` on psychicnum's `Board` | §1b, with its names (in this pass) |
| N11 | wordle's `players: members` rename, with no stated reason (codenamesduet states one) | `players` |
| N12 | `totalGuesses` (psychicnum) vs `maxGuesses` (wordle); connections' print model `mistakes` / `maxMistakes` vs its columns' `mistakeCount` / `mistakeBudget`; codenamesduet's `turns` / `turnBudget` / `turnCap` and `turnNumber` / `currentTurn` | `maxGuesses`; `mistakeCount` / `mistakeBudget`; `turnBudget` / `turnNumber` |
| ~~N13~~ | connections' `selfEliminated` recomputes the `isEliminated` its `useGame` returns | Done 2026-09-25, in §3a step 6: the verdict reads `isEliminated` |
| N14 | codenamesduet: `DuetPrintModel` / `buildDuetPrintModel`, `PrintCell` / `drawCell`, the pdf `Mark` type that clashes with common's `Mark<T>` | `CodenamesduetPrintModel` / `buildCodenamesduetPrintModel`, `PrintTile` / `drawTile`, `KeyRole`. `CodenamesduetAISuggestCompanion` keeps its name: every game-owned companion carries its game's (Joel, 2026-09-27) |
| N15 | spellingbee's board is `Letters.tsx`; its glossary word is "hive" | `Hive.tsx` |
| N16 | wordle declares no `Player` type; its row types `SubmittedRow` and `HistorySnapshotRow` are one shape; `WordlePlayerState` where the house form is `PlayerRow` | `Player`, one `BoardRow`, `PlayerRow` |
| ~~N17~~ | wordle has two different functions named `answerSourceLabel` (`manifest.ts`, `lib/setupRows.ts`) | Done (c0957810): `answerDictLabel` and `answerBandValue` |
| ~~N18~~ | theme tokens without the quality ending docs/tokens.md asks for (`--spellingbee-hex`, and the like in wordwheel, codenamesduet, connections, wordle) | Not this plan's (Joel, 2026-09-27): a game's own tokens aren't a between-games question. codenamesduet's are a bug in its todo |
| N19 | `PlayArea` exported in wordle, spellingbee, wordwheel, codenamesduet; nothing imports it | unexported |
| N20 | the End / Concede / Restart section header in `PlayArea.tsx`, worded four ways (wordle's says "Replay") | psychicnum's wording, `// ─── The commands, bound ───` — done in the six; the other ten in this pass (Joel, 2026-09-27), crosswords' two sections under one header |
| N21 | SQL: `wordle.submit_guess` names locals `p_…`, the prefix common keeps for parameters; codenamesduet's `submit_guess` takes `target_position` for the `guess_position` column, and its answers still use old keys (`word`, `count`, `from_ai`, `by_seat`); "You are not in this game" means two things (PN253 vs psychicnum PN271, connections PN250) | `wordle.submit_guess`'s `p_used` / `p_solved` → `caller_used` / `caller_solved`. codenamesduet's answer keys match the columns — `clue_word`, `clue_count`, `clue_from_ai`, `seat` — in `give_clue`, the AI's previous clues, `ClueStrip` and the suggest-clue edge function (Joel, 2026-09-27). PN271 / PN250 read "BUG: you are not in this game": a fault's message is still for a person, and the technical words stay in `detail` (Joel, 2026-09-27). codenamesduet's `submit_guess` parameter `target_position` → `guess_position`, with the front end's call (Joel, 2026-09-27); the `target_` prefix on every other RPC input stays — it keeps a parameter from sharing a column's name, which PL/pgSQL refuses |
| ~~N23~~ | Done 2026-09-27 (7c). the Stop action (`stopped`) is still named End: `act-end-game` labeled "End game", `actEndGame`, `END_GAME_CONFIRM`, Concede's "Concede / End game", each game's `end_game` RPC | Stop: `act-stop-game`, "Stop game", `actStopGame`, `STOP_GAME_CONFIRM`, and each game's RPC `stop_game`, with a `DROP` of the retired `end_game` beside it. Stop names only: `ended`, `ended_at`, `common.end_game` (which ends a game any way) and every other "end" stay |
| ~~N24~~ | Done 2026-09-27 (7c). `terminalOutcomeVerb` returns `'Quit'` (the strip's "Quit at 12"); the terms say never "quit" | `'Conceded'` |
| N25 | "race" / "racer" for games that aren't `race-game`s: wordle's and waffle's compete, their SQL (`racers_with_budget`), FE and docs (the game cards' Mismatches) | player; "race" only for a `race-game` |
| N26 | "clock" for the timer: wordle's `wonByClock` / `clock_ran_out`, and comments across the games | timer, timeout (`wonByTimeout`, `timed_out`) |
| N27 | strands' test names a flag `isLocallyDone` | `isLocallyTerminal` |
| N22 | lower: `LOSS` vs `COMPETE_LOSS`; `const mode` / `isCompete` locals in some games, inline in others; `announceOpponentProgress` vs `narrateRankClimbs`; `players.find(...)` by hand where `memberById` is already imported | Settled 2026-09-27 (Joel), in this pass: `LOSS` stays — psychicnum reads it in both modes, so `COMPETE_LOSS` would be wrong (how games word a loss is §6); `isCompete` in every PlayArea, the `mode` locals gone; `memberById` wherever the array is the member list, other lookups left. The watchers are named for what they announce into the global feedback slot: psychicnum's `announceOpponentProgress` stays, the bee pair's `narrateRankClimbs` → `announceOpponentRankClimb` |

**Shared code a game copies:**

- ~~`PuzzleAnswer` (connections, copied in strands) re-declares common's
  `NextPuzzle`.~~ Not worth it (Joel, 2026-09-27): the two copies stay.
- Flat index ↔ board position: codenamesduet names it (`positionAt` /
  `cellAt`); psychicnum and connections write the arithmetic inline. A home
  in `common/board-cursor`. **Do it, in this pass** (Joel, 2026-09-27):
  `positionAt(x, y, cols)` and `cellAt(position, cols)` there; codenamesduet
  and waffle call them with their width, and the inline sites (the two games'
  `Board.tsx` cursor checks, their `boardShape.ts` `exists`, the two PDF
  printers) use them.
- The bee pair copies `splitCustomLetters`, `TARGET_RANK_CHOICES`,
  `NO_TARGET` and `legalError`; `shared/bee-games` exists for them.
  **Decided** (Joel, 2026-09-27), in this pass: `TARGET_RANK_CHOICES` and
  `NO_TARGET` move to `shared/bee-games`; so does `splitCustomLetters`,
  taking the letter count (7, 9). `legalError` stays copied — not worth it.
  `customLettersError` differs on purpose (the set vs the multiset) and stays
  per game.
  Their two `PlayArea.tsx` files are identical but for names and three
  "hive"/"wheel" comments. **Decided** (Joel, 2026-09-27), in this pass: they
  stay two copies — each game keeps a PlayArea that reads top to bottom — and
  `shared/bee-games/doc.md` says so: the copies are kept identical, and a
  change to one is made to the other. The stray differences go, so the two
  diff clean: wordwheel's `useInfoSheet` import order, a blank line, and two
  blocks in spellingbee's wrapped in the foreign `{ cls( … ) }` style, which
  take the repo's one-line form. Their two
  `PlayArea.tsx` files are identical but for names, and nothing says why the
  whole component is two copies.
- The per-opponent "did their number go up" watcher is hand-written twice
  (psychicnum, the bee games) with different start-up logic; a candidate for a
  shared hook. **Decided** (Joel, 2026-09-27), in this pass: no shared hook,
  one start-up rule — the bee pair's (seed every row silently on the first
  pass, then a row not seen before counts from 0), which fits both games'
  data; psychicnum's `announceOpponentProgress` takes it. Players see no
  change.

**Unsure from the §4 pass (2026-09-27), to judge with Joel** (not yet
worked). "Done" means the pass made the change and it may want undoing;
"left" means it made none.

- *A change beyond the letter of the ruling:*
  1. Done — scrabble compete's `replay_board` picked a random opener before
     `common.reset_game`, which now rewinds the turn to seat 0 and would undo
     it; the pick moved after `reset_game`. Same behavior.
  2. Done — psychicnum's and connections' `BoardCol.tsx` (`wordAt`,
     `handleTileClick`, the cursor toggle) and codenamesduet's PDF printer use
     `positionAt` / `cellAt` too, beyond the sites the ruling named.
  3. Done — psychicnum's watcher now also records the viewer's own row before
     skipping it, and an opponent first seen after the first pass counts
     from 0 (the bee rule); no visible change.
  4. Done — `memberById` with a null guard (`id ? memberById(…) : undefined`)
     where the id can be null: the bee pair's winner, psychicnum's turn
     holder. The same shape was left as `.find` in letterboxed, setgame,
     strands, waffle, wordiply (turn holder) and boggle (winner, leader).
  5. Done — `memberById` also in the bee pair's `InfoCol.tsx` and the
     psychicnum and wordle PDF models' `nameOf`; left in waffle's,
     stackdown's and wordiply's `nameOf` and other InfoCol / GameEventLog /
     LastSet files that don't import it yet.
  6. Done — comment fixes beside renamed keys: psychicnum's "says `won`" →
     `hit` (two pgTAP comments, doc.md), its `replay_board` header now one
     line pointing at `common.reset_game`; wordwheel/spellingbee todos and
     doc trees say `Hive`.
- *Names:*
  7. psychicnum `BoardCol.tsx`: the drawn pick is `drawnPick`, because
     `picked` is already the state it's built from — or rename the state.
  8. wordle's `BoardRow` lives in `components/Board.tsx`, so
     `lib/history.ts` imports a type from `components/` — or keep it in lib.
  9. wordle `lib/setupRows.ts` types `players` as `Member[]`, not the new
     `Player` (psychicnum's and spellingbee's do the same).
  10. wordle `PlayArea.tsx` docstring: "`mode` is what differs between the
      manifests" — there is no `mode` local now; `game.mode`?
  11. codenamesduet: `MARK_OF` / `MARK_RGB` keep "mark" though the type is
      `KeyRole`; the model field is still `cells: PrintTile[]` (`tiles`?);
      a local `summaryRows` is passed as `setupRows`; `lib/boardShape.ts` is
      now only `BOARD_SHAPE`.
  12. codenamesduet `ClueStrip.tsx`'s `ClueAnswer` has never listed
      `clue_from_ai`, which `submit_clue` returns.
  13. connections' Broadcast wire words — the event `'selection'` and
      `'select'` / `'deselect'` / `'clear'` — kept: renaming them leaves two
      tabs on different builds unable to hear each other's picks for a
      deploy's minute.
  14. `--scrabble-rack-selected-outline-color` is read only by the
      fresh-drawn flash, never a pick: keep, or name it for what it marks.
- *Words:*
  15. "selected" meaning the pick, left in prose: the strands trace
      (`lib/trace.ts`, `Board.tsx`, `PlayArea.tsx`, docs/games/strands.md),
      stackdown (`BoardCol.tsx`, `WordEntry.tsx`, its doc), setgame
      `useGame.ts` ("partial selection"), `common/pause-suspend/doc.md`,
      psychicnum's test titles ("pending selection"), and scrabble's tooltip
      "Select rack tiles first".
  16. connections: `InfoCol.tsx`'s "the history-viewer selection" (choosing
      a past turn) became "opening a past turn in the history viewer";
      `theme.css`'s "dark selected fill" became "dark picked border".
- *Found on the way, not this pass's:*
  17. boggle `theme.css`: the comment says path tiles wear
      `--tile-picked-edge-color`, but `.picked` uses
      `--tile-spent-edge-color`.
  18. crosswords' shared-actions block (moved under the one header): its
      comment says crosswords' own cleanup puts the answers away, but the call
      passes none; the section intro says every command is placed twice,
      which Stop / Concede / Restart are not.
  19. strands' `useStandardGameActions({…})` holds a comment ("`reset`, not
      `hide`…") with no code after it.
  20. spellingbee `SetupForm.tsx`'s custom-letters `onChange` is a
      one-liner where wordwheel's is two lines.
  21. psychicnum `doc.md` still lists the reason `manual`; `psychicnum.sql`
      has a history comment ("was `was_correct` until 2026-08-01").
  22. `scripts/css-token-baseline.json` still lists the two
      `--tile-selected-edge-…` tokens; it is regenerated by its script.

**Answered and worked (Joel, 2026-09-27): 8–22.** 8 `BoardRow` → wordle
`lib/board.ts`; 9 `Player[]`; 10 `game.mode`; 11 `ROLE_OF` / `ROLE_RGB`,
the model's `tiles`, and — for every game — the value is `setupRows` and the
function that builds it `makeSetupRows()` (a function name leads with its
verb; `summaryRows` said nothing); 12 `ClueAnswer` gains `clue_from_ai`; 13
the Broadcast words are `pick` / `unpick` / `clear` on the `pick` event; 14
`--scrabble-rack-flash-new-outline-color`; 15 no game's player-facing words
mix pick and select (scrabble's tooltip and help now say Pick); 16 left as
is; 17 boggle's comment fixed (the khaki is deliberate); 18 crosswords'
two comments; 19 strands' dangling comment gone; 20 spellingbee's
`onChange` as wordwheel's; 21 the history comment gone (`manual` in the doc
is today's stored word until stage 2); 22 the baseline's two keys renamed.
Following from 11 (Joel, 2026-09-27): common's row builders lead with a
verb too — `makeRosterRow`, `makeCoopRows`, `makeCenterLettersRow`,
`makeTimerRow`; each game's module of them is `lib/setupRows.ts`; and
"recap" is retired — the place is **the Setup options list**
(`<SetupDisclosure>`), the data **the setup rows**.
1–7 accepted as done (Joel, 2026-09-27). Nothing on this list is open.

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

## 6. To investigate

- **How a game words a loss on its club line** (Joel, 2026-09-27). Each
  manifest's `labelFor` turns a stored reason into words ("out of time", "out
  of guesses") for a game nobody won, and the games do it in different ways:
  psychicnum reads one `LOSS` table in both modes; wordle, waffle and
  connections keep a `COMPETE_LOSS` table for compete, and wordle words its
  coop loss with an inline `reason === 'timeout'` check instead. Survey all
  sixteen and decide whether they should share one approach.
