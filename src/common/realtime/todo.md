# realtime — todo

## Bugs

## Soon

## Someday

## Maybe

- **Two comments in `realtimeDiag.test.ts` describe the repo rather than the
  code** — "and it had no test" in the file docstring, and "before this module
  existed" beside the subscribe-status case. Both are about how things were,
  which is not what a reader of that line needs.
- **Test-file docstring placement splits 6–2.** Six put the file docstring
  above the imports; `realtimeDiag.test.ts` and `useRealtimeReconnect.test.ts`
  put it below. Cosmetic — worth doing only if the folder is being made
  uniform for another reason.
