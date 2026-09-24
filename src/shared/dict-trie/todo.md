# dict-trie — todo

## Bugs

## Soon

## Someday

## Maybe

## Won't do

- **A test for `buildTrie`'s growth path.** The node arrays start at `1 << 16`
  and double on demand. Both edge functions' real dictionaries cross that on
  every cold start (boggle's full trie is ~630k nodes), while the unit suites'
  small word lists never do. A mistake there would corrupt the dictionary rather
  than throw. Ruled against for suite speed: the case (every doubled
  three-letter combination, `abcabc` … `zzzzzz`, asserting `nNodes > 65536`
  plus a hit, a miss and a non-word prefix) takes about half a second, slow
  beside the rest of the file.
