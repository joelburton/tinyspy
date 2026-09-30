# Store and hook files

Two passes: give every module-level store clear names and a line on its
listeners, then rename and split the files whose names misdescribe their job.
When both are done, the rules below move into `docs/` and this plan is deleted.

## The rules settled

**Inside a store.**

- The state is named for what it holds (`isInfoSheetOpen`, not `value`).
- The getter that `useSyncExternalStore` reads is `get` + that name
  (`getIsInfoSheetOpen`), not `getSnapshot`. Where the store already exports
  that getter, the private one goes and the hook passes the exported one.
- A yes/no flag's setter and getter carry its full name: `setIs…` / `getIs…`.
  A setter's parameter is `val`.
- Where the store's two functions (subscribe, getter) were inline arrows in the
  hook, they become named module-level functions.
- A one-off initializer (`readInitial`) is inlined, with a comment on what the
  starting value means.
- `listeners` gets a short comment: a listener is a callback; each hook caller
  adds one, and the setter calls every one to say the state changed.

**Naming a file.** A file is named for its job.

- When the job is a hook, and the other exports serve it (test seams, arguments
  passed into it, its tuning), it is `useX.ts`, in `hooks/` where there is one.
- When the job is a thing the hook is one door into — a store, a feature's state
  and logic — it is named for the thing, lowercase, and stays out of `hooks/`.
  A store keeps its hook in the same file: splitting them would export
  `subscribe`.
- When the job is a hook but one export has callers who don't want the hook,
  that export moves to a lowercase or `lib/` file beside it.
- `.tsx` only where the file contains JSX.

## Pass 1 — names and comments inside each store

Done: `useIsChatPanelOpen`, `useHasChatHost` (split from `chatOpenStore`),
`editProfileStore`, `infoSheetStore`.

- [ ] `wordEditStore` — `value` → `wordEditRequest`, `getSnapshot` →
  `getWordEditRequest`, `next` → `val`
- [ ] `chatUnread` — `value` → `chatUnreadInfo`, `getSnapshot` →
  `getChatUnreadInfo`, `next` → `val`
- [ ] `definitionStore` — `getSnapshot` → `getDefining`
- [ ] `useProfile` — `current` → `profile`, `getSnapshot` → `getProfile`
- [ ] `toastStore` — `getSnapshot` → `getToasts`
- [ ] `useVisualViewport` — `getSnapshot` measures and caches, so not a `get`;
  proposed `measureViewport`, not yet agreed
- [ ] `scratchpadOpenStore` — `readInitial` inlined, `open` →
  `isScratchpadOpen`, `setScratchpadOpen` → `setIsScratchpadOpen`,
  `getScratchpadOpen` → `getIsScratchpadOpen` and passed to the hook
- [ ] `faultStore` — the hook's inline getter becomes a named function; names
  to propose
- [ ] `gameMenuStore` — the hook's inline getter becomes a named function,
  `next` → `val`

## Pass 2 — file names

- [ ] `common/session/useProfile.ts` → `profileStore.ts`
- [ ] `common/chat/useIsChatPanelOpen.ts` → `chatPanelOpenStore.ts`
- [ ] `common/chat/useHasChatHost.ts` → `chatHostStore.ts`
- [ ] `common/actions/dispatcher.ts` → `useActionDispatcher.ts`: it exports
  only the hook
- [ ] Split `common/chat/chatUnread.ts`: the `ChatUnread` type, the state,
  `setChatUnread` and `useChatUnread` go to `chatUnreadStore.ts`, which
  `ChatButton` reads; `computeUnread` and the last-seen bookmark stay in
  `chatUnread.ts`, which only `Chat` calls
- `common/keyboard/componentKeys.ts` stays whole: the offer registry exists
  only to tell Help which of the table's rows are live, and half the files that
  offer rows also match them, so a split would give those two imports
- [ ] Move out of their hook files, each to a lowercase or `lib/` file beside
  it: `cellKey` (`crosswords/hooks/useCells.ts`), `wordWithBonusDot`
  (`shared/found-words/useFoundWordSubmit.ts`), `solvedByMe`
  (`common/reveal/useSolutionReveal.ts`), `DUMP_COUNT` / `LETTER_SCALE` /
  `blurActiveField` (`bananagrams/hooks/usePlayerBoard.ts`)

## When both passes are done

- [ ] `docs/common-folders.md`: the naming rule's row becomes "a file is named
  for its job", as above.
- [ ] `docs/code-conventions.md`, "A boolean reads as a yes/no question": a
  flag's setter and getter carry its full name.
- [ ] `plans/areas/info-sheet.md` says `setInfoSheetOpen` "keeps its name";
  that is no longer true.
- [ ] Delete this plan and its row in `CLAUDE.md`.
