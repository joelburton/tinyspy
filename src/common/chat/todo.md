# chat — todo

## Bugs

## Soon

- **`ChatBody`'s Tab is the declared step OUT of the panel's ring**, not a
  bespoke key: it consumes Tab and blurs the field, and the game's own ring
  takes over from `<body>` (`keyboardHandoff.ts`).
  `e2e/chat-keyboard.e2e.ts` pins the round trip (`/` takes the keyboard, Tab
  hands it back); anything touching `ChatBody`'s key handling answers to it.

## Someday

## Maybe

- **`chatOpenStore` stores its boolean as `'true'`/`'false'` where
  `scratchpadOpenStore` stores `'1'`/`'0'`.** Two panels doing the same thing
  two ways, decided by different hands rather than for a reason. Invisible to
  players and cheap to leave; settling it means agreeing one encoding with
  scratchpad and orphaning whichever stored values change.
