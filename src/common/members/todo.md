# members — todo

## Bugs

- **Three docstrings here say a lookup can miss because of "a departed
  member," and the schema forbids one** — `memberList.ts`'s `memberById`,
  `ActorMention`'s `actor` prop, and `Dot`'s `color` prop. A deleted account
  takes its messages and its `game_players` rows with it (`on delete cascade`
  from `common.profiles`), and nothing ever removes a row from
  `clubs_members`: two inserts in `common.sql`, no delete and no delete policy.
  So a club member cannot stop being one. The real reason a lookup misses is
  that the roster has not loaded yet — `useClubRoster` starts at `[]` and fills
  after two sequential reads. Either those three sentences should say that and
  nothing more, or leaving a club is a gap and they are describing something
  the app should support. Needs the product answer before the docstrings move.

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

- **`ActorMention.tsx` exports two components**, `ActorDot` and `DotActor`, so
  "the filename is the component" is false in it. They differ only in order and
  share every piece, which is why this wants a look rather than a mechanical
  split. (The same question is open in `event-log` for `EventLog.tsx` and in
  setgame for `Card.tsx`. `game-page` had it too, in `PlayAreaMountLog.tsx`,
  and answered it by finding one of the two components no longer earned its
  keep — worth trying before reaching for a split.)

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
