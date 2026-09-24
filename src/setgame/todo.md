# setgame — todo

## Bugs

- `PlayArea.module.css` `.breakdown` and its three children
  (`breakdownLabel` / `-List` / `-Count`) are read by nothing — the
  per-player breakdown they styled was replaced. `cssClasses.test.ts` holds
  them in `DEAD_CLASS_PENDING`.
- `act-new-game` answers `active` before the game row has loaded, so an
  early `+` asks the new-game question and then can do nothing. By the rule
  in `src/common/actions/doc.md` that moment is `disabled`; `act-print-board`
  beside it already answers `hidden` for it.
- **`create_game` accepts a one-player compete game.** The compete manifest's
  `numberOfPlayers` is `[2, 6]` and its comment says the RPC enforces the
  minimum, but `setgame.create_game` has no `< 2` check for compete, so only the
  FE's hidden Start button stops it. Add the check the other compete games have
  (wordle's is `PN498`, a fault, since the app never sends it).

## Soon

- **The printer starts its body at `margin + 46`, two points under every
  other printout.** The shared printers read `pd.contentTop` (`margin + 44`,
  stated once in `common/pdf/frame.ts`); `printSetgamePdf` writes its own
  number. Either read `contentTop` like the rest, or keep the two points and
  say why beside it.
- **The printed log is headed "Turns"; the screen's log wears a tally.**
  `common/pdf`'s rule (2026-09-19) is that the paper's heading is the word
  the game's on-screen event log wears, and the shared `drawEventLog` now
  requires it — but setgame draws its own rows with `twoColGeom` and writes
  `'Turns'`, while `GameEventLog` passes `Found: n · Hints: n`, which is not a
  heading word at all. Decide what the paper says (a word the screen also
  shows, or the same tally) when the printer is read.

- **The live hint's ring is GREEN, and a hint is amber everywhere else.**
  `--setgame-hint-ring` is `#16a34a` — a saturated green, and green is this
  app's success color. The same hint's log bar is amber (`warning`, the word
  `lib/answer.ts` gives it, ruled 2026-09-16 as the word for a hint in
  every game), and its `Hint:` tag sits beside a row whose bar says caution. So
  the board and the log say two different things about one event.

  Found 2026-09-16 by `outcome-fix`, and left alone there because it is a LOOK
  decision rather than a word one: the ring is a "look here" mark, not a verdict,
  and the game's card fills are deliberately outside `--outcomes-*` (the
  departing-set green, the arriving yellow). What has to be decided is whether
  the hint RING is in that family or in the outcome vocabulary — and if the
  latter, amber has to survive the test the green was picked to pass: a thin
  dash on a white card beside eleven other white cards was genuinely easy to
  miss, which is why it stopped being gray. **Decide this with the item below**,
  which is the other open question about the same ring.

- **A viewed past turn is ringed in the HINT's color here, not the shared history
  color.** Every other game with a viewer rings the cards/tiles a past turn
  touched in `--history-color` — the same blue as the board frame and the log's
  open `#N`, so all three parts of "you are looking at this past turn" read as one
  mark. setgame instead feeds `historyLitCards` into the same `ringed` prop its
  live hint uses, so a viewed turn wears `.ringed` — a dashed outline in
  `--setgame-hint-ring` (`#16a34a`, a green). The result is that the frame and the
  `#N` say history while the cards say hint, in a green that is also this app's
  success color.

  Found 2026-09-16 in the history-names sweep. Not changed there because it is a
  LOOK decision, not a naming one: either the history case gets its own class in
  the shared color (the other nine games' shape), or setgame keeps one ring
  deliberately and says why. The prop itself was renamed `hinted` → `ringed` in
  that sweep, since it names a mark with two causes and `hint` is reserved for
  the priced hint itself.

- **The below-board reserve is a hand-tuned constant.**
  `components/Board.module.css`'s `--avail-h` sizes the board as `100svh -
  var(--game-chrome-height) - 5rem`, where that last term stands for
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

- **`LeaderRow` is declared twice, and here the copies agree by luck.**
  `manifest.ts` and `PlayArea.tsx` carry the same four columns and differ
  only in whether `user_id` is optional — the closest of the four compete
  games to having one row. Collapse it to a single declaration rather than
  keeping a copy per file that nothing holds together.

  The read itself is done (2026-09-21): both sites call
  `readLeaderboard<LeaderRow>(…)` from `common/game-page/`, so the
  hand-written cast is gone and the field being present but not an array is
  caught. Only the row is open.
- `Card.tsx` exports two components (`Card`, `CardDefs`), so "the filename
  is the component" is false here. Split or justify.
## Someday

## Maybe

## Won't do
