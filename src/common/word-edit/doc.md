# word-edit

The form a trusted player uses to fix the word list when a definition, band or
flag is wrong, or to add a word that's missing. The curation RPCs and the
journal are [docs/common.md](../../../docs/common.md)'s; this folder is the
frontend.

## Intro to area

A trusted player who sees a wrong band, a missing definition, or a word that
shouldn't be in the list at all can fix it on the spot instead of writing it
down for later, from a link at the bottom of every definition or an "Add word"
item in the account menu. A save applies to the live word list at once and
journals the change for the upstream word-list process to fold in later.

It is one dialog in two modes, edit and add. Both openers set a shared store,
and the one dialog mounts at the app root in either mode.

## Details

**Who renders what.**

```
App ── "Edit word…" / "Add word" ──> WordEditDialog                  editors only
                                     └── Dialog (floating-panels) → StandardForm (forms) → WordEditFields
                                                                                           └── TextField · NumberField · CheckboxField (fields)
```

The edit link is `definitions`' `DefinitionView`, which every definition surface
renders, so it is under every definition; the "Add word" item is the account
menu's.

**The app captures; the reconciliation happens elsewhere.** A save applies to
the live word list at once and writes a journal row, and the journal is what
the upstream word-list process reads later to fold the fixes into its source.

**An edit sends only the fields that changed**, so the journal never claims an
untouched column was edited. `makePatch` diffs against the row as it was read.
