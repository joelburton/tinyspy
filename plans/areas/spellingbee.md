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
planted back and green restored.

**Then the whole board, psychicnum's shape (Joel: *"locally-terminal or
terminal, the board should be inert"* — *"do it"*).** Hive TAPS had been gated
nowhere, at terminal or after conceding, so a tap filled the hidden word and
lit its hex, and every hex still rose on hover and pressed. Now `PlayArea`'s
Derived computes `readOnly = isTerminal || isLocallyDone` and hands BoardCol
that one flag — the name `docs/playarea.md` gives the board-only "visible but
inert" prop — in place of `isTerminal` and `myConceded`; `entryClosed` is gone
into it. BoardCol passes `onLetterClick={readOnly ? undefined : …}`, as
psychicnum passes no `onPick`; `Letters` and `Letter` take the click as
optional, and a hex without one wears `.inert`: `cursor: default`, and the
hover rise and the press gated `:not(.inert)` — the shared `.tile:disabled`'s
answer for a hex that is not a button. Full color and the resting shadow stay.
**Shuffle stays live** (the post-game fidget, deliberately). **A spectator
with no seat is not folded in** — wordle's `readOnly` includes `!self`, but
what a watcher sees is `plans/spectating.md`'s, undecided.

Three tests: a tap adds its letter while I can play; a conceded racer's hive is
inert (all seven hexes `.inert`) and a tap adds nothing; the same at terminal.
The last two went red with the ungated tap planted back and green restored.
**The CSS is not visually verified** — jsdom has no hover; the class is
asserted, the look is not.

**Joel, reading it: *"selection should be cleared when the game is
terminal/locally-terminal"*** — a word half-typed when the game ended kept its
hexes marked. `usedLetters` is empty while `readOnly`, derived rather than
cleared, as psychicnum's `selected` is (`pending === '' || !isStillPlaying ?
null : pending`): terminal and conceding are both one-way, and a restart
remounts the board. A test types `bed`, ends the game under it, and finds no
marked hex; red with the old derivation planted back, green restored.

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

### Step 8 — the comment pass (readability 3.5) — DONE 2026-09-22

psychicnum's Step 6 rules, over six files: `PlayArea.tsx`, `BoardCol.tsx`,
`InfoCol.tsx`, and the board's three — `Letters.tsx`, `Letter.tsx`,
`TypedWord.tsx` (wordle's pass took its `Board.tsx`; the hive is three files).
**501 comment lines in, 386 out.** **Proved a pure comment pass** — with every
comment form stripped (block, line, trailing, and the JSX `{/* … */}`), blank
lines dropped, all six files are byte-identical before and after. One
whitespace change on purpose: `Letters.tsx` had a blank line between its
docstring and `export function Letters`, which the proof's blank-line drop
covers.

**Seven comments were FALSE, not stale.** The surface docstring's verdicts
("You won the race!", "Beaten to the punch.", Genius-vs-Stopped) — Step 3's
note, now rewritten around the decomposition, as wordle's was. The shared
trio's "only the replay sentence is spellingbee's" — the call passes no
sentence at all. The celebration's reason for compete not celebrating
("telling the winner from the losers needs data that isn't right on the first
render") — `status.winner_user_id` is on the common row, so it IS right on the
first render; the fact stays (a race's `won_compete` is not celebrated), the
reason is gone, and **the race winner's confetti is pass 2's finding**, as it
was connections' F-1 and wordle's F-6. `Letters.tsx`'s docstring said "the
parent (PlayArea) controls the shuffle" (BoardCol does), "sets us up for a
future PDF export" (the PDF exists and shares `lib/honeycomb.ts`), and "server
validates on submit" (the FE validates; the server records). `Letter.tsx`'s
tone-class comment said "the two custom properties" where `VERDICT_TONE`
carries three — the candidate the shell-commit read flagged; **its twin in
`Letters.module.css` says "two" as well and is left for the stylesheet pass**,
CSS being outside this step. `TypedWord.tsx` named the refusal `"badLetters"`;
the answer is `bad_letters`. And Print's "RLS + the explicit compete filter
already scope what I may see" — the filter is `myFoundRows`, and the print
reads `foundWords`; RLS alone scopes it.

**Joel's three rules did the cutting.** Rule 3 (a product ruling is not a
comment): End's "a valid outcome, not a punishment", the shuffle's "the
post-game fidget is deliberate" and "Always clickable, even when locked",
InfoCol's "the thing you watch" and "the honeycomb makes the move obvious",
`onAnswer`'s "you know what you just typed, and a peer is never told about
somebody else's miss", and the slot prop's "this is the ONLY copy the player
sees". Rule 2 (why-here): the shuffle's "Bound HERE rather than in the
PlayArea", the Committing header's "First, because the engine owns the pending
word", and `createNewGame`'s "A plain function, rebuilt every render"
paragraph, which psychicnum and wordle cut in the same words. Rule 1 reached
one comment: the shuffle's ⌥Z.

**Archaeology:** "(the engine is BoardCol's)" on the JSX group is a present
fact now, wordle's "(BoardCol owns submit_guess)" shape; the celebration's
"(the waffle loading-race lesson)"; `Letter.tsx`'s whole history — the
`clip-path` div it replaced, "the whole button costume was unreachable
scaffolding", "the test hooks that replaced `role="button"`", "`onMouseDown` is
still intercepted, now only"; two citations of `spellingbee-ws`, the port's
source (provenance); "Same rule as boggle's". **Call sites to a sentence and a
pointer:** the envelope paragraph in `createNewGame` (docs/envelopes.md), the
`ready` gate (`usePeerFeedback`'s docstring explains it), `commit`'s
four-branch paragraph (the engine's `commit` contract says what `null` means),
the NEW_GAME_CONFIRM paragraph. **The four Step 7 parked comments are gone:**
the "(… moved into BoardCol)" line, the narration paragraph that repeated its
header, the trio's "New game stays below", the surface docstring.

**One pointer repointed:** `createNewGame`'s "(docs/games/spellingbee.md)" —
a doc pass 2 deletes — now cites `doc.md → FE submissions`, which already
says a custom board is a one-off.

**The marker rule:** every prop note in `BoardCol`, `InfoCol`, `Letters`,
`Letter` and `TypedWord` was `/**` and is `//`. `InfoCol`'s destructure
carried a paragraph explaining that the type block below has group headers;
the destructure has the headers now, as wordle's does.

**Seen with the code open, left for pass 2 — code, not comments:** Print's
`rankIdx` recomputes `selfRankIdx`; `BoardCol`'s `if (!outerLetters) return
[]` guards a string prop the loader never leaves empty; `InfoCol`'s unread
`setup` (Step 3's list); `Help.tsx`'s docstring says "Phase 3 copy … the rank
ladder (which the UI doesn't render yet — that's Phase 4)", which the prose
pass takes with the rest of the roster; `createNewGame` is a `const` arrow
where wordle's is a function declaration.

Verified: `tsc -b` clean, lint clean over `src/spellingbee/`, 358 unit tests
green (36 files, the game's and the guards). The e2e specs have not run for
Steps 2–8.

### The stylesheet split — DONE 2026-09-22

The per-importer rule (app-audit.md row 53), and the survey needed no
judgment: `Letters.module.css` had two importers, and no class was read by
both. `Letters.tsx` reads `.board` / `.floatAnchor` / `.grid`; `Letter.tsx`
reads `.hex` / `.inert` / `.center` / `.used` / `.answered` / `.hexShape` /
`.hexText`. So **`Letter.module.css` is new**, holding every rule from `.hex`
down — the depth trio, the reduced-motion block, the shape, the three states,
the text — and `Letters.module.css` keeps the wrapper, the anchor and the svg
with its touch behavior. **Rule bodies and `/* @@ */` markers moved verbatim**;
both headers are rewritten (the old one credited `PlayArea.module.css` with
`--u`, which `beeBoard.module.css` declares, and called the PDF export
"future"). One rule comment changed with them: `.answered`'s "the two custom
properties" — `VERDICT_TONE` carries three, so it says "the verdict tokens".
The two pieces of archaeology in the rule comments ("Hover used to DIM",
"It was 0.9") are the prose pass's, untouched here.

**Prose pointers chased:** `theme.css` (the center hex's stroke), `todo.md`'s
hover item and its Won't-do fold entry, `docs/deferred.md`'s ungated-hover
item, `docs/code-conventions.md`'s fold pointer, `docs/games/wordwheel.md`'s
two fold entries, and the old `docs/games/spellingbee.md`'s file tree and
pointer table. Each now names the file the rule lives in.

**Verified in the EMITTED css:** `vite build` to the scratchpad, and the
game's chunk carries two module hashes (`_grid_y4wns` beside `_hex_n3e9l`)
with the `prefers-reduced-motion` block once. `cssClasses` and `csStamps` green
with the file staged (`git add`, the guards reading the index); `cs-stamp.mjs
list met-spellingbee` shows the new file. `tsc -b` clean, lint clean, 358 unit
tests green.

**Joel's second question: should anything in `PlayArea.module.css` be in a
`BoardCol.module.css`? No.** The file is one `.layout` rule, worn by
`PlayArea.tsx`'s root, declaring six custom properties — and by the importer
test that is exactly what the file should hold. By the who-reads-it test the
answer is the same: two of the six are READ on `.layout` itself —
`--board-reserve` by the shell's `.responsiveInfoCol`, `--mobile-status-height`
by the family's `--avail-h` rule under `@media (--mobile)` — so they cannot
move down. The other four (`--board-units-w/h/cap`, `--max-board-size`) are
read on `.boardCol` by `beeBoard.module.css`, and could in principle be
declared there; but `--board-reserve` is derived from the same numbers (256 ×
30rem/320), the bee-games contract (CLOSED) says "each game's own
`PlayArea.module.css` sets four numbers on `.layout`", and wordwheel does the
same — so moving spellingbee's alone splits one geometry across two files and
diverges the fork pair. `BoardCol.tsx` wears no class of its own
(`shared.boardCol` + `bee.boardCol`), so it needs no module. **The restructure
is complete.**

## The audit — pass 2

### The prose pass — shipped 2026-09-22, one sitting

In the working tree for Joel's read, before any finding is presented
(the order [app-audit.md](../app-audit.md) §4 sets):

- **`src/spellingbee/doc.md` is whole.** The intro's fourth paragraph (the
  end of a game is on the board); Game rules with a Vocabulary table, Coop,
  Compete and The play states; Schema; Frontend, with the render tree and what
  is spellingbee's own; Tests, both suites as tables, the Deno runner and the
  four Playwright specs named. Written from the code, as Step 3's sections
  were, not from the old doc — and where the old doc and the code disagreed,
  the code won: its "the seeds table is built from band-1 pangrams … ~2.1k
  rows" (the local pool is smaller and the count is nobody's to state), its
  "missed **required** words" reveal (bonus words fold in too), its "Solid..
  Genius" picker (Good..Genius), and its file tree naming a `WordList.tsx`
  this folder does not have. **`docs/games/spellingbee.md` is deleted**;
  CLAUDE.md's row, the manifest's docstring, `submit_word`'s comment,
  `docs/naming.md`'s vocabulary pointer, `docs/common.md`'s COPY pointer (now
  at `lib/copyLoad.ts`, which carries the reason) and the eleven links in
  `docs/games/wordwheel.md` and `docs/games/boggle.md` (the `docLinks` guard
  found five of them) are repointed. The frozen migration's five
  `See docs/games/spellingbee.md` stay, an applied migration being nobody's to
  edit.
- **The marker pass**, in the shape [[docs/code-conventions.md]] → Code
  clarity states: a note on a field or an argument is `//` (`lib/setup.ts`'s
  values, `lib/terminal.ts`'s input, `pdf/`'s model, `setupSummary`'s `board`,
  the edge function's `Setup`, `board.ts`'s three row types). The compete
  manifest's `labelFor` carried a `/**` inside the object literal. One
  docstring sat on the wrong declaration: `board.ts`'s
  `validateCustomLetters` docstring was above the `LetterFault` type, with a
  stale `//` block between them describing a return shape the function does
  not have; the type and the function each have their own now.
- **The stale claims.** `lib/setup.ts` said `create_game` "rejects a `mode`
  field on setup with a loud P0001" (no such check); `setup.psql` said the
  same. `manifest.ts` cited "hidden wordlists via the games_state view" (both
  ship), said the edge function "strips `setup.mode` if present" (it strips
  nothing), and said the form shows the target-rank picker "iff compete" (coop
  has *Win at*). `SetupForm.tsx`'s docstring said the compete picker "covers
  Solid..Genius — Start and Good drop out" against a `TARGET_RANK_CHOICES` of
  1..6, named a "short paragraph" the form does not render, and a cast to a
  type it does not use. `db.ts` described a view that "conditionally exposes
  the hidden `required_words`" behind a column grant that blocks it — the
  grant lists both lists. `lib/setupSummary.ts` said its order "mirrors
  `SetupForm.tsx`" (the target rank sits after the bands here, before them
  there). `lib/terminal.ts` named `rankLabel` as still used (nothing in the
  file calls it). `pdf/` named `wordColumns` (the body is `drawWordListBody`)
  and "required-but-missed" (bonus fold in). `Help.tsx` said "Phase 3 copy …
  Phase 4". The edge function's header said "all ~3.5k rows" (the count is
  not stated anywhere now), listed `create_game`'s arguments without `mode`,
  and said it returns `{ id }` (it relays the envelope); `board.ts`'s row
  types said "band ≤ 3" and "band ≤ 5" where the bands are the game's. In the
  SQL: `create_game`'s header gave `E·CABDNO` unalphabetized and `bonus_words`
  as `[text, …]`; `submit_word`'s header listed "P0001 'game is not in
  progress'" and "P0002 'game not found'" where the raises are PN353–PN360
  envelopes; `submit_timeout`'s and `end_game`'s headers said `outcome`,
  "P0001 (which the FE swallows silently)", `ctx.menu.setGameItems`, and
  "spellingbee has no intrinsic 'you won' terminal state in coop" — the coop
  target win exists; `replay_board`'s cited `docs/celebration-ideas.md`, a
  file that does not exist. `gameplay_test`'s header listed `alreadyFound`
  among the `result`s (it is a race not-ok) and "post-terminal P0001;
  non-player 42501"; `compete_test`'s said `outcome='timeout'` and credited a
  "20260621 spellingbee_compete migration"; `rls_test`'s cited
  "docs/spellingbee.md → Designing for compete" and `setup.mode` (the policy
  reads `games.mode`); `reveal_partition_test`'s cited
  `src/spellingbee/components/WordList.tsx` and a list that "stops using
  per-finder colors" (it keeps them). `PlayArea.test.tsx`'s header cited a
  memory file by name.
- **The archaeology.** `spellingbee-ws`, the port's source, cited in
  `theme.css`, `submit_word` (four times), `submit_timeout`, `end_game` and
  `gameplay_test`; `submit_word`'s "used to be a `won: true` field",
  "after the bonus-scoring fix"; the dup comment's "(Joel, 2026-09-01)"; the
  SQL's and `schema_test`'s "no longer hidden" (four places); `coop_target_test`'s
  "Coop used to have no win at all"; `rls_test`'s "written for both modes from
  day one even though v1 ships co-op only", its and `schema_test`'s "Phase 1"
  / "Phase 2"; `theme.css`'s "(was #e6e6e6)" and the accent-edge's old
  feedback-amber story; `Letter.module.css`'s "Hover used to DIM" and "It was
  0.9"; `Letters.module.css`'s "focus rings" (no hex focuses);
  `PlayArea.module.css`'s "the same cap the old square box used"; the edge
  function's "Earlier shape pulled the full word list" and "the old 'pick
  center uniformly' path"; `SetupForm.tsx`'s "Only the input shape moved";
  `PlayArea.test.tsx`'s "no longer picks between two callbacks" and "which the
  conceded row used to". Rule 3: `DEFAULT_SPELLINGBEE_SETUP_COMPETE`'s "the
  'decisive race without being a slog' pick from the design conversation", and
  `answerMessage`'s paragraph arguing each outcome (psychicnum's cut, in the
  same words).
- **Not touched, on purpose:** the migration (frozen); the four e2e headers
  (`cs-unmet`, off the roster — `spellingbee-coop-win.e2e.ts` opens "Coop
  used to have no win at all"); `Help.tsx`'s body names ⌥Z, which is UI copy
  and a finding's question, not a comment's; `todo.md`'s attributions, a
  register being where they belong; `honeycomb.ts`, `useGame.ts`,
  `lib/answer.ts`'s type and `InfoCol.tsx`, which needed nothing.

**Seen on the way and left for the findings**, none of it prose: the race
winner's confetti (Step 8's note); `InfoCol`'s unread `setup` (Step 3's);
Print's `rankIdx` recomputing `selfRankIdx` and `BoardCol`'s empty-string
guard (Step 8's); `.hex:focus { outline: none }` on an element that cannot
focus; the two Fisher–Yates shuffles and the ungated hover (`todo.md`); the
edge function reads `common.words`'s `is_legal` as always-true and could drop
the field; and `common.md`'s "How a game uses it" still states spellingbee's
bands as the fixed 5 / 3 where they are per-game setup since the bands
shipped.

**Verified:** `tsc -b` and eslint clean over `src/spellingbee/` and the edge
function; the game's unit tests and the guards green (36 files, 358 tests —
`docLinks` caught the five markdown links to the deleted doc, repointed);
`deno test`, 11 green; `gmake db-sql ENV=local` then `npm run test:db`, 181
files, 2567 tests, PASS.

## Findings

*(`F-spellingbee-1 · slug · title`, one heading each; a status prefix when it
has one, no prefix means OPEN)*

The todo emptied, 2026-09-22: the prose pass's "left for the findings" list
and `todo.md`'s two Soon entries, each re-checked against the code before it
was written here: F-1 to F-9. The two reads the list also named (the edge
function's and the SQL's) were not findings but the audit's read, which
follows F-9 and raised F-10 to F-17.

### SHIPPED · F-spellingbee-1 · `race-winner-celebration` · the race's winner gets no confetti

**Joel, 2026-09-22: "do f1."** The gate is `playState === 'won' ||
(playState === 'won_compete' && winnerId === session.user.id)`; `winnerId`
moved up into Page hooks beside the hook that reads it (the terminal message
reads it from there). The modal keeps *You win! 🎉* and its body reads the
target rank for both modes, adding *first* in a race: *Reached "Amazing" first
— 17/18 points.* The old body read `setup.target_rank` directly; it reads the
derived `targetRankIdx` now, which is the same value. The wording is mine, not
ruled. `PlayArea.test.tsx` had no celebration test in either mode; a new block
has five: the coop win pops as it lands, a coop game opened already won does
not, my race win pops, somebody else's does not, and a race opened already won
does not. **Verified by planting** the gate back to coop only (the race-win
case red, the rest green) and to any `won_compete` (the somebody-else case
red), then restored. `doc.md` stated the coop-only rule in three places and its
Tests row said nothing about it; all four say the rule now, as does
`lib/terminal.ts`'s docstring. `tsc -b` and eslint clean; spellingbee plus the
guards, 36 files, 363 tests green. **No e2e has run for this.**

`useCelebration(playState === 'won')` in `PlayArea.tsx` is coop only, and the
comment above it states that as a fact with no reason. The reason it once gave
("the winner isn't known on the first render") was false and came out in
Step 8: `status.winner_user_id` is on the common row, which `PlayArea` already
reads as `winnerId`, so the gate is right on the first render, as
`useCelebration` requires. The modal's title is *You win! 🎉* and its body
reads `setup.target_rank`, which a race does not have (a race is won by
reaching the shared target, `submit_word` writing `winner_user_id` for the
caller). No test pins the current behavior either way.

connections' F-1, psychicnum's F-6 and wordle's F-6 all asked this question,
and all three gave the race's winner the celebration. Options: **the same
here**: the gate becomes `playState === 'won' || (playState === 'won_compete'
&& winnerId === session.user.id)`, the body reads per mode (the compete one
naming the target, not a rank), and `PlayArea.test.tsx` gains wordle's three
cases (my win celebrates as it lands, somebody else's does not, a race opened
already won does not); `doc.md`'s "A coop team that set a target celebrates
once" and its two other statements of the rule change with it. Or **keep coop
only**, with a comment that says it is a choice. Recommendation: the same
here, for the reason the three siblings gave.

### SHIPPED · F-spellingbee-2 · `unused-setup-prop` · `InfoCol` takes a `setup` it never reads

**Joel, 2026-09-22: "delete it."** Three lines in two files: the `setup:
SpellingbeeSetup` member of `InfoCol`'s props, the `setup={setup}`
pass-through in `PlayArea`'s JSX, and the `SpellingbeeSetup` import that the
member was the only use of. The `// ── Setup disclosure ──` heading keeps its
one real prop, `setupRows`. `PlayArea`'s own `setup` stays (the setup rows,
`hasBonus`, `targetRankIdx`). Nothing to plant: a prop with no reader is
invisible to every test, which is the finding. `PlayArea.tsx` is the only file
that renders `<InfoCol>`; `doc.md` never named the prop. `tsc -b` and eslint
clean; spellingbee + guards, 36 files, 363 tests green.

`InfoCol`'s props type declares `setup: SpellingbeeSetup` under the setup
disclosure, `PlayArea` passes `setup={setup}`, and the component destructures
only `setupRows` beside it. The `SpellingbeeSetup` import keeps the lint quiet,
since an unused member of a props type is not an unused variable. This is
wordle's F-5 exactly. `PlayArea`'s own `setup` stays; it is read by the
setup rows and the celebration's body. Options: **delete it** (the member, the
pass-through, the import), or keep it for a reader nobody has named.
Recommendation: delete it.

### SHIPPED · F-spellingbee-3 · `print-recomputes-rank` · the print handler works out the rank the component already has

**Joel, 2026-09-22: "fix."** The handler's `rankIdx` line is gone and the
coop header reads `RANKS[selfRankIdx]`. Same call, same inputs, so the printed
header cannot change. No unit test reaches the print handler (only
`spellingbee-print`'s e2e, which checks that a PDF downloads, not its
header), so there was nothing to plant. `tsc -b` and eslint clean; spellingbee
+ guards, 36 files, 363 tests green. No e2e run.

`PlayArea.tsx` computes `selfRankIdx = currentRankIndex(foundWordsScore,
game.required_words_score)` once, in Derived. The print handler computes
`rankIdx` from the same call with the same two inputs, and only its coop
branch reads it. The two cannot disagree today; the cost is a second name for
one value, which a reader has to check is the same. Options: **read
`selfRankIdx`** and drop `rankIdx`, or leave it. Recommendation: read
`selfRankIdx`.

### SHIPPED · F-spellingbee-4 · `empty-letters-guard` · `BoardCol` guards against outer letters that cannot be empty

**Joel, 2026-09-22: "fix."** The line is gone. The prop is `game.outer_letters`
off a row the loader has already held the surface for, and `create_game`
refuses anything but six distinct lowercase letters; had it ever been empty,
`Array.from('')` is `[]` too, so the output could not change. Seen on the
way: the migration's column comment says a narrower string raises at insert,
which `char(n)` does not (it pads); `create_game`'s length check is what
refuses it. The migration is frozen, so it stays. `tsc -b` and eslint clean;
spellingbee + guards, 36 files, 363 tests green.

The `outerShuffled` memo opens with `if (!outerLetters) return []`.
`outerLetters` is `game.outer_letters`, which is `char(6) not null` in the
migration, and the prop's type is `string`, so the guard's case never occurs.
Options: **delete the line**, or keep it as a defense. Recommendation: delete
it; a guard for a state the column forbids tells the reader that state exists.

### SHIPPED · F-spellingbee-5 · `hex-focus-rule` · `.hex:focus { outline: none }` styles an element that cannot take focus

**Joel, 2026-09-22: "delete it."** The rule is gone from `Letter.module.css`;
nothing else in the repo named it. Nothing to plant: jsdom renders no outline,
and the rule never matched. spellingbee + guards, 36 files, 363 tests green.

`Letter.tsx` renders the hex as a `<g>` and its docstring says it is
pointer only (no `tabIndex`, no `role`), so `:focus` never matches and the
rule does nothing. The group's `onMouseDown` `preventDefault()` also keeps a
click from moving focus, and the page's tab ring is empty. Options: **delete
the rule**, or keep it in case a hex ever becomes focusable
(`plans/keyboard-nav-plan.md` rules this game out: the hive is a reference you
read, not a route to a piece). Recommendation: delete it; the board focus rule
is that a tile never holds focus at all, so "in case" defends against what the
design rules out.

### SHIPPED · F-spellingbee-6 · `two-shuffles` · two hand-written Fisher–Yates shuffles, one per side

**Joel, 2026-09-22: "do both."** Both private `shuffled`s are gone. `BoardCol`
imports `shuffle` from `@/common/utils/shuffle`; the edge function imports it
as `'../../../src/common/utils/shuffle.ts'`, the way `scrabble-ai-move` imports
`mulberry32`. The edge function's deleted docstring carried the reason the
centers are shuffled (repeated boards on one seed vary their center), so that
line moved to the call site as a comment. Same algorithm, same `Math.random`,
on both sides. `todo.md`'s Soon entry is deleted; wordwheel's twin stays in
`wordwheel/todo.md`, where it stands on its own.

**Verified:** `tsc -b` and eslint clean; spellingbee, the guards and
`common/utils`, 40 files, 391 tests green; `deno check` clean and `deno test`,
11 green. **Booted:** a POST to the local function with the anon key came back
as the function's own envelope (`PN112`, no club), so the module graph loads
and the cross-folder import resolves at runtime. That probe returns before
the center loop, so no board was built; `e2e/spellingbee.e2e.ts` builds one
and has not run.

From `todo.md` → Soon. `shuffled` in `components/BoardCol.tsx` and `shuffled`
in `supabase/functions/spellingbee-build-board/index.ts` are both the same
loop over `Math.random`, and `src/common/utils/shuffle.ts` already exports
`shuffle` (default rng `Math.random`, returns a new array). The component
imports it by alias; the edge function imports it by relative path with an
explicit `.ts`, as `scrabble-ai-move` imports `mulberry32`. The component's
copy is also wordwheel's character for character, which is wordwheel's to fix,
not this area's. Options: **both call the shared util**, or leave them.
Recommendation: both call it; the edge function's `deno test` confirms the
import resolves.

### SHIPPED · F-spellingbee-7 · `ungated-hover` · a tap leaves a hex raised on a touchscreen

**Joel, 2026-09-22: "gate it."** `.hex:hover:not(.inert)` sits inside
`@media (hover: hover)` in `Letter.module.css`, with a comment saying why.
`.hex:active` stays ungated (a press ends when the finger lifts), and so does
the reduced-motion block: **the finding below was wrong about it** — on a
touchscreen its `transform: none` lands on a hex that no longer lifts, which
is a no-op, and on a mouse it still cancels the lift. `todo.md`'s Soon entry
is deleted; `docs/deferred.md`'s shared item and its twin in `docs/mobile.md`
name two games now (stackdown, wordwheel).

**A pointer that led nowhere:** `docs/ui.md` has no "Tooltips" section; the
`(hover: hover)` tooltip gate is a bullet under Button iconography, "Styled
tooltips". The new comment, `deferred.md` and `mobile.md` point there now.
strands' `Board.module.css` carries the same dead pointer and is strands'
area.

**Verified:** the stylesheet parses under postcss; `vite build` emits
`@media (hover:hover){._hex_…:hover:not(._inert_…){…}}` in the PlayArea chunk;
spellingbee + guards, 36 files, 363 tests green. jsdom evaluates neither media
queries nor `:hover`, so no unit test sees it. **Not checked on a device:**
the hex should still lift under a mouse and sit flat after a tap on a phone.

From `todo.md` → Soon. `.hex:hover:not(.inert)` in `Letter.module.css` lifts
the hex and lightens its shadow; a touchscreen keeps `:hover` on the last
element tapped, so after every letter one hex stays raised and looks like it
means something. strands fixed the same thing by wrapping the rule in
`@media (hover: hover)`, the gate `docs/ui.md` → Tooltips uses for the same
reason. The reduced-motion block names `.hex:hover:not(.inert)` too, and needs
the same gate or it keeps a selector for a rule that no longer applies on a
touchscreen. Options: **gate it**, and take this game's name off the shared
item in `docs/deferred.md` (stackdown and wordwheel stay on it); or leave it.
Recommendation: gate it, and check it on a phone.

### SHIPPED · F-spellingbee-8 · `is-legal-is-always-true` · the board builder carries a field that is always `true` and that nothing reads

**Joel, 2026-09-22: "do it."** `is_legal` is gone from `CandidateRow`, from
`fetchCandidateWords`' mapping (with its three-line comment on synthesizing
it) and from `board_test.ts`'s `cand` helper. `CandidateRow` gains a
docstring saying every row is legal because `candidate_words` returns only
legal-band words. No reference to `is_legal` is left in the function or the
folder. **Verified:** `deno check` clean on `index.ts` and `board_test.ts`
(a reader of the field would now be a type error); `deno test`, 11 green;
eslint clean; the local function boots (its own `PN112` envelope). No board
built, no e2e run.

The prose pass's note said the edge function reads `is_legal` as
always-true. The code is plainer than that: `spellingbee.candidate_words`
returns `(word, letter_mask, is_required)`, having already filtered to the
legal band; `fetchCandidateWords` in `index.ts` adds `is_legal: true` to every
row "for the consumer"; `CandidateRow` in `board.ts` declares it; and no line
in `board.ts` reads it. `board_test.ts`'s row builder sets it too. Options:
**drop the field** from the type, the mapping and the test helper, the
comment on `CandidateRow` then saying the rows are legal by construction; or
leave it. Recommendation: drop it.

### SHIPPED · F-spellingbee-9 · `common-md-fixed-bands` · `docs/common.md` states spellingbee's word bands as fixed

**Joel, 2026-09-22: "do it."** The sentence now says `candidate_words` takes
the game's two bands from its setup, 3 and 5 by default, and states legal and
required against "legal band" / "required band"; the required set's filters
are unchanged. Checked against `candidate_words`' arguments, the edge
function's `setup.required ?? 3` / `setup.legal ?? 5` and both default setups
in `lib/setup.ts`. Guards green.

`docs/common.md` → the word list → "How a game uses it" says spellingbee's
slice is "legal = `difficulty ≤ 5`, required = `difficulty ≤ 3` …". The
bands have been per-game setup since they shipped: `candidate_words` takes
`required_band` and `legal_band`, and the edge function passes the game's own
(3 and 5 are the defaults). Options: **say they are setup**, with 3 / 5 as the
defaults; or drop the numbers and point at `src/spellingbee/doc.md`.
Recommendation: say they are setup, with the defaults; the paragraph's point
is that a game picks its bands, and this makes the example show it.

### The audit's read — 2026-09-22

**The READ is DONE.** Every roster file end to end, React, SQL and CSS
together: the manifest, `db.ts`, `useGame.ts`, the five `lib/` files and their
three tests, the eight components and their four stylesheets, `theme.css`, the
printer, `PlayArea.test.tsx` and `SetupForm.test.tsx`, `doc.md`; the
repeatable SQL file whole, the frozen migration, `setup.psql` and all eleven
pgTAP files, plus `rank_idx_test.sql` as evidence; and the edge function's
three files.

**The edge function's first read, and what its shape turned out to be.** It
reads like any other file on the roster, with three checks of its own: what it
trusts from the setup blob against what `create_game` re-checks (the bands and
the letters, both re-checked; the shape of the rows it hands over, not); which
of its refusals the player can act on (PN175 and PN177, both validations, under
the field that caused them) against the ones only a broken client reaches
(PN172–PN174, faults); and that it boots, which `deno check` cannot prove (F-6
probed it). Its docstring is where most of its drift was (F-15).

**The checks beside the files:** the shell commits since the area opened
(`a9a5695c`..HEAD touches `src/common` and `src/shared` only through this
area's own Step 4, plus a toast and a scratchpad note, neither under this
game); what `common.end_game`, `common.reset_game`, `common.concede`,
`_raise_game_deleted` and `_raise_game_over` do (the first MERGES status, the
second ASSIGNS it — F-14 turns on that); what `makeBeeGame` refetches (the
found list only); the sibling games' answers to the same questions (wordwheel
is the fork and shares F-11, F-12 and F-14's SQL comments; every move RPC on
the roster answers a missing row as a fault, F-10); which setup keys are live
(`custom_center` is); every `doc → Section` pointer the roster cites (one dead
one, fixed in F-7; the rest resolve); and what reads the coop per-player
result keys (nothing, F-16).

What the game IS, for the record: the code held up. The trusting-commit split
is clean end to end (the FE judges, the server records, the one refusal that
can arrive both ways reads the same), the compete privacy rests on one policy
whose three arms are each pinned, the edge function's pure core is separated
and tested, and the terminals all say what they should. What the read found is
of three kinds: two decisions the roster made one way and this game another
(F-10) or never made (F-11 to F-13); prose that was right when written and
that the shell moved under (F-14, `common.end_game` learned to merge); and the
usual drift, tests and small shapes (F-15 to F-17). Eight findings: F-10 to
F-13 with a decision in them, then F-14 to F-17.

### SHIPPED · F-spellingbee-10 · `submit-word-deleted-game` · a word typed into a game a friend just deleted is answered as a BUG

**Joel, 2026-09-23: "i'll take your rec on this"** — the ruling first, then
this game's conversion. Asked first: does the page learn of the delete before
anyone acts? It subscribes (`useCommonGame` listens to every event on its
`common.games` row, and `replica identity full` puts the id on a delete), so
usually the page leaves on its own; nothing tests it, and a word already in
flight meets the missing row regardless.

**The finding undercounted, and I said so before building.** It named nine
move RPCs; the roster has **thirty-four** functions that answer a missing row
with a fault of their own, in fifteen games, including reads the AI edge
functions make and scrabble's `_commit_*` helpers — the first grep matched
only the `BUG:` wording and missed *"That game no longer exists"*. Several
also gate on membership first, so a deleted game there says *"You are not in
this game"*. The ruling did not change; where the other games' work is
recorded did, from a copy per game's register to one cross-cutting entry.

- **The ruling** is in `docs/envelopes.md` → How SQL builds one: a missing
  game row is PN485, in every game RPC that looks for one, the moves
  included, asked before `require_game_player`.
- **`submit_word`** calls `common._raise_game_deleted('spellingbee')`; PN353
  is retired. **The handler had to change too**: it did not read
  `constraint_name`, so the helper's `lost` would have been dropped —
  `raiseCodes.test.ts` refused it, and the pgTAP case failed on the missing
  outcome until the handler read it.
- **`gameDeletedFirst.test.ts`** lists `spellingbee.submit_word` among its
  callers, and its comment says the list grows as move RPCs convert.
- **The other thirty-three** are one entry in `docs/deferred.md` → Common /
  architecture, naming each function and what a conversion takes.
- **`doc.md`**: `submit_word`'s checks and the Tests row.

**Verified:** a `gameplay_test` case deletes the game and submits: PN485,
`race`, `lost`. **Planted** the old fault back — that case red; planted the
membership gate above the row check — `gameDeletedFirst` red naming
`spellingbee.submit_word`. Restored. `npm run test:db`, 181 files, 2579
tests, PASS; guards, 285 green.

`submit_word` opens by locking its `spellingbee.games` row, and when there is
none it raises its own `'BUG: a word submitted to a game with no spellingbee
row'` (PN353, a fault: the red modal). The other three RPCs that lock the row
(`submit_timeout`, `end_game`, `replay_board`) call
`common._raise_game_deleted('spellingbee')` instead, whose docstring is the
argument: `common.delete_game` is open to any club member, so a friend tidying
the club list really does delete the game under you, and that is a race
("That game was already deleted", `constraint = 'lost'`), not a broken client.
A word in flight is the likeliest way to meet it, since typing is what a
player is doing most of the time.

**The roster answers this one way, and not this area's alone.** Every move RPC
on the roster raises its own fault for a missing row: wordle's and
connections' say *"That game no longer exists"* (PN254, PN244), and boggle's,
wordwheel's, wordiply's and bananagrams' two say `BUG: …` like this one. Only
the end / timeout / replay RPCs use the shared race. Options: **this game's
`submit_word` calls `_raise_game_deleted`** (PN353 retired, its row in the
code register with it, and a pgTAP case that deletes the game and submits),
leaving the other games to their own areas; **a roster-wide ruling first**,
recorded where the shared rule lives, and then each area converts; or **leave
it**, on the ground that a delete mid-word is rare enough that the modal does
no harm. Recommendation: the ruling first — the question is identical in nine
RPCs and the answer should be written once — then convert this one here.

### SHIPPED · F-spellingbee-11 · `leaderboard-four-times` · the compete leaderboard query is written out four times

**Joel, 2026-09-23: "1"** — the leaderboard alone. `spellingbee._leaderboard
(target_game, required_score) returns jsonb`, `language sql stable`, beside
`candidate_words`, revoked from public with no grant (only the schema's
definer RPCs call it). The four sites are one assignment each; the win's two
redundant `coalesce`s went with its copy. The three re-keys into
`common.end_game`'s per-player shape stay inline. wordwheel's four copies are
a Soon entry in `wordwheel/todo.md`.

**Verified:** `npm run test:db`, 181 files, 2579 tests, PASS; guards green.
**Planted** every score in the helper as 0: `compete_test`'s mid-game score
and both frozen-leaderboard cases red. The timeout and manual-end sites are
held only by `compete_test`'s entry-count checks, which a wrong score would
pass; since they call the same helper, its content is pinned by the other
two sites, and a lost call would empty the leaderboard, which those checks
do catch. Restored.

The subquery that sums each player's `found_words` into `{ user_id,
found_words_score, rank_idx, found_words_count }` appears in `submit_word`
twice (the win and the running update), in `submit_timeout` and in `end_game`,
the same `left join … group by gp.user_id` each time (the win's copy adds two
redundant `coalesce`s). The re-key into `common.end_game`'s per-player shape is
written three times beside it. Nothing has drifted yet; the cost is that a
change to what the leaderboard carries has to be made four times and the
compete label and the Rank strip read whichever copy wrote last. wordwheel's
SQL is the same four copies. Options: **a helper**, `spellingbee._leaderboard
(target_game uuid, required_score int) returns jsonb`, the four call sites
reading it (the re-key could be a second helper or stay inline); or **leave
it**, the copies being short and pinned by `compete_test`. Recommendation: the
helper, for the leaderboard alone.

### RULED — NO CHANGE · F-spellingbee-12 · `win-narrated-twice` · a beaten racer is told about the winning word twice, in two slots

**Joel, 2026-09-23: "2"** — leave it: the header line is true, and it
arrives in its own slot. Nothing changed, in this game or in wordwheel's
twin. Presented with one fact the finding lacked: wordle's compete narrates a
rival's solve in the header too, though there a solve need not end the race.

By the code, not run: `submit_word`'s win passes a fresh leaderboard to
`common.end_game`, which merges it into the status, so the winner's rank jump
reaches every client together with the terminal. `narrateRankClimbs` has no
terminal gate, so a beaten racer's header shows *"● moth reached Amazing"*
(`peerMilestone`) at the same moment the local slot shows *"● moth won at
"Amazing""* — one event, two messages. wordwheel's `narrateRankClimbs` is the
same code. Options: **gate the narration on `!isTerminal`** (a restart remounts the
surface, so nothing needs seeding for the game coming back); or **leave it**, the header line being true and arriving in its own slot.
Recommendation: gate it — the verdict is the news, and it already names the
winner and the rank.

### SHIPPED · F-spellingbee-13 · `help-text` · the Help modal promises a pangram a custom board need not have, and omits the modes and bonus words

**Joel, 2026-09-23: "1"** — the body as proposed. The pangram line says a
random board always has one and picked letters may not; a paragraph on
bonus words (the dot, and the score passing the total); a paragraph on the
two modes. **One formatting choice not in the shown copy:** *Coop:* and
*Compete:* are bold, as wordle's Help writes its two labels. The default
height is 500, from 420. The docstring names the new topics and says the
modal is not told which mode is on. `doc.md` → Game rules says every
*random* board has a pangram. `tsc -b`, eslint, spellingbee + guards green.
Not looked at in a browser.

`Help.tsx` says of the pangram *"Every board has at least one."* True of a
random board (it is grown from a pangram seed), false of a custom one: the
player's letters need only yield one required word, and seven letters with no
common seven-letter word are accepted. `doc.md` → Game rules says the same
sentence. The modal also says nothing about bonus words (the dot, and why a
score can pass the maximum), the target rank, or what a race is — a friend
opening Help mid-race learns none of it. wordle's F-10 is the precedent.
Options: **rewrite the body** (the pangram line made true — "every random
board has at least one" — plus a short paragraph on bonus words and one on the
two modes), and `doc.md`'s sentence with it; or **fix the false sentence only**.
Recommendation: the rewrite, with the words shown before it ships since it is
UI copy.

### SHIPPED · F-spellingbee-14 · `status-merges` · six comments and two docs say `common.end_game` replaces the status, and it merges

**Joel, 2026-09-23: "1"** — the prose. **A correction presented with it:**
the finding's reason for keeping the re-emission (the recount lists every
player where the mid-game leaderboard is `[]`) changes nothing a player
sees — the strip reads a missing player as rank 0 and the label never reads
the leaderboard. What keeps it is `common.end_game`'s own header: a terminal
write states what the ending adds, a final tally among them.

The two SQL comments now say exactly that; `compete_test`'s comment says what
the carried keys are for; `coop_target_test`'s label drops the claim; the
manifest's comment says the conceded status keeps the race's last readout and
that its early return is about its own sentence; `doc.md`'s two sentences say
the conceded ending adds its reason over the last readout. wordwheel's two
comments are a Soon entry in its todo. No behavior changed: `npm run
test:db` PASS, `tsc -b` and eslint clean, spellingbee + guards 364 green.

`common.end_game` MERGES its `status` over the row's (`coalesce(status,
'{}') || end_game.status`; only `common.reset_game` assigns). Written when it
replaced, these now give a false reason:

- `submit_timeout`'s and `end_game`'s compete branches: *"common.end_game
  REPLACES status wholesale, so we must re-emit target_rank + the display
  leaderboard"*;
- `compete_test.sql` beside the timeout assertions, and `coop_target_test.sql`'s
  label *"(end_game replaces status wholesale)"*;
- the manifest's compete `labelFor`: the all-conceded ending comes through
  *"with NO target_rank"* and the label would read *"…at Start"* — it keeps the
  mid-game `target_rank`;
- `doc.md`, twice: the conceded ending *"carries only its reason"*.

The code is right either way. The re-emission still earns its place (the
timeout's recount lists every player, where the mid-game leaderboard is `[]`
until somebody scores), and the manifest's early return is still the right
order. Options: **correct the prose** — each comment gives the reason that is
true now, the two tests' labels lose the claim, `doc.md` says the conceded
ending keeps the last mid-game readout — or **also drop the re-emission**,
which would change what the terminal status says in a race nobody scored in.
Recommendation: the prose. wordwheel carries the same two comments.

### SHIPPED · F-spellingbee-15 · `stale-claims` · sentences on the roster that are no longer true

**Joel, 2026-09-22: "fix."** Every item below corrected in place. Two more
turned up on the way and went with them: `gameplay_test`'s header named the
answers by camelCase names no code uses (`tooShort`, `badLetters`, …), and
`reveal_partition_test`'s "non-bonus words nobody found" — the reveal folds
in the bonus words too. The edge function's refusal table gained the line it
had lost, that anything thrown comes back as `crash`. The two `doc.md`
sentences: the header loads once and only the found list refetches; the
`gameplay_test` row's "each touching the rows" is true now, since F-17 pinned
it. **Not touched, being F-14's:** the "replaces status wholesale" comments in
`compete_test` and `coop_target_test`. Verified with F-17 below.

- **The edge function's docstring** (`index.ts`): step 4 *"Pick the center
  letter … (uniform)"* — it tries all seven in random order until one clears
  the gate; step 5 scores the required words only — it scores both lists;
  *"(RLS off, public SELECT)"* — both tables have RLS on with a permissive
  policy; the calling shape's `target_club: uuid` (a handle) and `setup:
  {timer, target_rank?}` (missing the bands and the letters); *"PN172-4,
  crash"* — `letterFault` returns faults. The `Setup` type's *"Both fields set →
  custom"* — either one set takes the custom path (and faults).
- **`board.ts`**: `PangramRow.has_rare_letters` names eight rare letters; the
  import weights eleven (`b`, `f`, `h` too), which `index.ts` gets right.
- **`candidate_words`' header**: *"common.words (public reference data, RLS
  off)"*.
- **`lib/setup.ts`**: *"The board pool is selected at the band-1 floor, so any
  choice is solvable"* — PN177 exists because a narrow required band can
  starve the builder; `spellingbeeSetupError`'s docstring says the manifest
  shows a returned string until it is `null`, and it returns `FormErrors`.
- **`doc.md`**: *"every change refetches both reads"* — the header loads once;
  the Tests table's `gameplay_test` row says the timeout and manual end are
  *"each touching the rows"*, which nothing asserts (F-17).
- **pgTAP**: `schema_test` — *"The hidden wordlists"*, *"mode column added in
  the sibling-manifest migration"*, *"public SELECT, no RLS"*, *"no RPC yet"*,
  *"the conditional-exposure case"*; `gameplay_test` — four labels naming
  `P0001` / `42501` for PN codes, *"'alreadyFound'"*, and a header list
  numbered differently from its sections; `create_game_test` and
  `compete_test` — *"(sibling-manifest era)"*, *"(unchanged from
  pre-split)"* twice, *"required = 1 is now the floor (was 2)"*, *"the new band
  floor"*; `custom_letters_test` points at `create_game_test.sql` for fixtures
  that are `setup.psql`'s; `replay_test` — *"42501 = … 'not-a-player|'"* (it is
  PN253) and *"the terminal RestartButton"* (no such component); 
  `reveal_partition_test` — *"the PlayArea caller-only-score fix"*, *"what the
  old code did"*, *"The old score derivation"*, *"now exposes"*.
- **`PlayArea.test.tsx`**: a block comment about the compete collective losses
  sits above the *hexes the word is using* `describe`, one block away from the
  verdict tests it describes; *"`startingNewGame` reached the button"* names no
  identifier in the repo; the End test's *"(the button label went from "End"
  to the full phrase …)"* is archaeology.

The prose pass reported pgTAP and the edge function done; these survived it,
which is the case for the read. Options: **fix them all** in one sitting, or
leave them. Recommendation: fix them all.

### SHIPPED · F-spellingbee-16 · `small-shapes` · code that says a little more or less than it does

**Joel, 2026-09-23: "yes, f16. do it."** All four:

- **PN161** reads *"BUG: legal difficulty of % with required at %"* — true
  whether the band is below the required one or above 6, no trailing space.
- **The band casts are caught**, each in its own `begin … exception when
  invalid_text_representation`, as `target_rank`'s is. **Two new codes, PN499
  (required) and PN500 (legal)** — I first reused PN160/PN161 on the ground
  that it is the same question, and `raiseCodes.test.ts` refused it (*"never
  reuses a number"*), so the guard's next-free numbers it is.
- **The dead branches are gone**: `submit_timeout`'s compete terminal is
  plainly `lost_compete` (its comment says `create_game` refuses a race
  without a target), and the compete `labelFor`'s `ended` arm is `Ended ·
  nobody reached "…"` with a line saying the clock is `lost_compete`'s.
  `docs/game-status-labels.md` already showed only that.
- **The coop results are `{ won: false }`**, the win's shape inverted, in
  both `submit_timeout` and `end_game`.

**Tests:** `create_game_test` gains the two not-a-number refusals (a word for
`required`, `5.5` for `legal`), `coop_target_test` pins a loss's result as
exactly `{ won: false }`. **Planted**: the required catch pointed at the
wrong exception — the create_game file dies on the bare `invalid input syntax
for type integer: "three"`, which is the finding; `finished` put back into
the result — its case red. Restored. `npm run test:db`, 181 files, 2578
tests, PASS; spellingbee + guards, 364 tests; the guard now reports PN501
next.

- **PN161's message** reads *"BUG: legal difficulty of % below the required % "*
  — a trailing space, and wrong when the legal band is above 6, which the same
  raise also catches.
- **The band casts are unguarded.** `(setup->>'required')::int` and `legal`
  raise a bare 22P02 on a non-number and so escape the envelope as a crash,
  where `target_rank`'s identical cast is caught and becomes PN158. The
  dialog never sends one, so this is shape, not a bug.
- **Two dead branches**: `submit_timeout`'s compete `case when
  current_target_rank is not null then 'lost_compete' else 'ended'` (a race
  always has a target, and `create_game` refuses one without), and the
  compete `labelFor`'s `ended` arm checking for `reason === 'timeout'`, which
  a compete game can no longer reach.
- **The coop per-player results disagree.** The win writes `{ won: true }`;
  the timeout and the manual end write `{ won: false, finished: true,
  team_score, team_rank_idx }`, and nothing reads `finished`, `team_score` or
  `team_rank_idx` off `game_players.result` (the team's figures are on the
  status). Options: drop the three keys, or add them to the win too.

Options: **fix all four** (PN161 split or reworded, both casts caught the
way `target_rank`'s is, the two dead branches gone, the three unread keys
dropped); or pick. Recommendation: all four.

### SHIPPED · F-spellingbee-17 · `test-gaps` · rules nothing exercises

**Joel, 2026-09-22: "fix."** Seven new assertions across four files, and one
Vitest case:

- `concede_test`: a conceder's `submit_word` is PN355 *Already conceded*; a
  concede that leaves racers does NOT touch the found rows, and the last one
  does.
- `gameplay_test`: `submit_timeout` and `end_game` each touch the found rows.
- `replay_test`: `replay_board` touches its `games` row.
- `compete_test`: the leaderboard frozen at the win carries the winner's
  17 points at Solid and a rival's 1.
- `PlayArea.test`: New game after a hand-picked board sends the setup with
  neither letter key and every other setting kept.

**The touches are read off `ctid`, not `xmin`**: each pgTAP file is one
transaction, so a no-op update's new version keeps the same `xmin`; its
`ctid` moves. (A temp-table column cannot be named `ctid` — the first run
aborted three files on it; the column is `version`.)

**Verified by planting**, the SQL through a scratchpad copy applied with
`psql`: the conceder check off, both end touches off, the replay touch off,
the winner's score zeroed in the frozen leaderboard — each red on its own
assertion. The concede touch was planted twice on its own (ungated, and
removed), since the conceder plant lets a second row in and aborts the file:
each turned exactly its assertion red. The New-game strip removed: its case
red. All restored (`gmake db-sql ENV=local`, `git diff` clean on
`PlayArea.tsx`). Then: `tsc -b` and eslint clean; spellingbee + guards, 36
files, 364 tests; `deno check` clean and `deno test` 11 green; `npm run
test:db`, 181 files, 2575 tests, PASS. `doc.md`'s Tests tables name the new
pins. No e2e run.

- **A conceder cannot submit** (PN355). `doc.md` states it twice as the reason
  a conceder cannot win, and no pgTAP file submits after a concede.
- **The realtime touches.** `submit_timeout`, `end_game` and the last
  `concede` update every `found_words` row in place, and `replay_board` its
  `games` row, so that clients refetch; the three RPC headers call these
  load-bearing and nothing asserts them. A row's `xmin` changes on the no-op
  update, so pgTAP can pin each without a realtime client.
- **New game drops the custom letters.** `createNewGame` strips
  `custom_center` / `custom_letters` so the follow-up is random; the
  `PlayArea.test` case starts from a setup with none, so it cannot tell.
- **The frozen leaderboard.** A compete win freezes the leaderboard "as it
  stood"; `compete_test` checks the mid-game one and the winner's id, not the
  final entries.

Options: **write all four** (three pgTAP, one Vitest), each planted to prove
it can fail; or pick. Recommendation: all four.

### Left for pass 3

The refused word's hexes take `--verdict-fill` for both the fill and the
stroke; the shared verdict tones also publish `--verdict-edge` (the fill
stepped toward black) for a piece's own border. Whether a hex should wear it
is a tile-feedback question, and pass 3 is where it gets asked. **Answered
there: T-2.**

## Pass 3 — tile-feedback

Read 2026-09-23 against `plans/tile-feedback.md` as it stands. **The board
held up**, much of the work having been done by the restructure and the
audit: shape 1 (a hex never changes state, so no attention case), the shared
rest / hover / press gesture re-stated in coordinate units, a finished or
conceded board inert, a refused word answered on the board through `useMark`
at `WORD_ANSWER_MS`, and restart a remount. Six proposals, all ruled (Joel,
2026-09-23): four shipped, two no change.

- **SHIPPED · T-1 · `used-edge-color`** — *"we're keeping khaki — for the
  word-finding games, it's distracting to have a bunch of letters in black."*
  The ruling on `9c2080da` is written into `tile-feedback.md` → The channels.
  Three comments said "black" over a khaki rule: `Letter.module.css`'s
  `.used`, boggle's `.selected` and wordwheel's `.tile.used`; each now gives
  the family's reason itself, since a durable file does not cite the plan.
  **Seen on the way:** `docs/ui.md` → Interactive tile states still describes
  selection as a dark FILL and hover as a ring, neither of which any board
  draws — not this area's, and left there.
- **SHIPPED · T-2 · `refusal-edge`** — the answered hex strokes
  `--verdict-edge`, as `.tileFace.verdictFill` does; the comment names the
  three colors. Every tone class defines the token.
- **SHIPPED · T-3 · `refusal-mark-test`** — `PlayArea.test` gains a
  too-short (`warning`) refusal asserting its letters wear `verdictWarning`
  and not `verdictLost`, and a lifetime case on `WORD_ANSWER_MS` with fake
  timers. **Planted**: the outcome hard-wired to `lost` (the first red) and the
  lifetime ×100 (the second red). Restored.
- **SHIPPED · T-4 · `plan-section`** — spellingbee's section rewritten to
  today (no input flash; the refusal answer on the board, as the experiment
  with wordwheel as control); wordwheel's two sentences about a flash
  corrected; the roster row at **tf2**; both progress counts (4 of 16); the
  own-tile table points at `Letter.module.css` and says why a polygon cannot
  wear `.tileFace`.
- **RULED · T-5 · `bee-colors`** — BRAND tokens, both games; recorded in the
  plan's color-decision table. No code.
- **RULED — NO CHANGE · T-6 · `own-tile-exempt`** — Joel, after it was
  explained: *"i'll take your recs on t6."* Two halves. The hex cannot be the
  shared tile — an SVG polygon takes `fill` / `stroke` / `filter`, not the
  box properties `.tileFace` sets — so it is recorded as unable, not as owed
  (T-4's table row). And the plan's hover brightening for packed boards is not
  applied: the hexes are inset by `HEX_SHRINK`, so the shadow has room, and
  the plan says so in its packed-boards section. Revisit only if a hovered hex
  is seen not to lift.

**Verified:** spellingbee + guards, 366 tests; `tsc -b` and eslint clean over
spellingbee, boggle and wordwheel. Not looked at in a browser.

### SHIPPED · the refusal shakes the word's own hexes, not the hive — 2026-09-23

**Joel: "make it so that we shake the lost/warning individual tiles."** Every
refusal this game has is `warning` or `lost`, so every refusal shakes; what
moved is WHERE. The hive `<svg>` no longer shakes or carries a key; each hex
the refused word used wears the shared `.verdictShake` alongside its answer,
keyed on the `useMark` nonce so a repeat refusal of the same letters remounts
those hexes and shakes again — the per-piece grain letterboxed, boggle and
connections already use, from the rule beside `.verdictShake`. `BoardCol`'s
own `shakeNonce` counter is gone; `Letters` takes the whole mark.

**One visible difference to expect:** the shake's 5px is now in the hive's
coordinate units, since it moves an SVG group rather than the svg's box, so it
scales with the board — about 7.5px at full size, less on a phone.

**Tests:** the refusal case asserts the word's four hexes shake and the hive
does not; a new case refuses the same word twice and asserts the hex is a new
element still shaking. **Planted:** the nonce left out of the key (the repeat
case red); the shake class removed from the hex (both red). Restored. Prose:
`doc.md` twice, the grain list beside `.verdictShake` and its twin in
`board-marks/doc.md` (spellingbee moves to the per-piece side; wordwheel alone
shakes a whole board now), and the plan's spellingbee section. spellingbee +
guards, 367 green; `tsc -b` and eslint clean. **Not seen in a browser.**

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
