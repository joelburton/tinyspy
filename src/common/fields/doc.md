# fields

Every form field in the app: the shape they all share, the props they all
take, and a component for each kind of control. A form is one consumer and the
setup dialog is another, so the fields live here rather than with either.

## Design

A field is a caption over a control, with room for three sentences around it:
what the setting is about, above the control; how to type it, below; and what
is wrong with what is there now, below that in the fault color. Every field in
the app has those slots in that order, whether or not a given one is used, and
`Field` is what draws them. A field component supplies the control and
forwards the words. It never lays out its own column, because a shared
stylesheet is not a shared shape: as soon as each component draws its own
markup, only the one that happened to need an error line can show one.

Every field takes the same props, `AllFieldProps`: a name, the caption and the
three sentences, a value, and whether it is disabled. The name matters most.
It is the key the value is sent under, the key its error is filed at, and the
`name` attribute on the control, so a server validation that names a column
reaches the box that wrote the value, and a test finds a field by what it is
rather than by the words on its caption. A field made of several controls
composes each control's name from its own, and a field with no control at all
still wears the name on its wrapper.

Which component a setting takes follows from two questions. The first is what
the control does. Everything here sets a value the game reads later. A control
that changes what you are looking at and records no answer is not a field; the
in-game filters and the club page's segments live elsewhere. The second is how
many choices there are and what kind. A typed value is a text box, a number or
a date. A choice among a few is a row of radios, all shown; among many, a
select that collapses them. A single on/off setting is a checkbox with its
meaning beside it, and a set of on/off settings answering one question is a
checkbox list, one field with one name. Your color is a row of swatches. A
value you can see but not change is still a field, drawn as text, so it lines
up with the editable ones around it. Three fields exist only for the setup
dialog: who is playing, a board you type in yourself, and which slice of the
dictionary a word game draws from.

An error shows twice on purpose: a ring on the control says which field, and
the sentence under it says why. The ring keys on the control's `aria-invalid`,
so a field gets it by setting that attribute and nothing else. The message
about the form as a whole is not a field's; it goes on the form's own line.

The family is held together by its tests as much as by its type. The type can
check that a component accepts every shared prop; it cannot check that the
component wires them, and a field that takes `disabled` and never hands it to
its control looks right on screen. So every field's spec runs the same
contract, which renders the field and asks whether each prop reached the DOM.
A guard makes sure every field component has a spec to run it in, wherever the
component lives.

## Details

- **The caption's three branches.** A control that takes the id from `Field`
  gets a `<label>` pointing at it; a control that labels itself (a checkbox's
  words sit in its own label) gets a plain `<span>`, since a second label
  would nest; a `group` gets a `<fieldset>` with a `<legend>`, which names no
  single control.
- **Names compose.** A group's controls are `${name}.${id}`; a field with no
  control carries `data-field={name}` on its wrapper. `data-field-error` on
  the error span is what `errorUnder(name)` reads, so a message is found by
  identity, not by position.
- **`field.module.css` is read by `Field` alone.** The column, the caption and
  the three sentences are its rules; a component's own module holds only its
  control.
- **The control chrome is base.css's** `input, textarea` rule, including the
  16px floor on touch. A native `<select>` is not covered by it, which is why
  `SelectField` restyles one to match and draws its own chevron, a mask on a
  wrapper span so the arrow's color follows the theme.
- **A field need not live here** to be in the family. crosswords'
  `PuzzleSourceField` is that game's; the guard reads every `*Field.tsx` under
  `src/`.
- **The test helpers** are `fieldContract.tsx` (the shared assertions every
  spec runs) and `errorUnder.ts` (`fieldBox`, `errorUnder`, `formError`).
