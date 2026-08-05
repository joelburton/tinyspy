This doc categorizes our games by their features — some are code-features, some
are general about-the-game qualities.

Two kinds of category:
- **Dimensions** — every game has exactly one value; a dimension should list all
  15 games (a game missing from one is a gap to notice).
- **Tags** — a game either has the feature or not.

`*` = a future / possible feature (not built).


Games (code = brand):
PN PsychicNum   (psychicnum)
FB FreeBee      (spellingbee)
TS TinySpy      (codenamesduet)
WK WordKnit     (connections)
MC MothCubes    (boggle)
RA RackAttack   (scrabble)
SD StackDown    (stackdown)
SS SyrupSwap    (waffle)
MG MonkeyGrams  (bananagrams)
WN WordNerd     (wordle)
CP CrossPlay    (crosswords)
MW MooseWheel   (wordwheel)
WW WordWire     (wordiply)
PP PaulPath     (strands)
SB SnakeBox     (letterboxed)


# Dimensions

## Modes offered
Coop + compete pair:  PN FB WK MC RA SD SS WN CP MW WW PP SB
Coop only (no compete):  TS
Compete only (no coop):  MG

## Co-op interaction (games that have coop)
This is the DEFAULT pacing; eight of the free-for-all games also offer opt-in
turn-by-turn play at setup (see the "Opt-in turn-by-turn coop" tag below).
Free-for-all (shared board, everyone acts anytime):  PN FB WK MC RA SD SS WN CP MW WW PP SB
Turn-based (fixed seats, alternating):  TS

## Board origin
Generated fresh at start:  PN FB TS MC SS WN MW WW SB
  (MW samples from a pangram-seed table, WW from candidate bases, SB from a
  chained word-pair seed table re-partitioned per game — but the board itself
  is built fresh per game by an edge fn, not picked whole)
Pre-generated puzzle library:  WK SD PP (`strands.puzzles`, the NYT archive)
Open/empty grid you build on:  MG RA
Multi-source (library OR NYT-generated OR uploaded):  CP

## How the board gets built (code path)
Where to look when a board is wrong — distinct from "Board origin" above.
Dedicated `<codename>-build-board` edge fn computes the board, then calls `create_game`:  FB MC SS MW WW SB
Built inline in `create_game` (plpgsql, sampling `common.words` / a tile distribution):  PN TS RA MG WN
Picked from a CLI-imported library table:  WK (`connections.puzzles`)  SD (`stackdown.boards`)
  PP (`strands.puzzles`)
Multi-source:  CP (CLI-imported `crosswords.puzzles` library, OR NYT-by-date via
the `crosswords-import-nyt` edge fn — fetched on demand, stored inline on the game)

## Board change during play
Unchanged — you just find words in it:  MC FB MW PP SB
  (PP's tiles LOCK as words are found — the letters never change, but a found
  word's cells leave play, which is how the board is "consumed"; SB's letters
  get marked COVERED, but never change and never leave play)
Fill / annotate — fixed cells, contents change:  PN TS SS WN CP WW
Shrinks — tiles removed/collapsed as you solve:  SD WK
Grows — you add tiles to it:  RA MG

## Primary input
Type a word (keyboard grab):  FB MC MW  SB (board letters only; the previous
  word's last letter is a locked seed the entry re-derives each word)
Type a number (keyboard grab):  PN
Type free text (a clue field):  TS
Type / click a letter into a slot:  RA SD SS WN CP WW
Click tiles to select:  WK  PP (the only game with NO text entry at all —
  a board repeats letters, so a typed string can't identify a path)
Drag tiles to place:  MG
(TS also clicks board cells when guessing; CP/WN/WW are keyboard-first; FB/MW/SB
tiles are also clickable — SB submits on re-clicking the word's last letter;
WN + WW share the on-screen `GuessKeyboard`.)

## Solution & trust model — where the answer lives, who validates
Hidden server-side solution, revealed at terminal:  PN SD SS WN CP PP
Solution FE-readable all along, but not shown ("FE-knows"; server still
validates moves — devtools could peek, and per the trust model that's fine):  TS WK
SB (the whole playable list ships too, for the FE hint search; display-gated
  behind the terminal Reveal)
FE holds the full word list, self-scores ("trusting-commit"):  MC FB MW WW
No fixed answer — server just validates each move's legality:  RA MG

## Hidden-solution machinery (the schema pattern behind the row above)
Column-level grant blocks the solution column on the base table; a
terminal-gated `games_state` view / helper reveals it:  PN (`secrets`)
SD  SS (`_solution_for`)  WN (`_target_for`)  CP  PP (`_solution_for`)
Everything readable; the FE just doesn't render it mid-game:  TS (both key
cards)  WK (`board.categories`)  WW (scores + the best word)  SB (the seeded
pair + playable list; the shared `solution_revealed` flag gates display)
Nothing hidden by design (lists ship for local validation / no fixed
solution):  MC FB MW RA MG
(Orthogonal: compete games also hide *opponents'* mid-game moves via RLS on
the guesses/moves table, opening at terminal — that's about peers, not the
solution. SB does it with a COLUMN grant instead: `players.chain` is unreadable
on the base table and reaches the FE only through `players_state`'s per-mode
mask.)

## Win / score metric shape
Points accumulation (high score wins; FB/MW via a rank ladder):  RA MC FB MW
Binary solve (you finished the puzzle, or didn't):  TS WK SS WN CP
Count to a target:  PN (find N secrets)  SD (clear 6 words)  PP (find every theme
  word — which, since the words tile the board exactly, is the same as consuming
  all 48 cells)  SB (cover all 12 letters within the word cap)
Race to empty your hand:  MG
Best-word comparator (no scalar score; length score → letter count → time):  WW

## Move / guess budget
Fixed guess budget:  WN (5–8 at setup, default 6)  WW (5, hardcoded)  PN (3/5/7/9 at setup)
Resource budget:  SS (swaps: par + extra, extra 0–15 at setup, default 5)
SB (words: par 2 + extra, extra 0–5 at setup, default 3 — but undo REFUNDS, so
  it's a shape constraint you can't bust, not a spendable budget)
WK (4 mistakes, fixed)  TS (9 turns, fixed)
Unbounded — play to terminal / timer:  MC FB MW RA SD MG CP PP

## Seat & information model
Variable N players (1–8; MW WW PP SB cap at 6), full shared info in coop:  PN FB WK MC RA SD SS WN CP MG MW WW PP SB
Fixed 2 seats, asymmetric info (each partner sees a different key):  TS

## History log in the info column
TurnLog (chronological turns):  PN TS WK RA SD SS WN PP SB
WordList (alphabetical finds):  MC FB MW
Neither:  MG CP WW (WW's five guess rows on the board ARE the record)

## Realtime sync
Standard refetch-on-change (`useRealtimeRefetch`):  everyone below not called out
Per-cell CDC direct-apply + peer cursors:  CP
Broadcast-coupled peer tile-selection:  WK
(RA + CP also broadcast a coop "show my move / peer flash"; scratchpad is broadcast where enabled.)
(Load-bearing for all of them: every table a channel subscribes to must be in
the `supabase_realtime` publication — see docs/supabase.md.)

## PlayArea layout
Standard v3 two-column (board column hugs the board, fixed-width info column):  PN FB TS WK MC RA SD SS WN MW WW PP SB
Documented exceptions (docs/playarea.md + the game docs):  MG (board FILLS the
column + zoom/scroll; hand + peel/dump live in the info column)  CP (keyboard-first
grid; clue lists fill the info side)


# Tags

## Opt-in turn-by-turn coop (the common turn-order primitive)
PN WN WK SS WW  RA (coop)  PP  SB (the strongest fit on the roster — the chain
hands off natively, "I ended on T, you start on T"; undo COSTS the turn there)
(A per-game setup choice — `coop_style: 'turns'` — that rotates moves through the
players instead of free-for-all. Discrete-move coop games only; the shared
primitive lives on `common.games.current_turn_user_id` + `common.game_players.
turn_seat`. See docs/common.md → Turn-order. Distinct from TS, whose turns are
fixed at the gametype level, not an opt-in.)

## Word-finding as core play
MC FB MW (find many words)  WW (find the longest word)
PP (find the words HIDDEN in a grid — the only one where a word's PLACEMENT,
not just its letters, is what you're looking for)

## Shared entry / submit machinery (who consumes what from `common/`)
`useWordSubmit` (shipped-list lookup + optimistic trusting-commit):  FB MC MW WW
`EntryRow` / `EntryBox` (the typed-word box + Delete/Submit row):  PN FB MC MW SB
`useCaptureKeys` directly (bare-keys grab, no focused input):  FB MC WN MW WW
  (PN + SB get their capture via `EntryRow`; WN/WW letters land on the board,
  not a box. SB deliberately skips `useWordSubmit` — a chain append isn't a
  found-word, so its validation is `lib/board.ts` + a plain RPC.)
`GuessKeyboard` (shared on-screen QWERTY):  WN WW

## Hints
PN SD WK RA CP  PP  SB (two rungs, coop-only: 'hint' = length + first letters,
'spoiler' = the word; computed by an FE breadth-first search over the shipped
playable list, logged server-side, never penalized)
SS* FB*(hint for the pangram) MC*(first 2 letters?)
(PP's is the only EARNED one: valid non-theme words fill a bar, and cashing it
rings a theme word's tiles without giving their order.)

## AI
TS (clue suggester)  RA (suggester + opponent)  CP (explain-cryptic-clue)

## Can zoom the board
MG

## Leans on the shared dictionary (`common.words`)
Everything except TS WK CP (those bring their own word lists / puzzle sources).
PP is a hybrid: its THEME words come with the puzzle, and only the hint words are
looked up in common.words.
FE-validation via a shipped list built from it:  MC FB MW WW
  (SB ships a list too, but the server re-validates every move against it)
Server-side move validation:  RA MG WN PP SB
Board build / secrets / hints:  PN SD SS WN MW WW SB (the seed pool + each
  board's playable list are both computed from it)

## Reveal-at-terminal (shows the answer when done)
PN TS WK SD SS WN CP PP SB (the seeded two-word solution — "Solvable in two";
a win opens it automatically, otherwise the terminal Reveal button)
(A UX tag; the enforcement varies — see the trust + machinery dimensions. For
TS WK the data was FE-readable all along. The trusting-commit games also
reveal at terminal — missed words for MC FB MW, the best possible word for
WW — same story: a display choice, not a security boundary.)

## Restart (`<gametype>.replay_board` + the terminal `RestartButton`)
PN WK FB MC RA SD SS WN MW WW PP SB
Deliberately without: TS (the board IS the secret), MG (no puzzle to re-run —
its New game is the fresh deal), CP (a re-read grid can't surprise you twice —
Clear board covers a fresh grid, New game covers another puzzle)

## New game from the terminal row (`NewGameButton`)
Everything. CP is the odd one: its button opens the club's SETUP dialog
(`/c/<handle>?new=<gametype>`) instead of creating a game directly, because
`setup` names a puzzle rather than a shuffle. PP is the other library game and
takes a third route: its button starts the NEXT DAY'S puzzle directly, and says
so in the confirm. All fifteen also carry it as a game-menu item.

## Turn-history replay (`useHistoryViewer`)
TS WK PN RA SD SS WN PP SB
(PP's is the only one that's a pure FILTER — its board strictly accumulates, so
"the board at turn N" is a slice of the log rather than a reconstruction. SB's
is a FOLD over its event stream — played pushes, undone pops, cleared empties —
which is why its log records retreats instead of deleting rows.)

## Print to PDF
All fifteen games print (docs/pdf.md has the per-game table + body families).
(PP + SB print one TRACK PER BOARD like WN/SS — coop is one column, compete one
per player — and move their colour encodings onto shape/weight, since on a mono
printer two hues are one grey: PP's purple/gold becomes line weight + dashing,
SB's covered-letter green becomes a heavy black ring + bold glyph.)

## Player-tunable difficulty
Dictionary/difficulty band at setup:  PN FB MC RA SD SS WN MG MW WW PP SB
  (PP's + SB's bands run the OTHER way: a wider dictionary means more hint
  words / more escape routes off an awkward tail letter, so a HIGHER band makes
  them easier. SB also has the par + extra_words cap — see Move/guess budget.)
Custom letters too:  FB MW (MW also a "unique letters only" board constraint)
(library games WK/CP pick a puzzle instead; TS has no difficulty knob)

## Timer
Optional at setup for every game.
On timeout, MC RA WW SB resolve a winner from current standing (SB's comparator:
most letters covered → fewest words → co-winners); everywhere else a timeout
crowns nobody (coop loss / compete leaderboard frozen with no winner).

## Can win after conceding
MC*(on score)  FB*(on score)  MW*(on score)
(Today a conceder always forfeits the win, even if their banked score would top
the board.)


# Mobile suitability
Thirteen games are phone-converted via the info-sheet recipe (docs/mobile.md):
PN FB TS WK MC SD SS WN CP MW WW PP SB.
Keyboard-required, NOT desktop-only (fits a tablet with a hardware keyboard;
deliberately not device-gated):  CP (its conversion is a layout for
keyboard-attached devices, not a touch-entry mode)  RA (not phone-converted;
renders the desktop layout everywhere)
Desktop-only, hard-blocked on all touch via the shared `DeviceBlockNotice`:  MG


# Clear win condition in compete
(TS is coop-only, so it has none.)
- PP: solved the board on the FEWEST HINTS USED, earliest solve breaking a tie
  (race does NOT end on first solve — a later finisher can still spend less)
- PN: guessed all secrets (race ends)
- FB: first to reach the target rank (race continues)
- WK: first to find all categories (race ends)
- MC: reached % of required words (race continues)
- RA: highest score when the bag empties / all pass (game ends)
- SD: first to clear the stack (race ends)
- SS: first to place all correct (race ends)
- MG: first to place all tiles legally (race ends)
- WN: fewest guesses to solve (race continues)
- CP: first fully-correct grid wins (race ends)
- MW: first to reach the target rank (race continues)
- WW: best comparator score once everyone has spent 5 guesses (not a race)
- SB: first to cover all twelve letters within the cap (race ends); a timeout
  instead resolves on most letters covered → fewest words → co-winners
