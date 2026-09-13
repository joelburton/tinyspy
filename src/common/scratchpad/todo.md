# scratchpad — todo

## Bugs

## Soon

## Someday

## Maybe

- **`scratchpadOpenStore` stores its boolean as `'1'`/`'0'` where
  `chatOpenStore` stores `'true'`/`'false'`.** Two panels doing the same thing
  two ways, decided by different hands rather than for a reason. Invisible to
  players and cheap to leave; settling it means agreeing one encoding with chat
  and orphaning whichever stored values change.
- **Two lock races, both self-healing.** Two players whose first keystrokes
  cross can each adopt the other's claim, so both pads read as someone else's
  until the holder goes stale, and the loser's in-flight flush still lands. A
  player who joins mid-edit sees no lock for up to a second, because Broadcast
  has no snapshot on join. Neither can corrupt the row, and both clear within
  seconds; fixing either means a lock snapshot or a server-side claim, which
  the friends-only trust model has not needed.
