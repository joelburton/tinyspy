# menu — todo

## Bugs

## Soon

- **Does a menu row go gray while its action is in flight?** Undecided, and the
  games disagree. Rows already gray for STATE — Reveal until terminal, Concede
  once you have conceded — and nobody disputes that; this is the other case, a
  row whose RPC is out on a round trip right now, where graying reports a wait
  rather than a rule. New game is the only such row today: strands sets
  `disabled` on it from the single-flight flag, every other game deliberately
  does not and says so in a comment beside the call, on the grounds that the
  guarded handler already drops the second call however the row looks and that
  a per-render `disabled` drags the flag into the menu effect's deps (strands
  rebuilds its whole menu, print model included, when a create starts and again
  when it lands). What the player sees, meanwhile, is a live-looking row that
  silently does nothing for a second or two — and the row is where the keyboard
  shortcut is advertised, so it reads as a promise. The terminal button grays in
  every game either way. Decide the rule for any row that fires a
  non-idempotent RPC, not just this one.

- **Fifteen games write the New game row's id as a bare string.** `NEW_GAME_ID`
  is exported here and its docstring calls it the contract with the shell — use
  this id and `+` finds you — but only strands imports it; everyone else types
  `id: 'new-game'`. A typo costs a shortcut that silently does nothing in that
  one game: `GamePage`'s `find` returns undefined and the handler returns, while
  the row and the terminal button keep working. The fix is an import and a
  one-line change per game. (`END_OR_CONCEDE_IDS` backs ⌥⌫ the same way, but
  `buildGameMenu` builds those two rows in this folder, so both literals sit in
  the same file as the constant — worth deriving them from it while here.)

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
