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

## Someday

## Maybe
