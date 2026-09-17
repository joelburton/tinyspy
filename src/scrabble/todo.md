# scrabble — todo

## Bugs

- **Nineteen lines across eleven files cite `docs/scrabble-ai.md` and
  `docs/scrabble-ai-strength.md`, which do not exist** — residue of shipped
  plans, several with a section number (`S3`, `S5`, `band rule`) to make it
  worse. `lib/policy.ts` has five; `PlayArea.tsx`, `InfoCol.tsx`,
  `BoardCol.tsx`, `lib/rank.ts` and `lib/setup.ts` two each; `lib/suggest.ts`,
  `manifest.ts`, `SetupForm.tsx` and `InfoCol.module.css` one each. The live
  home is `docs/games/scrabble.md` §11 (the move suggester) and §12 (the AI
  opponent). Redirect the ones that point at content the docstring
  summarizes; delete the ones whose reasoning is already inline.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **One play is formatted for a reader in two places.** `BoardCol`'s
  `historyLabelFor(play, nameOf)` builds the history banner's line ("#1 moth: +10
  APPLE, BERRY" / "#5 moth passed" / "#5 moth exchanged 3 tiles"), and
  `PlayArea`'s `moveText(play)` builds the same four branches for the print
  moves table, minus the `#N` and the name. Its own comment says it mirrors the
  other, and it is marked SPIKE. Two copies of one game's phrasing drift the
  first time a `kind` is added or a wording is tuned — a forfeit already reads
  "ended — N tiles unplayed" in both, by hand.

  What makes it more than a tidy: the banner and the printed sheet are the two
  places a player READS a turn back, so they are exactly the pair that should
  not disagree. The shapes differ in what they prefix, so the fix is one
  formatter with the prefix as a parameter, or a shared core the two wrap.
  Found 2026-09-16 in the history-names sweep.

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 4.4rem` — and `- 6.1rem` in its other case —
  where that last term stands for everything else in the board column — the
  entry row, the feedback slot, a mobile status bar. Nothing checks that it
  matches what is actually there.

  Same construction as the shell's own `--game-chrome-height`, which was a
  hand-written `5rem` until 2026-09-15, when it turned out to omit the 1px
  rule under the header and put every desktop game page a pixel past the
  viewport. That one is composed from its terms now; this one is not.

  Too SMALL overflows the page; too LARGE wastes board. Neither shows without
  measuring, and the page-fits-the-viewport e2e cannot see either — it checks
  the play surface against the window, and this is the slack one level in,
  inside the board column.

- **Collapse the info-column action row's branches.** This game still FORKS on
  `over ? … : locally done ? … : …` and lists a different set of buttons in
  each, which is how a state can quietly lose a button — every one of these
  rows is missing back-to-club while a race runs on without you. psychicnum is
  the worked example (2026-09-14); copy its shape.

  **The shape.** One `<InfoActionsRow>`, every action listed once in one
  order, and the only thing that varies is the optional `{ text, outcome }`
  line. Which buttons are on screen is each action's own answer —
  `<ActionButton>` draws nothing for an action that says `hidden`.

  **The state rule** (Joel, 2026-09-14): `hidden` is *not even possible in
  this state* — you cannot end a game that has ended, or reveal an answer you
  are still hunting. `disabled` is *possible here, just not right now*, and it
  carries a tooltip saying why — a hint when you have used your last one. Most
  games' gate variable folds several of these together and has to be split
  before the actions can be honest; psychicnum's `canGuess` hid "terminal"
  inside "out of guesses" and is now `isStillPlaying`.

  **Two answer their asker differently**, which is what `ActionAsker` is for:
  Restart and New game are reachable all game from the menu and their keys —
  the confirmations are written for exactly that ("will be shelved, not lost",
  "Keep playing") — and get a BUTTON only at terminal. `describe: (asker) =>
  asker === 'button' && !isTerminal ? 'hidden' : 'active'`. Restart's is
  already done in `useStandardGameActions`; each game's own `act-new-game` is
  not.

  **Two things the collapse destroys if you are not watching.** Back-to-club
  is `weight={over ? 'primary' : 'secondary'}` — filled only once the game is
  over; hoisting the terminal branch's `weight="primary"` into the single list
  makes it shout all game. And the gray `shared.actionsDivider` span goes
  between the actions you take WHILE PLAYING and the ones about the END of the
  game — both sides are pressable mid-game, so nothing but the bar says where
  the meaning changes. It hides itself when nothing is left on its left.

  **A test gotcha:** `menuItems` reads the rows a game PUSHED, and `hidden` is
  what the menu drops at draw time — so "not in the menu" asserts `?.hidden
  === true`, not `toBeUndefined()`.

- **The manual-end terminal is hand-written and reads differently from every
  other game.** `PlayArea.tsx` returns `{ pillText: 'Ended', infoColText:
  'Ended', outcome: 'neutral' }` where thirteen games call the shared
  `gameEndedTerminalMessage(mode)` (`Game ended` / `Game ended — no winner`,
  info-column line `Game over`). Beyond the drift, `pillText` and
  `infoColText` are the same string, which is the one thing the terminal
  message type exists to separate, and no comment says why. Almost certainly
  `return gameEndedTerminalMessage(mode)`; if the divergence is wanted it
  needs a comment instead.
- **A raw `<button>` takes focus on click**, where every `StandardButton`
  suppresses it: the AI suggestion rows (`InfoCol.tsx`). (The history banner's ✕
  was the other one; it left this game on 2026-09-16 when the banner became the
  shared `common/turn-log/HistoryBanner`, so it is one button in one place now.)
  The suggestion row is the one that lingers — clicking it
  stages the move and the list stays up, so the row keeps focus and the next
  Enter re-activates it natively. Nothing on a play surface should hold focus
  (Joel, 2026-09-10); the fix belongs with this game's tab ring rather than to
  a special case in the key dispatcher.
- **`shuffle` in `lib/policy.ts` is a hand-written Fisher–Yates** —
  `src/common/utils/shuffle.ts` is the same function with the rng optional,
  so the local one goes and its one seeded call site (the self-play bag)
  passes its `rng` exactly as it does today. Import it the way this file already imports
  `mulberry32` (the alias with an explicit `.ts`, because Deno loads
  `policy.ts` too).
- `<ShuffleButton>` should never take focus at all — game stuff doesn't. The
  fix is removing the tab stop, not restyling the ring
  (`src/common/buttons/todo.md`).
- **The info column picks a font size off the ramp, twice.**
  `InfoCol.module.css` writes `font-size: 0.9rem` on its heading and on
  `.suggestRow`, where the ramp's small step is `0.85rem` — 0.8px apart at the
  browser's default root, so it reads as a guess rather than a choice. The
  suggest row is a list row that IS the control rather than a general button,
  so the shared button's `small` treatment does not reach it; this is only
  about which size it means to be.
- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `scrabble.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

- **The leftover-tile scoring is logged on one ending out of five, and in one
  mode out of two — so a score drops and the log does not say why.** Joel,
  2026-09-17: it should be a row every time.

  `scrabble._finish` applies the scoring on EVERY terminal path. In coop it
  subtracts the shared rack's tile value from `team_score`; in compete it
  subtracts each player's own leftovers and then hands the going-out seat the
  sum of everybody else's. The row is written in exactly one place —
  `scrabble.end_game`'s coop branch, the `manual` ending — so:

  | ending | coop | compete |
  |---|---|---|
  | `manual` (End game) | deducted **and logged** | deducted, not logged |
  | `conceded` | deducted, not logged | deducted, not logged |
  | `timeout` | deducted, not logged | deducted, not logged |
  | `blocked` (a lap of passes) | n/a — coop has no turns to pass | deducted, not logged |
  | `complete` (somebody went out) | nothing to deduct — the rack is empty | deducted, not logged, **plus** the out-seat's bonus |

  So the fix is to write the row where the deduction happens (inside `_finish`),
  not where the game was ended. Three things to decide while doing it:

  - **compete needs one row per player**, since each player loses their own
    leftovers — the coop row is one row for one shared rack.
  - **the going-out bonus is the other half of the same arithmetic** and has no
    row at all. Either it is a second kind, or the out-seat's row carries a
    positive score and the kind covers both directions.
  - **`complete` in coop writes nothing**, and should keep writing nothing: an
    empty rack deducts zero, and a zero row would be noise.

  The kind is `leftovers` (renamed from `forfeit` by the events work — "penalty"
  and "forfeit" both imply a judgment this row deliberately does not make; it is
  arithmetic, and its outcome is `neutral`).

## Someday

- **The AI suggest-a-move box is a `SelectionList` site that did not fit.**
  Five frameless text lines pinned to `5 × 1.35rem`, whose own comment says a
  growable height would shift the setup disclosure and the Moves log below
  it — so the frame, the surface and the row padding would arrive as a
  visible redesign, roughly doubling the box. Three options are written up
  in `docs/games/scrabble.md` → Deferred: leave it bespoke, give
  `<SelectionList>` a frameless compact form, or redesign the box and redo
  the height arithmetic.
- `PlayArea.tsx` returns its own `<p className={styles.loading}>Loading
  game…</p>` while the read is pending, where `src/common/loading`'s
  `<Loading>` is the word every page shows for that moment. Swap it in, or
  say why this surface's is different — it is the one with a class of its own.

## Maybe
