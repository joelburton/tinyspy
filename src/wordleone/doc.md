# wordleone

One row already played, and the one word it points at. A starter word is
shown colored against a hidden five-letter answer, and the answer is the only
legal word that fits those colors; find it. A wrong guess is a miss and tells
you nothing else.

## Intro to area

The puzzle is built before the game exists. The `wordleone-build-board` edge
function (`supabase/functions/wordleone-build-board/`, its generator in
`gen.ts`) picks an answer and searches starters until one isolates it among
every word at or below the game's legal band, then calls
`wordleone.create_game`, which checks the puzzle is one — the colors are the
starter scored against the answer, the answer is legal, no other legal word
fits — and stores it with the answer hidden by a column grant. The starter and
its colors are public from the first paint, in `static_game_data`; the answer
reaches the client in `game_data` only once the game has ended. How hard a
puzzle is lives in the generator alone, so the printable sheet
(`gmake g-wordleone-sheet`) and the game run one set of filters.

A guess comes back one of four ways. The starter or a word already guessed is
a duplicate, and a word outside the legal band is not a word: both cost
nothing and write nothing, and shake the typed row as wordle's do — a
duplicate orange, a non-word red. A legal wrong word is a miss: logged with
no colors, counted, and shaken red. Every one of the three clears the typed
row once its shake ends. Revealing the answer on a board you did not solve puts
it in that second row, all green and without the flip a solve gets, with the
keyboard left as it was earned. The
answer solves, and its all-green row lands under the
starter. Guesses are unlimited, so the board is two rows — the starter and the
row the guess is typed into — and every miss lives in the event log, drawn
uncolored.

Coop is one board and one miss count, ending on the solve; turn order is an
opt-in, a miss handing the turn on. Compete is the same puzzle on private
boards, and the race ends when nobody is still racing, every solver ranked by
fewest misses, then the earlier solve.

The frontend is wordle's, copied: `Board`, `BoardRow`, `Tile`, the typing and
flip hooks and the key tinting are wordle's as they were, and what changed is
what the rules change — the miss, the starter, the two-row board, the setup
(the legal band and the difficulty), and the print model. plans/wordleone.md
holds the design, the evidence the generator's filters come from, and the
steps still owed.
