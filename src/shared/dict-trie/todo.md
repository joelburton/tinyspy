# dict-trie — todo

## Bugs

## Soon

## Someday

## Maybe

- **A test for `buildTrie`'s growth path.** The node arrays start at `1 << 16`
  and double on demand, and only the scrabble edge function's cold start
  crosses that; a mistake there would silently corrupt the dictionary rather
  than throw. The case: every doubled three-letter combination (`abcabc` …
  `zzzzzz`), asserting `nNodes > 65536` plus a hit, a miss and a prefix that
  isn't a word. It runs about half a second, slow beside the rest of the file.

## Won't do
