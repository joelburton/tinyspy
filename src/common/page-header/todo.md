# page-header — todo

## Bugs

## Soon

- **The header's marks are not evenly separated, and the CSS says they are.**
  One `gap: 0.375rem` for the whole slot, then each mark adds its own padding
  INSIDE its box — the menu trigger `0.25rem`, the chat bubble
  `PageHeaderButton`'s `0.3rem` plus `.bubble`'s own, the status slot none —
  so every visible separation differs and none of them is the declared
  number. Look at it on the crosswords page, where EVERY mark can be on the
  strip at once; `--spacer` cannot claim `0.375rem` until this settles what
  the separation should be.

## Someday

## Maybe
