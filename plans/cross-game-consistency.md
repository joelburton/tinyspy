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
placement (§5). The renames (§3) each need Joel's go. §4 is small and fits
beside any of them.

The rules that stay in force while this is worked: §1's naming of the
viewing player (`my`, never `self`; a flag is `is…` / `amI…`) is in
docs/code-conventions.md → Names about the viewing player; "picked, not
selected" (below, §4) is built in every identifier.

---

## 1. Team state — done

Built for every game, 2026-10-06; what it settled is
[common-schema.md → A player's facts](../docs/common-schema.md#a-players-facts--the-sides-and-their-own).

## 2. Endings

### codenamesduet's guess answer carries the reason pair

**Decided** (2026-09-26): the guess answer carries the same two names as the
game's ending, `game_ended_reason` / `game_ended_reason_detail`. Today
`submit_guess` answers a bare `reason: 'solved' | 'assassin' | 'turns'`
(`src/codenamesduet/hooks/useSubmitGuess.ts`).

## 3. Renames

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

### "Difficulty" as the name of a dictionary band — decided

The schema has been moving to `*_band` (`legal_band`, `required_band`), and
"difficulty" fails as a name (Joel, 2026-09-28): a game can have two bands; a
higher band makes some games easier (letterboxed, strands: more escape words)
and others harder; and games have other knobs that set how hard they are.
The name is **dictionary band** in prose and comments and `dictBand` in code
(Joel, 2026-10-07): waffle's and wordiply's stored key is `setup.dict_band`
(migration `20261007000003_dict_band_setup_key.sql`, which rewrites the stored
setups and the static blob's copy), the shared helper is
`src/common/setup-form/dictBand.ts` with `dictBandValue`, and the SQL and
edge-function sentences say "band". Left: `common.words.difficulty` itself,
the column every band is a value of, which the word-list import pipeline
also names.

### Smaller names

- `busy` — my move is with the server — is `submitting`: codenamesduet's
  `ClueStrip.tsx` still says `busy`.
- The solved flag is one name: the blob's `solved`. `hasSolved` is left in
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
  the face.
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
