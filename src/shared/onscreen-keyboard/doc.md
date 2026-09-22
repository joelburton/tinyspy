# onscreen-keyboard

The on-screen QWERTY for a game whose letters land on the board rather than in
an entry box — three rows of caps, with ⌫ and Enter flanking the bottom one.

## Intro to area

A game that takes letters needs somewhere to type them, and on a phone there is
no physical keyboard to take them from. So this draws one: tap a cap and the
letter goes down the same path a real keypress would take, which is what lets a
game be played on touch without changing anything about how it works.

The caps are not all the same kind of thing, and that is the distinction worth
carrying away. The 26 letters are **keys** — they call back with a character and
nothing more. A letter is not a command, and making each one an action would
mean twenty-six registry entries each hard-coding its own letter. ⌫ and Enter
are **the game's own bindings**, the same two the physical keyboard answers to,
worn here through `actionSurface`. That is why a cap and its key can never
disagree about whether the move is available: they are one binding drawn twice.
It is also why Enter can sit gray over an empty guess while every letter beside
it is live.

Tinting is the caller's. A game with per-letter feedback hands over the best
tone each letter has earned and the caps wear it; a game without hands over
nothing and every cap stays neutral.

## Details

- **The tone type is the board's, short by exactly one value.** `KeyTone` is
  `Exclude<TileColor, 'blank'>`, derived from the palette rather than restated,
  so a key and the tile above it cannot drift into two vocabularies. The missing
  value is the difference between them: a tile can be waiting to be judged, and
  an untried key is simply untried — it carries no tone at all.
- **At game over the keyboard is withdrawn, not removed.** It goes invisible and
  **keeps its box**, so the column does not lurch upward at the moment a player
  is reading their verdict. `visibility: hidden`, never `display: none`; the
  stylesheet argues it at length because the difference is the whole rule.
- **A cap refuses the focus a click would give it.** Canceling `mousedown` on
  every cap: nothing here needs focus — this exists so a player without a
  physical keyboard can type, and a player with one just types — and a focused
  cap would wear a ring from the next keystroke onward.
- **The judged caps wear the wordle palette by name**, rather than reading a
  game-agnostic token that a game then sets to the same value. A game outside
  that family which ever tints keys adds classes of its own: "this key has been
  used" needs its own color, never wordle-gray, which means *not in the word*.
- **`aria-label="Keyboard"` on the container is a test handle** — an e2e locator
  and a unit `getByLabelText` both reach the caps through it.
