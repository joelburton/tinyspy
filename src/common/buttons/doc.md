# buttons

The app's one general button, the handful of named buttons built from it, and
the one control family close enough to belong beside them. What a button LOOKS
like is decided here; the taxonomy around it — the kinds of control the app has,
which glyph means what, when a button is offered at all — is
[ui.md](../../../docs/ui.md).

## Design

A button in this app carries no logic. It does not know what an RPC is, whether
the game is over, or who is allowed to press it; a caller hands it a click
handler and a disabled flag and it draws. That is the whole reason these files
live together rather than beside the screens that use them: what a Cancel button
looks like is not a fact about the club page, and a folder organized by caller
would have the same button drawn four ways.

So there is exactly one general button component, and everything else here is
that button with a name and some defaults. A named button — Trash, Cancel, the
form commit — exists so a recurring control's appearance is decided once and
stays decided: a Trash is red BEFORE you press it, because an irreversible act
should look irreversible while you can still change your mind, and that is true
wherever one appears. None of them overrides anything; each supplies defaults a
call site can still replace, so packaging a control never costs a caller the
ability to deviate.

**What is NOT here is a game's commands.** A named button per command would be
a second place an action's words, glyph and tone were written down. Those are
[actions](../actions/doc.md): the registry holds what a command IS, a
component binds what it does, and `<ActionButton>` draws it. So a button file
here names a piece of CHROME (dismiss, cancel, commit a form, delete a row) —
the things that are not commands a player invokes in a game. The
exceptions are the bespoke controls — `ShuffleButton`, `PauseButton` and
`SubmitWithScore` — which ARE driven by actions but keep their own markup
because none is shaped like a standard button; they read their action through
`actionSurface`.

The prop names carry the folder's one real distinction, which is between what a
button IS and what it DRAWS. Those come apart more often than you would expect —
the exit-to-club button draws "Club" in a narrow column while being called "Back
to club", and a phone-width action row wants glyphs where a desktop wants words.
So the words are the label, what appears is `show`, and what the control is
called is the tooltip, which defaults to the label and takes over as the hover
bubble and the accessible name when no words are drawn. An icon-only button is
still a named button, and that name is the only thing telling a player what the
glyph means.

`show` is required at every call site and no component defaults it. That is a
deliberate cost — it makes call sites longer — and it buys the thing that
matters more: reading `<TrashButton show="icon" />` you know what appears
without opening `TrashButton`. A default here means two call sites that look
identical draw different things, which is a question you can only answer by
leaving the file you are reading.

Color works on two axes that do not interact. WEIGHT is emphasis — filled for
the main action, an outline for everything else — and TONE is meaning, in the
button vocabulary the theme keeps for exactly this: an ordinary action, a
consequential one, an irreversible one, a quiet dismissal, a success. Every tone works at
either weight. That vocabulary is the button's own and is deliberately not the
outcome palette, which colors what HAPPENED rather than what a control will do;
the two use nearby oranges and the theme separates them on purpose. Because this
folder owns those words, a docstring here never names one — the tone a button
passes is a line of code directly below, and a sentence repeating it is a second
copy that drifts. A docstring here says when to reach for the button and what to
pass it; why a glyph is scaled or a box is sized sits in a comment beside the
code that does it.

Three of the files stand apart, and it is worth knowing which before assuming
the rest. Two are their own controls that only happen to be buttons — the
board's round shuffle pill, which floats over a game surface and is built to
look like it does, and the header's pause mark, which is `act-pause` wearing
the page header's look rather than an action row's. The third is the interesting one: scrabble's
submit-with-score reaches into the general button's stylesheet for its chrome
and supplies its own internal layout, because it wants a standard button's paint
with a scoreboard's arrangement. That reach is the exception that shows where
the boundary is.

## Details

- **Defaults are default PARAMETERS, never a spread over props.** A default
  parameter treats an explicitly passed `undefined` the same as an omitted one,
  which is what lets a caller write `label={cond ? 'Waiting…' : undefined}` and
  get the button's own word in the second case. A JSX spread would override the
  default with the undefined.
- **`...rest` goes last**, so every axis stays reachable at the call site —
  `type` included, which is how a form's commit passes `type="submit"` and wins.
- **A click never takes focus.** The base suppresses `onMouseDown`, because the
  games that read keystrokes off the window lose their next letter if a button
  steals focus. Harmless everywhere else, so it is unconditional rather than
  opt-in.
- **A form's two buttons are a pair**: the commit packages submitting and the
  emphasis but defaults no words (it is Save here, Start there, Create, Find);
  the Cancel packages the word and the quiet outline and is the one button with
  no glyph of its own.
- **Small is one prop, not a font-size.** `small` brings the whole small
  treatment — type, weight, padding, and a smaller square for a glyph drawn
  alone — because those move together; a caller writing its own font-size gets
  a button whose padding no longer fits it. A control that is a link, a
  trigger or a list row rather than a button is not covered by this and takes
  the type ramp's own small step.
- **The stylesheet is the module beside the component**, and there are no global
  button classes to compose. A surface that needs a different box re-points the
  size token in its own class rather than reaching for a selector here.
- **A disabled button's tell is the missing hover**, which every hover rule
  delivers by asking `:not(:disabled)`.
- **A segmented choice lives here without being a standard button.**
  `<Segmented>` owns a joined frame and leaves the segments as the caller's own
  buttons, because giving each segment its own border and radius dismantles the
  control rather than restyling it. It sits in this folder because it is a
  chooser made of buttons and shares their vocabulary — but it composes none of
  the standard button's classes, and its chosen segment is keyed off
  `aria-pressed` so the paint and the semantics cannot drift apart.
- **Not buttons in this sense**: a game piece, a keycap, a page-header mark.
  Those are their own controls with their own rules, and none of them composes
  this module.
