This doc categorizes our games by their features — some are code-features, some
are general about-the-game qualities.

Two kinds of category:
- **Dimensions** — every game has exactly one value; a dimension should list all
  13 games (a game missing from one is a gap to notice).
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


# Dimensions

## Modes offered
Coop + compete pair:  PN FB WK MC RA SD SS WN CP MW WW
Coop only (no compete):  TS
Compete only (no coop):  MG

## Co-op interaction (games that have coop)
This is the DEFAULT pacing; six of the free-for-all games also offer opt-in
turn-by-turn play at setup (see the "Opt-in turn-by-turn coop" tag below).
Free-for-all (shared board, everyone acts anytime):  PN FB WK MC RA SD SS WN CP MW WW
Turn-based (fixed seats, alternating):  TS

## Board origin
Generated fresh at start:  PN FB TS MC SS WN MW WW
  (MW samples from a pangram-seed table, WW from candidate bases — but the
  board itself is built fresh per game by an edge fn, not picked whole)
Pre-generated puzzle library:  WK SD
Open/empty grid you build on:  MG RA
Multi-source (library OR NYT-generated OR uploaded):  CP

## How the board gets built (code path)
Where to look when a board is wrong — distinct from "Board origin" above.
Dedicated `<codename>-build-board` edge fn computes the board, then calls `create_game`:  FB MC SS MW WW
Built inline in `create_game` (plpgsql, sampling `common.words` / a tile distribution):  PN TS RA MG WN
Picked from a CLI-imported library table:  WK (`connections.puzzles`)  SD (`stackdown.boards`)
Multi-source:  CP (CLI-imported `crosswords.puzzles` library, OR NYT-by-date via
the `crosswords-import-nyt` edge fn — fetched on demand, stored inline on the game)

## Board change during play
Unchanged — you just find words in it:  MC FB MW
Fill / annotate — fixed cells, contents change:  PN TS SS WN CP WW
Shrinks — tiles removed/collapsed as you solve:  SD WK
Grows — you add tiles to it:  RA MG

## Primary input
Type a word (keyboard grab):  FB MC MW
Type a number (keyboard grab):  PN
Type free text (a clue field):  TS
Type / click a letter into a slot:  RA SD SS WN CP WW
Click tiles to select:  WK
Drag tiles to place:  MG
(TS also clicks board cells when guessing; CP/WN/WW are keyboard-first; FB/MW
tiles are also clickable; WN + WW share the on-screen `GuessKeyboard`.)

## Solution & trust model — where the answer lives, who validates
Hidden server-side solution, revealed at terminal:  PN SD SS WN CP
Solution FE-readable all along, but not shown ("FE-knows"; server still
validates moves — devtools could peek, and per the trust model that's fine):  TS WK
FE holds the full word list, self-scores ("trusting-commit"):  MC FB MW WW
No fixed answer — server just validates each move's legality:  RA MG

## Hidden-solution machinery (the schema pattern behind the row above)
Column-level grant blocks the solution column on the base table; a
terminal-gated `games_state` view / helper reveals it:  PN (`secrets`)
SD  SS (`_solution_for`)  WN (`_target_for`)  CP
Everything readable; the FE just doesn't render it mid-game:  TS (both key
cards)  WK (`board.categories`)  WW (scores + the best word)
Nothing hidden by design (lists ship for local validation / no fixed
solution):  MC FB MW RA MG
(Orthogonal: compete games also hide *opponents'* mid-game moves via RLS on
the guesses/moves table, opening at terminal — that's about peers, not the
solution.)

## Win / score metric shape
Points accumulation (high score wins; FB/MW via a rank ladder):  RA MC FB MW
Binary solve (you finished the puzzle, or didn't):  TS WK SS WN CP
Count to a target:  PN (find N secrets)  SD (clear 6 words)
Race to empty your hand:  MG
Best-word comparator (no scalar score; length score → letter count → time):  WW

## Move / guess budget
Fixed guess budget:  WN (5–8 at setup, default 6)  WW (5, hardcoded)  PN (3/5/7/9 at setup)
Resource budget:  SS (swaps: par + extra, extra 0–15 at setup, default 5)
WK (4 mistakes, fixed)  TS (9 turns, fixed)
Unbounded — play to terminal / timer:  MC FB MW RA SD MG CP

## Seat & information model
Variable N players (1–8; MW WW cap at 6), full shared info in coop:  PN FB WK MC RA SD SS WN CP MG MW WW
Fixed 2 seats, asymmetric info (each partner sees a different key):  TS

## History log in the info column
TurnLog (chronological turns):  PN TS WK RA SD SS WN
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
Standard v3 two-column (board column hugs the board, fixed-width info column):  PN FB TS WK MC RA SD SS WN MW WW
Documented exceptions (docs/playarea.md + the game docs):  MG (board FILLS the
column + zoom/scroll; hand + peel/dump live in the info column)  CP (keyboard-first
grid; clue lists fill the info side)


# Tags

## Opt-in turn-by-turn coop (the common turn-order primitive)
PN WN WK SS WW  RA (coop)
(A per-game setup choice — `coopStyle: 'turns'` — that rotates moves through the
players instead of free-for-all. Discrete-move coop games only; the shared
primitive lives on `common.games.current_turn_user_id` + `common.game_players.
turn_seat`. See docs/common.md → Turn-order. Distinct from TS, whose turns are
fixed at the gametype level, not an opt-in.)

## Word-finding as core play
MC FB MW (find many words)  WW (find the longest word)

## Shared entry / submit machinery (who consumes what from `common/`)
`useWordSubmit` (shipped-list lookup + optimistic trusting-commit):  FB MC MW WW
`EntryRow` / `EntryBox` (the typed-word box + Delete/Submit row):  PN FB MC MW
`useCaptureKeys` directly (bare-keys grab, no focused input):  FB MC WN MW WW
  (PN gets its capture via `EntryRow`; WN/WW letters land on the board, not a box)
`GuessKeyboard` (shared on-screen QWERTY):  WN WW

## Hints
PN SD WK RA CP
SS* FB*(hint for the pangram) MC*(first 2 letters?)

## AI
TS (clue suggester)  RA (suggester + opponent)  CP (explain-cryptic-clue)

## Can zoom the board
MG

## Leans on the shared dictionary (`common.words`)
Everything except TS WK CP (those bring their own word lists / puzzle sources).
FE-validation via a shipped list built from it:  MC FB MW WW
Server-side move validation:  RA MG WN
Board build / secrets / hints:  PN SD SS WN MW WW

## Reveal-at-terminal (shows the answer when done)
PN TS WK SD SS WN CP
(A UX tag; the enforcement varies — see the trust + machinery dimensions. For
TS WK the data was FE-readable all along. The trusting-commit games also
reveal at terminal — missed words for MC FB MW, the best possible word for
WW — same story: a display choice, not a security boundary.)

## Turn-history replay (`useHistoryViewer`)
TS WK PN RA SD SS WN

## Print to PDF
RA PN MC FB MG CP MW
Deliberately excluded (turn-by-turn progressions): SS WN
Candidates, not built: TS* WK* SD* WW*

## Player-tunable difficulty
Dictionary/difficulty band at setup:  PN FB MC RA SD SS WN MG MW WW
Custom letters too:  FB MW (MW also a "unique letters only" board constraint)
(library games WK/CP pick a puzzle instead; TS has no difficulty knob)

## Timer
Optional at setup for every game except CP (never timed).
On timeout, MC RA WW resolve a winner from current scores; everywhere else a
timeout crowns nobody (coop loss / compete leaderboard frozen with no winner).

## Can win after conceding
MC*(on score)  FB*(on score)  MW*(on score)
(Today a conceder always forfeits the win, even if their banked score would top
the board.)


# Mobile suitability
Eleven games are phone-converted via the info-sheet recipe (docs/mobile.md):
PN FB TS WK MC SD SS WN CP MW WW.
Keyboard-required, NOT desktop-only (fits a tablet with a hardware keyboard;
deliberately not device-gated):  CP (its conversion is a layout for
keyboard-attached devices, not a touch-entry mode)  RA (not phone-converted;
renders the desktop layout everywhere)
Desktop-only, hard-blocked on all touch via the shared `DeviceBlockNotice`:  MG


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
- MW: first to reach the target rank (race continues)
- WW: best comparator score once everyone has spent 5 guesses (not a race)
