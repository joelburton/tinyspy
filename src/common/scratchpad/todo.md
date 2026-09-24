# scratchpad — todo

## Bugs

## Soon

- **Rename `owner_id` → `player_id`** (Joel, 2026-09-22). "Owner" reads as
  possession of the GAME before it reads as whose copy of the row this is —
  Joel read it as the game's creator, which is a real thing in the schema under
  another name (`common.games.created_by`, which drives the join-invitation
  popup and confers no authority). `player_id` names the scope instead of a
  possessor, and the null case keeps its meaning: no player, so the shared pad.
  **Decide `crosswords.cells.owner_id` with it** — same nullable-means-shared
  idiom, same `nulls not distinct` key, read by `crosswords._is_solved(…,
  p_owner_id)`; renaming one and not the other trades a confusing word for an
  inconsistent one. Touches: a forward migration per table (both are applied —
  never edit them), the `set_scratchpad` parameter `p_owner_id`, the RLS policy,
  the `game_scratchpads_owner_key` constraint name, `useScratchpad`'s `ownerId`
  + its CDC filter, `GameScratchpadCompanion`'s prop, `GamePage`'s call site,
  and the pgTAP that names the column.

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

## Won't do
