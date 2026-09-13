# error-page

The stand-in shown when a page cannot render.

## Intro to area

A failure is drawn one of two ways, and which one is not a matter of taste: a
fault modal when the page behind it survives, a fault page when it does not. A
modal is dismissable, and dismissing one of these would strand you on a blank
screen — here the failure IS the whole route, so it takes the page's place
instead of covering it.

The two read as the same event in two containers rather than as two kinds of
trouble: the red word, the sentence, and beneath it the small diagnostics line,
which is what someone reads aloud to whoever debugs. Every one of these carries
the same way out, `← Back home`, and a caller may add a second.

There are two entry points, and one of them is the one to reach for:
`EnvelopeErrorPage`, which takes a not-ok envelope and derives the page from
it, and `ErrorPage` for a caller with no envelope, writing its own sentence and
its own diagnostics line.

## Details

**The sizes are not shared.** A page's title is sized by `h1` and the modal's
by `h3`, each where its own heading level is decided
([ui.md](../../../docs/ui.md#the-heading-levels)).

**The body is a `.card` at `.pageMain` width.** A card is a bordered section of
a page, which is what this is, and the default page width is what a page that
doesn't need a custom one should take.

**The second way out is the caller's to add.** The play surface's error
boundary offers Reload, because a crashed render is the failure most likely to
be transient.

**`EnvelopeErrorPage` is the entry to reach for.** A not-ok envelope already
carries the sentence, the severity, the dbcode and which call died, and the
page's two props derive from it; a hook whose read failed holds one of those.
`ErrorPage` is for a boundary that caught a thrown render, or a page that found
nothing to draw. Pairing `{ text, diagnostics }` up by hand when an envelope
was available is the shape the envelope entry exists to retire.
