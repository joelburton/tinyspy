# forms

The frame a form is built on: `StandardForm`, which holds the values a player
is typing and hands them to the fields, `FormErrors`, the one shape every
form's messages take, and `FailureLine`, which draws the form-wide one. The
fields themselves are `fields/`; this folder is what every form needs that is
not a field.

## Design

A form, here, is any place a player fills something in and presses a button:
signing in, claiming a handle, making or editing a club, editing a profile,
starting a game, looking up a word. They are small and there are not many, but
each one needs two things that are not fields, and each used to grow its own
version of both. This folder is those two things, written once.

The first is somewhere to keep what is being typed. That belongs to the form,
not to the screen around it: clearing, resetting and "has anything changed"
are all questions about the form, and a form that holds its own values can
answer every one of them. So `StandardForm` owns the values. It reads its
starting values once, at mount, so nothing can reset under someone mid-type,
and a form whose values arrive later is simply not rendered until they do. It
hands the values and a setter to its children through a function, which keeps
the wiring visible: a field says where its value comes from and where it goes,
and both are typed against the form's shape, so a misspelled field name fails
to compile instead of silently doing nothing. The alternative, a context each
field reads by name, would buy a shorter field tag and nothing else, at the
price of both of those; no form here is deep enough to want it, since every
field is either in the form's own markup or already handed its value and
setter by its parent, the way a game's setup body is. Submitting hands back
the values and nothing else. The default action is already prevented, because
a form's job here is to deliver what was typed, never an event.

The second is one shape for what went wrong. `FormErrors` is one object, keyed
by field name, holding the message for each field that has one, plus one key
for the message about the form as a whole. The same shape whoever wrote the
message: a check in the browser writes into it directly, and a server
validation contributes an entry from the answer's `field` and `message`. That
is why a field's name is the same string as the RPC parameter its value is
sent as and the column the SQL names when it complains. One string, derived
from the function signature, and a server's complaint lands under the box that
wrote the value. Errors never pass through `StandardForm` itself. They arrive
from a call the form knows nothing about, and the caller that made the call
already holds them, so it writes each field's error from the same scope as
everything else.

Looking like a form is opt-in. The `<form>` element is a submit boundary, not
a look: chat's composer and codenamesduet's clue strip both submit and neither
wants a column of spaced fields. `StandardForm` is the one that does, and all
it paints is the one gap between its fields, the same way a bare `<button>`
has no chrome and `StandardButton` supplies it. What sits above and below the
form is the container's business.

Every setup is a form. The setup dialog's body is a form body, so it takes the
same `FormErrors` and reports the same way, and a game's setup form shares the
shape rather than inventing one.

## Details

- **The form-wide key** is `FORM_ERROR_KEYNAME`, the string `_`. The message
  filed there is drawn by `<FailureLine>`, which stamps
  itself with that key so a test can read it the way it reads a field's.
- **The gap between fields** is one step, `--spacer-3`, the same one
  `<SetupSection>` puts between its fields. The gap around the whole form is
  its container's: `<FloatingPanel density>` in a floating panel, the page on
  a page.
- **Tab is not the form's.** Inside a floating panel the form is already in
  that ring, fields and all. A form that is the page declares its own with
  `useTabRing({ within: formRef })`; `LoginScreen` is the example.
- **`initialValues` is read once**, so a form whose data loads asynchronously
  waits to mount rather than disabling every control while it waits.
- **Test helpers** for reading what a form says are in `fields/errorUnder.ts`:
  `errorUnder(name)` for a field's message and `formError()` for the form's.
