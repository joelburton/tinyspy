# setup-form — todo

## Bugs

## Soon

- **Five setup forms set `font-family: monospace`** — spellingbee, wordwheel,
  boggle, letterboxed, wordiply — all on the field that previews letters or a
  board. One decision written five times by five hands, and none wrote down
  why. Do NOT change them piecemeal (Joel): decide once whether a letters
  preview wants a mono face at all now that the app font's digits are tabular
  and its width dial can hold a column. Waffle's solution reveal and
  codenamesduet's board carry the same unexamined choice; the scratchpad's
  mono face is decided (a notepad).

## Someday

## Maybe

- **`<SetupCoopStyleSection>`'s seed effect runs on every render.** Each form
  builds its `players` prop inline and passes an inline `onChange`, so the deps
  never stabilize; the effect no-ops, so nothing is wrong, but the deps read as
  a gate and are not one. Memoizing both in the forms that mount it is the
  change. It touches every such game's form for no behavior, so it waits for
  those games' areas.

## Won't do
