# anagram-finder

The ⌥~ dialog: type a rack of letters and see every dictionary word they
spell, each one click-to-define.

## Design

A player holding a rack of letters wants to know what words are in it. This
dialog answers that anywhere in the app: press ⌥~, type the letters, press
Enter, and the words appear in a list, easiest first, with the difficulty band
beside each. The matching is the server's, in `common.anagrams`
([docs/common.md](../../../docs/common.md) → The ⌥~ anagram finder); the dialog
only tidies what was typed and shows the rows.

The pattern is more than a scramble. A lowercase letter may land anywhere, `?`
stands for any letter, and an uppercase letter is pinned to the position it was
typed in, so `Acer` finds ACER and ACRE but never RACE. Case therefore carries
meaning, and the box never lowercases. It drops anything that isn't a letter or
`?` as it is typed, caps the length at what the server accepts, and answers a
one-letter pattern with a sentence rather than a search. The legend under the
box teaches the syntax in one line.

It is the lookup dialog's sibling: the same floating-panel frame, the same
type-and-Enter shape, opened through the app-level actions the same way. Where
the lookup answers with a definition, this answers with a list, and every word
in it is a `<DefinableWord>`, so a definition is one click further. The list
shows seven rows and scrolls inside the dialog past that, so a pattern that
matches a thousand words opens the same size as one that matches a dozen, and
the previous answer stays on screen while the next is fetched. The results are
deliberately unfiltered: the player typed the letters, so crude, slur and slang
words answer too.
