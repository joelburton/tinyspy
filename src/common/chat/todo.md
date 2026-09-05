# chat — todo

## Bugs

## Soon

- **`chatOpenStore.test.ts` should adopt `storage.fake.ts` and drop its guard
  exemption** — the same item as `web-storage/todo.md`'s, for the same reason:
  it hand-rolls a Storage fake and spies on `setItem` to simulate a throw,
  which `block()` does. `chatOpenStore.ts` and `chatUnread.ts` are already on
  `readStored` / `writeStored`; only the test reaches for raw storage, and it
  is on `rawStorage.test.ts`'s shrinking `ALLOWED` list.
- **`ChatBody`'s Tab hands the keyboard back to the game, and that has a
  scheduled successor** (`floating-panels/todo.md` — the `useTabRing`
  conversion). Noted so the handoff is not read as bespoke.
  `e2e/chat-keyboard.e2e.ts` pins the round trip (`/` takes the keyboard, Tab
  hands it back); anything touching `ChatBody`'s key handling answers to it.
- **Whether the unread badge's logic is chat's or the strip's.** `ChatButton`
  lives in `page-header` (a mark in the strip belongs to the strip), while
  `chatUnread.ts` is here.

## Someday

## Maybe
