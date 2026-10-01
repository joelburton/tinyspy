# definitions

Click any dictionary word the app shows and a small card defines it; the `~`
key looks up a word that isn't on screen. Where definitions live and how they
are fetched are [docs/common.md](../../../docs/common.md)'s; this folder is the
frontend.

## Intro to area

Every word game shows real dictionary words: an event log, a found-words list, a
revealed answer. A player who meets an unfamiliar one wants to know what it
means without leaving the game, so the app makes the word itself the control:
click it and a card appears beneath it with the definition. Nothing about that
is specific to a game, which is why it lives here and not in any of them.

Two things show a definition — the card under a clicked word, and the lookup
dialog the `~` key opens for a word that isn't on screen — and they share one
body, `DefinitionView`, which fetches and renders the definition and turns its
cross-references into links. A surface has only to render each word as
`<DefinableWord>`; a single host at the app root draws the card, so a dozen
surfaces show definable words with no wiring of their own.

Fixing a wrong definition is [word-edit](../word-edit/doc.md)'s; the link to it
sits at the bottom of every definition this folder draws.

## Details

**Who renders what.** Three roots, one view:

```
any surface ──> DefinableWord           a span in the text; a click writes the word and its place into the one-slot store
                                        (word-list's WordList · the anagram finder · waffle's answer reveal ·
                                         the games' event logs and info columns)

App ──> DefinitionHost                  one, at the root beside the other hosts
        └── DefinitionPopover           under the clicked word
            └── DefinitionView          fetches and renders; a cross-reference click is the next word

AppActionsHost (actions) ── ~ ──> WordLookupDialog
                                  └── Dialog (floating-panels) → StandardForm (forms) + TextField (fields)
                                      └── DefinitionView             the same view, its first word typed
```

**A surface that shows definable words does exactly one thing: it renders each
word as `<DefinableWord>`.** It holds no state, renders no card, and never
decides where the card goes. The component writes the clicked word and its
place on screen into a one-slot store, and a single `<DefinitionHost>`, mounted
once at the root beside the toast and tooltip hosts, draws the card from that
slot. One slot is enough because one card is ever open, and keeping the state
at the root is what lets a dozen surfaces show definable words with no wiring
of their own. Drawing the card at the root also keeps it out of every floating
panel, whose positioning transforms would otherwise throw its place on screen
off.

**The words are pointer-only**: a span with no tab stop and no focus state. The
reasons sit with the `.definable` rule in `core-css/utilities.css`, which also
draws the hover underline every definable word wears.

**The view owns no word of its own.** Whichever host holds `DefinitionView`
passes the word in and takes a cross-reference click back as the next word —
which is also how a "see X" cross-reference is chased — so the two hosts differ
only in how the first word is chosen: a click, or a typed query. Escape closes
the card and only the card, so a definition opened from inside the anagram
finder does not take the finder with it.
