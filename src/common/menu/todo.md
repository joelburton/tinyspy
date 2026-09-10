# menu — todo

## Bugs

## Soon

- **A menu row picks its glyph by hand, so every game says the same thing
  twice.** `MenuItem.icon` is data, so a game writes `icon: IconRestart` in
  its menu section while its info column renders `<RestartButton>` and passes
  no icon at all — the same action, the glyph chosen in two places, once per
  game. It is why every game's `PlayArea` imports from the icon registry at
  all (restart, new game, reveal/hide, spoiler, hint, scratchpad). Nothing keeps
  the two in step, and the menu is meant to be the legend that TEACHES the
  buttons' glyphs, so a drift there teaches the wrong one. Worth exploring: a
  row that names the action and takes its glyph from wherever the button does.
  Print is the honest exception — a menu-only action with no button, so its
  glyph has nowhere else to come from.

## Someday

## Maybe
