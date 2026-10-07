# manifest — todo

## Bugs

## Soon

## Someday

## Maybe

- **Make each manifest an instance of a class.** A game's `manifest.ts` is an
  object literal surrounded by small module-level helpers its `summaryFor`
  and loaders lean on (`makeLead`, `foundTally`, `labelMidGame`, the start
  and RPC callers), and the coop and compete manifests of one game repeat
  much of it. A shared base class could hold what every game has the same,
  with each game's subclass adding its own words.

## Won't do
