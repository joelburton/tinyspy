# members — todo

## Bugs

## Soon

- **Some consumer modules style `<Dot>` as a bare `.dot`.** `Dot.module.css`
  owns `.dot`; a consumer naming its override the same thing is the drift. The
  qualified form already exists in half the app (`greetingDot`, `playerDot`,
  `rosterDot`, `actorDot`, `itemDot`, `bonusDot`); the rest should follow.

- **The two resolvers are named for the CSS property, the two tokens for the
  visual part.** `colorVarFor` returns `--member-NAME-fill-color` and
  `borderVarFor` returns `--member-NAME-edge-color`, so nothing that says
  "fill" or "edge" leads a reader to the function that resolves it. Decide the
  pair together — `fillVarFor` / `edgeVarFor` matches the tokens exactly —
  or leave both, but don't rename one: half the pair is a worse mismatch than
  either whole scheme.

- **`ActorDot` and `DotActor` default `show` differently** — `both` and
  `auto` — so a caller who switches one for the other because they only want
  the disc on the other side gets a name that starts hiding on phones, or
  stops. Joel (2026-09-12): *"it sounds dumb that we have different APIs for
  both."* One default for the pair; the widget that wants the other passes it.

## Someday

- **Much of the app writes prop notes with `/**`.** This folder's are `//`,
  which is what the rule says: a docstring documents a whole declaration, and a
  note about one field of one is a comment. The blessed `buttons` folder is
  among the ones that differ. Not this folder's to sweep, and not sweepable
  cheaply either — indentation does not separate the two cases, since a nested
  function's docstring is indented and correct, so telling a field note from a
  declaration's docstring needs the declaration in front of you. Recorded so
  the divergence reads as deliberate rather than as an oversight.

## Maybe

- **Do peer marks want the edge shade?** Crosswords' peer cursor frame and
  connections' peer band draw a member's FILL color as a thin line, and a light
  fill like yellow has the contrast problem there that `borderVarFor`'s edge
  shade solved for the dot. Decide whether the edge token is the answer, or
  whether "legible against a board" is a different shade from "legible against
  its own fill".

## Won't do

- **Splitting `ActorMention.tsx` into one file per component.** It exports
  `ActorDot` and `DotActor`, which differ only in order and share every piece;
  they stay together (Joel, 2026-09-24: *"keep them both"*).
