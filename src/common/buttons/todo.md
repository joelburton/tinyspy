# buttons — todo

## Bugs

## Soon

- **Does `ShuffleButton`'s `font-size: 32px` do anything?** The glyph is sized
  by the component (`<IconShuffle size={24}>`), so the declaration only sets
  the line box its `inline-block` span sits on — which may still give the span
  height inside the 35px flex-centered pill, or may be inert. It cannot be
  settled by reading, only in a browser. Left in place until someone looks.
- **Disabled control** — one utility for the disabled look. Today
  `cursor: not-allowed` is written at eleven sites with the opacity spread
  over 0.45 / 0.5 / 0.55 / 0.6 (`Menu.itemDisabled`, `SelectField`,
  `SetupTimerSection`, `AnagramDialog`, `WordEditDialog`). The vocabulary has
  `--opacity-2` (0.5) for it. `StandardButton` states no disabled rule at all —
  its tell is the missing hover, delivered by `:not(:disabled)` on every hover
  rule — so the base is consistent and the hand-written sites are not.
- **`<ShuffleButton>` should never take focus at all** — game stuff doesn't.
  Its `:focus { outline: none }` says a click leaves no ring, then
  `:focus-visible` puts one back for a keyboard that has ⌥Z. The fix is
  removing the tab stop, not restyling the ring.
- **Figure out small buttons.** Ten controls make themselves small by hand.
  Three write the same `0.8rem` and differ only in padding
  (`FilterSelect.closedSelect`, `DefinitionView.editLink`,
  `GameScratchpadCompanion.takeOver`); four more sizes exist that nothing
  names — `0.9rem` three times (the club filters' mode option, crosswords'
  controls, scrabble's suggest row), `0.95rem` (`Menu.item`), `1.05rem`
  (wordiply's reveal word, BIGGER), and `1.1rem` / `1.2rem` on the two
  hand-rolled dismiss ✕s (`GenericFeedbackPill`, `Toast`). None is on the
  font-size ramp, and the ramp's middle step (`--font-size-2`, 0.85rem) has no
  callers among them while an unnamed 0.9rem has three. Four of the ten are
  games' (crosswords, scrabble, wordiply, waffle), so this decides a rule and
  each game applies it. Also: **the plus in "+ New club" is a typed `+`
  character, not a glyph** — the last glyph-shaped affordance not in the icon
  registry.
- **docs/ui.md → "What a `<button>` is" describes classes that were renamed.**
  It writes `.button`, `.button-small` and `cls('button', 'secondary',
  'button-small')`; the classes are `.standardButton`, `.small` and
  `.iconOnly` in `StandardButton.module.css`, composed by `<StandardButton>`
  rather than by hand. The file references in that section are already
  correct; the class story is this folder's to rewrite.

## Someday

## Maybe
