# buttons

The app's one general button, and the named buttons built from it. What a button
LOOKS like is decided here; the taxonomy around it — the kinds of control the app
has, which glyph means what, when a button is offered at all — is
[ui.md](../../../docs/ui.md).

## Design

A button in this app carries no logic. It does not know what an RPC is, whether
the game is over, or who is allowed to press it; a caller hands it a click
handler and a disabled flag and it draws. That is the whole reason these files
live together rather than beside the screens that use them: what a Restart
button looks like is not a fact about waffle, and a folder organized by caller
would have the same button drawn four ways.

So there is exactly one general button component, and everything else here is
that button with a name and some defaults. A named button — Restart, Trash,
Cancel — exists so an action's appearance is decided once and stays decided: a
Trash is red BEFORE you press it, because an irreversible act should look
irreversible while you can still change your mind, and that is true wherever one
appears. None of them overrides anything; each supplies defaults that a call site
can still replace, so packaging an action never costs a caller the ability to
deviate.

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
matters more: reading `<RestartButton show="icon" />` you know what appears
without opening `RestartButton`. A default here means two call sites that look
identical draw different things, which is a question you can only answer by
leaving the file you are reading.

Color works on two axes that do not interact. WEIGHT is emphasis — filled for
the main action, an outline for everything else — and TONE is meaning, in the
button vocabulary the theme keeps for exactly this: an ordinary action, a
consequential one, an irreversible one, a quiet dismissal. Every tone works at
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
look like it does, and the header's pause mark, which belongs to the page header
rather than to any action row. The third is the interesting one: scrabble's
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
- **Not buttons in this sense**: a game piece, a keycap, a segmented choice, a
  page-header mark. Those are their own controls with their own rules, and none
  of them composes this module.
