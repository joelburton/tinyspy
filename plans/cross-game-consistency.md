# Cross-game consistency — what is left

**Worked before the ten remaining games open.** Joel, 2026-09-24: before
auditing any more games, check the six that closed — psychicnum, connections,
wordle, spellingbee, codenamesduet, wordwheel — for two things:

- **Names.** Things that do the same job carry the same variable, prop,
  function, class and SQL name.
- **Placement.** Knowledge about a common or shared part lives in that
  folder's `doc.md` or the thing's docstring; a game mentions it briefly, with
  a pointer.

**Rewritten 2026-10-06 down to what is open.** The survey of 2026-09-24 and
its rulings were mostly built — by this plan's own passes, by common-tables,
and by every game's conversion to the page blobs. What was done, or made moot
by the conversions, is gone from here; git history holds it. What stays keeps
its ruling in Joel's words. Line numbers rot; the file and the name are the
handle.

**The order** (common-tables.md → The path): the endings (§2), then
placement (§5). The renames (§3) each need Joel's go, and the "ended" one
is endings.md's. §4 is small and fits beside any of them.

The rules that stay in force while this is worked: §1's naming of the
viewing player (`my`, never `self`; a flag is `is…` / `amI…`) is in
docs/code-conventions.md → Names about the viewing player; "picked, not
selected" (below, §4) is built in every identifier.

---

## 1. Team state — done

Built for every game, 2026-10-06; what it settled is
[common-schema.md → A player's facts](../docs/common-schema.md#a-players-facts--the-sides-and-their-own).

## 2. Endings

### A ranking below first shows as `near`, never "Lost"

**Decided** (Joel, 2026-09-25 and 2026-09-26): `won` is ranked first; `near`
is ranked, not first — the player cleared the game's bar for being ranked and
someone did better; `lost` is not ranked, in a game that ended with a result
(fell short of the goal, eliminated, or conceded). In wordle the slower solver
is `near` and the player who never solved is `lost`. A player whose
`final-ranking` is 2, 3 … reads as the ranking ("2nd"), in the `near`
outcome; the ranking never depends on how many played.

The server writes it (`common._end_game`'s outcome: `final_ranking > 1` is
`near`). Left:

- **The docs.** docs/win-lose.md → The player still says every ranking
  below first is `lost` (`final-ranking`, `lost`), and `near` and `neutral`
  have not joined as a player's end outcome. docs/outcomes.md defines `near`
  as "close — one away, nearly right"; only its `EndOutcome` note says
  "ranked below first". Widen it.
- **Every surface that shows a player's ending shows the ranking** — the
  pill, the action row's line, the player strip. Nothing renders an ordinal
  today, and the strips in spellingbee, wordwheel and wordiply show
  `outcome === 'won' ? 'Won' : conceded ? 'Conceded' : 'Lost'`, so a `near`
  player reads "Lost".
- **Audit every check written for a two-way world** (Joel, 2026-09-26).
  `!== 'won'`, `=== 'lost'`, a ternary on `'won'`, and a `switch` with no
  `near` case may each mean "lost" and now catch `near` too, or miss it.
  waffle, wordle, connections and psychicnum already handle `near`; about 85
  such comparisons outside the tests are unread. Read each, make the best
  guess at what it meant, and bring the uncertain ones to Joel before
  changing them.

### A compete word hunt needs a target, a countdown, or both

**Decided** (Joel, 2026-09-25): something must be able to crown a winner.
With no target, the countdown crowns the top score (and nobody, if nobody
scored). spellingbee and wordwheel gain compete with no target when a
countdown is set, for "best score in ten minutes"; boggle loses the untimed
compete game with no target, which nobody could win. Each game's `todo.md`
carries its half; docs/win-lose.md's `score-only-contest` rule already counts
a countdown.

### codenamesduet's guess answer carries the reason pair

**Decided** (2026-09-26): the guess answer carries the same two names as the
game's ending, `game_ended_reason` / `game_ended_reason_detail`. Today
`submit_guess` answers a bare `reason: 'solved' | 'assassin' | 'turns'`
(`src/codenamesduet/hooks/useSubmitGuess.ts`).

### How a game words a loss on its summary — to investigate

Each manifest's `summaryFor` turns a stored reason into words ("out of time",
"out of guesses") for a game nobody won, three ways: a `LOSS` table
(connections, psychicnum, waffle, wordle), an inline `reason === 'timeout'`
check (strands, letterboxed, stackdown, boggle, spellingbee, wordwheel,
wordiply; wordle mixes the two), and codenamesduet's `LOSS_CAUSE`, keyed on
the detail. Survey all sixteen and decide whether they share one approach.

## 3. Renames

### "Terminal" → "ended" — decided, everywhere

**Decided** (Joel, 2026-09-26): "Terminal" and "locally terminal" are awkward
and needlessly long, and `ended` is already the term — so code says one word
and prose another for one thing. **Everywhere**: "it is worse to not do it
everywhere than not do it at all." Every identifier, key and comment,
game-local ones included, and the docs' prose.

The stems are **`GameEnded`** and **`PlayerEnded`** (not "done", which is
everywhere for "done sending a request"): `isGameEnded` (`isTerminal`
retired), `isPlayerEnded` (`isLocallyTerminal` retired); `locally-terminal`
becomes the term `player-ended`. The rename is being done by
[endings.md](endings.md).

### "Race" / "racer" in games that aren't races — decided

Player; "race" only for a `race-game`. wordle's, waffle's and wordiply's
compete: their SQL, front end, tests and docs, about 300 lines. **One sweep
across every non-race compete game** — not per game (Joel, 2026-10-05).
**Waits for Joel's words:** wordiply's compete `shortDescription`, "Race to the
longest word from a shared base", is player-facing copy.

### "Clock" for the timer — decided for the names, unsure for two

Timer, timeout. Left: wordle's `tieBrokenByClock` (SQL, types, fixture, the
ending message) and `isMyTieBrokenByClock`, and its player-facing "beaten on
the clock"; about 224 comments. **Unsure, for Joel:** common's
`PauseAndClock` and `useGameTimer`'s `driveTheClock` — the component draws
the timer, so by the ruling it is the timer's name; but "clock" there may be
the thing on screen rather than the timer kind.

### "Difficulty" as the name of a dictionary band — to decide

The schema has been moving to `*_band` (`legal_band`, `required_band`), and
"difficulty" fails as a name (Joel, 2026-09-28): a game can have two bands; a
higher band makes some games easier (letterboxed, strands: more escape words)
and others harder; and games have other knobs that set how hard they are.
Left: `setup.difficulty` in waffle and wordiply (stored data, so a
migration), the front end's `difficultyValue` (`src/common/setup-form/`),
docs, and `common.words.difficulty` itself. Name each for the band it is.

### Smaller names

- `busy` — my move is with the server — is `submitting`: codenamesduet's
  `ClueStrip.tsx` still says `busy`.
- The solved flag is one name: the blob's `solved`. `iSolved` is left in
  wordle's and strands' `lib/gameEndingMessage.ts`, `hasSolved` in
  `common/reveal` (`useSolutionReveal.ts`, `doc.md`).
- `isStillPlaying` survives as a prop on connections' `Board` and
  psychicnum's `usePickedTile`; a prop names its purpose at the boundary.
- Dead: `common/game-page/playerStanding.ts`, `GamePlayerLegacy` /
  `PlayerStanding` in `common/members/member.ts`, and the manifests'
  `draftsOffTurn`, read only by `playerStanding.ts`. `common/members/todo.md`
  already owes the first two.

## 4. Conventions owed

- **Every piece of state carries a comment** (Joel, 2026-09-24). Every
  `useState` (and `useRef` holding state) gets a short comment above it
  saying what it holds — its shape and meaning — however obvious it looks,
  and a name that says the same. Not yet in docs/code-conventions.md. In the
  six closed games, uncommented: psychicnum's `usePickedTile` `pickedTileId`,
  `useTileShuffle` `shuffleSeed`, `useShowOppsFoundMessages`
  `nFoundSecretsSeenRef` / `isSeededRef`; connections' `HintList` `revealed`,
  `usePicks` `picks`, `useMarkForeignGuesses` `seenId`, `useSubmitGuess`
  `inFlightTileIds`; wordle's `useFlipBaseline` `flipBaseline` /
  `wasViewingHistory`, `useTypedGuess` `typedWord`; codenamesduet's
  `useSuggestClue` `suggesting`.
- **"Selected" in prose where it means the pick** (Joel, 2026-09-24: "picked"
  is the pick, "cursor" the ring the arrows move, "in flight" the move sent;
  "selected" has no job outside the cursor's own code). Every identifier is
  done; comments still say it in `common/buttons/ClearButton.tsx`,
  `common/icons/icons.ts`, `common/pause-suspend/` (`PauseBoundary.tsx`,
  `doc.md`), `common/game-page/doc.md`, psychicnum's `Tile.module.css` and
  `PlayArea.test.tsx` titles, scrabble's `useMovePreview.ts`, setgame's
  `Tile.module.css` and `lib/hint.ts`, the bee pair's `Tile.tsx`, `Board.tsx`
  and `Tile.module.css`, wordle's `Board.module.css`, and strands'
  `Tile.module.css`, `Board.module.css` and `lib/trace.ts`.
- **docs/win-lose.md names the blob's terms.** Its formulas (docs/win-lose.md
  → Where a player stands — the terms, as formulas) say `isGameEnded`, `isPlayerEnded`, `isStillPlaying`,
  `isOnTurn`, `isBoardInteractive`; the code reads `gd.me.stillPlaying`,
  `onTurn`, `waitingForTurn`, `conceded`, `solved`, `outcome`,
  `finalRanking` and `gd.ended`, and each BoardCol builds its own
  `isInteractive`. The doc says the names the code has, with the ending
  terms beside the standing ones.

## 5. Placement — docs and comments

**The shared doc is wrong and the game is right.** Fix the owner:

- `common/feedback/useShowPeerFeedback.ts`'s docstring says a `solved` flag
  flipping "stays hand-rolled"; wordle's `useShowOppsSolvedMessages` sends it
  through the hook.
- docs/naming.md: the list of games with a `## Vocabulary` section is stale
  (only psychicnum lacks one), and it says codenamesduet's guess is "a clue +
  count" and psychicnum's "a number".
- `common/feedback/doc.md` lacks the phone header's width budget (390px,
  about 26 characters), which lives only in its `todo.md` and codenamesduet's
  `lib/answer.ts`.

**Game comments that are now wrong:**

- codenamesduet `Board.module.css` says "hover ring" and names `.tile` /
  `.tileWord` as the chrome; hover is a shadow and a lift, and `.tileFace` is
  the face. Its `lib/endingMessage.ts` says a long verdict wraps; it
  truncates.
- spellingbee `Tile.module.css`: a used center hex "takes the black edge";
  the rule uses `--tile-spent-edge-color`. Its `PlayArea.module.css` names a
  `Hive.module.css` that doesn't exist.
- codenamesduet `db.ts` points to docs/code-conventions.md for
  `extra_search_path`; docs/supabase.md has it.
- spellingbee's and wordwheel's `db.ts`: "the uniform seam every game reads",
  naming the `games_state` view both SQL files drop.
- spellingbee's and wordle's `lib/setup.ts` validators say "or `null`"; they
  return `{}`.
- The concede lock-order comment (psychicnum, connections, wordle and waffle
  `.sql`) says a concede "reads the other's uncommitted" state;
  docs/common-schema.md's wording is the right one.

**Copies to cut to one line and a pointer:**

- The New-game paragraph in codenamesduet's, spellingbee's, wordle's and
  wordwheel's `doc.md`; the owner is `common/actions/doc.md`.
- connections' channel-naming paragraph (why the room is stable-named); the
  owners are `common/realtime` and `common/pause-suspend`.
- The bee docs' "keyed on the mark's nonce" clause.
- codenamesduet's arrow-then-second-key explanation (`common/board-cursor`
  owns it), and its board-marks list, which cites a plan id.

**Todo items that belong elsewhere:**

- The "don't fold the pair's board CSS" ruling (wordwheel `todo.md`, copied
  in spellingbee's) moves to `shared/bee-games/todo.md`.
- spellingbee's WordList-markers item is already owed in
  `common/word-list/todo.md`; delete the game copy.
- spellingbee's struck-through Soon item is done; delete it.

**One term per common part** — to settle, then use in all six docs:

| part | variants in use |
|---|---|
| the per-player strip (`OpponentStrip`) | Found strip, Guesses strip, Rank strip |
| the events readout | the log, event log, guess log, turn log |
| the setup dialog | start-game dialog, setup dialog, setup form |
| the below-board slot | below-board pill, local slot |
| teammate narration | header line, peer lines, narrated in the header |

**psychicnum's `doc.md` lacks what the other five have:** `### Vocabulary`,
the "what is psychicnum's own" list, the New game paragraph, and tables in
Tests. Its tree (and connections') leaves out `CelebrationBlockingModal`, and
it says a rival's remaining budget shows, which the strip does not (it shows
Found). The psychicnum and connections intros open paragraphs in bold where
the others do not.
