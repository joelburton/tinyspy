# wordle — todo

## Bugs

## Soon

- **`Board` should take an `Outcome` and map it to its two colors itself.**
  Today the seven-value outcome is narrowed at the call site in `BoardCol`
  (`warning` → amber, everything else red), which is total but is narrowing
  done in the wrong place. The rest of the verdict-mark state — a nonce and a
  tone as two states written together — stays per game on purpose
  (docs/ui.md → "The verdict mark's state is per game").

## Someday

## Maybe
