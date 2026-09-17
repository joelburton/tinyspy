# stackdown — todo

## Bugs

- `WordEntry.module.css` `.good` / `.bad` are read by nothing — the slots
  take their colors elsewhere now. `cssClasses.test.ts` holds them in
  `DEAD_CLASS_PENDING`.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.

## Soon

- **"Blank this while viewing history" is decided three times at the call
  site.** `PlayArea` hands `BoardCol` three LIVE marks already emptied for the
  viewer:

  ```tsx
  attentionTiles={historySnap ? NO_TILES : attentionTiles}
  boardAnswer={historySnap ? null : boardAnswer}
  heldTiles={historySnap ? NO_TILES : heldTileIds}
  ```

  None of the three is about history — they are a teammate's attention flash,
  their played word wearing its outcome, and tiles the server has taken that are
  still drawn so the answer can be read. What the ternary says is that history
  WINS over them, since a live mark on a historical board would be a lie.

  The catch is that `BoardCol` already knows: eleven lines into its body it
  derives `const isViewingHistory = historyLabel != null`. So a FOURTH live mark
  added later has to remember the ternary, and nothing catches it if it does not
  — the mark simply paints over a past board. Either the column blanks them (one
  decision, but it then silently ignores props it was handed) or the caller keeps
  doing it explicitly and something has to make that rule visible. Found
  2026-09-16 by Joel, reading the history-names sweep. **scrabble has the same
  block** (`hover`, `greenCells`, `redCells`, blanked on `isViewingHistory` at
  the call site), so this is one shape and not one game's.

  **connections does not, and its answer is better than either option above.**
  It passes every live mark to its `Board` ungated and instead hands the MARK
  HOOK `quiet: isViewingHistory` — so the mark never fires while a past turn is
  open, rather than firing and being blanked on the way down. One decision, at
  the source, with the reason beside it ("a live band landing behind the viewer
  is not something to point at on a board nobody is reading"). The two props it
  does gate, `interactive` and `ownerByTile`, are gated because they are about
  what the board ACCEPTS, not what it shows. Start from that shape when deciding
  this.

- **The below-board reserve is a hand-tuned constant.**
  `components/PlayArea.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 8.5rem`, where that last term stands for
  everything else in the board column — the entry row, the feedback slot, a
  mobile status bar. Nothing checks that it matches what is actually there.

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

- **A race here has no way to stop the whole table.** Compete offers Concede
  alone, so a group that has lost interest can only close the game by every
  player conceding — one at a time, each taking a loss on their record for a
  game nobody wanted to finish.

  Most of it already exists. `stackdown.end_game` writes the neutral terminal
  (`ended` + `outcome: 'manual'`, nobody won) and does not care which mode it is
  called in, and the FE side is one argument: `offersEndForAll` on this game's
  `useStandardGameActions` call, which grows Concede's question a second answer
  ("End for everyone") rather than putting a second red button on the board.
  bananagrams is the worked example.

  What to check first is the READING, not the wiring — that this game's
  `labelFor` and its in-game verdict treat `ended` in COMPETE as neutral, since
  nobody won is not the same as everyone losing.

- **One keystroke, two words: the ambiguous letter's pill says `warning` and its
  tile ring says `error`.** Typing a letter that matches more than one exposed
  tile shows `FeedbackMessage.result('warning', 'N "X" tiles are on top — click
  one')` in `BoardCol.tsx`, and flashes the candidates through `.flash` in
  `Board.module.css`, which draws `--outcomes-error-ink-color`. The pill and the
  board mark are ONE message (plans/tile-feedback.md — the mark wears the pill's
  outcome), so they should not differ.

  `.flash`'s own comment argues for the red it uses: *"the ERROR red, not the
  lost red: nothing has been judged here, and the outcome vocabulary's `error`
  is the member that never means a judgment"*. That reading is the one
  `docs/outcomes.md` explicitly retired — *"`error` is a full member… a game may
  answer with it, and if one did it would take an error pill and an error bar in
  the log like any other word"* — so `error` is not a neutral "look here" color
  going spare. The comments around the branch say "red" too, and would move with
  whatever is decided.

  Two ways out:
  1. **the ring takes the pill's word** — `.flash` draws
     `--outcomes-warning-ink-color`, and the keystroke has one verdict on two
     surfaces. This is the recommendation the audit made.
  2. **the ring stops being a verdict** — it is a "look here" cue like setgame's
     hint ring, outside the outcome vocabulary, and is renamed and re-tokened to
     say so.

  Found by the `outcome-fix` audit (its F-14); the other keystroke refusal — no
  matching tile, `lost` in the pill, no ring — is fine either way.

## Someday

- `PlayArea.tsx` returns its own `<p>Loading game…</p>` while the read is
  pending, where `src/common/loading`'s `<Loading>` is the word every page
  shows for that moment. Swap it in, or say why this surface's is different.

## Maybe
