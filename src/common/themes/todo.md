# themes — todo

## Bugs

## Soon

- **Rename `--page-surface-color` → `--default-bg-color`.** Decided
  2026-08-22 and never built: the white is "what a background is unless
  something says otherwise", and the name should say so. `--page-bg-color`
  stays the page's own. docs/ui.md → The buckets has the rule.

## Someday

- **Three tokens paint a 1px line and mean different things** —
  `--page-surface-border-color`, `--field-edge-color`, `--page-divider-color` —
  but usage crosses all three. Settle per surface, as each is on screen.
- **Parked: two meanings colliding on one value.** Recorded, not fixed — the
  agenda for a color pass, once the structure is settled:

  | parked | against | apart |
  |---|---|---|
  | a bare `.secondary`'s border + label `#535353` | neutral's ink `#616161` | 0.043 |
  | …and its hover `#f3f3f3` | neutral's wash `#f5f5f5` | 0.008 |
  | a suspended game's stripe `#fdd835` | the near bar `#ffb74d` | 0.059 |
  | the attention flash `#ffd21a` | near's fill `#ffb74d` | same cell, different value |
  | `--chrome-link-color` `#1976d2` | an outline button's `#0053ac` | two weights of blue-as-text |
  | the destructive red `#b71c1c` | lost's ink `#c62828` | 0.037 — it should read differently |
  | `--member-blue-*` `#1976d2` | the action blue | byte-identical; member colors must relate to nothing |
  | near's fill `#ffb74d` | warning's fill `#ffa726` | 3.9° of hue — a split by name only |
  | `noted`'s base `#1976d2` | `error`'s base `#b71c1c` | both anchored at INK weight, so each family's fill is as dark as its ink. Re-anchor at a 400 once the palette shows them beside their siblings |
  | a pill's tint at 18% | `noted` + `error` at 8% | five families mix one way and two the other; preserved rather than normalized |
  | an outcome's `wash` | a pill's `tint` | two answers to one question at two strengths — deciding which survives moves pixels |

- **`--chrome-disabled-opacity` ships as an EFFECT rather than a per-family
  color**, and a game piece has no `disabled` at all — every unclickable piece
  shows a state instead, and setgame overrides the global dim because dimming
  a card "reads as a different card". Drop it from the vocabulary; invent it
  if ever needed.

## Maybe

- **Which cursor colors?** The board cursor is amber for a recorded reason
  (scrabble's premium squares are red and blue); the chrome cursor is blue.
  Whether they should relate is open.
