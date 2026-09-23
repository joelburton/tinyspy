# Area: spellingbee

**Brand: FreeBee.** The codename is what the code says everywhere; the
brand appears in the manifest's `BRAND` and nowhere else.

One of the sixteen game areas. The process is [app-audit.md](../app-audit.md)
§4; the plan holds the order, this file holds the reading. Owed work lives in
`src/spellingbee/todo.md`, not here.

**Status: OPEN** (2026-09-22). The roster is agreed and stamped; nothing has
been read. **Three passes back to back**, psychicnum's, connections' and
wordle's shape: the restructure ([playarea-readability.md](../playarea-readability.md)
step by step, with the stylesheet split), then the audit — React, SQL and CSS
together, the `AnswerMessage` conversion in it — then the tile-feedback pass
against [tile-feedback.md](../tile-feedback.md). The first read is
`src/spellingbee/todo.md`, then the shell commits since the folder last
changed (app-audit.md §4).

## The roster

Agreed with Joel 2026-09-22 (*"agree to the list"*), `cs-met-spellingbee` —
**40 stamped files** at the opening:

| where | how many | note |
|---|---|---|
| `src/spellingbee/` | 23 | `lib/answer.ts` + `.test.ts` arrived `cs-fixed-outcome-fix` — that area ruled its files belong to their own area, which is this one. `hooks/useGame.ts` was left `cs-unmet` by `bee-games` for this area on purpose |
| `supabase/migrations/20260617000000_spellingbee.sql` | 1 | |
| `supabase/sql/spellingbee.sql` | 1 | |
| `supabase/tests/spellingbee/` | 12 | every pgTAP file but one, and `setup.psql` |
| `supabase/functions/spellingbee-build-board/` | 3 | `index.ts`, `board.ts`, `board_test.ts` — **the first edge function on a game roster.** This game's own code, so it is read here; nothing in the shape the earlier games settled covers a Deno chunk, so what its read looks like is this area's to work out |

`src/spellingbee/logo.svg` has nowhere to put a stamp; `todo.md` is markdown
and carries none. **`src/spellingbee/doc.md` was written at Step 3**
(2026-09-22), markdown like the todo, roster all the same;
`docs/games/spellingbee.md` is deleted into it in pass 2, as the three earlier
games' docs were.

### What is NOT on it

- **`supabase/tests/spellingbee/rank_idx_test.sql`** — `cs-blessed-rank-ladder`
  (2026-09-21). It pins `common._rank_idx`, the shared function, not anything
  of spellingbee's, the way wordle's `colors_test.sql` stayed `wordle-style`'s.
  Read here all the same, as evidence.
- **The shared folders it imports** — `shared/bee-games`, `shared/found-words`,
  `shared/rank-ladder` — all CLOSED and blessed. Their contracts are read
  against this game, not re-audited.
- **The four e2e specs** (`spellingbee`, `spellingbee-coop-win`,
  `spellingbee-mobile`, `spellingbee-print`) — `cs-unmet`, off the roster as
  every game's have been.

## The reading

### The folder's `todo.md` — read 2026-09-22

One Bug (`act-new-game` answers `active` before the game row has loaded), three
Soon (the info-column action row's branches; the two hand-written Fisher–Yates
shuffles, one FE and one in the edge function; compete's missing end-for-all),
one Someday (the refused-word letter color, a live experiment with wordwheel as
its control — hands off both sides until it comes back). Maybe and Won't do are
empty. Nothing is converted into a finding yet; that is the restructure's
Step 1.

**One item is already stale in a detail:** the action-row item names
`shared.actionsDivider` in `common/game-page/playArea.module.css`. The info
column got its own stylesheet (`2badb0f2`), so the class is
`common/info-sheet/infoCol.module.css` now — and `InfoCol.tsx` already imports
`shared` from there. The prose is stale, not the code.

### The two standing registers, reconciled — 2026-09-22

Joel: *"look for todos in the games/spellingbee file or deferred.md … move
[the useful ones] to the area's todo. delete ones that are stale."*

`docs/games/spellingbee.md` → Deferred held four entries; `docs/deferred.md`
holds one that names this game and three that only mention it. Where each
went:

| entry | verdict |
|---|---|
| the custom-letters e2e "fills two boxes that are now one" | **moved to `todo.md` → Soon, then RULED.** The spec is no longer red: the UI shipped 2026-08-26 (`1599b751`) and `ec12c73a` repaired the spec on 2026-09-01 — the exact certification the deferral said not to accept, so the look still owed Joel the pass it was held for. He gave it the same day: *"i looked at it, it looks fine. no change needed."* Struck through in `todo.md`, not deleted — nothing shipped for it, the question closed |
| the two `SetupForm.module.css` files are byte-identical | **stale, deleted.** Both files are gone (`1599b751`, `ManualBoardField`). `wordwheel.md` → Deferred's cross-reference to it went with it — the pointer would have dangled, and a Deferred section listing shipped work is wrong |
| the `Letters.module.css` / `Wheel.module.css` fold | **still true, copied to `todo.md` → Won't do** as a pointer. wordwheel owns the ruling and keeps the governing copy |
| the `WordList` marker vocabulary (◐, ⦻) | **still true, copied to `todo.md` → Someday** as a pointer. The entries live in `common/word-list/todo.md` |
| deferred.md: ungated `:hover` on tappable board elements, three games | **still true here, verified, moved to `todo.md` → Soon.** `.hex:hover` lifts the hex and lightens its shadow with no `@media (hover: hover)`, so a tap leaves it risen. deferred.md keeps the item for stackdown and wordwheel; this game comes off that list when it ships |
| deferred.md: `touch-action` zoom suppression, confirm on a real iOS device | **left.** A cross-cutting device check that names the hive among five surfaces; not this game's to close |
| deferred.md: two struck-through DONE items mentioning spellingbee | **left.** History, correctly marked |

`docs/deferred.md`'s per-game table also had **no spellingbee row** under a
headline that says only the listed games have open items — while the game's doc
carried four. It has one now, pointing at the folder's `todo.md`, the way
connections, psychicnum and wordle do.

### What moved under the area — read 2026-09-22

§4's window is empty by construction here: the opening commit (`a9a5695c`)
stamped all 23 FE files, so "since the area's files last changed" is today. The
honest anchor is **`5f69e95b` (2026-09-15, "the hive behaves like a board")**,
the last commit that wrote this game's code for its own sake — everything since
is a shared area reaching in. In that window **32 commits touch
`src/common/game-page/`**, and the cumulative diff rewrites
`playArea.module.css` (392 lines), `GamePage.tsx`, `GamePageGate.tsx`,
`useCommonGame.ts`, `gamePageCtx.ts` and `verdictTone.ts`, and adds
`readLeaderboard.ts`.

**What that makes a FALSE finding here:**

- *"This state survives a restart"* — and now also *"survives a game→game
  navigation"*: `GamePageGate` derives `exists` from `{ id, exists }`, so a
  different `gameId` says `checking` and unmounts the subtree (`e3d8f969`).
- *"A finished player wedges the pause"* — `activePlayers` is now `players`
  minus conceded, minus `locally_terminal`, minus `ai_member` (`624c8dc2`).
  **Checked, and there is nothing owed here:** spellingbee's SQL sets no
  `locally_terminal` and it is right not to — conceding is this game's only
  per-player done state (`PlayArea.tsx`'s `isLocallyDone`), and a conceder was
  already out of the roster. It has no bots either.
- *"`computePause` also answers who is absent"* — it answers a boolean
  (`197d455a`), and the suspend confirm is `askConfirmation(suspendConfirm(…))`,
  not a mounted modal (`b5f21539`).

**What the game already reads, so a finding has to be about what it wrote
ITSELF:** `useMark` (`PlayArea.tsx`, the word answer), `VERDICT_TONE`
(`Letter.tsx`), `shared.boardSeal` (`Letters.tsx`), `--avail-h` composed rather
than hand-summed (`BoardCol.tsx`, `PlayArea.module.css`), and `InfoCol.tsx`'s
import off the info column's own stylesheet.

**One candidate the window produced** (for the prose pass, not worked):
`Letter.tsx`'s tone-class comment says the class "sets nothing but the two
custom properties". `verdictTone` carries three since `7cca2427` —
`--verdict-fill`, `--verdict-ink` and `--verdict-edge` — so the count is wrong,
and whether the hex should wear the edge is a real question rather than a typo.

## The restructure

Each step is one commit Joel reads; that reading is his careful read of the
code, made on the shape that will stay. Every step is behavior-preserving
unless its heading says otherwise, verified by the net below.

### Step 0 — the baseline — DONE 2026-09-22

Run on the untouched tree with the roster stamped `cs-met-spellingbee` (Joel:
*"do step 0"*, then *"Both"* to the e2e question):

- `tsc -b` clean; lint clean over `src/spellingbee/` **and**
  `supabase/functions/spellingbee-build-board/` — the edge function is on this
  roster, so it is in the net from the start.
- The game's unit tests and the guards: 35 files, 341 tests, green.
- The edge function under `deno test`: 11 tests, green — the letter masks,
  pangram scoring, the overlap cap and the custom-letters validator. **This is
  the piece no earlier game area had**, and it is a second runner, not a vitest
  project: `deno test --allow-all supabase/functions/spellingbee-build-board/`.
  `deno check` is not a substitute — it does not run them, and a chunk that
  type-checks can still fail to boot.
- pgTAP, the whole suite: `gmake db-sql ENV=local` then `npm run test:db` —
  181 files, 2559 tests, PASS. Twelve of spellingbee's thirteen files are the
  roster's; `rank_idx_test.sql` is `rank-ladder`'s and ran with them.
- The geometry harness re-seeded with `BASELINE=1`: 21 boards written, and the
  new file **byte-identical to the one it replaced**, so no board had drifted
  since the last seed. (Nothing to commit — the file is gitignored.)
- spellingbee's four e2e specs: **7 tests, green in 15.1s** (`spellingbee`,
  `spellingbee-coop-win`, `spellingbee-mobile`, `spellingbee-print`). The
  custom-letters spec is among them, which is the last of the entry ruled above.

**A later red is the step's.**

### Step 1 — gather this game's owed work into `todo.md` — DONE 2026-09-22

Two sources were already emptied above, before the step had a number: the
doc's Deferred section and `docs/deferred.md`. What the rest held:

**`src/common/game-page/todo.md`'s end-for-all item — the copy here is
DELETED.** wordle's F-2 found nine games carrying a copy of it; the shared
entry ends *"build it as one change, not fourteen"*, so a per-game copy is
exactly the thing it warns about — fifteen places for the fifteenth to be
forgotten in. The copy's own contribution was a check rather than work: *"what
to check first is the READING … that this game's `labelFor` and its in-game
verdict treat `ended` in COMPETE as neutral."* **Checked, and it does** —
`manifest.ts`'s compete arm answers `verdict('Ended', …)` with `nobody reached
"<rank>"` beside it, never a loss, and the all-conceded terminal is caught
ahead of it on `status.reason` so it cannot fall through and print the wrong
rank. Nothing owed; the shared item keeps the work.

**`plans/tile-feedback.md` holds two spellingbee entries, and neither is
`todo.md`'s.** The roster row (tf0 — *"a pass through the MARKS, not the
framework"*) and the shared-accent decision with wordwheel (*"one decision
covering both, at whichever converts first"* — this game converts first). Both
are pass 3's, read against the board when it opens. Recorded here so pass 3
starts with them rather than rediscovering them.

**`docs/mobile.md` → TODO has one open item, and this game appears to have
done it already.** The feedback-message length audit (~26 characters in the
header pill on a 390px phone, ~48 below-board) lists three games as done and
not this one — but `PlayArea.tsx`'s peer line is written to that budget and
says so, naming the string it replaced. Not moved to `todo.md`: the audit pass
reads the rest of this game's strings, and claiming the pass before that would
be the overclaim. If they hold, mobile.md's list is what needs the edit.

**Checked and holding nothing owed:** `plans/keyboard-nav-plan.md`,
`plans/dark-mode.md` and `plans/spectating.md` cite this game as evidence, not
as work, and each is a plan with its own home; `docs/ui.md` → Explicitly
deferred is entirely cross-cutting; `plans/found-words.md`'s call about
`buildDisplayRows` still matches the tree (it lives in
`shared/found-words/foundWordsDisplayRows.ts`, and the doc's mention of it is
true).

**What `todo.md` holds after the step:** one Bug, three Soon (the action-row
collapse, the two Fisher–Yates shuffles, the ungated hive hover) plus the
struck custom-letters ruling, two Someday, one Won't do.

### Step 2 — the loader / loaded split (readability 3.1) — DONE 2026-09-22

The shape psychicnum settled and connections and wordle confirmed:
`PlayAreaLoader` owns `useGame` and the three gates — `<Loading>`,
`<EnvelopeErrorPage>`, `<NoSuchGamePage>` (its `detail` names the read that
came back empty, `rows=0 view=spellingbee.games_state`) — and hands `PlayArea`
a non-null game, the found-words rows, `rowsLoaded`, and a narrowed `setup`.
The cast happens once, in the loader's JSX; the inner component takes
`setup: SpellingbeeSetup` through `Omit<GamePageCtx, 'setup'>`. The manifest's
lazy line names the loader, and the test file mounts it at all 28 sites with
`useGame` mocked exactly as before.

**What went with it**, all in this commit: `spellingbeeSetup` and its cast,
`game?.mode ?? 'coop'` twice, `game ? {center, outer} : null`, `if (!game)
return` inside Print's run and its `describe: () => (game ? 'active' :
'hidden')`, `if (!game) return new Set<string>()`, `game?.requiredWords ?? []`
and its bonus twin, `game?.center_letter.toLowerCase() ?? ''`, `game?.mode ===
'compete' ? 'compete' : 'coop'`, the `gameMode` variable with its three
readers and its `if (!gameMode) return // menu exists pre-load`,
`game?.required_words_score ?? 0` twice, and the two inline gates
(`surface.loading` / `surface.empty`) — wordwheel and boggle still read both
classes, so nothing went dead in the shared sheet.

**One narrowing the split exposed rather than removed:** `explainReject`'s
`if (center && !w.includes(center))`. The `center &&` was guarding the `?? ''`
that no longer exists — a board always has a center letter — so it is gone
too.

**A docstring that documented nothing is now on its component.** The
play-surface docstring sat above `type SubmittedWord`, which has its own — so
the surface's description was attached to the type and `PlayArea` had none.
`orphanedDocstrings` does not catch this shape; the split put it back where it
belongs, and the guard's blind spot is worth a finding of its own.

**One behavior change, stated now**, the same one the three earlier games
made: while the read is out the header menu has no game rows and `+` does
nothing, where before the rows were published pre-load and `+` asked the
new-game question and then could not act. **That IS the Bug in `todo.md`**,
which is deleted there — `describe: () => 'active'` is now true rather than
optimistic, since the component holding the binding does not render until the
row is in hand.

**Verified:** `tsc -b` and eslint clean; 4 files, 56 tests green.

### Step 3 — the `doc.md` skeleton, with the RPCs and FE submissions written — DONE 2026-09-22

As wordle's `bee4cf95`: `src/spellingbee/doc.md`, seven headings, with the
lede, a short intro (three things that are high-level about this game: the
frontend knows the answer key, the board is built outside the database, and
what separates the modes is whose list a word lands on), the RPCs and the FE
submissions written from `supabase/sql/spellingbee.sql`, the edge function
and the call sites — not from the old doc — and Game rules, Schema, Frontend
and Tests marked owed to pass 2. The RPC section is the `ok` answers only; a
refusal that is part of the story is a clause without a code. The intro's
paragraphs open in plain prose, the rule `docs/common-folders.md` states.

**This game's own question, answered in the RPC section:** the edge function
is what starting a game actually calls, so it is listed first, under RPCs,
as *"the edge function in front of `create_game`"* — what it samples, what
`candidate_words` returns, how a word is scored and partitioned, the body it
takes, and that its answer is `create_game`'s envelope relayed untouched. The
board example is a REAL board, not an invented one: `A·CHIORT` run through
`candidate_words` on the local stack (81 required words for 385 points, 122
bonus; `chariot` the required pangram, `trochaic` a bonus one, `airt` a
four-letter bonus word), and every example word in the FE-submissions table
was checked against the same lists — `chit` lacks the center, `chait` is not
in the dictionary, `cat` is three letters.

**Written against the code, and where the old doc and the code's own words
disagreed:**

- The old doc's `submit_word` section says the answer carries `won: true` on
  the winning commit and lists `accepted` / `bonus` as the two `ok`s; the SQL
  answers four `result`s (`accepted` · `bonus` · `pangram` · `won`), `won`
  taking precedence, and the call site treats all four alike. The doc says
  the four.
- The old doc's `submit_timeout` says a second call "raises P0001, which the
  FE swallows"; the SQL answers a race envelope through the boundary. Not in
  the new doc at all — a refusal is not game logic.
- `docs/games/spellingbee.md` → Play states says a compete timeout is
  `lost_compete` because "a compete race always carries a target rank"; the
  SQL writes `lost_compete` only when `target_rank` is not null, and `ended`
  otherwise. The two agree in practice (`create_game` refuses a race with no
  target), and the doc says "always `lost_compete` in a race".

**What the doc records as it is TODAY, which Step 4 changes:** the words a
player reads are written in three places plus the server — the engine's
`line()` (`+N`, `pangram +N`, `too short`, `already found`), this game's
`explainReject` (`bad letters`, `missing "A"`, `not a word`), `PlayArea`'s two
peer narrations (`found WORD +N` / `pangram 🐝 WORD +N`, `reached <rank>`),
and `submit_word`'s duplicate race, which composes the whole
`WORD — already found` line so both routes to it read alike. `lib/answer.ts`
holds only the outcome table. The FE-submissions table lists all six with
where each is written, which is the inventory Step 4 starts from. **The
duplicate is the thing Step 4 has to reckon with that connections and wordle
did not**: it is the one answer this game deliberately writes twice (Joel,
2026-09-01, in the SQL), so the conversion cannot simply move its words.

**Seen with the code open, left for pass 2** (stale claims, the prose pass's):

- `lib/setup.ts`'s docstring says `create_game` "rejects a `mode` field on
  setup with a loud P0001"; no such check exists in the SQL, and the old doc
  records its removal on 2026-08-02.
- `manifest.ts`'s docstring cites "hidden wordlists via the games_state view"
  (both lists ship), and `startGameInClubFactory` says the edge function
  "strips `setup.mode` if present" — `parseBuildBoardRequest` strips nothing.
- `spellingbee.sql`'s `create_game` header gives the title example as
  `E·CABDNO`, which is not alphabetized; the code sorts. The `submit_word`
  duplicate comment names `useWordSubmit`, a hook that is `useFoundWordSubmit`;
  and the `submit_timeout` / `end_game` headers say `status.outcome` where the
  key written is `reason` — the same rename residue wordle's prose pass found.
- The edge function's header says "all ~3.5k rows" of `spellingbee.pangrams`
  where the old doc and the importer say ~2.1k, and its step 6 lists
  `create_game`'s arguments without `mode`.
- `PlayArea`'s surface docstring describes verdicts that do not exist ("You
  won the race!", "Beaten to the punch.", Genius-vs-Stopped on `ended`);
  `buildOver` writes `You won!`, `<name> won`, and one `Ended:` sentence at
  every rank. Step 8's comment pass will reach it before pass 2 does.
- **`InfoCol` takes a `setup` prop it never reads** — declared in its props
  type, passed by `PlayArea`, not destructured. wordle's F-5, again.

**One thing the step corrected in the pickup notes:** `folderDocs` does NOT
guard a game folder's intro — its walk is one level under `src/common/` and
`src/shared/` only — so the plain-prose rule holds here by hand, not by test.

**Verified:** the guards green with the file in place (31 files, 285 tests).

### Step 4 — the `AnswerMessage` conversion — DONE 2026-09-22

**The shape is not connections' and wordle's, because the words were not all
this game's.** Three of them — `+N`, `too short`, `already found` — were
written by the shared engine `useFoundWordSubmit`, for all four games that use
it. Joel's ruling, reached over the design: **the engine decides what
happened, and the game decides what to say about it.** The engine reports each
answer to a REQUIRED `onAnswer` as a `WordSubmitReport` (the answer, the
normalized word, its entry where there is one) and names no word of its own;
`outcomeFor`, `explainReject`, `hideAccepted` and `line()` are gone. The one
thing it still shows is a commit's `not-ok` — the server's sentence, which
every game in the family showed identically, and which is always a race or a
bug, so it is no game's answer. Each game writes its own format strings (Joel:
*"we'll just do a format string in the game"*). Because the engine's contract
changed under all four, **boggle, wordwheel and wordiply converted in this same
step** — shared and spellingbee first, for Joel to read, then the rollout.

**What shipped, per game** — each `lib/answer.ts` is the `Answer` union,
`answerMessage()`, `answerOf(report, …)` (the engine's one `not_legal` split by
what the board knows) and `peerAnswerMessage(row)`:

- **spellingbee** — eight answers: `accepted` · `accepted_peer` ·
  `already_found` · `too_short` · `bad_letters` · `missing_center` ·
  `not_a_word` · `reached_peer` (the compete rank climb). `PlayArea`'s
  `onAnswer` shows the pill and drives the shake and the hex mark from one call.
- **wordwheel** — the same less `bad_letters` (the wheel's submit gate vetoes
  an unspellable word before the engine sees it).
- **boggle** — `not_on_board` / `not_a_word` by whether a path spells it; the
  7+ letter `wow!` peer line moved in with the rest.
- **wordiply** — `accepted` has empty text (what `hideAccepted` did);
  `eventToOutcome(row)` replaces the log bar's `ANSWER_OUTCOME` index. The log,
  the PDF and the history banner keep their own terse words, as wordle's did.

**The SQL half.** No `submit_word` / `submit_guess` `ok` carried an outcome
already, so nothing was stripped; what was missing was the test. Each game's
pgTAP now pins `outcome` and `message` null on the accepted answer, and on
both wins (spellingbee, wordwheel) and the recorded rejection (wordiply). The
four duplicate-race comments named `useWordSubmit`'s `line()`; they now point at
the game's `already_found` answer.

**Not a word changed.** Every text and outcome a player sees is the one before;
the component tests that read the pill's text are green untouched.
`wordWithBonusDot` stays exported from the engine file — three games' own-move
and peer lines use it (Joel: *"fine to keep there"*). wordiply's
`eventToOutcome` builds `missing_base` with an empty base, since a logged row
has none and the color needs none (Joel: *"it's ok"*).

**Verified by planting.** An outcome planted into every `ok` of the four
submit functions (from scratchpad copies) turned exactly the new pins red and
nothing else but the plant's own helper tripping the PUBLIC-execute guard;
restored, green. `tsc -b` clean, eslint clean over the five folders, 651 unit
tests green (the four games, found-words, the guards), the whole pgTAP suite
green (181 files, 2567 tests). The e2e specs have not run.

### Step 5 — the actions and the row (readability 3.6, 3.7) — DONE 2026-09-22

wordle's Step 5, copied. **The row is one `<InfoActionsRow>` now**, in the
order `docs/playarea.md` states: Restart · New game · Concede · End | Back to
club, Back to club filled only at terminal. The three-way fork (`over ? … :
isLocallyDone ? … : …`) is gone; the only thing that varies is the row's line
— the verdict, "You conceded", nothing while you can play. The InfoCol's
destructure, its prop-type block and the PlayArea's prop list read in that
order, and so does the menu. **No divider**: spellingbee has no hint and no
spoiler, so nothing sits left of it.

**The conventions, per binding:** New game is a button only at terminal,
`(asker) => asker === 'button' && !isTerminal ? 'hidden' : 'active'`, a menu
row and `+` all game; Restart, Concede and End were already the shared hook's.
`createNewGame` was already a plain `async function`, and no in-flight flag
existed to remove. **One `useCallback` dropped:** BoardCol's `handleShuffle`
had the shuffle binding as its only reader, so the binding's `run` is the
setter call itself; `handleLetterClick` keeps its wrap, since a child reads it.
**Every binding in one section, in one order:** Print moved from above the
derived state to after New game — the shared trio, New game, Print — unchanged
in body.

**Two behavior changes, stated now.** *A conceded racer gets Back to club* —
the conceded row held only the grayed Concede, which is what the todo named as
the fork's loss. *The menu lists Restart · New game above Print*, where Print
came first, so the menu and the row read alike. Back to club keeps `weight={over
? 'primary' : 'secondary'}`.

**The todo's Soon item is deleted.** Two tests pin the conventions: Restart
and New game are menu rows all game and buttons only at the end; and the
conceded racer's test now asserts Concede grayed, Back to club present, and
Restart / New game menu-only. **Verified by planting** New game's old
`'active'` and the old row's missing Back to club: exactly those two tests red;
restored from scratchpad copies, green. `tsc -b` clean, lint clean over
`src/spellingbee/`, 345 unit tests green (the game's and the guards).

### Step 6 — the builder leaves the component file (readability 3.4) — DONE 2026-09-22

wordle's Step 6, copied, names and all: the builder is **`buildTerminalMessage`**
in `lib/terminal.ts`, the value it produces is `terminalMessage`, and InfoCol's
`over` prop is `terminalMessage` too. `PlayArea.tsx` no longer imports
`gameEndedTerminalMessage`, the `TerminalMessage` type or `Actor`; the
`useMemo` on primitives that feeds the verdict effect stays there. The body
moved unchanged — same branches, same words.

**One rename on the way out, which wordle's did not need:** the input was
`statusOutcome`, a name left from before `status.outcome` became
`status.reason`. It is `reason` now, as wordle's builder has it, and the three
docstring lines that said "`lost_compete` + outcome `conceded`" say "reason".
The value is the same `status.reason` it always was.

`lib/terminal.test.ts` walks the whole input space — every terminal play state
in both modes (`won` · `lost` · `ended` · `won_compete` · `lost_compete`), the
caller winning and beaten, the winner known to the roster and not, both
collective losses told apart by reason — and the last case is a TABLE: no cell
pairs a winning sentence with a losing outcome, and both texts are filled. Both
files join the roster at `cs-met-spellingbee`. The old
`docs/games/spellingbee.md`'s four mentions of `buildOver` and one test comment
name the new function.

**Still standing for Step 8:** `PlayArea`'s surface docstring describes
verdicts that do not exist ("You won the race!", "Beaten to the punch.") — the
Step 3 note above; the builder's own docstring, which moved with it, is right.

Verified: `tsc -b` clean, lint clean over `src/spellingbee/`, 353 unit tests
green (the game's and the guards). The e2e specs have not run for Steps 2–6.

### Step 7 — the section order (readability 3.2) — DONE 2026-09-22

wordle's Step 7, copied, header words and all. `PlayArea.tsx` reads:

1. Page hooks — `useTabRing`, `useInfoSheet`, `useCelebration`
2. Derived — `summaryRows`, `hasBonus`, `myConceded`, `isCompete`, the found
   rows and their score + count, `selfRankIdx`, `targetRankIdx`,
   `isLocallyDone`
3. The local slot, and its two standing conditions — the slot, the terminal
   message and its winner derivations, out-of-race
4. **The move — a typed word, and its answer** — `allowedLetters`,
   `legalIndex`, the shake nonce, the answered mark, `center`, the engine
5. Narration — the coop peer-word line and the compete rank climb
6. The commands, bound — the shared trio, New game, Print
7. The menu
8. Render — `concededIds`, the leaderboard and `rankByUser`, `wordRows`, then
   the columns

**One section the doc's eight do not have: The move.** `docs/playarea.md`
puts committing a guess in the BoardCol; spellingbee's engine lives in the
PlayArea, because the engine's answers drive the hive's shake and marks and
its slot is the PlayArea's. It stands after the local slot, which every answer
lands in — where readability 3.2's first proposal had it ("5. The move — the
input engine's coordinator half, where the game has one"). **Ruled the same
day: the engine moves into `BoardCol`** — see "The engine moves into BoardCol"
below, which removed the section again. There is no turn-history viewer
section: the game has no viewer.

`BoardCol.tsx` reads in three: **The pending guess** (the letters the word is
using, the letter click) · **The board's display order** (the shuffle's seed,
memo and binding) · **Render** — the doc's five less the two it has no need
of, since the board never shows a past turn and the commit is the PlayArea's.

**Every code line in both files is a pure move, checked by diff** — the
non-comment lines of each file before and after, sorted, are identical (446
in `PlayArea.tsx`, 172 in `BoardCol.tsx`). The old `// ───` sub-headers are
plain comments now (the celebration, the allowed letters, the slot, the
engine, the shared trio, New game, the two narrations); the "two standing
conditions" block's header became the section's. Three comments moved or
split with their code: `myConceded`'s kept its first sentence and
`concededIds` got its own (it went to Render); the parenthetical "`selfRankIdx`
is derived above, beside the verdict" became `selfRankIdx`'s own comment in
Derived, since the move made its location claim false; the menu's comment is
its section's header text.

**Left for Step 8, the comment pass:** the archaeological "(The local
outer-letter shuffle + the letter-click input moved into BoardCol)"; the
narration's "Peer/opponent activity → header feedback pills" paragraph, which
repeats the new header; the shared trio's "New game stays below"; and the
surface docstring's nonexistent verdicts (Step 3's note).

Verified: `tsc -b` clean, lint clean over `src/spellingbee/`, 353 unit tests
green (the game's and the guards). The e2e specs have not run for Steps 2–7.

### The engine moves into BoardCol — DONE 2026-09-22

Joel, on Step 7's extra section: *"in general, if pieces can be pushed down,
that seems like a good thing?"* — then *"do this"*. Everything the engine
produced (`word`, `setWord`, `lastWord`, `submit`, the shake nonce, the
answered mark) was read only in `<BoardCol>`'s props, so the PlayArea was
computing it to hand it down. **This makes spellingbee match wordle,
connections and psychicnum**, whose BoardCols already own their submit RPC and
its `answerMessage`.

**What moved into `BoardCol`:** the `useFoundWordSubmit` call, `legalIndex`,
`allowedLetters` (its readers are all BoardCol's now), `center`, the shake
nonce and the answered mark, `commit` with the `submit_word` call and the
`SubmittedWord` reply type, and `onAnswer`. BoardCol **gains** `gameId`,
`mode`, `selfId`, `myConceded`, `foundWords`, `requiredWords`, `bonusWords`;
it **loses** `word`, `onChange`, `onSubmit`, `lastWord`, `shakeNonce`,
`answered`, `allowedLetters`. **What stayed:** the local feedback slot (the
standing conditions, the shared trio and New game write it too — it comes
down as a prop, as before) and `foundWords` (the score, the word list, the
print and the peer line read it). **InfoCol is untouched** — it reads none of
the engine's outputs.

**The sections now match the doc.** The PlayArea is back to eight (no "The
move"). `BoardCol` reads **Committing a guess** · **The pending guess** ·
**The board's display order** · **Render** — the doc's order less its first
section, with one swap: committing comes first, because the engine returns the
pending word the next section reads, where wordle's pending guess is state the
column keeps itself.

**One behavior change, Joel's ruling (*"do the fix"*):** the entry was
disabled on `isTerminal` alone while the engine refused on `isTerminal ||
myConceded`, so a conceded racer's keys filled a word nobody could see (the
out-of-race line holds the slot) and lit its hexes, and Enter did nothing.
Both now read one `entryClosed = isTerminal || myConceded`. A new test — a
conceded racer types `bed` and no hex lights — went red with the old gate
planted back and green restored. **Still open: hive TAPS are gated nowhere,**
at terminal or after conceding — `Letters` has no disabled state and
`handleLetterClick` always appends — so a tap still fills the hidden word.
Joel's to rule; it changes the terminal board too.

**The family diverges for now:** boggle, wordwheel and wordiply keep their
engines in their PlayAreas until their areas open. Wordiply's is the one that
needs a decision — its row mark is shared between my own answers (the engine)
and a teammate's word (the narration).

Verified: `tsc -b` clean, lint clean over `src/spellingbee/`, 353 unit tests
green (the game's and the guards) — the submit tests render the whole
`PlayAreaLoader`, so they cover the new wiring without change. The old
`docs/games/spellingbee.md`'s file-tree entries for `PlayArea.tsx` and
`BoardCol.tsx` say where the engine is. The e2e specs have not run for Steps
2–7.

## Findings

*(`F-spellingbee-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to `todo.md` or
`docs/games/spellingbee.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] `docs/games/spellingbee.md` reconciled with `todo.md`: its Deferred
      section moved into the todo (2026-09-22, above), and `docs/deferred.md`
      points at the folder's register
- [ ] the tile-feedback pass done, and the game's tf level updated there
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
