This doc categorizes our games by their features — some are code-features, some
are general about-the-game qualities.

Two kinds of category:
- **Dimensions** — every game has exactly one value; a dimension should list all
  11 games (a game missing from one is a gap to notice).
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


# Dimensions

## Modes offered
Coop + compete pair:  PN FB WK MC RA SD SS WN CP
Coop only (no compete):  TS
Compete only (no coop):  MG

## Co-op interaction (games that have coop)
Free-for-all (shared board, everyone acts anytime):  PN FB WK MC RA SD SS WN CP
Turn-based (fixed seats, alternating):  TS

## Board origin
Generated fresh at start:  PN FB TS MC SS WN
Pre-generated puzzle library:  WK SD
Open/empty grid you build on:  MG RA
Multi-source (library OR NYT-generated OR uploaded):  CP

## Board change during play
Unchanged — you just find words in it:  MC FB
Fill / annotate — fixed cells, contents change:  PN TS SS WN CP
Shrinks — tiles removed/collapsed as you solve:  SD WK
Grows — you add tiles to it:  RA MG

## Primary input
Type a word (keyboard grab):  FB MC
Type a number (keyboard grab):  PN
Type free text (a clue field):  TS
Type / click a letter into a slot:  RA SD SS WN CP
Click tiles to select:  WK
Drag tiles to place:  MG
(TS also clicks board cells when guessing; CP/WN are keyboard-first.)

## Solution & trust model — where the answer lives, who validates
Hidden server-side solution, revealed at terminal:  PN TS WK SD SS WN CP
FE holds the full word list, self-scores ("trusting-commit"):  MC FB
No fixed answer — server just validates each move's legality:  RA MG

## Win / score metric shape
Points accumulation (high score wins; FB via a rank ladder):  RA MC FB
Binary solve (you finished the puzzle, or didn't):  TS WK SS WN CP
Count to a target:  PN (find N secrets)  SD (clear 6 words)
Race to empty your hand:  MG

## Seat & information model
Variable N players (1–8), full shared info in coop:  PN FB WK MC RA SD SS WN CP MG
Fixed 2 seats, asymmetric info (each partner sees a different key):  TS

## History log in the info column
TurnLog (chronological turns):  PN TS WK RA SD SS WN
WordList (alphabetical finds):  MC FB
Neither:  MG CP

## Realtime sync
Standard refetch-on-change (`useRealtimeRefetch`):  everyone below not called out
Per-cell CDC direct-apply + peer cursors:  CP
Broadcast-coupled peer tile-selection:  WK
(RA + CP also broadcast a coop "show my move / peer flash"; scratchpad is broadcast where enabled.)


# Tags

## Word-finding as core play
MC FB

## Hints
PN SD WK RA CP
SS* FB*(hint for the pangram) MC*(first 2 letters?)

## AI
TS (clue suggester)  RA (suggester + opponent)  CP (explain-cryptic-clue)

## Can zoom the board
MG

## Leans on the shared dictionary (`common.words`)
MC FB RA MG

## Reveal-at-terminal (shows the hidden answer when done)
PN TS WK SD SS WN CP

## Turn-history replay (`useHistoryViewer`)
TS WK PN RA SD SS WN

## Print to PDF
RA PN MC FB MG CP
Deliberately excluded (turn-by-turn progressions): SS WN
Candidates, not built: TS* WK* SD*

## Player-tunable difficulty
SS (band)  MC (band)  FB (custom letters)
(library games WK/SD/CP pick a puzzle instead)

## Timer
Optional at setup for most games (a scored tiebreak on timeout: MC RA SD FB PN MG).
Never timed: CP.

## Can win after conceding
MC*(on score)  FB*(on score)


# Mobile suitability
No game is CSS-optimized for mobile yet — this is how well each *could* work once we do.
Could work well:  PN FB WK MC SD SS WN
Could work well WITH a hardware keyboard:  CP (the board fits an iPad nicely; the on-screen keyboard is too fiddly, so it wants a real keyboard — but it's not desktop-only)
Just OK:  TS (clue needs the keyboard; board cramped)  RA (board cramped)
Never:  MG (too fiddly dragging; board too cramped)


# Clear win condition in compete
(TS is coop-only, so it has none.)
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
