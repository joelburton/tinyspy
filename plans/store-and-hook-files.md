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

Done, every store: `useIsChatPanelOpen`, `useHasChatHost` (split from
`chatOpenStore`), `editProfileStore`, `infoSheetStore`, `wordEditStore`
(`ShownWordEditDialog`), `chatUnread`, `definitionStore`
(`ShownDefinitionCard`), `useProfile` (`useMyProfile` and the `my…` names),
`toastStore`, `scratchpadOpenStore`, `faultStore`, `gameMenuStore`,
`confirmationService`, `useVisualViewport` (`measureVisualViewport`),
`useBindAction` (`bindingChangeCount`), and `componentKeyGroups`, whose change
counter became the rebuilt list of offered key groups the hook returns.

## Pass 2 — file names

Done. The profile store is `common/session/myProfileStore.ts`, with its
`Profile` type in `profile.ts` beside it (the type is anyone's profile row; the
store is only the signed-in user's); the chat stores are `chatPanelOpenStore.ts`
and `chatHostStore.ts`; the key dispatcher is `useActionDispatcher.ts`. Split:
`useBindAction.ts` (the registry and its readers are `boundActionsStore.ts`),
`chatUnread.ts` (its store is `chatUnreadStore.ts`) and `componentKeyGroups.ts`
(Help's offering registry is `offeredComponentKeyGroupsStore.ts`). Moved out of
hook files: `blurActiveField` to `common/keyboard/keyboardHandoff.ts`,
`cellKey` to `crosswords/lib/cellKey.ts`, `wordWithBonusDot` to
`shared/found-words/foundWords.ts` as `wordWithBonusBullet` ("dot" means a
player's color dot), `solvedByMe` to `common/reveal/describeReveal.ts`, and
`DUMP_COUNT` / `LETTER_SCALE` to `bananagrams/lib/board.ts`.

## When both passes are done

- [ ] `docs/common-folders.md`: the naming rule's row becomes "a file is named
  for its job", as above.
- [ ] `docs/code-conventions.md`, "A boolean reads as a yes/no question": a
  flag's setter and getter carry its full name.
- [ ] `plans/areas/info-sheet.md` says `setInfoSheetOpen` "keeps its name";
  that is no longer true.
- [ ] Delete this plan and its row in `CLAUDE.md`.
