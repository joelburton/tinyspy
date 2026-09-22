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
- **At game over the keyboard stays, disabled** — the same look it wears when it
  is not your turn. It is not only an input: its caps carry the tone every letter
  earned, so a keyboard that has recorded six guesses is a readout of the game
  just played, and that is worth most at the moment you want to study it. The
  general rule is *an input surface that is also a READOUT stays visible when the
  game ends* — a rack you can no longer play says nothing once the game is over;
  this says plenty. **Never unmount it either**, in a game or here: the column
  would lurch upward by ten-odd rem of cap rows at the frame a player starts
  reading their verdict (docs/ui.md → Layout stability).
- **A cap refuses the focus a click would give it.** Canceling `mousedown` on
  every cap: nothing here needs focus — this exists so a player without a
  physical keyboard can type, and a player with one just types — and a focused
  cap would wear a ring from the next keystroke onward.
- **The judged caps wear the wordle palette by name**, rather than reading a
  game-agnostic token that a game then sets to the same value. A game outside
  that family which ever tints keys adds classes of its own: "this key has been
  used" needs its own color, never wordle-gray, which means *not in the word*.
- **`aria-label="Keyboard"` on the container is a test handle.** Both a browser
  and a unit test reach the caps through it, so it is load-bearing rather than
  decorative.
- **Two token families, and the prefix is the difference.** `--kbd-*` comes from
  the theme and a rule here may only READ it — except `--kbd-key-hover-fill-color`,
  which a tone re-sets on purpose, and that re-setting is the whole hover
  mechanism: the hover rule reads the token off the element, so a tone wins
  without a specificity contest. `--key-*` is the stylesheet's own arithmetic,
  read nowhere else in the app.
- **Two sizes are bespoke because each is half of a PAIR.** The gaps are chosen
  against each other, so the keyboard runs tighter across than down; the cap
  sizes likewise — one is deliberately bigger than a letter needs, because the
  glyph is the cap's whole content and it is what rescues ⌫, and the other is
  what "Enter" must shrink to so a WORD fits a cap barely wider than a letter's.
  Moving either alone breaks its pair, which is why neither takes a step off a
  ramp. Both are recorded in `src/guards/vocabularies.test.ts`.
- **Where the coverage lives, and why it is split.** `GuessKeyboard.test.tsx`
  holds what a caller is promised — the tap, what can be pressed, which class a
  tone lands, the focus refusal. The tones' COLORS are in a browser, where a
  fill and an ink can be read. The game-over withdraw is pinned by each
  consumer, being a fact about a game's terminal frame rather than this
  component's contract.
