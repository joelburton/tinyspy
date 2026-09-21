# found-words — todo

## Bugs

## Soon

## Someday

- **`.loading` and `.empty` go when the three games take the loader shape.**
  `foundWordsPlayArea.module.css` styles two early-return divs that
  [docs/playarea.md → The shape of a game's PlayArea.tsx](../../../docs/playarea.md#the-shape-of-a-games-playareatsx)
  replaces with `<Loading>` and `<NoSuchGamePage>`. Each game deletes its own
  two divs as its area opens; the rule they share is this folder's, and nobody
  else can delete it. Do it when the last of boggle, spellingbee and wordwheel
  has converted — `grep -rn "surface.loading\|surface.empty" src/` comes back
  empty at that point, and the file loses four lines.

## Maybe

## Won't do
