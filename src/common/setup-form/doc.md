# setup-form

The start-a-game dialog, its sections, and the recap rows that the info column and the printed board both show.

## Intro to area

Starting a game is two phases, and this folder is the first: collect the
choices, then hand `create_game` a setup blob and a separate list of players.
`ClubPage` mounts `<SetupGameModal>` — from a start row, or from a `?new=`
arrival — and unmounts it to close, so the dialog holds no open state of its
own.

The dialog is a `<StandardForm>` inside a `<NormalModal>`, and the form owns
every value. A game supplies the rest through `manifest.setupForm`: a lazy body
component, its defaults, an optional cross-field check and an optional intro
sentence. The modal supplies what is the same in every game — seeding the
values, the intro sentence, the Help button, the Cancel/Start row, and where a
refusal lands — and every body opens with the shared players picker. Which
means a game's setup form is a list of fields and nothing else.

Every setting is a collapsible `<SetupSection>` whose summary carries its
current value ("Timer: none", "Co-op: turns (ada first)"), so the dialog reads
at a glance and you open a section only to change it. A section is shared when
it is the same question wherever it is asked — who is playing, the timer, coop
pacing, which puzzle — and a game writes the rest itself.

The same choices are read back later. `setupRows.ts` is the recap the in-game
info column and the printed board both draw from one array, and
`<SetupDisclosure>` is the "Setup options" wrapper the info column puts around
it — the one thing here that renders during play rather than before it.

## Details

**Who renders the dialog, and what it renders.** One page opens it; the
game supplies the middle:

```
ClubPage (club) ── a start row, or a ?new= arrival 
  ──> SetupGameModal
    └── NormalModal (floating-panels)
        └── StandardForm (forms)            owns every value
            ├── <Suspense> → manifest.setupForm.Component   ← THE GAME's fields, lazily loaded
            │     ├── PlayersSection → SetupSection + Dot (members) + PlayersField (fields)   every game, first
            │     ├── SetupTimerSection → SetupSection + RadioRow (fields)                    every game
            │     ├── SetupCoopStyleSection → SetupSection + RadioRow + SelectField           the turn-order games
            │     ├── SetupNextPuzzleSection → SetupSection + DateField                        the dated-puzzle games
            │     └── SetupSection …                                                          one per setting of the game's own
            ├── FailureLine (forms)                        the form's own line, for what belongs to no field
            ├── ActionButton (actions) for act-help        → the game's Help, in a Suspense, over the dialog
            └── CancelButton · FormSubmitButton (buttons)

and during play, apart from the dialog:
the game's InfoCol ──> SetupDisclosure ──> the rows setupRows.ts builds from the same setup
```

- **The seam is one destructure, in one place.** The form holds a flat object
  keyed by field name; `create_game` takes a setup blob plus a list of players.
  `handleStartGame` splits `player_user_ids` off and everything else IS the
  setup, which is why a game's `Setup` type is `SetupOf<Values>` —
  `Omit<Values, 'player_user_ids'>`. Getting it wrong sends a game's roster
  into the setup column, where nothing reads it.

- **Seeding order: the manifest's defaults, then the club's saved default over
  them, field by field.** Saved fields win and missing ones fall through, so a
  manifest that grows a new field stays compatible with a blob saved before it
  existed. The players are not part of that — who plays is a per-game choice,
  and the picker starts with everyone in the club checked.

- **A refusal lands under the control it is about.** `errors` is one object
  keyed by field name, and both writers use it: a server raise naming a column,
  and the manifest's own `validate`. The frontend's wins a collision, because
  it describes what is on screen now while the server's is about the last
  submit. `'_'` is the form's own line, for what belongs to no field. Putting a
  message under a control needs a form to put it on, which is why an in-game
  New Game throws `field` away instead.

- **`defaultOpen` is a default, not a controlled value.** A later `true` opens
  a section (the reason to open often arrives on an RPC), while a later `false`
  only closes one the player had not opened themselves. Without that, the
  puzzle section would slam shut under the cursor the moment a typed date
  resolved.

- **The players picker opens to start, and its summary is dots.** Who is
  playing changes what the rest of the form can offer — the first-player picker
  lists only the checked players — so it cannot be something you discover by
  expanding. Its value is WHO, and a row of the same identity colors used on
  every board says that faster than names, which would wrap at 480px anyway.

- **The player count is read twice, on purpose.** The picker draws the
  complaint ("Pick at least 2 players.") from the manifest's bounds, and the
  modal counts the same bounds again to gate Start. They cannot share, because
  the picker returns nothing in a solo club — there is nobody to pick — and the
  gate has to hold with no picker mounted. The silent Start that implies is not
  reachable: it needs a solo club enrolled in a gametype whose floor is two, and
  the floor is exactly what decides enrollment.

- **The title and the Start button carry a mode tail** — "· Co-op" or
  "· Compete" — so two sibling dialogs are told apart. A solo club drops it, the
  way `<ModeBadge>` does, except for a compete variant whose manifest seats an
  AI opponent: scrabble's compete floor is one human, so a solo club is enrolled
  in both siblings and the tail says "· AI". Shorter than the badge's "AI
  Compete" because the Start button has Cancel beside it and no room.

- **The timer's box holds text the setup never sees.** An unparseable MM:SS
  does not reach `setup.timer`, which keeps the last valid seconds; the
  complaint comes from the field itself. That is why `require_valid_timer`
  refusing a timer is a fault rather than a validation — see
  [docs/envelopes.md](../../../docs/envelopes.md) → "A fault can still name a
  field".

- **The puzzle section's two values are each three-state.** `undefined` is
  LOOKING and `null` is "there is nothing" — collapsing them to one `null`
  would make "we have not asked yet" read as an error for the instant between
  typing a date and the answer arriving.

- **What earns a recap row is [docs/pdf.md](../../../docs/pdf.md) → Setup
  rows**, not this folder. The short version: the recap is the dialog read
  back, so a control that did not apply produces no row — and the board a game
  built out of letters is the standing exception, because those dialogs can
  take the letters back as input.
