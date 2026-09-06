# manifest — todo

## Bugs

## Soon

- **Resolving a gametype string to its manifest is hand-written at every call
  site**, and each one answers "what if it isn't there?" differently:
  `App.tsx:125` treats a miss as "the URL names no real game";
  `ClubPage.tsx:319` coalesces to `null` for the `?new=` dialog, `:574` opens
  the setup dialog only on a hit, and `:749` skips the row so an unknown
  gametype never reaches the club's list; `useGameInvitations.ts:119` asserts
  with `!`. Four of those five are the same question — is this gametype one
  this FE bundle knows? — and the fifth is a claim that it must be. Whether
  this folder should export a `manifestFor(gametype)`, and what it returns, is
  a decision to make with these files open: the shape of the answer is the
  point, not the number of callers.

## Someday

## Maybe
