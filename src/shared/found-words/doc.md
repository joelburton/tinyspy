# found-words

What spellingbee, wordwheel and boggle share as games that accumulate a list of
found words: the submit engine, the terminal reveal, the rows the word-list
panel draws, the two data shapes behind them, the typed word's illegal-letter
dim, and the play-surface scaffolding all three compose. Wordiply takes the
submit engine alone — its guesses are the found set, though it keeps no
`found_words` table and shows no list.

## The reveal's sizing, and the board with no real bonus list

`buildRevealWords` is a pure client-side fold — nothing new crosses the wire at
game end, and the gate is the viewer's own reveal toggle. Two things about what
it produces are worth knowing before reading it, and neither is visible from the
list that draws the result.

**Sizing, measured against the local dictionary at the default bands** (required
3 / legal 5): the bonus set is roughly the **same size** as the required set, not
the multiple it looks like — band 3→5 is a narrow widening, and what really
separates the two is the `american / not slang / clean` filter. So the terminal
list roughly doubles. The grid it lands in is column-major and takes its height
from its column, so that reads as *more columns*, never a taller panel.

**When a board has no real bonus list**, the reveal skips it and the word list's
KIND filter disappears. That is `legal_band === band` (boggle) / `legal ===
required` (spellingbee, wordwheel), where "bonus" degenerates to nothing but the
words the clean filter removed from required — crude/slang/slur, not a wider
dictionary, and not a list to hand anyone as "here's what you missed." One flag
per game gates the reveal, the KIND select, and (in boggle) the Bonus stat cells,
so the three cannot disagree about whether this board has bonus words.
