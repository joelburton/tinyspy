# forms — todo

## Bugs

## Soon

Four patterns read off the rendered forms and dialogs, still unbuilt (the
pattern rules are docs/code-conventions.md → Patterns):

- **Field** — a label with its control, and the explanatory line under it.
  Written today in `SelectField`, `WordEditDialog`, `EditProfileModal` and the
  setup form, each with its own `.field` / `.label`. A component + module.
- **Choice row / choice group** — a radio or checkbox with its label, inline;
  and a wrapping row of them. The setup form's `.radio` / `.radioRow` /
  `.checkRow` and `SetupTimerSection`'s are verbatim copies. A component +
  module.
- **Text input** — the typed-in field: fill, edge, radius, padding, the 16px
  touch floor that stops iOS zooming. `WordLookupDialog.input` and
  `AnagramDialog.input` are byte-identical. An element rule plus one class.
- **Section** — a bordered group under a heading: the setup form's
  `fieldset`, `SetupSection`, `EditClubModal`'s games group, the info panel's
  box. A component + module; shared with `setup-form`.

## Someday

## Maybe

- `setup-form/setupForm.ts` types `SetupBodyProps.errors` as this folder's
  `FormErrors`, so the setup-form contract depends on the form layer for one
  shape. Decide whether that is the right direction or whether the errors type
  wants a home both can reach.
